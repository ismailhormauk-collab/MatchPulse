// Competitions MatchPulse supports via API-Football, and how they are matched.
//
// No league IDs are hardcoded: each competition is identified by its exact
// name, country and type as returned by GET /leagues?country=…, and the ID and
// season coverage come from that response. Anything that does not match
// exactly is reported as unresolved rather than guessed.
// Type-only imports keep this file loadable by plain Node scripts.

import type { LeagueEntry, LeagueSeason } from "./core";

export interface CompetitionSpec {
  /** MatchPulse league slug (src/data/leagues.ts). */
  slug: string;
  label: string;
  /** `country` query value and expected `country.name`. */
  country: string;
  /** Accepted `league.name` values, compared case-insensitively. */
  names: string[];
  type: "League" | "Cup";
}

export const SUPPORTED_COMPETITIONS: CompetitionSpec[] = [
  { slug: "premier-league", label: "English Premier League", country: "England", names: ["Premier League"], type: "League" },
  { slug: "laliga", label: "Spanish La Liga", country: "Spain", names: ["La Liga"], type: "League" },
  { slug: "serie-a", label: "Italian Serie A", country: "Italy", names: ["Serie A"], type: "League" },
  { slug: "bundesliga", label: "German Bundesliga", country: "Germany", names: ["Bundesliga"], type: "League" },
  { slug: "ligue-1", label: "French Ligue 1", country: "France", names: ["Ligue 1"], type: "League" },
  { slug: "champions-league", label: "UEFA Champions League", country: "World", names: ["UEFA Champions League"], type: "Cup" },
  { slug: "europa-league", label: "UEFA Europa League", country: "World", names: ["UEFA Europa League"], type: "Cup" },
  { slug: "botola-pro", label: "Moroccan Botola Pro", country: "Morocco", names: ["Botola Pro"], type: "League" },
];

/** Distinct countries to query: one /leagues request each. */
export const COMPETITION_COUNTRIES = [...new Set(SUPPORTED_COMPETITIONS.map((spec) => spec.country))];

export interface ResolvedCompetition {
  slug: string;
  label: string;
  leagueId: number;
  apiName: string;
  country: string;
  type: string;
  currentSeason: LeagueSeason | null;
  latestSeason: LeagueSeason | null;
  /** Every season the API lists, newest first, with its coverage. */
  seasons: LeagueSeason[];
}

export interface UnresolvedCompetition {
  slug: string;
  label: string;
  reason: string;
  /** Same-country entries whose name is close, to help fix the spec. */
  candidates: { id: number; name: string; type: string }[];
}

export interface CompetitionResolution {
  resolved: ResolvedCompetition[];
  unresolved: UnresolvedCompetition[];
}

const normalise = (value: string) => value.trim().toLowerCase();

export function resolveCompetitions(entriesByCountry: Record<string, LeagueEntry[] | undefined>): CompetitionResolution {
  const resolved: ResolvedCompetition[] = [];
  const unresolved: UnresolvedCompetition[] = [];

  for (const spec of SUPPORTED_COMPETITIONS) {
    const entries = entriesByCountry[spec.country];
    if (!entries) {
      unresolved.push({ slug: spec.slug, label: spec.label, reason: `No /leagues data for ${spec.country}.`, candidates: [] });
      continue;
    }
    const names = spec.names.map(normalise);
    const matches = entries.filter(
      (entry) =>
        names.includes(normalise(entry.name)) &&
        normalise(entry.country) === normalise(spec.country) &&
        entry.type === spec.type,
    );

    if (matches.length !== 1) {
      const words = names.flatMap((name) => name.split(/\s+/)).filter((word) => word.length > 2);
      unresolved.push({
        slug: spec.slug,
        label: spec.label,
        reason: matches.length === 0 ? "No exact name/country/type match." : `Ambiguous: ${matches.length} exact matches.`,
        candidates: (matches.length ? matches : entries.filter((entry) => words.some((word) => normalise(entry.name).includes(word))))
          .slice(0, 6)
          .map(({ id, name, type }) => ({ id, name, type })),
      });
      continue;
    }

    const entry = matches[0];
    const sorted = [...entry.seasons].sort((a, b) => b.year - a.year);
    resolved.push({
      slug: spec.slug,
      label: spec.label,
      leagueId: entry.id,
      apiName: entry.name,
      country: entry.country,
      type: entry.type,
      currentSeason: entry.seasons.find((season) => season.current) ?? null,
      latestSeason: sorted[0] ?? null,
      seasons: sorted,
    });
  }

  return { resolved, unresolved };
}
