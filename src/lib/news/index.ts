import "server-only";
import { createHash } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { sharedResult } from "@/lib/api-football/shared-cache";
import { storage } from "@/lib/storage";
import type { NewsItem } from "@/lib/types";
import { KooraError, loadKooraNews, readArticleRecord, type ArticleMemory, type KooraArticle, type KooraFeed } from "./koora";
import { reviewedHeadline } from "./corrections";
import { createHeadlineTranslator, translationProvider } from "./translate";

// News section data: the latest Koora headlines (links only, see ./koora.ts).
//
// Freshness without fetching per visitor:
// - "use cache" keeps the feed in memory for 30 minutes per server instance;
// - sharedResult() shares it across instances and restarts (Redis or local
//   files), so koora.com is read at most about twice an hour;
// - article metadata is remembered for 30 days, so a refresh reads robots.txt,
//   the news sitemap and only articles it has not seen before;
// - when koora.com can't be reached, the last good list (up to 14 days old) is
//   shown with its fetch time.
//
// Headlines are translated into English when first fetched (free MyMemory API,
// see ./translate.ts) and stored with the article, so each is translated once.
//
// MATCHPULSE_NEWS_SOURCE=off disables it (tests, offline builds).

export type NewsView =
  | { state: "ok"; items: NewsItem[]; fetchedAt: string; stale: boolean }
  | { state: "unavailable"; reason: string }
  | { state: "disabled" };

const FEED_SECONDS = 30 * 60;
const FAILURE_SECONDS = 5 * 60;
const ARTICLE_SECONDS = 30 * 24 * 3600;
const INVALID_SECONDS = 24 * 3600;
const LAST_GOOD_SECONDS = 14 * 24 * 3600;
const LAST_GOOD_KEY = "news:koora:last-good";

export function newsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const source = env.MATCHPULSE_NEWS_SOURCE?.trim().toLowerCase();
  return !source || source === "koora";
}

const articleKey = (url: string) => `news:koora:article:${createHash("sha1").update(url).digest("hex")}`;

// Used when no persistent storage is configured (memory of this instance only).
const localMemory = new Map<string, string>();

function articleMemory(): ArticleMemory {
  const store = storage();
  return {
    async get(url) {
      const key = articleKey(url);
      return readArticleRecord(store.persistent ? await store.get(key) : (localMemory.get(key) ?? null));
    },
    async set(url, value) {
      const key = articleKey(url);
      const text = JSON.stringify(value);
      if (store.persistent) await store.set(key, text, value === "invalid" ? INVALID_SECONDS : ARTICLE_SECONDS);
      else localMemory.set(key, text);
    },
  };
}

function readFeed(text: string | null): KooraFeed | null {
  if (!text) return null;
  try {
    const feed = JSON.parse(text) as KooraFeed;
    const articles = Array.isArray(feed?.articles)
      ? feed.articles.map((article) => readArticleRecord(JSON.stringify(article))).filter((a): a is KooraArticle => !!a && a !== "invalid")
      : [];
    return articles.length && typeof feed.fetchedAt === "string" ? { articles, fetchedAt: feed.fetchedAt, partial: Boolean(feed.partial) } : null;
  } catch {
    return null;
  }
}

async function cachedFeed() {
  "use cache";
  cacheTag("news", "news:koora");
  const result = await sharedResult<KooraFeed>(
    "news:koora:feed",
    async () => {
      try {
        const feed = await loadKooraNews({ memory: articleMemory(), translate: createHeadlineTranslator() });
        await storage().set(LAST_GOOD_KEY, JSON.stringify(feed), LAST_GOOD_SECONDS);
        return { ok: true, value: feed };
      } catch (error) {
        const kind = error instanceof KooraError ? error.kind : "unknown";
        const message = error instanceof Error ? error.message : "unknown error";
        console.error(`[news] Koora refresh failed (${kind}): ${message}`);
        return { ok: false, error: { kind, message } };
      }
    },
    (entry) => (entry.ok ? FEED_SECONDS : FAILURE_SECONDS),
  );

  if (result.ok) {
    cacheLife({ stale: 300, revalidate: FEED_SECONDS, expire: 4 * FEED_SECONDS });
    return { feed: result.value, stale: false, error: null };
  }
  cacheLife({ stale: 30, revalidate: FAILURE_SECONDS, expire: 2 * FAILURE_SECONDS });
  const lastGood = readFeed(await storage().get(LAST_GOOD_KEY));
  return { feed: lastGood, stale: true, error: result.error.kind };
}

/** Reviewed wording first, then the stored machine translation; none when translation is off. */
function englishTitle(article: KooraArticle): Pick<NewsItem, "titleEn" | "titleEnSource"> {
  if (translationProvider() === "off") return {};
  const reviewed = reviewedHeadline(article.title);
  if (reviewed) return { titleEn: reviewed, titleEnSource: "reviewed" };
  return article.titleEn ? { titleEn: article.titleEn, titleEnSource: "machine" } : {};
}

function toItem(article: KooraArticle): NewsItem {
  return {
    id: article.url,
    url: article.url,
    title: article.title,
    ...englishTitle(article),
    publishedAt: article.publishedAt,
    source: "Koora",
  };
}

/** The latest Koora stories, newest first. Never throws. */
export async function loadNews(): Promise<NewsView> {
  if (!newsEnabled()) return { state: "disabled" };
  await connection();
  try {
    const { feed, stale, error } = await cachedFeed();
    if (!feed) {
      return {
        state: "unavailable",
        reason: error === "robots" ? "Koora's robots.txt no longer allows reading its news section." : "Koora could not be reached just now.",
      };
    }
    return { state: "ok", items: feed.articles.map(toItem), fetchedAt: feed.fetchedAt, stale };
  } catch (error) {
    console.error(`[news] loading failed: ${error instanceof Error ? error.message : "unknown error"}`);
    return { state: "unavailable", reason: "News could not be loaded just now." };
  }
}
