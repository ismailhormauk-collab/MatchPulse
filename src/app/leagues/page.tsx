import type { Metadata } from "next";
import { pageMetadata } from "@/lib/site";
import Link from "next/link";
import { leagueHref, leagues } from "@/data/leagues";
import { LeagueBadge } from "@/components/ui/LeagueBadge";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { Region } from "@/lib/types";

export const metadata: Metadata = pageMetadata({
  title: "Leagues",
  description: "Football leagues and cup competitions from around the world, with standings for Europe's top leagues, UEFA competitions and the Botola Pro.",
  path: "/leagues",
});

const regionOrder: Region[] = ["Europe", "Africa", "Asia", "North America", "South America", "World"];

export default function LeaguesPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <SectionHeading
        as="h1"
        title="Leagues"
        description={`${leagues.length} competitions. Logos supplied by API-Football.`}
      />

      <div className="space-y-7">
        {regionOrder.map((region) => {
          const regionLeagues = leagues.filter((league) => league.region === region);
          if (regionLeagues.length === 0) return null;
          return (
            <section key={region} aria-labelledby={`region-${region}`}>
              <h2
                id={`region-${region}`}
                className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted"
              >
                {region}
              </h2>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {regionLeagues.map((league) => (
                  <li
                    key={league.slug}
                    id={league.slug}
                    className="flex scroll-mt-6 items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 shadow-card target:border-pulse/60 target:bg-pulse-soft"
                  >
                    <LeagueBadge league={league} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{league.name}</p>
                      <p className="text-[11px] text-muted">{league.country}</p>
                    </div>
                    {leagueHref(league.slug).startsWith("/leagues/") && (
                      <Link
                        href={leagueHref(league.slug)}
                        className="relative shrink-0 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink/90 transition-colors hover:border-pulse/50 hover:text-pulse"
                      >
                        Standings<span className="sr-only"> for {league.name}</span>
                      </Link>
                    )}
                    {league.popular && (
                      <span className="rounded-full bg-pulse-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-pulse">
                        Popular
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
