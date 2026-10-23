import Link from "next/link";
import type { NewsArticle } from "@/lib/types";
import { LocalTime } from "@/components/ui/LocalTime";
import { NewsArtwork } from "./NewsArtwork";

export function NewsCard({ article }: { article: NewsArticle }) {
  return (
    <article className="group h-full overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-colors hover:border-faint/60 hover:bg-surface-2">
      <Link href={`/news/${article.slug}`} className="flex h-full flex-col">
        <NewsArtwork article={article} sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw" />
        <div className="flex flex-1 flex-col p-3.5">
          <ArticleMeta article={article} />
          <h3 className="mt-2 line-clamp-2 text-[15px] font-semibold leading-snug text-ink group-hover:text-pulse">
            {article.title}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">{article.excerpt}</p>
        </div>
      </Link>
    </article>
  );
}

export function ArticleMeta({
  article,
  tone = "default",
  showTime = false,
}: {
  article: NewsArticle;
  /** "overlay" for text placed on top of artwork. */
  tone?: "default" | "overlay";
  showTime?: boolean;
}) {
  const overlay = tone === "overlay";
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] ${overlay ? "text-white/75" : "text-muted"}`}>
      <span
        title="Sample article written for development. Not real news."
        className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide ${overlay ? "bg-[#f5b84a] text-black" : "bg-warn/15 text-warn"}`}
      >
        Sample
      </span>
      <span
        className={`rounded-full px-2 py-0.5 font-semibold ${overlay ? "bg-pulse text-on-pulse" : "bg-pulse-soft text-pulse"}`}
      >
        {article.category}
      </span>
      <LocalTime iso={article.publishedAt} variant={showTime ? "datetime" : "date"} />
      <span aria-hidden>·</span>
      <span>{article.readMinutes} min read</span>
    </div>
  );
}
