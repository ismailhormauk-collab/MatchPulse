// Integrity checks for provider player rankings. Records that fail are taken
// out of the ranking (never corrected or estimated) and reported with a short
// reason. Pure module: no I/O, so it is unit-tested directly.

import type { PlayerStatLine } from "@/lib/api-football/core";

export type RankingMetric = "goals" | "assists";

export interface IntegrityContext {
  leagueId: number;
  season: number;
  metric: RankingMetric;
  competitionName: string;
  /** Most matches one team can play in a season of this competition. */
  maxMatches: number | null;
  /**
   * Clubs that took part in this league season (from its final standings),
   * or null when membership could not be checked.
   */
  clubIds: ReadonlySet<number> | null;
}

export interface ExcludedRecord {
  player: PlayerStatLine;
  reason: string;
}

export interface RankingCheck {
  /** Records that passed every check, in the provider's order. */
  ranked: PlayerStatLine[];
  excluded: ExcludedRecord[];
}

/** 90 minutes + 30 of extra time + generous stoppage time per match. */
const MAX_MINUTES_PER_MATCH = 130;

/** First failed check for a record, or null when it passes. */
export function integrityIssue(player: PlayerStatLine, context: IntegrityContext): string | null {
  const { record } = player;
  if (record.competitionRecords === 0) return `No ${context.competitionName} record in the provider's data.`;
  if (record.leagueId !== null && record.leagueId !== context.leagueId) return "Statistics belong to a different competition.";
  if (record.season !== null && record.season !== context.season) {
    return `Statistics are labelled as season ${record.season}, not the selected season.`;
  }
  if (record.competitionRecords > 1) {
    return `Statistics are split across ${record.clubs.length > 1 ? record.clubs.join(" and ") : "several records"}; the combined total can't be verified.`;
  }
  const max = context.maxMatches;
  if (max !== null && player.appearances !== null && player.appearances > max) {
    return `Listed with ${player.appearances} appearances, but a ${context.competitionName} season has at most ${max} matches per club.`;
  }
  if (max !== null && player.minutes !== null && player.minutes > max * MAX_MINUTES_PER_MATCH) {
    return `Listed with ${player.minutes} minutes, more than ${max} matches allow.`;
  }
  if (player[context.metric] === null) return `No ${context.metric} total supplied.`;
  if (!player.team) return "No club supplied.";
  if (context.clubIds && !context.clubIds.has(player.team.id)) {
    return `${player.team.name} did not play in this ${context.competitionName} season.`;
  }
  return null;
}

/**
 * Splits a provider ranking into verified records (provider order kept, so a
 * record with inflated totals cannot rank anywhere) and excluded ones.
 */
export function checkRanking(players: PlayerStatLine[], context: IntegrityContext): RankingCheck {
  const ranked: PlayerStatLine[] = [];
  const excluded: ExcludedRecord[] = [];
  for (const player of players) {
    const reason = integrityIssue(player, context);
    if (reason) excluded.push({ player, reason });
    else ranked.push(player);
  }
  return { ranked, excluded };
}
