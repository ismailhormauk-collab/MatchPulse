// Tests for the "Latest Football News" section (src/lib/newsdata). Every
// provider response is mocked; any real request fails the test, so no
// NewsData.io credits are used. Run with: npm run test:external-news
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_KEY = "pub_test_key_0000000000000000000000";

const { NEWSDATA_QUERY, newsDataUrl, filterResults, fetchLatestFootballNews, parsePubDate, publisherUrl, cleanHeadline, classifyLimit, NewsDataError } =
  await import("@/lib/newsdata/client");

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const NOW = Date.parse("2026-10-28T06:00:00Z");
let counter = 0;
function article(overrides = {}) {
  counter += 1;
  return {
    article_id: `id${counter}`.padEnd(32, "0"),
    title: `Test club wins Premier League match number ${counter}`,
    link: `https://www.example-publisher.co.uk/sport/football/story-${counter}`,
    source_id: "example_publisher",
    source_name: "Example Publisher",
    pubDate: "2026-10-27 17:50:00",
    pubDateTZ: "UTC",
    description: "MUST NOT BE USED",
    content: "MUST NOT BE USED",
    image_url: "https://images.example-publisher.co.uk/photo.jpg",
    ai_summary: "MUST NOT BE USED",
    duplicate: false,
    ...overrides,
  };
}
const success = (results) => ({ status: "success", totalResults: results.length, results, nextPage: null });

/** Fake NewsData.io: only the verified request is accepted. */
function fakeProvider(reply) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), init });
    const parsed = new URL(String(url));
    assert.equal(parsed.origin + parsed.pathname, "https://newsdata.io/api/1/latest");
    assert.equal(init.headers["X-ACCESS-KEY"], TEST_KEY, "key is sent in the header");
    assert.ok(!String(url).includes(TEST_KEY), "key is never in the URL");
    assert.equal(parsed.searchParams.has("apikey"), false);
    const out = reply(calls.length);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetcher, calls };
}

console.log("Request");
await check("uses the verified search settings, nothing else", () => {
  const url = new URL(newsDataUrl());
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    qInTitle: '"Premier League" OR "Champions League" OR "La Liga" OR "Serie A" OR "Bundesliga" OR "Ligue 1"',
    category: "sports",
    language: "en",
    country: "gb,es,it,de,fr",
    prioritydomain: "top",
    size: "10",
    removeduplicate: "1",
  });
  assert.ok(NEWSDATA_QUERY.qInTitle.length <= 100, "within the provider's 100-character limit");
});

console.log("Validation and filtering");
await check("keeps only headline, source, publication time and link (no description, content, image or AI fields)", () => {
  const { headlines } = filterResults([article()], NOW);
  assert.equal(headlines.length, 1);
  assert.deepEqual(Object.keys(headlines[0]).sort(), ["id", "publishedAt", "source", "title", "url"]);
  assert.ok(!JSON.stringify(headlines).includes("MUST NOT BE USED"));
  assert.ok(!JSON.stringify(headlines).includes("images.example"));
  assert.equal(headlines[0].publishedAt, "2026-10-27T17:50:00.000Z");
});

await check("rejects missing or malformed articles", () => {
  const { headlines, rejected } = filterResults(
    [
      null,
      "text",
      article({ title: "" }),
      article({ title: "Short" }),
      article({ link: "javascript:alert(1)" }),
      article({ link: "http://insecure.example.com/story" }),
      article({ link: "https://user:pass@example.com/story" }),
      article({ pubDate: "yesterday" }),
      article({ pubDateTZ: "America/New_York" }),
      article({ source_name: null, source_id: null }),
      article({ article_id: null }),
    ],
    NOW,
  );
  assert.equal(headlines.length, 0);
  assert.equal(rejected.malformed, 11);
});

await check("excludes aggregators such as Google News redirects", () => {
  const { headlines, rejected } = filterResults(
    [
      article({ source_name: "Google News", source_id: "google_news", link: "https://news.google.com/rss/articles/abc?oc=5", title: "Harry Kane - How Ballon d'Or win could boost the Bundesliga - BBC" }),
      article({ link: "https://news.google.com/articles/xyz" }),
      article({ source_name: "MSN", link: "https://www.msn.com/en-gb/sport/football/story" }),
      article(),
    ],
    NOW,
  );
  assert.equal(headlines.length, 1);
  assert.equal(rejected.aggregator, 3);
});

await check("excludes stale live, streaming and breaking headlines, but not words like Liverpool", () => {
  const { headlines, rejected } = filterResults(
    [
      article({ title: "Fleetwood Town vs Arsenal LIVE: Carabao Cup match stream, latest team news" }),
      article({ title: "Liverpool vs Lens live stream: how to watch the Champions League tie" }),
      article({ title: "BREAKING: Premier League club sacks manager after defeat" }),
      article({ title: "Where to watch the Serie A game this weekend" }),
      article({ title: "Liverpool deliver statement Champions League win at Anfield" }),
    ],
    NOW,
  );
  assert.deepEqual(headlines.map((h) => h.title), ["Liverpool deliver statement Champions League win at Anfield"]);
  assert.equal(rejected.timeSensitive, 4);
});

