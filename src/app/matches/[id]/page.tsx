import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMetadata, siteUrl } from "@/lib/site";
import { breadcrumbs, JsonLd } from "@/components/seo/JsonLd";
import type { Match } from "@/lib/types";
import { Suspense } from "react";
import { getLeague, leagueHref } from "@/data/leagues";
import { loadMatchDetails, loadMatchSummary } from "@/lib/match-details";
import { MatchDetailsView } from "@/components/matches/MatchDetailsView";
import { MatchReportArticle } from "@/components/reports/MatchReportArticle";
import { DataNotice } from "@/components/ui/DataNotice";

export async function generateMetadata({ params }: PageProps<"/matches/[id]">): Promise<Metadata> {
  const { id } = await params;
  // Feed lookup only: shares the page's cached feed and never requests details.
  const summary = await loadMatchSummary(id);
  if (summary.state !== "found") {
    // Unknown or invalid IDs render a message with HTTP 200 (streamed), so keep them out of search indexes.
    const title = summary.state === "invalid" || summary.state === "not-found" ? "Match not found" : "Match details";
    return pageMetadata({ title, description: "Match details on MatchPulse.", path: "/matches", index: false });
  }
  const { home, away, leagueSlug } = summary.match;
  const league = getLeague(leagueSlug)?.name;
  return pageMetadata({
    title: `${home.name} vs ${away.name}`,
    description: `${home.name} vs ${away.name}${league ? ` in the ${league}` : ""}: score, events, lineups and statistics.`,
    path: `/matches/${summary.id}`,
  });
}

// Unknown or out-of-window IDs get a real 404 from src/proxy.ts when the
// known-fixture index is available; the page states below are a fallback.
export default function MatchPage({ params }: PageProps<"/matches/[id]">) {
  return (
    <div className="mx-auto max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-3 text-xs text-muted">
        <Link href="/matches" className="hover:text-pulse">
          ← All matches
        </Link>
      </nav>
      <Suspense fallback={<MatchSkeleton />}>
        <MatchContent params={params} />
      </Suspense>
    </div>
  );
}

async function MatchContent({ params }: { params: PageProps<"/matches/[id]">["params"] }) {
  const { id } = await params;
  const view = await loadMatchDetails(id);

  switch (view.state) {
    case "invalid":
      notFound();
    case "disabled":
      return (
        <Message title="Match details are unavailable">
          Real match data is switched off in this environment. Sample matches do not have detail pages.
        </Message>
      );
    case "feed-unavailable":
      return <Message title="Match details are unavailable">{view.reason}</Message>;
    case "not-found":
      return (
        <Message title="Match not found">
          This match isn&apos;t in MatchPulse&apos;s current fixtures (yesterday to tomorrow in the supported competitions).
        </Message>
      );
    case "ok": {
      const league = getLeague(view.match.leagueSlug);
      const { match } = view;
      const venue = view.details?.venue;
      const path = `/matches/${match.fixtureId}`;
      return (
        <>
          <JsonLd
            data={{
              "@graph": [
                {
                  "@type": "SportsEvent",
                  name: `${match.home.name} vs ${match.away.name}`,
                  sport: "Football",
                  startDate: match.kickoff,
                  eventStatus: eventStatus(match),
                  homeTeam: { "@type": "SportsTeam", name: match.home.name },
                  awayTeam: { "@type": "SportsTeam", name: match.away.name },
                  ...(venue?.name
                    ? { location: { "@type": "Place", name: venue.name, ...(venue.city ? { address: venue.city } : {}) } }
                    : {}),
                  ...(league ? { superEvent: { "@type": "SportsEvent", name: league.name } } : {}),
                  url: new URL(path, siteUrl()).toString(),
                },
                breadcrumbs(
                  [
                    { name: "Matches", path: "/matches" },
                    { name: `${match.home.name} vs ${match.away.name}`, path },
                  ],
                  siteUrl(),
                ),
              ],
            }}
          />
          <MatchDetailsView
            match={view.match}
            league={league}
            details={view.details}
            detailsError={view.detailsError}
            fetchedAt={view.fetchedAt}
          />
          {view.report && (
            <section className="mt-6 rounded-2xl border border-pulse/30 bg-surface-2/60 p-4 sm:p-6">
              <MatchReportArticle report={view.report} headingLevel="h2" />
              <p className="mt-4 text-sm">
                <Link href={`/reports/${view.report.fixtureId}`} className="font-medium text-pulse hover:underline">
                  Open the report page →
                </Link>
              </p>
            </section>
          )}
          {league && (
            <p className="mt-5 text-center text-sm">
              <Link href={leagueHref(league.slug)} className="font-medium text-pulse hover:underline">
                {league.name} standings →
              </Link>
            </p>
          )}
        </>
      );
    }
  }
}

/** schema.org status; finished and live matches took place as scheduled. */
function eventStatus(match: Match): string {
  if (match.status === "postponed") {
    return match.statusDetail === "Cancelled" || match.statusDetail === "Abandoned"
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventPostponed";
  }
  return "https://schema.org/EventScheduled";
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold tracking-wide">{title}</h1>
      <DataNotice tone="warn">{children}</DataNotice>
      <Link href="/matches" className="inline-block text-sm font-medium text-pulse hover:underline">
        Browse all matches →
      </Link>
    </div>
  );
}

function MatchSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading match">
      <div className="h-48 animate-pulse rounded-2xl border border-line bg-surface" />
      <div className="h-10 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-40 animate-pulse rounded-xl border border-line bg-surface" />
    </div>
  );
}
