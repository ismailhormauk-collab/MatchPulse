// API-Football (API-Sports v3) HTTP client, error classification and response
// validation.
//
// This module is deliberately framework-free with no runtime imports so it can
// be used by server code (via ./server.ts) and by Node scripts in scripts/.
// It never reads environment variables itself: callers pass the key in.
// Never import it from a Client Component; ./server.ts is the app entry point.
//
// Response shapes follow the public API-Football v3 documentation. Validators
// only read the fields MatchPulse needs, reject entries whose required fields
// have the wrong type, and leave everything else alone.

export const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";
export const DEFAULT_TIMEOUT_MS = 8_000;

// ---- Errors ---------------------------------------------------------------

export type ApiFootballErrorKind =
  | "missing_key"
  | "unauthorized"
  /** Per-minute limit (errors.rateLimit or HTTP 429): clears within a minute. */
  | "rate_limited"
  /** Daily request quota used up (errors.requests): clears at the daily reset. */
  | "quota_exhausted"
  | "plan_restricted"
  | "timeout"
  | "network"
  | "http"
  | "api"
  | "invalid_response";

export class ApiFootballError extends Error {
  readonly kind: ApiFootballErrorKind;
  readonly status?: number;

  constructor(kind: ApiFootballErrorKind, message: string, status?: number) {
    super(message);
    this.name = "ApiFootballError";
    this.kind = kind;
    this.status = status;
  }
}

/** Plain, serialisable summary of any thrown value (never includes the key). */
export function describeError(error: unknown): { kind: ApiFootballErrorKind | "unknown"; message: string } {
  if (error instanceof ApiFootballError) return { kind: error.kind, message: error.message };
  return { kind: "unknown", message: error instanceof Error ? error.message : String(error) };
}

// ---- Request --------------------------------------------------------------

export interface Quota {
  /** Requests left today, from x-ratelimit-requests-remaining. */
  dailyRemaining: number | null;
  dailyLimit: number | null;
  /** Requests left this minute, from X-RateLimit-Remaining. */
  minuteRemaining: number | null;
  minuteLimit: number | null;
}

export interface ApiEnvelope {
  response: unknown[];
  results: number | null;
  paging: { current: number; total: number } | null;
  quota: Quota;
}

export interface RequestOptions {
  apiKey: string | undefined;
  baseUrl?: string;
  timeoutMs?: number;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

type Params = Record<string, string | number | undefined>;

function headerNumber(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readQuota(headers: Headers): Quota {
  return {
    dailyRemaining: headerNumber(headers, "x-ratelimit-requests-remaining"),
    dailyLimit: headerNumber(headers, "x-ratelimit-requests-limit"),
    minuteRemaining: headerNumber(headers, "x-ratelimit-remaining"),
    minuteLimit: headerNumber(headers, "x-ratelimit-limit"),
  };
}

/**
 * API-Football reports many failures with HTTP 200 and a non-empty `errors`
 * field (an object keyed by topic, or an array). Keys seen in the docs include
 * `token` (bad key), `requests` (daily quota), `rateLimit` (per-minute) and
 * `plan` (season/feature not in the subscription).
 */
function classifyApiErrors(errors: unknown, status: number): ApiFootballError | null {
  if (!errors) return null;
  const entries: [string, string][] = Array.isArray(errors)
    ? errors.map((value, index) => [String(index), typeof value === "string" ? value : JSON.stringify(value)])
    : typeof errors === "object"
      ? Object.entries(errors as Record<string, unknown>).map(([key, value]) => [
          key,
          typeof value === "string" ? value : JSON.stringify(value),
        ])
      : [];
  if (entries.length === 0) return null;

  const message = entries.map(([key, value]) => `${key}: ${value}`).join("; ");
  const keys = entries.map(([key]) => key.toLowerCase());
  if (keys.includes("token")) return new ApiFootballError("unauthorized", message, status);
  if (keys.includes("requests")) return new ApiFootballError("quota_exhausted", message, status);
  if (keys.includes("ratelimit")) return new ApiFootballError("rate_limited", message, status);
  if (keys.includes("plan")) return new ApiFootballError("plan_restricted", message, status);
  return new ApiFootballError("api", message, status);
}

/** Performs one GET request. Never retries, to protect the request quota. */
export async function apiFootballRequest(path: string, params: Params, options: RequestOptions): Promise<ApiEnvelope> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) throw new ApiFootballError("missing_key", "API_FOOTBALL_KEY is not set.");

