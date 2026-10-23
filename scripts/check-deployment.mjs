// Checks a running deployment (e.g. a Vercel Preview) serves every MatchPulse
// article correctly. Read-only GET requests; API-Football is not called
// directly (the home page may use cached data when live data is enabled).
//
//   npm run test:deployment -- https://<preview-url>
//
// Vercel Preview deployments are usually protected by Vercel Authentication.
// To check one from the command line, create a "Protection Bypass for
// Automation" secret in the Vercel project and pass it in the environment
// (it is sent as a header and never printed):
//   VERCEL_AUTOMATION_BYPASS_SECRET=... npm run test:deployment -- https://<preview-url>
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const base = process.argv[2]?.replace(/\/+$/, "");
if (!base || !/^https?:\/\//.test(base)) {
  console.error("Usage: npm run test:deployment -- https://<deployment-url>");
  process.exit(2);
}
const expectProduction = process.argv.includes("--production");
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const headers = { "user-agent": "MatchPulseDeploymentCheck/1.0", ...(bypass ? { "x-vercel-protection-bypass": bypass } : {}) };

const articles = JSON.parse(readFileSync(new URL("../src/data/article-index.json", import.meta.url), "utf8")).filter(
  (entry) => Date.parse(entry.publishedAt) <= Date.now(),
);

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}\n      ${error.message.split("\n")[0]}`);
  }
}

async function get(path) {
  const response = await fetch(base + path, { headers, redirect: "manual" });
  if (response.status === 401 || response.status === 403) {
    const body = await response.text();
    if (/vercel/i.test(body) || response.headers.get("server")?.includes("Vercel")) {
      throw new Error(`HTTP ${response.status}: the deployment is protected. Set VERCEL_AUTOMATION_BYPASS_SECRET (see the top of this script).`);
    }
    return { status: response.status, body, type: response.headers.get("content-type") ?? "" };
  }
  const type = response.headers.get("content-type") ?? "";
  return { status: response.status, body: type.startsWith("image/") ? "" : await response.text(), type };
}

console.log(`Deployment checks against ${base} (${articles.length} published articles)\n`);

await check("robots.txt", async () => {
  const { status, body } = await get("/robots.txt");
  assert.equal(status, 200);
  if (expectProduction) assert.match(body, /Allow: \//);
  else assert.match(body, /Disallow: \//, "indexing must stay disabled before the production domain is verified");
});

await check("/news lists every published article with an internal link", async () => {
  const { status, body } = await get("/news");
  assert.equal(status, 200);
  for (const { slug } of articles) assert.ok(body.includes(`href="/news/${slug}"`), `missing ${slug}`);
  assert.ok(!/href="https:\/\/(www\.)?koora\.com/.test(body), "external Koora links found");
});

await check("home page shows the latest articles", async () => {
  const { status, body } = await get("/");
  assert.equal(status, 200);
  const latest = [...articles].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 6);
  for (const { slug } of latest) assert.ok(body.includes(`href="/news/${slug}"`), `missing ${slug}`);
});

for (const { slug } of articles) {
  await check(`/news/${slug}`, async () => {
    const { status, body } = await get(`/news/${slug}`);
    assert.equal(status, 200);
    assert.match(body, /<h1[^>]*>[^<]+<\/h1>/, "no headline");
    assert.ok(body.includes('"@type":"NewsArticle"'), "no NewsArticle structured data");
    assert.ok(body.includes(`/news/${slug}"`) && body.includes('rel="canonical"'), "no canonical link");
    assert.ok(/creativecommons\.org\/licenses/.test(body), "no image licence link");
    if (!expectProduction) assert.match(body, /<meta name="robots" content="noindex/, "must be noindex before go-live");
    const image = /\/news-images\/[a-z0-9-]+\.jpg/.exec(body)?.[0];
    assert.ok(image, "no image");
    const file = await get(image);
    assert.equal(file.status, 200, `${image} returned ${file.status}`);
    assert.ok(file.type.startsWith("image/"), `${image} is ${file.type}`);
  });
}

await check("unknown article returns a real 404", async () => {
  const { status } = await get("/news/this-article-does-not-exist");
  assert.equal(status, 404);
});

await check("sitemap lists every published article", async () => {
  const { status, body } = await get("/sitemap.xml");
  assert.equal(status, 200);
  for (const { slug } of articles) assert.ok(body.includes(`/news/${slug}</loc>`), `missing ${slug}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
