import { getClubAsset } from "@/data/api-assets";
import type { Club } from "@/lib/types";

/**
 * Clubs used by the header carousel and sample data. Real crests come from
 * API-Football (api-assets.json) where synced; the colours below only drive
 * the MatchPulse placeholder crest used as a fallback.
 */
export const clubs: Club[] = [
  { id: "real-madrid", name: "Real Madrid", short: "RMA", primary: "#f2f2f2", secondary: "#c9a227" },
  { id: "barcelona", name: "Barcelona", short: "BAR", primary: "#a50044", secondary: "#004d98" },
  { id: "man-united", name: "Manchester United", short: "MUN", primary: "#da291c", secondary: "#fbe122" },
  { id: "chelsea", name: "Chelsea", short: "CHE", primary: "#034694", secondary: "#f2f2f2" },
  { id: "liverpool", name: "Liverpool", short: "LIV", primary: "#c8102e", secondary: "#00b2a9" },
  { id: "bayern", name: "Bayern Munich", short: "FCB", primary: "#dc052d", secondary: "#0066b2" },
  { id: "psg", name: "Paris Saint-Germain", short: "PSG", primary: "#004170", secondary: "#da291c" },
  { id: "juventus", name: "Juventus", short: "JUV", primary: "#1a1a1a", secondary: "#f2f2f2" },
  { id: "ac-milan", name: "AC Milan", short: "MIL", primary: "#fb090b", secondary: "#1a1a1a" },
  { id: "inter", name: "Inter", short: "INT", primary: "#010e80", secondary: "#2a7de1" },
  { id: "man-city", name: "Manchester City", short: "MCI", primary: "#6cabdd", secondary: "#1c2c5b" },
  { id: "arsenal", name: "Arsenal", short: "ARS", primary: "#ef0107", secondary: "#f2f2f2" },
  { id: "atletico", name: "Atlético Madrid", short: "ATM", primary: "#cb3524", secondary: "#272e61" },
  { id: "dortmund", name: "Borussia Dortmund", short: "BVB", primary: "#fde100", secondary: "#1a1a1a" },
  { id: "al-ahly", name: "Al Ahly", short: "AHL", primary: "#c8102e", secondary: "#f2f2f2" },
  { id: "wydad", name: "Wydad AC", short: "WAC", primary: "#d01c1f", secondary: "#f2f2f2" },
  { id: "raja", name: "Raja CA", short: "RCA", primary: "#00843d", secondary: "#f2f2f2" },
  { id: "napoli", name: "Napoli", short: "NAP", primary: "#12a0d7", secondary: "#f2f2f2" },
  { id: "tottenham", name: "Tottenham Hotspur", short: "TOT", primary: "#f2f2f2", secondary: "#132257" },
  { id: "newcastle", name: "Newcastle United", short: "NEW", primary: "#241f20", secondary: "#f2f2f2" },
  { id: "aston-villa", name: "Aston Villa", short: "AVL", primary: "#670e36", secondary: "#95bfe5" },
  { id: "benfica", name: "Benfica", short: "SLB", primary: "#e41b17", secondary: "#f2f2f2" },
  { id: "porto", name: "FC Porto", short: "FCP", primary: "#00428c", secondary: "#f2f2f2" },
  { id: "sporting", name: "Sporting CP", short: "SCP", primary: "#008057", secondary: "#f2f2f2" },
  { id: "ajax", name: "Ajax", short: "AJA", primary: "#d2122e", secondary: "#f2f2f2" },
  { id: "psv", name: "PSV", short: "PSV", primary: "#ed1c24", secondary: "#f2f2f2" },
  { id: "feyenoord", name: "Feyenoord", short: "FEY", primary: "#e30613", secondary: "#1a1a1a" },
  { id: "leipzig", name: "RB Leipzig", short: "RBL", primary: "#dd0741", secondary: "#f2f2f2" },
  { id: "leverkusen", name: "Bayer Leverkusen", short: "B04", primary: "#e32221", secondary: "#1a1a1a" },
  { id: "galatasaray", name: "Galatasaray", short: "GAL", primary: "#a90432", secondary: "#fdb912" },
  { id: "celtic", name: "Celtic", short: "CEL", primary: "#018749", secondary: "#f2f2f2" },
  { id: "club-brugge", name: "Club Brugge", short: "BRU", primary: "#0060ad", secondary: "#1a1a1a" },
  { id: "monaco", name: "Monaco", short: "ASM", primary: "#e7182d", secondary: "#f2f2f2" },
  { id: "lille", name: "Lille", short: "LOS", primary: "#e01e13", secondary: "#20325f" },
  { id: "sevilla", name: "Sevilla", short: "SEV", primary: "#f2f2f2", secondary: "#d4021d" },
  { id: "villarreal", name: "Villarreal", short: "VIL", primary: "#ffe667", secondary: "#005187" },
  { id: "roma", name: "Roma", short: "ROM", primary: "#8e1f2f", secondary: "#f0bc42" },
  { id: "lazio", name: "Lazio", short: "LAZ", primary: "#87d8f7", secondary: "#f2f2f2" },
  { id: "al-hilal", name: "Al Hilal", short: "HIL", primary: "#1f4e9c", secondary: "#f2f2f2" },
  { id: "al-nassr", name: "Al Nassr", short: "NSR", primary: "#fbd914", secondary: "#1e3a8a" },
  { id: "al-ittihad", name: "Al Ittihad", short: "ITT", primary: "#fbd914", secondary: "#1a1a1a" },
  { id: "al-ahli-sfc", name: "Al Ahli", short: "AHS", primary: "#00843d", secondary: "#f2f2f2" },
  { id: "zamalek", name: "Zamalek", short: "ZAM", primary: "#f2f2f2", secondary: "#c8102e" },
  { id: "pyramids", name: "Pyramids FC", short: "PYR", primary: "#1c3d7a", secondary: "#f2f2f2" },
  { id: "esperance", name: "Espérance de Tunis", short: "EST", primary: "#c8102e", secondary: "#fbd914" },
  { id: "mamelodi", name: "Mamelodi Sundowns", short: "MSFC", primary: "#fbd914", secondary: "#007a3d" },
  { id: "inter-miami", name: "Inter Miami", short: "MIA", primary: "#f7b5cd", secondary: "#231f20" },
  { id: "la-galaxy", name: "LA Galaxy", short: "LAG", primary: "#00245d", secondary: "#ffd200" },
  { id: "lafc", name: "LAFC", short: "LAFC", primary: "#1a1a1a", secondary: "#c39e6d" },
  { id: "seattle", name: "Seattle Sounders", short: "SEA", primary: "#5d9741", secondary: "#005595" },
  { id: "flamengo", name: "Flamengo", short: "FLA", primary: "#c3281e", secondary: "#1a1a1a" },
  { id: "palmeiras", name: "Palmeiras", short: "PAL", primary: "#006437", secondary: "#f2f2f2" },
  { id: "river-plate", name: "River Plate", short: "RIV", primary: "#f2f2f2", secondary: "#e21b23" },
  { id: "boca", name: "Boca Juniors", short: "BOC", primary: "#103f79", secondary: "#f3b229" },
  { id: "racing", name: "Racing Club", short: "RAC", primary: "#6cace4", secondary: "#f2f2f2" },
  { id: "fluminense", name: "Fluminense", short: "FLU", primary: "#7a0e2b", secondary: "#00613c" },
];

function withRealCrest(club: Club): Club {
  const logo = getClubAsset(club.id)?.logo;
  return logo ? { ...club, crest: { kind: "image", url: logo } } : club;
}

const byId = new Map(clubs.map((club) => [club.id, withRealCrest(club)]));

export function getClub(id: string): Club {
  const club = byId.get(id);
  if (!club) throw new Error(`Unknown club id: ${id}`);
  return club;
}

/** Clubs shown in the header carousel. */
export const featuredClubIds = [
  "real-madrid",
  "barcelona",
  "man-united",
  "chelsea",
  "liverpool",
  "bayern",
  "psg",
  "juventus",
  "ac-milan",
  "inter",
  "man-city",
  "arsenal",
  "atletico",
  "dortmund",
  "al-ahly",
  "wydad",
  "raja",
  "napoli",
];
