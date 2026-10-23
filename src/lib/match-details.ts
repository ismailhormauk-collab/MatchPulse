import "server-only";

import { cache } from "react";
import { fixtureToMatch } from "@/lib/api-football/adapter";
import { describeError, type FixtureDetails } from "@/lib/api-football/core";
import { friendlyReason } from "@/lib/api-football/messages";
import { getFixtureDetails, isLiveDataEnabled } from "@/lib/api-football/server";
import { getMatchFeed } from "@/lib/match-feed";
import { buildMatchReport, type MatchReport } from "@/lib/match-report";
import { getStoredReport, saveReportOnce } from "@/lib/report-store";
import { getLeague } from "@/data/leagues";
import type { Match } from "@/lib/types";

export type MatchDetailsView =
  | { state: "invalid" }
  | { state: "disabled" }
  | { state: "feed-unavailable"; reason: string }
  | { state: "not-found" }
  | {
      state: "ok";
      /** Freshest summary: from the details response when available, else the feed. */
      match: Match;
      details: FixtureDetails | null;
      /** Set when the details request failed; `match` then comes from the feed. */
      detailsError: string | null;
      fetchedAt: string | null;
      /** MatchPulse Match Report, only for finished matches with consistent data. */
      report: MatchReport | null;
    };

/** Positive integer fixture IDs only (API-Football IDs fit in 32 bits). */
export function parseFixtureId(raw: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id <= 2_147_483_647 ? id : null;
}

/**
 * Feed entry for a fixture, without requesting details. Only fixtures in the
 * current feed (yesterday–tomorrow, supported competitions) are served, so
 * arbitrary IDs from crawlers or old links never spend API requests.
 */
export const loadMatchSummary = cache(async (rawId: string) => {
  const id = parseFixtureId(rawId);
  if (id === null) return { state: "invalid" } as const;
  if (!isLiveDataEnabled()) return { state: "disabled" } as const;
  const feed = await getMatchFeed();
  if (feed.source.kind !== "api-football") {
    const reason = "reason" in feed.source ? feed.source.reason : "Fixtures are temporarily unavailable.";
    return { state: "feed-unavailable", reason } as const;
  }
  const match = feed.matches.find((item) => item.fixtureId === id);
  return match ? ({ state: "found", id, match } as const) : ({ state: "not-found" } as const);
});

export const loadMatchDetails = cache(async (rawId: string): Promise<MatchDetailsView> => {
  const summary = await loadMatchSummary(rawId);
  if (summary.state !== "found") return summary;

  try {
    const { details, fetchedAt } = await getFixtureDetails(summary.id);
    if (!details) return { state: "ok", match: summary.match, details: null, detailsError: null, fetchedAt, report: null };
    // Re-map with the feed's competition so status, score and crests stay consistent.
    const fresh = fixtureToMatch(details, new Map([[details.league.id, summary.match.leagueSlug]]));
    const report = await reportFor(details, summary.match.leagueSlug, fetchedAt);
    return { state: "ok", match: fresh ?? summary.match, details, detailsError: null, fetchedAt, report };
  } catch (error) {
    const { kind, message } = describeError(error);
    console.error(`[api-football] fixture ${summary.id} details failed (${kind}): ${message}`);
    // Details unavailable: a report saved earlier can still be shown.
    const report = await getStoredReport(summary.id);
    return { state: "ok", match: summary.match, details: null, detailsError: friendlyReason(kind), fetchedAt: null, report };
  }
});

/**
 * Stored report for the fixture, or a new one built from the details already
 * fetched for this page (no extra API request). Null when the match is not
 * finished or the data is insufficient or inconsistent.
 */
async function reportFor(details: FixtureDetails, leagueSlug: string, fetchedAt: string): Promise<MatchReport | null> {
  const stored = await getStoredReport(details.id);
  if (stored) return stored;
  const outcome = buildMatchReport(details, {
    leagueSlug,
    competition: getLeague(leagueSlug)?.name ?? details.league.name,
    dataFetchedAt: fetchedAt,
  });
  if (!outcome.ok) return null;
  // If the store can't be written (e.g. read-only disk), still show the report.
  return (await saveReportOnce(outcome.report)) ?? outcome.report;
}
