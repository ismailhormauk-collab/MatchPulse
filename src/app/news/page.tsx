import type { Metadata } from "next";
import { Suspense } from "react";
import { pageMetadata } from "@/lib/site";
import { ArticlesSkeleton, OriginalArticlesSection } from "@/components/articles/OriginalArticlesSection";

// Original MatchPulse articles (content/news), each with its own page at
// /news/<slug>. Match reports stay in their own section (/reports).
export const metadata: Metadata = pageMetadata({
  title: "Football News",
  description: "Original football news, match reports and previews from the MatchPulse editorial team.",
  path: "/news",
});

export default function NewsPage() {
  return (
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
  );
}
