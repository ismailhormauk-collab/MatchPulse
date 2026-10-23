import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { blocksText, parseFrontMatter, parseMarkdown, type Block } from "./markdown";

// Original MatchPulse articles: one Markdown file per article in content/news/
// (see content/news/README.md for the format). Adding an article means adding
// a file; no application code changes. No "server-only" import: src/proxy.ts
// uses articleExists() for real 404s.
//
// - The file name is the URL: content/news/my-story.md → /news/my-story
// - Files starting with "_" (templates) and README.md are ignored
// - "draft: true" articles and future-dated ones are not published
// - Invalid files are skipped with a warning (and fail `npm test`)

export interface ArticleImage {
  /** Local file under public/, e.g. /news-images/my-story.jpg */
  src: string;
  alt: string;
  /** Required attribution, e.g. "Photo: Jane Smith / MatchPulse" */
  credit: string;
  /** Compact credit for cards (the photographer's required credit), e.g. "Jane Smith". Defaults to `credit`. */
  shortCredit?: string;
  /** What the image shows, e.g. "Villa Park (file photo)". */
  caption?: string;
  /** Licence name and link, e.g. "CC BY-SA 4.0". */
  license?: string;
  licenseUrl?: string;
  /** Where the image comes from (e.g. its Wikimedia Commons page). */
  sourceUrl?: string;
}

export interface OriginalArticle {
  slug: string;
  title: string;
  summary: string;
  author: string;
  /** ISO timestamps. */
  publishedAt: string;
  updatedAt?: string;
  category?: string;
  image?: ArticleImage;
  draft: boolean;
  blocks: Block[];
  readMinutes: number;
}

export type ArticleFileResult = { ok: true; article: OriginalArticle } | { ok: false; file: string; problems: string[] };

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function contentDir(): string {
  return process.env.MATCHPULSE_CONTENT_DIR?.trim() || path.join(/*turbopackIgnore: true*/ process.cwd(), "content", "news");
}

