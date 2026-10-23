import { storage } from "@/lib/storage";

// Index of fixture IDs in the current match feed (yesterday–tomorrow), so
// src/proxy.ts can answer unknown /matches/[id] URLs with a real 404 without
// calling the API. Written by the match feed only when the ID set changes;
// stored in the shared storage (filesystem locally, Redis when deployed).
// Server-side only (also used by src/proxy.ts).

const KEY = "fixtures:known";

/** An index older than this is not trusted (the feed window has moved on). */
export const INDEX_MAX_AGE_MS = 26 * 3600 * 1000;

let lastWritten = "";

export async function recordKnownFixtures(ids: number[], now = new Date()): Promise<void> {
  const sorted = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0).sort((a, b) => a - b);
  const key = sorted.join(",");
  if (key === lastWritten) return;
  const store = storage();
  if (!store.persistent) return;
  await store.set(KEY, JSON.stringify({ updatedAt: now.toISOString(), ids: sorted }));
  lastWritten = key;
}

/**
 * true/false when a fresh index exists; null when it is missing, unreadable
 * or stale (callers must then let the request through rather than guess).
 */
export async function isKnownFixture(id: number, now = Date.now()): Promise<boolean | null> {
  const text = await storage().get(KEY);
  if (text === null) return null;
  try {
    const raw = JSON.parse(text) as { updatedAt?: unknown; ids?: unknown };
    const updated = typeof raw.updatedAt === "string" ? Date.parse(raw.updatedAt) : NaN;
    if (!Number.isFinite(updated) || now - updated > INDEX_MAX_AGE_MS || !Array.isArray(raw.ids)) return null;
    return raw.ids.includes(id);
  } catch {
    return null;
  }
}

/** For tests: forget the last write so the next record call writes again. */
export function resetFixtureIndexMemo() {
  lastWritten = "";
}
