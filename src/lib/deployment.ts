// Which kind of deployment this is, from the variables Vercel sets
// automatically (VERCEL_ENV: "production" | "preview" | "development").
// No "server-only" import: also used by src/proxy.ts.
//
// Safety rules for non-production Vercel deployments, so a variable added to
// "All Environments" by mistake cannot cause harm:
// - no real API-Football requests (they would spend the production quota of
//   100 requests/day) unless MATCHPULSE_PREVIEW_LIVE_DATA=true is set;
// - never indexed by search engines.

export type VercelEnvironment = "production" | "preview" | "development";

export function vercelEnvironment(env: NodeJS.ProcessEnv = process.env): VercelEnvironment | null {
  const value = env.VERCEL_ENV?.trim();
  return value === "production" || value === "preview" || value === "development" ? value : null;
}

/** A Vercel Preview or Development deployment (not local `next dev`/`next start`). */
export function isNonProductionDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  const kind = vercelEnvironment(env);
  return kind === "preview" || kind === "development";
}

/** False on Vercel Preview/Development unless MATCHPULSE_PREVIEW_LIVE_DATA=true opts in. */
export function liveDataAllowedInThisDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isNonProductionDeployment(env) || env.MATCHPULSE_PREVIEW_LIVE_DATA === "true";
}
