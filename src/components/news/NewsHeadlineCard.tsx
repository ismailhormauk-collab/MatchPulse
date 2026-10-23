import type { NewsItem } from "@/lib/types";
import { headlineDisplay } from "@/lib/news/display";
import { LocalTime } from "@/components/ui/LocalTime";
import { ArrowRightIcon } from "@/components/ui/icons";

/**
 * A headline from an external publisher, linking to the original article.
 * Links only: no article text or images are reproduced (no reuse licence).
 */
export function NewsHeadlineCard({ item, featured = false }: { item: NewsItem; featured?: boolean }) {
  const headline = headlineDisplay(item);
  return (
    <article className="group relative h-full overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-colors hover:border-pulse/40 hover:bg-surface-2">
      {/* Decorative accent in place of a cover image (none is licensed). */}
      <div aria-hidden className={`bg-gradient-to-r from-pulse/70 via-pulse/25 to-transparent ${featured ? "h-1.5" : "h-1"}`} />
      <a
        href={item.url}
        target="_blank"
        rel="noopener"
        className={`flex h-full flex-col ${featured ? "gap-4 p-5 sm:p-6" : "gap-3 p-4"}`}
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
          <span className="rounded-full bg-pulse-soft px-2 py-0.5 font-semibold text-pulse">{item.source}</span>
          <LocalTime iso={item.publishedAt} variant="date" />
          <span aria-hidden>·</span>
          <span>{headline.label}</span>
        </span>

        <h3
          lang={headline.lang}
          dir={headline.dir}
          title={headline.original ? `Original (Arabic): ${headline.original}` : undefined}
          className={`font-semibold text-ink group-hover:text-pulse ${headline.lang === "ar" ? "text-right leading-relaxed" : "leading-snug"} ${
            featured ? "font-display text-xl sm:text-2xl" : `line-clamp-3 ${headline.lang === "ar" ? "text-base" : "text-[15px]"}`
          }`}
        >
          {headline.text}
        </h3>

        <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-muted group-hover:text-pulse">
          Read on {item.source}
          <ArrowRightIcon className="size-3.5 -rotate-45" />
          <span className="sr-only">(opens the original article in a new tab)</span>
        </span>
      </a>
    </article>
  );
}
