// Offline tests for the API-Football client, validators, competition matching
// and fixture adapter. Uses a mocked fetch: makes no network requests.
// Payloads below are minimal synthetic examples shaped like the documented
// API-Football v3 responses; they are not real data.
// Run with: npm run test:api
import assert from "node:assert/strict";
import { fixtureToMatch, providerClub, teamInitials } from "../src/lib/api-football/adapter.ts";
import { matchLeague, matchTeam, normaliseName } from "../src/lib/api-football/asset-specs.ts";
import { checkRanking, integrityIssue } from "../src/lib/player-integrity.ts";
import { buildMatchReport } from "../src/lib/match-report.ts";
import { resolveCompetitions, SUPPORTED_COMPETITIONS } from "../src/lib/api-football/competitions.ts";
import {
  apiFootballRequest,
  ApiFootballError,
  parseFixtureDetails,
  parseFixtures,
  parseLeagues,
  parsePlayerStatLines,
  parseStandings,
  parseTeams,
  planSeasonRange,
  safeLogoUrl,
} from "../src/lib/api-football/core.ts";

const KEY = "test-key-0123456789abcdef0123456";
let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function mockFetch(status, body, headers = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });
  };
  return { impl, calls };
}

async function expectKind(promise, kind) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ApiFootballError, `expected ApiFootballError, got ${error}`);
    assert.equal(error.kind, kind);
    assert.ok(!error.message.includes(KEY), "error message must not contain the key");
    return error;
  }
  assert.fail(`expected ${kind} error`);
}

const envelope = (response, extra = {}) => ({ get: "fixtures", parameters: {}, errors: [], results: response.length, paging: { current: 1, total: 1 }, response, ...extra });

function fixture({ id = 1, league = 100, short = "NS", long = "Not Started", elapsed = null, extra = null, goals = [null, null], ts = 1792609200 } = {}) {
  return {
    fixture: { id, referee: null, timezone: "UTC", date: new Date(ts * 1000).toISOString(), timestamp: ts, venue: { id: 1, name: "Test Ground", city: "Test City" }, status: { long, short, elapsed, extra } },
    league: { id: league, name: "Test League", country: "Testland", season: 2026, round: "Round 1" },
    teams: { home: { id: 10, name: "Home Town FC", logo: "https://media.api-sports.io/football/teams/10.png", winner: null }, away: { id: 11, name: "Away United", logo: null, winner: null } },
    goals: { home: goals[0], away: goals[1] },
    score: {},
  };
}

console.log("Request handling");

await check("missing key fails before any request", async () => {
  const { impl, calls } = mockFetch(200, envelope([]));
  await expectKind(apiFootballRequest("/fixtures", {}, { apiKey: "  ", fetchImpl: impl }), "missing_key");
  assert.equal(calls.length, 0);
});

await check("key is sent only as a header; quota headers are read", async () => {
  const { impl, calls } = mockFetch(200, envelope([]), {
    "x-ratelimit-requests-limit": "100",
    "x-ratelimit-requests-remaining": "42",
    "X-RateLimit-Limit": "10",
    "X-RateLimit-Remaining": "9",
  });
  const result = await apiFootballRequest("/fixtures", { date: "2026-10-21", skip: undefined }, { apiKey: KEY, fetchImpl: impl });
  assert.equal(calls[0].init.headers["x-apisports-key"], KEY);
  assert.ok(!calls[0].url.includes(KEY));
  assert.equal(calls[0].url, "https://v3.football.api-sports.io/fixtures?date=2026-10-21");
  assert.deepEqual(result.quota, { dailyRemaining: 42, dailyLimit: 100, minuteRemaining: 9, minuteLimit: 10 });
});

await check("HTTP 429 → rate_limited", async () => {
  await expectKind(apiFootballRequest("/fixtures", {}, { apiKey: KEY, fetchImpl: mockFetch(429, {}).impl }), "rate_limited");
});

await check("errors.requests → quota_exhausted; errors.rateLimit → rate_limited", async () => {
  const daily = envelope([], { errors: { requests: "You have reached the request limit for the day" } });
  await expectKind(apiFootballRequest("/fixtures", {}, { apiKey: KEY, fetchImpl: mockFetch(200, daily).impl }), "quota_exhausted");
  const minute = envelope([], { errors: { rateLimit: "Too many requests" } });
  await expectKind(apiFootballRequest("/fixtures", {}, { apiKey: KEY, fetchImpl: mockFetch(200, minute).impl }), "rate_limited");
});

