import { storage } from "@/lib/storage";

// Shared cache for API-Football results, beneath each in-memory "use cache"
// function. On serverless hosts every new instance starts with an empty
// memory cache; this layer lets instances (and restarts) reuse results, and
// share cached failures such as rate limits, instead of spending quota.
//
// - Stores successes and failures with the same lifetimes as the in-memory
//   cache (the caller passes them).
// - A short lock stops several instances fetching the same key at once: the
//   others wait briefly for the first result.
// - Malformed entries are ignored; storage failures fall back to calling the
//   API directly (exactly the previous behaviour).

export type SharedResult<T> = { ok: true; value: T } | { ok: false; error: { kind: string; message: string } };

const LOCK_SECONDS = 20;
const WAIT_STEPS = 6;
const WAIT_MS = 500;

function readEntry<T>(text: string | null): SharedResult<T> | null {
  if (text === null) return null;
  try {
    const entry = JSON.parse(text) as SharedResult<T>;
    if (entry && entry.ok === true && "value" in entry) return entry;
    if (
      entry &&
      entry.ok === false &&
      typeof entry.error?.kind === "string" &&
      typeof entry.error?.message === "string"
    ) {
      return entry;
    }
  } catch {
    // fall through: malformed entry
  }
  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Returns the shared result for `key`, computing (and storing) it when absent.
 * `ttlSeconds` decides how long a given result stays shared.
 */
export async function sharedResult<T>(
  key: string,
  compute: () => Promise<SharedResult<T>>,
  ttlSeconds: (result: SharedResult<T>) => number,
): Promise<SharedResult<T>> {
  const store = storage();
  if (!store.persistent) return compute();

  const cacheKey = `api:${key}`;
  const hit = readEntry<T>(await store.get(cacheKey));
  if (hit) return hit;

  // Someone else is fetching this key: wait briefly for their result.
  const lockKey = `lock:${cacheKey}`;
  const locked = await store.setIfAbsent(lockKey, String(Date.now()), LOCK_SECONDS);
  if (!locked) {
    for (let step = 0; step < WAIT_STEPS; step += 1) {
      await sleep(WAIT_MS);
      const waited = readEntry<T>(await store.get(cacheKey));
      if (waited) return waited;
    }
  }

  const result = await compute();
  const ttl = Math.round(ttlSeconds(result));
  if (ttl > 0) await store.set(cacheKey, JSON.stringify(result), ttl);
  if (locked) await store.del(lockKey);
  return result;
}
