// Small key-value storage abstraction shared by match reports, the
// known-fixture index and the shared API-Football cache.
//
// Backends (see ./index.ts for selection):
// - filesystem: local development or a long-running server with a disk
// - redis:      Upstash Redis for serverless deployments (e.g. Vercel)
// - none:       nothing is persisted (serverless without Redis configured)
//
// Backend methods may throw; callers use the safe wrapper from ./index.ts.

export type StorageKind = "filesystem" | "redis" | "none";

export interface StorageBackend {
  readonly kind: StorageKind;
  /** False for "none": writes are dropped and must not be relied on. */
  readonly persistent: boolean;
  get(key: string): Promise<string | null>;
  getMany(keys: string[]): Promise<(string | null)[]>;
  /** Overwrites. Optional TTL in seconds. */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** Writes only if the key does not exist (atomic). Returns true when written. */
  setIfAbsent(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  del(key: string): Promise<void>;
  /** Adds or updates a member of a scored index. */
  indexAdd(index: string, member: string, score: number): Promise<void>;
  /** Members with the highest scores first. */
  indexTop(index: string, limit: number): Promise<string[]>;
}
