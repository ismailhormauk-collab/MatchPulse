import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageMetadata, siteUrl } from "@/lib/site";
import { breadcrumbs, JsonLd } from "@/components/seo/JsonLd";
import { Suspense } from "react";
import { getLeague } from "@/data/leagues";
import { hasStandings, loadStandings, STANDINGS_SLUGS, standingsCopy, type StandingsView } from "@/lib/standings";
import { getMatchFeed } from "@/lib/match-feed";
import { MATCH_DAY_PATH, type MatchDay } from "@/lib/match-days";
import { formatDateKeyShort, formatTime, SITE_TIME_ZONE, zonedDateKey } from "@/lib/time";
import { Breadcrumbs } from "@/components/seo/Breadcrumbs";
import { MatchCard } from "@/components/matches/MatchCard";
import { StandingsTable } from "@/components/leagues/StandingsTable";
import { DataNotice } from "@/components/ui/DataNotice";
import { LeagueBadge } from "@/components/ui/LeagueBadge";
import { LocalTime } from "@/components/ui/LocalTime";
import { RefreshButton } from "@/components/ui/RefreshButton";

export function generateStaticParams() {
  return STANDINGS_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/leagues/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const league = getLeague(slug);
  if (!league || !hasStandings(slug)) {
    return pageMetadata({ title: "Standings not found", description: "This competition has no standings page.", path: "/leagues", index: false });
  }
  // Names the season actually shown (shares the page's cached standings load).
  const copy = standingsCopy(league.name, await loadStandings(slug));
  return pageMetadata({ title: copy.title, description: copy.description, path: `/leagues/${slug}` });
}

export default function StandingsPage({ params }: PageProps<"/leagues/[slug]">) {
  return (
    <Suspense fallback={<StandingsSkeleton />}>
      <Standings params={params} />
    </Suspense>
  );
}

// Unknown slugs get a real 404 from src/proxy.ts; this is a fallback.
async function Standings({ params }: { params: PageProps<"/leagues/[slug]">["params"] }) {
  const { slug } = await params;
  const league = getLeague(slug);
  if (!league || !hasStandings(slug)) notFound();
  const view = await loadStandings(slug);
  const copy = standingsCopy(league.name, view);

  return (
    <div className="mx-auto max-w-4xl">
      <JsonLd
        data={breadcrumbs(
          [
            { name: "Home", path: "/" },
            { name: "Leagues", path: "/leagues" },
            { name: copy.h1, path: `/leagues/${slug}` },
          ],
          siteUrl(),
        )}
      />
      <Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Leagues", href: "/leagues" }, { name: league.name }]} />

      <div className="mb-4 flex items-center gap-3">
        <LeagueBadge league={league} size="lg" />
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold leading-tight tracking-wide">{copy.h1}</h1>
          <p className="text-sm text-muted">
            {league.country}
            {"seasonLabel" in view ? ` · Season ${view.seasonLabel}` : ""}
          </p>
        </div>
      </div>

      <StandingsBody view={view} leagueName={league.name} />
      <LeagueFixtures slug={slug} leagueName={league.name} />
    </div>
  );
}

const DAYS: { day: MatchDay; label: string }[] = [
  { day: "yesterday", label: "Yesterday" },
  { day: "today", label: "Today" },
  { day: "tomorrow", label: "Tomorrow" },
];

/**
 * This competition's matches from yesterday to tomorrow (UK time), from the
 * same cached feed as /matches (no extra API requests). Real data only.
 */
