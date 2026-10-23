"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getLeague, leagueHref, leagues } from "@/data/leagues";
import { usePreferences } from "@/lib/preferences-store";
import {
  formatDateKeyLong,
  formatDateKeyPill,
  formatOffset,
  formatTime,
  matchClock,
  zonedDateKey,
  type TimeSettings,
} from "@/lib/time";
import type { FeedSource, Match, MatchFilter } from "@/lib/types";
import { openSettings } from "@/components/settings/SettingsMenu";
import { ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { LeagueBadge } from "@/components/ui/LeagueBadge";
import { DataNotice } from "@/components/ui/DataNotice";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { SampleDataNotice } from "@/components/ui/SampleDataNotice";
import { MatchCard } from "./MatchCard";

const filters: { value: MatchFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "upcoming", label: "Upcoming" },
  { value: "finished", label: "Finished" },
];

const leagueOrder = new Map(leagues.map((league, index) => [league.slug, index]));

function matchesFilter(match: Match, filter: MatchFilter) {
  if (filter === "all") return true;
  // Postponed fixtures have not been played, so they sit with upcoming ones.
  if (filter === "upcoming") return match.status === "upcoming" || match.status === "postponed";
  return match.status === filter;
}

interface MatchCenterProps {
  matches: Match[];
  /** The instant treated as "now" (request time for real data, fixed for samples). */
  now: string;
  source: FeedSource;
  /** Limit the number of league groups shown (homepage). */
  maxLeagues?: number;
}

