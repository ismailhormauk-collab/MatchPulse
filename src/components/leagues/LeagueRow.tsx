import Link from "next/link";
import { leagueHref } from "@/data/leagues";
import type { League } from "@/lib/types";
import { LeagueBadge } from "@/components/ui/LeagueBadge";

export function LeagueRow({ league, compact = false }: { league: League; compact?: boolean }) {
  return (
    <Link
      href={leagueHref(league.slug)}
      className={
        compact
          ? "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2 hover:text-pulse"
          : "flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 shadow-card transition-colors hover:border-pulse/40 hover:bg-surface-2"
      }
    >
      <LeagueBadge league={league} size={compact ? "sm" : "md"} />
      <div className="min-w-0">
        <p className={`truncate font-medium ${compact ? "text-[13px] text-ink/90" : "text-sm text-ink"}`}>{league.name}</p>
        {!compact && <p className="truncate text-[11px] text-muted">{league.country}</p>}
      </div>
    </Link>
  );
}
