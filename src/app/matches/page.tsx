import type { Metadata } from "next";
import { Suspense } from "react";
import { DailyMatches, matchDayMetadata } from "@/components/matches/DailyMatchesPage";
import { MatchCenterSkeleton } from "@/components/matches/MatchFeedSection";

// Today's football matches (UK date), the main landing page for daily
// fixtures and scores. Title, description and H1 come from today's real
// fixtures; a visitor's saved time zone only changes the list in the browser,
// never the URL.
export async function generateMetadata(): Promise<Metadata> {
  return matchDayMetadata("today");
}

export default function MatchesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <Suspense fallback={<MatchCenterSkeleton />}>
        <DailyMatches day="today" />
      </Suspense>
    </div>
  );
}
