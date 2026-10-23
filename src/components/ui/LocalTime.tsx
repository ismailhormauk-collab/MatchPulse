"use client";

import { usePreferences } from "@/lib/preferences-store";
import { formatDate, formatDateTime, formatTime } from "@/lib/time";

/**
 * Renders an instant in the viewer's saved time zone and time format.
 * Server HTML uses the defaults (UTC, 24-hour); the client updates it after
 * hydration through the preferences store, so there is no hydration mismatch.
 */
export function LocalTime({ iso, variant = "date" }: { iso: string; variant?: "date" | "time" | "datetime" }) {
  const prefs = usePreferences();
  return (
    <time dateTime={iso}>
      {variant === "date"
        ? formatDate(iso, prefs.timeZone)
        : variant === "time"
          ? formatTime(iso, prefs)
          : formatDateTime(iso, prefs)}
    </time>
  );
}
