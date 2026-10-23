import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { listStoredReports } from "@/lib/report-store";
import { listArticles } from "@/lib/articles/store";
import { STANDINGS_SLUGS } from "@/lib/standings";
import { productionSiteConfigured, siteUrl } from "@/lib/site";

// Useful, stable pages only, including published MatchPulse articles. Not
// listed: Koora headlines (they live on the publisher's site), and match pages, which only exist for the yesterday-to-tomorrow window.
// Match reports are listed once a production domain is configured.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection(); // reports are read from the store at request time
  const origin = siteUrl();
  const url = (path: string) => new URL(path, origin).toString();
  const reports = productionSiteConfigured() ? await listStoredReports(500) : [];
  return [
    { url: url("/"), changeFrequency: "hourly", priority: 1 },
    { url: url("/matches"), changeFrequency: "hourly", priority: 0.9 },
    { url: url("/leagues"), changeFrequency: "monthly", priority: 0.6 },
    ...STANDINGS_SLUGS.map((slug) => ({ url: url(`/leagues/${slug}`), changeFrequency: "daily" as const, priority: 0.7 })),
    { url: url("/players"), changeFrequency: "weekly", priority: 0.6 },
    { url: url("/news"), changeFrequency: "hourly", priority: 0.7 },
    ...listArticles().map((article) => ({
      url: url(`/news/${article.slug}`),
      lastModified: article.updatedAt ?? article.publishedAt,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...(reports.length ? [{ url: url("/reports"), changeFrequency: "daily" as const, priority: 0.7 }] : []),
    ...reports.map((report) => ({
      url: url(`/reports/${report.fixtureId}`),
      lastModified: report.generatedAt,
      changeFrequency: "yearly" as const,
      priority: 0.5,
    })),
  ];
}
