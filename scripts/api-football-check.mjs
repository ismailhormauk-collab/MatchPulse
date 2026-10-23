// API-Football diagnostic: verifies the key and reports which supported
// competitions resolve, their IDs and current-season coverage.
//
//   npm run api:check                  # /status + one /leagues call per country (8 requests)
//   npm run api:check -- --dry-run     # no network; shows what would be called
//   npm run api:check -- --probe-standings   # also 1 /standings call per competition
//
// The key is read from .env.local (or the environment) and is never printed.
import {
  apiFootballRequest,
  describeError,
  fetchAccountStatus,
  parseLeagues,
} from "../src/lib/api-football/core.ts";
import { COMPETITION_COUNTRIES, resolveCompetitions, SUPPORTED_COMPETITIONS } from "../src/lib/api-football/competitions.ts";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const probeStandings = args.has("--probe-standings");
const apiKey = process.env.API_FOOTBALL_KEY?.trim();
const options = { apiKey, timeoutMs: 10_000 };

const yesNo = (value) => (value === true ? "yes" : value === false ? "no" : "?");

console.log("MatchPulse · API-Football diagnostic\n");
console.log(`API_FOOTBALL_KEY: ${apiKey ? `set (${apiKey.length} characters, value hidden)` : "NOT SET"}`);
console.log(`MATCHPULSE_DATA_SOURCE: ${process.env.MATCHPULSE_DATA_SOURCE ?? "(unset → sample data)"}`);

const planned = 1 + COMPETITION_COUNTRIES.length + (probeStandings ? SUPPORTED_COMPETITIONS.length : 0);
console.log(`Requests this run: up to ${planned} (/status, /leagues × ${COMPETITION_COUNTRIES.length}${probeStandings ? `, /standings × ${SUPPORTED_COMPETITIONS.length}` : ""})\n`);

if (!apiKey) {
  console.log("Add API_FOOTBALL_KEY to .env.local (see .env.example). No requests were made.");
  process.exit(1);
}
if (dryRun) {
  console.log(`Dry run: would query countries ${COMPETITION_COUNTRIES.join(", ")}. No requests were made.`);
  process.exit(0);
}

// 1. Account
try {
  const status = await fetchAccountStatus(options);
  console.log(`Account: plan ${status.plan ?? "?"}, active ${yesNo(status.active)}, requests today ${status.requestsToday ?? "?"} / ${status.requestLimitPerDay ?? "?"}`);
} catch (error) {
  const { kind, message } = describeError(error);
  console.log(`Account check failed (${kind}): ${message}`);
  if (kind === "unauthorized" || kind === "missing_key") process.exit(1);
}

// 2. Competitions
const entriesByCountry = {};
let lastQuota = null;
for (const country of COMPETITION_COUNTRIES) {
  try {
    const envelope = await apiFootballRequest("/leagues", { country }, options);
    lastQuota = envelope.quota;
    const parsed = parseLeagues(envelope.response);
    entriesByCountry[country] = parsed.items;
    if (parsed.invalid) console.log(`  /leagues ${country}: ${parsed.invalid} entries failed validation`);
  } catch (error) {
    const { kind, message } = describeError(error);
    console.log(`  /leagues ${country} failed (${kind}): ${message}`);
    if (kind === "rate_limited" || kind === "quota_exhausted" || kind === "unauthorized") break;
  }
}

const { resolved, unresolved } = resolveCompetitions(entriesByCountry);
console.log("\nResolved competitions");
if (resolved.length === 0) console.log("  (none)");
for (const item of resolved) {
  const season = item.currentSeason;
  const seasonText = season
    ? `current season ${season.year} (${season.start ?? "?"} → ${season.end ?? "?"})`
    : `no current season (latest ${item.latestSeason?.year ?? "none"})`;
  const coverage = season
    ? `events ${yesNo(season.coverage.fixtureEvents)}, lineups ${yesNo(season.coverage.lineups)}, standings ${yesNo(season.coverage.standings)}`
    : "";
  console.log(`  ✓ ${item.label.padEnd(24)} id ${String(item.leagueId).padEnd(5)} "${item.apiName}" · ${seasonText}${coverage ? ` · ${coverage}` : ""}`);
}
if (unresolved.length) {
  console.log("\nUnresolved (update names in src/lib/api-football/competitions.ts if needed)");
  for (const item of unresolved) {
    const candidates = item.candidates.map((c) => `${c.id} "${c.name}" (${c.type})`).join(", ");
    console.log(`  ✗ ${item.label}: ${item.reason}${candidates ? ` Candidates: ${candidates}` : ""}`);
  }
}

// 3. Optional: confirm the plan can read current-season standings.
if (probeStandings) {
  console.log("\nStandings access (current season)");
  for (const item of resolved) {
    if (!item.currentSeason) {
      console.log(`  - ${item.label}: skipped (no current season)`);
      continue;
    }
    try {
      const envelope = await apiFootballRequest("/standings", { league: item.leagueId, season: item.currentSeason.year }, options);
      lastQuota = envelope.quota;
      console.log(`  ✓ ${item.label}: ${envelope.response.length ? "available" : "empty response"}`);
    } catch (error) {
      const { kind, message } = describeError(error);
      console.log(`  ✗ ${item.label} (${kind}): ${message}`);
      if (kind === "rate_limited" || kind === "quota_exhausted") break;
    }
  }
}

if (lastQuota?.dailyRemaining !== null && lastQuota?.dailyRemaining !== undefined) {
  console.log(`\nRequests remaining today: ${lastQuota.dailyRemaining}${lastQuota.dailyLimit !== null ? ` of ${lastQuota.dailyLimit}` : ""}`);
}
process.exit(unresolved.length ? 2 : 0);
