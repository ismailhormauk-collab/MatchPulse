import "server-only";

import { createHash } from "node:crypto";
import { storage } from "@/lib/storage";
import type { Match } from "@/lib/types";

// When each daily match page's content last changed, for the sitemap lastmod
// of /matches, /matches/yesterday and /matches/tomorrow.
//
// Built from the match feed MatchPulse already loaded (no API requests): each
// UK day's meaningful content (which fixtures, kickoff, status and score) is
// fingerprinted, and the time is stored only when that fingerprint changes.
// Requests that see unchanged data write nothing, so the timestamp is never
// "now" by default. The live match clock is excluded (it moves every minute
// without a new score).

const KEY = "fixtures:day-changes";
const KEEP_DAYS = 5;

interface DayChange {
  fingerprint: string;
  changedAt: string;
}

type DayChanges = Record<string, DayChange>;

// Per instance: fingerprints already known to be stored (skips storage reads).
const known = new Map<string, string>();

export function dayFingerprint(matches: Match[]): string {
  const parts = matches
    .map((match) =>
      [match.fixtureId ?? match.id, match.kickoff, match.status, match.statusDetail ?? "", match.homeScore ?? "", match.awayScore ?? ""].join(":"),
    )
    .sort();
  return createHash("sha1").update(parts.join("|")).digest("hex");
}

function read(text: string | null): DayChanges {
  if (!text) return {};
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object") return {};
    const out: DayChanges = {};
    for (const [day, entry] of Object.entries(value as Record<string, unknown>)) {
      const record = entry as Partial<DayChange> | null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && typeof record?.fingerprint === "string" && typeof record.changedAt === "string" && Number.isFinite(Date.parse(record.changedAt))) {
        out[day] = { fingerprint: record.fingerprint, changedAt: record.changedAt };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Records the content of each UK day ("YYYY-MM-DD" → its matches). Writes only
 * when a day's fingerprint differs from the stored one.
 */
export async function recordDayContents(byDay: Record<string, Match[]>, now = new Date()): Promise<void> {
  const fingerprints = Object.entries(byDay).map(([day, matches]) => [day, dayFingerprint(matches)] as const);
  if (fingerprints.length === 0) return;
  if (fingerprints.every(([day, fingerprint]) => known.get(day) === fingerprint)) return;

  const store = storage();
  if (!store.persistent) return;
  const stored = read(await store.get(KEY));
  let changed = false;
  for (const [day, fingerprint] of fingerprints) {
    if (stored[day]?.fingerprint !== fingerprint) {
      stored[day] = { fingerprint, changedAt: now.toISOString() };
      changed = true;
    }
  }
  if (changed) {
    const keep = Object.keys(stored).sort().slice(-KEEP_DAYS);
    await store.set(KEY, JSON.stringify(Object.fromEntries(keep.map((day) => [day, stored[day]]))));
  }
  for (const [day, fingerprint] of fingerprints) known.set(day, fingerprint);
}

/** When the content of a UK day last changed, or null if unknown. */
export async function dayChangedAt(dateKeys: string[]): Promise<Record<string, string | null>> {
  const stored = read(await storage().get(KEY));
  return Object.fromEntries(dateKeys.map((day) => [day, stored[day]?.changedAt ?? null]));
}

/** For tests: forget per-instance knowledge. */
export function resetDayChangesMemo() {
  known.clear();
}
