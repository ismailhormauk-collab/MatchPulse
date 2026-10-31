import type { Metadata } from "next";
import { Suspense } from "react";
import { DailyMatches, matchDayMetadata } from "@/components/matches/DailyMatchesPage";
import { MatchCenterSkeleton } from "@/components/matches/MatchFeedSection";

// Tomorrow's football fixtures (UK date), from the same cached feed as /matches.
export async function generateMetadata(): Promise<Metadata> {
  return matchDayMetadata("tomorrow");
}

export default function TomorrowPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<MatchCenterSkeleton />}>
        <DailyMatches day="tomorrow" />
      </Suspense>
    </div>
  );
}
