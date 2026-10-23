import Image from "next/image";
import type { NewsArticle } from "@/lib/types";

interface NewsArtworkProps {
  article: NewsArticle;
  className?: string;
  /** `sizes` hint for licensed images. */
  sizes?: string;
  priority?: boolean;
}

/**
 * Article image in a fixed 16:9 frame. Renders `article.image` when a licensed
 * image is provided (its host must be allowed in next.config `images`);
 * otherwise draws generated placeholder artwork that is labelled as such.
 */
export function NewsArtwork({ article, className = "", sizes = "(min-width: 1024px) 33vw, 100vw", priority }: NewsArtworkProps) {
  const [from, to] = article.tone;

  if (article.image) {
    return (
      <figure className={`relative aspect-video overflow-hidden bg-surface-3 ${className}`}>
        <Image src={article.image.src} alt={article.image.alt} fill sizes={sizes} priority={priority} className="object-cover" />
        <figcaption className="absolute bottom-1.5 right-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] text-white/80">
          {article.image.credit}
        </figcaption>
      </figure>
    );
  }

  return (
    <div
      role="img"
      aria-label="Placeholder image"
      className={`relative aspect-video overflow-hidden ${className}`}
      style={{ background: `radial-gradient(120% 90% at 20% 15%, ${from}, ${to} 70%)` }}
    >
      <svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full opacity-25" aria-hidden>
        <g fill="none" stroke="white" strokeWidth="1.5">
          <rect x="20" y="16" width="360" height="193" />
          <line x1="200" y1="16" x2="200" y2="209" />
          <circle cx="200" cy="112.5" r="34" />
          <rect x="20" y="64" width="52" height="97" />
          <rect x="328" y="64" width="52" height="97" />
          <rect x="20" y="91" width="18" height="43" />
          <rect x="362" y="91" width="18" height="43" />
        </g>
        <circle cx="200" cy="112.5" r="3" fill="white" />
      </svg>
      <span className="absolute right-2 top-2 rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/80">
        Placeholder image
      </span>
    </div>
  );
}
