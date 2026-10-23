import "server-only";

import { connection } from "next/server";
import { cache } from "react";
import { SAMPLE_NOW, sampleMatches } from "@/data/matches";
import { fixtureToMatch } from "@/lib/api-football/adapter";
import { describeError } from "@/lib/api-football/core";
import { friendlyReason } from "@/lib/api-football/messages";
import { recordKnownFixtures } from "@/lib/fixture-index";
import {
  getFixturesByDate,
  getSupportedCompetitions,
  isLiveDataEnabled,
  revalidateSeconds,
} from "@/lib/api-football/server";
import type { FeedSource, Match } from "@/lib/types";

export type { FeedSource };

export interface MatchFeed {
  matches: Match[];
  /** The instant treated as "now": request time for real data, fixed for samples. */
  now: string;
  source: FeedSource;
}

const DAY_MS = 86_400_000;
const utcDateKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Match data for the match centre.
 *
 * Without `MATCHPULSE_DATA_SOURCE=api-football` and an API key this returns
 * the labelled sample data and never touches the network, so the page stays
 * prerendered. With them, it defers to request time and reads yesterday,
 * today and tomorrow (UTC) from cached API-Football calls; the selected time
 * zone then regroups them on the client.
 */
// React cache: one feed per server request, shared by metadata and the page.
export const getMatchFeed = cache(async function getMatchFeed(): Promise<MatchFeed> {
  if (!isLiveDataEnabled()) {
    return { matches: sampleMatches, now: SAMPLE_NOW, source: { kind: "sample" } };
  }

  await connection();
  const nowMs = Date.now();

  try {
    const competitions = await getSupportedCompetitions();
    if (competitions.resolved.length === 0) throw new Error("None of the supported competitions could be resolved.");
    const slugByLeagueId = new Map(competitions.resolved.map((item) => [item.leagueId, item.slug]));
    const leagueIds = [...slugByLeagueId.keys()].sort((a, b) => a - b);

    const requests = [
      getFixturesByDate(utcDateKey(nowMs - DAY_MS), "past", leagueIds),
      getFixturesByDate(utcDateKey(nowMs), "today", leagueIds),
      getFixturesByDate(utcDateKey(nowMs + DAY_MS), "future", leagueIds),
    ];
    const settled = await Promise.allSettled(requests);
    const today = settled[1];
    // Today's fixtures are essential; neighbouring days are best effort.
    if (today.status === "rejected") throw today.reason;

    const matches: Match[] = [];
    let partial = false;
    for (const result of settled) {
      if (result.status === "rejected") {
        partial = true;
        const { kind, message } = describeError(result.reason);
        console.error(`[api-football] fixtures by date failed (${kind}): ${message}`);
        continue;
      }
      if (result.value.truncated) partial = true;
      for (const fixture of result.value.fixtures) {
        const match = fixtureToMatch(fixture, slugByLeagueId);
        if (match) matches.push(match);
      }
    }

    // Lets src/proxy.ts return real 404s for unknown /matches/[id] URLs.
    await recordKnownFixtures(matches.flatMap((match) => (match.fixtureId ? [match.fixtureId] : [])));

    return {
      matches,
      now: new Date(nowMs).toISOString(),
      source: {
        kind: "api-football",
        fetchedAt: today.value.fetchedAt,
        refreshSeconds: today.value.refreshSeconds ?? revalidateSeconds().today,
        unresolved: competitions.unresolved.map((item) => item.label),
        partial,
      },
    };
  } catch (error) {
    const { kind, message } = describeError(error);
    console.error(`[api-football] match feed failed (${kind}): ${message}`);
    const reason = friendlyReason(kind, "Fixtures are temporarily unavailable.");
    if (process.env.NODE_ENV === "development") {
      return { matches: sampleMatches, now: SAMPLE_NOW, source: { kind: "sample-fallback", reason } };
    }
    return { matches: [], now: new Date(nowMs).toISOString(), source: { kind: "unavailable", reason } };
  }
});
