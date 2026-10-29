import { loadExternalNews, type ExternalHeadline } from "@/lib/newsdata";
import { DataNotice } from "@/components/ui/DataNotice";
import { LocalTime } from "@/components/ui/LocalTime";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ArrowRightIcon } from "@/components/ui/icons";

const NEWSDATA_URL = "https://newsdata.io";

/**
 * "Latest Football News": external headlines from other publishers via
 * NewsData.io, kept separate from MatchPulse's own articles. Shows only the
 * headline, publisher, publication time and an outbound link.
 * `whenUnavailable`: "notice" explains a temporary outage; "hide" renders nothing.
 */
export async function ExternalNewsSection({
  headingId,
  limit,
  whenUnavailable,
  columns = "three",
}: {
  headingId: string;
  limit?: number;
  whenUnavailable: "notice" | "hide";
  columns?: "three" | "sidebar";
}) {
  const view = await loadExternalNews();
  if (view.state === "disabled") return null;
  if (view.state === "unavailable" && whenUnavailable === "hide") return null;

  return (
    <section aria-labelledby={headingId}>
      <SectionHeading
        id={headingId}
        title="Latest Football News"
        description="Headlines from other publishers. Each one opens the original article on the publisher's website."
      />
      {view.state === "unavailable" ? (
        <DataNotice tone="warn">External football headlines are unavailable right now. Please check back later.</DataNotice>
      ) : (
        <div className="space-y-4">
          <DataNotice tone={view.stale ? "warn" : "info"}>
            {view.stale && (
              <>
                The latest update did not return new headlines, so these are the ones fetched on{" "}
                <LocalTime iso={view.fetchedAt} variant="datetime" />.{" "}
              </>
            )}
            External headlines, not written by MatchPulse. They are delayed: our news provider supplies articles about 12
            hours after publication
            {view.delayHours !== null && view.delayHours > 0 ? ` (the newest here was ${view.delayHours} hours old when fetched)` : ""}
            , so this is not live news. Updated at most hourly.{" "}
            <a href={NEWSDATA_URL} target="_blank" rel="noopener" className="font-medium underline underline-offset-2 hover:text-pulse">
              Powered by NewsData.io API
            </a>
          </DataNotice>
          <ul className={`grid gap-3 sm:grid-cols-2 sm:gap-4 ${columns === "three" ? "lg:grid-cols-3" : "xl:grid-cols-3"}`}>
            {(limit ? view.headlines.slice(0, limit) : view.headlines).map((item) => (
              <li key={item.id}>
                <ExternalHeadlineCard item={item} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** One external headline; the whole card links to the publisher in a new tab. */
function ExternalHeadlineCard({ item }: { item: ExternalHeadline }) {
  return (
    <article className="group h-full overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-colors hover:border-pulse/40 hover:bg-surface-2">
      <div aria-hidden className="h-1 bg-gradient-to-r from-faint/70 via-faint/25 to-transparent" />
      <a href={item.url} target="_blank" rel="noopener nofollow" className="flex h-full flex-col gap-2.5 p-4">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
          <span className="rounded-full border border-line px-2 py-0.5 font-semibold uppercase tracking-wide text-muted">External</span>
          <span className="font-semibold text-ink/80">{item.source}</span>
          <span aria-hidden>·</span>
          <LocalTime iso={item.publishedAt} variant="datetime" />
        </span>
        <h3 className="line-clamp-3 text-[15px] font-semibold leading-snug text-ink group-hover:text-pulse">{item.title}</h3>
        <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-muted group-hover:text-pulse">
          Read on {item.source}
          <ArrowRightIcon className="size-3.5 -rotate-45" />
          <span className="sr-only">(external website, opens in a new tab)</span>
        </span>
      </a>
    </article>
  );
}

export function ExternalNewsSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="h-6 w-56 animate-pulse rounded bg-surface" />
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}
