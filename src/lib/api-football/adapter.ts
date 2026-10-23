// Converts validated API-Football fixtures into MatchPulse `Match` objects.
// Type-only imports keep this loadable by plain Node scripts.

import type { Club, Match } from "@/lib/types";
import type { Fixture } from "./core";

const UPCOMING = new Set(["TBD", "NS"]);
const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);
const FINISHED = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const POSTPONED = new Set(["PST", "CANC", "ABD"]);

/** Short pill text for statuses the default labels don't describe. */
const DETAIL: Record<string, string> = {
  TBD: "Time TBC",
  HT: "Half-time",
  BT: "Break",
  P: "Penalties",
  SUSP: "Suspended",
  INT: "Interrupted",
  AET: "AET",
  PEN: "Penalties",
  AWD: "Awarded",
  WO: "Walkover",
  CANC: "Cancelled",
  ABD: "Abandoned",
};

/** Initials used by the neutral fallback badge, e.g. "Manchester United" → "MU". */
export function teamInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 3).map((word) => word[0]).join("") : (words[0] ?? "?").slice(0, 3)).toUpperCase();
}

/**
 * Club data for a provider team. Uses the crest URL from the same API
 * response when one passed validation; otherwise a neutral badge. No colours
 * or crests are invented for real teams.
 */
export function providerClub(team: { id: number; name: string; logo?: string | null }): Club {
  return {
    id: `apif-${team.id}`,
    name: team.name,
    short: teamInitials(team.name),
    primary: "#5e6675",
    secondary: "#e8ebf0",
    crest: team.logo ? { kind: "image", url: team.logo } : { kind: "neutral" },
  };
}

function clockFor(fixture: Fixture): Match["clock"] {
  const { short, elapsed, extra } = fixture.status;
  if (short === "HT") return { label: "HT", progress: 0.5 };
  if (short === "BT") return { label: "Break", progress: 1 };
  if (short === "P") return { label: "Pens", progress: 1 };
  if (elapsed === null) return undefined;
  return { label: extra ? `${elapsed}+${extra}'` : `${elapsed}'`, progress: Math.min(elapsed / 90, 1) };
}

/** Returns null for fixtures whose league is not supported. */
export function fixtureToMatch(fixture: Fixture, slugByLeagueId: ReadonlyMap<number, string>): Match | null {
  const leagueSlug = slugByLeagueId.get(fixture.league.id);
  if (!leagueSlug) return null;

  const short = fixture.status.short;
  const status: Match["status"] = LIVE.has(short)
    ? "live"
    : FINISHED.has(short)
      ? "finished"
      : POSTPONED.has(short)
        ? "postponed"
        : "upcoming";
  const knownCode = UPCOMING.has(short) || LIVE.has(short) || FINISHED.has(short) || POSTPONED.has(short);
  const hasScore = (status === "live" || status === "finished") && fixture.goals.home !== null && fixture.goals.away !== null;

  return {
    id: `apif-${fixture.id}`,
    source: "api-football",
    fixtureId: fixture.id,
    leagueSlug,
    kickoff: fixture.kickoff,
    home: providerClub(fixture.home),
    away: providerClub(fixture.away),
    status,
    // Unknown codes keep the provider's own wording rather than a guess.
    statusDetail: knownCode ? DETAIL[short] : fixture.status.long,
    homeScore: hasScore ? fixture.goals.home! : undefined,
    awayScore: hasScore ? fixture.goals.away! : undefined,
    clock: status === "live" ? clockFor(fixture) : undefined,
  };
}