  const url = new URL(path, options.baseUrl ?? API_FOOTBALL_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      // The key travels only in this header; it is never part of the URL or any message.
      headers: { "x-apisports-key": apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new ApiFootballError("timeout", `Request to ${url.pathname} timed out.`);
    }
    throw new ApiFootballError("network", `Network error calling ${url.pathname}.`);
  }

  if (res.status === 429) throw new ApiFootballError("rate_limited", "Rate limit exceeded (HTTP 429).", 429);
  if (res.status === 401 || res.status === 403) {
    throw new ApiFootballError("unauthorized", `Request rejected (HTTP ${res.status}).`, res.status);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiFootballError(res.ok ? "invalid_response" : "http", `Non-JSON response (HTTP ${res.status}).`, res.status);
  }

  const record = isRecord(body) ? body : null;
  const apiError = classifyApiErrors(record?.errors, res.status);
  if (apiError) throw apiError;
  if (!res.ok) throw new ApiFootballError("http", `Unexpected HTTP ${res.status}.`, res.status);
  if (!record || !Array.isArray(record.response)) {
    throw new ApiFootballError("invalid_response", `Response from ${url.pathname} has no "response" array.`, res.status);
  }

  const paging = isRecord(record.paging) ? record.paging : null;
  return {
    response: record.response,
    results: typeof record.results === "number" ? record.results : null,
    paging:
      paging && typeof paging.current === "number" && typeof paging.total === "number"
        ? { current: paging.current, total: paging.total }
        : null,
    quota: readQuota(res.headers),
  };
}

// ---- Validation helpers -------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** Validates each entry; invalid entries are dropped and counted. */
export interface Parsed<T> {
  items: T[];
  invalid: number;
}

function parseList<T>(entries: unknown[], parse: (entry: unknown) => T | null): Parsed<T> {
  const items: T[] = [];
  let invalid = 0;
  for (const entry of entries) {
    const item = parse(entry);
    if (item) items.push(item);
    else invalid += 1;
  }
  return { items, invalid };
}

/**
 * Accepts only HTTPS image URLs on API-Sports' media hosts (the hosts allowed
 * in next.config `images.remotePatterns`); anything else is dropped so the UI
 * shows a neutral fallback instead of an arbitrary or wrong image.
 */
export function safeLogoUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 300) return null;
  try {
    const url = new URL(value);
    const hostOk = url.hostname === "api-sports.io" || url.hostname.endsWith(".api-sports.io");
    if (url.protocol !== "https:" || !hostOk || !url.pathname.startsWith("/football/") || url.search || url.username) return null;
    return url.href;
  } catch {
    return null;
  }
}

// ---- /leagues ---------------------------------------------------------------

export interface LeagueSeason {
  year: number;
  start: string | null;
  end: string | null;
  current: boolean;
  /** null means the API did not report that coverage flag. */
  coverage: {
    fixtureEvents: boolean | null;
    lineups: boolean | null;
    fixtureStatistics: boolean | null;
    standings: boolean | null;
  };
}

export interface LeagueEntry {
  id: number;
  name: string;
  type: string;
  /** Validated competition logo URL from the API, or null. */
  logo: string | null;
  country: string;
  countryCode: string | null;
  seasons: LeagueSeason[];
}

function parseSeason(value: unknown): LeagueSeason | null {
  if (!isRecord(value)) return null;
  const year = int(value.year);
  if (year === null) return null;
  const coverage = isRecord(value.coverage) ? value.coverage : {};
  const fixtures = isRecord(coverage.fixtures) ? coverage.fixtures : {};
  return {
    year,
    start: str(value.start),
    end: str(value.end),
    current: value.current === true,
    coverage: {
      fixtureEvents: bool(fixtures.events),
      lineups: bool(fixtures.lineups),
      fixtureStatistics: bool(fixtures.statistics_fixtures),
      standings: bool(coverage.standings),
    },
  };
}

