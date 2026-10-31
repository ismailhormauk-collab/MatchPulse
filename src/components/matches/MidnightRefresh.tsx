"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { msUntilNextMidnight, SITE_TIME_ZONE, zonedDateKey } from "@/lib/time";

const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Reloads the server data when the UK date changes while a daily match page
 * stays open, so "today", "yesterday" and "tomorrow" move on at London
 * midnight. Also checks when the tab becomes visible again (timers are slowed
 * in background tabs). `dateKey` is the UK date the page was rendered for.
 */
export function MidnightRefresh({ dateKey }: { dateKey: string }) {
  const router = useRouter();

  useEffect(() => {
    const refreshIfNewDay = () => {
      if (zonedDateKey(new Date(), SITE_TIME_ZONE) !== dateKey) router.refresh();
    };
    // A few seconds after midnight, so the server sees the new date too.
    const delay = Math.min(msUntilNextMidnight(new Date(), SITE_TIME_ZONE) + 5_000, MAX_TIMEOUT_MS);
    const timer = window.setTimeout(refreshIfNewDay, delay);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshIfNewDay();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [dateKey, router]);

  return null;
}