await check("removes duplicates (provider flag, same id, same link, same headline)", () => {
  const first = article({ title: "Arsenal edge Everton in Premier League clash" });
  const { headlines, rejected } = filterResults(
    [
      first,
      { ...first },
      article({ link: first.link, title: "A different headline about the Premier League" }),
      article({ title: "Arsenal edge Everton in Premier League clash!" }),
      article({ duplicate: true }),
    ],
    NOW,
  );
  assert.equal(headlines.length, 1);
  assert.equal(rejected.duplicate, 4);
});

await check("future dates are rejected; results are sorted newest first", () => {
  const { headlines, rejected } = filterResults(
    [
      article({ pubDate: "2026-10-27 08:00:00" }),
      article({ pubDate: "2026-10-27 17:00:00" }),
      article({ pubDate: "2026-10-29 12:00:00" }),
    ],
    NOW,
  );
  assert.deepEqual(headlines.map((h) => h.publishedAt), ["2026-10-27T17:00:00.000Z", "2026-10-27T08:00:00.000Z"]);
  assert.equal(rejected.future, 1);
});

await check("helpers: dates, links and headline clean-up", () => {
  assert.equal(parsePubDate("2026-10-27 17:50:57", "UTC"), "2026-10-27T17:50:57.000Z");
  assert.equal(parsePubDate("2026-10-27 17:50:57", undefined), "2026-10-27T17:50:57.000Z");
  assert.equal(parsePubDate("27/10/2026", "UTC"), null);
  assert.equal(publisherUrl("https://www.independent.co.uk/sport/football/x"), "https://www.independent.co.uk/sport/football/x");
  assert.equal(publisherUrl("https://news.google.com/rss/articles/x"), null);
  assert.equal(cleanHeadline("Kane &amp; Bayern <b>win</b> the Bundesliga title"), "Kane & Bayern win the Bundesliga title");
});

await check("invalid numeric character escapes never fail the refresh (regression)", () => {
  assert.equal(cleanHeadline("Premier League &#99999999; title race heats up"), "Premier League title race heats up");
  assert.equal(cleanHeadline("Serie A &#x110000;&#0;&#xD800; club news today"), "Serie A club news today", "out of range, zero and surrogates are dropped");
  assert.equal(cleanHeadline("Kane &#8217;s Bundesliga record &#x2014; analysis"), "Kane ’s Bundesliga record — analysis", "valid escapes still decode");
  const { headlines, rejected } = filterResults(
    [article({ title: "Premier League &#99999999; title race heats up" }), article({ title: "Bad &#x7FFFFFFF; escape in a La Liga headline" }), article()],
    NOW,
  );
  assert.equal(headlines.length, 3, "one bad escape no longer discards the whole list");
  assert.equal(rejected.malformed, 0);
});

console.log("Provider responses");
await check("success: one request with the key in the header only", async () => {
  const provider = fakeProvider(() => success([article(), article()]));
  const report = await fetchLatestFootballNews(TEST_KEY, provider.fetcher, NOW);
  assert.equal(provider.calls.length, 1);
  assert.equal(report.headlines.length, 2);
});

await check("errors are typed and never contain the key", async () => {
  const cases = [
    [() => new Response("{}", { status: 401 }), "unauthorized"],
    [() => new Response("{}", { status: 429 }), "rate_limited"],
    [() => new Response("oops", { status: 500 }), "http"],
    [() => ({ status: "error", results: { code: "RateLimitExceeded", message: "Too many requests in the last 15 minutes" } }), "rate_limited"],
    [() => ({ status: "error", results: { code: "ApiLimitExceeded", message: `Daily credit limit reached for ${TEST_KEY}` } }), "quota_exhausted"],
    [() => new Response(JSON.stringify({ status: "error", results: { code: "RateLimitExceeded", message: "Rate limit exceeded" } }), { status: 429 }), "rate_limited"],
    [() => new Response(JSON.stringify({ status: "error", results: { code: "ApiLimitExceeded", message: "Your daily credits are used up" } }), { status: 429 }), "quota_exhausted"],
    [() => ({ status: "error", results: { code: "Unauthorized", message: "Invalid API key" } }), "unauthorized"],
    [() => new Response("<html>", { status: 200 }), "invalid_response"],
  ];
  for (const [reply, kind] of cases) {
    await assert.rejects(fetchLatestFootballNews(TEST_KEY, fakeProvider(reply).fetcher, NOW), (error) => {
      assert.ok(error instanceof NewsDataError);
      assert.equal(error.kind, kind);
      assert.ok(!error.message.includes(TEST_KEY), "key redacted");
      return true;
    });
  }
  await assert.rejects(
    fetchLatestFootballNews(TEST_KEY, async () => {
      throw new TypeError("fetch failed");
    }),
    (error) => error.kind === "network",
  );
});

