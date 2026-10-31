// Integration test for the real match-feed path:
//   MATCHPULSE_DATA_SOURCE → isLiveDataEnabled → getSupportedCompetitions →
//   getFixturesByDate → fixtureToMatch → getMatchFeed (the props MatchFeedSection
//   passes to MatchCenter).
// Runs the app's own server modules in Node (see test-loader.mjs) with a
// mocked global fetch. Every request is answered locally; any unexpected
// request fails the test. No network, no real key.
// Run with: npm run test:feed
import assert from "node:assert/strict";

// ---- Mock provider (installed before any app module loads) -----------------
const realFetch = globalThis.fetch;
let provider = { fixtures: () => [], error: null };
let requests = [];

globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  requests.push(url.pathname + url.search);
  assert.equal(url.origin, "https://v3.football.api-sports.io", "unexpected host");
  assert.equal(init.headers["x-apisports-key"], "test-key", "test key must be sent");
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  if (provider.error) return json({ errors: provider.error, results: 0, paging: { current: 1, total: 1 }, response: [] });
  if (url.pathname === "/leagues") return json(envelope(leaguesFor(url.searchParams.get("country"))));
  if (url.pathname === "/fixtures" && url.searchParams.has("date")) {
    // Calendar days are requested in the site time zone (UK time).
    assert.equal(url.searchParams.get("timezone"), "Europe/London");
    return json(envelope(provider.fixtures(url.searchParams.get("date"))));
  }
  throw new Error(`Unexpected request ${url.pathname}${url.search}`);
};

const { SUPPORTED_COMPETITIONS } = await import("../src/lib/api-football/competitions.ts");
const { sampleMatches, SAMPLE_NOW } = await import("@/data/matches");
const { getMatchFeed } = await import("@/lib/match-feed");
const { zonedDateKey } = await import("@/lib/time");

// Synthetic league IDs: resolution must come from the provider response.
const leagueIdBySlug = new Map(SUPPORTED_COMPETITIONS.map((spec, index) => [spec.slug, 7000 + index]));
function leaguesFor(country) {
  return SUPPORTED_COMPETITIONS.filter((spec) => spec.country === country).map((spec) => ({
    league: { id: leagueIdBySlug.get(spec.slug), name: spec.names[0], type: spec.type, logo: null },
    country: { name: spec.country, code: null, flag: null },
    seasons: [{ year: 2026, start: "2026-08-01", end: "2027-05-30", current: true, coverage: { fixtures: { events: true, lineups: true, statistics_fixtures: true }, standings: true } }],
  }));
}
const envelope = (response) => ({ errors: [], results: response.length, paging: { current: 1, total: 1 }, response });

function providerFixture({ id, slug, kickoffMs, short, elapsed = null, goals, home, away }) {
  return {
    fixture: { id, referee: null, timezone: "UTC", date: new Date(kickoffMs).toISOString(), timestamp: Math.floor(kickoffMs / 1000), venue: { id: null, name: null, city: null }, status: { long: short, short, elapsed, extra: null } },
    league: { id: leagueIdBySlug.get(slug), name: slug, country: null, season: 2026, round: null },
    teams: { home: { id: id * 2, name: home, logo: null, winner: null }, away: { id: id * 2 + 1, name: away, logo: null, winner: null } },
    goals: { home: goals[0], away: goals[1] },
    score: {},
  };
}

// ---- Leak detectors -----------------------------------------------------------
const sampleIds = new Set(sampleMatches.map((match) => match.id));
const sampleTeamNames = new Set(sampleMatches.flatMap((match) => [match.home.name, match.away.name]));
const sampleScoreLines = new Set(
  sampleMatches.filter((m) => m.homeScore !== undefined).map((m) => `${m.home.name}|${m.away.name}|${m.homeScore}-${m.awayScore}`),
);

function assertNoSampleLeak(matches, allowedTeamNames = new Set()) {
  for (const match of matches) {
    assert.equal(match.source, "api-football", `match ${match.id} is not from the provider`);
    assert.ok(match.id.startsWith("apif-"), `unexpected id ${match.id}`);
    assert.ok(!sampleIds.has(match.id), `sample id leaked: ${match.id}`);
    for (const name of [match.home.name, match.away.name]) {
      if (!allowedTeamNames.has(name)) assert.ok(!sampleTeamNames.has(name), `sample team leaked: ${name}`);
    }
    const line = `${match.home.name}|${match.away.name}|${match.homeScore}-${match.awayScore}`;
    assert.ok(!sampleScoreLines.has(line), `sample score leaked: ${line}`);
  }
}

