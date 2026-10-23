// User-facing explanations for API-Football failures. Never includes provider
// error text, which can contain account details.

const REASONS: Record<string, string> = {
  missing_key: "The football data provider is not configured.",
  unauthorized: "The football data provider rejected our credentials.",
  rate_limited: "The football data provider is busy (too many requests this minute). Please try again in a minute.",
  quota_exhausted: "The football data provider's daily request limit has been reached. Data will return after the limit resets.",
  plan_restricted: "This data is not included in our current football data plan.",
  timeout: "The football data provider took too long to respond. Please try again shortly.",
  network: "The football data provider could not be reached. Please try again shortly.",
};

export function friendlyReason(kind: string, fallback = "Football data is temporarily unavailable."): string {
  return REASONS[kind] ?? fallback;
}
