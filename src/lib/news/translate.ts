import { applyGlossary } from "./glossary";

// English translation of Koora's Arabic headlines.
//
// Default provider: MyMemory (api.mymemory.translated.net), a free machine
// translation API that needs no key or account. Anonymous use is limited to
// 5,000 characters a day (about 70 headlines); MatchPulse translates each
// headline once and stores the result, so normal use stays far below that.
//
//   MATCHPULSE_NEWS_TRANSLATION=mymemory   default
//   MATCHPULSE_NEWS_TRANSLATION=off        show the original Arabic only
//   MATCHPULSE_NEWS_TRANSLATION=claude     optional paid alternative (needs ANTHROPIC_API_KEY)
//   MATCHPULSE_TRANSLATION_EMAIL=...       optional: MyMemory's documented way to raise
//                                          the daily limit to 50,000 characters
//
// Every translation is checked before it is used (see checkTranslation); a
// headline that cannot be translated reliably keeps its Arabic original.

export type TranslationProvider = "mymemory" | "claude" | "off";

/** Returns the English headline, or null when no reliable translation was produced. */
export type HeadlineTranslator = (title: string) => Promise<string | null>;

/** Thrown when the provider's daily limit is reached: stop translating until the next refresh. */
export class TranslationLimitError extends Error {
  constructor() {
    super("translation limit reached");
    this.name = "TranslationLimitError";
  }
}

const DEFAULT_CLAUDE_MODEL = "claude-haiku-5-5";

export function translationProvider(env: NodeJS.ProcessEnv = process.env): TranslationProvider {
  const value = env.MATCHPULSE_NEWS_TRANSLATION?.trim().toLowerCase();
  if (value === "off") return "off";
  if (value === "claude") return env.ANTHROPIC_API_KEY?.trim() ? "claude" : "off";
  return "mymemory";
}

// ---- Clean-up and reliability checks ----------------------------------------------

const ARABIC = /[؀-ۿݐ-ݿ]/;
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function numbers(text: string): string[] {
  const western = text.replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)));
  return western.match(/\d+/g) ?? [];
}

/** Fixes known machine-translation slips; never adds information. */
export function tidyTranslation(text: string): string {
  let line = text
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/\bd\s*['’]\s*Or\b/gi, "d'Or")
    // "عقد" means both "contract" and "decade"; next to a year it is a contract.
    .replace(/\b(new )(decade)(?= (?:until|till|to|through|running to|running until) 20\d\d\b)/gi, (_m, adjective: string, noun: string) =>
      `${adjective}${noun[0] === "D" ? "Contract" : "contract"}`,
    )
    .replace(/\s+([,:;!?])/g, "$1")
    .replace(/\.$/, "");
  if (line) line = line[0].toUpperCase() + line.slice(1);
  return line;
}

/**
 * The tidied translation if it looks reliable, else null: English only, every
 * number from the original kept, every glossary name present, a plausible
 * length, and no provider warning text or repeated words.
 */
export function checkTranslation(original: string, translated: unknown, requiredTerms: string[] = []): string | null {
  if (typeof translated !== "string") return null;
  if (translated.trim().includes("\n")) return null;
  const line = tidyTranslation(translated);
  if (line.length < 8 || line.length > 200) return null;
  if (ARABIC.test(line)) return null;
  if (/MYMEMORY|QUERY LENGTH|INVALID LANGUAGE|PLEASE SELECT|NO QUERY SPECIFIED|AVAILABLE FREE TRANSLATIONS/i.test(line)) return null;
  const ratio = line.length / original.length;
  if (ratio < 0.5 || ratio > 2.5) return null;
  const found = numbers(line);
  if (!numbers(original).every((n) => found.includes(n))) return null;
  const lower = line.toLowerCase();
  if (!requiredTerms.every((term) => lower.includes(term.toLowerCase()))) return null;
  if (/\b(\w+)(?:\s+\1\b){2,}/i.test(line)) return null; // "the the the"
  return line;
}

// ---- Providers ------------------------------------------------------------------

function myMemoryTranslator(env: NodeJS.ProcessEnv, fetcher: typeof fetch): HeadlineTranslator {
  const email = env.MATCHPULSE_TRANSLATION_EMAIL?.trim();
  return async (title) => {
    const prepared = applyGlossary(title);
    const params = new URLSearchParams({ q: prepared.text, langpair: "ar|en" });
    if (email) params.set("de", email);
    let response: Response;
    try {
      response = await fetcher(`https://api.mymemory.translated.net/get?${params}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch (error) {
      console.warn(`[news] headline translation failed: ${error instanceof Error ? error.name : "error"}`);
      return null;
    }
    if (response.status === 429) throw new TranslationLimitError();
    if (!response.ok) {
      console.warn(`[news] headline translation failed: HTTP ${response.status}`);
      return null;
    }
    let data: { responseStatus?: number | string; quotaFinished?: boolean; responseData?: { translatedText?: unknown } };
    try {
      data = await response.json();
    } catch {
      return null;
    }
    if (data.quotaFinished === true || Number(data.responseStatus) === 429) throw new TranslationLimitError();
    if (Number(data.responseStatus) !== 200) return null;
    return checkTranslation(title, data.responseData?.translatedText, prepared.terms);
  };
}

function claudeTranslator(env: NodeJS.ProcessEnv, fetcher: typeof fetch): HeadlineTranslator {
  const key = env.ANTHROPIC_API_KEY!.trim();
  const model = env.MATCHPULSE_NEWS_TRANSLATION_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
  return async (title) => {
    try {
      const response = await fetcher("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: 120,
          system:
            "Translate the Arabic football news headline into one concise, faithful English headline. " +
            "Use the usual English spellings of clubs, players and competitions. Do not add facts. " +
            "Reply with the headline only.",
          messages: [{ role: "user", content: title }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 429) throw new TranslationLimitError();
      if (!response.ok) {
        console.warn(`[news] headline translation failed: HTTP ${response.status}`);
        return null;
      }
      const data = (await response.json()) as { content?: { type: string; text?: string }[] };
      return checkTranslation(title, data.content?.find((part) => part.type === "text")?.text);
    } catch (error) {
      if (error instanceof TranslationLimitError) throw error;
      console.warn(`[news] headline translation failed: ${error instanceof Error ? error.name : "error"}`);
      return null;
    }
  };
}

export function createHeadlineTranslator(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): HeadlineTranslator | undefined {
  const provider = translationProvider(env);
  if (provider === "mymemory") return myMemoryTranslator(env, fetcher);
  if (provider === "claude") return claudeTranslator(env, fetcher);
  return undefined;
}
