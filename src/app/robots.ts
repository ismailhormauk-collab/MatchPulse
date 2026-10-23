import type { MetadataRoute } from "next";
import { indexingAllowed, siteUrl } from "@/lib/site";

// Crawling is allowed only on the real production deployment
// (MATCHPULSE_ALLOW_INDEXING=true); every other build asks crawlers to stay out.
export default function robots(): MetadataRoute.Robots {
  if (!indexingAllowed()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", siteUrl()).toString(),
  };
}
