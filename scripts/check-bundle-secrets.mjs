// After `next build`: fails if any server-side secret value appears in the
// browser bundles (.next/static) or public files. Prints variable names only,
// never values. Values come from the environment and .env.local if present.
//   npm run test:secrets
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SECRET_VARS = ["API_FOOTBALL_KEY", "ANTHROPIC_API_KEY", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"];

function envLocal() {
  if (!existsSync(".env.local")) return {};
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line.trim()))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.replace(/^["']|["']$/g, "").trim()]),
  );
}

const local = envLocal();
const secrets = SECRET_VARS.map((name) => ({ name, value: (process.env[name] ?? local[name] ?? "").trim() })).filter(
  (secret) => secret.value.length >= 8,
);

function* files(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

assert.ok(existsSync(".next/static"), "Run `npm run build` first.");
let scanned = 0;
const leaks = [];
for (const dir of [".next/static", "public"]) {
  for (const file of files(dir)) {
    const content = readFileSync(file, "latin1");
    scanned += 1;
    for (const secret of secrets) if (content.includes(secret.value)) leaks.push(`${secret.name} in ${file}`);
    for (const marker of ["x-apisports-key", "API_FOOTBALL_KEY", "ANTHROPIC_API_KEY", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"]) {
      if (content.includes(marker)) leaks.push(`"${marker}" in ${file}`);
    }
  }
}
console.log(`Scanned ${scanned} browser/public files for ${secrets.map((s) => s.name).join(", ") || "(no secret values set)"}`);
assert.deepEqual(leaks, [], `Secrets exposed:\n${leaks.join("\n")}`);
console.log("No secret values or server-only key names found in browser bundles or public files.");
