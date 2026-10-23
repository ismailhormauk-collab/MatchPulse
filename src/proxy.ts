import { NextResponse, type NextRequest } from "next/server";
import { SUPPORTED_COMPETITIONS } from "@/lib/api-football/competitions";
import { reportExists } from "@/lib/report-store";
import { articleExists } from "@/lib/articles/store";
import articleIndex from "@/data/article-index.json";
import { isKnownFixture } from "@/lib/fixture-index";
import { liveDataAllowedInThisDeployment } from "@/lib/deployment";

// Real HTTP 404s for unknown dynamic URLs. Pages stream, and once streaming
// starts the status is fixed at 200, so these checks run here, before render.
// Only fast checks (fixed lists, or one storage read): never an API request. When a check can't decide
// (e.g. no fixture index yet), the request passes through to the page, whose
// own not-found state is marked noindex.

const STANDINGS = new Set(SUPPORTED_COMPETITIONS.map((spec) => spec.slug));

function fixtureId(raw: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id <= 2_147_483_647 ? id : null;
}

/**
 * Published original article? Production builds use the index generated at
 * build time (scripts/build-article-index.mjs): the proxy may run where
 * content/news is not available (e.g. Vercel). `next dev` reads the files, so
 * new articles work without a restart.
 */
function articlePublished(slug: string): boolean {
  if (process.env.NODE_ENV !== "production") return articleExists(slug);
  const entry = (articleIndex as { slug: string; publishedAt: string }[]).find((item) => item.slug === slug);
  return entry !== undefined && Date.parse(entry.publishedAt) <= Date.now();
}

function liveDataEnabled(): boolean {
  return (
    process.env.MATCHPULSE_DATA_SOURCE === "api-football" &&
    Boolean(process.env.API_FOOTBALL_KEY?.trim()) &&
    liveDataAllowedInThisDeployment()
  );
}

/** Renders the app's not-found page with a 404 status (no route matches this path). */
function notFound(request: NextRequest) {
  return NextResponse.rewrite(new URL("/_matchpulse-not-found", request.url));
}

async function isMissing(pathname: string): Promise<boolean> {
  const [, section, value, extra] = pathname.split("/");
  if (extra !== undefined) return false; // deeper paths fall through to normal routing
  const slug = decodeURIComponent(value ?? "");

  if (section === "leagues") return !STANDINGS.has(slug);
  if (section === "news") return !articlePublished(slug); // original MatchPulse articles only (content/news)
  if (section === "reports") {
    const id = fixtureId(slug);
    if (id === null) return true;
    return !(await reportExists(id));
  }
  if (section === "matches") {
    const id = fixtureId(slug);
    if (id === null || !liveDataEnabled()) return true; // sample matches have no pages
    return (await isKnownFixture(id)) === false; // null (no fresh index) → let the page decide
  }
  return false;
}

export async function proxy(request: NextRequest) {
  if (await isMissing(request.nextUrl.pathname)) return notFound(request);
  return NextResponse.next();
}

export const config = {
  matcher: ["/leagues/:slug", "/news/:slug", "/reports/:id", "/matches/:id"],
};
