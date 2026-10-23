// Integration tests for the standings and match-details loaders (the data the
// /leagues/[slug] and /matches/[id] pages render), plus the adaptive refresh
// window. Runs the real server modules with a mocked fetch; no network.
// Run with: npm run test:pages
import assert from "node:assert/strict";

let requests = [];
let routes = {};
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  const key = url.pathname + (url.search ? "?" + [...url.searchParams.keys()].sort().join("&") : "");
  requests.push(url.pathname + url.search);
  assert.equal(url.origin, "https://v3.football.api-sports.io");
  assert.equal(init.headers["x-apisports-key"], "test-key");
  const handler = routes[key];
  if (!handler) throw new Error(`Unexpected request ${url.pathname}${url.search}`);
  const out = handler(url.searchParams);
  if (out instanceof Response) return out;
  return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
};

const { SUPPORTED_COMPETITIONS } = await import("../src/lib/api-football/competitions.ts");
const { loadStandings, seasonLabel } = await import("@/lib/standings");
const { loadMatchDetails, parseFixtureId } = await import("@/lib/match-details");
const { getMatchFeed } = await import("@/lib/match-feed");
const { loadPlayers, resolvePlayersQuery, seasonMatchLimit, PLAYER_COMPETITIONS } = await import("@/lib/players");
const { getLeagueAsset, planSeasons } = await import("@/data/api-assets");
const { chooseSeason, resetPlanWindowForTests } = await import("@/lib/api-football/plan");
const { indexingAllowed, pageMetadata, productionSiteConfigured, siteUrl } = await import("@/lib/site");
const { getStoredReport, listStoredReports, saveReportOnce } = await import("@/lib/report-store");
const { isKnownFixture, recordKnownFixtures, resetFixtureIndexMemo, INDEX_MAX_AGE_MS } = await import("@/lib/fixture-index");
const { mkdtempSync, writeFileSync, readdirSync, rmSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");

const ids = new Map(SUPPORTED_COMPETITIONS.map((spec, index) => [spec.slug, 8100 + index]));
const envelope = (response, errors = []) => ({ errors, results: response.length, paging: { current: 1, total: 1 }, response });
const season = (overrides = {}) => ({ year: 2026, start: "2026-08-14", end: "2027-05-23", current: true, coverage: { fixtures: { events: true, lineups: true, statistics_fixtures: true }, standings: true }, ...overrides });

function leaguesRoute(seasonOverrides = {}) {
  return (params) =>
    envelope(
      SUPPORTED_COMPETITIONS.filter((spec) => spec.country === params.get("country")).map((spec) => ({
        league: { id: ids.get(spec.slug), name: spec.names[0], type: spec.type, logo: null },
        country: { name: spec.country, code: null, flag: null },
        seasons: Array.isArray(seasonOverrides[spec.slug])
          ? seasonOverrides[spec.slug].map((overrides) => season(overrides))
          : [season(seasonOverrides[spec.slug] ?? {})],
      })),
    );
}

const now = Date.now();
function fixtureEntry({ id, slug = "premier-league", kickoffMs = now - 2 * 3600e3, short = "FT", goals = [2, 1] }) {
  return {
    fixture: { id, referee: "R. Referee", timezone: "UTC", date: new Date(kickoffMs).toISOString(), timestamp: Math.floor(kickoffMs / 1000), venue: { id: 1, name: "Synthetic Park", city: "Testville" }, status: { long: short, short, elapsed: short === "FT" ? 90 : null, extra: null } },
    league: { id: ids.get(slug), name: "Synthetic League", country: "Testland", season: 2026, round: "Regular Season - 9" },
    teams: { home: { id: 501, name: "Provider Home", logo: "https://media.api-sports.io/football/teams/501.png", winner: true }, away: { id: 502, name: "Provider Away", logo: null, winner: false } },
    goals: { home: goals[0], away: goals[1] },
    score: { halftime: { home: 1, away: 0 }, fulltime: { home: goals[0], away: goals[1] }, extratime: { home: null, away: null }, penalty: { home: null, away: null } },
  };
}

let passed = 0;
async function check(name, env, fn) {
  const saved = { ...process.env };
  for (const key of ["MATCHPULSE_DATA_SOURCE", "API_FOOTBALL_KEY", "API_FOOTBALL_BASE_URL"]) delete process.env[key];
  Object.assign(process.env, { NODE_ENV: "production" }, env);
  requests = [];
  resetPlanWindowForTests();
  const logError = console.error;
  console.error = () => {};
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
// General loader tests ignore the plan window; the "API plan" checks below use it.
const API = { MATCHPULSE_DATA_SOURCE: "api-football", API_FOOTBALL_KEY: "test-key", API_FOOTBALL_PLAN_SEASONS: "all" };
const API_PLAN = { MATCHPULSE_DATA_SOURCE: "api-football", API_FOOTBALL_KEY: "test-key" };
const FREE_WINDOW = { from: 2022, to: 2024, source: "api", observedAt: "2026-10-22T09:18:19.966Z" };
const countOf = (prefix) => requests.filter((r) => r.startsWith(prefix)).length;

console.log("Standings");

await check("season labels", {}, () => {
  assert.equal(seasonLabel({ year: 2026, start: "2026-08-14", end: "2027-05-23" }), "2026/27");
  assert.equal(seasonLabel({ year: 2026, start: "2026-03-01", end: "2026-11-30" }), "2026");
  assert.equal(seasonLabel({ year: 2026, start: null, end: null }), "2026");
});

await check("sample mode: no standings and no requests (never sample standings)", {}, async () => {
  assert.deepEqual(await loadStandings("premier-league"), { state: "disabled" });
  assert.equal(requests.length, 0);
});

await check("rows mapped from the provider, sorted by rank, with crests", API, async () => {
  const row = (rank, id, points) => ({ rank, team: { id, name: `Club ${id}`, logo: `https://media.api-sports.io/football/teams/${id}.png` }, points, goalsDiff: 10 - rank, group: "Premier League", form: "WDLWW", status: "same", description: rank === 1 ? "Promotion - Champions League" : null, all: { played: 9, win: 6, draw: 2, lose: 1, goals: { for: 18, against: 8 } } });
  routes = {
    "/leagues?country": leaguesRoute(),
    "/standings?league&season": (p) => {
      assert.equal(p.get("league"), String(ids.get("premier-league")));
      assert.equal(p.get("season"), "2026");
      return envelope([{ league: { id: ids.get("premier-league"), season: 2026, standings: [[row(2, 11, 19), row(1, 10, 21)]] } }]);
    },
  };
  const view = await loadStandings("premier-league");
  assert.equal(view.state, "ok");
  assert.equal(view.seasonLabel, "2026/27");
  assert.deepEqual(view.groups[0].rows.map((r) => r.rank), [1, 2]);
  const top = view.groups[0].rows[0];
  assert.deepEqual([top.played, top.win, top.draw, top.lose, top.goalsFor, top.goalsAgainst, top.goalsDiff, top.points], [9, 6, 2, 1, 18, 8, 9, 21]);
  assert.equal(top.teamLogo, "https://media.api-sports.io/football/teams/10.png");
  assert.equal(countOf("/standings"), 1);
});

await check("multiple groups are kept separate (e.g. cup group stages)", API, async () => {
  const row = (rank, id, group) => ({ rank, team: { id, name: `Club ${id}` }, points: 3, goalsDiff: 0, group, all: { played: 1, win: 1, draw: 0, lose: 0, goals: { for: 1, against: 0 } } });
  routes = { "/leagues?country": leaguesRoute(), "/standings?league&season": () => envelope([{ league: { id: ids.get("champions-league"), season: 2026, standings: [[row(1, 1, "Group A")], [row(1, 2, "Group B")]] } }]) };
  const view = await loadStandings("champions-league");
  assert.deepEqual(view.groups.map((g) => g.name), ["Group A", "Group B"]);
});

await check("no standings coverage: honest state and no /standings request", API, async () => {
  routes = { "/leagues?country": leaguesRoute({ "botola-pro": { coverage: { fixtures: {}, standings: false } } }) };
  const view = await loadStandings("botola-pro");
  assert.equal(view.state, "no-coverage");
  assert.equal(countOf("/standings"), 0);
});

await check("plan restriction → non-retryable error, nothing fabricated", API, async () => {
  routes = { "/leagues?country": leaguesRoute(), "/standings?league&season": () => envelope([], { plan: "Free plans do not have access to this season." }) };
  const view = await loadStandings("serie-a");
  assert.equal(view.state, "error");
  assert.equal(view.retryable, false);
  assert.match(view.reason, /not included/);
});

await check("per-minute limit → retryable; daily quota → not retryable; empty → empty state", API, async () => {
  routes = { "/leagues?country": leaguesRoute(), "/standings?league&season": () => envelope([], { rateLimit: "Too many requests. Your rate limit is 10 requests per minute." }) };
  const limited = await loadStandings("laliga");
  assert.equal(limited.state, "error");
  assert.equal(limited.retryable, true);
  assert.match(limited.reason, /try again in a minute/);
  routes["/standings?league&season"] = () => envelope([], { requests: "You have reached the request limit for the day" });
  const exhausted = await loadStandings("ligue-1");
  assert.equal(exhausted.retryable, false);
  assert.match(exhausted.reason, /daily request limit/);
  routes["/standings?league&season"] = () => envelope([]);
  assert.equal((await loadStandings("bundesliga")).state, "empty");
});

console.log("Match details");

await check("fixture ID validation", {}, () => {
  for (const ok of ["1", "1208021", "2147483647"]) assert.equal(parseFixtureId(ok), Number(ok));
  for (const bad of ["0", "-1", "01", "1.5", "abc", "1e3", "", "99999999999", "2147483648", "12 "]) assert.equal(parseFixtureId(bad), null, bad);
});

await check("invalid ID and sample mode make no requests", API, async () => {
  assert.deepEqual(await loadMatchDetails("not-a-number"), { state: "invalid" });
  assert.equal(requests.length, 0);
});

await check("sample mode: details disabled without requests", {}, async () => {
  assert.deepEqual(await loadMatchDetails("123"), { state: "disabled" });
  assert.equal(requests.length, 0);
});

const today = new Date(now).toISOString().slice(0, 10);
function feedRoutes(extra = {}) {
  return {
    "/leagues?country": leaguesRoute(),
    "/fixtures?date&timezone": (p) => envelope(p.get("date") === today ? [fixtureEntry({ id: 424242 })] : []),
    ...extra,
  };
}

await check("unknown fixture ID: not found, details never requested (quota guard)", API, async () => {
  routes = feedRoutes();
  assert.deepEqual(await loadMatchDetails("999999"), { state: "not-found" });
  assert.equal(countOf("/fixtures?id"), 0);
});

await check("known fixture: details mapped from the provider; nothing invented", API, async () => {
  routes = feedRoutes({
    "/fixtures?id": (p) => {
      assert.equal(p.get("id"), "424242");
      return envelope([{ ...fixtureEntry({ id: 424242 }), events: [{ time: { elapsed: 12, extra: null }, team: { id: 501, name: "Provider Home" }, player: { id: 1, name: "P. Scorer" }, assist: { id: null, name: null }, type: "Goal", detail: "Normal Goal" }], lineups: [], statistics: [] }]);
    },
  });
  const view = await loadMatchDetails("424242");
  assert.equal(view.state, "ok");
  assert.equal(view.detailsError, null);
  assert.equal(view.match.source, "api-football");
  assert.equal(view.match.home.name, "Provider Home");
  assert.deepEqual(view.match.home.crest, { kind: "image", url: "https://media.api-sports.io/football/teams/501.png" });
  assert.deepEqual(view.match.away.crest, { kind: "neutral" });
  assert.deepEqual([view.match.homeScore, view.match.awayScore], [2, 1]);
  assert.equal(view.details.events.length, 1);
  assert.deepEqual([view.details.lineups, view.details.statistics], [[], []], "empty sections stay empty");
  assert.equal(view.details.venue.name, "Synthetic Park");
  assert.equal(countOf("/fixtures?id"), 1);
});

await check("details failure: feed summary kept, clear error, no fake data", API, async () => {
  routes = feedRoutes({ "/fixtures?id": () => envelope([], { rateLimit: "Too many requests" }) });
  const view = await loadMatchDetails("424242");
  assert.equal(view.state, "ok");
  assert.match(view.detailsError, /busy/);
  assert.equal(view.details, null);
  assert.equal(view.match.home.name, "Provider Home");
});

await check("feed unavailable: details page explains, no details request", API, async () => {
  routes = { "/leagues?country": leaguesRoute(), "/fixtures?date&timezone": () => envelope([], { requests: "limit reached" }) };
  const view = await loadMatchDetails("424242");
  assert.equal(view.state, "feed-unavailable");
  assert.equal(countOf("/fixtures?id"), 0);
});

console.log("Live freshness");

await check("today refresh: configured window while active, hourly when quiet", API, async () => {
  routes = { "/leagues?country": leaguesRoute(), "/fixtures?date&timezone": (p) => envelope(p.get("date") === today ? [fixtureEntry({ id: 1, short: "1H", goals: [0, 0], kickoffMs: now - 20 * 60e3 })] : []) };
  const active = await getMatchFeed();
  assert.equal(active.source.kind, "api-football");
  assert.equal(active.source.refreshSeconds, 1200);
  routes["/fixtures?date&timezone"] = (p) => envelope(p.get("date") === today ? [fixtureEntry({ id: 2, short: "FT", kickoffMs: now - 6 * 3600e3 })] : []);
  const quiet = await getMatchFeed();
  assert.equal(quiet.source.refreshSeconds, 3600);
});

await check("refresh window never drops below the configured value", { ...API, API_FOOTBALL_REVALIDATE_TODAY_SECONDS: "5400" }, async () => {
  routes = { "/leagues?country": leaguesRoute(), "/fixtures?date&timezone": () => envelope([]) };
  assert.equal((await getMatchFeed()).source.refreshSeconds, 5400);
});

console.log("API plan (seasons the subscription includes)");

await check("season choice: current if allowed, else the latest covered season in the plan", {}, () => {
  const s = (year, current = false, standings = true) => ({ year, start: null, end: null, current, coverage: { fixtureEvents: true, lineups: true, fixtureStatistics: true, standings, topScorers: null, topAssists: null } });
  const seasons = [s(2026, true), s(2025), s(2024), s(2023, false, false), s(2022)];
  assert.deepEqual(
    [chooseSeason(seasons, "standings", null).season.year, chooseSeason(seasons, "standings", null).limitedByPlan],
    [2026, false],
  );
  const free = chooseSeason(seasons, "standings", FREE_WINDOW);
  assert.deepEqual([free.season.year, free.current.year, free.limitedByPlan], [2024, 2026, true]);
  const noCoverage = chooseSeason([s(2026, true), s(2024, false, false), s(2023)], "standings", FREE_WINDOW);
  assert.equal(noCoverage.season.year, 2023, "skips a season without coverage");
  const none = chooseSeason([s(2026, true), s(2025)], "standings", FREE_WINDOW);
  assert.deepEqual([none.season, none.limitedByPlan], [null, true]);
  const future = chooseSeason([s(2027), s(2026, true)], "standings", null);
  assert.equal(future.season.year, 2026, "never picks a future season");
});

await check("standings: current season outside the plan → latest included season, labelled, one request", API_PLAN, async () => {
  routes = {
    "/leagues?country": leaguesRoute({ "premier-league": [{ year: 2026, current: true }, { year: 2025, current: false }, { year: 2024, current: false, start: "2024-08-16", end: "2025-05-25" }] }),
    "/standings?league&season": (p) => {
      assert.equal(p.get("season"), "2024", "never requests a season the plan excludes");
      return envelope([{ league: { id: ids.get("premier-league"), season: 2024, standings: [[{ rank: 1, team: { id: 10, name: "Club 10" }, points: 90, goalsDiff: 50, group: "Premier League", all: { played: 38, win: 28, draw: 6, lose: 4, goals: { for: 90, against: 40 } } }]] } }]);
    },
  };
  const view = await loadStandings("premier-league");
  assert.equal(view.state, "ok");
  assert.equal(view.seasonLabel, "2024/25");
  assert.deepEqual(view.planLimited, { currentLabel: "2026/27" });
  assert.equal(countOf("/standings"), 1);
});

await check("standings: no season both covered and in the plan → honest state, no /standings request", API_PLAN, async () => {
  routes = { "/leagues?country": leaguesRoute({ "serie-a": [{ year: 2026, current: true }, { year: 2025, current: false }] }) };
  const view = await loadStandings("serie-a");
  assert.equal(view.state, "plan-restricted");
  assert.equal(view.currentLabel, "2026/27");
  assert.deepEqual(view.allowed, { from: 2022, to: 2024 });
  assert.equal(countOf("/standings"), 0);
});

await check("a restriction reported by the API is remembered: later restricted seasons cost no request", { ...API_PLAN, API_FOOTBALL_PLAN_SEASONS: "" }, async () => {
  // Start without any known window (as before the first restricted response).
  process.env.API_FOOTBALL_PLAN_SEASONS = "all";
  routes = { "/players/topassists?league&season": () => envelope([], { plan: "Free plans do not have access to this season, try from 2022 to 2024." }) };
  const first = await loadPlayers({ ...resolvePlayersQuery({ category: "assists" }), season: 2026 });
  assert.deepEqual(first, { state: "plan-restricted", allowed: { from: 2022, to: 2024 } });
  assert.equal(countOf("/players/topassists"), 1);
  // The window is now known; a request for 2025 is refused locally.
  delete process.env.API_FOOTBALL_PLAN_SEASONS;
  const { getTopPlayers } = await import("@/lib/api-football/server");
  await assert.rejects(getTopPlayers("assists", ids.get("premier-league"), 2025, false), (error) => error.kind === "plan_restricted");
  assert.equal(countOf("/players/topassists"), 1, "no second request");
});

console.log("Players");

await check("filters: defaults, validation, and plan-aware default season", {}, () => {
  assert.deepEqual(PLAYER_COMPETITIONS.length, SUPPORTED_COMPETITIONS.length, "all supported competitions have synced IDs");
  const pl = getLeagueAsset("premier-league");
  const base = resolvePlayersQuery({});
  assert.equal(base.competition, "premier-league");
  assert.equal(base.category, "scorers");
  assert.equal(base.season, pl.currentSeason, "no plan window: the current season");
  const planned = resolvePlayersQuery({}, FREE_WINDOW);
  assert.equal(planned.season, 2024, "current season outside the plan: latest included season");
  assert.equal(planned.defaultedForPlan, true);
  assert.ok(planned.seasonOptions.every((year) => year >= 2022 && year <= 2024), "only seasons the plan includes are offered");
  const askedOutside = resolvePlayersQuery({ season: "2026" }, FREE_WINDOW);
  assert.equal(askedOutside.season, 2024, "a restricted season in the URL is never requested");
  assert.ok(planSeasons, "the asset sync recorded the provider's plan window");
  const junk = resolvePlayersQuery({ competition: "<script>", category: "evil", season: "1800" });
  assert.equal(junk.competition, "premier-league");
  assert.equal(junk.category, "scorers");
  assert.ok(junk.seasonOptions.includes(junk.season));
  const chosen = resolvePlayersQuery({ competition: "serie-a", category: "assists", season: String(base.seasonOptions[1]) });
  assert.deepEqual([chosen.competition, chosen.category, chosen.season, chosen.defaultedForPlan], ["serie-a", "assists", base.seasonOptions[1], false]);
});

await check("sample mode and unsupported categories make no requests", API, async () => {
  assert.deepEqual(await loadPlayers(resolvePlayersQuery({ category: "appearances" })), { state: "unsupported-category" });
  assert.deepEqual(await loadPlayers(resolvePlayersQuery({ category: "clean-sheets" })), { state: "unsupported-category" });
  assert.equal(requests.length, 0);
});

await check("sample mode: no players shown, no requests", {}, async () => {
  assert.deepEqual(await loadPlayers(resolvePlayersQuery({})), { state: "disabled" });
  assert.equal(requests.length, 0);
});

const playerEntry = (id, name, goals, assists) => ({
  player: { id, name, age: 27, nationality: "Egypt", photo: `https://media.api-sports.io/football/players/${id}.png` },
  statistics: [{ team: { id: 40, name: "Liverpool", logo: "https://media.api-sports.io/football/teams/40.png" }, league: { id: 39, season: 2024 }, games: { appearences: 38, position: "Attacker" }, goals: { total: goals, assists } }],
});

const tableRoute = (teamIds) => () =>
  envelope([{ league: { id: 39, season: 2024, standings: [teamIds.map((id, i) => ({ rank: i + 1, team: { id, name: `Club ${id}` }, points: 50 - i, all: {} }))] } }]);

await check("top scorers: provider order and values; synced league ID; club table checked", API, async () => {
  const query = resolvePlayersQuery({ season: "2024" });
  routes = {
    "/players/topscorers?league&season": (p) => {
      assert.equal(p.get("league"), String(getLeagueAsset("premier-league").id));
      assert.equal(p.get("season"), "2024");
      return envelope([playerEntry(1, "Player One", 29, 18), playerEntry(2, "Player Two", 22, 3)]);
    },
    "/standings?league&season": (p) => {
      assert.deepEqual([p.get("league"), p.get("season")], [String(getLeagueAsset("premier-league").id), "2024"]);
      return tableRoute([40, 50])();
    },
  };
  const view = await loadPlayers(query);
  assert.equal(view.state, "ok");
  assert.deepEqual(view.players.map((p) => [p.name, p.goals, p.assists, p.appearances]), [["Player One", 29, 18, 38], ["Player Two", 22, 3, 38]]);
  assert.equal(view.players[0].team.name, "Liverpool");
  assert.deepEqual([view.excluded, view.seasonFinished, view.clubsChecked], [[], true, "yes"]);
  assert.equal(requests.length, 2, "ranking + league table; no /leagues lookups (IDs from synced assets)");
});

await check("real-world failure pattern: doubled totals under a new club are excluded and cannot rank first", API, async () => {
  const doubled = { ...playerEntry(10, "Moved Striker", 30, 12), statistics: [{ team: { id: 33, name: "New Club" }, league: { id: 39, season: 2024 }, games: { appearences: 66, minutes: 5600, position: "Attacker" }, goals: { total: 30, assists: 12 } }] };
  const split = { ...playerEntry(11, "Split Winger", 14, 8), statistics: [
    { team: { id: 40, name: "Liverpool" }, league: { id: 39, season: 2024 }, games: { appearences: 20 }, goals: { total: 9, assists: 4 } },
    { team: { id: 50, name: "Old Club" }, league: { id: 39, season: 2024 }, games: { appearences: 12 }, goals: { total: 5, assists: 4 } }] };
  routes = {
    "/players/topscorers?league&season": () => envelope([doubled, playerEntry(1, "Genuine Leader", 29, 18), split, playerEntry(2, "Genuine Second", 22, 3)]),
    "/standings?league&season": tableRoute([33, 40, 50]),
  };
  const view = await loadPlayers(resolvePlayersQuery({ season: "2024" }));
  assert.deepEqual(view.players.map((p) => p.name), ["Genuine Leader", "Genuine Second"]);
  assert.deepEqual(view.excluded.map((e) => e.player.name), ["Moved Striker", "Split Winger"]);
  assert.match(view.excluded[0].reason, /66 appearances/);
  assert.match(view.excluded[1].reason, /split across Liverpool and Old Club/);
});

await check("league table unavailable: ranking still shown, club check reported as unavailable", API, async () => {
  routes = {
    "/players/topscorers?league&season": () =>
      envelope([{ ...playerEntry(1, "Player One", 29, 18), statistics: [{ team: { id: 541, name: "Real Madrid" }, league: { id: getLeagueAsset("laliga").id, season: 2023 }, games: { appearences: 35 }, goals: { total: 29, assists: 18 } }] }]),
    "/standings?league&season": () => envelope([], { rateLimit: "Too many requests" }),
  };
  const view = await loadPlayers(resolvePlayersQuery({ competition: "laliga", season: "2023" }));
  assert.equal(view.state, "ok");
  assert.equal(view.clubsChecked, "unavailable");
  assert.equal(view.players.length, 1);
});

await check("filters request what they display: assists, chosen season; cups skip the table", API, async () => {
  routes = {
    "/players/topassists?league&season": (p) => {
      assert.deepEqual([p.get("league"), p.get("season")], [String(getLeagueAsset("champions-league").id), "2023"]);
      return envelope([{ ...playerEntry(5, "Cup Creator", 4, 7), statistics: [{ team: { id: 40, name: "Liverpool" }, league: { id: getLeagueAsset("champions-league").id, season: 2023 }, games: { appearences: 10 }, goals: { total: 4, assists: 7 } }] }]);
    },
  };
  const view = await loadPlayers(resolvePlayersQuery({ competition: "champions-league", category: "assists", season: "2023" }));
  assert.equal(view.state, "ok");
  assert.equal(view.clubsChecked, "not-applicable");
  assert.equal(view.seasonFinished, true);
  assert.equal(countOf("/standings"), 0, "no table request for cup competitions");
  assert.equal(view.players[0].assists, 7);
});

await check("current season rejected by plan: honest state with the provider's window", API, async () => {
  routes = { "/players/topassists?league&season": () => envelope([], { plan: "Free plans do not have access to this season, try from 2022 to 2024." }) };
  const view = await loadPlayers(resolvePlayersQuery({ category: "assists", season: String(getLeagueAsset("premier-league").currentSeason) }));
  assert.deepEqual(view, { state: "plan-restricted", allowed: { from: 2022, to: 2024 } });
});

await check("empty ranking and rate limits are explicit, never filled in", API, async () => {
  routes = { "/players/topscorers?league&season": () => envelope([]), "/standings?league&season": () => envelope([]) };
  assert.equal((await loadPlayers(resolvePlayersQuery({ competition: "botola-pro", season: "2024" }))).state, "empty");
  routes["/players/topscorers?league&season"] = () => envelope([], { rateLimit: "Too many requests" });
  const limited = await loadPlayers(resolvePlayersQuery({ competition: "laliga", season: "2023" }));
  assert.equal(limited.state, "error");
  assert.equal(limited.retryable, true);
});

await check("appearance limits cover every players competition", {}, () => {
  for (const slug of PLAYER_COMPETITIONS) assert.ok(seasonMatchLimit(slug) > 0, slug);
  assert.equal(seasonMatchLimit("premier-league"), 38);
  assert.equal(seasonMatchLimit("bundesliga"), 34);
  assert.equal(seasonMatchLimit("unknown"), null);
});

console.log("Match reports");

const reportDir = mkdtempSync(join(tmpdir(), "matchpulse-reports-"));
const REPORT_ENV = { ...API, MATCHPULSE_STORAGE: "filesystem", MATCHPULSE_DATA_DIR: reportDir, MATCHPULSE_REPORTS_DIR: reportDir };
function finishedFixture(id, events, short = "FT", goals = [2, 1]) {
  return { ...fixtureEntry({ id, short, goals }), events, lineups: [], statistics: [] };
}
const goalEvent = (minute, team, player, detail = "Normal Goal") => ({ time: { elapsed: minute, extra: null }, team: { id: team, name: "" }, player: { id: 1, name: player }, assist: { id: null, name: null }, type: "Goal", detail });

await check("finished match page generates and stores a report from the details it already loads", REPORT_ENV, async () => {
  routes = feedRoutes({ "/fixtures?id": () => envelope([finishedFixture(424242, [goalEvent(10, 501, "H. One"), goalEvent(50, 502, "A. One"), goalEvent(80, 501, "H. Two")])]) });
  const view = await loadMatchDetails("424242");
  assert.equal(view.state, "ok");
  assert.equal(view.report?.headline, "Provider Home beat Provider Away 2–1");
  assert.equal(countOf("/fixtures?id"), 1, "no extra request for the report");
  assert.ok(readdirSync(reportDir).includes("424242.json"));
  const stored = await getStoredReport(424242);
  assert.equal(stored.fixtureId, 424242);
  assert.equal(stored.source, "API-Football");
});

await check("stored report is reused (no duplicate, no regeneration)", REPORT_ENV, async () => {
  const before = await getStoredReport(424242);
  const again = await saveReportOnce({ ...before, headline: "Different text" });
  assert.equal(again.headline, before.headline, "first copy kept");
  assert.equal(readdirSync(reportDir).filter((f) => f.startsWith("424242")).length, 1);
  assert.equal((await listStoredReports()).length, 1);
});

await check("inconsistent or unfinished matches get no report", REPORT_ENV, async () => {
  routes = feedRoutes({ "/fixtures?id": () => envelope([finishedFixture(424242, [])]) });
  // Different fixture: feed contains 424242 only, so reuse it with a fresh store.
  const freshDir = mkdtempSync(join(tmpdir(), "matchpulse-reports-"));
  process.env.MATCHPULSE_REPORTS_DIR = freshDir;
  process.env.MATCHPULSE_DATA_DIR = freshDir; // fresh shared cache too: each scenario must refetch
  const noEvents = await loadMatchDetails("424242");
  assert.equal(noEvents.report, null, "score 2–1 without goal events");
  const freshCache = () => (process.env.MATCHPULSE_DATA_DIR = mkdtempSync(join(tmpdir(), "matchpulse-cache-")));
  freshCache();
  routes["/fixtures?id"] = () => envelope([finishedFixture(424242, [goalEvent(10, 501, "H. One")])]);
  assert.equal((await loadMatchDetails("424242")).report, null, "goal events don't add up");
  freshCache();
  routes["/fixtures?id"] = () => envelope([finishedFixture(424242, [goalEvent(10, 501, "H. One")], "2H", [1, 0])]);
  assert.equal((await loadMatchDetails("424242")).report, null, "match still in play");
  assert.deepEqual(readdirSync(freshDir).filter((f) => f.endsWith(".json")), [], "no report stored");
  rmSync(freshDir, { recursive: true, force: true });
});

await check("store ignores corrupt or tampered files and re-validates crest URLs", REPORT_ENV, async () => {
  writeFileSync(join(reportDir, "999.json"), "{not json");
  writeFileSync(join(reportDir, "998.json"), JSON.stringify({ version: 1, fixtureId: 998, headline: "x" }));
  const good = await getStoredReport(424242);
  writeFileSync(join(reportDir, "997.json"), JSON.stringify({ ...good, fixtureId: 997, home: { ...good.home, logo: "https://evil.example/x.png" } }));
  assert.equal(await getStoredReport(999), null);
  assert.equal(await getStoredReport(998), null);
  assert.equal((await getStoredReport(997)).home.logo, null, "unsafe logo dropped");
  assert.equal(await getStoredReport(-1), null);
  // Only reports saved through the store are indexed and listed.
  assert.deepEqual((await listStoredReports()).map((r) => r.fixtureId), [424242]);
  rmSync(reportDir, { recursive: true, force: true });
});

await check("reports are indexable only with a real production domain", { MATCHPULSE_SITE_URL: "http://localhost:3000" }, () => {
  assert.equal(productionSiteConfigured(), false);
  for (const placeholder of ["https://www.example.com", "https://example.org", "https://matchpulse.test", "http://www.matchpulse-football.com", "https://127.0.0.1"]) {
    process.env.MATCHPULSE_SITE_URL = placeholder;
    assert.equal(productionSiteConfigured(), false, `${placeholder} is not a production domain`);
  }
  process.env.MATCHPULSE_SITE_URL = "https://www.matchpulse-football.com";
  assert.equal(productionSiteConfigured(), true);
});

console.log("Known-fixture index (used by the 404 proxy)");

await check("index answers known/unknown, and refuses to guess when missing or stale", { MATCHPULSE_STORAGE: "filesystem" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "matchpulse-data-"));
  process.env.MATCHPULSE_DATA_DIR = dir;
  resetFixtureIndexMemo();
  assert.equal(await isKnownFixture(1), null, "no index yet → let the page decide");
  const now = new Date("2026-10-22T12:00:00Z");
  await recordKnownFixtures([30, 10, 20, 10], now);
  assert.equal(await isKnownFixture(20, now.getTime()), true);
  assert.equal(await isKnownFixture(99, now.getTime()), false);
  assert.equal(await isKnownFixture(20, now.getTime() + INDEX_MAX_AGE_MS + 1), null, "stale index is not trusted");
  writeFileSync(join(dir, "known-fixtures.json"), "{broken");
  assert.equal(await isKnownFixture(20, now.getTime()), null, "unreadable index is not trusted");
  rmSync(dir, { recursive: true, force: true });
});

