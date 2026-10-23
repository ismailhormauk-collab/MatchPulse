"use client";

import { useState } from "react";
import type { NewsArticle } from "@/lib/types";
import { NewsCard } from "./NewsCard";

interface NewsGridProps {
  articles: NewsArticle[];
  initialCount: number;
  step?: number;
  /** "sidebar": layouts that share the row with the competitions sidebar. */
  columns?: "three" | "sidebar";
}

export function NewsGrid({ articles, initialCount, step = initialCount, columns = "three" }: NewsGridProps) {
  const [count, setCount] = useState(initialCount);
  const visible = articles.slice(0, count);

  return (
    <div>
      <div
        className={`grid gap-3 sm:grid-cols-2 sm:gap-4 ${columns === "three" ? "lg:grid-cols-3" : "xl:grid-cols-3"}`}
      >
        {visible.map((article) => (
          <NewsCard key={article.slug} article={article} />
        ))}
      </div>
      {count < articles.length && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setCount((value) => value + step)}
            className="rounded-full border border-line bg-surface px-5 py-2 shadow-card text-sm font-medium text-ink transition-colors hover:border-pulse/40 hover:text-pulse"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
