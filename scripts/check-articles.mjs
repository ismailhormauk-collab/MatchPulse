// Tests for original MatchPulse articles (src/lib/articles, content/news).
// Uses synthetic test files in a temporary folder, plus a check that every
// real file in content/news is valid. No network.
// Run with: npm run test:articles
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { parseFrontMatter, parseMarkdown, parseInline, safeHref } = await import("@/lib/articles/markdown");
const { parseArticleFile, readArticleFiles, listArticles, getArticle, articleExists, resetArticlesForTests } = await import("@/lib/articles/store");

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

const BODY = "This is a synthetic test article body used only by the automated tests. ".repeat(4).trim();
function articleFile({ title = "Test article", summary = "Synthetic test summary.", author = "Test Author", publishedAt = "2026-10-01T09:00:00Z", extra = "", body = BODY } = {}) {
  return `---\ntitle: "${title}"\nsummary: "${summary}"\nauthor: ${author}\npublishedAt: ${publishedAt}\n${extra}---\n\n${body}\n`;
}

console.log("Markdown");
await check("front matter: quoted and plain values, booleans, comments", () => {
  const parsed = parseFrontMatter('---\ntitle: "A: title"\nauthor: Test Author\n# note\ndraft: true\n---\nBody');
  assert.deepEqual(parsed, { data: { title: "A: title", author: "Test Author", draft: true }, body: "Body" });
  assert.equal(parseFrontMatter("no front matter"), null);
});

await check("blocks: headings, paragraphs, lists, quotes", () => {
  const blocks = parseMarkdown("# Top\n\n## Section\n\nLine one\nline two\n\n- a\n- b\n\n1. first\n2. second\n\n> quoted\n> text\n\n### Small");
  assert.deepEqual(
    blocks.map((b) => b.type + (b.level ?? "") + (b.ordered === undefined ? "" : b.ordered ? ":ol" : ":ul")),
    ["heading2", "heading2", "paragraph", "list:ul", "list:ol", "quote", "heading3"],
  );
  assert.deepEqual(blocks[2].children, [{ type: "text", text: "Line one line two" }]);
  assert.equal(blocks[3].items.length, 2);
});

await check("inline: bold, italic, links; unsafe links and HTML stay plain text", () => {
  assert.deepEqual(parseInline("**bold** and *it*"), [
    { type: "strong", children: [{ type: "text", text: "bold" }] },
    { type: "text", text: " and " },
    { type: "em", children: [{ type: "text", text: "it" }] },
  ]);
  assert.deepEqual(parseInline("[table](/leagues/botola-pro)"), [{ type: "link", href: "/leagues/botola-pro", children: [{ type: "text", text: "table" }] }]);
  assert.ok(!parseInline("[x](javascript:alert(1))").some((n) => n.type === "link"));
  assert.ok(!parseInline("[x](http://insecure.example)").some((n) => n.type === "link"));
  assert.deepEqual(parseInline("<script>alert(1)</script>"), [{ type: "text", text: "<script>alert(1)</script>" }]);
  assert.equal(safeHref("//evil.example"), null);
  assert.equal(safeHref("https://example.com/a"), "https://example.com/a");
});

console.log("Validation");
await check("a complete article is accepted", () => {
  const result = parseArticleFile("/x/test-article.md", articleFile({ extra: "category: Analysis\nupdatedAt: 2026-10-02T09:00:00Z\n" }));
  assert.equal(result.ok, true);
  assert.equal(result.article.slug, "test-article");
  assert.equal(result.article.publishedAt, "2026-10-01T09:00:00.000Z");
  assert.equal(result.article.updatedAt, "2026-10-02T09:00:00.000Z");
  assert.equal(result.article.category, "Analysis");
  assert.equal(result.article.draft, false);
  assert.ok(result.article.readMinutes >= 1);
});

await check("missing or invalid fields are rejected with clear reasons (no placeholders published)", () => {
  const problems = (file, source) => parseArticleFile(file, source).problems ?? [];
  assert.match(problems("/x/Bad Name.md", articleFile()).join(), /file name/);
  assert.match(problems("/x/a.md", articleFile({ title: "" })).join(), /title is required/);
  assert.match(problems("/x/a.md", articleFile({ summary: "" })).join(), /summary is required/);
  assert.match(problems("/x/a.md", articleFile({ author: "" })).join(), /author is required/);
  assert.match(problems("/x/a.md", articleFile({ publishedAt: "soon" })).join(), /publishedAt/);
  assert.match(problems("/x/a.md", articleFile({ body: "Too short." })).join(), /body is missing/);
  assert.match(problems("/x/a.md", articleFile({ extra: "image: https://cdn.koora.com/x.jpg\nimageAlt: a\nimageCredit: b\n" })).join(), /local file/);
  assert.match(problems("/x/a.md", articleFile({ extra: "image: /news-images/a.jpg\n" })).join(), /imageCredit is required/);
  assert.match(problems("/x/a.md", articleFile({ extra: "updatedAt: 2026-09-01T00:00:00Z\n" })).join(), /before publishedAt/);
  assert.match(problems("/x/a.md", "no front matter").join(), /front matter/);
});

