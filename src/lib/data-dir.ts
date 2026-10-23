import path from "node:path";

// Local data folder for runtime files (match reports, known-fixture index).
// Default: <project>/.data (git-ignored). Override with MATCHPULSE_DATA_DIR;
// MATCHPULSE_REPORTS_DIR still overrides the reports folder on its own.
// No "server-only" import: this is also used by src/proxy.ts.

export function dataDir(): string {
  return process.env.MATCHPULSE_DATA_DIR?.trim() || path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");
}

export function reportsDir(): string {
  return process.env.MATCHPULSE_REPORTS_DIR?.trim() || path.join(dataDir(), "match-reports");
}

export function knownFixturesFile(): string {
  return path.join(dataDir(), "known-fixtures.json");
}
