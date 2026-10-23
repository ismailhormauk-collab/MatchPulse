import { safeLogoUrl } from "@/lib/api-football/core";
import raw from "./api-assets.json";

/**
 * Real competition logos and featured-club crests from API-Football, synced by
 * `npm run api:sync-assets` into api-assets.json. Read at build time, so they
 * cost no runtime API requests. Every URL is re-validated here; anything that
 * fails validation is treated as missing (neutral fallback in the UI).
 */

export interface LeagueAsset {
  id: number;
  name: string;
  logo: string | null;
  currentSeason: number | null;
  seasons: number[];
}

export interface ClubAsset {
  teamId: number;
  name: string;
  logo: string | null;
}

interface RawAssets {
  generatedAt?: string;
  plan?: { seasonFrom: number; seasonTo: number; observedAt: string } | null;
  leagues?: Record<string, Partial<LeagueAsset>>;
  clubs?: Record<string, Partial<ClubAsset>>;
}

const data = raw as RawAssets;

const leagueAssets = new Map<string, LeagueAsset>();
for (const [slug, entry] of Object.entries(data.leagues ?? {})) {
  if (typeof entry.id !== "number" || typeof entry.name !== "string") continue;
  leagueAssets.set(slug, {
    id: entry.id,
    name: entry.name,
    logo: safeLogoUrl(entry.logo),
    currentSeason: typeof entry.currentSeason === "number" ? entry.currentSeason : null,
    seasons: Array.isArray(entry.seasons) ? entry.seasons.filter((year): year is number => Number.isInteger(year)) : [],
  });
}

const clubAssets = new Map<string, ClubAsset>();
for (const [clubId, entry] of Object.entries(data.clubs ?? {})) {
  if (typeof entry.teamId !== "number" || typeof entry.name !== "string") continue;
  clubAssets.set(clubId, { teamId: entry.teamId, name: entry.name, logo: safeLogoUrl(entry.logo) });
}

export function getLeagueAsset(slug: string): LeagueAsset | undefined {
  return leagueAssets.get(slug);
}

export function getClubAsset(clubId: string): ClubAsset | undefined {
  return clubAssets.get(clubId);
}

/**
 * Season window the API plan allowed when assets were synced (from the
 * provider's own restriction message), or null if no restriction was seen.
 */
export const planSeasons: { from: number; to: number; observedAt: string } | null =
  data.plan && Number.isInteger(data.plan.seasonFrom) && Number.isInteger(data.plan.seasonTo)
    ? { from: data.plan.seasonFrom, to: data.plan.seasonTo, observedAt: data.plan.observedAt }
    : null;

export const assetsSyncedAt: string | null = typeof data.generatedAt === "string" ? data.generatedAt : null;
