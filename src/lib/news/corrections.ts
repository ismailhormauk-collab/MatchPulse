// Reviewed English wording for specific Koora headlines whose machine
// translation reads badly. Each entry is keyed by the exact Arabic headline as
// Koora published it, so a correction only ever applies to that story; if
// Koora edits the headline, the machine translation is used again.
//
// Keep this list short: add a headline only when its machine translation is
// misleading or hard to read, translate it faithfully (same facts, names and
// numbers, nothing added), and remove entries once the stories have aged out of
// the feed. Each entry must pass the same checks as machine translations
// (scripts/check-news.mjs verifies this).

const CORRECTIONS: Record<string, string> = {
  "صراع رئاسة الفيفا يشتعل أفريقيا تدعم إنفانتينو واليويفا تقود جبهة المعارضة":
    "FIFA presidency battle heats up: Africa backs Infantino as UEFA leads the opposition",
  "الكرة الذهبية 2026 الكشف عن المرشحين لجائزتي أفضل مدرب ومدربة في العالم":
    "Ballon d'Or 2026: nominees revealed for the best men's and women's coach awards",
  "ميسي حاضر ورونالدو خارج القائمة الكشف عن المرشحين للكرة الذهبية 2026":
    "Messi in, Ronaldo out as the Ballon d'Or 2026 nominees are revealed",
  "يامال يصعّد تحديه لهاري كين في سباق الكرة الذهبية":
    "Yamal steps up his challenge to Harry Kane in the Ballon d'Or race",
};

const normalise = (text: string) => text.replace(/\s+/g, " ").trim();

const BY_HEADLINE = new Map(Object.entries(CORRECTIONS).map(([arabic, english]) => [normalise(arabic), english]));

/** The reviewed English headline for this exact Arabic headline, if any. */
export function reviewedHeadline(arabic: string): string | undefined {
  return BY_HEADLINE.get(normalise(arabic));
}

/** For tests: every correction as [arabic, english]. */
export function allCorrections(): [string, string][] {
  return Object.entries(CORRECTIONS);
}