let passed = 0;
async function check(name, env, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, { MATCHPULSE_DATA_SOURCE: undefined, API_FOOTBALL_KEY: undefined, API_FOOTBALL_BASE_URL: undefined, NODE_ENV: "production" });
  for (const key of ["MATCHPULSE_DATA_SOURCE", "API_FOOTBALL_KEY", "API_FOOTBALL_BASE_URL"]) delete process.env[key];
  Object.assign(process.env, env);
  requests = [];
  const logError = console.error;
  console.error = () => {}; // expected failure logs in error scenarios
  try {
    await fn();
  } finally {
    console.error = logError;
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const API_ENV = { MATCHPULSE_DATA_SOURCE: "api-football", API_FOOTBALL_KEY: "test-key" };

console.log("Match feed source selection");

await check("sample mode: labelled sample data, no requests", {}, async () => {
  const feed = await getMatchFeed();
  assert.equal(feed.source.kind, "sample");
  assert.equal(feed.now, SAMPLE_NOW);
  assert.equal(feed.matches, sampleMatches);
  assert.equal(requests.length, 0);
});

await check("api flag without a key: still sample, no requests", { MATCHPULSE_DATA_SOURCE: "api-football" }, async () => {
  const feed = await getMatchFeed();
  assert.equal(feed.source.kind, "sample");
  assert.equal(requests.length, 0);
});

await check("api mode: every match comes from the provider response", API_ENV, async () => {
  const now = Date.now();
  // Includes one fixture whose teams share names with a sample fixture but
  // with different scores: output must carry the provider's score.
  const sampleFinished = sampleMatches.find((match) => match.status === "finished");
  const fixtures = [
    providerFixture({ id: 900001, slug: "champions-league", kickoffMs: now - 3 * 3600e3, short: "FT", goals: [0, 4], home: sampleFinished.home.name, away: sampleFinished.away.name }),
    providerFixture({ id: 900002, slug: "premier-league", kickoffMs: now - 30 * 60e3, short: "1H", elapsed: 30, goals: [1, 0], home: "Provider Home FC", away: "Provider Away FC" }),
    providerFixture({ id: 900003, slug: "botola-pro", kickoffMs: now + 2 * 3600e3, short: "NS", goals: [null, null], home: "Provider North", away: "Provider South" }),
    // Unsupported league: must be dropped.
    { ...providerFixture({ id: 900004, slug: "premier-league", kickoffMs: now, short: "NS", goals: [null, null], home: "X", away: "Y" }), league: { id: 1, name: "Other", season: 2026 } },
  ];
  const today = zonedDateKey(new Date(now), "Europe/London");
  provider = { fixtures: (date) => (date === today ? fixtures : []), error: null };

  const feed = await getMatchFeed();
  assert.equal(feed.source.kind, "api-football");
  assert.notEqual(feed.now, SAMPLE_NOW);
  assert.deepEqual(feed.matches.map((m) => m.id).sort(), ["apif-900001", "apif-900002", "apif-900003"]);
  assertNoSampleLeak(feed.matches, new Set([sampleFinished.home.name, sampleFinished.away.name]));

  const reused = feed.matches.find((m) => m.id === "apif-900001");
  assert.deepEqual([reused.homeScore, reused.awayScore], [0, 4], "provider score must win");
  assert.notDeepEqual([reused.homeScore, reused.awayScore], [sampleFinished.homeScore, sampleFinished.awayScore]);
  const live = feed.matches.find((m) => m.id === "apif-900002");
  assert.equal(live.clock.label, "30'");
  assert.equal(requests.filter((r) => r.startsWith("/fixtures")).length, 3, "yesterday, today, tomorrow");
});

await check("api mode, empty provider response: no matches, no sample data", API_ENV, async () => {
  provider = { fixtures: () => [], error: null };
  const feed = await getMatchFeed();
  assert.equal(feed.source.kind, "api-football");
  assert.deepEqual(feed.matches, []);
});

await check("api mode, provider error in production: unavailable, no sample data", API_ENV, async () => {
  provider = { fixtures: () => [], error: { requests: "You have reached the request limit for the day" } };
  const feed = await getMatchFeed();
  assert.equal(feed.source.kind, "unavailable");
  assert.match(feed.source.reason, /request limit/);
  assert.deepEqual(feed.matches, []);
});

await check("api mode, provider error in development: sample shown but labelled as fallback", { ...API_ENV, NODE_ENV: "development" }, async () => {
  provider = { fixtures: () => [], error: { requests: "You have reached the request limit for the day" } };
  const feed = await getMatchFeed();
  assert.equal(feed.source.kind, "sample-fallback");
  assert.equal(feed.matches, sampleMatches);
  assert.equal(feed.now, SAMPLE_NOW);
});

globalThis.fetch = realFetch;
console.log(`\n${passed} match-feed checks passed (mocked fetch, no network)`);
