import type { Metadata } from "next";
import { Suspense } from "react";
import { pageMetadata } from "@/lib/site";
import { ArticlesSkeleton, OriginalArticlesSection } from "@/components/articles/OriginalArticlesSection";
import { ExternalNewsSection, ExternalNewsSkeleton } from "@/components/news/ExternalNewsSection";

// Original MatchPulse articles (content/news), each with its own page at
// /news/<slug>, then a separate "Latest Football News" section of external
// headlines (NewsData.io) that link to their publishers. Match reports stay in
// their own section (/reports).
export const metadata: Metadata = pageMetadata({
  title: "Football News",
  description: "Original football news, match reports and previews from the MatchPulse editorial team.",
  path: "/news",
});

export default function NewsPage() {
  return (
    <div className="space-y-10">
      <Suspense fallback={<ArticlesSkeleton cards={9} />}>
        <OriginalArticlesSection
          title="News"
          description="Football news, match reports and previews from the MatchPulse editorial team, newest first."
          headingId="news-heading"
          headingLevel="h1"
          whenEmpty="notice"
          featureFirst
        />
      </Suspense>
      <Suspense fallback={<ExternalNewsSkeleton />}>
        <ExternalNewsSection headingId="latest-football-news" whenUnavailable="notice" />
      </Suspense>
    </div>
  );
}
