import { SUPPORTED_COMPETITIONS } from "@/lib/api-football/competitions";
import type { CompetitionGroup, League } from "@/lib/types";

export const leagues: League[] = [
  { slug: "champions-league", name: "Champions League", country: "Europe", region: "Europe", code: "UCL", color: "#1d3c8f", group: "continental", popular: true },
  { slug: "europa-league", name: "Europa League", country: "Europe", region: "Europe", code: "UEL", color: "#c25a10", group: "continental", popular: true },
  { slug: "conference-league", name: "Conference League", country: "Europe", region: "Europe", code: "UECL", color: "#1f8a4c", group: "continental" },
  { slug: "premier-league", name: "Premier League", country: "England", region: "Europe", code: "EPL", color: "#4b1a6b", group: "european", popular: true },
  { slug: "laliga", name: "LaLiga", country: "Spain", region: "Europe", code: "LL", color: "#c8102e", group: "european", popular: true },
  { slug: "serie-a", name: "Serie A", country: "Italy", region: "Europe", code: "SA", color: "#0b4ea2", group: "european", popular: true },
  { slug: "bundesliga", name: "Bundesliga", country: "Germany", region: "Europe", code: "BL", color: "#b5121b", group: "european", popular: true },
  { slug: "ligue-1", name: "Ligue 1", country: "France", region: "Europe", code: "L1", color: "#2b3a55", group: "european", popular: true },
  { slug: "eredivisie", name: "Eredivisie", country: "Netherlands", region: "Europe", code: "ERE", color: "#e0601b", group: "european" },
  { slug: "primeira-liga", name: "Primeira Liga", country: "Portugal", region: "Europe", code: "PL", color: "#0a6e4f", group: "european" },
  { slug: "scottish-premiership", name: "Scottish Premiership", country: "Scotland", region: "Europe", code: "SPL", color: "#3a2f7a", group: "european" },
  { slug: "super-lig", name: "Süper Lig", country: "Türkiye", region: "Europe", code: "SL", color: "#c41e3a", group: "european" },
  { slug: "championship", name: "Championship", country: "England", region: "Europe", code: "EFL", color: "#203a72", group: "domestic" },
  { slug: "fa-cup", name: "FA Cup", country: "England", region: "Europe", code: "FAC", color: "#8a1c2b", group: "domestic" },
  { slug: "copa-del-rey", name: "Copa del Rey", country: "Spain", region: "Europe", code: "CDR", color: "#7d1d2a", group: "domestic" },
  { slug: "saudi-pro-league", name: "Saudi Pro League", country: "Saudi Arabia", region: "Asia", code: "SPL", color: "#14704a", group: "domestic", popular: true },
  { slug: "egyptian-premier-league", name: "Egyptian Premier League", country: "Egypt", region: "Africa", code: "EPL", color: "#9c1c24", group: "domestic" },
  { slug: "botola-pro", name: "Botola Pro", country: "Morocco", region: "Africa", code: "BP", color: "#b3261e", group: "domestic" },
  { slug: "mls", name: "Major League Soccer", country: "United States", region: "North America", code: "MLS", color: "#1b2a4a", group: "domestic", popular: true },
  { slug: "brasileirao", name: "Brasileirão Série A", country: "Brazil", region: "South America", code: "BRA", color: "#127a3d", group: "domestic" },
  { slug: "liga-profesional", name: "Liga Profesional", country: "Argentina", region: "South America", code: "LPF", color: "#3b7fc4", group: "domestic" },
  { slug: "afc-champions-league", name: "AFC Champions League Elite", country: "Asia", region: "Asia", code: "ACL", color: "#123d73", group: "continental" },
  { slug: "caf-champions-league", name: "CAF Champions League", country: "Africa", region: "Africa", code: "CAF", color: "#1a7a33", group: "continental", popular: true },
  { slug: "copa-libertadores", name: "Copa Libertadores", country: "South America", region: "South America", code: "LIB", color: "#8c6a12", group: "continental", popular: true },
  { slug: "copa-sudamericana", name: "Copa Sudamericana", country: "South America", region: "South America", code: "SUD", color: "#1f5a8c", group: "continental" },
  { slug: "world-cup", name: "World Cup", country: "World", region: "World", code: "WC", color: "#7a5a12", group: "international", popular: true },
  { slug: "wc-qualifiers-europe", name: "World Cup Qualifiers · Europe", country: "Europe", region: "Europe", code: "WCQ", color: "#2d4b8a", group: "international" },
  { slug: "nations-league", name: "Nations League", country: "Europe", region: "Europe", code: "UNL", color: "#2a5c6e", group: "international" },
  { slug: "africa-cup-of-nations", name: "Africa Cup of Nations", country: "Africa", region: "Africa", code: "AFCON", color: "#a0721a", group: "international" },
  { slug: "asian-cup", name: "Asian Cup", country: "Asia", region: "Asia", code: "AC", color: "#7b2140", group: "international" },
  { slug: "copa-america", name: "Copa América", country: "South America", region: "South America", code: "CA", color: "#244a9a", group: "international" },
  { slug: "international-friendlies", name: "International Friendlies", country: "World", region: "World", code: "INT", color: "#3a4659", group: "international" },
];

const bySlug = new Map(leagues.map((league) => [league.slug, league]));

export function getLeague(slug: string): League | undefined {
  return bySlug.get(slug);
}

export const popularLeagues = leagues.filter((league) => league.popular);

export const competitionGroupLabels: Record<CompetitionGroup, string> = {
  european: "European Leagues",
  domestic: "Domestic Competitions",
  continental: "Continental Cups",
  international: "International",
};

export function leaguesInGroup(group: CompetitionGroup): League[] {
  return leagues.filter((league) => league.group === group);
}

const standingsSlugs = new Set(SUPPORTED_COMPETITIONS.map((spec) => spec.slug));

/** Standings page for supported competitions, otherwise the entry on /leagues. */
export function leagueHref(slug: string): string {
  return standingsSlugs.has(slug) ? `/leagues/${slug}` : `/leagues#${slug}`;
}
