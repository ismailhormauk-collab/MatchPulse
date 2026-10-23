import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getArticle, listArticles } from "@/lib/articles/store";
import { pageMetadata, SITE_NAME, siteUrl } from "@/lib/site";
import { ArticleBody } from "@/components/articles/ArticleBody";
import { ArticleCard, ArticleMeta } from "@/components/articles/ArticleCard";
import { breadcrumbs, JsonLd } from "@/components/seo/JsonLd";
import { LocalTime } from "@/components/ui/LocalTime";
import { SectionHeading } from "@/components/ui/SectionHeading";

// Original MatchPulse articles from content/news/<slug>.md. Koora headlines
// have no pages here: they link to the publisher (no permission to republish).

async function load(slug: string) {
  // Request time, so scheduled articles appear when their publication time comes.
  await connection();
  return getArticle(slug);
}

export async function generateMetadata({ params }: PageProps<"/news/[slug]">): Promise<Metadata> {
  const article = await load((await params).slug);
  if (!article) {
    return pageMetadata({ title: "Article not found", description: "This article does not exist.", path: "/news", index: false });
  }
  const path = `/news/${article.slug}`;
  const base = pageMetadata({ title: article.title, description: article.summary, path });
  return {
    ...base,
    authors: [{ name: article.author }],
    openGraph: {
      ...base.openGraph,
      type: "article",
      publishedTime: article.publishedAt,
      ...(article.updatedAt ? { modifiedTime: article.updatedAt } : {}),
      authors: [article.author],
      ...(article.image ? { images: [{ url: article.image.src, alt: article.image.alt }] } : {}),
    },
  };
}

export default function ArticlePage({ params }: PageProps<"/news/[slug]">) {
  return (
    <div className="space-y-10">
      <Suspense fallback={<div className="mx-auto h-96 max-w-3xl animate-pulse rounded-2xl border border-line bg-surface" />}>
        <Article params={params} />
      </Suspense>
    </div>
  );
}

// Unknown or unpublished slugs get a real 404 from src/proxy.ts; this is a fallback.
async function Article({ params }: { params: PageProps<"/news/[slug]">["params"] }) {
  const article = await load((await params).slug);
  if (!article) notFound();

  const origin = siteUrl();
  const path = `/news/${article.slug}`;
  const more = listArticles()
    .filter((item) => item.slug !== article.slug)
    .slice(0, 3);

  return (
    <>
      <JsonLd
        data={{
          "@graph": [
            {
              "@type": "NewsArticle",
              headline: article.title,
              description: article.summary,
              datePublished: article.publishedAt,
              dateModified: article.updatedAt ?? article.publishedAt,
              author: { "@type": "Person", name: article.author },
              publisher: {
                "@type": "Organization",
                name: SITE_NAME,
                logo: { "@type": "ImageObject", url: new URL("/brand/icon-512.png", origin).toString() },
              },
              mainEntityOfPage: new URL(path, origin).toString(),
              ...(article.image ? { image: [new URL(article.image.src, origin).toString()] } : {}),
            },
            breadcrumbs(
              [
                { name: "News", path: "/news" },
                { name: article.title, path },
              ],
              origin,
            ),
          ],
        }}
      />

      <article className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="mb-3 text-xs text-muted">
          <Link href="/news" className="hover:text-pulse">
            ← News
          </Link>
        </nav>
        <ArticleMeta article={article} />
        <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">{article.title}</h1>
        <p className="mt-3 text-lg leading-relaxed text-muted">{article.summary}</p>
        <p className="mt-4 text-sm text-muted">
          By <span className="font-medium text-ink">{article.author}</span>
          {article.updatedAt && (
            <>
              {" "}
              · Updated <LocalTime iso={article.updatedAt} variant="datetime" />
            </>
          )}
        </p>

        {article.image && (
          <figure className="mt-6">
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-line bg-surface-3">
              <Image src={article.image.src} alt={article.image.alt} fill priority sizes="(min-width: 768px) 768px, 100vw" className="object-cover" />
            </div>
            <figcaption className="mt-2 text-xs leading-relaxed text-muted">
              {article.image.caption && <span className="text-ink/80">{article.image.caption}. </span>}
              {article.image.sourceUrl ? (
                <a href={article.image.sourceUrl} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-pulse">
                  {article.image.credit}
                </a>
              ) : (
                article.image.credit
              )}
              {article.image.license && (
                <>
                  {", "}
                  {article.image.licenseUrl ? (
                    <a href={article.image.licenseUrl} target="_blank" rel="noopener license" className="underline underline-offset-2 hover:text-pulse">
                      {article.image.license}
                    </a>
                  ) : (
                    article.image.license
                  )}
                  .
                </>
              )}
              {/* ShareAlike licences: the cropped version is shared under the same licence. */}
              {article.image.license?.includes("BY-SA") && " This adapted version is shared under the same licence."}
            </figcaption>
          </figure>
        )}

        <div className="mt-6">
          <ArticleBody blocks={article.blocks} />
        </div>
      </article>

      {more.length > 0 && (
        <section className="mx-auto max-w-5xl" aria-labelledby="more-articles">
          <SectionHeading id="more-articles" title="More MatchPulse Articles" action={{ label: "All news", href: "/news" }} />
          <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {more.map((item) => (
              <li key={item.slug}>
                <ArticleCard article={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
