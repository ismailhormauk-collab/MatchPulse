import type { PlayerStatLine } from "@/lib/api-football/core";
import { providerClub } from "@/lib/api-football/adapter";
import type { PlayerRanking } from "@/lib/api-football/server";
import { TeamCrest } from "@/components/ui/TeamCrest";
import { PlayerPhoto } from "./PlayerPhoto";

const show = (value: number | null) => (value === null ? "–" : String(value));

/**
 * Verified player ranking (records that failed integrity checks are removed
 * before this; provider order kept, values shown only when supplied). Rows
 * are not links: there is no player page.
 */
export function PlayersTable({ players, ranking, caption }: { players: PlayerStatLine[]; ranking: PlayerRanking; caption: string }) {
  const primary = ranking === "scorers" ? "Goals" : "Assists";
  const secondary = ranking === "scorers" ? "Assists" : "Goals";
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <table className="w-full table-fixed text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-wider text-muted">
            <th scope="col" className="w-9 py-2.5 pl-3 text-center font-semibold sm:w-11">#</th>
            <th scope="col" className="px-2 py-2.5 font-semibold">Player</th>
            <th scope="col" className="hidden w-[30%] px-2 py-2.5 font-semibold md:table-cell">Club</th>
            <th scope="col" className="hidden w-14 py-2.5 text-center font-semibold sm:table-cell">
              <abbr title="Appearances" className="no-underline">Apps</abbr>
            </th>
            <th scope="col" className="hidden w-16 py-2.5 text-center font-semibold sm:table-cell">{secondary}</th>
            <th scope="col" className="w-16 py-2.5 pr-3 text-center font-semibold">{primary}</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => {
            const main = ranking === "scorers" ? player.goals : player.assists;
            const other = ranking === "scorers" ? player.assists : player.goals;
            const club = player.team ? providerClub(player.team) : null;
            return (
              <tr key={player.playerId} className="border-b border-line/70 last:border-0 hover:bg-surface-2">
                <td className="py-2.5 pl-3 text-center tabular-nums text-muted">{index + 1}</td>
                <th scope="row" className="px-2 py-2.5 font-medium text-ink">
                  <span className="flex min-w-0 items-center gap-3">
                    <PlayerPhoto name={player.name} url={player.photo} />
                    <span className="min-w-0">
                      <span className="block truncate">{player.name}</span>
                      <span className="block truncate text-xs font-normal text-muted">
                        {[player.position, player.nationality].filter(Boolean).join(" · ") || " "}
                      </span>
                      {club && (
                        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs font-normal text-ink/80 md:hidden">
                          <TeamCrest club={club} size="sm" />
                          <span className="truncate">{club.name}</span>
                        </span>
                      )}
                    </span>
                  </span>
                </th>
                <td className="hidden px-2 py-2.5 text-ink/85 md:table-cell">
                  {club ? (
                    <span className="flex min-w-0 items-center gap-2">
                      <TeamCrest club={club} size="sm" />
                      <span className="truncate">{club.name}</span>
                    </span>
                  ) : (
                    "–"
                  )}
                </td>
                <td className="hidden py-2.5 text-center tabular-nums text-ink/85 sm:table-cell">{show(player.appearances)}</td>
                <td className="hidden py-2.5 text-center tabular-nums text-ink/85 sm:table-cell">{show(other)}</td>
                <td className="py-2.5 pr-3 text-center font-display text-lg font-bold tabular-nums">{show(main)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
