// MatchPulse Match Reports: short factual reports built only from provider
// match data (score, goal and card events, team statistics). Pure module with
// no I/O. Every sentence comes from a fixed template filled with supplied
// values: no quotes, opinions, tactics, injuries or transfers, and no report at
// all when the data is incomplete or inconsistent.

import type { FixtureDetails, FixtureEvent, TeamStatistics } from "@/lib/api-football/core";

export const REPORT_VERSION = 1;

export interface ReportTeam {
  id: number;
  name: string;
  logo: string | null;
}

export interface ReportGoal {
  minute: string;
  player: string;
  /** "home" / "away"; null for own goals, whose credited side is not stated. */
  side: "home" | "away" | null;
  kind: "goal" | "penalty" | "own-goal";
  assist: string | null;
}

export interface ReportCard {
  minute: string;
  player: string;
  side: "home" | "away";
  colour: "yellow" | "red";
}

export interface ReportStat {
  label: string;
  home: string;
  away: string;
}

export interface MatchReport {
  version: typeof REPORT_VERSION;
  /** API-Football fixture ID: the report's stable identifier. */
  fixtureId: number;
  leagueSlug: string;
  competition: string;
  round: string | null;
  kickoff: string;
  venue: string | null;
  home: ReportTeam;
  away: ReportTeam;
  score: { home: number; away: number };
  halftime: { home: number; away: number } | null;
  penalties: { home: number; away: number } | null;
  afterExtraTime: boolean;
  headline: string;
  summary: string[];
  goals: ReportGoal[];
  cards: ReportCard[];
  stats: ReportStat[];
  source: "API-Football";
  /** When the provider data was fetched. */
  dataFetchedAt: string;
  generatedAt: string;
}

export type ReportOutcome = { ok: true; report: MatchReport } | { ok: false; reason: string };

const FINISHED = new Set(["FT", "AET", "PEN"]);

function minuteLabel(event: FixtureEvent): string {
  if (event.elapsed === null) return "";
  return event.extra ? `${event.elapsed}+${event.extra}'` : `${event.elapsed}'`;
}

function minuteValue(event: FixtureEvent): number {
  return (event.elapsed ?? 0) + (event.extra ?? 0) / 100;
}

