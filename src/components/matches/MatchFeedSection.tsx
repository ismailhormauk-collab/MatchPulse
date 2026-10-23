import { getMatchFeed } from "@/lib/match-feed";
import { MatchCenter } from "./MatchCenter";

/**
 * Server component that loads the match feed and hands it to the client-side
 * match centre. Render it inside <Suspense>: with real data enabled it waits
 * for request time; with sample data it resolves during prerendering.
 */
export async function MatchFeedSection({ maxLeagues }: { maxLeagues?: number }) {
  const feed = await getMatchFeed();
  return <MatchCenter matches={feed.matches} now={feed.now} source={feed.source} maxLeagues={maxLeagues} />;
}

export function MatchCenterSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading matches">
      <div className="h-9 animate-pulse rounded-lg bg-surface-2" />
      <div className="h-12 animate-pulse rounded-lg bg-surface-2" />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="h-[4.5rem] animate-pulse rounded-lg border border-line bg-surface" />
      ))}
    </div>
  );
}