console.log("SEO settings");

await check("indexing is off unless explicitly enabled; site URL is validated", {}, () => {
  assert.equal(indexingAllowed(), false);
  assert.equal(siteUrl().toString(), "http://localhost:3000/");
  assert.deepEqual(pageMetadata({ title: "Matches", description: "d", path: "/matches" }).robots, { index: false, follow: true });
});

await check("indexing stays off with ALLOW_INDEXING but no real domain (unset, localhost or placeholder)", { MATCHPULSE_ALLOW_INDEXING: "true" }, () => {
  assert.equal(indexingAllowed(), false, "no site URL");
  for (const url of ["http://localhost:3000", "https://www.example.com"]) {
    process.env.MATCHPULSE_SITE_URL = url;
    assert.equal(indexingAllowed(), false, url);
    assert.deepEqual(pageMetadata({ title: "Matches", description: "d", path: "/matches" }).robots, { index: false, follow: true });
  }
});

await check("production settings: canonical, Open Graph image, sample pages stay noindex", { MATCHPULSE_ALLOW_INDEXING: "true", MATCHPULSE_SITE_URL: "https://www.matchpulse-football.com/some/path?x=1" }, () => {
  assert.equal(siteUrl().toString(), "https://www.matchpulse-football.com/", "origin only");
  const meta = pageMetadata({ title: "Matches", description: "d", path: "/matches" });
  assert.deepEqual(meta.robots, { index: true, follow: true });
  assert.equal(meta.alternates.canonical, "/matches");
  assert.equal(meta.openGraph.images[0].url, "/opengraph-image");
  assert.deepEqual(pageMetadata({ title: "Sample", description: "d", path: "/news/x", index: false }).robots, { index: false, follow: true });
});

