import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { leagueHref } from "@/data/leagues";
import { parseFixtureId } from "@/lib/match-details";
import { getStoredReport } from "@/lib/report-store";
import { pageMetadata, productionSiteConfigured, siteUrl } from "@/lib/site";
import { MatchReportArticle } from "@/components/reports/MatchReportArticle";
import { breadcrumbs, JsonLd } from "@/components/seo/JsonLd";

async function load(rawId: string) {
  // Request-time read: storage (Redis) must not be read during prerendering.
  await connection();
  const id = parseFixtureId(rawId);
  return id === null ? null : getStoredReport(id);
}

export async function generateMetadata({ params }: PageProps<"/reports/[id]">): Promise<Metadata> {
  const report = await load((await params).id);
  if (!report) {
    return pageMetadata({ title: "Report not found", description: "This match report does not exist.", path: "/reports", index: false });
  }
  return pageMetadata({
    title: report.headline,
    description: `${report.home.name} ${report.score.home}–${report.score.away} ${report.away.name} (${report.competition}): scorers, cards and key statistics from official match data.`,
    path: `/reports/${report.fixtureId}`,
    index: productionSiteConfigured(),
  });
}

export default function ReportPage({ params }: PageProps<"/reports/[id]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-3 text-xs text-muted">
        <Link href="/reports" className="hover:text-pulse">
          ← MatchPulse Match Reports
        </Link>
      </nav>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl border border-line bg-surface" />}>
        <Report params={params} />
      </Suspense>
    </div>
  );
}

// Unknown IDs get a real 404 from src/proxy.ts; this is a fallback.
async function Report({ params }: { params: PageProps<"/reports/[id]">["params"] }) {
  const report = await load((await params).id);
  if (!report) notFound();
  const origin = siteUrl();
  const path = `/reports/${report.fixtureId}`;
  return (
    <>
      {/* SportsEvent describes the match itself; no Article/NewsArticle markup. */}
      <JsonLd
        data={{
          "@graph": [
            {
              "@type": "SportsEvent",
              name: `${report.home.name} vs ${report.away.name}`,
              sport: "Football",
              startDate: report.kickoff,
              eventStatus: "https://schema.org/EventScheduled",
              homeTeam: { "@type": "SportsTeam", name: report.home.name },
              awayTeam: { "@type": "SportsTeam", name: report.away.name },
              ...(report.venue ? { location: { "@type": "Place", name: report.venue } } : {}),
              superEvent: { "@type": "SportsEvent", name: report.competition },
              url: new URL(path, origin).toString(),
            },
            breadcrumbs(
              [
                { name: "Match reports", path: "/reports" },
                { name: report.headline, path },
              ],
              origin,
            ),
          ],
        }}
      />
      <MatchReportArticle report={report} />
      <p className="mt-6 text-sm">
        <Link href={leagueHref(report.leagueSlug)} className="font-medium text-pulse hover:underline">
          {report.competition} →
        </Link>
      </p>
    </>
  );
}
