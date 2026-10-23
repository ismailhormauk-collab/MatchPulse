// How MatchPulse competitions and featured clubs are matched to API-Football
// entries to obtain their real IDs, logos and crests (see
// scripts/api-football-sync-assets.mjs). Matching is exact on a normalised
// name plus country/type; nothing is guessed. Unmatched items keep a neutral
// fallback in the UI. Type-only imports keep this loadable by Node scripts.

import type { LeagueEntry, TeamEntry } from "./core";
import { SUPPORTED_COMPETITIONS } from "./competitions";

export interface LeagueAssetSpec {
  slug: string;
  /** Accepted `country.name` values (API spelling first). */
  countries: string[];
  /** Accepted `league.name` values, tried in order. */
  names: string[];
  type: "League" | "Cup";
}

export const LEAGUE_ASSET_SPECS: LeagueAssetSpec[] = [
  ...SUPPORTED_COMPETITIONS.map((spec) => ({ slug: spec.slug, countries: [spec.country], names: spec.names, type: spec.type })),
  { slug: "conference-league", countries: ["World"], names: ["UEFA Europa Conference League", "UEFA Conference League"], type: "Cup" },
  { slug: "eredivisie", countries: ["Netherlands"], names: ["Eredivisie"], type: "League" },
  { slug: "primeira-liga", countries: ["Portugal"], names: ["Primeira Liga", "Liga Portugal", "Liga Portugal Betclic"], type: "League" },
  { slug: "scottish-premiership", countries: ["Scotland"], names: ["Premiership"], type: "League" },
  { slug: "super-lig", countries: ["Turkey", "Türkiye"], names: ["Süper Lig", "Super Lig"], type: "League" },
  { slug: "championship", countries: ["England"], names: ["Championship"], type: "League" },
  { slug: "fa-cup", countries: ["England"], names: ["FA Cup"], type: "Cup" },
  { slug: "copa-del-rey", countries: ["Spain"], names: ["Copa del Rey"], type: "Cup" },
  { slug: "saudi-pro-league", countries: ["Saudi-Arabia", "Saudi Arabia"], names: ["Pro League", "Saudi Pro League", "Saudi Professional League"], type: "League" },
  { slug: "egyptian-premier-league", countries: ["Egypt"], names: ["Premier League"], type: "League" },
  { slug: "mls", countries: ["USA", "United States"], names: ["Major League Soccer"], type: "League" },
  { slug: "brasileirao", countries: ["Brazil"], names: ["Serie A"], type: "League" },
  { slug: "liga-profesional", countries: ["Argentina"], names: ["Liga Profesional Argentina", "Liga Profesional"], type: "League" },
  { slug: "afc-champions-league", countries: ["World"], names: ["AFC Champions League Elite", "AFC Champions League"], type: "Cup" },
  { slug: "caf-champions-league", countries: ["World"], names: ["CAF Champions League"], type: "Cup" },
  { slug: "copa-libertadores", countries: ["World"], names: ["CONMEBOL Libertadores", "Copa Libertadores"], type: "Cup" },
  { slug: "copa-sudamericana", countries: ["World"], names: ["CONMEBOL Sudamericana", "Copa Sudamericana"], type: "Cup" },
  { slug: "world-cup", countries: ["World"], names: ["World Cup"], type: "Cup" },
  { slug: "wc-qualifiers-europe", countries: ["World"], names: ["World Cup - Qualification Europe"], type: "Cup" },
  { slug: "nations-league", countries: ["World"], names: ["UEFA Nations League"], type: "Cup" },
  { slug: "africa-cup-of-nations", countries: ["World"], names: ["Africa Cup of Nations"], type: "Cup" },
  { slug: "asian-cup", countries: ["World"], names: ["Asian Cup", "AFC Asian Cup"], type: "Cup" },
  { slug: "copa-america", countries: ["World"], names: ["Copa America", "CONMEBOL Copa America"], type: "Cup" },
  { slug: "international-friendlies", countries: ["World"], names: ["Friendlies"], type: "Cup" },
];

export interface ClubAssetSpec {
  /** MatchPulse club id (src/data/clubs.ts). */
  clubId: string;
  /** League whose team list contains the club. */
  leagueSlug: string;
  names: string[];
}

/** Clubs in the header carousel (featuredClubIds). */
export const CLUB_ASSET_SPECS: ClubAssetSpec[] = [
  { clubId: "real-madrid", leagueSlug: "laliga", names: ["Real Madrid"] },
  { clubId: "barcelona", leagueSlug: "laliga", names: ["Barcelona", "FC Barcelona"] },
  { clubId: "atletico", leagueSlug: "laliga", names: ["Atletico Madrid", "Atlético Madrid"] },
  { clubId: "man-united", leagueSlug: "premier-league", names: ["Manchester United"] },
  { clubId: "chelsea", leagueSlug: "premier-league", names: ["Chelsea"] },
  { clubId: "liverpool", leagueSlug: "premier-league", names: ["Liverpool"] },
  { clubId: "man-city", leagueSlug: "premier-league", names: ["Manchester City"] },
  { clubId: "arsenal", leagueSlug: "premier-league", names: ["Arsenal"] },
  { clubId: "bayern", leagueSlug: "bundesliga", names: ["Bayern München", "Bayern Munich", "FC Bayern München"] },
  { clubId: "dortmund", leagueSlug: "bundesliga", names: ["Borussia Dortmund"] },
  { clubId: "psg", leagueSlug: "ligue-1", names: ["Paris Saint Germain", "Paris Saint-Germain"] },
  { clubId: "juventus", leagueSlug: "serie-a", names: ["Juventus"] },
  { clubId: "ac-milan", leagueSlug: "serie-a", names: ["AC Milan"] },
  { clubId: "inter", leagueSlug: "serie-a", names: ["Inter", "Inter Milan"] },
  { clubId: "napoli", leagueSlug: "serie-a", names: ["Napoli"] },
  { clubId: "al-ahly", leagueSlug: "egyptian-premier-league", names: ["Al Ahly"] },
  { clubId: "wydad", leagueSlug: "botola-pro", names: ["Wydad AC", "Wydad Casablanca", "Wydad"] },
  { clubId: "raja", leagueSlug: "botola-pro", names: ["Raja Casablanca", "Raja CA", "Raja Club Athletic"] },
];

/** Lowercase, accents and punctuation removed, single spaces. */
export function normaliseName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** First alias (in order) that matches exactly one entry; otherwise null. */
function matchByAliases<T extends { name: string }>(entries: T[], names: string[]): T | null {
  for (const name of names) {
    const wanted = normaliseName(name);
    const hits = entries.filter((entry) => normaliseName(entry.name) === wanted);
    if (hits.length === 1) return hits[0];
  }
  return null;
}

export function matchLeague(entries: LeagueEntry[], spec: LeagueAssetSpec): LeagueEntry | null {
  const countries = spec.countries.map(normaliseName);
  const candidates = entries.filter((entry) => entry.type === spec.type && countries.includes(normaliseName(entry.country)));
  return matchByAliases(candidates, spec.names);
}

export function matchTeam(teams: TeamEntry[], spec: ClubAssetSpec): TeamEntry | null {
  return matchByAliases(teams, spec.names);
}
