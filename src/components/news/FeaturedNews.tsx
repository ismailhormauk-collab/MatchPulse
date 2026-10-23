"use client";

import Link from "next/link";
import { useState } from "react";
import type { NewsArticle } from "@/lib/types";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { SampleDataNotice } from "@/components/ui/SampleDataNotice";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ArticleMeta } from "./NewsCard";
import { NewsArtwork } from "./NewsArtwork";

export function FeaturedNews({ articles }: { articles: NewsArticle[] }) {
  const [index, setIndex] = useState(0);
  const article = articles[index];
  const go = (delta: number) => setIndex((value) => (value + delta + articles.length) % articles.length);

  return (
    <section aria-roledescription="carousel" aria-labelledby="featured-news">
      <SectionHeading
        id="featured-news"
        eyebrow="Sample articles"
        title="Football News"
        action={{ label: "All news", href: "/news" }}
      />
      <div className="mb-3">
        <SampleDataNotice>
          These are sample articles written for development, not real news. A licensed news source has not been connected
          yet.
        </SampleDataNotice>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_17rem]">
        {/* Hero */}
        <div className="min-w-0">
          <Link
            href={`/news/${article.slug}`}
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${articles.length}: ${article.title}`}
            className="group relative block overflow-hidden rounded-2xl border border-line"
          >
            <NewsArtwork article={article} sizes="(min-width: 1280px) 720px, 100vw" priority />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-4 pt-14 sm:p-6 sm:pt-20">
              <ArticleMeta article={article} tone="overlay" />
              <h3 className="mt-2 max-w-2xl font-display text-xl font-bold leading-tight text-white group-hover:text-pulse sm:text-3xl">
                {article.title}
              </h3>
              <p className="mt-1.5 hidden max-w-2xl text-sm text-white/75 sm:line-clamp-2">{article.excerpt}</p>
            </div>
          </Link>

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <div className="flex gap-1.5">
              {articles.map((item, i) => (
                <button
                  key={item.slug}
                  type="button"
                  aria-label={`Show story ${i + 1}`}
                  aria-current={i === index}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-pulse" : "w-1.5 bg-surface-3 hover:bg-faint"}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="mr-1 text-xs tabular-nums text-faint">
                {index + 1} / {articles.length}
              </span>
              <CarouselButton label="Previous story" onClick={() => go(-1)}>
                <ChevronLeftIcon className="size-4" />
              </CarouselButton>
              <CarouselButton label="Next story" onClick={() => go(1)}>
                <ChevronRightIcon className="size-4" />
              </CarouselButton>
            </div>
          </div>
        </div>

        {/* Story list (wide screens) */}
        <ol className="hidden flex-col gap-2 xl:flex">
          {articles.map((item, i) => (
            <li key={item.slug} className="flex-1">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-current={i === index}
                className={`flex h-full w-full flex-col justify-center rounded-xl border p-3 text-left transition-colors ${
                  i === index
                    ? "border-pulse/50 bg-pulse-soft"
                    : "border-line bg-surface shadow-card hover:bg-surface-2"
                }`}
              >
                <span className="text-[11px] font-semibold text-pulse">{item.category}</span>
                <span className="mt-1 line-clamp-3 text-sm font-semibold leading-snug text-ink">{item.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function CarouselButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-card hover:bg-surface-2"
    >
      {children}
    </button>
  );
}
