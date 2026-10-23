import Image from "next/image";
import Link from "next/link";
import type { ArticleImage, OriginalArticle } from "@/lib/articles/store";
import { LocalTime } from "@/components/ui/LocalTime";

/** Card for an original MatchPulse article; opens the internal article page. */
export function ArticleCard({ article, featured = false }: { article: OriginalArticle; featured?: boolean }) {
  const href = `/news/${article.slug}`;
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-card transition-colors hover:border-pulse/40 hover:bg-surface-2">
      {article.image ? (
        <div className="relative aspect-video overflow-hidden bg-surface-3">
          {/* Same destination as the headline link below; hidden from keyboard and screen readers to avoid a duplicate. */}
          <Link href={href} tabIndex={-1} aria-hidden className="absolute inset-0">
            <Image
              src={article.image.src}
              alt=""
              fill
              sizes={featured ? "(min-width: 1024px) 800px, 100vw" : "(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw"}
              className="object-cover"
            />
          </Link>
          <CardImageCredit image={article.image} />
        </div>
      ) : (
        <div aria-hidden className={`bg-gradient-to-r from-pulse/70 via-pulse/25 to-transparent ${featured ? "h-1.5" : "h-1"}`} />
      )}
      <Link href={href} className={`flex flex-1 flex-col ${featured ? "gap-3 p-5 sm:p-6" : "gap-2.5 p-4"}`}>
        <ArticleMeta article={article} />
        <h3
          className={`font-semibold leading-snug text-ink group-hover:text-pulse ${featured ? "font-display text-xl sm:text-2xl" : "line-clamp-3 text-[15px]"}`}
        >
          {article.title}
        </h3>
        <p className={`text-[13px] leading-relaxed text-muted ${featured ? "line-clamp-3" : "line-clamp-2"}`}>{article.summary}</p>
        <span className="mt-auto text-xs font-medium text-muted group-hover:text-pulse">Read article →</span>
      </Link>
    </article>
  );
}

/**
 * Compact attribution for licensed (e.g. Creative Commons) images: the
 * photographer's credit linked to the source page, and the licence linked to
 * its text. Sits over the image, outside the article links.
 */
function CardImageCredit({ image }: { image: ArticleImage }) {
  if (!image.license) return null;
  const linkClass = "underline decoration-white/40 underline-offset-2 hover:text-white hover:decoration-white";
  const credit = image.shortCredit ?? image.credit;
  return (
    <p className="absolute bottom-1.5 right-1.5 max-w-[calc(100%-0.75rem)] rounded bg-black/60 px-1.5 py-0.5 text-right text-[10px] leading-snug text-white/85">
      Photo:{" "}
      {image.sourceUrl ? (
        <a href={image.sourceUrl} target="_blank" rel="noopener" className={linkClass}>
          {credit}
        </a>
      ) : (
        credit
      )}
      {", "}
      {image.licenseUrl ? (
        <a href={image.licenseUrl} target="_blank" rel="noopener license" className={linkClass}>
          {image.license}
        </a>
      ) : (
        image.license
      )}
    </p>
  );
}

export function ArticleMeta({ article, showAuthor = false }: { article: OriginalArticle; showAuthor?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
      <span className="rounded-full bg-pulse-soft px-2 py-0.5 font-semibold text-pulse">MatchPulse</span>
      {article.category && <span className="font-semibold text-ink/80">{article.category}</span>}
      <LocalTime iso={article.publishedAt} variant="date" />
      {showAuthor && (
        <>
          <span aria-hidden>·</span>
          <span>By {article.author}</span>
        </>
      )}
      <span aria-hidden>·</span>
      <span>{article.readMinutes} min read</span>
    </span>
  );
}
