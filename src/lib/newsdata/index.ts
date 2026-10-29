import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { sharedResult } from "@/lib/api-football/shared-cache";
import { liveDataAllowedInThisDeployment } from "@/lib/deployment";
import { storage } from "@/lib/storage";
import { fetchLatestFootballNews, NewsDataError, type ExternalHeadline } from "./client";

// "Latest Football News": external headlines from NewsData.io (headline,
// source, publication time and a link to the publisher only).
//
// - The key is read here, server-side only (NEWSDATA_API_KEY), and sent in the
//   X-ACCESS-KEY header; it never reaches the browser, URLs or logs.
// - At most one provider request per hour across all instances ("use cache" +
//   sharedResult on the storage layer); about 24 of the free plan's 200 daily
//   credits.
// - When a refresh fails, the last good list (up to 3 days old) is shown with
//   its fetch time.
// - Vercel Preview deployments make no requests unless
//   MATCHPULSE_PREVIEW_LIVE_DATA=true; MATCHPULSE_EXTERNAL_NEWS=off disables it.

export type { ExternalHeadline } from "./client";

export interface ExternalNewsFeed {
  headlines: ExternalHeadline[];
  /** When MatchPulse fetched the list from NewsData.io. */
  fetchedAt: string;
}

export type ExternalNewsView =
  | {
      state: "ok";
      headlines: ExternalHeadline[];
      fetchedAt: string;
      /** True when this is the last good list because the latest refresh failed. */
      stale: boolean;
      /** Hours between the newest headline's publication and the fetch (the provider's delay), rounded. */
      delayHours: number | null;
    }
  | { state: "unavailable" }
  | { state: "disabled" };

const REFRESH_SECONDS = 3600;
const LAST_GOOD_SECONDS = 3 * 24 * 3600;
const LAST_GOOD_KEY = "newsdata:last-good";
const SHARED_KEY = "newsdata:latest-football";

function apiKey(): string | null {
  return process.env.NEWSDATA_API_KEY?.trim() || null;
}

export function externalNewsEnabled(): boolean {
  return process.env.MATCHPULSE_EXTERNAL_NEWS?.trim().toLowerCase() !== "off" && apiKey() !== null && liveDataAllowedInThisDeployment();
}

/**
 * How long a failure is shared before the next attempt: short for the
 * request-rate window, longer when retrying cannot help soon (exported for tests).
 */
export function failureSeconds(kind: string): number {
  if (kind === "unauthorized") return 6 * 3600;
  if (kind === "quota_exhausted") return 3 * 3600;
  if (kind === "rate_limited") return 15 * 60;
  return 10 * 60;
}

function readFeed(text: string | null): ExternalNewsFeed | null {
  if (!text) return null;
  try {
    const feed = JSON.parse(text) as Partial<ExternalNewsFeed>;
    if (!Array.isArray(feed.headlines) || typeof feed.fetchedAt !== "string") return null;
    const headlines = feed.headlines.filter(
      (item): item is ExternalHeadline =>
        !!item &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.source === "string" &&
        typeof item.publishedAt === "string" &&
        typeof item.url === "string" &&
        item.url.startsWith("https://"),
    );
    return headlines.length ? { headlines, fetchedAt: feed.fetchedAt } : null;
  } catch {
    return null;
  }
}

async function cachedFeed(): Promise<{ feed: ExternalNewsFeed | null; stale: boolean }> {
  "use cache";
  cacheTag("newsdata");
  const key = apiKey();
  const result = await sharedResult<ExternalNewsFeed>(
    SHARED_KEY,
    async () => {
      try {
        if (!key) throw new NewsDataError("unauthorized", "NEWSDATA_API_KEY is not set");
        const fetchedAt = new Date().toISOString();
        const { headlines, rejected } = await fetchLatestFootballNews(key);
        const skipped = Object.entries(rejected).filter(([, count]) => count > 0);
        if (skipped.length) console.info(`[newsdata] kept ${headlines.length}; skipped ${skipped.map(([why, n]) => `${n} ${why}`).join(", ")}`);
        const feed = { headlines, fetchedAt };
        if (headlines.length) await storage().set(LAST_GOOD_KEY, JSON.stringify(feed), LAST_GOOD_SECONDS);
        return { ok: true, value: feed };
      } catch (error) {
        const kind = error instanceof NewsDataError ? error.kind : "unknown";
        const message = (error instanceof Error ? error.message : "unknown error").split(key ?? "\u0000").join("[redacted]");
        console.error(`[newsdata] refresh failed (${kind}): ${message}`);
        return { ok: false, error: { kind, message } };
      }
    },
    (entry) => (entry.ok ? REFRESH_SECONDS : failureSeconds(entry.error.kind)),
  );

  if (result.ok && result.value.headlines.length) {
    cacheLife({ stale: 300, revalidate: REFRESH_SECONDS, expire: 2 * REFRESH_SECONDS });
    return { feed: result.value, stale: false };
  }
  // Failed, or nothing usable this hour: fall back to the last good list.
  cacheLife({ stale: 60, revalidate: result.ok ? REFRESH_SECONDS : failureSeconds(result.error.kind), expire: 2 * REFRESH_SECONDS });
  return { feed: readFeed(await storage().get(LAST_GOOD_KEY)), stale: true };
}

function delayHours(feed: ExternalNewsFeed): number | null {
  const newest = Math.max(...feed.headlines.map((item) => Date.parse(item.publishedAt)));
  const fetched = Date.parse(feed.fetchedAt);
  if (!Number.isFinite(newest) || !Number.isFinite(fetched) || fetched < newest) return null;
  return Math.round((fetched - newest) / 3_600_000);
}

/** External football headlines, newest first. Never throws. */
export async function loadExternalNews(): Promise<ExternalNewsView> {
  if (!externalNewsEnabled()) return { state: "disabled" };
  await connection();
  try {
    const { feed, stale } = await cachedFeed();
    if (!feed) return { state: "unavailable" };
    return { state: "ok", headlines: feed.headlines, fetchedAt: feed.fetchedAt, stale, delayHours: delayHours(feed) };
  } catch (error) {
    console.error(`[newsdata] loading failed: ${error instanceof Error ? error.name : "error"}`);
    return { state: "unavailable" };
  }
}