/** Scored goals only: missed penalties and anything else are left out. */
function goalKind(event: FixtureEvent): ReportGoal["kind"] | null {
  if (event.type.toLowerCase() !== "goal") return null;
  const detail = (event.detail ?? "").toLowerCase();
  if (detail.includes("missed")) return null;
  if (detail.includes("own goal")) return "own-goal";
  if (detail.includes("penalty")) return "penalty";
  return "goal";
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function pair(score: { home: number | null; away: number | null } | undefined) {
  return score && score.home !== null && score.away !== null ? { home: score.home, away: score.away } : null;
}

const STAT_LABELS: [type: string, label: string][] = [
  ["Ball Possession", "Possession"],
  ["Total Shots", "Shots"],
  ["Shots on Goal", "Shots on target"],
  ["Corner Kicks", "Corners"],
  ["Fouls", "Fouls"],
];

function statLines(stats: TeamStatistics[], homeId: number): ReportStat[] {
  const home = stats.find((team) => team.teamId === homeId);
  const away = stats.find((team) => team.teamId !== homeId);
  if (!home || !away) return [];
  const value = (team: TeamStatistics, type: string) => team.items.find((item) => item.type === type)?.value;
  return STAT_LABELS.flatMap(([type, label]) => {
    const h = value(home, type);
    const a = value(away, type);
    // Only when both teams have a value; nothing is filled in.
    return h !== undefined && h !== null && a !== undefined && a !== null ? [{ label, home: String(h), away: String(a) }] : [];
  });
}

/**
 * Builds a report, or explains why there is not enough verified data for one.
 * `competition` is the display name for the fixture's league.
 */
export function buildMatchReport(
  details: FixtureDetails,
  meta: { leagueSlug: string; competition: string; dataFetchedAt: string; now?: Date },
): ReportOutcome {
  if (!FINISHED.has(details.status.short)) return { ok: false, reason: "The match has not finished." };
  const score = pair(details.goals);
  if (!score) return { ok: false, reason: "No confirmed final score." };

  const homeId = details.home.id;
  const awayId = details.away.id;
  const side = (teamId: number | null) => (teamId === homeId ? "home" : teamId === awayId ? "away" : null);

  // Goals must account for the final score exactly (VAR-cancelled goals,
  // shoot-out kicks or missing events would break this, so no report).
  const goalEvents = details.events
    .filter((event) => goalKind(event) !== null)
    .sort((a, b) => minuteValue(a) - minuteValue(b));
  const total = score.home + score.away;
  if (total > 0 && goalEvents.length === 0) return { ok: false, reason: "Goal events are not available." };
  if (goalEvents.length !== total) return { ok: false, reason: "Goal events do not match the final score." };

  const goals: ReportGoal[] = [];
  for (const event of goalEvents) {
    const kind = goalKind(event)!;
    const team = side(event.teamId);
    if (!event.player || event.elapsed === null) return { ok: false, reason: "A goal is missing its scorer or minute." };
    if (kind !== "own-goal" && team === null) return { ok: false, reason: "A goal is not linked to either team." };
    goals.push({ minute: minuteLabel(event), player: event.player, side: kind === "own-goal" ? null : team, kind, assist: event.assist });
  }
  // Non-own goals per team can never exceed that team's score.
  if (goals.filter((g) => g.side === "home").length > score.home || goals.filter((g) => g.side === "away").length > score.away) {
    return { ok: false, reason: "Goal events do not match the final score." };
  }

  const cards: ReportCard[] = details.events
    .filter((event) => event.type.toLowerCase() === "card" && event.player && event.elapsed !== null && side(event.teamId))
    .sort((a, b) => minuteValue(a) - minuteValue(b))
    .map((event) => ({
      minute: minuteLabel(event),
      player: event.player!,
      side: side(event.teamId)!,
      colour: (event.detail ?? "").toLowerCase().includes("red") ? "red" : "yellow",
    }));

  const home = details.home.name;
  const away = details.away.name;
  const competition = meta.competition;
  // Half-time is reported only when the first-half goal events agree with it
  // (own goals in the first half make that unverifiable, so it is left out).
  const providerHalftime = pair(details.score.halftime);
  const firstHalf = goals.filter((_, index) => (goalEvents[index].elapsed ?? 0) <= 45);
  const halftime =
    providerHalftime &&
    !firstHalf.some((goal) => goal.kind === "own-goal") &&
    firstHalf.filter((goal) => goal.side === "home").length === providerHalftime.home &&
    firstHalf.filter((goal) => goal.side === "away").length === providerHalftime.away
      ? providerHalftime
      : null;
  const penalties = details.status.short === "PEN" ? pair(details.score.penalty) : null;
  if (details.status.short === "PEN" && !penalties) return { ok: false, reason: "Penalty shoot-out result is missing." };
  const afterExtraTime = details.status.short === "AET" || details.status.short === "PEN";
  const result = `${score.home}–${score.away}`;

  // Headline and summary: fixed factual templates only.
  let headline: string;
  let opening: string;
  if (penalties) {
    const winner = penalties.home > penalties.away ? home : away;
    headline = `${winner} win on penalties after ${home} ${result} ${away}`;
    opening = `${home} and ${away} drew ${result} after extra time in the ${competition}. ${winner} won the penalty shoot-out ${Math.max(penalties.home, penalties.away)}–${Math.min(penalties.home, penalties.away)}.`;
  } else if (score.home === score.away) {
    headline = total === 0 ? `${home} and ${away} play out a goalless draw` : `${home} and ${away} draw ${result}`;
    opening = `${home} and ${away} drew ${result} in the ${competition}${afterExtraTime ? " after extra time" : ""}.`;
  } else {
    const homeWon = score.home > score.away;
    const [winner, loser] = homeWon ? [home, away] : [away, home];
    const margin = homeWon ? `${score.home}–${score.away}` : `${score.away}–${score.home}`;
    headline = `${winner} beat ${loser} ${margin}`;
    opening = `${winner} beat ${loser} ${margin} in the ${competition}${afterExtraTime ? " after extra time" : ""}.`;
  }

  const summary = [opening];
  if (halftime) {
    summary.push(
      halftime.home === halftime.away
        ? `The score was ${halftime.home}–${halftime.away} at half-time.`
        : `${halftime.home > halftime.away ? home : away} led ${halftime.home}–${halftime.away} at half-time.`,
    );
  }
  const scorerText = (which: "home" | "away") => {
    const byPlayer = new Map<string, string[]>();
    for (const goal of goals.filter((g) => g.side === which)) {
      byPlayer.set(goal.player, [...(byPlayer.get(goal.player) ?? []), goal.kind === "penalty" ? `${goal.minute} pen.` : goal.minute]);
    }
    return list([...byPlayer].map(([player, minutes]) => `${player} (${minutes.join(", ")})`));
  };
  const homeScorers = scorerText("home");
  const awayScorers = scorerText("away");
  if (homeScorers) summary.push(`Scorers for ${home}: ${homeScorers}.`);
  if (awayScorers) summary.push(`Scorers for ${away}: ${awayScorers}.`);
  const ownGoals = goals.filter((g) => g.kind === "own-goal");
  if (ownGoals.length) summary.push(`Own goal${ownGoals.length > 1 ? "s" : ""}: ${list(ownGoals.map((g) => `${g.player} (${g.minute})`))}.`);
  const reds = cards.filter((card) => card.colour === "red");
  if (reds.length) {
    summary.push(`${list(reds.map((card) => `${card.player} (${card.side === "home" ? home : away}, ${card.minute})`))} ${reds.length > 1 ? "were" : "was"} sent off.`);
  }
  const yellows = { home: cards.filter((c) => c.colour === "yellow" && c.side === "home").length, away: cards.filter((c) => c.colour === "yellow" && c.side === "away").length };
  if (yellows.home + yellows.away > 0) {
    summary.push(`Yellow cards: ${home} ${yellows.home}, ${away} ${yellows.away}.`);
  }
  const stats = statLines(details.statistics, homeId);
  const possession = stats.find((stat) => stat.label === "Possession");
  const shots = stats.find((stat) => stat.label === "Shots");
  const onTarget = stats.find((stat) => stat.label === "Shots on target");
  if (possession) summary.push(`Possession: ${home} ${possession.home}, ${away} ${possession.away}.`);
  if (shots) summary.push(`Shots: ${home} ${shots.home}, ${away} ${shots.away}${onTarget ? ` (on target ${onTarget.home} and ${onTarget.away})` : ""}.`);

  return {
    ok: true,
    report: {
      version: REPORT_VERSION,
      fixtureId: details.id,
      leagueSlug: meta.leagueSlug,
      competition,
      round: details.league.round,
      kickoff: details.kickoff,
      venue: details.venue.name ? [details.venue.name, details.venue.city].filter(Boolean).join(", ") : null,
      home: { id: homeId, name: home, logo: details.home.logo },
      away: { id: awayId, name: away, logo: details.away.logo },
      score,
      halftime,
      penalties,
      afterExtraTime,
      headline,
      summary,
      goals,
      cards,
      stats,
      source: "API-Football",
      dataFetchedAt: meta.dataFetchedAt,
      generatedAt: (meta.now ?? new Date()).toISOString(),
    },
  };
}
