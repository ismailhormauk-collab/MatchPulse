import { connection } from "next/server";
import { listArticles } from "@/lib/articles/store";
import { DataNotice } from "@/components/ui/DataNotice";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ArticleCard } from "./ArticleCard";

/**
 * Original MatchPulse articles (content/news), newest first. Read at request
 * time so scheduled (future-dated) articles appear when their publication
 * time comes. `whenEmpty`: "notice" explains there are none yet; "hide"
 * renders nothing.
 */
export async function OriginalArticlesSection({
  title = "MatchPulse Articles",
  description,
  limit,
  whenEmpty,
  headingId,
  headingLevel = "h2",
  showAllLink = false,
  featureFirst = false,
  columns = "three",
}: {
  title?: string;
  description?: string;
  limit?: number;
  whenEmpty: "notice" | "hide";
  headingId: string;
  headingLevel?: "h1" | "h2";
  showAllLink?: boolean;
  featureFirst?: boolean;
  columns?: "three" | "sidebar";
}) {
  await connection();
  const all = listArticles();
  if (all.length === 0 && whenEmpty === "hide") return null;
  const articles = limit ? all.slice(0, limit) : all;

  return (
    <section aria-labelledby={headingId}>
      <SectionHeading
        id={headingId}
        as={headingLevel}
        title={title}
        description={description}
        action={showAllLink && all.length > articles.length ? { label: "All news", href: "/news" } : undefined}
      />
      {articles.length === 0 ? (
        <DataNotice>
          No MatchPulse articles have been published yet. Original articles will appear here as soon as they are added.
        </DataNotice>
      ) : (
        <ul className={`grid gap-3 sm:grid-cols-2 sm:gap-4 ${columns === "three" ? "lg:grid-cols-3" : "xl:grid-cols-3"}`}>
          {articles.map((article, index) => {
            const featured = featureFirst && index === 0 && articles.length > 1;
            return (
              <li key={article.slug} className={featured ? "sm:col-span-2" : undefined}>
                <ArticleCard article={article} featured={featured} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ArticlesSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3" aria-hidden>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="h-72 animate-pulse rounded-xl border border-line bg-surface" />
      ))}
    </div>
  );
}
