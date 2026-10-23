import { getClub } from "@/data/clubs";
import type { Match } from "@/lib/types";

/**
 * DEVELOPMENT SAMPLE DATA.
 * Fixtures and scores below are invented for layout work only.
 * They are not real results and must not be presented as live scores.
 * Replace with an API-backed source before launch.
 */

/**
 * The fixed instant the sample data treats as "now". Statuses are consistent
 * with it: finished matches kicked off well before, live ones are in play,
 * upcoming ones start later. Live minutes are derived from it (see matchClock).
 */
export const SAMPLE_NOW = "2026-10-21T17:45:00Z";

type Row = [
  leagueSlug: string,
  /** Kickoff time "HH:MM" in UTC on the date the row is grouped under. */
  kickoffUtc: string,
  homeId: string,
  awayId: string,
  status: Match["status"],
  homeScore?: number,
  awayScore?: number,
];

/** Rows grouped by UTC calendar date. */
const fixturesByUtcDate: Record<string, Row[]> = {
  "2026-10-19": [
    ["premier-league", "20:00", "aston-villa", "tottenham", "finished", 2, 2],
    ["laliga", "20:00", "sevilla", "villarreal", "finished", 0, 1],
    ["serie-a", "18:45", "roma", "napoli", "finished", 1, 1],
    ["saudi-pro-league", "17:00", "al-ittihad", "al-ahli-sfc", "finished", 3, 1],
  ],
  "2026-10-20": [
    ["champions-league", "16:45", "club-brugge", "psv", "finished", 1, 0],
    ["champions-league", "19:00", "real-madrid", "leverkusen", "finished", 3, 1],
    ["champions-league", "19:00", "man-city", "benfica", "finished", 2, 0],
    ["champions-league", "19:00", "psg", "napoli", "finished", 1, 1],
    ["champions-league", "19:00", "atletico", "celtic", "finished", 4, 0],
    ["egyptian-premier-league", "16:00", "zamalek", "pyramids", "finished", 0, 0],
    ["mls", "23:30", "la-galaxy", "seattle", "finished", 2, 3],
  ],
  "2026-10-21": [
    ["copa-sudamericana", "00:30", "racing", "fluminense", "finished", 0, 2],
    ["copa-libertadores", "00:30", "boca", "palmeiras", "finished", 1, 3],
    ["caf-champions-league", "13:00", "wydad", "esperance", "finished", 1, 0],
    ["champions-league", "13:00", "galatasaray", "monaco", "finished", 2, 1],
    ["egyptian-premier-league", "14:00", "zamalek", "al-ahly", "finished", 1, 1],
    ["caf-champions-league", "16:10", "mamelodi", "al-ahly", "live", 0, 2],
    ["champions-league", "16:15", "lille", "aston-villa", "live", 1, 1],
    ["laliga", "16:40", "atletico", "sevilla", "live", 2, 0],
    ["saudi-pro-league", "17:15", "al-hilal", "al-ittihad", "live", 3, 2],
    ["saudi-pro-league", "18:00", "al-nassr", "al-ahli-sfc", "upcoming"],
    ["champions-league", "19:00", "bayern", "arsenal", "upcoming"],
    ["champions-league", "19:00", "barcelona", "juventus", "upcoming"],
    ["champions-league", "19:00", "inter", "dortmund", "upcoming"],
    ["champions-league", "19:00", "liverpool", "leipzig", "upcoming"],
    ["champions-league", "19:00", "chelsea", "feyenoord", "upcoming"],
    ["champions-league", "19:00", "sporting", "ac-milan", "upcoming"],
    ["caf-champions-league", "19:00", "raja", "pyramids", "postponed"],
    ["copa-libertadores", "22:30", "flamengo", "river-plate", "upcoming"],
    ["mls", "23:30", "inter-miami", "lafc", "upcoming"],
  ],
  "2026-10-22": [
    ["europa-league", "16:45", "roma", "porto", "upcoming"],
    ["europa-league", "19:00", "tottenham", "ajax", "upcoming"],
    ["europa-league", "19:00", "lazio", "newcastle", "upcoming"],
    ["conference-league", "16:45", "villarreal", "celtic", "upcoming"],
    ["botola-pro", "18:00", "raja", "wydad", "upcoming"],
  ],
  "2026-10-23": [
    ["bundesliga", "18:30", "dortmund", "leverkusen", "upcoming"],
    ["ligue-1", "18:45", "monaco", "lille", "upcoming"],
    ["eredivisie", "18:00", "psv", "feyenoord", "upcoming"],
  ],
};

export const sampleMatches: Match[] = Object.entries(fixturesByUtcDate).flatMap(([utcDate, rows]) =>
  rows.map(([leagueSlug, kickoffUtc, homeId, awayId, status, homeScore, awayScore], index) => ({
    id: `sample-${utcDate}-${index}`,
    source: "sample",
    leagueSlug,
    kickoff: `${utcDate}T${kickoffUtc}:00Z`,
    home: getClub(homeId),
    away: getClub(awayId),
    status,
    homeScore,
    awayScore,
  })),
);