await check("errors.token → unauthorized; errors.plan → plan_restricted; other → api", async () => {
  const run = (errors) => apiFootballRequest("/x", {}, { apiKey: KEY, fetchImpl: mockFetch(200, envelope([], { errors })).impl });
  await expectKind(run({ token: "Error/Missing application key." }), "unauthorized");
  await expectKind(run({ plan: "Free plans do not have access to this season." }), "plan_restricted");
  await expectKind(run({ date: "The Date field must contain a valid date." }), "api");
  await expectKind(run(["Something failed"]), "api");
});

await check("HTTP 401/403 → unauthorized, 500 → http", async () => {
  await expectKind(apiFootballRequest("/x", {}, { apiKey: KEY, fetchImpl: mockFetch(403, { message: "no" }).impl }), "unauthorized");
  await expectKind(apiFootballRequest("/x", {}, { apiKey: KEY, fetchImpl: mockFetch(500, { errors: [] }).impl }), "http");
});

await check("non-JSON or missing response array → invalid_response", async () => {
  await expectKind(apiFootballRequest("/x", {}, { apiKey: KEY, fetchImpl: mockFetch(200, "<html>").impl }), "invalid_response");
  await expectKind(apiFootballRequest("/x", {}, { apiKey: KEY, fetchImpl: mockFetch(200, { errors: [] }).impl }), "invalid_response");
});

await check("timeout aborts the request", async () => {
  // AbortSignal.timeout does not keep Node alive on its own; the timer below does.
  const slow = (_url, init) =>
    new Promise((_resolve, reject) => {
      const keepAlive = setTimeout(() => reject(new Error("timeout signal never fired")), 2000);
      init.signal.addEventListener("abort", () => {
        clearTimeout(keepAlive);
        reject(init.signal.reason);
      });
    });
  await expectKind(apiFootballRequest("/x", {}, { apiKey: KEY, fetchImpl: slow, timeoutMs: 30 }), "timeout");
});

await check("network failure → network", async () => {
  const broken = async () => {
    throw new TypeError("fetch failed");
  };
  await expectKind(apiFootballRequest("/x", {}, { apiKey: KEY, fetchImpl: broken }), "network");
});

console.log("Validation");

await check("fixtures: valid entries kept, malformed ones dropped", () => {
  const { items, invalid } = parseFixtures([fixture(), { fixture: { id: "x" } }, null, fixture({ id: 2 })]);
  assert.equal(items.length, 2);
  assert.equal(invalid, 2);
  assert.equal(items[0].kickoff, "2026-10-21T19:00:00.000Z");
  assert.equal(items[0].home.name, "Home Town FC");
  assert.deepEqual(items[0].goals, { home: null, away: null });
});

await check("fixture details: events, score breakdown, lineups, statistics", () => {
  const details = parseFixtureDetails({
    ...fixture({ short: "2H", elapsed: 67, goals: [1, 0] }),
    score: { halftime: { home: 1, away: 0 }, fulltime: { home: null, away: null }, extratime: {}, penalty: null },
    events: [{ time: { elapsed: 23, extra: null }, team: { id: 10, name: "Home Town FC" }, player: { id: 5, name: "A. Player" }, assist: { id: null, name: null }, type: "Goal", detail: "Normal Goal" }, { bad: true }],
    lineups: [
      { team: { id: 10, name: "Home Town FC", logo: "https://media.api-sports.io/football/teams/10.png" }, formation: "4-3-3", coach: { id: 1, name: "C. Coach" },
        startXI: [{ player: { id: 5, name: "A. Player", number: 9, pos: "F", grid: "4:2" } }, { player: { id: 6 } }], substitutes: [{ player: { id: 7, name: "S. Sub", number: 14, pos: "M" } }] },
      { team: { name: "No Id" }, startXI: [] },
    ],
    statistics: [
      { team: { id: 10, name: "Home Town FC" }, statistics: [{ type: "Ball Possession", value: "58%" }, { type: "Shots on Goal", value: 4 }, { type: "Bad", value: { x: 1 } }] },
      { team: { id: 11, name: "Away United" }, statistics: [{ type: "Ball Possession", value: "42%" }, { type: "Shots on Goal", value: null }] },
    ],
  });
  assert.equal(details.events.length, 1);
  assert.deepEqual(details.score.halftime, { home: 1, away: 0 });
  assert.deepEqual(details.score.penalty, { home: null, away: null });
  assert.equal(details.lineups.length, 1, "lineup without a team id is dropped");
  assert.equal(details.lineups[0].startXI.length, 1, "player without a name is dropped");
  assert.equal(details.lineups[0].coach, "C. Coach");
  assert.equal(details.statistics[0].items.length, 2, "non-scalar statistic values are dropped");
  assert.equal(details.statistics[1].items[1].value, null);
  const bare = parseFixtureDetails(fixture());
  assert.deepEqual([bare.events, bare.lineups, bare.statistics], [[], [], []], "absent sections stay empty, never invented");
});

