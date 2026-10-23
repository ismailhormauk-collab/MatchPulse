import { useSyncExternalStore } from "react";
import {
  applyTheme,
  DEFAULT_PREFERENCES,
  detectTimeZone,
  parseStored,
  PREFERENCES_KEY,
  PREFERENCES_VERSION,
  samePreferences,
  type Preferences,
} from "./preferences";

// ---- Client store -------------------------------------------------------
// `saved` is what localStorage holds (or the detected defaults when nothing
// is saved); `active` is what the UI shows, which may be an unsaved preview
// from the settings dialog.

let saved: Preferences | null = null;
let active: Preferences | null = null;
let hasSavedValue = false;
const listeners = new Set<() => void>();

function load() {
  const fallbackZone = detectTimeZone();
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(PREFERENCES_KEY);
  } catch {
    // Storage blocked (private mode, disabled cookies): use defaults.
  }
  const stored = parseStored(raw, fallbackZone);
  hasSavedValue = stored !== null;
  saved = stored ?? { ...DEFAULT_PREFERENCES, timeZone: fallbackZone };
  active = saved;
}

function emit() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== PREFERENCES_KEY) return;
  load();
  applyTheme(active!.theme);
  emit();
}

export const preferencesStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    if (listeners.size === 1) window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) window.removeEventListener("storage", onStorage);
    };
  },
  getSnapshot(): Preferences {
    if (!active) load();
    return active!;
  },
  getServerSnapshot(): Preferences {
    return DEFAULT_PREFERENCES;
  },
  getSaved(): Preferences {
    if (!saved) load();
    return saved!;
  },
  hasSaved() {
    if (!saved) load();
    return hasSavedValue;
  },
  /** Applies preferences immediately without persisting them. */
  preview(next: Preferences) {
    active = next;
    applyTheme(next.theme);
    emit();
  },
  /** Persists and applies preferences. Returns false if storage failed. */
  save(next: Preferences): boolean {
    let ok = true;
    try {
      window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ v: PREFERENCES_VERSION, ...next }));
      hasSavedValue = true;
    } catch {
      ok = false;
    }
    saved = next;
    active = next;
    applyTheme(next.theme);
    emit();
    return ok;
  },
  /** Drops an unsaved preview. */
  revert() {
    if (!saved) load();
    if (active && saved && samePreferences(active, saved)) return;
    active = saved;
    applyTheme(saved!.theme);
    emit();
  },
};

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    preferencesStore.subscribe,
    preferencesStore.getSnapshot,
    preferencesStore.getServerSnapshot,
  );
}
