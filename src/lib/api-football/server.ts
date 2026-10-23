import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { COMPETITION_COUNTRIES, resolveCompetitions, type CompetitionResolution } from "./competitions";
import { sharedResult } from "./shared-cache";
import { liveDataAllowedInThisDeployment } from "@/lib/deployment";
import {
  apiFootballRequest,
  ApiFootballError,
  DEFAULT_TIMEOUT_MS,
  describeError,
  parseFixtureDetails,
  parseFixtures,
  parseLeagues,
  parsePlayerStatLines,
  parseStandings,
  statusGroup,
  type ApiFootballErrorKind,
  type Fixture,
  type FixtureDetails,
  type LeagueEntry,
  type PlayerStatLine,
  type Quota,
  type Standings,
} from "./core";

// ---- Configuration ------------------------------------------------------
// Read on the server only. The key is never passed to Client Components and
// must not use a NEXT_PUBLIC_ prefix.

function positiveInt(raw: string | undefined, fallback: number, min: number) {
  const value = Number(raw);
  return Number.isInteger(value) && value >= min ? value : fallback;
}

/**
 * Optional base-URL override for local mock servers. Only localhost or an
 * api-sports.io host is accepted, so a misconfiguration cannot send the key
 * to an arbitrary host.
 */
function baseUrl(): string | undefined {
  const raw = process.env.API_FOOTBALL_BASE_URL?.trim();
  if (!raw) return undefined;
  try {
    const { hostname, protocol } = new URL(raw);
    const local = hostname === "localhost" || hostname === "127.0.0.1";
    if ((local && protocol === "http:") || (protocol === "https:" && hostname.endsWith(".api-sports.io"))) return raw;
  } catch {}
  console.warn("[api-football] Ignoring API_FOOTBALL_BASE_URL: only localhost or *.api-sports.io is allowed.");
  return undefined;
}

function requestOptions() {
  return {
    apiKey: process.env.API_FOOTBALL_KEY,
    baseUrl: baseUrl(),
    timeoutMs: positiveInt(process.env.API_FOOTBALL_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1000),
  };
}

/**
 * Revalidation windows in seconds. Defaults keep steady traffic within the
 * free plan's 100 requests/day (see README "API-Football").
 */
export function revalidateSeconds() {
  return {
    today: positiveInt(process.env.API_FOOTBALL_REVALIDATE_TODAY_SECONDS, 1200, 30),
    live: positiveInt(process.env.API_FOOTBALL_REVALIDATE_LIVE_SECONDS, 120, 30),
  };
}

export function isApiFootballConfigured(): boolean {
  return Boolean(process.env.API_FOOTBALL_KEY?.trim());
}

/** Real data is used only when explicitly enabled and a key is present. */
/** Real data: requested, a key is set, and this is not a Vercel Preview (see src/lib/deployment.ts). */
export function isLiveDataEnabled(): boolean {
  return process.env.MATCHPULSE_DATA_SOURCE === "api-football" && isApiFootballConfigured() && liveDataAllowedInThisDeployment();
}

function warnIfQuotaLow(path: string, quota: Quota) {
  if (quota.dailyRemaining !== null && quota.dailyRemaining <= 10) {
    console.warn(`[api-football] ${path}: ${quota.dailyRemaining} requests left today.`);
  }
}

function logInvalid(path: string, invalid: number) {
  if (invalid > 0) console.warn(`[api-football] ${path}: skipped ${invalid} entries that failed validation.`);
}

// ---- Cached results ---------------------------------------------------------
// Errors thrown inside a "use cache" scope reach callers sanitised in
// production, so cached functions return a result instead and choose their
// own lifetime: successes use the profile for that data, failures are kept
// only briefly (longer for rate limits, so a limited site stops calling the
// API). Exported wrappers re-throw typed errors outside the cache scope.

type Result<T> = { ok: true; value: T } | { ok: false; error: { kind: ApiFootballErrorKind | "unknown"; message: string } };

async function attempt<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error: describeError(error) };
  }
}

/**
 * Call inside a "use cache" scope after a failed request. Failures are kept
 * just long enough not to waste requests: a per-minute limit clears quickly,
 * an exhausted daily quota or a plan restriction will not change soon.
 */
function cacheFailure(kind: string) {
  if (kind === "plan_restricted") cacheLife("days");
  else if (kind === "quota_exhausted") cacheLife({ stale: 30, revalidate: 900, expire: 1800 });
  else cacheLife({ stale: 30, revalidate: 60, expire: 120 });
}

