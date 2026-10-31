import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { listStoredReports } from "@/lib/report-store";
import { listArticles } from "@/lib/articles/store";
import { dayChangedAt } from "@/lib/day-changes";
import { siteDays } from "@/lib/match-feed";
import { SITE_TIME_ZONE, zonedDayStart } from "@/lib/time";
import { STANDINGS_SLUGS } from "@/lib/standings";
import { productionSiteConfigured, siteUrl } from "@/lib/site";

// Useful, stable pages only, including published MatchPulse articles and the
// three daily match pages. Not listed: individual match pages (temporary and
// noindex), external NewsData headlines (they belong to their publishers).
// lastmod is only given where a real timestamp exists. A daily match page
// changes when its day's fixtures, statuses or scores change (recorded by the
// match feed; no API request is made here) and when its URL moves on to the
// next date at London midnight, so it is the later of the two. Without a
// recorded day there is no lastmod.
// Match reports are listed once a production domain is configured.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection(); // reports are read from the store at request time
  const origin = siteUrl();
  const url = (path: string) => new URL(path, origin).toString();
  const reports = productionSiteConfigured() ? await listStoredReports(500) : [];
  const now = new Date();
  const days = siteDays(now);
  const changed = await dayChangedAt([days.yesterday, days.today, days.tomorrow]);
  const lastMidnight = zonedDayStart(now, SITE_TIME_ZONE).toISOString();
  const daily = (path: string, dateKey: string, priority: number) => {
    const contentChanged = changed[dateKey];
    const lastModified = contentChanged ? (contentChanged > lastMidnight ? contentChanged : lastMidnight) : null;
    return { url: url(path), ...(lastModified ? { lastModified } : {}), changeFrequency: "hourly" as const, priority };
  };
  return [
    { url: url("/"), changeFrequency: "hourly", priority: 1 },
    daily("/matches", days.today, 0.9),
    daily("/matches/yesterday", days.yesterday, 0.8),
    daily("/matches/tomorrow", days.tomorrow, 0.8),
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