await check("standings: groups and rows parsed", () => {
  const row = (rank, id) => ({ rank, team: { id, name: `Team ${id}`, logo: `https://media.api-sports.io/football/teams/${id}.png` }, points: 30 - rank, goalsDiff: 5, group: "Test League", form: "WWDLW", status: "same", description: null, all: { played: 10, win: 9, draw: 1, lose: 0, goals: { for: 20, against: 5 } } });
  const standings = parseStandings([{ league: { id: 100, season: 2026, standings: [[row(1, 1), row(2, 2), { rank: "?" }]] } }]);
  assert.equal(standings.leagueId, 100);
  assert.equal(standings.groups[0].length, 2);
  assert.equal(standings.invalidRows, 1);
  assert.equal(standings.groups[0][0].goalsFor, 20);
  assert.equal(standings.groups[0][0].teamLogo, "https://media.api-sports.io/football/teams/1.png");
  assert.equal(parseStandings([]), null);
});

console.log("Competition matching");

function leagueEntry(id, name, country, type, seasons = [{ year: 2026, start: "2026-08-01", end: "2027-05-30", current: true, coverage: { fixtures: { events: true, lineups: true, statistics_fixtures: false }, standings: true } }]) {
  return { league: { id, name, type, logo: null }, country: { name: country, code: null, flag: null }, seasons };
}

await check("exact name + country + type match; IDs come from the data", () => {
  const byCountry = Object.fromEntries(
    SUPPORTED_COMPETITIONS.map((spec) => [spec.country, []]),
  );
  // Synthetic IDs (9001…) prove nothing is hardcoded.
  SUPPORTED_COMPETITIONS.forEach((spec, index) => byCountry[spec.country].push(parseLeagues([leagueEntry(9001 + index, spec.names[0], spec.country, spec.type)]).items[0]));
  byCountry.Italy.push(parseLeagues([leagueEntry(8000, "Serie B", "Italy", "League")]).items[0]);
  const { resolved, unresolved } = resolveCompetitions(byCountry);
  assert.equal(unresolved.length, 0);
  assert.equal(resolved.length, SUPPORTED_COMPETITIONS.length);
  const serieA = resolved.find((item) => item.slug === "serie-a");
  assert.equal(serieA.leagueId, 9001 + SUPPORTED_COMPETITIONS.findIndex((spec) => spec.slug === "serie-a"));
  assert.equal(serieA.currentSeason.year, 2026);
  assert.equal(serieA.currentSeason.coverage.standings, true);
});

await check("missing country, wrong type, and ambiguity are reported, not guessed", () => {
  const entries = (list) => parseLeagues(list).items;
  const { resolved, unresolved } = resolveCompetitions({
    England: entries([leagueEntry(1, "Premier League", "England", "Cup")]),
    Spain: entries([leagueEntry(2, "La Liga", "Spain", "League"), leagueEntry(3, "La Liga", "Spain", "League")]),
  });
  assert.equal(resolved.length, 0);
  const reasons = Object.fromEntries(unresolved.map((item) => [item.slug, item.reason]));
  assert.match(reasons["premier-league"], /No exact/);
  assert.match(reasons.laliga, /Ambiguous/);
  assert.match(reasons["serie-a"], /No \/leagues data/);
});

