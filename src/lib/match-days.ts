import "server-only";

import { connection } from "next/server";
import { getLeague, leagues } from "@/data/leagues";
import { getMatchFeed } from "@/lib/match-feed";
import { formatDateKeyLong, formatDateKeyShort, SITE_TIME_ZONE, ukZoneName, zonedDateKey } from "@/lib/time";
import type { FeedSource, Match } from "@/lib/types";

// The three daily match pages (/matches/yesterday, /matches, /matches/tomorrow):
// one UK calendar day each, built from the same cached match feed as the match
// centre, so they make no extra API requests. Titles and descriptions come
// from the real fixtures of that day; nothing is invented when data is missing.

export type MatchDay = "yesterday" | "today" | "tomorrow";

export const MATCH_DAY_PATH: Record<MatchDay, string> = {
  yesterday: "/matches/yesterday",
  today: "/matches",
  tomorrow: "/matches/tomorrow",
};

const leagueOrder = new Map(leagues.map((league, index) => [league.slug, index]));

export interface MatchDayView {
  day: MatchDay;
  /** "YYYY-MM-DD" in UK time. */
  dateKey: string;
  /** "Saturday, 31 October 2026" */
  dateLong: string;
  /** "Sat 31 Oct 2026" */
  dateShort: string;
  /** "GMT" or "BST" at the time of the request. */
  zoneName: string;
  /** Matches on this UK day, kickoff order. */
  matches: Match[];
  /** Competition names present that day, in the site's competition order. */
  competitions: string[];
  counts: { total: number; finished: number; live: number; upcoming: number; postponed: number };
  source: FeedSource;
  /** Real provider data (not sample data, not unavailable). */
  real: boolean;
}

export async function loadMatchDay(day: MatchDay): Promise<MatchDayView> {
  // Always request time: the date must never be fixed at build time (even when
  // a build runs without live-data settings and the feed would be static).
  await connection();
  const feed = await getMatchFeed();
  const dateKey = feed.days[day];
  const matches = feed.matches
    .filter((match) => zonedDateKey(match.kickoff, SITE_TIME_ZONE) === dateKey)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const slugs = [...new Set(matches.map((match) => match.leagueSlug))].sort(
    (a, b) => (leagueOrder.get(a) ?? 999) - (leagueOrder.get(b) ?? 999),
  );
  const count = (status: Match["status"]) => matches.filter((match) => match.status === status).length;
  return {
    day,
    dateKey,
    dateLong: formatDateKeyLong(dateKey),
    dateShort: formatDateKeyShort(dateKey),
    zoneName: ukZoneName(feed.now),
    matches,
    competitions: slugs.map((slug) => getLeague(slug)?.name ?? slug),
    counts: {
      total: matches.length,
      finished: count("finished"),
      live: count("live"),
      upcoming: count("upcoming"),
      postponed: count("postponed"),
    },
    source: feed.source,
    real: feed.source.kind === "api-football",
  };
}

/** "the Premier League, LaLiga and 3 more competitions" (at most `max` names). */
export function competitionList(names: string[], max = 3): string {
  const shown = names.slice(0, max).map((name) => (/^(premier|champions|europa|conference|botola)/i.test(name) ? `the ${name}` : name));
  const more = names.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more competition${more === 1 ? "" : "s"}`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function fit(text: string, max = 160): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).replace(/[\s,;:]+\S*$/, "")}…`;
}

/** The longest version (most competition names) that fits; never cuts a sentence if avoidable. */
function fitWithCompetitions(names: string[], build: (list: string) => string): string {
  for (let max = 3; max >= 1; max -= 1) {
    const text = build(competitionList(names, max));
    if (text.length <= 160) return text;
  }
  return fit(build(competitionList(names, 1)));
}

export interface MatchDayCopy {
  title: string;
  description: string;
  h1: string;
  /** One-sentence summary shown under the H1. */
  summary: string;
}

/** Title, description, H1 and summary from the day's real fixtures. */
export function matchDayCopy(view: MatchDayView): MatchDayCopy {
  const { day, dateLong, dateShort, counts } = view;
  const comps = competitionList(view.competitions);
  const n = counts.total;

  if (day === "yesterday") {
    const title = `Football Results – ${dateLong.replace(",", "")}`;
    const h1 = `Football results – ${dateLong}`;
    if (!view.real) {
      return { title, h1, ...generic(`Football results from ${dateLong}: final scores from the Premier League, Champions League, LaLiga, Serie A, Bundesliga, Ligue 1 and more.`) };
    }
    if (n === 0) {
      const summary = `There were no matches on ${dateLong} in the competitions MatchPulse covers.`;
      return { title, h1, summary, description: fit(`${summary} See today's matches, tomorrow's fixtures and league tables.`) };
    }
    const parts = [`${plural(counts.finished, "final score", "final scores")}`];
    if (counts.postponed) parts.push(`${counts.postponed} postponed`);
    if (counts.live) parts.push(`${counts.live} still in play`);
    const summary = `${plural(n, "match", "matches")} from ${comps} on ${dateLong}: ${parts.join(", ")}.`;
    const description = fitWithCompetitions(view.competitions, (list) => `Football results from ${dateShort}: ${plural(n, "match", "matches")} from ${list}, with ${parts.join(", ")}.`);
    return { title, h1, summary, description };
  }

  if (day === "tomorrow") {
    const title = `Tomorrow's Football Fixtures – ${dateShort}`;
    const h1 = `Tomorrow's football fixtures – ${dateLong}`;
    if (!view.real) {
      return { title, h1, ...generic(`Tomorrow's football fixtures with kick-off times in UK time from the Premier League, Champions League, LaLiga, Serie A, Bundesliga, Ligue 1 and more.`) };
    }
    if (n === 0) {
      const summary = `There are no fixtures on ${dateLong} in the competitions MatchPulse covers.`;
      return { title, h1, summary, description: fit(`${summary} See today's matches, yesterday's results and league tables.`) };
    }
    const summary = `${plural(n, "fixture", "fixtures")} from ${comps} on ${dateLong}.`;
    const description = fitWithCompetitions(view.competitions, (list) => `${plural(n, "football fixture", "football fixtures")} tomorrow, ${dateShort}: kick-off times in UK time for ${list}.`);
    return { title, h1, summary, description };
  }

  const title = `Today's Football Matches – ${dateShort}`;
  const h1 = `Today's football matches – ${dateLong}`;
  if (!view.real) {
    return { title, h1, ...generic(`Today's football fixtures, kick-off times in UK time and scores from the Premier League, Champions League, LaLiga, Serie A, Bundesliga, Ligue 1 and more.`) };
  }
  if (n === 0) {
    const summary = `There are no matches today (${dateLong}) in the competitions MatchPulse covers.`;
    return { title, h1, summary, description: fit(`${summary} See yesterday's results, tomorrow's fixtures and league tables.`) };
  }
  const summary = `${plural(n, "match", "matches")} today from ${comps}.`;
  const description = fitWithCompetitions(view.competitions, (list) => `${plural(n, "football match", "football matches")} today, ${dateShort}: kick-off times in UK time, scores and results from ${list}.`);
  return { title, h1, summary, description };
}

function generic(description: string): { summary: string; description: string } {
  return { summary: "", description: fit(description) };
}
