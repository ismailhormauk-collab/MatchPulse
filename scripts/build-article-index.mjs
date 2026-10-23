// Writes src/data/article-index.json: the slug and publication time of every
// publishable article in content/news. src/proxy.ts imports it to return real
// 404s for unknown /news/<slug> URLs without reading files at request time
// (on Vercel the proxy runs separately and has no access to content/news).
//
// Runs before every build and dev server (see package.json). Fails if an
// article file is invalid, so broken content never reaches a deployment.
//   npm run articles:index            write the index
//   npm run articles:index -- --check  fail if the index is out of date (used by npm test)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const { readArticleFiles } = await import("@/lib/articles/store");

const OUTPUT = join(process.cwd(), "src", "data", "article-index.json");
const check = process.argv.includes("--check");

const results = readArticleFiles(join(process.cwd(), "content", "news"));
const invalid = results.filter((result) => !result.ok);
if (invalid.length) {
  for (const result of invalid) console.error(`Invalid article ${result.file}: ${result.problems.join("; ")}`);
  process.exit(1);
}

const index = results
  .map((result) => result.article)
  .filter((article) => !article.draft)
  .sort((a, b) => a.slug.localeCompare(b.slug))
  .map(({ slug, publishedAt }) => ({ slug, publishedAt }));
const json = `${JSON.stringify(index, null, 2)}\n`;
const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, "utf8") : null;

if (check) {
  if (current !== json) {
    console.error("src/data/article-index.json is out of date: run `npm run articles:index`.");
    process.exit(1);
  }
  console.log(`Article index is up to date (${index.length} articles).`);
} else if (current !== json) {
  writeFileSync(OUTPUT, json);
  console.log(`Wrote src/data/article-index.json (${index.length} articles).`);
} else {
  console.log(`Article index unchanged (${index.length} articles).`);
}
