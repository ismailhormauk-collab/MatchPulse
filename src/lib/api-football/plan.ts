import { planSeasons as syncedPlanSeasons } from "@/data/api-assets";
import { storage } from "@/lib/storage";
import { planSeasonRange, type LeagueSeason } from "./core";

// Which seasons the API-Football subscription allows, learned from the
// provider itself. A restricted request fails with a message such as
// "Free plans do not have access to this season, try from 2022 to 2024."; the
// window it names is stored (shared across instances) and later requests for
// seasons outside it are skipped without spending quota.
//
// Sources, newest first:
// 1. the window seen at runtime (storage, kept for a week, then re-learned);
// 2. the window recorded by `npm run api:sync-assets` (src/data/api-assets.json).
// After a plan upgrade, set API_FOOTBALL_PLAN_SEASONS=all (or re-run the asset
// sync) so every season the API lists is requested again.

export interface SeasonWindow {
  from: number;
  to: number;
  source: "api" | "asset-sync";
  observedAt: string;
}

const STORAGE_KEY = "plan:seasons";
const STORE_SECONDS = 7 * 24 * 3600;
const MEMORY_MS = 10 * 60 * 1000;

let memory: { window: SeasonWindow | null; until: number } | null = null;

function ignoreWindow(): boolean {
  return process.env.API_FOOTBALL_PLAN_SEASONS?.trim().toLowerCase() === "all";
}

function readStored(text: string | null): SeasonWindow | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<SeasonWindow>;
    if (Number.isInteger(value.from) && Number.isInteger(value.to) && value.to! >= value.from! && typeof value.observedAt === "string") {
      return { from: value.from!, to: value.to!, source: "api", observedAt: value.observedAt };
    }
  } catch {
    // ignore malformed entries
  }
  return null;
}

/** The subscription's season window, or null when no restriction is known. */
export async function getPlanSeasonWindow(): Promise<SeasonWindow | null> {
  if (ignoreWindow()) return null;
  const now = Date.now();
  if (memory && memory.until > now) return memory.window;
  const stored = readStored(await storage().get(STORAGE_KEY));
  const window =
    stored ??
    (syncedPlanSeasons
      ? { from: syncedPlanSeasons.from, to: syncedPlanSeasons.to, source: "asset-sync" as const, observedAt: syncedPlanSeasons.observedAt }
      : null);
  memory = { window, until: now + MEMORY_MS };
  return window;
}

/** Records the window named in a plan-restriction message (no-op if it names none). */
export async function recordPlanRestriction(message: string): Promise<void> {
  const range = planSeasonRange(message);
  if (!range) return;
  const window: SeasonWindow = { ...range, source: "api", observedAt: new Date().toISOString() };
  memory = { window, until: Date.now() + MEMORY_MS };
  await storage().set(STORAGE_KEY, JSON.stringify(window), STORE_SECONDS);
}

export function seasonInWindow(season: number, window: SeasonWindow | null): boolean {
  return !window || (season >= window.from && season <= window.to);
}

export type SeasonNeed = "standings" | "topScorers" | "topAssists";

export interface SeasonChoice {
  /** The season to request, or null when no season is both covered and allowed. */
  season: LeagueSeason | null;
  /** The season the API marks as current. */
  current: LeagueSeason | null;
  /** True when the current season was skipped because the plan does not include it. */
  limitedByPlan: boolean;
}

/**
 * Picks the season to request from the API's own season list: the current
 * season when the plan allows it and the API reports coverage for `need`,
 * otherwise the latest season that satisfies both. Seasons with unknown
 * coverage (null) are allowed; explicit `false` is not.
 */
export function chooseSeason(seasons: LeagueSeason[], need: SeasonNeed, window: SeasonWindow | null): SeasonChoice {
  const current = seasons.find((season) => season.current) ?? null;
  const usable = (season: LeagueSeason) => season.coverage[need] !== false && seasonInWindow(season.year, window);
  if (current && usable(current)) return { season: current, current, limitedByPlan: false };
  const fallback = [...seasons]
    .filter((season) => (current ? season.year < current.year : true))
    .sort((a, b) => b.year - a.year)
    .find(usable);
  const currentCovered = current !== null && current.coverage[need] !== false;
  return {
    season: fallback ?? null,
    current,
    limitedByPlan: currentCovered && current !== null && !seasonInWindow(current.year, window),
  };
}

/** For tests. */
export function resetPlanWindowForTests() {
  memory = null;
}