export function parseLeagueEntry(value: unknown): LeagueEntry | null {
  if (!isRecord(value) || !isRecord(value.league) || !isRecord(value.country)) return null;
  const id = int(value.league.id);
  const name = str(value.league.name);
  const type = str(value.league.type);
  const country = str(value.country.name);
  if (id === null || !name || !type || !country) return null;
  const seasons = Array.isArray(value.seasons) ? parseList(value.seasons, parseSeason).items : [];
  return { id, name, type, logo: safeLogoUrl(value.league.logo), country, countryCode: str(value.country.code), seasons };
}

export const parseLeagues = (response: unknown[]) => parseList(response, parseLeagueEntry);

// ---- /fixtures ----------------------------------------------------------------

export interface FixtureTeam {
  id: number;
  name: string;
  /** Validated crest URL supplied by the API (see safeLogoUrl), or null. */
  logo: string | null;
  winner: boolean | null;
}

export interface Fixture {
  id: number;
  /** ISO 8601 kickoff, normalised to UTC ("…Z"). */
  kickoff: string;
  status: { short: string; long: string; elapsed: number | null; extra: number | null };
  league: { id: number; name: string; country: string | null; season: number | null; round: string | null };
  home: FixtureTeam;
  away: FixtureTeam;
  goals: { home: number | null; away: number | null };
  venue: { name: string | null; city: string | null };
  referee: string | null;
}

function parseTeam(value: unknown): FixtureTeam | null {
  if (!isRecord(value)) return null;
  const id = int(value.id);
  const name = str(value.name);
  if (id === null || !name) return null;
  return { id, name, logo: safeLogoUrl(value.logo), winner: bool(value.winner) };
}

export function parseFixture(value: unknown): Fixture | null {
  if (!isRecord(value) || !isRecord(value.fixture) || !isRecord(value.league) || !isRecord(value.teams)) return null;
  const { fixture, league, teams } = value;
  const id = int(fixture.id);
  const status = isRecord(fixture.status) ? fixture.status : null;
  const statusShort = status ? str(status.short) : null;
  const leagueId = int(league.id);
  const home = parseTeam(teams.home);
  const away = parseTeam(teams.away);

  // Prefer the unix timestamp; fall back to the ISO date string.
  const timestamp = int(fixture.timestamp);
  const dateMs = timestamp !== null ? timestamp * 1000 : Date.parse(str(fixture.date) ?? "");
  if (id === null || !statusShort || leagueId === null || !home || !away || !Number.isFinite(dateMs)) return null;

  const goals = isRecord(value.goals) ? value.goals : {};
  const venue = isRecord(fixture.venue) ? fixture.venue : {};
  return {
    id,
    kickoff: new Date(dateMs).toISOString(),
    status: {
      short: statusShort,
      long: str(status!.long) ?? statusShort,
      elapsed: int(status!.elapsed),
      extra: int(status!.extra),
    },
    league: {
      id: leagueId,
      name: str(league.name) ?? "",
      country: str(league.country),
      season: int(league.season),
      round: str(league.round),
    },
    home,
    away,
    goals: { home: int(goals.home), away: int(goals.away) },
    venue: { name: str(venue.name), city: str(venue.city) },
    referee: str(fixture.referee),
  };
}

export const parseFixtures = (response: unknown[]) => parseList(response, parseFixture);

export interface FixtureEvent {
  elapsed: number | null;
  extra: number | null;
  teamId: number | null;
  teamName: string | null;
  player: string | null;
  assist: string | null;
  type: string;
  detail: string | null;
}

export interface ScorePair {
  home: number | null;
  away: number | null;
}

export interface LineupPlayer {
  id: number | null;
  name: string;
  number: number | null;
  /** Position code as supplied (e.g. "G", "D", "M", "F"). */
  pos: string | null;
}

export interface Lineup {
  teamId: number;
  teamName: string;
  teamLogo: string | null;
  formation: string | null;
  coach: string | null;
  startXI: LineupPlayer[];
  substitutes: LineupPlayer[];
}