// ---- Shared cache (across instances) -----------------------------------------
// Each cached function below also goes through sharedResult(), so results and
// failures are reused across serverless instances and restarts (Redis when
// deployed, local files otherwise), with the same lifetimes as above.

const HOUR = 3600;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Shared lifetime of a failure, matching cacheFailure(). */
function failureTtl(kind: string): number {
  if (kind === "plan_restricted") return DAY;
  if (kind === "quota_exhausted") return 900;
  return 60;
}

const ERROR_KINDS = new Set<string>([
  "missing_key",
  "unauthorized",
  "rate_limited",
  "quota_exhausted",
  "plan_restricted",
  "timeout",
  "network",
  "http",
  "api",
  "invalid_response",
  "unknown",
]);

async function shared<T>(key: string, run: () => Promise<Result<T>>, ttl: (value: T) => number): Promise<Result<T>> {
  const result = await sharedResult<T>(key, run, (entry) => (entry.ok ? ttl(entry.value) : failureTtl(entry.error.kind)));
  if (result.ok) return result;
  const kind = (ERROR_KINDS.has(result.error.kind) ? result.error.kind : "unknown") as ApiFootballErrorKind | "unknown";
  return { ok: false, error: { kind, message: result.error.message } };
}

/** Today's refresh window: configured while live or within ±3h of kickoff, else at most hourly. */
function todayRefreshSeconds(value: FixturesResult): number {
  const { today } = revalidateSeconds();
  const fetchedMs = Date.parse(value.fetchedAt);
  const active = value.fixtures.some((fixture) => {
    const group = statusGroup(fixture.status.short);
    if (group === "live") return true;
    return group === "upcoming" && Math.abs(Date.parse(fixture.kickoff) - fetchedMs) <= 3 * 3600e3;
  });
  return active ? today : Math.max(today, 3600);
}

function unwrap<T>(result: Result<T>): T {
  if (result.ok) return result.value;
  const kind = result.error.kind === "unknown" ? "api" : result.error.kind;
  throw new ApiFootballError(kind, result.error.message);
}

// ---- Competitions -------------------------------------------------------

async function cachedLeaguesForCountry(country: string): Promise<Result<LeagueEntry[]>> {
  "use cache";
  cacheTag("api-football", "api-football:leagues");
  const result = await shared(
    `leagues:${country}`,
    () =>
      attempt(async () => {
        const envelope = await apiFootballRequest("/leagues", { country }, requestOptions());
        warnIfQuotaLow("/leagues", envelope.quota);
        const parsed = parseLeagues(envelope.response);
        logInvalid("/leagues", parsed.invalid);
        return parsed.items;
      }),
    () => WEEK,
  );
  if (result.ok) cacheLife("weeks");
  else cacheFailure(result.error.kind);
  return result;
}

/**
 * Resolves supported competitions (IDs, current season, coverage) from the
 * API. Each country lookup is cached for a week; a failed country leaves its
 * competitions unresolved without affecting the others.
 */
export async function getSupportedCompetitions(): Promise<CompetitionResolution> {
  const results = await Promise.all(COMPETITION_COUNTRIES.map((country) => cachedLeaguesForCountry(country)));
  const entriesByCountry: Record<string, LeagueEntry[]> = {};
  let firstFailure: Result<never> | null = null;
  results.forEach((result, index) => {
    if (result.ok) entriesByCountry[COMPETITION_COUNTRIES[index]] = result.value;
    else {
      firstFailure ??= result;
      console.error(`[api-football] /leagues ${COMPETITION_COUNTRIES[index]} failed (${result.error.kind}): ${result.error.message}`);
    }
  });
  if (Object.keys(entriesByCountry).length === 0) unwrap(firstFailure ?? { ok: false, error: { kind: "api", message: "No competition data." } });
  return resolveCompetitions(entriesByCountry);
}

// ---- Fixtures -------------------------------------------------------------

export interface FixturesResult {
  fixtures: Fixture[];
  fetchedAt: string;
  /** Seconds until this result is refreshed (set for today's fixtures). */
  refreshSeconds?: number;
  /** True when the API reported more pages than were read. */
  truncated: boolean;
}