console.log("Adapter");

const slugs = new Map([[100, "premier-league"]]);

await check("status codes map to display groups", () => {
  const match = (opts) => fixtureToMatch(parseFixtures([fixture(opts)]).items[0], slugs);
  assert.equal(match({ short: "NS" }).status, "upcoming");
  assert.equal(match({ short: "NS" }).homeScore, undefined);
  const live = match({ short: "2H", elapsed: 67, goals: [2, 1] });
  assert.equal(live.status, "live");
  assert.equal(live.clock.label, "67'");
  assert.equal(live.homeScore, 2);
  assert.equal(match({ short: "1H", elapsed: 45, extra: 2, goals: [0, 0] }).clock.label, "45+2'");
  assert.equal(match({ short: "HT", elapsed: 45, goals: [0, 0] }).clock.label, "HT");
  assert.equal(match({ short: "FT", elapsed: 90, goals: [3, 3] }).status, "finished");
  assert.equal(match({ short: "AET", goals: [2, 1] }).statusDetail, "AET");
  assert.equal(match({ short: "PST" }).status, "postponed");
  assert.equal(match({ short: "CANC" }).statusDetail, "Cancelled");
  const unknown = match({ short: "XYZ", long: "Some New State" });
  assert.equal(unknown.status, "upcoming");
  assert.equal(unknown.statusDetail, "Some New State");
});

await check("source is labelled and unsupported leagues are skipped", () => {
  const parsed = parseFixtures([fixture(), fixture({ id: 3, league: 999 })]).items;
  const match = fixtureToMatch(parsed[0], slugs);
  assert.equal(match.source, "api-football");
  assert.equal(match.leagueSlug, "premier-league");
  assert.equal(fixtureToMatch(parsed[1], slugs), null);
});

await check("finished match with missing goals shows no score", () => {
  const match = fixtureToMatch(parseFixtures([fixture({ short: "FT", goals: [null, null] })]).items[0], slugs);
  assert.equal(match.homeScore, undefined);
});

await check("crest source: provider image when valid, otherwise neutral (never invented)", () => {
  const logo = "https://media.api-sports.io/football/teams/10.png";
  assert.deepEqual(providerClub({ id: 10, name: "Home Town FC", logo }).crest, { kind: "image", url: logo });
  assert.deepEqual(providerClub({ id: 11, name: "Away United", logo: null }).crest, { kind: "neutral" });
  assert.equal(teamInitials("Home Town FC"), "HTF");
  assert.equal(teamInitials("Beşiktaş"), "BEŞ");
  const parsed = parseFixtures([fixture()]).items[0];
  const match = fixtureToMatch(parsed, slugs);
  assert.equal(match.home.crest.kind, "image", "fixture logo flows through to the card");
  assert.equal(match.away.crest.kind, "neutral", "missing logo gives the neutral badge");
  assert.equal(match.fixtureId, 1);
});

await check("logo URLs: only https API-Sports football media is accepted", () => {
  assert.equal(safeLogoUrl("https://media.api-sports.io/football/teams/33.png"), "https://media.api-sports.io/football/teams/33.png");
  assert.equal(safeLogoUrl("https://media-4.api-sports.io/football/leagues/39.png"), "https://media-4.api-sports.io/football/leagues/39.png");
  for (const bad of [
    "http://media.api-sports.io/football/teams/33.png",
    "https://evil.example/football/teams/33.png",
    "https://api-sports.io.evil.example/football/teams/33.png",
    "https://evilapi-sports.io/football/teams/33.png",
    "https://media.api-sports.io/basketball/teams/1.png",
    "https://media.api-sports.io/football/teams/33.png?track=1",
    "https://user:pw@media.api-sports.io/football/teams/33.png",
    "javascript:alert(1)",
    "",
    null,
    42,
  ]) {
    assert.equal(safeLogoUrl(bad), null, `should reject ${bad}`);
  }
  const parsed = parseFixtures([{ ...fixture(), teams: { home: { id: 1, name: "A", logo: "https://evil.example/football/a.png" }, away: { id: 2, name: "B", logo: null } } }]).items[0];
  assert.equal(parsed.home.logo, null);
});