console.log("Store");
const dir = mkdtempSync(join(tmpdir(), "matchpulse-articles-"));
const write = (name, content) => writeFileSync(join(dir, name), content);
try {
  process.env.MATCHPULSE_CONTENT_DIR = dir;
  write("older-article.md", articleFile({ title: "Older test article", publishedAt: "2026-09-01T09:00:00Z" }));
  write("newer-article.md", articleFile({ title: "Newer test article", publishedAt: "2026-10-01T09:00:00Z", extra: "image: /news-images/test.jpg\nimageAlt: Test image\nimageCredit: Test credit\n" }));
  write("draft-article.md", articleFile({ title: "Draft", extra: "draft: true\n" }));
  write("scheduled-article.md", articleFile({ title: "Scheduled", publishedAt: "2026-12-01T09:00:00Z" }));
  write("broken-article.md", "---\ntitle: Broken\n---\n");
  write("_template.md", articleFile({ title: "Template" }));
  write("README.md", "# Not an article");
  resetArticlesForTests();
  const now = Date.parse("2026-10-23T12:00:00Z");

  await check("published articles only, newest first; drafts, broken files, templates and README skipped", () => {
    assert.deepEqual(listArticles(now).map((a) => a.slug), ["newer-article", "older-article"]);
    assert.equal(listArticles(now)[0].image.credit, "Test credit");
    assert.equal(readArticleFiles(dir).filter((r) => !r.ok).length, 1, "only the broken file is invalid");
  });

  await check("scheduled articles appear at their publication time", () => {
    assert.equal(articleExists("scheduled-article", now), false);
    assert.equal(articleExists("scheduled-article", Date.parse("2026-12-01T09:00:00Z")), true);
  });

  await check("lookups: published slug found; drafts, unknown and malformed slugs are not", () => {
    assert.equal(getArticle("newer-article", now)?.title, "Newer test article");
    assert.equal(articleExists("draft-article", now), false);
    assert.equal(articleExists("no-such-article", now), false);
    assert.equal(articleExists("../etc/passwd", now), false);
    assert.equal(articleExists("_template", now), false);
  });

  await check("an empty or missing folder means no articles (empty state)", () => {
    process.env.MATCHPULSE_CONTENT_DIR = join(dir, "missing");
    resetArticlesForTests();
    assert.deepEqual(listArticles(now), []);
  });
} finally {
  delete process.env.MATCHPULSE_CONTENT_DIR;
  resetArticlesForTests();
  rmSync(dir, { recursive: true, force: true });
}

console.log("Repository content");
await check("every article in content/news is valid", () => {
  const results = readArticleFiles(join(process.cwd(), "content", "news"));
  const invalid = results.filter((r) => !r.ok).map((r) => `${r.file}: ${r.problems.join("; ")}`);
  assert.deepEqual(invalid, []);
  console.log(`    (${results.length} article file${results.length === 1 ? "" : "s"})`);
});

await check("published articles: unique titles, local credited images, a sources section, no Koora links", () => {
  const articles = readArticleFiles(join(process.cwd(), "content", "news")).filter((r) => r.ok).map((r) => r.article);
  const titles = articles.map((a) => a.title.toLowerCase());
  assert.equal(new Set(titles).size, titles.length, "duplicate titles");
  for (const article of articles) {
    const where = `content/news/${article.slug}.md`;
    if (article.image) {
      assert.ok(existsSync(join(process.cwd(), "public", article.image.src)), `${where}: image file missing`);
      assert.ok(article.image.license && article.image.sourceUrl, `${where}: image licence and source are required`);
    }
    const headings = article.blocks.filter((b) => b.type === "heading").map((b) => b.children.map((c) => c.text ?? "").join(""));
    assert.ok(headings.includes("Sources"), `${where}: needs a "## Sources" section`);
    const sources = article.blocks.slice(article.blocks.findIndex((b) => b.type === "heading" && b.children[0]?.text === "Sources"));
    const links = sources.flatMap((b) => (b.type === "list" ? b.items.flat() : [])).filter((n) => n.type === "link");
    assert.ok(links.length > 0, `${where}: the sources section has no links`);
    assert.ok(!JSON.stringify(article).includes("koora.com"), `${where}: links to Koora`);
  }
});

console.log(`\n${passed} article checks passed (no network)`);
