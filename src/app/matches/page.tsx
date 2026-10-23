import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import { Suspense } from "react";
import { MatchCenterSkeleton, MatchFeedSection } from "@/components/matches/MatchFeedSection";
import { SectionHeading } from "@/components/ui/SectionHeading";

export const metadata: Metadata = pageMetadata({
  title: "Matches",
  description: "Football fixtures, live scores and results from the Premier League, LaLiga, Serie A, Bundesliga, Ligue 1, the Champions League, the Europa League and the Botola Pro.",
  path: "/matches",
});

export default function MatchesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeading as="h1" title="Matches" description="Fixtures and results grouped by competition." />
      <Suspense fallback={<MatchCenterSkeleton />}>
        <MatchFeedSection />
      </Suspense>
    </div>
  );
}