console.log("Assets and players");

await check("league logos and team crests are parsed and validated", () => {
  const leagues = parseLeagues([
    leagueEntry(39, "Premier League", "England", "League"),
    { ...leagueEntry(40, "Championship", "England", "League"), league: { id: 40, name: "Championship", type: "League", logo: "https://evil.example/football/x.png" } },
  ]).items;
  assert.equal(leagues[0].logo, null, "synthetic entry has no logo");
  assert.equal(leagues[1].logo, null, "logo on a foreign host is rejected");
  const withLogo = parseLeagues([{ league: { id: 2, name: "UEFA Champions League", type: "Cup", logo: "https://media.api-sports.io/football/leagues/2.png" }, country: { name: "World" }, seasons: [] }]).items[0];
  assert.equal(withLogo.logo, "https://media.api-sports.io/football/leagues/2.png");
  const teams = parseTeams([{ team: { id: 541, name: "Real Madrid", country: "Spain", logo: "https://media.api-sports.io/football/teams/541.png" } }, { team: { name: "No id" } }]);
  assert.equal(teams.items.length, 1);
  assert.equal(teams.invalid, 1);
});

await check("asset matching: exact name + country + type, same names in other countries kept apart", () => {
  const entries = parseLeagues([
    leagueEntry(135, "Serie A", "Italy", "League"),
    leagueEntry(71, "Serie A", "Brazil", "League"),
    leagueEntry(39, "Premier League", "England", "League"),
    leagueEntry(233, "Premier League", "Egypt", "League"),
    leagueEntry(17, "AFC Champions League Elite", "World", "Cup"),
    leagueEntry(18, "AFC Champions League Two", "World", "Cup"),
    leagueEntry(203, "Süper Lig", "Turkey", "League"),
  ]).items;
  const ids = (spec) => matchLeague(entries, spec)?.id ?? null;
  assert.equal(ids({ slug: "brasileirao", countries: ["Brazil"], names: ["Serie A"], type: "League" }), 71);
  assert.equal(ids({ slug: "serie-a", countries: ["Italy"], names: ["Serie A"], type: "League" }), 135);
  assert.equal(ids({ slug: "egyptian-premier-league", countries: ["Egypt"], names: ["Premier League"], type: "League" }), 233);
  assert.equal(ids({ slug: "afc", countries: ["World"], names: ["AFC Champions League Elite", "AFC Champions League"], type: "Cup" }), 17);
  assert.equal(ids({ slug: "super-lig", countries: ["Turkey"], names: ["Super Lig"], type: "League" }), 203, "accents ignored");
  assert.equal(ids({ slug: "fa-cup", countries: ["England"], names: ["FA Cup"], type: "Cup" }), null, "missing → null, never guessed");
  assert.equal(ids({ slug: "x", countries: ["England"], names: ["Premier League"], type: "Cup" }), null, "type must match");
  assert.equal(normaliseName("Paris Saint-Germain"), "paris saint germain");
  const teams = parseTeams([{ team: { id: 85, name: "Paris Saint Germain" } }, { team: { id: 157, name: "Bayern München" } }]).items;
  assert.equal(matchTeam(teams, { clubId: "psg", leagueSlug: "ligue-1", names: ["Paris Saint-Germain"] }).id, 85);
  assert.equal(matchTeam(teams, { clubId: "bayern", leagueSlug: "bundesliga", names: ["Bayern Munchen"] }).id, 157);
  assert.equal(matchTeam(teams, { clubId: "x", leagueSlug: "x", names: ["Chelsea"] }), null);
});

await check("plan season range is read from the provider's message", () => {
  assert.deepEqual(planSeasonRange("Free plans do not have access to this season, try from 2022 to 2024."), { from: 2022, to: 2024 });
  assert.equal(planSeasonRange("Free plans do not have access to this season."), null);
  assert.equal(planSeasonRange("try from 2024 to 2022"), null);
});

