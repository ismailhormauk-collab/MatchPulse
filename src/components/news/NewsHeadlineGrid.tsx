"use client";

import { useState } from "react";
import type { NewsItem } from "@/lib/types";
import { NewsHeadlineCard } from "./NewsHeadlineCard";

interface NewsHeadlineGridProps {
  items: NewsItem[];
  initialCount: number;
  step?: number;
  /** Show the newest story as a wide featured card. */
  featureFirst?: boolean;
  /** "sidebar": layouts that share the row with the competitions sidebar. */
  columns?: "three" | "sidebar";
}

export function NewsHeadlineGrid({ items, initialCount, step = initialCount, featureFirst = false, columns = "three" }: NewsHeadlineGridProps) {
  const [count, setCount] = useState(initialCount);
  const visible = items.slice(0, count);

  return (
    <div>
      <ul className={`grid gap-3 sm:grid-cols-2 sm:gap-4 ${columns === "three" ? "lg:grid-cols-3" : "xl:grid-cols-3"}`}>
        {visible.map((item, index) => {
          const featured = featureFirst && index === 0;
          return (
            <li key={item.id} className={featured ? "sm:col-span-2" : undefined}>
              <NewsHeadlineCard item={item} featured={featured} />
            </li>
          );
        })}
      </ul>
      {count < items.length && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => setCount((value) => value + step)}
            className="rounded-full border border-line bg-surface px-5 py-2 text-sm font-medium text-ink shadow-card transition-colors hover:border-pulse/40 hover:text-pulse"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