export function MatchCenter({ matches, now, source, maxLeagues }: MatchCenterProps) {
  const prefs = usePreferences();
  const { timeZone } = prefs;
  // null means "today" in the viewer's zone, so a zone change keeps the selection sensible.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filter, setFilter] = useState<MatchFilter>("all");

  const today = zonedDateKey(now, timeZone);

  // Each match's calendar date depends on the viewer's time zone.
  const byDate = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const match of matches) {
      const key = zonedDateKey(match.kickoff, timeZone);
      const list = map.get(key) ?? [];
      list.push(match);
      map.set(key, list);
    }
    return map;
  }, [matches, timeZone]);

  const dates = useMemo(() => [...new Set([...byDate.keys(), today])].sort(), [byDate, today]);
  const date = selectedDate && dates.includes(selectedDate) ? selectedDate : today;
  const dateIndex = dates.indexOf(date);

  const dayMatches = useMemo(() => byDate.get(date) ?? [], [byDate, date]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        filters.map(({ value }) => [value, dayMatches.filter((match) => matchesFilter(match, value)).length]),
      ) as Record<MatchFilter, number>,
    [dayMatches],
  );

  const groups = useMemo(() => {
    const bySlug = new Map<string, Match[]>();
    for (const match of dayMatches) {
      if (!matchesFilter(match, filter)) continue;
      const list = bySlug.get(match.leagueSlug) ?? [];
      list.push(match);
      bySlug.set(match.leagueSlug, list);
    }
    return [...bySlug.entries()]
      .sort(([a], [b]) => (leagueOrder.get(a) ?? 999) - (leagueOrder.get(b) ?? 999))
      .map(([slug, list]) => ({
        league: getLeague(slug)!,
        matches: [...list].sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
      }));
  }, [dayMatches, filter]);

  const visibleGroups = maxLeagues ? groups.slice(0, maxLeagues) : groups;
  const hiddenGroups = groups.length - visibleGroups.length;

  return (
    <div className="space-y-3">
      <SourceNotice source={source} timeSettings={prefs} />

      {/* Date selector */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <StepButton
          label="Previous day"
          disabled={dateIndex <= 0}
          onClick={() => setSelectedDate(dates[dateIndex - 1])}
        >
          <ChevronLeftIcon className="size-4" />
        </StepButton>
        <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto" role="group" aria-label="Choose a date">
          {dates.map((value) => {
            const { weekday, day } = formatDateKeyPill(value);
            const selected = value === date;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedDate(value)}
                className={`flex min-w-[3.75rem] flex-1 flex-col items-center rounded-lg border px-1.5 py-1.5 text-xs transition-colors ${
                  selected
                    ? "border-pulse/50 bg-pulse-soft text-pulse"
                    : "border-line bg-surface text-muted shadow-card hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <span className="font-semibold uppercase tracking-wide">{value === today ? "Today" : weekday}</span>
                <span className="mt-0.5 text-[11px] opacity-80">{day}</span>
              </button>
            );
          })}
        </div>
        <StepButton
          label="Next day"
          disabled={dateIndex >= dates.length - 1}
          onClick={() => setSelectedDate(dates[dateIndex + 1])}
        >
          <ChevronRightIcon className="size-4" />
        </StepButton>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{formatDateKeyLong(date)}</p>
          <p className="text-[11px] text-muted">
            Times in {timeZone.replace(/_/g, " ")} ({formatOffset(timeZone, now)}) ·{" "}
            <button type="button" onClick={openSettings} className="font-medium text-pulse hover:underline">
              Change
            </button>
          </p>
        </div>
        <div
          className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1 shadow-card"
          role="group"
          aria-label="Filter matches by status"
        >
          {filters.map(({ value, label }) => {
            const active = filter === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(value)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                  active ? "bg-pulse text-on-pulse" : "text-muted hover:text-ink"
                }`}
              >
                {value === "live" && (
                  <span
                    className={`size-1.5 rounded-full ${active ? "bg-on-pulse" : "animate-pulse-dot bg-pulse"}`}
                    aria-hidden
                  />
                )}
                {label}
                <span className={`tabular-nums ${active ? "opacity-75" : "text-faint"}`}>{counts[value]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visibleGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
          {source.kind === "unavailable"
            ? "Fixtures could not be loaded right now. Please try again later."
            : `No ${filter === "all" ? "" : `${filter} `}matches on this date.`}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map(({ league, matches: leagueMatches }) => (
            <section key={league.slug} aria-labelledby={`league-${league.slug}`}>
              <header className="mb-1.5 flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5">
                <LeagueBadge league={league} size="sm" />
                <div className="min-w-0 flex-1">
                  <h3 id={`league-${league.slug}`} className="truncate text-sm font-semibold text-ink">
                    <Link href={leagueHref(league.slug)} className="hover:text-pulse">
                      {league.name}
                    </Link>
                  </h3>
                  <p className="text-[11px] leading-tight text-muted">{league.country}</p>
                </div>
                <span className="text-xs tabular-nums text-faint">
                  {leagueMatches.length} {leagueMatches.length === 1 ? "match" : "matches"}
                </span>
              </header>
              <div className="space-y-1.5">
                {leagueMatches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    kickoffLabel={formatTime(match.kickoff, prefs)}
                    clock={
                      match.status !== "live"
                        ? undefined
                        : match.source === "sample"
                          ? matchClock(match.kickoff, now)
                          : match.clock
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {maxLeagues && (
        <Link
          href="/matches"
          className="flex items-center justify-center gap-2 rounded-lg border border-line bg-surface py-2.5 text-sm font-medium text-ink/90 shadow-card transition-colors hover:border-pulse/40 hover:text-pulse"
        >
          {hiddenGroups > 0 ? `View ${hiddenGroups} more competition${hiddenGroups === 1 ? "" : "s"}` : "All matches"}
          <ArrowRightIcon className="size-4" />
        </Link>
      )}
    </div>
  );
}

function SourceNotice({ source, timeSettings }: { source: FeedSource; timeSettings: TimeSettings }) {
  switch (source.kind) {
    case "sample":
      return (
        <SampleDataNotice>
          Development data: these fixtures and scores are samples for building the interface. They are not real results
          or live scores.
        </SampleDataNotice>
      );
    case "sample-fallback":
      return (
        <SampleDataNotice>
          {source.reason} Showing development sample data instead: these fixtures and scores are not real.
        </SampleDataNotice>
      );
    case "unavailable":
      return (
        <DataNotice tone="warn" action={<RefreshButton label="Try again" />}>
          {source.reason} No scores are shown rather than out-of-date or sample ones.
        </DataNotice>
      );
    case "api-football":
      return (
        <DataNotice action={<RefreshButton />}>
          Fixtures and scores from API-Football, last updated {formatTime(source.fetchedAt, timeSettings)}. Scores
          refresh about every {Math.round(source.refreshSeconds / 60)} min and may lag the live match.
          {source.partial ? " Some days could not be loaded." : ""}
          {source.unresolved.length ? ` Not available: ${source.unresolved.join(", ")}.` : ""}
        </DataNotice>
      );
  }
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-card transition-colors hover:bg-surface-2 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