await check("player rankings: real fields only, stats for the requested league", () => {
  const entry = (id, name, stats) => ({
    player: { id, name, firstname: "F", lastname: "L", age: 25, nationality: "Norway", photo: `https://media.api-sports.io/football/players/${id}.png` },
    statistics: stats,
  });
  const line = (leagueId, team, goals, assists, apps) => ({
    team: { id: team, name: `Team ${team}`, logo: `https://media.api-sports.io/football/teams/${team}.png` },
    league: { id: leagueId, season: 2024 },
    games: { appearences: apps, minutes: 900, position: "Attacker" },
    goals: { total: goals, assists, conceded: null, saves: null },
    penalty: { scored: 2 },
  });
  const { items, invalid } = parsePlayerStatLines(
    [
      entry(1, "A. Striker", [line(2, 10, 3, 1, 5), line(39, 11, 20, 4, 30)]),
      entry(2, "B. Winger", [{ ...line(39, 12, 8, 9, null), games: { appearances: 28 } }]),
      { player: { id: 3 }, statistics: [] },
      { ...entry(4, "C. Bad", [line(39, 13, 1, 1, 1)]), player: { id: 4, name: "C. Bad", photo: "http://evil.example/x.png" } },
    ],
    39,
  );
  assert.equal(invalid, 1, "player without a name is dropped");
  assert.equal(items[0].goals, 20, "uses the requested league's statistics");
  assert.equal(items[0].team.id, 11);
  assert.equal(items[0].appearances, 30, "reads the API's 'appearences' spelling");
  assert.equal(items[1].appearances, 28, "also accepts 'appearances'");
  assert.equal(items[0].photo, "https://media.api-sports.io/football/players/1.png");
  assert.equal(items[2].photo, null, "unsafe photo URL dropped");
  assert.equal(items[0].nationality, "Norway");
  assert.deepEqual(items[0].record, { competitionRecords: 1, clubs: ["Team 11"], leagueId: 39, season: 2024 });
});

await check("no record for the competition: figures stay null (no cross-competition fallback)", () => {
  const [onlyCup] = parsePlayerStatLines(
    [{ player: { id: 9, name: "Cup Only" }, statistics: [{ team: { id: 1, name: "X" }, league: { id: 2, season: 2024 }, games: { appearences: 10 }, goals: { total: 9 } }] }],
    39,
  ).items;
  assert.equal(onlyCup.goals, null);
  assert.equal(onlyCup.appearances, null);
  assert.equal(onlyCup.record.competitionRecords, 0);
});

console.log("Ranking integrity");

const ctx = { leagueId: 39, season: 2024, metric: "goals", competitionName: "Premier League", maxMatches: 38, clubIds: new Set([10, 11, 12, 13]) };
function rec(id, name, { team = 10, apps = 30, goals = 10, assists = 2, minutes = 2500, records = 1, clubs = ["Club"], leagueId = 39, season = 2024 } = {}) {
  return { playerId: id, name, photo: null, nationality: null, age: null, team: team === null ? null : { id: team, name: `Club ${team}`, logo: null },
    position: "Attacker", appearances: apps, minutes, goals, assists, penaltyGoals: null, record: { competitionRecords: records, clubs, leagueId, season } };
}

await check("inflated totals (more appearances than the season has) are excluded", () => {
  const reason = integrityIssue(rec(1, "Doubled", { apps: 66, goals: 30, minutes: 5600 }), ctx);
  assert.match(reason, /66 appearances.*at most 38 matches/);
  assert.match(integrityIssue(rec(2, "Minutes", { apps: 38, minutes: 38 * 130 + 1 }), ctx), /minutes/);
  assert.equal(integrityIssue(rec(3, "Max", { apps: 38, minutes: 3420 }), ctx), null, "a full season is fine");
});

await check("split club records, wrong season or competition, missing values are excluded", () => {
  assert.match(integrityIssue(rec(1, "Split", { records: 2, clubs: ["Wolves", "Manchester United"] }), ctx), /split across Wolves and Manchester United/);
  assert.match(integrityIssue(rec(2, "Season", { season: 2025 }), ctx), /season 2025/);
  assert.match(integrityIssue(rec(3, "Cup", { records: 0 }), ctx), /No Premier League record/);
  assert.match(integrityIssue(rec(4, "NoGoals", { goals: null }), ctx), /No goals/);
  assert.match(integrityIssue(rec(5, "NoClub", { team: null }), ctx), /No club/);
});

