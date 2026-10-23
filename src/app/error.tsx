"use client";

import Link from "next/link";

/** Route-level error boundary: keeps the header and footer, offers a retry. */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-16 text-center" role="alert">
      <h1 className="font-display text-3xl font-bold tracking-wide">Something went wrong</h1>
      <p className="mt-3 text-sm text-muted">
        This page could not be loaded. No data is shown rather than out-of-date or incomplete information.
      </p>
      <div className="mt-6 flex justify-center gap-2 text-sm">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-pulse px-4 py-1.5 font-semibold text-on-pulse hover:opacity-90"
        >
          Try again
        </button>
        <Link href="/" className="rounded-full border border-line bg-surface px-4 py-1.5 font-medium hover:text-pulse">
          Go home
        </Link>
      </div>
    </div>
  );
}
