import { createFilesystemBackend } from "./filesystem";
import { createRedisBackend, redisCredentialsFromEnv } from "./redis";
import type { StorageBackend, StorageKind } from "./types";

// Storage selection and a failure-safe wrapper. Server-only by design (also
// used by src/proxy.ts, so it doesn't import "server-only"); never import it
// from a Client Component.
//
// Selection (first match):
// 1. MATCHPULSE_STORAGE=redis|filesystem|none (explicit)
// 2. Upstash credentials present → redis
// 3. Running on Vercel (VERCEL=1) → none: its disk is temporary, so nothing
//    is treated as persistent
// 4. Otherwise → filesystem (local development, long-running servers)

export type { StorageBackend, StorageKind } from "./types";

export interface StorageSelection {
  kind: StorageKind;
  reason: string;
}

export function selectStorage(env: NodeJS.ProcessEnv = process.env): StorageSelection {
  const requested = env.MATCHPULSE_STORAGE?.trim().toLowerCase();
  const credentials = redisCredentialsFromEnv(env);
  if (requested === "redis") {
    return credentials
      ? { kind: "redis", reason: "MATCHPULSE_STORAGE=redis" }
      : { kind: "none", reason: "MATCHPULSE_STORAGE=redis but no Upstash credentials are set" };
  }
  if (requested === "filesystem") return { kind: "filesystem", reason: "MATCHPULSE_STORAGE=filesystem" };
  if (requested === "none") return { kind: "none", reason: "MATCHPULSE_STORAGE=none" };
  if (credentials) return { kind: "redis", reason: "Upstash credentials found" };
  if (env.VERCEL) return { kind: "none", reason: "running on Vercel without Upstash credentials (temporary disk)" };
  return { kind: "filesystem", reason: "default for local and long-running servers" };
}

const noneBackend: StorageBackend = {
  kind: "none",
  persistent: false,
  get: async () => null,
  getMany: async (keys) => keys.map(() => null),
  set: async () => {},
  setIfAbsent: async () => false,
  del: async () => {},
  indexAdd: async () => {},
  indexTop: async () => [],
};

// ---- Safe wrapper -------------------------------------------------------------

const lastLogged = new Map<string, number>();

/** Error text without credentials or hostnames; logged at most once a minute per operation. */
function logFailure(kind: StorageKind, operation: string, error: unknown) {
  const now = Date.now();
  if ((lastLogged.get(operation) ?? 0) > now - 60_000) return;
  lastLogged.set(operation, now);
  const secrets = [process.env.UPSTASH_REDIS_REST_TOKEN, process.env.KV_REST_API_TOKEN].filter((s): s is string => !!s && s.length > 4);
  let message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  for (const secret of secrets) message = message.split(secret).join("[redacted]");
  message = message.replace(/https?:\/\/[^\s"']+/g, "[url]").slice(0, 160);
  console.error(`[storage] ${kind} ${operation} failed: ${message}`);
}

function safe(backend: StorageBackend): StorageBackend {
  const guard =
    <A extends unknown[], R>(operation: string, fn: (...args: A) => Promise<R>, fallback: (...args: NoInfer<A>) => NoInfer<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await fn(...args);
      } catch (error) {
        logFailure(backend.kind, operation, error);
        return fallback(...args);
      }
    };
  return {
    kind: backend.kind,
    persistent: backend.persistent,
    get: guard("get", backend.get.bind(backend), () => null),
    getMany: guard("getMany", backend.getMany.bind(backend), (keys) => keys.map(() => null)),
    set: guard("set", backend.set.bind(backend), () => undefined),
    setIfAbsent: guard("setIfAbsent", backend.setIfAbsent.bind(backend), () => false),
    del: guard("del", backend.del.bind(backend), () => undefined),
    indexAdd: guard("indexAdd", backend.indexAdd.bind(backend), () => undefined),
    indexTop: guard("indexTop", backend.indexTop.bind(backend), () => []),
  };
}

// ---- Shared instance ----------------------------------------------------------

let cached: { signature: string; storage: StorageBackend } | null = null;
let announced = "";

/** Key prefix in Redis, e.g. to keep Preview data apart: MATCHPULSE_STORAGE_PREFIX=matchpulse-preview */
export function storagePrefix(env: NodeJS.ProcessEnv = process.env): string {
  return (env.MATCHPULSE_STORAGE_PREFIX?.trim() || "matchpulse").replace(/[^a-zA-Z0-9:_-]/g, "");
}

/** The configured storage, wrapped so failures degrade to "missing" instead of throwing. */
export function storage(): StorageBackend {
  if (typeof window !== "undefined") throw new Error("storage is server-only");
  const selection = selectStorage();
  const signature = `${selection.kind}|${storagePrefix()}|${process.env.MATCHPULSE_DATA_DIR ?? ""}|${process.env.MATCHPULSE_REPORTS_DIR ?? ""}`;
  if (cached?.signature === signature) return cached.storage;

  let backend: StorageBackend;
  if (selection.kind === "redis") {
    backend = createRedisBackend({ credentials: redisCredentialsFromEnv()!, prefix: storagePrefix() });
  } else if (selection.kind === "filesystem") {
    backend = createFilesystemBackend();
  } else {
    backend = noneBackend;
  }
  if (announced !== signature && selection.kind === "none" && process.env.NODE_ENV === "production") {
    console.warn(`[storage] no persistent storage (${selection.reason}): match reports and shared caches are not saved.`);
  }
  announced = signature;
  cached = { signature, storage: safe(backend) };
  return cached.storage;
}

/** For tests: wrap any backend (e.g. Redis with a fake client) with the same safety layer. */
export function wrapStorage(backend: StorageBackend): StorageBackend {
  return safe(backend);
}

/** For tests: forget the shared instance, as a new serverless instance would. */
export function resetStorageForTests() {
  cached = null;
  announced = "";
  lastLogged.clear();
}
