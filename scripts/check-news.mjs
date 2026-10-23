// Tests for the News section's Koora source (src/lib/news). Every request is
// answered by a local fake; any other request fails. No network, no real keys.
// Fixture headlines are placeholders ("عنوان تجريبي" = "test headline").
// Run with: npm run test:news
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
  kooraArticleUrl,
  robotsAllows,
  parseNewsSitemap,
  parseArticlePage,
  loadKooraNews,
  readArticleRecord,
  KooraError,
} = await import("@/lib/news/koora");
const { checkTranslation, tidyTranslation, createHeadlineTranslator, translationProvider, TranslationLimitError } = await import("@/lib/news/translate");
const { applyGlossary } = await import("@/lib/news/glossary");
const { headlineDisplay, translationNotice } = await import("@/lib/news/display");
const { reviewedHeadline, allCorrections } = await import("@/lib/news/corrections");
const { TRANSLATION_RETRY_MS } = await import("@/lib/news/koora");

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const NEWS = "https://koora.com/الأخبار/";
const articleUrl = (slug) => new URL(`/الأخبار/${slug}`, "https://koora.com").href;
const ROBOTS_OK = "User-Agent: *\nAllow: /\nDisallow: /api/\nDisallow: /_next/\n";
const NOW = Date.parse("2026-10-23T12:00:00Z");

function sitemap(entries) {
  return `<?xml version="1.0"?><urlset>${entries
    .map(([loc, lastmod]) => `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`)
    .join("")}</urlset>`;
}

