// HTTP status checks against a running MatchPulse server.
//   npm run test:routes -- http://localhost:3124
// Point it at a mock-backed or staging server: pages such as /matches use the
// server's cached API data, so avoid running it repeatedly against production.
import assert from "node:assert/strict";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let passed = 0;
let skipped = 0;

async function get(path) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  const body = await res.text();
  const robots = /<meta name="robots" content="([^"]+)"/.exec(body)?.[1] ?? null;
  return { status: res.status, body, robots };
}

async function expectStatus(path, status, { noindex } = {}) {
  const res = await get(path);
  assert.equal(res.status, status, `${path}: expected ${status}, got ${res.status}`);
  if (noindex === true) assert.match(res.robots ?? "", /noindex/, `${path}: expected noindex`);
  passed += 1;
  console.log(`  ✓ ${status} ${path}${res.robots ? `  (robots: ${res.robots})` : ""}`);
  return res;
}

function skip(reason) {
  skipped += 1;
  console.log(`  - skipped: ${reason}`);
}

console.log(`Route status checks against ${BASE}\n`);

console.log("Valid routes");
for (const path of ["/", "/matches", "/matches/yesterday", "/matches/tomorrow", "/leagues", "/leagues/premier-league", "/players", "/news", "/reports"]) await expectStatus(path, 200);
const robotsTxt = await expectStatus("/robots.txt", 200);
assert.match(robotsTxt.body, /User-Agent: \*/);
await expectStatus("/sitemap.xml", 200);

const reportsPage = await get("/reports");
const reportId = /href="\/reports\/(\d+)"/.exec(reportsPage.body)?.[1];
if (reportId) await expectStatus(`/reports/${reportId}`, 200);
else skip("no stored report to check /reports/[id] with");

const matchesPage = await get("/matches");
const matchId = /href="\/matches\/(\d+)"/.exec(matchesPage.body)?.[1];
if (matchId) await expectStatus(`/matches/${matchId}`, 200);
else skip("no match links (sample mode or no fixtures) to check /matches/[id] with");

console.log("Unknown or invalid routes return a real 404 (and noindex)");
for (const path of [
  "/does-not-exist",
  "/leagues/not-a-league",
  "/leagues/eredivisie", // real competition, but no standings page
  "/reports/123",
  "/reports/not-a-number",
  "/reports/0",
  "/matches/abc",
  "/matches/0",
  "/matches/99999999999",
  "/matches/123",
  "/news/no-such-article",
  "/news/title-race-tightens-after-dramatic-weekend", // former sample article: news opens on the publisher's site
]) {
  await expectStatus(path, 404, { noindex: true });
}

console.log(`\n${passed} route checks passed${skipped ? `, ${skipped} skipped` : ""}`);
