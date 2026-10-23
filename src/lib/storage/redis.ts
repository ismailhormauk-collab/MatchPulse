import { Redis } from "@upstash/redis";
import type { StorageBackend } from "./types";

// Upstash Redis backend (official @upstash/redis client, REST over HTTPS), for
// serverless deployments where instances share nothing and the disk is
// temporary. Values are stored as plain strings (automatic JSON
// deserialisation off) and validated by the callers when read.

/** Subset of the Upstash client used here; tests can pass a fake. */
export interface RedisLike {
  get(key: string): Promise<unknown>;
  mget(...keys: string[]): Promise<unknown[]>;
  set(key: string, value: string, opts?: { ex?: number; nx?: true }): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  zadd(key: string, scoreMember: { score: number; member: string }): Promise<unknown>;
  zrange(key: string, min: number, max: number, opts?: { rev?: boolean }): Promise<unknown[]>;
}

export interface RedisCredentials {
  url: string;
  token: string;
}

/**
 * Same names the official client reads in Redis.fromEnv():
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, or the KV_REST_API_URL /
 * KV_REST_API_TOKEN names set by Vercel's Upstash integration.
 */
export function redisCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): RedisCredentials | null {
  const url = (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "").trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "").trim();
  return url && token ? { url, token } : null;
}

const TIMEOUT_MS = 2500;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Redis request timed out")), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);

export function createRedisBackend(options: { credentials?: RedisCredentials; client?: RedisLike; prefix: string }): StorageBackend {
  const client: RedisLike =
    options.client ??
    (new Redis({
      url: options.credentials!.url,
      token: options.credentials!.token,
      automaticDeserialization: false,
      // One quick retry; storage problems must not hold pages up for long.
      retry: { retries: 1, backoff: () => 150 },
      enableTelemetry: false,
    }) as unknown as RedisLike);
  const k = (key: string) => `${options.prefix}:${key}`;

  return {
    kind: "redis",
    persistent: true,

    async get(key) {
      return asString(await withTimeout(client.get(k(key))));
    },

    async getMany(keys) {
      if (keys.length === 0) return [];
      const values = await withTimeout(client.mget(...keys.map(k)));
      return keys.map((_, index) => asString(values[index]));
    },

    async set(key, value, ttlSeconds) {
      await withTimeout(client.set(k(key), value, ttlSeconds ? { ex: Math.max(1, Math.round(ttlSeconds)) } : undefined));
    },

    async setIfAbsent(key, value, ttlSeconds) {
      const opts: { nx: true; ex?: number } = { nx: true };
      if (ttlSeconds) opts.ex = Math.max(1, Math.round(ttlSeconds));
      const result = await withTimeout(client.set(k(key), value, opts));
      return result === "OK";
    },

    async del(key) {
      await withTimeout(client.del(k(key)));
    },

    async indexAdd(index, member, score) {
      await withTimeout(client.zadd(k(`index:${index}`), { score, member }));
    },

    async indexTop(index, limit) {
      if (limit <= 0) return [];
      const members = await withTimeout(client.zrange(k(`index:${index}`), 0, limit - 1, { rev: true }));
      return members.map((member) => String(member));
    },
  };
}
