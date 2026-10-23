import type { FixtureDetails, FixtureEvent, Lineup, TeamStatistics } from "@/lib/api-football/core";
import type { Club, League, Match } from "@/lib/types";
import { DataNotice } from "@/components/ui/DataNotice";
import { LocalTime } from "@/components/ui/LocalTime";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { TeamCrest } from "@/components/ui/TeamCrest";
import { LeagueBadge } from "@/components/ui/LeagueBadge";

const STATUS_LABEL: Record<Match["status"], string> = {
  live: "Live",
  upcoming: "Upcoming",
  finished: "Full time",
  postponed: "Postponed",
};

const STATUS_PILL: Record<Match["status"], string> = {
  live: "bg-pulse-soft text-pulse",
  upcoming: "bg-surface-3 text-muted",
  finished: "bg-surface-3 text-ink/80",
  postponed: "bg-danger/12 text-danger",
};

interface Props {
  match: Match;
  league: League | undefined;
  details: FixtureDetails | null;
  detailsError: string | null;
  fetchedAt: string | null;
}

export function MatchDetailsView({ match, league, details, detailsError, fetchedAt }: Props) {
  const hasScore = (match.status === "live" || match.status === "finished") && match.homeScore !== undefined;
  const label = match.statusDetail ?? STATUS_LABEL[match.status];
  const halftime = details?.score.halftime;
  const penalty = details?.score.penalty;
  const notStarted = match.status === "upcoming" || match.status === "postponed";

  return (
    <div className="space-y-5">
      {/* Scoreboard */}
      <section aria-labelledby="match-title" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-4 py-2.5 text-xs text-muted">
          <span className="flex min-w-0 items-center gap-2">
            {league && <LeagueBadge league={league} size="sm" />}
            <span className="truncate font-semibold text-ink">{league?.name ?? details?.league.name}</span>
            {details?.league.round && <span className="truncate">· {details.league.round}</span>}
          </span>
          <LocalTime iso={match.kickoff} variant="datetime" />
        </div>

        <h1 id="match-title" className="sr-only">
          {match.home.name} vs {match.away.name}
        </h1>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-6 sm:px-8">
          <TeamHeader club={match.home} />
          <div className="flex flex-col items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${STATUS_PILL[match.status]}`}
            >
              {match.status === "live" && <span className="animate-pulse-dot size-1.5 rounded-full bg-pulse" aria-hidden />}
              {label}
              {match.status === "live" && match.clock ? ` · ${match.clock.label}` : ""}
            </span>
            {hasScore ? (
              <p className="font-display text-4xl font-bold tabular-nums sm:text-5xl" aria-label={`Score ${match.homeScore} to ${match.awayScore}`}>
                {match.homeScore}
                <span className="mx-2 text-faint">–</span>
                {match.awayScore}
              </p>
            ) : (
              <p className={`font-display text-3xl font-semibold tabular-nums ${match.status === "postponed" ? "text-faint line-through" : ""}`}>
                <LocalTime iso={match.kickoff} variant="time" />
              </p>
            )}
            {halftime && halftime.home !== null && halftime.away !== null && !notStarted && (
              <p className="text-xs text-muted">
                Half-time {halftime.home}–{halftime.away}
              </p>
            )}
            {penalty && penalty.home !== null && penalty.away !== null && (
              <p className="text-xs text-muted">
                Penalties {penalty.home}–{penalty.away}
              </p>
            )}
          </div>
          <TeamHeader club={match.away} />
        </div>

        {(details?.venue.name || details?.referee) && (
          <dl className="flex flex-wrap justify-center gap-x-6 gap-y-1 border-t border-line px-4 py-2.5 text-xs text-muted">
            {details?.venue.name && (
              <div className="flex gap-1.5">
                <dt>Venue</dt>
                <dd className="text-ink/85">
                  {details.venue.name}
                  {details.venue.city ? `, ${details.venue.city}` : ""}
                </dd>
              </div>
            )}
            {details?.referee && (
              <div className="flex gap-1.5">
                <dt>Referee</dt>
                <dd className="text-ink/85">{details.referee}</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {detailsError ? (
        <DataNotice tone="warn" action={<RefreshButton label="Try again" />}>
          {detailsError} Showing the summary from today&apos;s fixtures instead; events, lineups and statistics are
          unavailable.
        </DataNotice>
      ) : (
        <DataNotice action={<RefreshButton />}>
          Match data from API-Football
          {fetchedAt ? (
            <>
              , updated <LocalTime iso={fetchedAt} variant="datetime" />
            </>
          ) : null}
          .{match.status === "live" ? " Live details refresh every few minutes and may lag the match." : ""}
        </DataNotice>
      )}

      {!detailsError && details && (
        <>
          <Events events={details.events} homeId={details.home.id} notStarted={notStarted} />
          <Statistics stats={details.statistics} homeId={details.home.id} notStarted={notStarted} />
          <Lineups lineups={details.lineups} homeId={details.home.id} notStarted={notStarted} />
        </>
      )}
    </div>
  );
}

function TeamHeader({ club }: { club: Club }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <TeamCrest club={club} size="xl" />
      <p className="line-clamp-2 text-sm font-semibold leading-tight sm:text-base">{club.name}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <h2 className="mb-3 font-display text-lg font-bold tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-sm text-muted">{children}</p>;
}

// ---- Events -----------------------------------------------------------------

function minute(event: FixtureEvent) {
  if (event.elapsed === null) return "–";
  return event.extra ? `${event.elapsed}+${event.extra}'` : `${event.elapsed}'`;
}

function EventIcon({ event }: { event: FixtureEvent }) {
  const type = event.type.toLowerCase();
  const detail = (event.detail ?? "").toLowerCase();
  if (type === "goal") {
    return (
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.5 10.6 6.4 9.6 9.5H6.4L5.4 6.4z" fill="currentColor" />
      </svg>
    );
  }
  if (type === "card") {
    const red = detail.includes("red");
    // Card colours are literal (yellow/red), not theme tokens.
    return <span aria-hidden className={`inline-block h-4 w-3 rounded-[2px] ${red ? "bg-[#e53935]" : "bg-[#f5c518]"}`} />;
  }
  if (type === "subst") {
    return (
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M4 3v10M2 5l2-2 2 2M12 13V3M10 11l2 2 2-2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <span aria-hidden className="inline-flex h-4 items-center rounded bg-surface-3 px-1 text-[9px] font-bold">
      {type === "var" ? "VAR" : "•"}
    </span>
  );
}

function eventText(event: FixtureEvent) {
  const type = event.type.toLowerCase();
  if (type === "subst") {
    // The provider lists two players for substitutions; shown without guessing who came on.
    return { main: [event.player, event.assist].filter(Boolean).join(" ↔ ") || "Substitution", sub: event.detail ?? "Substitution" };
  }
  if (type === "goal") return { main: event.player ?? "Goal", sub: [event.detail, event.assist ? `Assist: ${event.assist}` : null].filter(Boolean).join(" · ") };
  if (type === "var") return { main: `VAR${event.detail ? `: ${event.detail}` : ""}`, sub: event.player ?? "" };
  return { main: event.player ?? event.type, sub: event.detail ?? "" };
}

function Events({ events, homeId, notStarted }: { events: FixtureEvent[]; homeId: number; notStarted: boolean }) {
  const sorted = [...events].sort((a, b) => (a.elapsed ?? 0) - (b.elapsed ?? 0) || (a.extra ?? 0) - (b.extra ?? 0));
  return (
    <Section title="Match events">
      {sorted.length === 0 ? (
        <Empty>{notStarted ? "Events will appear after kickoff when the provider reports them." : "No events are available for this match."}</Empty>
      ) : (
        <ol className="space-y-1.5">
          {sorted.map((event, index) => {
            const home = event.teamId === homeId;
            const { main, sub } = eventText(event);
            return (
              <li key={index} className={`flex items-center gap-3 ${home ? "" : "flex-row-reverse text-right"}`}>
                <span className="w-12 shrink-0 text-center font-display text-sm font-semibold tabular-nums text-muted">{minute(event)}</span>
                <span className={`flex min-w-0 items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5 ${home ? "" : "flex-row-reverse"}`}>
                  <span className="shrink-0 text-ink/80">
                    <EventIcon event={event} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{main}</span>
                    {sub && <span className="block truncate text-[11px] text-muted">{sub}</span>}
                  </span>
                </span>
                <span className="sr-only">{event.teamName}</span>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

// ---- Statistics -------------------------------------------------------------

/** Some provider labels arrive as identifiers (e.g. "expected_goals"). */
function statLabel(type: string): string {
  if (!type.includes("_")) return type;
  const words = type.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function numeric(value: number | string | null): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function Statistics({ stats, homeId, notStarted }: { stats: TeamStatistics[]; homeId: number; notStarted: boolean }) {
  const home = stats.find((team) => team.teamId === homeId);
  const away = stats.find((team) => team.teamId !== homeId);
  const types = home && away ? home.items.map((item) => item.type).filter((type) => away.items.some((item) => item.type === type)) : [];

  return (
    <Section title="Team statistics">
      {types.length === 0 || !home || !away ? (
        <Empty>{notStarted ? "Statistics will appear once the match is under way, if the provider supplies them." : "Statistics are not available for this match."}</Empty>
      ) : (
        <dl className="space-y-3">
          {types.map((type) => {
            const h = home.items.find((item) => item.type === type)!.value;
            const a = away.items.find((item) => item.type === type)!.value;
            const hn = numeric(h);
            const an = numeric(a);
            const total = (hn ?? 0) + (an ?? 0);
            const share = hn !== null && an !== null && total > 0 ? (hn / total) * 100 : null;
            return (
              <div key={type}>
                <div className="mb-1 flex items-center justify-between text-sm tabular-nums">
                  <dd className="font-semibold">{h ?? "–"}</dd>
                  <dt className="text-xs text-muted">{statLabel(type)}</dt>
                  <dd className="font-semibold">{a ?? "–"}</dd>
                </div>
                {share !== null && (
                  <div className="flex h-1.5 gap-1" aria-hidden>
                    <div className="flex flex-1 justify-end overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-pulse" style={{ width: `${share}%` }} />
                    </div>
                    <div className="flex-1 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-faint" style={{ width: `${100 - share}%` }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </dl>
      )}
    </Section>
  );
}

// ---- Lineups -------------------------------------------------------------------

function Lineups({ lineups, homeId, notStarted }: { lineups: Lineup[]; homeId: number; notStarted: boolean }) {
  const ordered = [...lineups].sort((a, b) => (a.teamId === homeId ? -1 : b.teamId === homeId ? 1 : 0));
  return (
    <Section title="Lineups">
      {ordered.length === 0 ? (
        <Empty>{notStarted ? "Lineups are usually published shortly before kickoff, if the provider supplies them." : "Lineups are not available for this match."}</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ordered.map((lineup) => (
            <div key={lineup.teamId} className="rounded-lg border border-line bg-surface-2 p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="truncate text-sm font-semibold">{lineup.teamName}</h3>
                {lineup.formation && <span className="shrink-0 text-xs text-muted">{lineup.formation}</span>}
              </div>
              {lineup.coach && <p className="mb-2 text-xs text-muted">Coach: {lineup.coach}</p>}
              <PlayerList title="Starting XI" players={lineup.startXI} />
              {lineup.substitutes.length > 0 && <PlayerList title="Substitutes" players={lineup.substitutes} />}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function PlayerList({ title, players }: { title: string; players: Lineup["startXI"] }) {
  return (
    <div className="mt-2">
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h4>
      <ul className="space-y-0.5 text-sm">
        {players.map((player, index) => (
          <li key={player.id ?? `${player.name}-${index}`} className="flex items-center gap-2">
            <span className="w-6 text-right tabular-nums text-muted">{player.number ?? ""}</span>
            <span className="min-w-0 flex-1 truncate">{player.name}</span>
            {player.pos && <span className="text-[11px] text-faint">{player.pos}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
