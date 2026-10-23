import { safeLogoUrl } from "@/lib/api-football/core";
import { REPORT_VERSION, type MatchReport } from "@/lib/match-report";
import { storage } from "@/lib/storage";

// Store for generated match reports, keyed by fixture ID (report:<id>), with a
// scored index (by kickoff) for listing. A finished match's facts don't
// change, so a report is written once and never regenerated: no duplicates,
// no repeat API use. Backed by the configured storage (filesystem locally,
// Upstash Redis when deployed; see src/lib/storage). Every read is validated,
// and storage failures read as "no report" rather than breaking the page.
// Server-side only (also used by src/proxy.ts).

const reportKey = (id: number) => `report:${id}`;
const REPORT_INDEX = "reports";

function validId(id: number): boolean {
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647;
}

const isString = (value: unknown): value is string => typeof value === "string";
const isInt = (value: unknown): value is number => Number.isInteger(value);

/** Accepts only well-formed reports of the current version; anything else is ignored. */
function validate(raw: unknown): MatchReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<MatchReport>;
  const team = (t: unknown) =>
    t && typeof t === "object" && isInt((t as MatchReport["home"]).id) && isString((t as MatchReport["home"]).name);
  if (
    r.version !== REPORT_VERSION ||
    !isInt(r.fixtureId) ||
    !validId(r.fixtureId) ||
    !isString(r.leagueSlug) ||
    !isString(r.competition) ||
    !isString(r.kickoff) ||
    Number.isNaN(Date.parse(r.kickoff)) ||
    !team(r.home) ||
    !team(r.away) ||
    !r.score ||
    !isInt(r.score.home) ||
    !isInt(r.score.away) ||
    !isString(r.headline) ||
    !Array.isArray(r.summary) ||
    !r.summary.every(isString) ||
    !Array.isArray(r.goals) ||
    !Array.isArray(r.cards) ||
    !Array.isArray(r.stats) ||
    r.source !== "API-Football"
  ) {
    return null;
  }
  const report = r as MatchReport;
  // Re-validate image URLs on read; a tampered file can't point elsewhere.
  return {
    ...report,
    home: { ...report.home, logo: safeLogoUrl(report.home.logo) },
    away: { ...report.away, logo: safeLogoUrl(report.away.logo) },
  };
}

function parse(text: string | null): MatchReport | null {
  if (text === null) return null;
  try {
    return validate(JSON.parse(text));
  } catch {
    return null; // malformed record
  }
}

export async function getStoredReport(fixtureId: number): Promise<MatchReport | null> {
  if (!validId(fixtureId)) return null;
  const report = parse(await storage().get(reportKey(fixtureId)));
  // A record stored under the wrong key is not trusted.
  return report && report.fixtureId === fixtureId ? report : null;
}

/** Cheap existence check for the 404 proxy. */
export async function reportExists(fixtureId: number): Promise<boolean> {
  return (await getStoredReport(fixtureId)) !== null;
}

/**
 * Saves a report unless one already exists for the fixture (atomic
 * write-once). Returns the stored report (the existing one if it was already
 * saved), or null when nothing could be persisted (no storage, or a failure).
 */
export async function saveReportOnce(report: MatchReport): Promise<MatchReport | null> {
  if (!validId(report.fixtureId) || !validate(report)) return null;
  const store = storage();
  if (!store.persistent) return null;
  const created = await store.setIfAbsent(reportKey(report.fixtureId), JSON.stringify(report, null, 2));
  if (created) {
    await store.indexAdd(REPORT_INDEX, String(report.fixtureId), Date.parse(report.kickoff));
    return report;
  }
  return getStoredReport(report.fixtureId);
}

/** Stored reports, newest kickoff first. */
export async function listStoredReports(limit = 50): Promise<MatchReport[]> {
  const store = storage();
  const ids = (await store.indexTop(REPORT_INDEX, limit)).map(Number).filter(validId);
  const texts = await store.getMany(ids.map(reportKey));
  return texts
    .map((text, index) => {
      const report = parse(text);
      return report && report.fixtureId === ids[index] ? report : null;
    })
    .filter((report): report is MatchReport => report !== null)
    .sort((a, b) => b.kickoff.localeCompare(a.kickoff));
}
