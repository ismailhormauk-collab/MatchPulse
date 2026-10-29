export type Region =
  | "Europe"
  | "Africa"
  | "Asia"
  | "North America"
  | "South America"
  | "World";

/** Which secondary-navigation menu a competition belongs to. */
export type CompetitionGroup =
  | "european"
  | "domestic"
  | "continental"
  | "international";

export interface League {
  slug: string;
  name: string;
  country: string;
  region: Region;
  /** Short code (legacy; logos now come from API-Football, see api-assets.ts). */
  code: string;
  /** Badge background color. */
  color: string;
  group: CompetitionGroup;
  popular?: boolean;
}

/**
 * Crest to show for a team. `image`: a crest URL supplied by the data provider.
 * `neutral`: a provider team without a usable crest (never a guessed one).
 * Sample clubs omit it and use MatchPulse placeholder crests.
 */
export type CrestSource = { kind: "image"; url: string } | { kind: "neutral" };

export interface Club {
  id: string;
  name: string;
  crest?: CrestSource;
  /** Up to three letters rendered on the placeholder crest. */
  short: string;
  primary: string;
  secondary: string;
}

export type MatchStatus = "live" | "upcoming" | "finished" | "postponed";

/** Where match data came from. Sample data must always be labelled as such. */
export type MatchSource = "sample" | "api-football";

export interface Match {
  id: string;
  source: MatchSource;
  /** Provider fixture ID (API-Football matches only); used for the details page. */
  fixtureId?: number;
  leagueSlug: string;
  /**
   * Kickoff instant as an ISO 8601 UTC timestamp, e.g. "2026-10-21T19:00:00Z".
   * The calendar date shown to users is derived from this in their time zone.
   */
  kickoff: string;
  /** Team display data; `crest` holds the provider crest when available. */
  home: Club;
  away: Club;
  status: MatchStatus;
  /** Provider-specific status shown instead of the default label (e.g. "AET", "Cancelled"). */
  statusDetail?: string;
  /** Score. For `source: "sample"` this is invented development data. */
  homeScore?: number;
  awayScore?: number;
  /**
   * Provider match clock at fetch time (live API matches only). Sample matches
   * derive their clock from the sample "now" instead.
   */
  clock?: { label: string; progress: number };
}

/** Serialisable description of where the feed's data came from. */
export type FeedSource =
  | { kind: "sample" }
  | {
      kind: "api-football";
      fetchedAt: string;
      refreshSeconds: number;
      /** Supported competitions the API could not be matched to. */
      unresolved: string[];
      partial: boolean;
    }
  /** Development only: the API failed, so sample data is shown instead. */
  | { kind: "sample-fallback"; reason: string }
  | { kind: "unavailable"; reason: string };

export type MatchFilter = "all" | "live" | "upcoming" | "finished";

export interface NavItem {
  label: string;
  href: string;
}

export interface CompetitionMenu {
  label: string;
  items: NavItem[];
}