export interface TeamStatistics {
  teamId: number;
  teamName: string;
  /** Values exactly as supplied: numbers, strings such as "55%", or null. */
  items: { type: string; value: number | string | null }[];
}

export interface FixtureDetails extends Fixture {
  score: { halftime: ScorePair; fulltime: ScorePair; extratime: ScorePair; penalty: ScorePair };
  events: FixtureEvent[];
  lineups: Lineup[];
  statistics: TeamStatistics[];
}

function parseScorePair(value: unknown): ScorePair {
  const pair = isRecord(value) ? value : {};
  return { home: int(pair.home), away: int(pair.away) };
}

function parseLineupPlayer(value: unknown): LineupPlayer | null {
  // Entries are wrapped: { player: { id, name, number, pos, grid } }.
  const player = isRecord(value) && isRecord(value.player) ? value.player : null;
  const name = player ? str(player.name) : null;
  if (!player || !name) return null;
  return { id: int(player.id), name, number: int(player.number), pos: str(player.pos) };
}

function parseLineup(value: unknown): Lineup | null {
  if (!isRecord(value) || !isRecord(value.team)) return null;
  const teamId = int(value.team.id);
  const teamName = str(value.team.name);
  if (teamId === null || !teamName) return null;
  const coach = isRecord(value.coach) ? str(value.coach.name) : null;
  return {
    teamId,
    teamName,
    teamLogo: safeLogoUrl(value.team.logo),
    formation: str(value.formation),
    coach,
    startXI: Array.isArray(value.startXI) ? parseList(value.startXI, parseLineupPlayer).items : [],
    substitutes: Array.isArray(value.substitutes) ? parseList(value.substitutes, parseLineupPlayer).items : [],
  };
}

function parseTeamStatistics(value: unknown): TeamStatistics | null {
  if (!isRecord(value) || !isRecord(value.team) || !Array.isArray(value.statistics)) return null;
  const teamId = int(value.team.id);
  const teamName = str(value.team.name);
  if (teamId === null || !teamName) return null;
  const items = value.statistics.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const type = str(entry.type);
    const raw = entry.value;
    const ok = raw === null || typeof raw === "string" || (typeof raw === "number" && Number.isFinite(raw));
    return type && ok ? [{ type, value: raw as number | string | null }] : [];
  });
  return { teamId, teamName, items };
}

function parseEvent(value: unknown): FixtureEvent | null {
  if (!isRecord(value)) return null;
  const type = str(value.type);
  if (!type) return null;
  const time = isRecord(value.time) ? value.time : {};
  const team = isRecord(value.team) ? value.team : {};
  const player = isRecord(value.player) ? value.player : {};
  const assist = isRecord(value.assist) ? value.assist : {};
  return {
    elapsed: int(time.elapsed),
    extra: int(time.extra),
    teamId: int(team.id),
    teamName: str(team.name),
    player: str(player.name),
    assist: str(assist.name),
    type,
    detail: str(value.detail),
  };
}

export function parseFixtureDetails(value: unknown): FixtureDetails | null {
  const fixture = parseFixture(value);
  if (!fixture || !isRecord(value)) return null;
  const score = isRecord(value.score) ? value.score : {};
  return {
    ...fixture,
    score: {
      halftime: parseScorePair(score.halftime),
      fulltime: parseScorePair(score.fulltime),
      extratime: parseScorePair(score.extratime),
      penalty: parseScorePair(score.penalty),
    },
    events: Array.isArray(value.events) ? parseList(value.events, parseEvent).items : [],
    lineups: Array.isArray(value.lineups) ? parseList(value.lineups, parseLineup).items : [],
    statistics: Array.isArray(value.statistics) ? parseList(value.statistics, parseTeamStatistics).items : [],
  };
}

/** API-Football status codes, grouped by how MatchPulse displays them. */
export const FIXTURE_STATUS = {
  upcoming: ["TBD", "NS"],
  live: ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"],
  finished: ["FT", "AET", "PEN", "AWD", "WO"],
  postponed: ["PST", "CANC", "ABD"],
} as const;

export type StatusGroup = keyof typeof FIXTURE_STATUS;