console.log("Vercel Preview safeguards");

await check("Preview deployments never use real API-Football data unless explicitly allowed", { MATCHPULSE_DATA_SOURCE: "api-football", API_FOOTBALL_KEY: "test-key" }, async () => {
  const { isLiveDataEnabled } = await import("@/lib/api-football/server");
  assert.equal(isLiveDataEnabled(), true, "local / production");
  process.env.VERCEL_ENV = "production";
  assert.equal(isLiveDataEnabled(), true);
  for (const kind of ["preview", "development"]) {
    process.env.VERCEL_ENV = kind;
    assert.equal(isLiveDataEnabled(), false, `${kind}: key present but no API requests`);
  }
  process.env.VERCEL_ENV = "preview";
  process.env.MATCHPULSE_PREVIEW_LIVE_DATA = "true";
  assert.equal(isLiveDataEnabled(), true, "explicit opt-in");
  delete process.env.MATCHPULSE_PREVIEW_LIVE_DATA;
});

await check("Preview deployments are never indexed, whatever the variables say", { MATCHPULSE_ALLOW_INDEXING: "true", MATCHPULSE_SITE_URL: "https://www.matchpulse-football.com", VERCEL_ENV: "preview" }, () => {
  assert.equal(indexingAllowed(), false);
  assert.deepEqual(pageMetadata({ title: "Matches", description: "d", path: "/matches" }).robots, { index: false, follow: true });
  process.env.VERCEL_ENV = "production";
  assert.equal(indexingAllowed(), true);
});

await check("invalid site URLs fall back to localhost", { MATCHPULSE_SITE_URL: "javascript:alert(1)" }, () => {
  assert.equal(siteUrl().toString(), "http://localhost:3000/");
});

console.log(`\n${passed} page-data checks passed (mocked fetch, no network)`);
