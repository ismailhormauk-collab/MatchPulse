import Link from "next/link";
import { leagues } from "@/data/leagues";
import { LeagueRow } from "./LeagueRow";

export function LeagueSidebar() {
  return (
    <aside className="hidden lg:block" aria-labelledby="sidebar-competitions">
      <div className="sticky top-4 flex max-h-[calc(100dvh-2rem)] flex-col rounded-xl border border-line bg-surface p-2 shadow-card">
        <h2 id="sidebar-competitions" className="px-2 pb-2 pt-1 font-display text-lg font-bold tracking-wide">
          Competitions
        </h2>
        <ul className="no-scrollbar -mx-0.5 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-0.5">
          {leagues.slice(0, 22).map((league) => (
            <li key={league.slug}>
              <LeagueRow league={league} compact />
            </li>
          ))}
        </ul>
        <Link
          href="/leagues"
          className="mt-2 rounded-lg border border-line py-1.5 text-center text-xs font-medium text-muted hover:border-pulse/40 hover:text-pulse"
        >
          All competitions →
        </Link>
      </div>
    </aside>
  );
}
