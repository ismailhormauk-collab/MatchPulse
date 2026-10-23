import type { NewsArticle } from "@/lib/types";

/**
 * DEVELOPMENT SAMPLE DATA.
 * Placeholder articles written for layout work. They describe no real
 * events, quotes or people and will be replaced by an editorial source.
 */
export const newsArticles: NewsArticle[] = [
  {
    slug: "title-race-tightens-after-dramatic-weekend",
    title: "Title race tightens after a dramatic weekend at the top",
    excerpt:
      "Three of the top four dropped points, leaving just two points between first and fifth as the season reaches its first international break.",
    category: "Analysis",
    publishedAt: "2026-10-21T09:30:00Z",
    readMinutes: 5,
    author: "MatchPulse Desk",
    tone: ["#0f5132", "#12233f"],
    featured: true,
    body: [
      "It was a weekend that rewrote the early-season table. Late equalisers, a red card in the opening ten minutes and a goalkeeper error in stoppage time combined to compress the top of the standings.",
      "With only two points separating first from fifth, every fixture before the next break now carries extra weight. Squads that rotated heavily in midweek were the ones most likely to drop points.",
      "This is placeholder copy written for the MatchPulse development build. It does not describe a real competition or real results.",
    ],
  },
  {
    slug: "young-midfielders-shaping-the-season",
    title: "Five young midfielders shaping the new European season",
    excerpt:
      "From deep-lying playmakers to box-to-box runners, a new generation is taking control of midfield across the continent.",
    category: "Analysis",
    publishedAt: "2026-10-20T15:00:00Z",
    readMinutes: 7,
    author: "MatchPulse Desk",
    tone: ["#3b1d6e", "#0e1a2f"],
    featured: true,
    body: [
      "Midfield has always been where matches are controlled, and this season a wave of players under 21 are dictating tempo at the highest level.",
      "We look at the profiles that are changing how coaches build from the back, press in transition and protect a lead late in games.",
      "This is placeholder copy written for the MatchPulse development build.",
    ],
  },
  {
    slug: "continental-draw-sets-up-heavyweight-clashes",
    title: "Continental draw sets up heavyweight group-stage clashes",
    excerpt:
      "Several former finalists were drawn together, guaranteeing marquee fixtures from the very first matchday.",
    category: "Competitions",
    publishedAt: "2026-10-20T11:15:00Z",
    readMinutes: 4,
    author: "MatchPulse Desk",
    tone: ["#12346b", "#0b1020"],
    featured: true,
    body: [
      "The draw produced a handful of groups that look stacked from top to bottom, with past finalists set to meet as early as the opening round.",
      "Travel, fixture congestion and squad depth will decide which sides survive the first phase.",
      "This is placeholder copy written for the MatchPulse development build.",
    ],
  },
  {
    slug: "high-press-and-the-modern-full-back",
    title: "How the high press is changing the modern full-back role",
    excerpt:
      "Full-backs are stepping into midfield, pressing higher and covering more ground than ever. The numbers explain why.",
    category: "Tactics",
    publishedAt: "2026-10-19T18:40:00Z",
    readMinutes: 6,
    author: "MatchPulse Analysis",
    tone: ["#6b2c12", "#141a26"],
    body: [
      "Inverted full-backs were once a novelty. Today they are a default setting for many possession-heavy teams.",
      "Pressing triggers now start with the wide defenders, who are asked to jump onto opposing wingers the moment the ball is played wide.",
      "This is placeholder copy written for the MatchPulse development build.",
    ],
  },
  {
    slug: "january-window-preview",
    title: "Transfer window preview: what clubs need before January",
    excerpt:
      "Injury crises, thin squads and contract situations will shape a busy winter market. We break down the likely priorities.",
    category: "Transfers",
    publishedAt: "2026-10-19T08:00:00Z",
    readMinutes: 8,
    author: "MatchPulse Desk",
    tone: ["#0e5a5a", "#101826"],
    body: [
      "The winter window is rarely about blockbuster signings. Instead, clubs use it to patch holes exposed during the first half of the season.",
      "Centre-backs and backup goalkeepers tend to top shopping lists, while loan deals for young players are expected to remain popular.",
      "This is placeholder copy written for the MatchPulse development build.",
    ],
  },
  {
    slug: "goalkeepers-passing-more-than-ever",
    title: "Goalkeepers are passing more than ever — the data explained",
    excerpt:
      "Keepers now attempt more short passes per match than some central midfielders. What does that mean for the way teams build?",
    category: "Data",
    publishedAt: "2026-10-18T13:20:00Z",
    readMinutes: 5,
    author: "MatchPulse Analysis",
    tone: ["#2a4d14", "#0d1320"],
    body: [
      "Distribution has become a core goalkeeping skill, and the passing numbers reflect a steady shift over the last decade.",
      "Teams that build short from goal kicks invite pressure, but they also create space further up the pitch when the press is beaten.",
      "This is placeholder copy written for the MatchPulse development build.",
    ],
  },
  {
    slug: "womens-football-attendances-climb",
    title: "Women's football attendances continue to climb",
    excerpt:
      "Bigger stadiums, better scheduling and broadcast deals are bringing new fans through the turnstiles.",
    category: "Women's Football",
    publishedAt: "2026-10-18T10:00:00Z",
    readMinutes: 4,
    author: "MatchPulse Desk",
    tone: ["#6b1240", "#121a2a"],
    body: [
      "Clubs are increasingly moving fixtures into their main stadiums, and the move is paying off at the gate.",
      "Consistent kickoff times and wider broadcast coverage are helping casual fans build matchday habits.",
      "This is placeholder copy written for the MatchPulse development build.",
    ],
  },
  {
    slug: "host-cities-step-up-stadium-upgrades",
    title: "Host cities step up stadium upgrades for upcoming tournaments",
    excerpt:
      "Roof replacements, new transport links and expanded fan zones are on the agenda as preparations accelerate.",
    category: "Competitions",
    publishedAt: "2026-10-17T16:30:00Z",
    readMinutes: 5,
    author: "MatchPulse Desk",
    tone: ["#5a4a12", "#111827"],
    body: [
      "Major tournaments leave a lasting mark on their host cities, and the planning starts years in advance.",
      "Stadium capacity, pitch technology and public transport are the three areas organisers typically prioritise.",
      "This is placeholder copy written for the MatchPulse development build.",
    ],
  },
  {
    slug: "set-pieces-deciding-tight-matches",
    title: "Set pieces are deciding more tight matches this season",
    excerpt:
      "Specialist coaches and rehearsed routines are turning corners and free kicks into a reliable source of goals.",
    category: "Tactics",
    publishedAt: "2026-10-16T12:00:00Z",
    readMinutes: 6,
    author: "MatchPulse Analysis",
    tone: ["#123f5a", "#0d121c"],
    body: [
      "When open play is tight, dead-ball situations become decisive. More clubs now employ dedicated set-piece coaches.",
      "Blocking runs, near-post flicks and short corners are the patterns producing the most chances.",
      "This is placeholder copy written for the MatchPulse development build.",
    ],
  },
  {
    slug: "academy-graduates-breaking-through",
    title: "Academy graduates breaking through at Europe's top clubs",
    excerpt:
      "Injuries and packed calendars are opening the door for homegrown teenagers to earn first-team minutes.",
    category: "Analysis",
    publishedAt: "2026-10-15T09:45:00Z",
    readMinutes: 5,
    author: "MatchPulse Desk",
    tone: ["#4a1a12", "#0f1624"],
    body: [
      "A congested calendar means coaches lean on their academies sooner than planned.",
      "For many young players, a handful of cup appearances is the first step towards a regular league role.",
      "This is placeholder copy written for the MatchPulse development build.",
    ],
  },
];

export function getArticle(slug: string): NewsArticle | undefined {
  return newsArticles.find((article) => article.slug === slug);
}

export const featuredArticles = newsArticles.filter((article) => article.featured);