await check("club must be in the season's league table (when known)", () => {
  assert.match(integrityIssue(rec(1, "Outsider", { team: 99 }), ctx), /did not play in this Premier League season/);
  assert.equal(integrityIssue(rec(2, "Unknown table", { team: 99 }), { ...ctx, clubIds: null }), null, "skipped when the table is unavailable");
});

await check("an inflated record cannot rank first; provider order kept for the rest", () => {
  const players = [rec(1, "Inflated", { apps: 66, goals: 30 }), rec(2, "Real Top", { goals: 29 }), rec(3, "Second", { goals: 23 }), rec(4, "Moved", { apps: 76, goals: 12 })];
  const { ranked, excluded } = checkRanking(players, ctx);
  assert.deepEqual(ranked.map((p) => p.name), ["Real Top", "Second"]);
  assert.deepEqual(excluded.map((e) => e.player.name), ["Inflated", "Moved"]);
  assert.equal(ranked[0].goals, 29, "values untouched");
});

console.log("Match reports");

function finished({ short = "FT", goals = [2, 1], ht = [1, 0], pens = null, events = [], stats = [] } = {}) {
  const base = fixture({ id: 77, short, goals });
  const parsed = parseFixtureDetails({
    ...base,
    teams: { home: { id: 10, name: "Home Town FC", logo: null }, away: { id: 11, name: "Away United", logo: null } },
    score: { halftime: { home: ht[0], away: ht[1] }, fulltime: { home: goals[0], away: goals[1] }, extratime: {}, penalty: pens ? { home: pens[0], away: pens[1] } : {} },
    events, statistics: stats,
  });
  return parsed;
}
const ev = (minute, team, player, type, detail, extra = null, assist = null) => ({ time: { elapsed: minute, extra }, team: { id: team, name: "" }, player: { name: player }, assist: { name: assist }, type, detail });
const meta = { leagueSlug: "premier-league", competition: "Premier League", dataFetchedAt: "2026-10-22T20:00:00Z", now: new Date("2026-10-22T21:00:00Z") };
const BANNED = /stun|thrash|brilliant|dominan|crisis|injur|transfer|said|told|tactic|breaking|superb|woeful|deserved/i;

await check("report: win with scorers, half-time, cards and statistics, all from the data", () => {
  const out = buildMatchReport(finished({
    events: [ev(12, 10, "A. Striker", "Goal", "Normal Goal", null, "B. Winger"), ev(30, 11, "C. Defender", "Card", "Yellow Card"), ev(55, 11, "D. Forward", "Goal", "Penalty"), ev(88, 10, "A. Striker", "Goal", "Normal Goal", 2), ev(70, 10, "E. Mid", "Goal", "Missed Penalty")],
    stats: [{ team: { id: 10, name: "Home Town FC" }, statistics: [{ type: "Ball Possession", value: "58%" }, { type: "Total Shots", value: 14 }, { type: "Shots on Goal", value: 6 }] },
            { team: { id: 11, name: "Away United" }, statistics: [{ type: "Ball Possession", value: "42%" }, { type: "Total Shots", value: 8 }, { type: "Shots on Goal", value: 3 }] }],
  }), meta);
  assert.equal(out.ok, true, out.reason);
  const r = out.report;
  assert.equal(r.fixtureId, 77);
  assert.equal(r.headline, "Home Town FC beat Away United 2–1");
  assert.deepEqual(r.summary, [
    "Home Town FC beat Away United 2–1 in the Premier League.",
    "Home Town FC led 1–0 at half-time.",
    "Scorers for Home Town FC: A. Striker (12', 88+2').",
    "Scorers for Away United: D. Forward (55' pen.).",
    "Yellow cards: Home Town FC 0, Away United 1.",
    "Possession: Home Town FC 58%, Away United 42%.",
    "Shots: Home Town FC 14, Away United 8 (on target 6 and 3).",
  ]);
  assert.equal(r.goals.length, 3, "missed penalty is not a goal");
  assert.ok(!BANNED.test([r.headline, ...r.summary].join(" ")), "no subjective or unsupported wording");
});

