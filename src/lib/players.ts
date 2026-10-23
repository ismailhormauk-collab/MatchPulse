import "server-only";

import { connection } from "next/server";
import { getLeagueAsset } from "@/data/api-assets";
import { seasonInWindow, type SeasonWindow } from "@/lib/api-football/plan";
import { SUPPORTED_COMPETITIONS } from "@/lib/api-football/competitions";
import { describeError, planSeasonRange, type PlayerStatLine } from "@/lib/api-football/core";
import { friendlyReason } from "@/lib/api-football/messages";
import { getLeagueStandings, getTopPlayers, isLiveDataEnabled, type PlayerRanking } from "@/lib/api-football/server";
import { checkRanking, type ExcludedRecord } from "@/lib/player-integrity";
import { getLeague } from "@/data/leagues";

export type PlayerCategory = PlayerRanking | "appearances" | "clean-sheets";

export const PLAYER_CATEGORIES: { id: PlayerCategory; label: string; ranking: PlayerRanking | null }[] = [
  { id: "scorers", label: "Top scorers", ranking: "scorers" },
  { id: "assists", label: "Top assists", ranking: "assists" },
  // API-Football has no ranking endpoints for these; building them would mean
  // paging every player in a league (dozens of requests), so they are not offered.
  { id: "appearances", label: "Most appearances", ranking: null },
  { id: "clean-sheets", label: "Clean sheets", ranking: null },
];

/** Competitions offered on the players page: the supported ones with a synced API ID. */
export const PLAYER_COMPETITIONS = SUPPORTED_COMPETITIONS.map((spec) => spec.slug).filter((slug) => getLeagueAsset(slug));

/**
 * Most matches one team can play in a season of each competition (league
 * rounds; for UEFA cups the longest path from the league/group phase to the
 * final). A player listed with more appearances than this has inconsistent
 * provider data (seen for players who changed clubs after the season).
 */
const SEASON_MATCH_LIMIT: Record<string, number> = {
  "premier-league": 38,
  laliga: 38,
  "serie-a": 38,
  bundesliga: 34,
  "ligue-1": 38,
  "botola-pro": 30,
  "champions-league": 17,
  "europa-league": 17,
};

export function seasonMatchLimit(slug: string): number | null {
  return SEASON_MATCH_LIMIT[slug] ?? null;
}

/** All supported competitions run across two calendar years (e.g. 2024/25). */
export function seasonSpanLabel(year: number): string {
  return `${year}/${String(year + 1).slice(-2)}`;
}

export interface PlayersQuery {
  competition: string;
  category: PlayerCategory;
  season: number;
  /** Latest seasons for the competition, newest first. */
  seasonOptions: number[];
  currentSeason: number | null;
  /** True when the default season was moved back to the plan's latest season. */
  defaultedForPlan: boolean;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Validates URL filters; anything unknown falls back to a safe default. Only
 * seasons the API plan includes are offered (`planWindow`, see plan.ts), so no
 * request is made for a season the plan would reject.
 */
export function resolvePlayersQuery(
  params: Record<string, string | string[] | undefined>,
  planWindow: SeasonWindow | null = null,
): PlayersQuery | null {
  const requested = first(params.competition);
  const competition = requested && PLAYER_COMPETITIONS.includes(requested) ? requested : PLAYER_COMPETITIONS[0];
  if (!competition) return null;
  const asset = getLeagueAsset(competition)!;

  const categoryParam = first(params.category);
  const category = PLAYER_CATEGORIES.find((item) => item.id === categoryParam)?.id ?? "scorers";

  const currentSeason = asset.currentSeason;
  const seasonOptions = [...asset.seasons]
    .sort((a, b) => b - a)
    .filter((year) => (currentSeason === null || year <= currentSeason) && seasonInWindow(year, planWindow))
    .slice(0, 5);
  if (seasonOptions.length === 0) return null;
  const seasonParam = Number(first(params.season));
  let season: number;
  let defaultedForPlan = false;
  if (Number.isInteger(seasonParam) && seasonOptions.includes(seasonParam)) {
    season = seasonParam;
  } else if (currentSeason !== null && seasonOptions.includes(currentSeason)) {
    season = currentSeason;
  } else {
    // The current season is outside the plan: use the latest season it includes.
    season = seasonOptions[0];
    defaultedForPlan = currentSeason !== null && !seasonInWindow(currentSeason, planWindow);
  }
  return { competition, category, season, seasonOptions, currentSeason, defaultedForPlan };
}

export type PlayersView =
  | { state: "disabled" }
  | { state: "unsupported-category" }
  | { state: "plan-restricted"; allowed: { from: number; to: number } | null }
  | { state: "error"; reason: string; retryable: boolean }
  | { state: "empty"; fetchedAt: string }
  | {
      state: "ok";
      /** Records that passed every integrity check, provider order kept. */
      players: PlayerStatLine[];
      /** Records left out of the ranking, with the reason. */
      excluded: ExcludedRecord[];
      fetchedAt: string;
      seasonFinished: boolean;
      /** Whether each club was checked against the season's final table. */
      clubsChecked: "yes" | "unavailable" | "not-applicable";
    };

export async function loadPlayers(query: PlayersQuery): Promise<PlayersView> {
  if (!isLiveDataEnabled()) return { state: "disabled" };
  const ranking = PLAYER_CATEGORIES.find((item) => item.id === query.category)?.ranking;
  if (!ranking) return { state: "unsupported-category" };
  const asset = getLeagueAsset(query.competition);
  if (!asset) return { state: "error", reason: "This competition is not available.", retryable: false };

  await connection();
  const finished = asset.currentSeason !== null && query.season < asset.currentSeason;
  // Club membership is checked against the league table (cached; one request per
  // competition-season). Cups are skipped: qualifying-round clubs are not in it.
  const isLeague = SUPPORTED_COMPETITIONS.find((spec) => spec.slug === query.competition)?.type === "League";
  const standingsRequest = isLeague ? getLeagueStandings(asset.id, query.season, finished) : null;
  try {
    const [{ players, fetchedAt }, standings] = await Promise.all([
      getTopPlayers(ranking, asset.id, query.season, finished),
      standingsRequest?.then(
        (result) => result,
        (error) => {
          const { kind } = describeError(error);
          console.error(`[api-football] club check standings ${query.competition} ${query.season} unavailable (${kind})`);
          return null;
        },
      ) ?? null,
    ]);
    if (players.length === 0) return { state: "empty", fetchedAt };

    const clubIds = standings?.standings ? new Set(standings.standings.groups.flat().map((row) => row.teamId)) : null;
    const { ranked, excluded } = checkRanking(players, {
      leagueId: asset.id,
      season: query.season,
      metric: ranking === "scorers" ? "goals" : "assists",
      competitionName: getLeague(query.competition)?.name ?? asset.name,
      maxMatches: seasonMatchLimit(query.competition),
      clubIds: clubIds && clubIds.size > 0 ? clubIds : null,
    });
    return {
      state: "ok",
      players: ranked,
      excluded,
      fetchedAt,
      seasonFinished: finished,
      clubsChecked: !isLeague ? "not-applicable" : clubIds && clubIds.size > 0 ? "yes" : "unavailable",
    };
  } catch (error) {
    const { kind, message } = describeError(error);
    console.error(`[api-football] players ${ranking} ${query.competition} ${query.season} failed (${kind}): ${message}`);
    if (kind === "plan_restricted") return { state: "plan-restricted", allowed: planSeasonRange(message) };
    const retryable = !["unauthorized", "missing_key", "quota_exhausted"].includes(kind);
    return { state: "error", reason: friendlyReason(kind), retryable };
  }
}