async function cachedFixturesByDate(
  date: string,
  freshness: "past" | "today" | "future",
  leagueIds: number[],
): Promise<Result<FixturesResult>> {
  "use cache";
  cacheTag("api-football", `api-football:fixtures:${date}`);
  const result = await shared<FixturesResult>(
    `fixtures:${date}:${freshness}:${[...leagueIds].sort((a, b) => a - b).join(",")}`,
    async () => {
      const fetched = await attempt<FixturesResult>(async () => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiFootballError("api", `Invalid date "${date}".`);
        const envelope = await apiFootballRequest("/fixtures", { date, timezone: "UTC" }, requestOptions());
        warnIfQuotaLow("/fixtures", envelope.quota);
        const parsed = parseFixtures(envelope.response);
        logInvalid("/fixtures", parsed.invalid);
        const wanted = new Set(leagueIds);
        return {
          fixtures: parsed.items.filter((fixture) => wanted.has(fixture.league.id)),
          fetchedAt: new Date().toISOString(),
          truncated: (envelope.paging?.total ?? 1) > 1,
        };
      });
      // Decided once at fetch time so both cache layers use the same window.
      if (fetched.ok && freshness === "today") fetched.value.refreshSeconds = todayRefreshSeconds(fetched.value);
      return fetched;
    },
    (value) => (freshness === "today" ? (value.refreshSeconds ?? revalidateSeconds().today) : freshness === "past" ? DAY : 6 * HOUR),
  );
  if (!result.ok) cacheFailure(result.error.kind);
  else if (freshness === "today") {
    // Configured window while a match is live or within ±3h of kickoff;
    // otherwise at most hourly. Never more frequent than configured.
    const revalidate = result.value.refreshSeconds ?? todayRefreshSeconds(result.value);
    result.value.refreshSeconds = revalidate;
    cacheLife({ stale: 30, revalidate, expire: Math.max(revalidate * 3, 3600) });
  } else if (freshness === "past") cacheLife("days");
  else cacheLife({ stale: 300, revalidate: 6 * 3600, expire: 24 * 3600 });
  return result;
}

/**
 * Fixtures on a UTC calendar date, limited to `leagueIds`.
 * `freshness` sets the cache lifetime: today's results change while matches
 * are played; past dates rarely change; future dates change occasionally.
 */
export async function getFixturesByDate(
  date: string,
  freshness: "past" | "today" | "future",
  leagueIds: number[],
): Promise<FixturesResult> {
  return unwrap(await cachedFixturesByDate(date, freshness, leagueIds));
}

async function cachedLiveFixtures(leagueIds: number[]): Promise<Result<FixturesResult>> {
  "use cache";
  cacheTag("api-football", "api-football:live");
  const live = [...leagueIds].sort((a, b) => a - b).join("-");
  const result = await shared<FixturesResult>(
    `live:${live}`,
    () =>
      attempt(async () => {
        if (leagueIds.length === 0) return { fixtures: [], fetchedAt: new Date().toISOString(), truncated: false };
        const envelope = await apiFootballRequest("/fixtures", { live }, requestOptions());
        warnIfQuotaLow("/fixtures?live", envelope.quota);
        const parsed = parseFixtures(envelope.response);
        logInvalid("/fixtures?live", parsed.invalid);
        return { fixtures: parsed.items, fetchedAt: new Date().toISOString(), truncated: (envelope.paging?.total ?? 1) > 1 };
      }),
    () => revalidateSeconds().live,
  );
  if (result.ok) {
    const { live } = revalidateSeconds();
    cacheLife({ stale: 30, revalidate: live, expire: Math.max(live * 5, 600) });
  } else cacheFailure(result.error.kind);
  return result;
}

/** Fixtures currently in play in the given leagues. */
export async function getLiveFixtures(leagueIds: number[]): Promise<FixturesResult> {
  return unwrap(await cachedLiveFixtures(leagueIds));
}

export interface FixtureDetailsResult {
  details: FixtureDetails | null;
  fetchedAt: string;
}

async function cachedFixtureDetails(fixtureId: number): Promise<Result<FixtureDetailsResult>> {
  "use cache";
  cacheTag("api-football", `api-football:fixture:${fixtureId}`);
  const result = await shared<FixtureDetailsResult>(
    `fixture:${fixtureId}`,
    () =>
      attempt(async () => {
        const envelope = await apiFootballRequest("/fixtures", { id: fixtureId }, requestOptions());
        warnIfQuotaLow("/fixtures?id", envelope.quota);
        const details = envelope.response.length ? parseFixtureDetails(envelope.response[0]) : null;
        if (envelope.response.length && !details) logInvalid("/fixtures?id", 1);
        return { details, fetchedAt: new Date().toISOString() };
      }),
    (value) => {
      const group = value.details ? statusGroup(value.details.status.short) : null;
      return group === "live" ? revalidateSeconds().live : group === "finished" ? DAY : HOUR;
    },
  );
  if (!result.ok) cacheFailure(result.error.kind);
  else {
    const group = result.value.details ? statusGroup(result.value.details.status.short) : null;
    if (group === "live") {
      const { live } = revalidateSeconds();
      cacheLife({ stale: 30, revalidate: live, expire: Math.max(live * 5, 600) });
    } else if (group === "finished") cacheLife("days");
    else cacheLife("hours");
  }
  return result;
}

