import type { Metadata } from "next";
import Link from "next/link";
import { getLeague, leagueHref } from "@/data/leagues";
import { getMatchFeed } from "@/lib/match-feed";
import { loadMatchDay, MATCH_DAY_PATH, matchDayCopy, type MatchDay } from "@/lib/match-days";
import { STANDINGS_SLUGS } from "@/lib/standings";
import { pageMetadata, siteUrl } from "@/lib/site";
import { formatDateKeyShort } from "@/lib/time";
import { Breadcrumbs, type Crumb } from "@/components/seo/Breadcrumbs";
import { breadcrumbs, JsonLd } from "@/components/seo/JsonLd";
import { MatchCenter } from "./MatchCenter";
import { MidnightRefresh } from "./MidnightRefresh";

const DAY_LABEL: Record<MatchDay, string> = {
  yesterday: "Yesterday's results",
  today: "Today's matches",
  tomorrow: "Tomorrow's fixtures",
};

/** Metadata for a daily match page, from the day's real fixtures (shares the page's cached feed). */
export async function matchDayMetadata(day: MatchDay): Promise<Metadata> {
  const view = await loadMatchDay(day);
  const copy = matchDayCopy(view);
  // Sample (development) data is never indexed; real days are, even when empty.
  const isSample = view.source.kind === "sample" || view.source.kind === "sample-fallback";
  return pageMetadata({ title: copy.title, description: copy.description, path: MATCH_DAY_PATH[day], index: !isSample });
}

function crumbs(day: MatchDay): Crumb[] {
  if (day === "today") return [{ name: "Home", href: "/" }, { name: "Today's matches" }];
  return [{ name: "Home", href: "/" }, { name: "Matches", href: "/matches" }, { name: DAY_LABEL[day] }];
}

/** One UK calendar day of matches: dated H1, summary, day links and the match centre. */
export async function DailyMatches({ day }: { day: MatchDay }) {
  const [view, feed] = await Promise.all([loadMatchDay(day), getMatchFeed()]);
  const copy = matchDayCopy(view);
  const origin = siteUrl();
  const trail = crumbs(day);

  return (
    <>
      <JsonLd
        data={breadcrumbs(
          trail.map((item) => ({ name: item.name, path: item.href ?? MATCH_DAY_PATH[day] })),
          origin,
        )}
      />
      <Breadcrumbs items={trail} />

      <header className="mb-4">
        <h1 className="font-display text-3xl font-bold leading-tight tracking-wide text-ink">{copy.h1}</h1>
        {copy.summary && <p className="mt-1.5 text-sm text-muted">{copy.summary}</p>}
        <p className="mt-1 text-xs text-muted">
          Dates and kick-off times on this page follow UK time ({view.zoneName}). If you have chosen your own time zone in
          settings, the match list below uses it instead.
        </p>
      </header>

      <DayLinks current={day} days={feed.days} />

      <div className="mt-4">
        <MatchCenter matches={feed.matches} now={feed.now} source={feed.source} initialDay={day} competitionHeading="h2" />
      </div>

      {view.real && view.counts.total === 0 && (
        <p className="mt-4 text-sm text-muted">
          {day === "today" ? "No matches today in the competitions we cover. " : ""}
          Try{" "}
          {(["yesterday", "today", "tomorrow"] as const)
            .filter((other) => other !== day)
            .map((other, index) => (
              <span key={other}>
                {index > 0 && " or "}
                <Link href={MATCH_DAY_PATH[other]} className="font-medium text-pulse hover:underline">
                  {DAY_LABEL[other].toLowerCase()}
                </Link>
              </span>
            ))}
          , or browse the league tables below.
        </p>
      )}

      <LeagueLinks />
      <MidnightRefresh dateKey={view.dateKey} />
    </>
  );
}

/** Crawlable links between the three daily pages. */
function DayLinks({ current, days }: { current: MatchDay; days: Record<MatchDay, string> }) {
  return (
    <nav aria-label="Match days" className="grid grid-cols-3 gap-2">
      {(["yesterday", "today", "tomorrow"] as const).map((day) => {
        const active = day === current;
        return (
          <Link
            key={day}
            href={MATCH_DAY_PATH[day]}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg border px-2 py-2 text-center text-xs transition-colors ${
              active ? "border-pulse/50 bg-pulse-soft text-pulse" : "border-line bg-surface text-muted shadow-card hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <span className="block font-semibold">{DAY_LABEL[day]}</span>
            <span className="mt-0.5 block text-[11px] opacity-80">{formatDateKeyShort(days[day])}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Links to every league table, so each daily page connects to the competitions. */
function LeagueLinks() {
  const tables = STANDINGS_SLUGS.flatMap((slug) => {
    const league = getLeague(slug);
    return league ? [league] : [];
  });
  return (
    <section aria-labelledby="league-tables" className="mt-8 border-t border-line pt-5">
      <h2 id="league-tables" className="font-display text-lg font-bold tracking-wide text-ink">
        League tables
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {tables.map((league) => (
          <li key={league.slug}>
            <Link
              href={leagueHref(league.slug)}
              className="inline-block rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink/90 shadow-card hover:border-pulse/40 hover:text-pulse"
            >
              {league.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
