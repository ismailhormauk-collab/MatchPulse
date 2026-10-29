// NewsData.io client: request, validation and filtering of external football
// headlines. Server-side only (the key is read from the environment by the
// caller and sent in the X-ACCESS-KEY header, never in the URL).
//
// Only these provider fields are read: article_id, title, link, source_name,
// source_id, pubDate, pubDateTZ and duplicate. Descriptions, full content,
// images and AI-generated fields are never read or stored.

export const NEWSDATA_ENDPOINT = "https://newsdata.io/api/1/latest";

/** The search verified for MatchPulse (association football, title-only matching). */
export const NEWSDATA_QUERY = {
  qInTitle: '"Premier League" OR "Champions League" OR "La Liga" OR "Serie A" OR "Bundesliga" OR "Ligue 1"',
  category: "sports",
  language: "en",
  country: "gb,es,it,de,fr",
  prioritydomain: "top",
  size: "10",
  removeduplicate: "1",
} as const;

/** An external headline, limited to what MatchPulse may show. */
export interface ExternalHeadline {
  id: string;
  title: string;
  /** Publisher name for attribution. */
  source: string;
  /** ISO timestamp: the publisher's publication time. */
  publishedAt: string;
  /** The original article on the publisher's site (https only). */
  url: string;
}

export class NewsDataError extends Error {
  readonly kind: "unauthorized" | "rate_limited" | "quota_exhausted" | "http" | "network" | "invalid_response" | "api";

  constructor(kind: NewsDataError["kind"], message: string) {
    super(message);
    this.name = "NewsDataError";
    this.kind = kind;
  }
}

export function newsDataUrl(): string {
  return `${NEWSDATA_ENDPOINT}?${new URLSearchParams(NEWSDATA_QUERY)}`;
}

// ---- Filtering ----------------------------------------------------------------

/** Aggregators and redirectors: their source names and links do not identify the publisher reliably. */
const AGGREGATOR_HOSTS = ["news.google.com", "google.com", "msn.com", "flipboard.com", "newsnow.co.uk", "ground.news", "newsbreak.com"];
const AGGREGATOR_SOURCES = /\b(google ?news|msn|flipboard|newsnow|ground ?news|newsbreak|yahoo ?news)\b/i;

/**
 * Time-sensitive wording that would mislead when shown hours later (the free
 * plan delays articles by about 12 hours): live coverage, streams, breaking news.
 */
const TIME_SENSITIVE = /\b(live|breaking|livestream|live-stream|streaming|stream|live ?blog|as it happens|how to watch|where to watch|watch now)\b/i;

const MAX_FUTURE_MS = 15 * 60_000;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** A character for a numeric escape, or "" when the code point is invalid (never throws). */
function fromCodePointSafe(code: number): string {
  const valid = Number.isInteger(code) && code > 0 && code <= 0x10ffff && (code < 0xd800 || code > 0xdfff);
  return valid ? String.fromCodePoint(code) : "";
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d{1,8});/g, (_, code: string) => fromCodePointSafe(Number(code)))
    .replace(/&#x([0-9a-f]{1,8});/gi, (_, code: string) => fromCodePointSafe(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function cleanHeadline(value: unknown): string | null {
  const text = str(value);
  if (!text) return null;
  const clean = decodeEntities(text)
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length >= 10 && clean.length <= 250 ? clean : null;
}

function isAggregatorHost(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return AGGREGATOR_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
  } catch {
    return false;
  }
}

/** https links to a publisher (not an aggregator), without credentials. */
export function publisherUrl(value: unknown): string | null {
  const text = str(value);
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (isAggregatorHost(url.href)) return null;
  return url.href;
}

/** "YYYY-MM-DD HH:MM:SS" in pubDateTZ (UTC unless stated) → ISO, or null. */
export function parsePubDate(value: unknown, timeZone: unknown): string | null {
  const text = str(value);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const tz = str(timeZone)?.toUpperCase() ?? "UTC";
  if (tz !== "UTC" && tz !== "GMT" && tz !== "ETC/UTC") return null; // we always request UTC
  const ms = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +match[6]);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

const normaliseTitle = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export interface FilterReport {
  headlines: ExternalHeadline[];
  rejected: { malformed: number; aggregator: number; timeSensitive: number; duplicate: number; future: number };
}