await check("short rate limits and daily quota are told apart", () => {
  assert.equal(classifyLimit("RateLimitExceeded: Too many requests"), "rate_limited");
  assert.equal(classifyLimit("RateLimitExceeded: rate limit exceeded, retry later"), "rate_limited");
  assert.equal(classifyLimit("ApiLimitExceeded: daily limit reached"), "quota_exhausted");
  assert.equal(classifyLimit("error: You have used all your API credits"), "quota_exhausted");
  assert.equal(classifyLimit("Unauthorized: invalid API key"), null);
});

console.log("Section loader (loadExternalNews)");
const dataDir = mkdtempSync(join(tmpdir(), "matchpulse-newsdata-"));
const realFetch = globalThis.fetch;
let provider = fakeProvider(() => success([article({ pubDate: "2026-10-27 17:50:00" }), article({ pubDate: "2026-10-27 10:00:00" })]));
globalThis.fetch = (url, init) => {
  if (!String(url).startsWith("https://newsdata.io/")) throw new Error(`unexpected request ${url}`);
  return provider.fetcher(url, init);
};
const logs = [];
const realError = console.error;
const realInfo = console.info;
console.error = (...args) => logs.push(args.join(" "));
console.info = (...args) => logs.push(args.join(" "));
try {
  const { loadExternalNews } = await import("@/lib/newsdata");
  const { resetStorageForTests, storage } = await import("@/lib/storage");

  await check("disabled without a key, when switched off, and on Vercel Preview; no requests", async () => {
    delete process.env.NEWSDATA_API_KEY;
    process.env.MATCHPULSE_EXTERNAL_NEWS = "on";
    assert.deepEqual(await loadExternalNews(), { state: "disabled" });
    process.env.NEWSDATA_API_KEY = TEST_KEY;
    process.env.MATCHPULSE_EXTERNAL_NEWS = "off";
    assert.deepEqual(await loadExternalNews(), { state: "disabled" });
    process.env.MATCHPULSE_EXTERNAL_NEWS = "on";
    process.env.VERCEL_ENV = "preview";
    assert.deepEqual(await loadExternalNews(), { state: "disabled" });
    delete process.env.VERCEL_ENV;
    assert.equal(provider.calls.length, 0);
  });

  process.env.MATCHPULSE_STORAGE = "filesystem";
  process.env.MATCHPULSE_DATA_DIR = dataDir;
  resetStorageForTests();

  await check("ok: headlines with the measured publication delay", async () => {
    const view = await loadExternalNews();
    assert.equal(view.state, "ok");
    assert.equal(view.stale, false);
    assert.equal(view.headlines.length, 2);
    assert.ok(view.headlines.every((h) => h.url.startsWith("https://") && h.source === "Example Publisher"));
    assert.equal(typeof view.delayHours, "number");
    assert.equal(provider.calls.length, 1);
  });

  await check("the shared cache answers later visitors without a new request (at most hourly)", async () => {
    await loadExternalNews();
    await loadExternalNews();
    assert.equal(provider.calls.length, 1);
  });

  await check("provider failure: last good headlines, marked stale; no last good list: unavailable", async () => {
    await storage().del("api:newsdata:latest-football");
    provider = fakeProvider(() => new Response("{}", { status: 500 }));
    const stale = await loadExternalNews();
    assert.equal(stale.state, "ok");
    assert.equal(stale.stale, true);
    assert.equal(stale.headlines.length, 2);
    assert.equal(provider.calls.length, 1);
    // The failure is cached too: no immediate retry.
    await loadExternalNews();
    assert.equal(provider.calls.length, 1);

    await storage().del("api:newsdata:latest-football");
    await storage().del("newsdata:last-good");
    provider = fakeProvider(() => new Response("{}", { status: 401 }));
    assert.deepEqual(await loadExternalNews(), { state: "unavailable" });
  });

  await check("failure cache: short rate limits retry after 15 minutes, daily quota after hours", async () => {
    const { failureSeconds } = await import("@/lib/newsdata");
    assert.equal(failureSeconds("rate_limited"), 15 * 60);
    assert.equal(failureSeconds("quota_exhausted"), 3 * 3600);
    assert.ok(failureSeconds("rate_limited") < failureSeconds("quota_exhausted"));

    // End to end: a RateLimitExceeded reply is cached as a rate limit (not a quota failure).
    const { storage } = await import("@/lib/storage");
    await storage().del("api:newsdata:latest-football");
    provider = fakeProvider(() => ({ status: "error", results: { code: "RateLimitExceeded", message: "Too many requests" } }));
    await loadExternalNews();
    const entry = JSON.parse(await storage().get("api:newsdata:latest-football"));
    assert.equal(entry.ok, false);
    assert.equal(entry.error.kind, "rate_limited");
  });

  await check("the key never appears in logs", () => {
    assert.ok(logs.length > 0, "failures were logged");
    assert.ok(logs.every((line) => !line.includes(TEST_KEY)));
  });
} finally {
  globalThis.fetch = realFetch;
  console.error = realError;
  console.info = realInfo;
  rmSync(dataDir, { recursive: true, force: true });
}

console.log(`\n${passed} external-news checks passed (mocked NewsData.io, no network)`);
