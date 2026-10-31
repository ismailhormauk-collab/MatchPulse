import { getLeague } from "@/data/leagues";
import { formatDateKeyShort, formatTime, SITE_TIME_ZONE, zonedDateKey } from "@/lib/time";
import type { Match } from "@/lib/types";

// Search titles and descriptions for match pages, built only from the feed's
// real fields (teams, competition, UK date and time, status, score).

/** Title and description from the feed's real fields only (teams, competition, UK date, status, score). */
export function matchMetaCopy(match: Match): { title: string; description: string } {
  const { home, away } = match;
  const league = getLeague(match.leagueSlug)?.name;
  const date = formatDateKeyShort(zonedDateKey(match.kickoff, SITE_TIME_ZONE));
  const time = formatTime(match.kickoff, { timeZone: SITE_TIME_ZONE, timeFormat: "24h" });
  const comp = league ? ` – ${league}` : "";
  const scored = typeof match.homeScore === "number" && typeof match.awayScore === "number";
  if (match.status === "finished" && scored) {
    return {
      title: `${home.name} ${match.homeScore}-${match.awayScore} ${away.name}${comp} result`,
      description: `${home.name} ${match.homeScore}-${match.awayScore} ${away.name}${league ? ` in the ${league}` : ""} on ${date}: final score, goals, cards, lineups and match statistics where available.`,
    };
  }
  if (match.status === "postponed") {
    return {
      title: `${home.name} vs ${away.name}${comp} – ${match.statusDetail ?? "postponed"}`,
      description: `${home.name} vs ${away.name}${league ? ` (${league})` : ""}, scheduled for ${date}: ${(match.statusDetail ?? "postponed").toLowerCase()}.`,
    };
  }
  return {
    title: `${home.name} vs ${away.name}${comp}, ${date}`,
    description: `${home.name} vs ${away.name}${league ? ` in the ${league}` : ""}: kick-off ${time} UK time on ${date}. Score, events and lineups when the provider reports them.`,
  };
}
