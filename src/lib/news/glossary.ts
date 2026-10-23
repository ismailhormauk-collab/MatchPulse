// Standard English spellings for names that machine translation often gets
// wrong (e.g. "Halland", "Laggaa", "Aretha"). Before a headline is translated,
// these names are replaced with their English form, which the translator then
// keeps; translations missing any of them are rejected as unreliable.
//
// Arabic forms are written without the attached prefixes و/ف (and), ب/ل/ك
// (with/for/as) and لل (for the): applyGlossary() handles those.

const GLOSSARY: [arabic: string[], english: string][] = [
  // Competitions and organisations
  [["الكرة الذهبية"], "Ballon d'Or"],
  [["دوري أبطال أوروبا"], "Champions League"],
  [["الدوري الأوروبي"], "Europa League"],
  [["دوري المؤتمر الأوروبي"], "Conference League"],
  [["دوري الأمم الأوروبية"], "UEFA Nations League"],
  [["الدوري الإنجليزي الممتاز"], "Premier League"],
  [["الدوري الإسباني"], "LaLiga"],
  [["الدوري الإيطالي"], "Serie A"],
  [["الدوري الألماني"], "Bundesliga"],
  [["الدوري الفرنسي"], "Ligue 1"],
  [["البطولة الاحترافية"], "Botola Pro"],
  [["كأس العالم للأندية"], "Club World Cup"],
  [["كأس أمم أفريقيا", "كأس أمم إفريقيا"], "Africa Cup of Nations"],
  [["الفيفا", "فيفا"], "FIFA"],
  [["اليويفا", "يويفا"], "UEFA"],
  [["الكاف"], "CAF"],
  // Clubs
  [["ريال مدريد"], "Real Madrid"],
  [["أتلتيكو مدريد"], "Atlético Madrid"],
  [["برشلونة"], "Barcelona"],
  [["أرسنال", "آرسنال"], "Arsenal"],
  [["مانشستر سيتي"], "Manchester City"],
  [["مانشستر يونايتد"], "Manchester United"],
  [["ليفربول"], "Liverpool"],
  [["تشيلسي"], "Chelsea"],
  [["توتنهام"], "Tottenham"],
  [["نيوكاسل"], "Newcastle"],
  [["باريس سان جيرمان"], "Paris Saint-Germain"],
  [["بايرن ميونخ", "بايرن ميونيخ"], "Bayern Munich"],
  [["بوروسيا دورتموند", "دورتموند"], "Borussia Dortmund"],
  [["يوفنتوس"], "Juventus"],
  [["إنتر ميلان"], "Inter Milan"],
  [["إيه سي ميلان"], "AC Milan"],
  [["نابولي"], "Napoli"],
  [["الوداد الرياضي"], "Wydad AC"],
  [["الرجاء الرياضي"], "Raja CA"],
  [["الأهلي المصري"], "Al Ahly"],
  [["الزمالك"], "Zamalek"],
  [["الهلال السعودي"], "Al Hilal"],
  [["النصر السعودي"], "Al Nassr"],
  [["إنتر ميامي"], "Inter Miami"],
  // People
  [["إنفانتينو"], "Infantino"],
  [["لقجع"], "Lekjaa"],
  [["أرتيتا"], "Arteta"],
  [["غوارديولا", "جوارديولا"], "Guardiola"],
  [["أنشيلوتي"], "Ancelotti"],
  [["هالاند"], "Haaland"],
  [["مبابي"], "Mbappé"],
  [["لامين يامال"], "Lamine Yamal"],
  [["يامال"], "Yamal"],
  [["ميسي"], "Messi"],
  [["كريستيانو رونالدو"], "Cristiano Ronaldo"],
  [["رونالدو"], "Ronaldo"],
  [["هاري كين"], "Harry Kane"],
  [["محمد صلاح"], "Mohamed Salah"],
  [["صلاح"], "Salah"],
  [["فينيسيوس"], "Vinícius"],
  [["بيلينغهام", "بيلينجهام"], "Bellingham"],
  [["رودري"], "Rodri"],
  [["حكيمي"], "Hakimi"],
  [["بونو"], "Bounou"],
  [["لويس هال"], "Lewis Hall"],
  [["رافينيا"], "Raphinha"],
  [["ديمبيلي"], "Dembélé"],
];

const ARABIC_LETTER = "\\u0621-\\u064A\\u0671-\\u06D3";

interface Rule {
  pattern: RegExp;
  english: string;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Longest forms first, so "كريستيانو رونالدو" wins over "رونالدو".
const RULES: Rule[] = GLOSSARY.flatMap(([forms, english]) => forms.map((arabic) => ({ arabic, english })))
  .sort((a, b) => b.arabic.length - a.arabic.length)
  .map(({ arabic, english }) => {
    // Optional و/ف (and), then ب/ل/ك (with, for, as); a leading "ال" (the)
    // becomes "بال", "كال" or "لل" after those.
    const body = arabic.startsWith("ال")
      ? `(ال|بال|كال|لل)${escape(arabic.slice(2))}`
      : `([بلك])?${escape(arabic)}`;
    const pattern = new RegExp(`(^|[^${ARABIC_LETTER}])([وف])?${body}(?![${ARABIC_LETTER}])`, "gu");
    return { pattern, english };
  });

/**
 * Replaces known names with their English spelling, keeping any attached
 * prefix as a separate Arabic word ("وUEFA" → "و UEFA", "للكرة الذهبية" →
 * "ل Ballon d'Or"). Returns the prepared text and the names the translation
 * must contain.
 */
export function applyGlossary(text: string): { text: string; terms: string[] } {
  const terms = new Set<string>();
  let result = text;
  for (const { pattern, english } of RULES) {
    result = result.replace(pattern, (_match, before: string, conjunction: string | undefined, prefix: string | undefined) => {
      terms.add(english);
      const preposition = !prefix || prefix === "ال" ? "" : prefix === "لل" ? "ل" : prefix[0];
      return [before + (conjunction ?? ""), preposition, english].filter(Boolean).join(conjunction || preposition ? " " : "");
    });
  }
  return { text: result.replace(/\s+/g, " ").trim(), terms: [...terms] };
}
