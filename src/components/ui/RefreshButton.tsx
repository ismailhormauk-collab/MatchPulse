"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Re-renders the current page on the server. Data still comes from the
 * server-side cache, so this never calls the football API directly and does
 * not poll; it only picks up anything the cache has refreshed since.
 */
export function RefreshButton({ label = "Refresh" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      aria-live="polite"
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink/90 shadow-card transition-colors hover:border-pulse/40 hover:text-pulse disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" className={`size-3.5 ${pending ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {pending ? "Refreshing…" : label}
    </button>
  );
}
