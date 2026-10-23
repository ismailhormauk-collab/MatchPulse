import type { StandingRow } from "@/lib/api-football/core";
import { providerClub } from "@/lib/api-football/adapter";
import { TeamCrest } from "@/components/ui/TeamCrest";

const fmt = (value: number | null) => (value === null ? "–" : String(value));
const signed = (value: number | null) => (value === null ? "–" : value > 0 ? `+${value}` : String(value));

/** One standings table. Values are shown exactly as supplied; missing ones show "–". */
export function StandingsTable({ rows, caption }: { rows: StandingRow[]; caption: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
            <th scope="col" className="w-10 py-2.5 pl-3 text-center font-semibold sm:w-12">
              <abbr title="Position">#</abbr>
            </th>
            <th scope="col" className="px-2 py-2.5 font-semibold">Club</th>
            <Num label="Played" short="P" />
            <Num label="Won" short="W" wide />
            <Num label="Drawn" short="D" wide />
            <Num label="Lost" short="L" wide />
            <Num label="Goals for" short="GF" wide />
            <Num label="Goals against" short="GA" wide />
            <Num label="Goal difference" short="GD" />
            <Num label="Points" short="Pts" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.teamId}-${row.rank}`} className="border-b border-line/70 last:border-0 hover:bg-surface-2">
              <td className="py-2.5 pl-3 text-center tabular-nums text-muted" title={row.description ?? undefined}>
                {row.rank}
              </td>
              <th scope="row" className="px-2 py-2.5 font-medium text-ink">
                <span className="flex min-w-0 items-center gap-2.5">
                  <TeamCrest club={providerClub({ id: row.teamId, name: row.teamName, logo: row.teamLogo })} size="sm" />
                  <span className="truncate">{row.teamName}</span>
                </span>
              </th>
              <Cell>{fmt(row.played)}</Cell>
              <Cell wide>{fmt(row.win)}</Cell>
              <Cell wide>{fmt(row.draw)}</Cell>
              <Cell wide>{fmt(row.lose)}</Cell>
              <Cell wide>{fmt(row.goalsFor)}</Cell>
              <Cell wide>{fmt(row.goalsAgainst)}</Cell>
              <Cell>{signed(row.goalsDiff)}</Cell>
              <Cell strong>{row.points}</Cell>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Num({ label, short, wide }: { label: string; short: string; wide?: boolean }) {
  return (
    <th scope="col" className={`w-9 py-2.5 text-center font-semibold sm:w-11 ${wide ? "hidden sm:table-cell" : ""}`}>
      <abbr title={label} className="no-underline">
        {short}
      </abbr>
    </th>
  );
}

function Cell({ children, wide, strong }: { children: React.ReactNode; wide?: boolean; strong?: boolean }) {
  return (
    <td
      className={`py-2.5 text-center tabular-nums ${wide ? "hidden sm:table-cell" : ""} ${
        strong ? "font-bold text-ink" : "text-ink/85"
      }`}
    >
      {children}
    </td>
  );
}
