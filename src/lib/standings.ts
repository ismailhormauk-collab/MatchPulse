import "server-only";

import { connection } from "next/server";
import { SUPPORTED_COMPETITIONS } from "@/lib/api-football/competitions";
import { describeError, type LeagueSeason, type StandingRow } from "@/lib/api-football/core";
import { friendlyReason } from "@/lib/api-football/messages";
import { getLeagueStandings, getSupportedCompetitions, isLiveDataEnabled } from "@/lib/api-football/server";

/** Every outcome is explicit so the page can say exactly what is (not) shown. */
export type StandingsView =
  | { state: "disabled" }
  | { state: "unresolved" }
  | { state: "no-season" }
  | { state: "no-coverage"; seasonLabel: string }
  | { state: "error"; reason: string; retryable: boolean }
  | { state: "empty"; seasonLabel: string; fetchedAt: string }
  | {
      state: "ok";
      seasonLabel: string;
      fetchedAt: string;
      groups: { name: string | null; rows: StandingRow[] }[];
    };

export const STANDINGS_SLUGS = SUPPORTED_COMPETITIONS.map((spec) => spec.slug);

export function hasStandings(slug: string): boolean {
  return STANDINGS_SLUGS.includes(slug);
}

/** "2026/27" for a season spanning two years, otherwise "2026". */
export function seasonLabel(season: Pick<LeagueSeason, "year" | "start" | "end">): string {
  const startYear = Number(season.start?.slice(0, 4)) || season.year;
  const endYear = Number(season.end?.slice(0, 4)) || startYear;
  return endYear > startYear ? `${startYear}/${String(endYear).slice(-2)}` : String(startYear);
}

/**
 * Standings for a supported competition, current season only. Makes no
 * request when real data is off, the competition is unresolved, or the API
 * reports no standings coverage for the season.
 */
export async function loadStandings(slug: string): Promise<StandingsView> {
  if (!isLiveDataEnabled()) return { state: "disabled" };
  await connection();

  try {
    const { resolved } = await getSupportedCompetitions();
    const competition = resolved.find((item) => item.slug === slug);
    if (!competition) return { state: "unresolved" };
    const season = competition.currentSeason;
    if (!season) return { state: "no-season" };
    const label = seasonLabel(season);
    if (season.coverage.standings === false) return { state: "no-coverage", seasonLabel: label };

    const { standings, fetchedAt } = await getLeagueStandings(competition.leagueId, season.year);
    const groups = (standings?.groups ?? [])
      .filter((rows) => rows.length > 0)
      .map((rows) => ({ name: rows[0].group, rows: [...rows].sort((a, b) => a.rank - b.rank) }));
    if (groups.length === 0) return { state: "empty", seasonLabel: label, fetchedAt };
    return { state: "ok", seasonLabel: label, fetchedAt, groups };
  } catch (error) {
    const { kind, message } = describeError(error);
    console.error(`[api-football] standings ${slug} failed (${kind}): ${message}`);
    const retryable = !["unauthorized", "missing_key", "plan_restricted", "quota_exhausted"].includes(kind);
    return { state: "error", reason: friendlyReason(kind), retryable };
  }
}