await check("report: away win and goalless draw use neutral templates", () => {
  const away = buildMatchReport(finished({ goals: [0, 1], ht: [0, 0], events: [ev(75, 11, "Z. Late", "Goal", "Normal Goal")] }), meta);
  assert.equal(away.report.headline, "Away United beat Home Town FC 1–0");
  assert.equal(away.report.summary[1], "The score was 0–0 at half-time.");
  const draw = buildMatchReport(finished({ goals: [0, 0], ht: [0, 0] }), meta);
  assert.equal(draw.report.headline, "Home Town FC and Away United play out a goalless draw");
  assert.deepEqual(draw.report.goals, []);
});

await check("report: own goals listed without guessing the credited side", () => {
  const out = buildMatchReport(finished({ goals: [1, 1], ht: [1, 1], events: [ev(10, 10, "A. Striker", "Goal", "Normal Goal"), ev(40, 10, "O. Unlucky", "Goal", "Own Goal")] }), meta);
  assert.equal(out.ok, true, out.reason);
  assert.ok(out.report.summary.includes("Own goal: O. Unlucky (40').")); 
  assert.equal(out.report.goals[1].side, null);
});

await check("no report when data is missing or inconsistent", () => {
  assert.match(buildMatchReport(finished({ short: "2H" }), meta).reason, /not finished/);
  assert.match(buildMatchReport(finished({ events: [] }), meta).reason, /Goal events are not available/);
  assert.match(buildMatchReport(finished({ events: [ev(12, 10, "A", "Goal", "Normal Goal")] }), meta).reason, /do not match/, "VAR-cancelled or missing goals");
  assert.match(buildMatchReport(finished({ goals: [1, 0], events: [ev(12, 11, "A", "Goal", "Normal Goal")] }), meta).reason, /do not match/, "goal credited to the wrong side");
  assert.match(buildMatchReport(finished({ goals: [1, 0], events: [{ ...ev(12, 10, "A", "Goal", "Normal Goal"), player: { name: null } }] }), meta).reason, /scorer or minute/);
  const noScore = finished();
  noScore.goals = { home: null, away: null };
  assert.match(buildMatchReport(noScore, meta).reason, /No confirmed final score/);
  assert.match(buildMatchReport(finished({ short: "PEN", goals: [1, 1], events: [ev(5, 10, "A", "Goal", "Normal Goal"), ev(9, 11, "B", "Goal", "Normal Goal")] }), meta).reason, /shoot-out result is missing/);
});

await check("penalty shoot-out and red cards reported as supplied", () => {
  const out = buildMatchReport(finished({ short: "PEN", goals: [1, 1], ht: [0, 0], pens: [4, 5], events: [ev(5, 10, "A", "Goal", "Normal Goal"), ev(99, 11, "B", "Goal", "Normal Goal"), ev(60, 10, "R. Red", "Card", "Red Card")] }), meta);
  assert.equal(out.ok, true, out.reason);
  assert.equal(out.report.headline, "Away United win on penalties after Home Town FC 1–1 Away United");
  assert.ok(out.report.summary[0].includes("Away United won the penalty shoot-out 5–4"));
  assert.ok(out.report.summary.includes("R. Red (Home Town FC, 60') was sent off."));
});

await check("half-time line only when it agrees with first-half goals", () => {
  const conflicting = buildMatchReport(finished({ goals: [2, 1], ht: [1, 0], events: [ev(15, 10, "H1", "Goal", "Normal Goal"), ev(40, 11, "A1", "Goal", "Penalty"), ev(45, 10, "H2", "Goal", "Normal Goal", 1)] }), meta);
  assert.equal(conflicting.ok, true);
  assert.equal(conflicting.report.halftime, null);
  assert.ok(!conflicting.report.summary.some((line) => /half-time/.test(line)), "contradiction left out");
  const agreeing = buildMatchReport(finished({ goals: [2, 1], ht: [2, 1], events: [ev(15, 10, "H1", "Goal", "Normal Goal"), ev(40, 11, "A1", "Goal", "Penalty"), ev(45, 10, "H2", "Goal", "Normal Goal", 1)] }), meta);
  assert.deepEqual(agreeing.report.halftime, { home: 2, away: 1 });
});

console.log(`\n${passed} API-Football checks passed (no network requests made)`);