function articleHtml({ url, headline, datePublished, type = "NewsArticle" }) {
  const ld = { "@context": "https://schema.org", "@type": type, mainEntityOfPage: { "@type": "WebPage", "@id": decodeURI(url) }, headline, datePublished };
  return `<html><head><script type="application/ld+json">${JSON.stringify({ "@type": "WebSite", name: "x" })}</script><script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;
}

/** Fake koora.com: robots, sitemap and article pages from a map. */
function fakeKoora({ robots = ROBOTS_OK, entries = [], pages = {}, failSitemap = false } = {}) {
  const requests = [];
  const fetcher = async (input, init) => {
    const url = String(input);
    requests.push(url);
    assert.match(init.headers["user-agent"], /^MatchPulseNewsBot\//, "identifies itself");
    if (url === "https://koora.com/robots.txt") return new Response(robots);
    if (url === "https://koora.com/sitemap/news.xml") {
      return failSitemap ? new Response("busy", { status: 503 }) : new Response(sitemap(entries));
    }
    if (url in pages) return new Response(pages[url]);
    if (url.startsWith("https://koora.com/")) return new Response("not found", { status: 404 });
    throw new Error(`unexpected request ${url}`);
  };
  return { fetcher, requests };
}

function memory() {
  const map = new Map();
  return {
    map,
    get: async (url) => readArticleRecord(map.get(url) ?? null),
    set: async (url, value) => void map.set(url, JSON.stringify(value)),
  };
}

console.log("URLs and robots.txt");
await check("only koora.com news article URLs are accepted, in canonical form", () => {
  assert.equal(kooraArticleUrl(`${NEWS}عنوان-تجريبي`), articleUrl("عنوان-تجريبي"));
  assert.equal(kooraArticleUrl(articleUrl("عنوان-تجريبي")), articleUrl("عنوان-تجريبي"), "encoded form is stable");
  assert.equal(kooraArticleUrl("https://www.koora.com/الأخبار/x-y"), articleUrl("x-y"));
  assert.equal(kooraArticleUrl("https://koora.com/الفرق/x"), null);
  assert.equal(kooraArticleUrl("https://koora.com/الأخبار/"), null);
  assert.equal(kooraArticleUrl("https://koora.com/الأخبار/a/b"), null);
  assert.equal(kooraArticleUrl("https://evil.example/الأخبار/x"), null);
  assert.equal(kooraArticleUrl("javascript:alert(1)"), null);
});

await check("robots.txt rules are respected (longest match wins)", () => {
  assert.equal(robotsAllows(ROBOTS_OK, "/sitemap/news.xml"), true);
  assert.equal(robotsAllows(ROBOTS_OK, "/api/news"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /", "/sitemap/news.xml"), false);
  assert.equal(robotsAllows("User-agent: *\nDisallow: /\nAllow: /sitemap/", "/sitemap/news.xml"), true);
  assert.equal(robotsAllows("User-agent: *\nDisallow:", "/anything"), true);
  assert.equal(robotsAllows("User-agent: MatchPulseNewsBot\nDisallow: /\n\nUser-agent: *\nAllow: /", "/x"), false, "own group first");
  assert.equal(robotsAllows("User-agent: *\nDisallow: /*.xml$", "/sitemap/news.xml"), false);
});

console.log("Parsing");
await check("sitemap: news URLs only, duplicates merged, newest lastmod first", () => {
  const entries = parseNewsSitemap(
    sitemap([
      [`${NEWS}a`, "2026-10-01T10:00:00Z"],
      [`${NEWS}b`, "2026-10-05T10:00:00Z"],
      [articleUrl("a"), "2026-10-02T10:00:00Z"],
      ["https://koora.com/البطولات/x", "2026-10-09T10:00:00Z"],
      [`${NEWS}c &amp; d`, null],
    ]),
  );
  assert.deepEqual(
    entries.map((e) => [decodeURI(e.url), e.lastmod]),
    [
      [`${NEWS}b`, "2026-10-05T10:00:00.000Z"],
      [`${NEWS}a`, "2026-10-02T10:00:00.000Z"],
      [`${NEWS}c & d`, null],
    ],
  );
});

await check("article: headline and datePublished from its own NewsArticle metadata", () => {
  const url = articleUrl("a");
  assert.deepEqual(parseArticlePage(articleHtml({ url, headline: "  عنوان   تجريبي ١ ", datePublished: "2026-10-07T16:27:26.547Z" }), url, NOW), {
    url,
    title: "عنوان تجريبي ١",
    publishedAt: "2026-10-07T16:27:26.547Z",
  });
});

await check("article: rejected without a date, with a future date, for another URL, or without metadata", () => {
  const url = articleUrl("a");
  assert.equal(parseArticlePage(articleHtml({ url, headline: "عنوان تجريبي", datePublished: undefined }), url, NOW), null);
  assert.equal(parseArticlePage(articleHtml({ url, headline: "عنوان تجريبي", datePublished: "2026-12-01T00:00:00Z" }), url, NOW), null);
  assert.equal(parseArticlePage(articleHtml({ url: articleUrl("other"), headline: "عنوان تجريبي", datePublished: "2026-10-01T00:00:00Z" }), url, NOW), null);
  assert.equal(parseArticlePage(articleHtml({ url, headline: "عنوان تجريبي", datePublished: "2026-10-01T00:00:00Z", type: "WebPage" }), url, NOW), null);
  assert.equal(parseArticlePage(articleHtml({ url, headline: "", datePublished: "2026-10-01T00:00:00Z" }), url, NOW), null);
  assert.equal(parseArticlePage("<html>no metadata</html>", url, NOW), null);
});

await check("stored records are validated; malformed ones are ignored", () => {
  assert.equal(readArticleRecord(null), null);
  assert.equal(readArticleRecord("{bad json"), null);
  assert.equal(readArticleRecord(JSON.stringify({ url: "https://evil.example/x", title: "عنوان تجريبي", publishedAt: "2026-10-01T00:00:00Z" })), null);
  assert.equal(readArticleRecord(JSON.stringify("invalid")), "invalid");
});

console.log("Loading");
const sixStories = Array.from({ length: 6 }, (_, i) => {
  const url = articleUrl(`story-${i}`);
  // Sitemap lastmod order differs from publication order on purpose.
  return { url, lastmod: `2026-10-${String(20 - i).padStart(2, "0")}T10:00:00Z`, published: `2026-10-${String(10 + ((i * 3) % 6)).padStart(2, "0")}T08:00:00Z` };
});
const pagesFor = (stories) =>
  Object.fromEntries(stories.map((s, i) => [s.url, articleHtml({ url: s.url, headline: `عنوان تجريبي ${i}`, datePublished: s.published })]));

await check("sorted by real publication date, newest first; robots.txt read first", async () => {
  const koora = fakeKoora({ entries: sixStories.map((s) => [s.url, s.lastmod]), pages: pagesFor(sixStories) });
  const feed = await loadKooraNews({ fetch: koora.fetcher, memory: memory(), now: NOW, pauseMs: 0 });
  assert.equal(koora.requests[0], "https://koora.com/robots.txt");
  const dates = feed.articles.map((a) => a.publishedAt);
  assert.deepEqual(dates, [...dates].sort().reverse());
  assert.equal(feed.articles.length, 6);
  assert.equal(feed.partial, false);
});

await check("article pages are fetched once, then remembered (changed lastmod is re-read)", async () => {
  const mem = memory();
  const entries = sixStories.map((s) => [s.url, s.lastmod]);
  const first = fakeKoora({ entries, pages: pagesFor(sixStories) });
  await loadKooraNews({ fetch: first.fetcher, memory: mem, now: NOW, pauseMs: 0 });
  assert.equal(first.requests.length, 2 + 6);

  const second = fakeKoora({ entries, pages: pagesFor(sixStories) });
  await loadKooraNews({ fetch: second.fetcher, memory: mem, now: NOW, pauseMs: 0 });
  assert.deepEqual(second.requests, ["https://koora.com/robots.txt", "https://koora.com/sitemap/news.xml"]);

  const corrected = entries.map(([url, lastmod], i) => [url, i === 0 ? "2026-10-22T10:00:00Z" : lastmod]);
  const third = fakeKoora({ entries: corrected, pages: pagesFor(sixStories) });
  await loadKooraNews({ fetch: third.fetcher, memory: mem, now: NOW, pauseMs: 0 });
  assert.equal(third.requests.length, 3, "only the corrected article is read again");
});

await check("at most maxPageFetches new pages per refresh; the rest wait for the next one", async () => {
  const mem = memory();
  const koora = fakeKoora({ entries: sixStories.map((s) => [s.url, s.lastmod]), pages: pagesFor(sixStories) });
  const feed = await loadKooraNews({ fetch: koora.fetcher, memory: mem, now: NOW, pauseMs: 0, maxPageFetches: 2 });
  assert.equal(koora.requests.length, 4);
  assert.equal(feed.articles.length, 2);
  assert.equal(feed.partial, true);
});

await check("unreadable or failing article pages are skipped, not invented", async () => {
  const pages = pagesFor(sixStories);
  pages[sixStories[1].url] = "<html>no metadata</html>";
  delete pages[sixStories[2].url]; // 404
  const koora = fakeKoora({ entries: sixStories.map((s) => [s.url, s.lastmod]), pages });
  const feed = await loadKooraNews({ fetch: koora.fetcher, memory: memory(), now: NOW, pauseMs: 0 });
  assert.equal(feed.articles.length, 4);
  assert.ok(!feed.articles.some((a) => a.url === sixStories[1].url || a.url === sixStories[2].url));
  assert.equal(feed.partial, true, "the 404 is retried next time");
});

await check("robots.txt disallowing the news section stops before any other request", async () => {
  const koora = fakeKoora({ robots: "User-agent: *\nDisallow: /", entries: sixStories.map((s) => [s.url, s.lastmod]) });
  await assert.rejects(loadKooraNews({ fetch: koora.fetcher, memory: memory(), now: NOW }), (error) => error instanceof KooraError && error.kind === "robots");
  assert.deepEqual(koora.requests, ["https://koora.com/robots.txt"]);
});

await check("sitemap failure and empty sitemap are reported as errors", async () => {
  const failing = fakeKoora({ failSitemap: true });
  await assert.rejects(loadKooraNews({ fetch: failing.fetcher, memory: memory(), now: NOW }), (e) => e.kind === "http");
  const empty = fakeKoora({ entries: [] });
  await assert.rejects(loadKooraNews({ fetch: empty.fetcher, memory: memory(), now: NOW }), (e) => e.kind === "empty");
  const offline = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(loadKooraNews({ fetch: offline, memory: memory(), now: NOW }), (e) => e.kind === "network");
});

console.log("Translation");
await check("provider: free MyMemory by default; off or Claude only when configured", () => {
  assert.equal(translationProvider({}), "mymemory");
  assert.equal(translationProvider({ MATCHPULSE_NEWS_TRANSLATION: "off" }), "off");
  assert.equal(translationProvider({ MATCHPULSE_NEWS_TRANSLATION: "claude" }), "off", "Claude needs a key");
  assert.equal(translationProvider({ MATCHPULSE_NEWS_TRANSLATION: "claude", ANTHROPIC_API_KEY: "k" }), "claude");
  assert.equal(createHeadlineTranslator({ MATCHPULSE_NEWS_TRANSLATION: "off" }), undefined);
});

await check("glossary: names in English before translation, prefixes kept as words", () => {
  assert.deepEqual(applyGlossary("عنوان تجريبي عن هالاند"), { text: "عنوان تجريبي عن Haaland", terms: ["Haaland"] });
  const prepared = applyGlossary("تجربة إنفانتينو واليويفا للكرة الذهبية بدوري الأمم الأوروبية");
  assert.equal(prepared.text, "تجربة Infantino و UEFA ل Ballon d'Or ب UEFA Nations League");
  assert.deepEqual(prepared.terms.sort(), ["Ballon d'Or", "Infantino", "UEFA", "UEFA Nations League"]);
  assert.equal(applyGlossary("كريستيانو رونالدو").text, "Cristiano Ronaldo", "longest form wins");
  assert.equal(applyGlossary("صلاحية").text, "صلاحية", "no match inside another word");
});

await check("reliability checks: English only, numbers and names kept, plausible length", () => {
  const original = "عنوان تجريبي عن أرسنال حتى 2030";
  assert.equal(checkTranslation(original, "Test headline about Arsenal until 2030", ["Arsenal"]), "Test headline about Arsenal until 2030");
  assert.equal(checkTranslation(original, "Test headline about Arsenal until 2007", ["Arsenal"]), null, "number changed");
  assert.equal(checkTranslation(original, "Test headline about Arsenl until 2030", ["Arsenal"]), null, "glossary name lost");
  assert.equal(checkTranslation(original, "عنوان until 2030 Arsenal", ["Arsenal"]), null, "Arabic left");
  assert.equal(checkTranslation(original, "2030", []), null, "too short");
  assert.equal(checkTranslation(original, "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY 2030", []), null);
  assert.equal(checkTranslation(original, "Arsenal the the the until 2030", []), null, "repetition");
  assert.equal(checkTranslation("حتى ٢٠٣٠ عنوان تجريبي", "Test headline until 2030", []), "Test headline until 2030", "Arabic-Indic digits");
  assert.equal(tidyTranslation("arsenal seals future with a new decade until 2030."), "Arsenal seals future with a new contract until 2030");
  assert.equal(tidyTranslation("Race for the Ballon d 'Or"), "Race for the Ballon d'Or");
  assert.equal(tidyTranslation("Arsenal Seals Future With A New Decade Until 2030"), "Arsenal Seals Future With A New Contract Until 2030");
  assert.equal(tidyTranslation("A new decade of football"), "A new decade of football", "only next to a year");
});

function fakeMyMemory(reply) {
  const calls = [];
  const fetcher = async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, "https://api.mymemory.translated.net/get");
    assert.equal(parsed.searchParams.get("langpair"), "ar|en");
    assert.equal(parsed.searchParams.has("key"), false, "no key is sent");
    calls.push(parsed.searchParams.get("q"));
    return reply(parsed.searchParams.get("q"), calls.length);
  };
  return { fetcher, calls };
}
const myMemoryOk = (text) => new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: text }, quotaFinished: false }));

await check("MyMemory: free, no key; glossary applied; failures and limits handled", async () => {
  const ok = fakeMyMemory(() => myMemoryOk("Arsenal test headline until 2030"));
  const translate = createHeadlineTranslator({}, ok.fetcher);
  assert.equal(await translate("أرسنال عنوان تجريبي حتى 2030"), "Arsenal test headline until 2030");
  assert.equal(ok.calls[0], "Arsenal عنوان تجريبي حتى 2030");

  const wrong = createHeadlineTranslator({}, fakeMyMemory(() => myMemoryOk("Arsnal test headline until 2030")).fetcher);
  assert.equal(await wrong("أرسنال عنوان تجريبي حتى 2030"), null, "unreliable output is rejected");

  const limited = createHeadlineTranslator({}, fakeMyMemory(() => new Response("{}", { status: 429 })).fetcher);
  await assert.rejects(limited("عنوان تجريبي"), (error) => error instanceof TranslationLimitError);
  const quota = createHeadlineTranslator({}, fakeMyMemory(() => new Response(JSON.stringify({ responseStatus: 429, quotaFinished: true }))).fetcher);
  await assert.rejects(quota("عنوان تجريبي"), (error) => error instanceof TranslationLimitError);

  const broken = createHeadlineTranslator({}, fakeMyMemory(() => new Response("<html>", { status: 200 })).fetcher);
  assert.equal(await broken("عنوان تجريبي"), null);
  const offline = createHeadlineTranslator({}, async () => {
    throw new TypeError("fetch failed");
  });
  assert.equal(await offline("عنوان تجريبي"), null);

  const withEmail = fakeMyMemory(() => myMemoryOk("Test headline"));
  await createHeadlineTranslator({ MATCHPULSE_TRANSLATION_EMAIL: "ops@example.com" }, async (url) => {
    assert.equal(new URL(url).searchParams.get("de"), "ops@example.com");
    return withEmail.fetcher(url);
  })("عنوان تجريبي");
});

const englishFor = (title) => `English test headline ${title.split(" ").at(-1)}`;

await check("loader: each headline translated once; dates and links unchanged", async () => {
  let calls = 0;
  const translate = async (title) => {
    calls += 1;
    return englishFor(title);
  };
  const mem = memory();
  const stories = sixStories.slice(0, 3);
  const run = () =>
    loadKooraNews({ fetch: fakeKoora({ entries: stories.map((s) => [s.url, s.lastmod]), pages: pagesFor(stories) }).fetcher, memory: mem, now: NOW, pauseMs: 0, translate });
  const feed = await run();
  for (const article of feed.articles) {
    const story = stories.find((s) => s.url === article.url);
    assert.equal(article.publishedAt, new Date(story.published).toISOString(), "date unchanged");
    assert.equal(article.titleEn, englishFor(article.title));
  }
  await run();
  assert.equal(calls, 3, "not translated again");
});

await check("loader: failed translations keep Arabic and retry after 12 hours; a limit stops the run", async () => {
  const mem = memory();
  const stories = sixStories.slice(0, 3);
  const koora = () => fakeKoora({ entries: stories.map((s) => [s.url, s.lastmod]), pages: pagesFor(stories) }).fetcher;
  let calls = 0;
  const failing = async () => {
    calls += 1;
    return null;
  };
  const first = await loadKooraNews({ fetch: koora(), memory: mem, now: NOW, pauseMs: 0, translate: failing });
  assert.ok(first.articles.every((a) => !a.titleEn && a.titleEnFailedAt && a.title.startsWith("عنوان تجريبي")));
  await loadKooraNews({ fetch: koora(), memory: mem, now: NOW + 3600_000, pauseMs: 0, translate: failing });
  assert.equal(calls, 3, "no retry within 12 hours");

  let limitCalls = 0;
  const limited = async () => {
    limitCalls += 1;
    throw new TranslationLimitError();
  };
  const later = NOW + TRANSLATION_RETRY_MS + 1;
  await loadKooraNews({ fetch: koora(), memory: mem, now: later, pauseMs: 0, translate: limited });
  assert.equal(limitCalls, 1, "stops at the daily limit");

  const fixed = await loadKooraNews({ fetch: koora(), memory: mem, now: later, pauseMs: 0, translate: async (t) => englishFor(t) });
  assert.ok(fixed.articles.every((a) => a.titleEn && !a.titleEnFailedAt), "retried after 12 hours");
});

await check("cards: English headline first, Arabic only when no reliable translation", () => {
  const base = { id: "x", url: articleUrl("x"), title: "عنوان تجريبي", publishedAt: "2026-10-07T16:27:26.547Z", source: "Koora" };
  const translated = headlineDisplay({ ...base, titleEn: "Test headline" });
  assert.deepEqual(translated, { text: "Test headline", lang: "en", dir: "ltr", label: "Machine-translated from Arabic", original: "عنوان تجريبي" });
  const untranslated = headlineDisplay(base);
  assert.equal(untranslated.text, "عنوان تجريبي");
  assert.equal(untranslated.lang, "ar");
  assert.match(untranslated.label, /English translation unavailable/);
});

console.log("Reviewed headlines and notice");
await check("every reviewed headline passes the translation checks (numbers and names kept)", () => {
  const corrections = allCorrections();
  assert.ok(corrections.length > 0 && corrections.length <= 20, "the list stays small");
  for (const [arabic, english] of corrections) {
    const { terms } = applyGlossary(arabic);
    assert.equal(checkTranslation(arabic, english, terms), english, `correction for "${arabic}" fails the checks`);
  }
});

await check("reviewed headlines match only their exact Arabic headline", () => {
  const [arabic, english] = allCorrections()[0];
  assert.equal(reviewedHeadline(arabic), english);
  assert.equal(reviewedHeadline(`  ${arabic.replace(/ /g, "  ")} `), english, "whitespace differences ignored");
  assert.equal(reviewedHeadline(arabic.slice(0, -3)), undefined, "an edited headline falls back to machine translation");
  assert.equal(reviewedHeadline("عنوان تجريبي"), undefined);
});

await check("labels: reviewed vs machine translation", () => {
  const base = { id: "x", url: articleUrl("x"), title: "عنوان تجريبي", publishedAt: "2026-10-07T16:27:26.547Z", source: "Koora" };
  assert.equal(headlineDisplay({ ...base, titleEn: "Test headline", titleEnSource: "reviewed" }).label, "Translated from Arabic");
  assert.equal(headlineDisplay({ ...base, titleEn: "Test headline", titleEnSource: "machine" }).label, "Machine-translated from Arabic");
});

await check("notice describes the headlines actually shown", () => {
  const item = (i, titleEn, titleEnSource) => ({ id: String(i), url: articleUrl(`s${i}`), title: `عنوان تجريبي ${i}`, publishedAt: "2026-10-07T00:00:00Z", source: "Koora", ...(titleEn ? { titleEn, titleEnSource } : {}) });
  const all = translationNotice([item(1, "Test headline 1", "machine"), item(2, "Test headline 2", "reviewed")]);
  assert.match(all, /^Headlines are English translations/);
  assert.match(all, /cards marked "Machine-translated" are automatic translations/);
  assert.match(translationNotice([item(1, "Test headline 1", "machine")]), /made by automatic machine translation/);
  assert.doesNotMatch(translationNotice([item(1, "Test headline 1", "reviewed")]), /machine/);
  const some = translationNotice([item(1, "Test headline 1", "machine"), item(2), item(3)]);
  assert.match(some, /^1 of 3 headlines are shown in English/);
  assert.match(some, /original Arabic/);
  const none = translationNotice([item(1), item(2)]);
  assert.match(none, /original Arabic/);
  assert.doesNotMatch(none, /English translations? of/);
});

console.log("News section (loadNews)");
const dataDir = mkdtempSync(join(tmpdir(), "matchpulse-news-"));
const realFetch = globalThis.fetch;
let koora = fakeKoora({ entries: sixStories.map((s) => [s.url, s.lastmod]), pages: pagesFor(sixStories) });
const translatedQueries = [];
globalThis.fetch = (input, init) => {
  const url = String(input);
  if (url.startsWith("https://api.mymemory.translated.net/")) {
    const q = new URL(url).searchParams.get("q");
    translatedQueries.push(q);
    return Promise.resolve(myMemoryOk(englishFor(q)));
  }
  return koora.fetcher(input, init);
};
try {
  const { loadNews } = await import("@/lib/news");
  const { resetStorageForTests } = await import("@/lib/storage");

  await check("MATCHPULSE_NEWS_SOURCE=off: disabled, no requests", async () => {
    process.env.MATCHPULSE_NEWS_SOURCE = "off";
    assert.deepEqual(await loadNews(), { state: "disabled" });
    assert.equal(koora.requests.length, 0);
  });

  process.env.MATCHPULSE_NEWS_SOURCE = "koora";
  process.env.MATCHPULSE_NEWS_TRANSLATION = "mymemory";
  process.env.MATCHPULSE_STORAGE = "filesystem";
  process.env.MATCHPULSE_DATA_DIR = dataDir;
  resetStorageForTests();

  await check("koora: real items with source and links, newest first", async () => {
    const view = await loadNews();
    assert.equal(view.state, "ok");
    assert.equal(view.stale, false);
    assert.equal(view.items.length, 6);
    assert.ok(view.items.every((item) => item.source === "Koora" && item.url.startsWith("https://koora.com/")));
    const dates = view.items.map((i) => i.publishedAt);
    assert.deepEqual(dates, [...dates].sort().reverse());
    // English headlines, with each story's own publication date and link.
    for (const item of view.items) {
      const story = sixStories.find((s) => s.url === item.url);
      assert.ok(story, "link is the original Koora URL");
      assert.equal(item.publishedAt, new Date(story.published).toISOString());
      const card = headlineDisplay(item);
      assert.equal(card.lang, "en");
      assert.match(card.text, /^English test headline \d$/);
      assert.equal(card.original, item.title);
    }
    assert.equal(translatedQueries.length, 6);
  });

  await check("the shared cache answers later visitors without contacting koora.com", async () => {
    const before = koora.requests.length;
    await loadNews();
    await loadNews();
    assert.equal(koora.requests.length, before);
    assert.equal(translatedQueries.length, 6, "no new translation requests");
  });

  await check("koora.com down: last good headlines, marked stale; nothing at all: unavailable", async () => {
    const { storage } = await import("@/lib/storage");
    await storage().del("api:news:koora:feed");
    koora = fakeKoora({ failSitemap: true });
    const stale = await loadNews();
    assert.equal(stale.state, "ok");
    assert.equal(stale.stale, true);
    assert.equal(stale.items.length, 6);

    await storage().del("api:news:koora:feed");
    await storage().del("news:koora:last-good");
    assert.equal((await loadNews()).state, "unavailable");
  });

  await check("reviewed wording replaces the machine translation; translation off shows Arabic", async () => {
    const [arabic, english] = allCorrections()[0];
    const url = articleUrl("reviewed-story");
    const { storage } = await import("@/lib/storage");
    await storage().del("api:news:koora:feed");
    koora = fakeKoora({
      entries: [[url, "2026-10-09T15:47:24Z"]],
      pages: { [url]: articleHtml({ url, headline: arabic, datePublished: "2026-10-09T15:47:24.404Z" }) },
    });
    const view = await loadNews();
    assert.equal(view.state, "ok");
    const [item] = view.items;
    assert.equal(item.titleEn, english);
    assert.equal(item.titleEnSource, "reviewed");
    assert.equal(item.title, arabic, "original kept for hover");
    assert.equal(item.publishedAt, "2026-10-09T15:47:24.404Z");
    assert.equal(item.url, url);

    process.env.MATCHPULSE_NEWS_TRANSLATION = "off";
    const off = await loadNews();
    assert.equal(off.items[0].titleEn, undefined);
    assert.match(translationNotice(off.items), /original Arabic/);
    process.env.MATCHPULSE_NEWS_TRANSLATION = "mymemory";
  });
} finally {
  globalThis.fetch = realFetch;
  rmSync(dataDir, { recursive: true, force: true });
}

console.log(`\n${passed} news checks passed (fake koora.com, no network)`);
