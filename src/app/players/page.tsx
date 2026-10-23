import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import Link from "next/link";
import { Suspense } from "react";
import { getLeague } from "@/data/leagues";
import { getPlanSeasonWindow } from "@/lib/api-football/plan";
import { isLiveDataEnabled } from "@/lib/api-football/server";
import {
  loadPlayers,
  PLAYER_CATEGORIES,
  PLAYER_COMPETITIONS,
  resolvePlayersQuery,
  seasonSpanLabel,
  type PlayersQuery,
  type PlayersView,
} from "@/lib/players";
import { PlayersTable } from "@/components/players/PlayersTable";
import { DataNotice } from "@/components/ui/DataNotice";
import { LeagueBadge } from "@/components/ui/LeagueBadge";
import { LocalTime } from "@/components/ui/LocalTime";
import { RefreshButton } from "@/components/ui/RefreshButton";
import { SectionHeading } from "@/components/ui/SectionHeading";

export const metadata: Metadata = pageMetadata({
  title: "Top players",
  description: "Verified top scorer and assist rankings from API-Football for Europe's leading competitions and the Botola Pro.",
  path: "/players",
});

export default function PlayersPage({ searchParams }: PageProps<"/players">) {
  return (
    <div className="mx-auto max-w-4xl">
      <SectionHeading as="h1" title="Top Players" description="Player rankings from API-Football for the supported competitions." />
      <Suspense fallback={<PlayersSkeleton />}>
        <Players searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Players({ searchParams }: { searchParams: PageProps<"/players">["searchParams"] }) {
  const params = await searchParams;
  const query = resolvePlayersQuery(params, isLiveDataEnabled() ? await getPlanSeasonWindow() : null);
  if (!query) {
    return <DataNotice tone="warn">Player statistics are not available right now.</DataNotice>;
  }
  const view = await loadPlayers(query);
  const league = getLeague(query.competition);

  return (
    <div className="space-y-4">
      <Filters query={query} />
      <Body view={view} query={query} leagueName={league?.name ?? query.competition} />
    </div>
  );
}

function href(query: PlayersQuery, patch: Partial<Pick<PlayersQuery, "competition" | "season" | "category">>) {
  const next = { competition: query.competition, category: query.category, ...patch };
  const params = new URLSearchParams({ competition: next.competition, category: next.category });
  // A new competition starts from its default season.
  const season = "season" in patch ? patch.season : patch.competition ? undefined : query.season;
  if (season !== undefined) params.set("season", String(season));
  return `/players?${params}`;
}

function Chip({ href: to, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={to}
      aria-current={active ? "page" : undefined}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? "border-pulse/60 bg-pulse-soft text-pulse" : "border-line bg-surface text-ink/85 shadow-card hover:border-pulse/40 hover:text-pulse"
      }`}
    >
      {children}
    </Link>
  );
}

function Filters({ query }: { query: PlayersQuery }) {
  return (
    <div className="space-y-3">
      <nav aria-label="Competition" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {PLAYER_COMPETITIONS.map((slug) => {
          const league = getLeague(slug);
          if (!league) return null;
          return (
            <Chip key={slug} href={href(query, { competition: slug })} active={slug === query.competition}>
              <LeagueBadge league={league} size="sm" />
              {league.name}
            </Chip>
          );
        })}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Statistic" className="flex flex-wrap gap-1.5">
          {PLAYER_CATEGORIES.map((category) => (
            <Chip key={category.id} href={href(query, { category: category.id })} active={category.id === query.category}>
              {category.label}
            </Chip>
          ))}
        </nav>
        {query.seasonOptions.length > 0 && (
          <nav aria-label="Season" className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Season</span>
            {query.seasonOptions.map((year) => (
              <Chip key={year} href={href(query, { season: year })} active={year === query.season}>
                {seasonSpanLabel(year)}
              </Chip>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

function Body({ view, query, leagueName }: { view: PlayersView; query: PlayersQuery; leagueName: string }) {
  const season = seasonSpanLabel(query.season);
  const category = PLAYER_CATEGORIES.find((item) => item.id === query.category)!;
  switch (view.state) {
    case "disabled":
      return (
        <DataNotice tone="warn">
          Live player statistics are switched off in this environment. MatchPulse does not show sample players, so no
          rankings are displayed.
        </DataNotice>
      );
    case "unsupported-category":
      return (
        <DataNotice tone="warn">
          {category.label} rankings are not provided by our football data source (API-Football only offers top scorer
          and top assist rankings). We don&apos;t calculate or estimate them, so none are shown.
        </DataNotice>
      );
    case "plan-restricted":
      return (
        <DataNotice tone="warn">
          {season} player statistics for {leagueName} are not included in our current API plan
          {view.allowed ? ` (seasons ${seasonSpanLabel(view.allowed.from)} to ${seasonSpanLabel(view.allowed.to)} are available)` : ""}.
          Choose an earlier season above.
        </DataNotice>
      );
    case "error":
      return (
        <DataNotice tone="warn" action={view.retryable ? <RefreshButton label="Try again" /> : undefined}>
          {view.reason}
        </DataNotice>
      );
    case "empty":
      return (
        <DataNotice action={<RefreshButton />}>
          No {category.label.toLowerCase()} have been reported for {leagueName} {season} yet.
        </DataNotice>
      );
    case "ok": {
      const seasonKind = view.seasonFinished ? "completed season" : "current season";
      const clubNote =
        view.clubsChecked === "yes"
          ? `Each club was checked against the ${season} ${leagueName} table.`
          : view.clubsChecked === "unavailable"
            ? "Club membership could not be checked against the league table this time."
            : "Club membership is not checked for cup competitions.";
      return (
        <div className="space-y-3">
          {query.defaultedForPlan && query.currentSeason !== null && (
            <DataNotice tone="warn">
              {seasonSpanLabel(query.currentSeason)} (current season) player statistics are not available on our current
              API-Football plan. Showing {season}, a completed season and the latest one the plan includes.
            </DataNotice>
          )}
          <DataNotice>
            <strong className="font-semibold text-ink">
              {category.label} · {leagueName} · {season} ({seasonKind})
            </strong>
            <br />
            Source: API-Football, updated <LocalTime iso={view.fetchedAt} variant="datetime" />. {view.players.length} of{" "}
            {view.players.length + view.excluded.length} records passed MatchPulse&apos;s data checks. {clubNote}
          </DataNotice>
          {view.players.length > 0 ? (
            <PlayersTable players={view.players} ranking={category.ranking!} caption={`${category.label}, ${leagueName} ${season}`} />
          ) : (
            <DataNotice tone="warn">No records passed the data checks, so no ranking is shown.</DataNotice>
          )}
          {view.excluded.length > 0 && (
            <details className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs">
              <summary className="cursor-pointer font-semibold text-warn">
                {view.excluded.length} record{view.excluded.length === 1 ? "" : "s"} not ranked (failed data checks)
              </summary>
              <ul className="mt-2 space-y-1.5 text-ink/85">
                {view.excluded.map(({ player, reason }) => (
                  <li key={player.playerId}>
                    <span className="font-semibold">{player.name}</span>
                    {player.team ? <span className="text-muted"> ({player.team.name} as supplied)</span> : null}: {reason}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-muted">
                These appear in API-Football&apos;s list with totals MatchPulse cannot verify. They are left out rather than
                corrected or estimated.
              </p>
            </details>
          )}
          <p className="text-[11px] text-muted">
            Ranked in API-Football&apos;s order after removing records that failed checks; the provider returns its top 20,
            so players just outside that list are not shown. Apps = appearances. Nationality flags are not shown because
            our data source does not supply a reliable flag for each player.
          </p>
        </div>
      );
    }
  }
}

function PlayersSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading players">
      <div className="flex gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-8 w-32 animate-pulse rounded-full bg-surface-2" />
        ))}
      </div>
      <div className="space-y-1.5 rounded-xl border border-line bg-surface p-3">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="h-11 animate-pulse rounded bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
