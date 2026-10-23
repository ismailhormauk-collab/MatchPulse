import type { Metadata } from "next";
import { isNonProductionDeployment } from "@/lib/deployment";

// Site-wide SEO settings. Both values are read at build time for static pages,
// so set them in the production build environment.
//
//   MATCHPULSE_SITE_URL=https://www.example.com   public origin (canonical URLs, sitemap, Open Graph)
//   MATCHPULSE_ALLOW_INDEXING=true                 only for the real production deployment

export const SITE_NAME = "MatchPulse";
export const SITE_DESCRIPTION =
  "Football fixtures, results, standings and player rankings from Europe's top competitions and the Botola Pro.";

const LOCAL_ORIGIN = "http://localhost:3000";

/** Brand image from app/opengraph-image.tsx (pages set their own openGraph, so it is referenced explicitly). */
const SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "MatchPulse: football fixtures, results, standings and player rankings",
};

/** Public origin of the site; falls back to localhost when unset or invalid. */
export function siteUrl(): URL {
  const raw = process.env.MATCHPULSE_SITE_URL?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") return new URL(url.origin);
    } catch {
      // Invalid value: fall through to the local origin.
    }
  }
  return new URL(LOCAL_ORIGIN);
}

/**
 * Search engines may index the site only when explicitly enabled and a real
 * production domain is configured, so local, preview, staging and placeholder
 * builds are never indexed by accident.
 */
export function indexingAllowed(): boolean {
  return process.env.MATCHPULSE_ALLOW_INDEXING === "true" && productionSiteConfigured() && !isNonProductionDeployment();
}

// Reserved example domains (RFC 2606) and local names are placeholders, never production.
const PLACEHOLDER_HOST = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost|local)$/;

/** True when MATCHPULSE_SITE_URL names a real public https origin (not localhost or a placeholder). */
export function productionSiteConfigured(): boolean {
  const raw = process.env.MATCHPULSE_SITE_URL?.trim();
  if (!raw) return false;
  const url = siteUrl();
  if (url.protocol !== "https:") return false;
  return !PLACEHOLDER_HOST.test(url.hostname) && !/^\d+(\.\d+){3}$/.test(url.hostname);
}

interface PageMeta {
  title: string;
  description: string;
  /** Path of the canonical URL, e.g. "/matches". */
  path: string;
  /** Set false for pages that should never be indexed (sample content, not-found states). */
  index?: boolean;
  /** Use the title as-is, without the "· MatchPulse" suffix (home page). */
  absoluteTitle?: boolean;
}

/**
 * Complete metadata for a page. Next merges metadata shallowly, so each page
 * gets its own canonical URL, Open Graph block and robots rule here.
 */
export function pageMetadata({ title, description, path, index = true, absoluteTitle = false }: PageMeta): Metadata {
  const allow = index && indexingAllowed();
  const fullTitle = absoluteTitle ? title : `${title} · ${SITE_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_GB",
      url: path,
      title: fullTitle,
      description,
      images: [SHARE_IMAGE],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [SHARE_IMAGE.url] },
    // Non-indexed pages still let crawlers follow their links.
    robots: allow ? { index: true, follow: true } : { index: false, follow: true },
  };
}