/**
 * One fixture with events, lineups and statistics (details is null when the
 * API returns nothing). Lifetime follows the status: live matches refresh
 * with the live window, finished ones daily.
 */
export async function getFixtureDetails(fixtureId: number): Promise<FixtureDetailsResult> {
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) return { details: null, fetchedAt: new Date(0).toISOString() };
  return unwrap(await cachedFixtureDetails(fixtureId));
}

// ---- Standings ------------------------------------------------------------

export interface StandingsResult {
  standings: Standings | null;
  fetchedAt: string;
}

async function cachedStandings(leagueId: number, season: number, seasonFinished: boolean): Promise<Result<StandingsResult>> {
  "use cache";
  cacheTag("api-football", `api-football:standings:${leagueId}:${season}`);
  const result = await shared<StandingsResult>(
    `standings:${leagueId}:${season}`,
    () =>
      attempt(async () => {
        const envelope = await apiFootballRequest("/standings", { league: leagueId, season }, requestOptions());
        warnIfQuotaLow("/standings", envelope.quota);
        const standings = parseStandings(envelope.response);
        if (standings) logInvalid("/standings", standings.invalidRows);
        return { standings, fetchedAt: new Date().toISOString() };
      }),
    () => (seasonFinished ? WEEK : HOUR),
  );
  // A finished season's final table no longer changes.
  if (result.ok && seasonFinished) cacheLife("weeks");
  else if (result.ok) cacheLife("hours");
  else cacheFailure(result.error.kind);
  return result;
}

/** Standings for a resolved league and season (one cached request). */
export async function getLeagueStandings(leagueId: number, season: number, seasonFinished = false): Promise<StandingsResult> {
  return unwrap(await cachedStandings(leagueId, season, seasonFinished));
}

/**
 * Standings for a supported competition. Uses the season the API marks as
 * current unless `season` is given. Returns null when the competition is not
 * resolved or the API reports no standings coverage for that season.
 */
export async function getStandings(slug: string, season?: number): Promise<Standings | null> {
  const { resolved } = await getSupportedCompetitions();
  const competition = resolved.find((item) => item.slug === slug);
  if (!competition) return null;
  const year = season ?? competition.currentSeason?.year;
  if (year === undefined) return null;
  if (season === undefined && competition.currentSeason?.coverage.standings === false) return null;
  return (await getLeagueStandings(competition.leagueId, year)).standings;
}

// ---- Player rankings ---------------------------------------------------------

export type PlayerRanking = "scorers" | "assists";

const RANKING_PATH: Record<PlayerRanking, string> = {
  scorers: "/players/topscorers",
  assists: "/players/topassists",
};

export interface TopPlayersResult {
  players: PlayerStatLine[];
  fetchedAt: string;
}

async function cachedTopPlayers(
  ranking: PlayerRanking,
  leagueId: number,
  season: number,
  seasonFinished: boolean,
): Promise<Result<TopPlayersResult>> {
  "use cache";
  cacheTag("api-football", `api-football:players:${ranking}:${leagueId}:${season}`);
  const result = await shared<TopPlayersResult>(
    `players:${ranking}:${leagueId}:${season}`,
    () =>
      attempt(async () => {
        const envelope = await apiFootballRequest(RANKING_PATH[ranking], { league: leagueId, season }, requestOptions());
        warnIfQuotaLow(RANKING_PATH[ranking], envelope.quota);
        const parsed = parsePlayerStatLines(envelope.response, leagueId);
        logInvalid(RANKING_PATH[ranking], parsed.invalid);
        return { players: parsed.items, fetchedAt: new Date().toISOString() };
      }),
    () => (seasonFinished ? WEEK : 6 * HOUR),
  );
  if (!result.ok) cacheFailure(result.error.kind);
  // A finished season's rankings no longer change.
  else if (seasonFinished) cacheLife("weeks");
  else cacheLife({ stale: 300, revalidate: 6 * 3600, expire: 24 * 3600 });
  return result;
}

/** Top scorers or assist providers for a league season (one cached request). */
export async function getTopPlayers(
  ranking: PlayerRanking,
  leagueId: number,
  season: number,
  seasonFinished: boolean,
): Promise<TopPlayersResult> {
  return unwrap(await cachedTopPlayers(ranking, leagueId, season, seasonFinished));
}
