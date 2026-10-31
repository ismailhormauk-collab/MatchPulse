// Date and time formatting. Every function takes an explicit IANA time zone,
// so output never depends on the server's or browser's local settings.
// Kept free of runtime imports so scripts/check-time.mjs can load it directly.

export type TimeFormat = "12h" | "24h";

export interface TimeSettings {
  timeZone: string;
  timeFormat: TimeFormat;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(options);
  let cached = formatterCache.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, options);
    formatterCache.set(key, cached);
  }
  return cached;
}

function timeOptions(settings: TimeSettings): Intl.DateTimeFormatOptions {
  return settings.timeFormat === "12h"
    ? { hour: "numeric", minute: "2-digit", hourCycle: "h12", timeZone: settings.timeZone }
    : { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: settings.timeZone };
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Calendar date ("YYYY-MM-DD") of an instant as seen in `timeZone`. */
export function zonedDateKey(instant: string | Date, timeZone: string): string {
  const parts = formatter("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Kickoff time, e.g. "19:00" or "7:00 PM". */
export function formatTime(instant: string | Date, settings: TimeSettings): string {
  return formatter("en-US", timeOptions(settings)).format(new Date(instant));
}

/** "Wed, 21 Oct 2026" in the given zone. */
export function formatDate(instant: string | Date, timeZone: string): string {
  return formatter("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(instant));
}

/** "Wed, 21 Oct 2026 · 19:00" in the given zone. */
export function formatDateTime(instant: string | Date, settings: TimeSettings): string {
  return `${formatDate(instant, settings.timeZone)} · ${formatTime(instant, settings)}`;
}

// A date key is already a calendar date, so it is formatted at UTC noon in UTC:
// no time-zone shift can move it to another day.
function dateKeyToDate(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`);
}

/** "Wednesday, 21 October 2026" for a "YYYY-MM-DD" key. */
export function formatDateKeyLong(dateKey: string): string {
  return formatter("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateKeyToDate(dateKey));
}

/** { weekday: "Wed", day: "21 Oct" } for a "YYYY-MM-DD" key. */
export function formatDateKeyPill(dateKey: string): { weekday: string; day: string } {
  const date = dateKeyToDate(dateKey);
  return {
    weekday: formatter("en-GB", { weekday: "short", timeZone: "UTC" }).format(date),
    day: formatter("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(date),
  };
}

/**
 * MatchPulse's public site time zone. Server-rendered pages, the daily match
 * URLs (/matches, /matches/yesterday, /matches/tomorrow) and their titles use
 * UK time; visitors' saved time zones still apply in the browser.
 */
export const SITE_TIME_ZONE = "Europe/London";

/** A "YYYY-MM-DD" key moved by whole calendar days. */
export function shiftDateKey(dateKey: string, days: number): string {
  const date = dateKeyToDate(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "Sat 31 Oct 2026" for a "YYYY-MM-DD" key. */
export function formatDateKeyShort(dateKey: string): string {
  return formatter("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(dateKeyToDate(dateKey))
    .replace(",", "");
}

/** UK zone name at an instant: "GMT" in winter, "BST" in summer. */
export function ukZoneName(instant: string | Date): string {
  const part = formatter("en-GB", { timeZoneName: "short", timeZone: SITE_TIME_ZONE })
    .formatToParts(new Date(instant))
    .find((p) => p.type === "timeZoneName");
  return part?.value === "BST" ? "BST" : "GMT";
}

/**
 * Milliseconds from `now` until the next midnight in `timeZone`. Found by
 * search on the calendar date, so it is correct across daylight-saving changes.
 */
export function msUntilNextMidnight(now: string | Date, timeZone: string): number {
  const start = new Date(now).getTime();
  const today = zonedDateKey(new Date(start), timeZone);
  let low = start;
  let high = start + 27 * 3_600_000;
  while (high - low > 1) {
    const mid = low + Math.floor((high - low) / 2);
    if (zonedDateKey(new Date(mid), timeZone) === today) low = mid;
    else high = mid;
  }
  return high - start;
}

/** The instant the current calendar day began in `timeZone` (its last midnight), across daylight-saving changes. */
export function zonedDayStart(now: string | Date, timeZone: string): Date {
  const end = new Date(now).getTime();
  const today = zonedDateKey(new Date(end), timeZone);
  let low = end - 27 * 3_600_000;
  let high = end;
  while (high - low > 1) {
    const mid = low + Math.floor((high - low) / 2);
    if (zonedDateKey(new Date(mid), timeZone) === today) high = mid;
    else low = mid;
  }
  return new Date(high);
}

/** Short UTC offset of a zone at an instant, e.g. "GMT+9" or "GMT". */
export function formatOffset(timeZone: string, instant: string | Date): string {
  const part = formatter("en-US", { timeZoneName: "shortOffset", timeZone })
    .formatToParts(new Date(instant))
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

/**
 * Match clock for a live match: minutes since kickoff with a 15-minute
 * half-time break. Returns the label and 0–1 progress through 90 minutes.
 */
export function matchClock(kickoff: string, now: string): { label: string; progress: number } {
  const elapsed = Math.floor((Date.parse(now) - Date.parse(kickoff)) / 60_000);
  if (elapsed < 1) return { label: "1'", progress: 0 };
  if (elapsed <= 45) return { label: `${elapsed}'`, progress: elapsed / 90 };
  if (elapsed < 60) return { label: "HT", progress: 0.5 };
  const minute = elapsed - 15;
  if (minute > 90) return { label: "90+'", progress: 1 };
  return { label: `${minute}'`, progress: minute / 90 };
}
