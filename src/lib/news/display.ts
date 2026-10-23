import type { NewsItem } from "@/lib/types";

// What a news card shows. Kept apart from the component so tests can check it.

export interface HeadlineDisplay {
  /** Main headline: English when a reliable translation exists. */
  text: string;
  lang: "en" | "ar";
  dir: "ltr" | "rtl";
  /** Short label next to the date. */
  label: string;
  /** The original Arabic headline (hover text on a translated headline). */
  original?: string;
}

export function headlineDisplay(item: NewsItem): HeadlineDisplay {
  if (item.titleEn) {
    const label = item.titleEnSource === "reviewed" ? "Translated from Arabic" : "Machine-translated from Arabic";
    return { text: item.titleEn, lang: "en", dir: "ltr", label, original: item.title };
  }
  // No reliable translation (yet): the original, never a guess.
  return { text: item.title, lang: "ar", dir: "rtl", label: "Arabic · English translation unavailable" };
}

/** Notice text describing the headlines actually shown (all, some or none in English). */
export function translationNotice(items: NewsItem[]): string {
  const english = items.filter((item) => item.titleEn).length;
  const machine = items.filter((item) => item.titleEn && item.titleEnSource !== "reviewed").length;
  if (items.length > 0 && english === items.length) {
    const kind =
      machine === 0 ? "" : machine === english ? ", made by automatic machine translation" : "; cards marked \"Machine-translated\" are automatic translations";
    return `Headlines are English translations of Koora's Arabic headlines${kind} (hover a headline for the original).`;
  }
  if (english > 0) {
    return `${english} of ${items.length} headlines are shown in English translation (hover for the original); the others are in the original Arabic until a reliable translation is available.`;
  }
  return "Headlines are shown in the original Arabic: an English translation is not available right now.";
}
