import { competitionGroupLabels, leagueHref, leaguesInGroup } from "@/data/leagues";
import type { CompetitionGroup, CompetitionMenu, NavItem } from "@/lib/types";

export const mainNav: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Matches", href: "/matches" },
  { label: "News", href: "/news" },
  { label: "Leagues", href: "/leagues" },
  { label: "Players", href: "/players" },
];

const groupOrder: CompetitionGroup[] = [
  "european",
  "domestic",
  "continental",
  "international",
];

export const competitionMenus: CompetitionMenu[] = [
  {
    label: "Transfers & Player News",
    items: [
      { label: "Latest news", href: "/news" },
      { label: "Top players", href: "/players" },
    ],
  },
  ...groupOrder.map((group) => ({
    label: competitionGroupLabels[group],
    items: leaguesInGroup(group).map((league) => ({
      label: league.name,
      href: leagueHref(league.slug),
    })),
  })),
];
