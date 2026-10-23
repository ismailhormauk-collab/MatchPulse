import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { leagueHref, popularLeagues } from "@/data/leagues";
import { SAMPLE_NOW, sampleMatches } from "@/data/matches";
import { isLiveDataEnabled } from "@/lib/api-football/server";
import { connection } from "next/server";
import { listStoredReports } from "@/lib/report-store";
import { MatchReportCard } from "@/components/reports/MatchReportArticle";
import { LeagueSidebar } from "@/components/leagues/LeagueSidebar";
import { MatchCenterSkeleton, MatchFeedSection } from "@/components/matches/MatchFeedSection";
import { ArticlesSkeleton, OriginalArticlesSection } from "@/components/articles/OriginalArticlesSection";
import { LeagueBadge } from "@/components/ui/LeagueBadge";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMetadata, SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/site";
import { SectionHeading } from "@/components/ui/SectionHeading";

export const metadata: Metadata = pageMetadata({
  title: "MatchPulse — Football scores, fixtures and standings",
  description: SITE_DESCRIPTION,
  path: "/",
  absoluteTitle: true,
});

export default function HomePage() {
  // Sample-only: counted over the 24 hours around the sample "now" so the
  // label does not depend on the viewer's time zone. Hidden with real data.
  const nowMs = Date.parse(SAMPLE_NOW);
  const activeCounts = new Map<string, number>();
  for (const match of isLiveDataEnabled() ? [] : sampleMatches) {
    if (Math.abs(Date.parse(match.kickoff) - nowMs) <= 12 * 3_600_000) {
      activeCounts.set(match.leagueSlug, (activeCounts.get(match.leagueSlug) ?? 0) + 1);
    }
  }

  const origin = siteUrl();
  return (
    <div className="grid gap-6 lg:grid-cols-[14.5rem_minmax(0,1fr)] xl:gap-8">
      <JsonLd
        data={{
          "@graph": [
            { "@type": "WebSite", name: SITE_NAME, url: origin.toString(), description: SITE_DESCRIPTION },
            { "@type": "Organization", name: SITE_NAME, url: origin.toString(), logo: new URL("/brand/icon-512.png", origin).toString() },
          ],
        }}
      />
      <h1 className="sr-only">MatchPulse: football scores, fixtures, standings and player rankings</h1>
      <LeagueSidebar />

      <div className="min-w-0 space-y-9">
        <section aria-labelledby="todays-matches">
          <SectionHeading id="todays-matches" title="Today's Matches" action={{ label: "All matches", href: "/matches" }} />
          <Suspense fallback={<MatchCenterSkeleton rows={4} />}>
            <MatchFeedSection maxLeagues={4} />
          </Suspense>
        </section>

        <Suspense fallback={null}>
          <LatestReports />
        </Suspense>

        {/* Latest original MatchPulse articles; hidden until the first one is published. */}
        <Suspense fallback={<ArticlesSkeleton cards={3} />}>
          <OriginalArticlesSection title="Latest News" headingId="latest-news" whenEmpty="hide" limit={6} showAllLink columns="sidebar" />
        </Suspense>

        <section aria-labelledby="popular-competitions">
          <SectionHeading
            id="popular-competitions"
            title="Popular Competitions"
            action={{ label: "All leagues", href: "/leagues" }}
          />
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
            {popularLeagues.map((league) => {
              const count = activeCounts.get(league.slug) ?? 0;
              return (
                <li key={league.slug}>
                  <Link
                    href={leagueHref(league.slug)}
                    className="flex h-full items-center gap-3 rounded-xl border border-line bg-surface p-3 shadow-card transition-colors hover:border-pulse/40 hover:bg-surface-2"
                  >
                    <LeagueBadge league={league} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{league.name}</p>
                      <p className={`truncate text-[11px] ${count ? "font-medium text-pulse" : "text-muted"}`}>
                        {count ? `${count} sample fixture${count === 1 ? "" : "s"}` : league.country}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Latest stored reports (local store only, no API requests); hidden when there are none. */
async function LatestReports() {
  await connection();
  const reports = await listStoredReports(3);
  if (reports.length === 0) return null;
  return (
    <section aria-labelledby="match-reports">
      <SectionHeading
        id="match-reports"
        eyebrow="From official match data"
        title="MatchPulse Match Reports"
        action={{ label: "All reports", href: "/reports" }}
      />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {reports.map((report) => (
          <li key={report.fixtureId}>
            <MatchReportCard report={report} />
          </li>
        ))}
      </ul>
    </section>
  );
}
