import "server-only";

import { connection } from "next/server";
import { cache } from "react";
import { SUPPORTED_COMPETITIONS } from "@/lib/api-football/competitions";
import { describeError, type LeagueSeason, type StandingRow } from "@/lib/api-football/core";
import { friendlyReason } from "@/lib/api-football/messages";
import { getLeagueStandings, getSupportedCompetitions, isLiveDataEnabled } from "@/lib/api-football/server";
import { chooseSeason, getPlanSeasonWindow } from "@/lib/api-football/plan";

/** Every outcome is explicit so the page can say exactly what is (not) shown. */
export type StandingsView =
  | { state: "disabled" }
  | { state: "unresolved" }
  | { state: "no-season" }
  | { state: "no-coverage"; seasonLabel: string }
  /** The current season is outside the API plan and no earlier covered season is included. */
  | { state: "plan-restricted"; currentLabel: string; allowed: { from: number; to: number } | null }
  | { state: "error"; reason: string; retryable: boolean }
  | { state: "empty"; seasonLabel: string; fetchedAt: string; planLimited: PlanLimit | null }
  | {
      state: "ok";
      seasonLabel: string;
      fetchedAt: string;
      groups: { name: string | null; rows: StandingRow[] }[];
      /** Set when an earlier, completed season is shown because the plan excludes the current one. */
      planLimited: PlanLimit | null;
    };

export interface PlanLimit {
  currentLabel: string;
}

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
 * Standings for a supported competition. Uses the season the API marks as
 * current when the API plan includes it; otherwise the latest completed season
 * that the plan includes and the API covers, clearly labelled as such. Makes no
 * request when real data is off, the competition is unresolved, or no season is
 * both covered and allowed.
 */
// React cache: metadata and the page share one load per request.
export const loadStandings = cache(async function loadStandings(slug: string): Promise<StandingsView> {
  if (!isLiveDataEnabled()) return { state: "disabled" };
  await connection();

  try {
    const { resolved } = await getSupportedCompetitions();
    const competition = resolved.find((item) => item.slug === slug);
    if (!competition) return { state: "unresolved" };
    if (!competition.currentSeason && competition.seasons.length === 0) return { state: "no-season" };

    const window = await getPlanSeasonWindow();
    const choice = chooseSeason(competition.seasons, "standings", window);
    const current = choice.current;
    if (!choice.season) {
      if (choice.limitedByPlan && current) {
        return { state: "plan-restricted", currentLabel: seasonLabel(current), allowed: window ? { from: window.from, to: window.to } : null };
      }
      return current ? { state: "no-coverage", seasonLabel: seasonLabel(current) } : { state: "no-season" };
    }

    const season = choice.season;
    const label = seasonLabel(season);
    const finished = current !== null && season.year < current.year;
    const planLimited = choice.limitedByPlan && current ? { currentLabel: seasonLabel(current) } : null;
    const { standings, fetchedAt } = await getLeagueStandings(competition.leagueId, season.year, finished);
    const groups = (standings?.groups ?? [])
      .filter((rows) => rows.length > 0)
      .map((rows) => ({ name: rows[0].group, rows: [...rows].sort((a, b) => a.rank - b.rank) }));
    if (groups.length === 0) return { state: "empty", seasonLabel: label, fetchedAt, planLimited };
    return { state: "ok", seasonLabel: label, fetchedAt, groups, planLimited };
  } catch (error) {
    const { kind, message } = describeError(error);
    console.error(`[api-football] standings ${slug} failed (${kind}): ${message}`);
    const retryable = !["unauthorized", "missing_key", "plan_restricted", "quota_exhausted"].includes(kind);
    return { state: "error", reason: friendlyReason(kind), retryable };
  }
});

export interface StandingsCopy {
  title: string;
  h1: string;
  description: string;
}

function fit(text: string, max = 160): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).replace(/[\s,;:]+\S*$/, "")}…`;
}

/**
 * Title, H1 and description naming the season actually shown. On a plan that
 * excludes the current season, an earlier table is labelled as that season's
 * final table and never presented as current.
 */
export function standingsCopy(leagueName: string, view: StandingsView): StandingsCopy {
  if ((view.state === "ok" || view.state === "empty") && view.planLimited) {
    const season = view.seasonLabel;
    return {
      title: `${leagueName} ${season} Final Table`,
      h1: `${leagueName} ${season} final table`,
      description: fit(
        `Final ${season} ${leagueName} table: position, points, wins, draws, losses and goal difference. ${view.planLimited.currentLabel} standings are not available on our current data plan.`,
      ),
    };
  }
  if (view.state === "ok" || view.state === "empty") {
    return {
      title: `${leagueName} Table ${view.seasonLabel}`,
      h1: `${leagueName} table ${view.seasonLabel}`,
      description: fit(`${leagueName} ${view.seasonLabel} table: position, played, won, drawn, lost, goals for and against, goal difference and points.`),
    };
  }
  return {
    title: `${leagueName} standings`,
    h1: `${leagueName} standings`,
    description: `${leagueName} table: position, played, won, drawn, lost, goals for and against, goal difference and points.`,
  };
}