export function statusGroup(short: string): StatusGroup | null {
  for (const group of Object.keys(FIXTURE_STATUS) as StatusGroup[]) {
    if ((FIXTURE_STATUS[group] as readonly string[]).includes(short)) return group;
  }
  return null;
}

// ---- /standings ---------------------------------------------------------------

export interface StandingRow {
  rank: number;
  teamId: number;
  teamName: string;
  teamLogo: string | null;
  points: number;
  goalsDiff: number | null;
  group: string | null;
  form: string | null;
  description: string | null;
  played: number | null;
  win: number | null;
  draw: number | null;
  lose: number | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
}

export interface Standings {
  leagueId: number;
  season: number | null;
  /** One table per group (a single table for most leagues). */
  groups: StandingRow[][];
  invalidRows: number;
}

function parseStandingRow(value: unknown): StandingRow | null {
  if (!isRecord(value) || !isRecord(value.team)) return null;
  const rank = int(value.rank);
  const teamId = int(value.team.id);
  const teamName = str(value.team.name);
  const points = int(value.points);
  if (rank === null || teamId === null || !teamName || points === null) return null;
  const all = isRecord(value.all) ? value.all : {};
  const goals = isRecord(all.goals) ? all.goals : {};
  return {
    rank,
    teamId,
    teamName,
    teamLogo: safeLogoUrl(value.team.logo),
    points,
    goalsDiff: int(value.goalsDiff),
    group: str(value.group),
    form: str(value.form),
    description: str(value.description),
    played: int(all.played),
    win: int(all.win),
    draw: int(all.draw),
    lose: int(all.lose),
    goalsFor: int(goals.for),
    goalsAgainst: int(goals.against),
  };
}

/** Parses the first entry of a /standings response; null when there is none. */
export function parseStandings(response: unknown[]): Standings | null {
  const first = response[0];
  if (!isRecord(first) || !isRecord(first.league)) return null;
  const leagueId = int(first.league.id);
  if (leagueId === null || !Array.isArray(first.league.standings)) return null;
  let invalidRows = 0;
  const groups = first.league.standings
    .filter(Array.isArray)
    .map((rows) => {
      const parsed = parseList(rows as unknown[], parseStandingRow);
      invalidRows += parsed.invalid;
      return parsed.items;
    });
  return { leagueId, season: int(first.league.season), groups, invalidRows };
}

// ---- /teams -----------------------------------------------------------------

export interface TeamEntry {
  id: number;
  name: string;
  country: string | null;
  logo: string | null;
}

export function parseTeamEntry(value: unknown): TeamEntry | null {
  if (!isRecord(value) || !isRecord(value.team)) return null;
  const id = int(value.team.id);
  const name = str(value.team.name);
  if (id === null || !name) return null;
  return { id, name, country: str(value.team.country), logo: safeLogoUrl(value.team.logo) };
}

export const parseTeams = (response: unknown[]) => parseList(response, parseTeamEntry);

// ---- /players/topscorers, /players/topassists ----------------------------

export interface PlayerStatLine {
  playerId: number;
  name: string;
  /** Validated photo URL from the API, or null. */
  photo: string | null;
  nationality: string | null;
  age: number | null;
  team: { id: number; name: string; logo: string | null } | null;
  position: string | null;
  appearances: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  penaltyGoals: number | null;
  /** Where the figures came from, for integrity checks (see lib/player-integrity.ts). */
  record: {
    /** Statistics entries for the requested competition (more than one = split across clubs). */
    competitionRecords: number;
    /** Distinct club names across those entries. */
    clubs: string[];
    /** League and season the chosen entry says it belongs to. */
    leagueId: number | null;
    season: number | null;
  };
}

/**
 * One ranked player. Each player can have several `statistics` entries (one
 * per team/competition). Only entries for `leagueId` are used; if there are
 * none, every figure is null (never another competition's numbers). How many
 * entries matched is recorded so callers can reject ambiguous records.
 * Note: the API spells the appearances field "appearences".
 */
