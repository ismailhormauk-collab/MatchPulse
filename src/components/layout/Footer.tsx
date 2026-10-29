import Link from "next/link";
import { mainNav } from "@/data/navigation";
import { leagueHref, popularLeagues } from "@/data/leagues";
import { isLiveDataEnabled } from "@/lib/api-football/server";
import { Logo } from "./Logo";

export function Footer() {
  const liveData = isLiveDataEnabled();
  return (
    <footer className="mt-auto border-t border-chrome-line bg-chrome">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr]">
        <div className="col-span-2 max-w-sm md:col-span-1">
          <Logo size="lg" />
          <p className="mt-4 text-sm leading-relaxed text-muted">
            MatchPulse is a football portal for fixtures, results, competitions, players and news from around the
            world.
          </p>
          <p className="mt-4 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
            {liveData
              ? "Development preview: fixtures, scores, standings and player statistics come from API-Football unless a notice says sample data is shown. News articles are written by the MatchPulse editorial team; external headlines (via NewsData.io) link to their publishers."
              : "Development preview: every score and fixture on this site is sample data, not real information. Player statistics and standings are only shown with live data. News articles are written by the MatchPulse editorial team; external headlines (via NewsData.io) link to their publishers."}
          </p>
        </div>

        <FooterColumn title="Explore" links={[...mainNav, { label: "Match reports", href: "/reports" }]} />
        <FooterColumn
          title="Top competitions"
          links={popularLeagues.slice(0, 6).map((league) => ({
            label: league.name,
            href: leagueHref(league.slug),
          }))}
        />
      </div>

      <div className="mx-auto max-w-7xl px-4 pb-6 sm:px-6">
        <div className="flex flex-col gap-1.5 rounded-xl border border-chrome-line bg-chrome-2 px-4 py-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p>© 2026 MatchPulse. All rights reserved.</p>
          <p className="text-xs">Club crests and competition logos are supplied by API-Football and belong to their owners; used for identification only.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h2 className="font-display text-lg font-semibold tracking-wide text-ink">{title}</h2>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-sm text-muted transition-colors hover:text-pulse">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
