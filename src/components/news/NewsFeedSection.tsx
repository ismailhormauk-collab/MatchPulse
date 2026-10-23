import { loadNews } from "@/lib/news";
import { translationNotice } from "@/lib/news/display";
import { DataNotice } from "@/components/ui/DataNotice";
import { LocalTime } from "@/components/ui/LocalTime";
import { NewsHeadlineGrid } from "./NewsHeadlineGrid";

/** Latest Koora headlines with attribution and every fallback state. */
export async function NewsFeedSection({
  initialCount,
  step,
  maxItems,
  featureFirst = false,
  columns = "three",
}: {
  initialCount: number;
  step?: number;
  maxItems?: number;
  featureFirst?: boolean;
  columns?: "three" | "sidebar";
}) {
  const view = await loadNews();

  if (view.state === "disabled") {
    return <DataNotice tone="warn">The news feed is switched off on this server (MATCHPULSE_NEWS_SOURCE=off).</DataNotice>;
  }
  if (view.state === "unavailable") {
    return <DataNotice tone="warn">News is unavailable right now: {view.reason} Please try again later.</DataNotice>;
  }

  const items = maxItems ? view.items.slice(0, maxItems) : view.items;
  return (
    <div className="space-y-4">
      <DataNotice tone={view.stale ? "warn" : "info"}>
        {view.stale ? (
          <>
            Koora could not be reached, so these are the headlines last fetched on{" "}
            <LocalTime iso={view.fetchedAt} variant="datetime" />.{" "}
          </>
        ) : null}
        Headlines and publication dates from{" "}
        <a href="https://koora.com/" target="_blank" rel="noopener" className="font-medium underline underline-offset-2 hover:text-pulse">
          Koora
        </a>
        . {translationNotice(items)} Each story links to the original article; MatchPulse does not republish article text or
        images.
      </DataNotice>
      <NewsHeadlineGrid items={items} initialCount={initialCount} step={step} featureFirst={featureFirst} columns={columns} />
    </div>
  );
}

export function NewsFeedSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-9 animate-pulse rounded-lg border border-line bg-surface" />
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}