function iso(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Parses and validates one article file. */
export function parseArticleFile(file: string, source: string): ArticleFileResult {
  const slug = path.basename(file, ".md");
  const problems: string[] = [];
  if (!SLUG.test(slug)) problems.push("file name must be lowercase words joined by hyphens, e.g. my-story.md");

  const parsed = parseFrontMatter(source);
  if (!parsed) return { ok: false, file, problems: [...problems, "missing front matter between --- lines"] };
  const { data, body } = parsed;

  const title = text(data.title);
  const summary = text(data.summary);
  const author = text(data.author);
  const publishedAt = iso(data.publishedAt);
  const updatedAt = data.updatedAt === undefined || data.updatedAt === "" ? undefined : iso(data.updatedAt);
  if (!title) problems.push("title is required");
  else if (title.length > 160) problems.push("title is longer than 160 characters");
  if (!summary) problems.push("summary is required");
  else if (summary.length > 300) problems.push("summary is longer than 300 characters");
  if (!author) problems.push("author is required");
  if (!publishedAt) problems.push("publishedAt must be a date such as 2026-10-23T09:00:00Z");
  if (updatedAt === null) problems.push("updatedAt must be a date such as 2026-10-24T09:00:00Z");
  if (publishedAt && updatedAt && updatedAt < publishedAt) problems.push("updatedAt is before publishedAt");

  let image: ArticleImage | undefined;
  const imageSrc = text(data.image);
  if (imageSrc) {
    const alt = text(data.imageAlt);
    const credit = text(data.imageCredit);
    if (!/^\/[A-Za-z0-9/_.-]+\.(?:jpe?g|png|webp|avif)$/.test(imageSrc) || imageSrc.includes("..")) {
      problems.push("image must be a local file under public/, e.g. /news-images/my-story.jpg");
    }
    if (!alt) problems.push("imageAlt is required with an image");
    if (!credit) problems.push("imageCredit is required with an image (who owns or licensed it)");
    const caption = text(data.imageCaption);
    const shortCredit = text(data.imageCreditShort);
    if (shortCredit.length > 80) problems.push("imageCreditShort is longer than 80 characters");
    const license = text(data.imageLicense);
    const licenseUrl = text(data.imageLicenseUrl);
    const sourceUrl = text(data.imageSourceUrl);
    for (const [field, value] of [["imageLicenseUrl", licenseUrl], ["imageSourceUrl", sourceUrl]] as const) {
      if (value && !/^https:\/\/\S+$/.test(value)) problems.push(`${field} must be an https:// link`);
    }
    if (licenseUrl && !license) problems.push("imageLicense is required with imageLicenseUrl");
    image = {
      src: imageSrc,
      alt,
      credit,
      ...(shortCredit ? { shortCredit } : {}),
      ...(caption ? { caption } : {}),
      ...(license ? { license } : {}),
      ...(licenseUrl ? { licenseUrl } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
    };
  }

  const blocks = parseMarkdown(body);
  const words = blocksText(blocks).split(/\s+/).filter(Boolean).length;
  if (words < 30) problems.push("the article body is missing or shorter than 30 words");

  if (problems.length) return { ok: false, file, problems };
  return {
    ok: true,
    article: {
      slug,
      title,
      summary,
      author,
      publishedAt: publishedAt!,
      ...(updatedAt ? { updatedAt } : {}),
      ...(text(data.category) ? { category: text(data.category) } : {}),
      ...(image ? { image } : {}),
      draft: data.draft === true,
      blocks,
      readMinutes: Math.max(1, Math.round(words / 220)),
    },
  };
}

/** Every article file in the content folder, valid or not. */
export function readArticleFiles(dir = contentDir()): ArticleFileResult[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return []; // no content folder yet
  }
  return names
    .filter((name) => name.endsWith(".md") && !name.startsWith("_") && name.toLowerCase() !== "readme.md")
    .sort()
    .map((name) => {
      const file = path.join(dir, name);
      try {
        return parseArticleFile(file, readFileSync(file, "utf8"));
      } catch {
        return { ok: false as const, file, problems: ["could not be read"] };
      }
    });
}

// Files are read once per server process in production (they ship with the
// build); in development they are re-read when the folder changes.
let cache: { key: string; articles: OriginalArticle[] } | null = null;
const warned = new Set<string>();

function allArticles(): OriginalArticle[] {
  const dir = contentDir();
  let key = dir;
  if (process.env.NODE_ENV !== "production") {
    try {
      key += `:${statSync(dir).mtimeMs}:${readdirSync(dir)
        .map((name) => `${name}@${statSync(path.join(dir, name)).mtimeMs}`)
        .join(",")}`;
    } catch {
      key += ":none";
    }
  }
  if (cache?.key === key) return cache.articles;

  const articles: OriginalArticle[] = [];
  for (const result of readArticleFiles(dir)) {
    if (result.ok) articles.push(result.article);
    else if (!warned.has(result.file)) {
      warned.add(result.file);
      console.warn(`[articles] skipped ${path.basename(result.file)}: ${result.problems.join("; ")}`);
    }
  }
  articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
  cache = { key, articles };
  return articles;
}

const isPublished = (article: OriginalArticle, now: number) => !article.draft && Date.parse(article.publishedAt) <= now;

/** Published articles, newest first. */
export function listArticles(now = Date.now()): OriginalArticle[] {
  return allArticles().filter((article) => isPublished(article, now));
}

export function getArticle(slug: string, now = Date.now()): OriginalArticle | null {
  if (!SLUG.test(slug)) return null;
  const article = allArticles().find((item) => item.slug === slug);
  return article && isPublished(article, now) ? article : null;
}

export function articleExists(slug: string, now = Date.now()): boolean {
  return getArticle(slug, now) !== null;
}

/** For tests: forget cached files. */
export function resetArticlesForTests() {
  cache = null;
  warned.clear();
}
