import Link from "next/link";
import type { Club, Match } from "@/lib/types";
import { TeamCrest } from "@/components/ui/TeamCrest";

const statusLabel: Record<Match["status"], string> = {
  live: "Live",
  upcoming: "Upcoming",
  finished: "Full time",
  postponed: "Postponed",
};

const statusStyles: Record<Match["status"], { pill: string; rail: string; card: string }> = {
  live: { pill: "bg-pulse-soft text-pulse", rail: "bg-pulse", card: "border-pulse/35" },
  upcoming: { pill: "bg-surface-3 text-muted", rail: "bg-transparent", card: "border-line" },
  finished: { pill: "bg-surface-3 text-ink/75", rail: "bg-faint/60", card: "border-line" },
  postponed: { pill: "bg-danger/12 text-danger", rail: "bg-danger", card: "border-line" },
};

interface MatchCardProps {
  match: Match;
  /** Kickoff time already formatted in the viewer's time zone and format. */
  kickoffLabel: string;
  /** Match clock for live matches. */
  clock?: { label: string; progress: number };
}

export function MatchCard({ match, kickoffLabel, clock }: MatchCardProps) {
  const { home, away } = match;
  const label = match.statusDetail ?? statusLabel[match.status];
  const hasScore = match.status === "live" || match.status === "finished";
  const homeWon = match.status === "finished" && (match.homeScore ?? 0) > (match.awayScore ?? 0);
  const awayWon = match.status === "finished" && (match.awayScore ?? 0) > (match.homeScore ?? 0);
  const styles = statusStyles[match.status];
  const summary = `${home.name} versus ${away.name}. ${label}.${
    hasScore
      ? ` ${match.source === "sample" ? "Sample score" : "Score"} ${match.homeScore} to ${match.awayScore}.`
      : ` Kickoff ${kickoffLabel}.`
  }`;
  // Only provider matches have a details page; sample matches stay plain cards.
  const href = match.fixtureId ? `/matches/${match.fixtureId}` : null;

  const card = (
    <article
      className={`relative grid grid-cols-[minmax(0,1fr)_5.75rem_minmax(0,1fr)] items-center gap-1.5 overflow-hidden rounded-lg border bg-surface py-2.5 pl-3.5 pr-3 shadow-card transition-colors hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,1fr)] sm:gap-3 sm:pl-4 ${styles.card}`}
      aria-label={href ? undefined : summary}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${styles.rail}`} aria-hidden />

      <Team club={home} result={homeWon ? "won" : awayWon ? "lost" : "none"} side="home" />

      <div className="flex flex-col items-center gap-1" aria-hidden>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${styles.pill}`}
        >
          {match.status === "live" && <span className="animate-pulse-dot size-1.5 rounded-full bg-pulse" />}
          {label}
        </span>

        {hasScore ? (
          <div className="flex items-center gap-2 font-display text-xl font-bold leading-none tabular-nums sm:gap-3 sm:text-2xl">
            <span className={awayWon ? "text-muted" : "text-ink"}>{match.homeScore}</span>
            {match.status === "live" && clock ? (
              <LiveClock {...clock} sample={match.source === "sample"} />
            ) : (
              <span className="text-base text-faint">–</span>
            )}
            <span className={homeWon ? "text-muted" : "text-ink"}>{match.awayScore}</span>
          </div>
        ) : (
          <time
            dateTime={match.kickoff}
            className={`whitespace-nowrap font-display text-lg font-semibold leading-tight tabular-nums ${
              match.status === "postponed" ? "text-faint line-through" : "text-ink"
            }`}
          >
            {kickoffLabel}
          </time>
        )}
      </div>

      <Team club={away} result={awayWon ? "won" : homeWon ? "lost" : "none"} side="away" />
    </article>
  );

  if (!href) return card;
  return (
    <Link href={href} aria-label={`${summary} View match details.`} className="block rounded-lg">
      {card}
    </Link>
  );
}

function Team({ club, result, side }: { club: Club; result: "won" | "lost" | "none"; side: "home" | "away" }) {
  // Narrow screens: crest above a two-line name. Wider: crest beside the name,
  // mirrored for the away side so both crests sit on the card's outer edges.
  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-1 text-center sm:gap-2.5 ${
        side === "home" ? "sm:flex-row sm:text-left" : "sm:flex-row-reverse sm:text-right"
      }`}
    >
      <TeamCrest club={club} />
      <span
        className={`line-clamp-2 text-xs leading-tight sm:text-sm ${
          result === "won" ? "font-semibold text-ink" : result === "lost" ? "text-muted" : "text-ink/90"
        }`}
      >
        {club.name}
      </span>
    </div>
  );
}

/** Ring that fills with the elapsed time, like a match clock. */
function LiveClock({ label, progress, sample }: { label: string; progress: number; sample: boolean }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  return (
    <span className="relative inline-flex size-9 items-center justify-center" title={sample ? `Sample match clock ${label}` : `Match clock ${label} when last updated`}>
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={radius} fill="none" stroke="var(--mp-surface-3)" strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="var(--mp-pulse)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <span className="relative font-sans text-[10px] font-semibold text-pulse">{label}</span>
    </span>
  );
}
