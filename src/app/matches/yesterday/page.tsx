import type { Metadata } from "next";
import { Suspense } from "react";
import { DailyMatches, matchDayMetadata } from "@/components/matches/DailyMatchesPage";
import { MatchCenterSkeleton } from "@/components/matches/MatchFeedSection";

// Yesterday's football results (UK date), from the same cached feed as /matches.
export async function generateMetadata(): Promise<Metadata> {
  return matchDayMetadata("yesterday");
}

export default function YesterdayPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<MatchCenterSkeleton />}>
        <DailyMatches day="yesterday" />
      </Suspense>
    </div>
  );
}
