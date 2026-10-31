import "server-only";

import { connection } from "next/server";
import { cache } from "react";
import { SAMPLE_NOW, sampleMatches } from "@/data/matches";
import { fixtureToMatch } from "@/lib/api-football/adapter";
import { describeError } from "@/lib/api-football/core";
import { friendlyReason } from "@/lib/api-football/messages";
import { recordKnownFixtures } from "@/lib/fixture-index";
import { recordDayContents } from "@/lib/day-changes";
import {
  getFixturesByDate,
  getSupportedCompetitions,
  isLiveDataEnabled,
  revalidateSeconds,
} from "@/lib/api-football/server";
import { shiftDateKey, SITE_TIME_ZONE, zonedDateKey } from "@/lib/time";
import type { FeedSource, Match } from "@/lib/types";

export type { FeedSource };

export interface MatchFeed {
  matches: Match[];
  /** The instant treated as "now": request time for real data, fixed for samples. */
  now: string;
  source: FeedSource;
  /** Calendar days covered, in the site time zone (UK time). */
  days: MatchDays;
}

export interface MatchDays {
  yesterday: string;
  today: string;
  tomorrow: string;
}

/** Yesterday, today and tomorrow ("YYYY-MM-DD") in UK time at `now`. */
export function siteDays(now: string | Date): MatchDays {
  const today = zonedDateKey(now, SITE_TIME_ZONE);
  return { yesterday: shiftDateKey(today, -1), today, tomorrow: shiftDateKey(today, 1) };
}

/**
 * Match data for the match centre.
 *
 * Without `MATCHPULSE_DATA_SOURCE=api-football` and an API key this returns
 * the labelled sample data and never touches the network, so the page stays
 * prerendered. With them, it defers to request time and reads yesterday,
 * today and tomorrow in UK time (three cached API-Football calls, one per
 * calendar day); a visitor's own time zone then regroups them in the browser.
 */
// React cache: one feed per server request, shared by metadata and the page.
export const getMatchFeed = cache(async function getMatchFeed(): Promise<MatchFeed> {
  if (!isLiveDataEnabled()) {
    return { matches: sampleMatches, now: SAMPLE_NOW, source: { kind: "sample" }, days: siteDays(SAMPLE_NOW) };
  }

  await connection();
  const nowMs = Date.now();
  const days = siteDays(new Date(nowMs));

  try {
    const competitions = await getSupportedCompetitions();
    if (competitions.resolved.length === 0) throw new Error("None of the supported competitions could be resolved.");
    const slugByLeagueId = new Map(competitions.resolved.map((item) => [item.leagueId, item.slug]));
    const leagueIds = [...slugByLeagueId.keys()].sort((a, b) => a - b);

    const requests = [
      getFixturesByDate(days.yesterday, "past", leagueIds, SITE_TIME_ZONE),
      getFixturesByDate(days.today, "today", leagueIds, SITE_TIME_ZONE),
      getFixturesByDate(days.tomorrow, "future", leagueIds, SITE_TIME_ZONE),
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
    // Sitemap lastmod of the daily pages: stored only when a day's fixtures,
    // statuses or scores change. Days whose request failed are left untouched.
    const complete = [days.yesterday, days.today, days.tomorrow].filter((_, index) => {
      const result = settled[index];
      return result.status === "fulfilled" && !result.value.truncated;
    });
    await recordDayContents(
      Object.fromEntries(complete.map((day) => [day, matches.filter((m) => zonedDateKey(m.kickoff, SITE_TIME_ZONE) === day)])),
      new Date(nowMs),
    );

    return {
      matches,
      now: new Date(nowMs).toISOString(),
      days,
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
      return { matches: sampleMatches, now: SAMPLE_NOW, source: { kind: "sample-fallback", reason }, days: siteDays(SAMPLE_NOW) };
    }
    return { matches: [], now: new Date(nowMs).toISOString(), source: { kind: "unavailable", reason }, days };
  }
});
