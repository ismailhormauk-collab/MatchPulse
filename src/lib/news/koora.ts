// Koora (koora.com) news headlines: discovery, parsing and validation.
//
// Koora publishes no RSS feed, API or reuse licence ("All rights reserved"),
// so MatchPulse shows links only: each story's headline, its publication date
// and a link to the original article. No article text, summaries or images
// are copied.
//
// Access follows koora.com/robots.txt (checked on every refresh): the public
// news sitemap lists article URLs, and each article page's own NewsArticle
// metadata (JSON-LD) gives the headline and publication date. Article pages
// are fetched once and remembered; a refresh fetches at most a few new ones.

export const KOORA_ORIGIN = "https://koora.com";
export const KOORA_NAME = "Koora";
const NEWS_SECTION = "/الأخبار/";
const ROBOTS_URL = `${KOORA_ORIGIN}/robots.txt`;
const SITEMAP_URL = `${KOORA_ORIGIN}/sitemap/news.xml`;
const USER_AGENT_TOKEN = "MatchPulseNewsBot";

export interface KooraArticle {
  /** Canonical, percent-encoded article URL on koora.com. */
  url: string;
  /** Headline exactly as Koora published it (Arabic). */
  title: string;
  /** ISO timestamp from the article's own datePublished. */
  publishedAt: string;
  /** Sitemap lastmod when the article was read (used to notice corrections). */
  lastmod: string | null;
  /** English machine translation of the headline (see translate.ts). */
  titleEn?: string;
  /** When translation last failed (retried after TRANSLATION_RETRY_MS). */
  titleEnFailedAt?: string;
}

export interface SitemapEntry {
  url: string;
  lastmod: string | null;
}

// ---- URLs ---------------------------------------------------------------------

/** Canonical article URL, or null when the URL is not a Koora news article. */
export function kooraArticleUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname !== "koora.com" && url.hostname !== "www.koora.com") return null;
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (!path.startsWith(NEWS_SECTION)) return null;
  const slug = path.slice(NEWS_SECTION.length);
  if (!slug || slug.includes("/")) return null;
  return new URL(`${NEWS_SECTION}${slug}`, KOORA_ORIGIN).href;
}

// ---- robots.txt ---------------------------------------------------------------

/**
 * True when robots.txt lets a generic crawler (or MatchPulseNewsBot) fetch
 * `path`: the most specific matching Allow/Disallow rule wins; Allow wins ties.
 */
export function robotsAllows(robots: string, path: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (field === "allow" || field === "disallow")) current.rules.push({ allow: field === "allow", path: value });
    }
  }
  const own = groups.filter((group) => group.agents.includes(USER_AGENT_TOKEN.toLowerCase()));
  const chosen = own.length ? own : groups.filter((group) => group.agents.includes("*"));
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of chosen.flatMap((group) => group.rules)) {
    if (!rule.path) continue; // "Disallow:" with no path allows everything
    if (!robotsPatternMatches(rule.path, path)) continue;
    const length = rule.path.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) best = { allow: rule.allow, length };
  }
  return best ? best.allow : true;
}

function robotsPatternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}

// ---- Sitemap ------------------------------------------------------------------

function xmlText(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

function isoOrNull(value: string | undefined | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** News article URLs from the sitemap, without duplicates, newest lastmod first. */
export function parseNewsSitemap(xml: string): SitemapEntry[] {
  const byUrl = new Map<string, SitemapEntry>();
  for (const block of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = /<loc>([\s\S]*?)<\/loc>/.exec(block)?.[1];
    const url = loc ? kooraArticleUrl(xmlText(loc)) : null;
    if (!url) continue;
    const lastmod = isoOrNull(xmlText(/<lastmod>([\s\S]*?)<\/lastmod>/.exec(block)?.[1] ?? ""));
    const previous = byUrl.get(url);
    if (!previous || (lastmod ?? "") > (previous.lastmod ?? "")) byUrl.set(url, { url, lastmod });
  }
  return [...byUrl.values()].sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? ""));
}

