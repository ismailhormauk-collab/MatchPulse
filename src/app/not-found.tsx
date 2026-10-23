import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Page not found",
  description: "The page you were looking for does not exist.",
  path: "/",
  index: false,
});

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="font-display text-6xl font-bold text-pulse">404</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-wide">Page not found</h1>
      <p className="mt-3 text-sm text-muted">The page you were looking for doesn&apos;t exist or has moved.</p>
      <nav aria-label="Suggested pages" className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
        {[
          ["/", "Home"],
          ["/matches", "Matches"],
          ["/leagues", "Leagues & standings"],
          ["/players", "Top players"],
        ].map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="rounded-full border border-line bg-surface px-4 py-1.5 font-medium shadow-card hover:border-pulse/40 hover:text-pulse"
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
