import Link from "next/link";
import { getLeague } from "@/data/leagues";
import { providerClub } from "@/lib/api-football/adapter";
import type { MatchReport } from "@/lib/match-report";
import { LeagueBadge } from "@/components/ui/LeagueBadge";
import { LocalTime } from "@/components/ui/LocalTime";
import { TeamCrest } from "@/components/ui/TeamCrest";

export function ReportLabel() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-pulse-soft px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-pulse">
      MatchPulse Match Report
    </span>
  );
}

function Scoreline({ report, size = "lg" }: { report: MatchReport; size?: "lg" | "md" }) {
  const crest = size === "lg" ? "xl" : "md";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
      <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
        <TeamCrest club={providerClub(report.home)} size={crest} />
        <span className={`line-clamp-2 font-semibold leading-tight ${size === "lg" ? "text-base" : "text-sm"}`}>{report.home.name}</span>
      </div>
      <div className="text-center">
        <p className={`font-display font-bold tabular-nums ${size === "lg" ? "text-5xl" : "text-3xl"}`}>
          {report.score.home}
          <span className="mx-2 text-faint">–</span>
          {report.score.away}
        </p>
        <p className="text-[11px] uppercase tracking-wider text-muted">
          {report.penalties ? `Pens ${report.penalties.home}–${report.penalties.away}` : report.afterExtraTime ? "After extra time" : "Full time"}
        </p>
      </div>
      <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
        <TeamCrest club={providerClub(report.away)} size={crest} />
        <span className={`line-clamp-2 font-semibold leading-tight ${size === "lg" ? "text-base" : "text-sm"}`}>{report.away.name}</span>
      </div>
    </div>
  );
}

function Provenance({ report }: { report: MatchReport }) {
  return (
    <p className="text-[11px] leading-relaxed text-muted">
      Generated automatically by MatchPulse from API-Football match data (fetched{" "}
      <LocalTime iso={report.dataFetchedAt} variant="datetime" />). It states only facts in that data: no commentary,
      quotes or opinions.
    </p>
  );
}

/** Full report (report page, and the match page's report section). */
export function MatchReportArticle({ report, headingLevel = "h1" }: { report: MatchReport; headingLevel?: "h1" | "h2" }) {
  const league = getLeague(report.leagueSlug);
  const Heading = headingLevel;
  const homeGoals = report.goals.filter((goal) => goal.side === "home");
  const awayGoals = report.goals.filter((goal) => goal.side === "away");
  const ownGoals = report.goals.filter((goal) => goal.kind === "own-goal");

  return (
    <article className="space-y-5" aria-labelledby={`report-${report.fixtureId}`}>
      <header className="space-y-3">
        <ReportLabel />
        <Heading id={`report-${report.fixtureId}`} className="font-display text-3xl font-bold leading-tight tracking-wide sm:text-4xl">
          {report.headline}
        </Heading>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {league && <LeagueBadge league={league} size="sm" />}
          <span className="font-semibold text-ink/85">{report.competition}</span>
          {report.round && <span>· {report.round}</span>}
          <span>
            · <LocalTime iso={report.kickoff} variant="date" />
          </span>
          {report.venue && <span>· {report.venue}</span>}
        </p>
      </header>

      <div className="rounded-2xl border border-line bg-surface px-4 py-5 shadow-card">
        <Scoreline report={report} />
      </div>

      <div className="space-y-3 leading-relaxed text-ink/90">
        {report.summary.map((sentence) => (
          <p key={sentence}>{sentence}</p>
        ))}
      </div>

      {report.goals.length > 0 && (
        <section aria-label="Goals" className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <h3 className="mb-2 font-display text-lg font-bold tracking-wide">Goals</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { team: report.home.name, goals: homeGoals },
              { team: report.away.name, goals: awayGoals },
            ].map(({ team, goals }) => (
              <div key={team}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">{team}</p>
                {goals.length === 0 ? (
                  <p className="text-sm text-muted">No goals</p>
                ) : (
                  <ul className="space-y-0.5 text-sm">
                    {goals.map((goal, index) => (
                      <li key={index}>
                        <span className="inline-block w-12 tabular-nums text-muted">{goal.minute}</span>
                        {goal.player}
                        {goal.kind === "penalty" ? " (pen.)" : ""}
                        {goal.assist ? <span className="text-muted"> · assist {goal.assist}</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          {ownGoals.length > 0 && (
            <p className="mt-2 text-sm">
              Own goal{ownGoals.length > 1 ? "s" : ""}: {ownGoals.map((goal) => `${goal.player} (${goal.minute})`).join(", ")}
            </p>
          )}
        </section>
      )}

      {report.stats.length > 0 && (
        <section aria-label="Match statistics" className="rounded-xl border border-line bg-surface p-4 shadow-card">
          <h3 className="mb-2 font-display text-lg font-bold tracking-wide">Statistics</h3>
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th scope="col">{report.home.name}</th>
                <th scope="col">Statistic</th>
                <th scope="col">{report.away.name}</th>
              </tr>
            </thead>
            <tbody>
              {report.stats.map((stat) => (
                <tr key={stat.label} className="border-b border-line/60 last:border-0">
                  <td className="py-1.5 font-semibold tabular-nums">{stat.home}</td>
                  <th scope="row" className="py-1.5 text-center text-xs font-normal text-muted">{stat.label}</th>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{stat.away}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <Provenance report={report} />
    </article>
  );
}

/** Compact card for the reports index and the homepage. */
export function MatchReportCard({ report }: { report: MatchReport }) {
  const league = getLeague(report.leagueSlug);
  return (
    <article className="h-full rounded-xl border border-line bg-surface shadow-card transition-colors hover:border-pulse/40 hover:bg-surface-2">
      <Link href={`/reports/${report.fixtureId}`} className="flex h-full flex-col gap-3 p-4">
        <span className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
          {league && <LeagueBadge league={league} size="sm" />}
          <span className="font-semibold text-ink/85">{report.competition}</span>
          <span>
            · <LocalTime iso={report.kickoff} variant="date" />
          </span>
        </span>
        <Scoreline report={report} size="md" />
        <span className="mt-auto line-clamp-2 text-sm font-semibold leading-snug">{report.headline}</span>
      </Link>
    </article>
  );
}
