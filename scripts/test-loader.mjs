// Node module hooks that let tests import app server modules directly:
// - resolves the "@/" alias and extensionless .ts imports under src/
// - stubs Next.js runtime modules ("use cache" directives are plain strings in Node)
// Usage: node --import ./scripts/test-loader.mjs <test>
import { register } from "node:module";

// Tests never touch the project's real data folder or Redis unless a test opts
// in (MATCHPULSE_STORAGE=filesystem with its own temporary MATCHPULSE_DATA_DIR).
process.env.MATCHPULSE_STORAGE ??= "none";
// Tests never fetch koora.com; news tests pass their own fake fetch.
process.env.MATCHPULSE_NEWS_SOURCE ??= "off";
process.env.MATCHPULSE_NEWS_TRANSLATION ??= "off";

const srcRoot = new URL("../src/", import.meta.url).href;

const hooks = `
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = ${JSON.stringify(srcRoot)};
const STUBS = {
  "server-only": "export {};",
  "next/cache": "export function cacheLife() {} export function cacheTag() {}",
  "next/server": "export async function connection() {}",
};

function findFile(href) {
  for (const suffix of ["", ".ts", "/index.ts"]) {
    const path = fileURLToPath(href + suffix);
    if (existsSync(path) && statSync(path).isFile()) return new URL(href + suffix).href;
  }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier in STUBS) return { url: "stub:" + specifier, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const found = findFile(new URL(specifier.slice(2), SRC).href);
    if (found) return { url: found, shortCircuit: true };
  }
  if (/^\\.\\.?\\//.test(specifier) && context.parentURL?.startsWith(SRC)) {
    const found = findFile(new URL(specifier, context.parentURL).href);
    if (found) return { url: found, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith("stub:")) return { format: "module", source: STUBS[url.slice(5)], shortCircuit: true };
  // The bundler imports JSON without attributes; mirror that for app files.
  if (url.startsWith(SRC) && url.endsWith(".json")) {
    const { readFileSync } = await import("node:fs");
    return { format: "module", source: "export default " + readFileSync(fileURLToPath(url), "utf8"), shortCircuit: true };
  }
  return next(url, context);
}
`;

register("data:text/javascript," + encodeURIComponent(hooks));
