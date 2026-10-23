import { createHash } from "node:crypto";
import { link, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir, knownFixturesFile, reportsDir } from "@/lib/data-dir";
import type { StorageBackend } from "./types";

// Filesystem backend for local development and long-running servers with a
// persistent disk. Report files and the fixture index keep their existing
// layout (match-reports/<id>.json, known-fixtures.json); other keys (cache
// entries, locks) live under <data dir>/kv/ with an expiry envelope.
// The turbopackIgnore comments stop the build tracer from bundling the whole
// project for these runtime-only paths.

interface Envelope {
  v: string;
  /** Expiry as epoch ms, or null for no expiry. */
  exp: number | null;
}

function location(key: string): { file: string; raw: boolean } {
  const report = /^report:(\d+)$/.exec(key);
  if (report) return { file: path.join(reportsDir(), `${report[1]}.json`), raw: true };
  if (key === "fixtures:known") return { file: knownFixturesFile(), raw: true };
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 40);
  return { file: path.join(dataDir(), "kv", `${hash}.json`), raw: false };
}

function indexFile(index: string): string {
  const name = index.replace(/[^a-z0-9-]/gi, "_");
  return name === "reports" ? path.join(reportsDir(), ".index.json") : path.join(dataDir(), "kv", `index-${name}.json`);
}

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(/*turbopackIgnore: true*/ file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function decode(text: string | null, raw: boolean, now = Date.now()): string | null {
  if (text === null) return null;
  if (raw) return text;
  try {
    const envelope = JSON.parse(text) as Envelope;
    if (typeof envelope.v !== "string") return null;
    if (envelope.exp !== null && typeof envelope.exp === "number" && envelope.exp <= now) return null;
    return envelope.v;
  } catch {
    return null; // malformed entry: treated as missing
  }
}

function encode(value: string, raw: boolean, ttlSeconds?: number): string {
  if (raw) return value;
  const envelope: Envelope = { v: value, exp: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null };
  return JSON.stringify(envelope);
}

async function atomicWrite(file: string, content: string): Promise<void> {
  await mkdir(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(/*turbopackIgnore: true*/ temp, content, "utf8");
  await rename(/*turbopackIgnore: true*/ temp, file);
}

export function createFilesystemBackend(): StorageBackend {
  return {
    kind: "filesystem",
    persistent: true,

    async get(key) {
      const { file, raw } = location(key);
      return decode(await readText(file), raw);
    },

    async getMany(keys) {
      return Promise.all(keys.map((key) => this.get(key)));
    },

    async set(key, value, ttlSeconds) {
      const { file, raw } = location(key);
      await atomicWrite(file, encode(value, raw, ttlSeconds));
    },

    async setIfAbsent(key, value, ttlSeconds) {
      const { file, raw } = location(key);
      // An expired entry counts as absent.
      if ((await readText(file)) !== null) {
        if (raw || decode(await readText(file), raw) !== null) return false;
        await unlink(/*turbopackIgnore: true*/ file).catch(() => {});
      }
      await mkdir(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      await writeFile(/*turbopackIgnore: true*/ temp, encode(value, raw, ttlSeconds), "utf8");
      // link() is atomic and fails if the target exists: the first writer wins.
      const created = await link(/*turbopackIgnore: true*/ temp, file).then(
        () => true,
        () => false,
      );
      await unlink(/*turbopackIgnore: true*/ temp).catch(() => {});
      return created;
    },

    async del(key) {
      await unlink(/*turbopackIgnore: true*/ location(key).file).catch(() => {});
    },

    async indexAdd(index, member, score) {
      const file = indexFile(index);
      let entries: Record<string, number> = {};
      try {
        const parsed = JSON.parse((await readText(file)) ?? "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) entries = parsed;
      } catch {
        entries = {};
      }
      entries[member] = score;
      await atomicWrite(file, JSON.stringify(entries));
    },

    async indexTop(index, limit) {
      let entries: Record<string, unknown> = {};
      try {
        entries = JSON.parse((await readText(indexFile(index))) ?? "{}");
      } catch {
        return [];
      }
      return Object.entries(entries)
        .filter((entry): entry is [string, number] => typeof entry[1] === "number")
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([member]) => member);
    },
  };
}
