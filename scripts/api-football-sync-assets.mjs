// Fetches real competition logos and featured-club crests from API-Football
// and writes them to src/data/api-assets.json (a persistent, regenerable
// cache: pages read it at build time, so logos cost no runtime requests).
//
//   npm run api:sync-assets            # ~9 requests, paced under 10/minute
//   npm run api:sync-assets -- --dry-run
//
// Requests: GET /leagues (whole catalogue, 1 request) + GET /teams for each
// league that holds a featured club. The key is never printed.
import { writeFileSync } from "node:fs";
import { CLUB_ASSET_SPECS, LEAGUE_ASSET_SPECS, matchLeague, matchTeam } from "../src/lib/api-football/asset-specs.ts";
import { apiFootballRequest, describeError, parseLeagues, parseTeams, planSeasonRange } from "../src/lib/api-football/core.ts";

const OUT = new URL("../src/data/api-assets.json", import.meta.url);
const PACE_MS = 7000; // keeps well under the free plan's 10 requests/minute
const apiKey = process.env.API_FOOTBALL_KEY?.trim();
const options = { apiKey, timeoutMs: 30_000 };
const dryRun = process.argv.includes("--dry-run");

const teamLeagues = [...new Set(CLUB_ASSET_SPECS.map((spec) => spec.leagueSlug))];
console.log("MatchPulse · sync API-Football assets\n");
console.log(`API_FOOTBALL_KEY: ${apiKey ? `set (${apiKey.length} characters, value hidden)` : "NOT SET"}`);
console.log(`Requests: 1 × /leagues, up to ${teamLeagues.length + 1} × /teams (paced ${PACE_MS / 1000}s apart)\n`);
if (!apiKey) process.exit(1);
if (dryRun) {
  console.log(`Dry run: would match ${LEAGUE_ASSET_SPECS.length} competitions and ${CLUB_ASSET_SPECS.length} clubs. No requests made.`);
  process.exit(0);
}

let requests = 0;
let lastQuota = null;
async function request(path, params) {
  if (requests > 0) await new Promise((resolve) => setTimeout(resolve, PACE_MS));
  requests += 1;
  const envelope = await apiFootballRequest(path, params, options);
  lastQuota = envelope.quota;
  return envelope;
}

// 1. Competitions (one catalogue request).
const catalogue = await request("/leagues", {});
const parsedLeagues = parseLeagues(catalogue.response);
console.log(`/leagues: ${parsedLeagues.items.length} competitions (${parsedLeagues.invalid} invalid entries skipped)`);
if (catalogue.paging && catalogue.paging.total > 1) console.log("  warning: catalogue is paged; only page 1 was read");

const leagues = {};
const unresolvedLeagues = [];
for (const spec of LEAGUE_ASSET_SPECS) {
  const entry = matchLeague(parsedLeagues.items, spec);
  if (!entry) {
    unresolvedLeagues.push(spec.slug);
    continue;
  }
  const years = [...new Set(entry.seasons.map((season) => season.year))].sort((a, b) => b - a);
  leagues[spec.slug] = {
    id: entry.id,
    name: entry.name,
    logo: entry.logo,
    currentSeason: entry.seasons.find((season) => season.current)?.year ?? null,
    seasons: years.slice(0, 8),
  };
}
console.log(`  matched ${Object.keys(leagues).length}/${LEAGUE_ASSET_SPECS.length}; logos: ${Object.values(leagues).filter((l) => l.logo).length}`);
if (unresolvedLeagues.length) console.log(`  unresolved (neutral fallback): ${unresolvedLeagues.join(", ")}`);

// 2. Club crests. Try the current season once; if the plan restricts it,
//    use the latest season the provider says is available.
let plan = null;
let teamSeason = leagues["premier-league"]?.currentSeason ?? null;
const clubs = {};
const unresolvedClubs = [];

async function teamsFor(slug) {
  const league = leagues[slug];
  if (!league || teamSeason === null) return null;
  try {
    return parseTeams((await request("/teams", { league: league.id, season: teamSeason })).response).items;
  } catch (error) {
    const { kind, message } = describeError(error);
    const range = kind === "plan_restricted" ? planSeasonRange(message) : null;
    if (range && plan === null) {
      plan = { seasonFrom: range.from, seasonTo: range.to, observedAt: new Date().toISOString() };
      teamSeason = Math.min(range.to, teamSeason);
      console.log(`  plan allows seasons ${range.from}–${range.to}; using ${teamSeason} for team lists`);
      return teamsFor(slug);
    }
    console.log(`  /teams ${slug} failed (${kind})`);
    if (kind === "rate_limited" || kind === "quota_exhausted" || kind === "unauthorized") throw error;
    return null;
  }
}

for (const slug of teamLeagues) {
  const teams = await teamsFor(slug);
  for (const spec of CLUB_ASSET_SPECS.filter((item) => item.leagueSlug === slug)) {
    const team = teams ? matchTeam(teams, spec) : null;
    if (team?.logo) clubs[spec.clubId] = { teamId: team.id, name: team.name, logo: team.logo };
    else unresolvedClubs.push(spec.clubId);
  }
}
console.log(`/teams: crests for ${Object.keys(clubs).length}/${CLUB_ASSET_SPECS.length} featured clubs`);
if (unresolvedClubs.length) console.log(`  unresolved (placeholder kept): ${unresolvedClubs.join(", ")}`);

const output = {
  source: "API-Football",
  generatedAt: new Date().toISOString(),
  teamSeason,
  plan,
  leagues,
  clubs,
  unresolved: { leagues: unresolvedLeagues, clubs: unresolvedClubs },
};
writeFileSync(OUT, JSON.stringify(output, null, 2) + "\n");
console.log(`\nWrote src/data/api-assets.json · requests made: ${requests}`);
if (lastQuota?.dailyRemaining != null) console.log(`Requests remaining today: ${lastQuota.dailyRemaining}${lastQuota.dailyLimit != null ? ` of ${lastQuota.dailyLimit}` : ""}`);
