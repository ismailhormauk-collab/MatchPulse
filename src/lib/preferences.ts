import { isValidTimeZone, type TimeFormat } from "./time";

export type Theme = "dark" | "light";

export interface Preferences {
  theme: Theme;
  timeZone: string;
  timeFormat: TimeFormat;
}

export const PREFERENCES_KEY = "matchpulse:preferences";
export const PREFERENCES_VERSION = 1;

/** Used on the server and during hydration, before stored values are read. */
export const DEFAULT_PREFERENCES: Preferences = Object.freeze({
  theme: "dark",
  timeZone: "UTC",
  timeFormat: "24h",
});

/**
 * Inline <head> script: applies the saved theme before first paint so there
 * is no flash of the default theme. Must stay in sync with parseStored().
 */
export const themeBootScript = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  PREFERENCES_KEY,
)})||"null");var t=p&&p.v===${PREFERENCES_VERSION}&&p.theme==="light"?"light":"dark";var d=document.documentElement;d.setAttribute("data-theme",t);d.style.colorScheme=t}catch(e){}})()`;

export function detectTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : DEFAULT_PREFERENCES.timeZone;
  } catch {
    return DEFAULT_PREFERENCES.timeZone;
  }
}

/**
 * Reads a stored value field by field. Unknown versions are ignored; invalid
 * fields fall back to defaults so one bad value doesn't discard the rest.
 */
export function parseStored(raw: string | null, fallbackTimeZone: string): Preferences | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown> | null;
    if (!data || typeof data !== "object" || data.v !== PREFERENCES_VERSION) return null;
    return {
      theme: data.theme === "light" || data.theme === "dark" ? data.theme : DEFAULT_PREFERENCES.theme,
      timeZone: isValidTimeZone(data.timeZone) ? data.timeZone : fallbackTimeZone,
      timeFormat: data.timeFormat === "12h" || data.timeFormat === "24h" ? data.timeFormat : DEFAULT_PREFERENCES.timeFormat,
    };
  } catch {
    return null;
  }
}

export function samePreferences(a: Preferences, b: Preferences) {
  return a.theme === b.theme && a.timeZone === b.timeZone && a.timeFormat === b.timeFormat;
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
}