export function parsePlayerStatLine(value: unknown, leagueId?: number): PlayerStatLine | null {
  if (!isRecord(value) || !isRecord(value.player) || !Array.isArray(value.statistics)) return null;
  const playerId = int(value.player.id);
  const name = str(value.player.name);
  if (playerId === null || !name) return null;
  const entries = value.statistics.filter(isRecord);
  const matching =
    leagueId === undefined ? entries : entries.filter((entry) => isRecord(entry.league) && int(entry.league.id) === leagueId);
  const stats = matching[0] ?? {};
  const statsLeague = isRecord(stats.league) ? stats.league : {};
  const clubs = [
    ...new Set(matching.map((entry) => (isRecord(entry.team) ? str(entry.team.name) : null)).filter((name): name is string => !!name)),
  ];
  const team = isRecord(stats.team) ? stats.team : null;
  const teamId = team ? int(team.id) : null;
  const teamName = team ? str(team.name) : null;
  const games = isRecord(stats.games) ? stats.games : {};
  const goals = isRecord(stats.goals) ? stats.goals : {};
  const penalty = isRecord(stats.penalty) ? stats.penalty : {};
  return {
    playerId,
    name,
    photo: safeLogoUrl(value.player.photo),
    nationality: str(value.player.nationality),
    age: int(value.player.age),
    team: teamId !== null && teamName ? { id: teamId, name: teamName, logo: safeLogoUrl(team!.logo) } : null,
    position: str(games.position),
    appearances: int(games.appearences) ?? int(games.appearances),
    minutes: int(games.minutes),
    goals: int(goals.total),
    assists: int(goals.assists),
    penaltyGoals: int(penalty.scored),
    record: { competitionRecords: matching.length, clubs, leagueId: int(statsLeague.id), season: int(statsLeague.season) },
  };
}

export function parsePlayerStatLines(response: unknown[], leagueId?: number): Parsed<PlayerStatLine> {
  return parseList(response, (entry) => parsePlayerStatLine(entry, leagueId));
}

// ---- Plan restrictions ----------------------------------------------------

/**
 * Season window from a plan-restriction message such as
 * "Free plans do not have access to this season, try from 2022 to 2024."
 * Returns null when the message does not state one.
 */
export function planSeasonRange(message: string): { from: number; to: number } | null {
  const match = /from\s+(\d{4})\s+to\s+(\d{4})/i.exec(message);
  if (!match) return null;
  const from = Number(match[1]);
  const to = Number(match[2]);
  return from >= 1990 && to >= from && to <= 2100 ? { from, to } : null;
}

// ---- /status ------------------------------------------------------------------

export interface AccountStatus {
  plan: string | null;
  active: boolean | null;
  requestsToday: number | null;
  requestLimitPerDay: number | null;
}

/** /status returns `response` as an object rather than an array. */
export async function fetchAccountStatus(options: RequestOptions): Promise<AccountStatus> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) throw new ApiFootballError("missing_key", "API_FOOTBALL_KEY is not set.");
  const url = new URL("/status", options.baseUrl ?? API_FOOTBALL_BASE_URL);
  let res: Response;
  try {
    res = await (options.fetchImpl ?? fetch)(url, {
      headers: { "x-apisports-key": apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    throw new ApiFootballError(name === "TimeoutError" ? "timeout" : "network", "Could not reach /status.");
  }
  if (res.status === 429) throw new ApiFootballError("rate_limited", "Rate limit exceeded (HTTP 429).", 429);
  const body: unknown = await res.json().catch(() => null);
  const record = isRecord(body) ? body : null;
  const apiError = classifyApiErrors(record?.errors, res.status);
  if (apiError) throw apiError;
  if (!res.ok) throw new ApiFootballError("http", `Unexpected HTTP ${res.status}.`, res.status);
  const response = record && isRecord(record.response) ? record.response : null;
  if (!response) throw new ApiFootballError("invalid_response", "Unexpected /status response.");
  const subscription = isRecord(response.subscription) ? response.subscription : {};
  const requests = isRecord(response.requests) ? response.requests : {};
  return {
    plan: str(subscription.plan),
    active: bool(subscription.active),
    requestsToday: int(requests.current),
    requestLimitPerDay: int(requests.limit_day),
  };
}