// ---- Article metadata ------------------------------------------------------------

function cleanHeadline(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length >= 4 && text.length <= 300 ? text : null;
}

function jsonLdNodes(html: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      const node = value as Record<string, unknown>;
      nodes.push(node);
      if (node["@graph"]) visit(node["@graph"]);
    }
  };
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(match[1]));
    } catch {
      // Ignore malformed blocks.
    }
  }
  return nodes;
}

/**
 * Headline and publication date from an article page's NewsArticle metadata.
 * Returns null unless the page describes this exact URL with a valid
 * headline and a publication date that is not in the future.
 */
export function parseArticlePage(html: string, url: string, now = Date.now()): Omit<KooraArticle, "lastmod"> | null {
  const article = jsonLdNodes(html).find((node) => {
    const type = node["@type"];
    return type === "NewsArticle" || (Array.isArray(type) && type.includes("NewsArticle"));
  });
  if (!article) return null;

  const page = article.mainEntityOfPage;
  const pageId = typeof page === "string" ? page : page && typeof page === "object" ? (page as Record<string, unknown>)["@id"] : null;
  if (typeof pageId === "string" && kooraArticleUrl(pageId) !== url) return null;

  const title = cleanHeadline(article.headline);
  const publishedAt = isoOrNull(typeof article.datePublished === "string" ? article.datePublished : null);
  if (!title || !publishedAt) return null;
  if (Date.parse(publishedAt) > now + 3600_000) return null; // never show a future date
  return { url, title, publishedAt };
}

// ---- Loading ------------------------------------------------------------------

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** A headline that could not be translated reliably is retried after this long. */
export const TRANSLATION_RETRY_MS = 12 * 3600_000;

/** Remembers article metadata between refreshes (storage when available). */
export interface ArticleMemory {
  get(url: string): Promise<KooraArticle | "invalid" | null>;
  set(url: string, value: KooraArticle | "invalid"): Promise<void>;
}

export interface LoadOptions {
  fetch?: Fetcher;
  memory: ArticleMemory;
  now?: number;
  /** Stories returned. */
  limit?: number;
  /** New article pages fetched per refresh at most (keeps load on Koora light). */
  maxPageFetches?: number;
  /** Pause between article page requests. */
  pauseMs?: number;
  /** Headline translation, applied once per article (see translate.ts). */
  translate?: (title: string) => Promise<string | null>;
  /** Translations per refresh at most. */
  maxTranslations?: number;
  userAgent?: string;
}

export interface KooraFeed {
  articles: KooraArticle[];
  fetchedAt: string;
  /** True when some recent stories were left for the next refresh. */
  partial: boolean;
}

export class KooraError extends Error {
  readonly kind: "robots" | "network" | "http" | "empty";

  constructor(kind: KooraError["kind"], message: string) {
    super(message);
    this.name = "KooraError";
    this.kind = kind;
  }
}

async function getText(fetcher: Fetcher, url: string, userAgent: string): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { "user-agent": userAgent, accept: "text/html,application/xml;q=0.9,*/*;q=0.5" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new KooraError("network", error instanceof Error ? error.name : "request failed");
  }
  if (!response.ok) throw new KooraError("http", `HTTP ${response.status}`);
  return response.text();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The latest Koora stories, newest publication date first. */
