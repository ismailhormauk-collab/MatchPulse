// Storage adapter tests: filesystem backend, Upstash Redis backend (the real
// official client against a local fake REST server), report persistence
// across instances, the shared API cache, failures and selection rules.
// No network, no real Upstash account, no API-Football requests.
// Run with: npm run test:storage
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFakeUpstash } from "./fake-upstash.mjs";

const { storage, selectStorage, resetStorageForTests, storagePrefix } = await import("@/lib/storage");
const { createFilesystemBackend } = await import("@/lib/storage/filesystem");
const { getStoredReport, listStoredReports, saveReportOnce, reportExists } = await import("@/lib/report-store");
const { isKnownFixture, recordKnownFixtures, resetFixtureIndexMemo } = await import("@/lib/fixture-index");
const { sharedResult } = await import("@/lib/api-football/shared-cache");

const fake = await startFakeUpstash({ token: "secret-test-token-123" });
let passed = 0;

const STORAGE_VARS = ["MATCHPULSE_STORAGE", "MATCHPULSE_DATA_DIR", "MATCHPULSE_REPORTS_DIR", "MATCHPULSE_STORAGE_PREFIX", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL"];
async function check(name, env, fn) {
  const saved = Object.fromEntries(STORAGE_VARS.map((key) => [key, process.env[key]]));
  for (const key of STORAGE_VARS) delete process.env[key];
  Object.assign(process.env, env);
  resetStorageForTests();
  resetFixtureIndexMemo();
  fake.state.mode = "ok";
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetStorageForTests();
  }
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const tempDir = (label) => mkdtempSync(join(tmpdir(), `matchpulse-${label}-`));
const REDIS = () => ({ UPSTASH_REDIS_REST_URL: fake.url, UPSTASH_REDIS_REST_TOKEN: fake.token, MATCHPULSE_STORAGE_PREFIX: `t${passed}` });

function report(id, overrides = {}) {
  return {
    version: 1, fixtureId: id, leagueSlug: "premier-league", competition: "Premier League", round: "Round 1",
    kickoff: "2026-10-22T19:00:00.000Z", venue: null,
    home: { id: 1, name: "Home FC", logo: "https://media.api-sports.io/football/teams/1.png" },
    away: { id: 2, name: "Away FC", logo: null },
    score: { home: 1, away: 0 }, halftime: null, penalties: null, afterExtraTime: false,
    headline: "Home FC beat Away FC 1–0", summary: ["Home FC beat Away FC 1–0 in the Premier League."],
    goals: [], cards: [], stats: [], source: "API-Football", dataFetchedAt: "2026-10-22T21:00:00Z", generatedAt: "2026-10-22T21:05:00Z",
    ...overrides,
  };
}

console.log("Selection");

await check("local sample mode without Redis credentials uses the filesystem", {}, () => {
  assert.equal(selectStorage().kind, "filesystem");
});
await check("Vercel without credentials: nothing treated as persistent", { VERCEL: "1" }, () => {
  assert.deepEqual(selectStorage().kind, "none");
  assert.equal(storage().persistent, false);
});
await check("credentials (either naming) select Redis; explicit overrides win", {}, () => {
  assert.equal(selectStorage({ UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" }).kind, "redis");
  assert.equal(selectStorage({ KV_REST_API_URL: "https://x", KV_REST_API_TOKEN: "t", VERCEL: "1" }).kind, "redis");
  assert.equal(selectStorage({ MATCHPULSE_STORAGE: "redis" }).kind, "none", "redis requested without credentials → none, no crash");
  assert.equal(selectStorage({ MATCHPULSE_STORAGE: "none", UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" }).kind, "none");
  assert.equal(storagePrefix({ MATCHPULSE_STORAGE_PREFIX: "matchpulse-preview" }), "matchpulse-preview");
});

console.log("Filesystem backend");

await check("get/set, write-once, expiry, malformed entries, index order", { MATCHPULSE_STORAGE: "filesystem" }, async () => {
  process.env.MATCHPULSE_DATA_DIR = tempDir("fs");
  const fs = createFilesystemBackend();
  await fs.set("api:a", "one", 60);
  assert.equal(await fs.get("api:a"), "one");
  assert.equal(await fs.setIfAbsent("lock:x", "1", 60), true);
  assert.equal(await fs.setIfAbsent("lock:x", "2", 60), false, "second writer loses");
  await fs.set("api:old", "stale", 1);
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(await fs.get("api:old"), null, "expired");
  assert.equal(await fs.setIfAbsent("api:old", "fresh", 60), true, "expired key counts as absent");
  const kvDir = join(process.env.MATCHPULSE_DATA_DIR, "kv");
  for (const file of readdirSync(kvDir)) if (!file.startsWith("index")) writeFileSync(join(kvDir, file), "{broken");
  assert.equal(await fs.get("api:a"), null, "malformed entry treated as missing");
  await fs.indexAdd("demo", "a", 1);
  await fs.indexAdd("demo", "b", 3);
  await fs.indexAdd("demo", "c", 2);
  assert.deepEqual(await fs.indexTop("demo", 2), ["b", "c"]);
  assert.deepEqual(await fs.getMany(["api:missing"]), [null]);
});

await check("reports keep the existing file layout locally", { MATCHPULSE_STORAGE: "filesystem" }, async () => {
  const dir = tempDir("fs-reports");
  process.env.MATCHPULSE_DATA_DIR = dir;
  assert.equal((await saveReportOnce(report(501))).fixtureId, 501);
  assert.ok(readdirSync(join(dir, "match-reports")).includes("501.json"));
  assert.equal((await getStoredReport(501)).headline, "Home FC beat Away FC 1–0");
});

console.log("Redis backend (official client, fake REST server)");

await check("reports: write-once, validated, listed newest first", REDIS(), async () => {
  assert.equal(storage().kind, "redis");
  assert.equal((await saveReportOnce(report(601))).fixtureId, 601);
  assert.equal((await saveReportOnce(report(601, { headline: "Different" }))).headline, "Home FC beat Away FC 1–0", "duplicate keeps the first copy");
  await saveReportOnce(report(602, { kickoff: "2026-10-23T19:00:00.000Z" }));
  assert.deepEqual((await listStoredReports()).map((r) => r.fixtureId), [602, 601]);
  assert.equal(await reportExists(601), true);
  assert.equal(await reportExists(999), false);
  const reportSet = fake.state.commands.find((c) => String(c[0]).toLowerCase() === "set" && String(c[1]).endsWith(":report:601"));
  assert.ok(reportSet.map((x) => String(x).toLowerCase()).includes("nx"), "write-once uses SET … NX");
});

await check("report survives a new instance (and a separate process)", REDIS(), async () => {
  const prefix = process.env.MATCHPULSE_STORAGE_PREFIX;
  await saveReportOnce(report(701));
  resetStorageForTests(); // a brand-new serverless instance: new client, empty memory
  assert.equal((await getStoredReport(701)).fixtureId, 701);
  // Async: the fake Redis server runs in this process and must keep serving.
  const { stdout: out } = await promisify(execFile)(
    process.execPath,
    ["--import", "./scripts/test-loader.mjs", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--input-type=module", "-e",
      'const { getStoredReport } = await import("@/lib/report-store"); console.log((await getStoredReport(701))?.fixtureId ?? "none");'],
    { env: { ...process.env, MATCHPULSE_STORAGE: "redis", MATCHPULSE_STORAGE_PREFIX: prefix }, encoding: "utf8", timeout: 20000 },
  );
  assert.equal(out.trim(), "701", "read back by a separate process");
});

await check("malformed or mismatched records are ignored", REDIS(), async () => {
  const p = process.env.MATCHPULSE_STORAGE_PREFIX;
  fake.rawSet(`${p}:report:801`, "{not json");
  fake.rawSet(`${p}:report:802`, JSON.stringify(report(999)));
  fake.rawSet(`${p}:report:803`, JSON.stringify(report(803, { home: { id: 1, name: "Home FC", logo: "https://evil.example/x.png" } })));
  assert.equal(await getStoredReport(801), null);
  assert.equal(await getStoredReport(802), null, "stored under the wrong ID");
  assert.equal((await getStoredReport(803)).home.logo, null, "unsafe crest URL dropped");
});

await check("Redis outage: no crash, nothing claimed as stored, secrets not logged", REDIS(), async () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    fake.state.mode = "fail";
    assert.equal(await getStoredReport(601), null);
    assert.equal(await saveReportOnce(report(901)), null);
    assert.deepEqual(await listStoredReports(), []);
    assert.equal(await isKnownFixture(1), null);
    fake.state.mode = "garbage";
    assert.equal(await getStoredReport(601), null);
  } finally {
    console.error = original;
  }
  assert.ok(errors.length > 0, "failures are logged");
  for (const line of errors) {
    assert.ok(!line.includes(fake.token), "token never logged");
    assert.ok(!line.includes(fake.url), "URL never logged");
  }
});

await check("fixture index shared through Redis", REDIS(), async () => {
  const now = new Date("2026-10-22T12:00:00Z");
  await recordKnownFixtures([3, 1, 2], now);
  resetStorageForTests();
  assert.equal(await isKnownFixture(2, now.getTime()), true);
  assert.equal(await isKnownFixture(9, now.getTime()), false);
  assert.equal(await isKnownFixture(2, now.getTime() + 27 * 3600e3), null, "stale index not trusted");
});

console.log("Shared API cache");

await check("hit, expiry, failures and malformed entries", REDIS(), async () => {
  let calls = 0;
  const compute = async () => ({ ok: true, value: { n: ++calls } });
  assert.deepEqual(await sharedResult("k1", compute, () => 1), { ok: true, value: { n: 1 } });
  assert.deepEqual(await sharedResult("k1", compute, () => 1), { ok: true, value: { n: 1 } }, "cache hit");
  assert.equal(calls, 1);
  await new Promise((r) => setTimeout(r, 1100));
  assert.deepEqual(await sharedResult("k1", compute, () => 1), { ok: true, value: { n: 2 } }, "expired → refetched");
  const failing = async () => ({ ok: false, error: { kind: "rate_limited", message: "Too many requests" } });
  await sharedResult("k2", failing, () => 60);
  assert.equal((await sharedResult("k2", compute, () => 60)).ok, false, "failure shared (rate-limit protection)");
  fake.rawSet(`${process.env.MATCHPULSE_STORAGE_PREFIX}:api:k3`, '{"ok":"maybe"}');
  assert.deepEqual(await sharedResult("k3", compute, () => 60), { ok: true, value: { n: 3 } }, "malformed entry ignored");
});

await check("concurrent instances: one fetch, the other reuses it", REDIS(), async () => {
  let calls = 0;
  const slow = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 400));
    return { ok: true, value: "data" };
  };
  const [a, b] = await Promise.all([sharedResult("k4", slow, () => 60), sharedResult("k4", slow, () => 60)]);
  assert.deepEqual([a, b], [{ ok: true, value: "data" }, { ok: true, value: "data" }]);
  assert.equal(calls, 1, "duplicate concurrent request avoided");
});

await check("Redis outage: cache falls back to calling the source", REDIS(), async () => {
  const original = console.error;
  console.error = () => {};
  try {
    fake.state.mode = "fail";
    let calls = 0;
    const result = await sharedResult("k5", async () => ({ ok: true, value: ++calls }), () => 60);
    assert.deepEqual(result, { ok: true, value: 1 });
  } finally {
    console.error = original;
  }
});

await check("no storage (Vercel without Redis): reports not saved, cache passes through", { VERCEL: "1" }, async () => {
  assert.equal(await saveReportOnce(report(951)), null, "never pretends to persist");
  let calls = 0;
  await sharedResult("k6", async () => ({ ok: true, value: ++calls }), () => 60);
  await sharedResult("k6", async () => ({ ok: true, value: ++calls }), () => 60);
  assert.equal(calls, 2);
});

await fake.close();
console.log(`\n${passed} storage checks passed (local fake Redis, no network)`);