/** Validates, filters and de-duplicates raw results; newest first. */
export function filterResults(results: unknown, now = Date.now()): FilterReport {
  const rejected = { malformed: 0, aggregator: 0, timeSensitive: 0, duplicate: 0, future: 0 };
  const headlines: ExternalHeadline[] = [];
  const seen = { ids: new Set<string>(), urls: new Set<string>(), titles: new Set<string>() };

  for (const raw of Array.isArray(results) ? results : []) {
    if (!raw || typeof raw !== "object") {
      rejected.malformed += 1;
      continue;
    }
    const item = raw as Record<string, unknown>;
    const id = str(item.article_id);
    const title = cleanHeadline(item.title);
    const source = str(item.source_name) ?? str(item.source_id);
    const publishedAt = parsePubDate(item.pubDate, item.pubDateTZ);
    const rawUrl = str(item.link);
    if (!id || !title || !source || !publishedAt || !rawUrl) {
      rejected.malformed += 1;
      continue;
    }
    if (AGGREGATOR_SOURCES.test(source) || AGGREGATOR_SOURCES.test(str(item.source_id) ?? "") || isAggregatorHost(rawUrl)) {
      rejected.aggregator += 1;
      continue;
    }
    const url = publisherUrl(rawUrl);
    if (!url) {
      rejected.malformed += 1;
      continue;
    }
    if (Date.parse(publishedAt) > now + MAX_FUTURE_MS) {
      rejected.future += 1;
      continue;
    }
    if (TIME_SENSITIVE.test(title)) {
      rejected.timeSensitive += 1;
      continue;
    }
    const titleKey = normaliseTitle(title);
    if (item.duplicate === true || seen.ids.has(id) || seen.urls.has(url) || seen.titles.has(titleKey)) {
      rejected.duplicate += 1;
      continue;
    }
    seen.ids.add(id);
    seen.urls.add(url);
    seen.titles.add(titleKey);
    headlines.push({ id, title, source: source.slice(0, 80), publishedAt, url });
  }

  headlines.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return { headlines, rejected };
}

// ---- Request ------------------------------------------------------------------

/**
 * Which limit an error refers to: the daily credit allowance (retrying soon
 * cannot help) or the short request-rate window (e.g. RateLimitExceeded, which
 * clears within minutes). Null when the error is not about a limit.
 */
export function classifyLimit(text: string): "quota_exhausted" | "rate_limited" | null {
  if (/\b(credits?|quota|daily|per day|plan limit)\b|api ?limit/i.test(text)) return "quota_exhausted";
  if (/rate ?limit|too many requests|limit/i.test(text)) return "rate_limited";
  return null;
}

/** One request to the latest endpoint. Never retries; never puts the key in the URL or in errors. */
export async function fetchLatestFootballNews(
  apiKey: string,
  fetcher: typeof fetch = fetch,
  now = Date.now(),
): Promise<FilterReport> {
  const redact = (text: string) => text.split(apiKey).join("[redacted]");
  let response: Response;
  try {
    response = await fetcher(newsDataUrl(), {
      headers: { "X-ACCESS-KEY": apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new NewsDataError("network", error instanceof Error ? error.name : "request failed");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // handled below
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;

  const detail = record?.results && typeof record.results === "object" && !Array.isArray(record.results) ? (record.results as Record<string, unknown>) : {};
  const code = redact(typeof detail.code === "string" ? detail.code : "error").slice(0, 60);
  const message = redact(typeof detail.message === "string" ? detail.message : "provider error").slice(0, 200);
  const limitKind = classifyLimit(`${code} ${message}`);

  if (response.status === 401 || response.status === 403) throw new NewsDataError("unauthorized", `HTTP ${response.status}`);
  if (response.status === 429) {
    throw new NewsDataError(limitKind === "quota_exhausted" ? "quota_exhausted" : "rate_limited", `HTTP 429 ${code}: ${message}`);
  }
  if (!response.ok) throw new NewsDataError("http", `HTTP ${response.status}`);
  if (!record) throw new NewsDataError("invalid_response", "response was not JSON");
  if (record.status !== "success") {
    if (limitKind) throw new NewsDataError(limitKind, `${code}: ${message}`);
    if (/key|auth|unauthori/i.test(`${code} ${message}`)) throw new NewsDataError("unauthorized", `${code}: ${message}`);
    throw new NewsDataError("api", `${code}: ${message}`);
  }
  if (!Array.isArray(record.results)) throw new NewsDataError("invalid_response", "no results array");
  return filterResults(record.results, now);
}