async function LeagueFixtures({ slug, leagueName }: { slug: string; leagueName: string }) {
  const feed = await getMatchFeed();
  if (feed.source.kind !== "api-football") return null;
  const mine = feed.matches.filter((match) => match.leagueSlug === slug).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const byDay = DAYS.map(({ day, label }) => ({
    day,
    label,
    matches: mine.filter((match) => zonedDateKey(match.kickoff, SITE_TIME_ZONE) === feed.days[day]),
  }));

  return (
    <section aria-labelledby="league-fixtures" className="mt-8">
      <h2 id="league-fixtures" className="font-display text-xl font-bold tracking-wide text-ink">
        {leagueName} fixtures and results
      </h2>
      <p className="mt-1 text-xs text-muted">Yesterday to tomorrow, in UK time. Scores update about every hour.</p>
      {mine.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          No {leagueName} matches between {formatDateKeyShort(feed.days.yesterday)} and {formatDateKeyShort(feed.days.tomorrow)}.
        </p>
      ) : (
        <div className="mt-3 space-y-4">
          {byDay
            .filter((group) => group.matches.length > 0)
            .map((group) => (
              <div key={group.day}>
                <h3 className="mb-1.5 text-sm font-semibold text-ink">
                  {group.label} · {formatDateKeyShort(feed.days[group.day])}
                </h3>
                <div className="space-y-1.5">
                  {group.matches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      kickoffLabel={formatTime(match.kickoff, { timeZone: SITE_TIME_ZONE, timeFormat: "24h" })}
                      clock={match.status === "live" ? match.clock : undefined}
                    />
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Link href={MATCH_DAY_PATH.yesterday} className="font-medium text-pulse hover:underline">
          Yesterday&apos;s results →
        </Link>
        <Link href={MATCH_DAY_PATH.today} className="font-medium text-pulse hover:underline">
          Today&apos;s matches →
        </Link>
        <Link href={MATCH_DAY_PATH.tomorrow} className="font-medium text-pulse hover:underline">
          Tomorrow&apos;s fixtures →
        </Link>
      </p>
    </section>
  );
}

function StandingsBody({ view, leagueName }: { view: StandingsView; leagueName: string }) {
  switch (view.state) {
    case "disabled":
      return (
        <DataNotice tone="warn">
          Live standings are switched off in this environment. MatchPulse does not show sample standings, so no table is
          displayed.
        </DataNotice>
      );
    case "unresolved":
    case "no-season":
      return (
        <DataNotice tone="warn">
          Standings for {leagueName} are not available from our football data provider right now.
        </DataNotice>
      );
    case "no-coverage":
      return (
        <DataNotice tone="warn">
          Our football data provider does not supply standings for {leagueName} ({view.seasonLabel}) on the current plan.
        </DataNotice>
      );
    case "plan-restricted":
      return (
        <DataNotice tone="warn">
          {view.currentLabel} standings for {leagueName} are not included in our current API-Football plan
          {view.allowed ? ` (it covers ${view.allowed.from} to ${view.allowed.to} seasons)` : ""}, and no earlier season is
          available, so no table is shown.
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
        <div className="space-y-3">
          {view.planLimited && <PlanLimitNotice current={view.planLimited.currentLabel} shown={view.seasonLabel} />}
          <DataNotice action={<RefreshButton />}>
            The {view.seasonLabel} table has no entries yet. Updated <LocalTime iso={view.fetchedAt} variant="datetime" />.
          </DataNotice>
        </div>
      );
    case "ok":
      return (
        <div className="space-y-5">
          {view.planLimited && <PlanLimitNotice current={view.planLimited.currentLabel} shown={view.seasonLabel} />}
          <DataNotice action={<RefreshButton />}>
            {view.planLimited ? (
              <>
                Final {view.seasonLabel} standings from API-Football (a completed season), updated{" "}
                <LocalTime iso={view.fetchedAt} variant="datetime" />.
              </>
            ) : (
              <>
                Standings from API-Football, updated <LocalTime iso={view.fetchedAt} variant="datetime" />. Tables refresh
                about every hour.
              </>
            )}
          </DataNotice>
          {view.groups.map((group, index) => (
            <section key={group.name ?? index} aria-label={group.name ?? `${leagueName} table`}>
              {view.groups.length > 1 && group.name && (
                <h2 className="mb-2 font-display text-lg font-bold tracking-wide">{group.name}</h2>
              )}
              <StandingsTable rows={group.rows} caption={`${group.name ?? leagueName} standings`} />
            </section>
          ))}
          <p className="text-[11px] text-muted">
            P played · W won · D drawn · L lost · GF goals for · GA goals against · GD goal difference · Pts points.
            Hover a position for qualification notes where provided.
          </p>
        </div>
      );
  }
}

function StandingsSkeleton() {
  return (
    <div className="mx-auto max-w-4xl" aria-busy="true" aria-label="Loading standings">
      <div className="mb-3 h-4 w-32 animate-pulse rounded bg-surface-2" />
      <div className="mb-4 flex items-center gap-3">
        <div className="size-11 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-8 w-64 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="space-y-1.5 rounded-xl border border-line bg-surface p-3">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="h-8 animate-pulse rounded bg-surface-2" />
        ))}
      </div>
    </div>
  );
}

/** The current season is outside the API plan: say which completed season is shown instead. */
function PlanLimitNotice({ current, shown }: { current: string; shown: string }) {
  return (
    <DataNotice tone="warn">
      {current} (current season) standings are not included in our current API-Football plan. Showing the {shown} season,
      the latest completed season the plan includes. This is not the live table.
    </DataNotice>
  );
}
