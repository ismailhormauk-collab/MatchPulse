"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { SAMPLE_NOW } from "@/data/matches";
import { detectTimeZone, samePreferences, type Preferences, type Theme } from "@/lib/preferences";
import { preferencesStore, usePreferences } from "@/lib/preferences-store";
import { formatOffset, formatTime, type TimeFormat } from "@/lib/time";
import { CheckIcon, CloseIcon, MoonIcon, SunIcon, UserIcon } from "@/components/ui/icons";

const OPEN_EVENT = "matchpulse:open-settings";

/** Opens the settings dialog from anywhere on the page. */
export function openSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

const COMMON_TIME_ZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Africa/Casablanca",
  "Africa/Cairo",
  "America/New_York",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Asia/Jakarta",
  "Asia/Tokyo",
  "Australia/Sydney",
];

/** Profile button plus the settings dialog it opens. */
export function SettingsMenu() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback(() => {
    setOpen(true);
    dialogRef.current?.showModal();
  }, []);

  useEffect(() => {
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, [show]);

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button
        type="button"
        aria-label="Open settings"
        aria-haspopup="dialog"
        title="Settings"
        onClick={show}
        className="flex size-9 items-center justify-center rounded-full border border-chrome-line bg-chrome-2 text-ink/80 transition-colors hover:border-pulse/50 hover:text-pulse"
      >
        <UserIcon className="size-4" />
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="settings-title"
        // Esc and close() both land here; unsaved previews are discarded.
        onClose={() => {
          preferencesStore.revert();
          setOpen(false);
        }}
        // A click whose target is the <dialog> itself is on the backdrop.
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-ink shadow-pop"
      >
        {open && <SettingsPanel onClose={close} />}
      </dialog>
    </>
  );
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const prefs = usePreferences();
  const saved = preferencesStore.getSaved();
  const dirty = !samePreferences(prefs, saved);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  function update(patch: Partial<Preferences>) {
    setSavedMessage(null);
    preferencesStore.preview({ ...prefs, ...patch });
  }

  function save() {
    const ok = preferencesStore.save(prefs);
    setSavedMessage(ok ? "Settings saved on this device." : "Applied, but this browser blocked saving them.");
  }

  return (
    <div className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="settings-title" className="font-display text-2xl font-bold tracking-wide">
            Settings
          </h2>
          <p className="mt-0.5 text-xs text-muted">Changes preview immediately. Save to keep them on this device.</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close settings"
          className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-muted hover:text-ink"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>

      <div className="mt-5 space-y-6">
        <OptionGroup
          legend="Theme"
          name="theme"
          value={prefs.theme}
          onChange={(theme: Theme) => update({ theme })}
          options={[
            { value: "dark", label: "Dark", icon: <MoonIcon className="size-4" /> },
            { value: "light", label: "Light", icon: <SunIcon className="size-4" /> },
          ]}
        />

        <TimeZoneField value={prefs.timeZone} onChange={(timeZone) => update({ timeZone })} />

        <OptionGroup
          legend="Time format"
          name="time-format"
          value={prefs.timeFormat}
          onChange={(timeFormat: TimeFormat) => update({ timeFormat })}
          options={[
            {
              value: "24h",
              label: "24-hour",
              hint: formatTime("2026-10-21T19:00:00Z", { timeZone: "UTC", timeFormat: "24h" }),
            },
            {
              value: "12h",
              label: "12-hour",
              hint: formatTime("2026-10-21T19:00:00Z", { timeZone: "UTC", timeFormat: "12h" }),
            },
          ]}
        />
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="status" aria-live="polite" className="min-h-5 text-xs">
          {savedMessage ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-pulse">
              <CheckIcon className="size-3.5" />
              {savedMessage}
            </span>
          ) : dirty ? (
            <span className="text-muted">Unsaved changes are discarded when you close.</span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={save}
          className="rounded-full bg-pulse px-5 py-2 text-sm font-semibold text-on-pulse transition-opacity hover:opacity-90"
        >
          Save settings
        </button>
      </div>
    </div>
  );
}

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  hint?: string;
}

/** Segmented control built on native radios, so arrow keys work. */
function OptionGroup<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-pulse ${
                checked
                  ? "border-pulse/60 bg-pulse-soft text-ink"
                  : "border-line bg-surface-2 text-ink/85 hover:border-faint"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.icon && <span className={checked ? "text-pulse" : "text-muted"}>{option.icon}</span>}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{option.label}</span>
                {option.hint && <span className="text-xs tabular-nums text-muted">e.g. {option.hint}</span>}
              </span>
              <span
                aria-hidden
                className={`flex size-4 items-center justify-center rounded-full border ${
                  checked ? "border-pulse bg-pulse" : "border-faint"
                }`}
              >
                {checked && <span className="size-1.5 rounded-full bg-on-pulse" />}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function TimeZoneField({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const detected = useMemo(() => detectTimeZone(), []);
  const allZones = useMemo(() => {
    const zones = Intl.supportedValuesOf?.("timeZone") ?? [];
    return zones.includes("UTC") ? zones : ["UTC", ...zones];
  }, []);

  const needle = query.trim().toLowerCase().replace(/\s+/g, "_");
  const matches = (zone: string) => !needle || zone.toLowerCase().includes(needle);
  const common = COMMON_TIME_ZONES.filter((zone) => zone !== detected && matches(zone));
  const rest = allZones.filter((zone) => zone !== detected && !COMMON_TIME_ZONES.includes(zone) && matches(zone));
  // Keep the current value selectable even when the search hides it.
  const showCurrent = value !== detected && !common.includes(value) && !rest.includes(value);

  const label = (zone: string) => `${zone.replace(/_/g, " ")} (${formatOffset(zone, SAMPLE_NOW)})`;

  return (
    <div>
      <label htmlFor={`${id}-select`} className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted">
        Time zone
      </label>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search, e.g. Tokyo or America"
        aria-label="Filter time zones"
        aria-controls={`${id}-select`}
        className="mb-2 w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-faint"
      />
      <select
        id={`${id}-select`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink"
      >
        {showCurrent && <option value={value}>{label(value)}</option>}
        {matches(detected) || value === detected ? (
          <optgroup label="Detected">
            <option value={detected}>{label(detected)}</option>
          </optgroup>
        ) : null}
        {common.length > 0 && (
          <optgroup label="Common">
            {common.map((zone) => (
              <option key={zone} value={zone}>
                {label(zone)}
              </option>
            ))}
          </optgroup>
        )}
        {rest.length > 0 && (
          <optgroup label="All time zones">
            {rest.map((zone) => (
              <option key={zone} value={zone}>
                {label(zone)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <p className="mt-1.5 text-[11px] text-muted">
        {needle ? `${common.length + rest.length} matching zones. ` : ""}Detected from your browser: {detected.replace(/_/g, " ")}
      </p>
    </div>
  );
}