export async function loadKooraNews(options: LoadOptions): Promise<KooraFeed> {
  const {
    fetch: fetcher = fetch,
    memory,
    now = Date.now(),
    limit = 24,
    maxPageFetches = 8,
    pauseMs = 400,
    translate,
    maxTranslations = 24,
    userAgent = `${USER_AGENT_TOKEN}/1.0 (+headline links to koora.com)`,
  } = options;

  const robots = await getText(fetcher, ROBOTS_URL, userAgent);
  if (!robotsAllows(robots, new URL(SITEMAP_URL).pathname) || !robotsAllows(robots, encodeURI(NEWS_SECTION))) {
    throw new KooraError("robots", "koora.com/robots.txt does not allow reading the news section");
  }

  const entries = parseNewsSitemap(await getText(fetcher, SITEMAP_URL, userAgent));
  if (entries.length === 0) throw new KooraError("empty", "the news sitemap lists no articles");

  // Candidates by sitemap date; the publication date decides the final order.
  const candidates = entries.slice(0, Math.ceil(limit * 1.5));
  const articles: KooraArticle[] = [];
  let fetches = 0;
  let partial = false;
  for (const entry of candidates) {
    let known = await memory.get(entry.url);
    const changed = known && known !== "invalid" && entry.lastmod && known.lastmod && entry.lastmod > known.lastmod;
    if (known === null || changed) {
      if (fetches >= maxPageFetches) {
        partial = true;
        if (known === null) continue;
      } else {
        if (fetches > 0) await sleep(pauseMs);
        fetches += 1;
        try {
          const parsed = parseArticlePage(await getText(fetcher, entry.url, userAgent), entry.url, now);
          // A translation stays valid while the Arabic headline is unchanged.
          const previous = known && known !== "invalid" && known.title === parsed?.title ? known : null;
          known = parsed
            ? {
                ...parsed,
                lastmod: entry.lastmod,
                ...(previous?.titleEn ? { titleEn: previous.titleEn } : {}),
                ...(previous?.titleEnFailedAt ? { titleEnFailedAt: previous.titleEnFailedAt } : {}),
              }
            : "invalid";
          await memory.set(entry.url, known);
        } catch (error) {
          if (!(error instanceof KooraError)) throw error;
          partial = true;
          if (known === null) continue; // try again next refresh
        }
      }
    }
    if (known && known !== "invalid") articles.push(known);
  }

  articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const latest = articles.slice(0, limit);

  // Newest first; each headline once. Failures wait TRANSLATION_RETRY_MS, and a
  // reached daily limit stops translating until a later refresh.
  if (translate) {
    let translations = 0;
    for (const [index, article] of latest.entries()) {
      if (article.titleEn) continue;
      if (article.titleEnFailedAt && now - Date.parse(article.titleEnFailedAt) < TRANSLATION_RETRY_MS) continue;
      if (translations >= maxTranslations) break;
      if (translations > 0) await sleep(pauseMs);
      translations += 1;
      let titleEn: string | null;
      try {
        titleEn = await translate(article.title);
      } catch (error) {
        if (error instanceof Error && error.name === "TranslationLimitError") break;
        titleEn = null;
      }
      const updated: KooraArticle = titleEn ? { ...article, titleEn } : { ...article, titleEnFailedAt: new Date(now).toISOString() };
      if (titleEn) delete updated.titleEnFailedAt;
      latest[index] = updated;
      await memory.set(article.url, latest[index]);
    }
  }

  if (latest.length === 0) throw new KooraError("empty", "no article could be read");
  return { articles: latest, fetchedAt: new Date(now).toISOString(), partial };
}

/** Validates a stored article record (anything malformed is ignored). */
export function readArticleRecord(text: string | null): KooraArticle | "invalid" | null {
  if (text === null) return null;
  try {
    const value = JSON.parse(text) as unknown;
    if (value === "invalid") return "invalid";
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    const url = typeof record.url === "string" ? kooraArticleUrl(record.url) : null;
    const title = cleanHeadline(record.title);
    const publishedAt = typeof record.publishedAt === "string" ? isoOrNull(record.publishedAt) : null;
    if (!url || !title || !publishedAt) return null;
    const titleEn = cleanHeadline(record.titleEn) ?? undefined;
    const titleEnFailedAt = typeof record.titleEnFailedAt === "string" ? isoOrNull(record.titleEnFailedAt) : null;
    const lastmod = typeof record.lastmod === "string" ? isoOrNull(record.lastmod) : null;
    return {
      url,
      title,
      publishedAt,
      lastmod,
      ...(titleEn ? { titleEn } : titleEnFailedAt ? { titleEnFailedAt } : {}),
    };
  } catch {
    return null;
  }
}
