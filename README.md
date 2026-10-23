This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## API-Football (real fixtures)

MatchPulse shows clearly labelled **sample data** by default and makes no API
calls. Real fixtures come from [API-Football](https://www.api-football.com)
and are opt-in.

### Setup

1. Copy `.env.example` to `.env.local` (git-ignored) and set `API_FOOTBALL_KEY`.
   The key is read only on the server (`src/lib/api-football/server.ts`);
   never give it a `NEXT_PUBLIC_` prefix.
2. Check the key and competition coverage (makes up to 8 requests):
   ```bash
   npm run api:check               # add -- --dry-run to make no requests
   npm run api:check -- --probe-standings   # +8 requests: confirms season access
   ```
   It prints the league IDs and current seasons the API reports; the key is
   never printed. Competitions that don't match are listed with candidates;
   adjust their names in `src/lib/api-football/competitions.ts`.
3. Enable real data and rebuild:
   ```bash
   MATCHPULSE_DATA_SOURCE=api-football   # in .env.local
   npm run build && npm start
   ```
   With it unset, or with no key, the site keeps using sample data.

### How it works

- Supported competitions are matched by exact name, country and type from
  `GET /leagues?country=…`. **No league IDs are hardcoded.**
- The match centre loads yesterday, today and tomorrow (UTC) with
  `GET /fixtures?date=…` at request time; results are cached on the server with
  `"use cache"`. Browsers never call the API and never poll.
- Server functions: `getFixturesByDate`, `getLiveFixtures`, `getStandings`,
  `getLeagueStandings`, `getFixtureDetails`, `getSupportedCompetitions`.
- Failures are cached briefly (5 min for rate limits, 1 min otherwise) so a
  limited site stops calling the API. In production the page shows an
  "unavailable" notice. In `next dev` it falls back to labelled sample data.
- Club crests come from the logo URLs already in fixture/standings responses
  (no extra API requests). Only `https://*.api-sports.io/football/...` URLs are
  accepted (`next.config.ts` `images.remotePatterns`); otherwise a neutral badge
  is shown. Sample clubs keep MatchPulse placeholder crests.
- `/leagues/[slug]`: standings for the 8 supported competitions (real data only;
  no sample standings). `/matches/[id]`: score, events, lineups and statistics
  when the provider supplies them. Only fixtures in the current feed
  (yesterday–tomorrow) are looked up, so unknown IDs never spend requests.
- Free plan limits seen in practice: **10 requests/minute** (a cold start uses
  ~10, so a details or standings page opened in the same minute may briefly
  show "provider busy") and **no current-season standings** ("Free plans do
  not have access to this season"); the standings pages say so honestly.

### API plan seasons

The Free plan only includes seasons 2022–2024 (the provider says so in its own
error: "Free plans do not have access to this season, try from 2022 to 2024").
MatchPulse learns this window from the API (stored for a week; the asset sync
records it too) and never requests standings or player rankings for seasons
outside it:

- **Standings** show the current season when the plan includes it; otherwise
  the latest completed season the plan includes and the API covers, with a
  notice that it is not the live table.
- **Players** only offers seasons the plan includes; the default is the latest.
- **Fixtures, live scores and match pages** use dates and fixture IDs, not
  seasons, so they are not affected by the window.

After a plan upgrade set `API_FOOTBALL_PLAN_SEASONS=all` (or run
`npm run api:sync-assets`) so newer seasons are requested again.

### Request budget

| Data | Cache lifetime | Approx. requests/day under steady traffic |
| --- | --- | --- |
| Competitions (7 countries) | 1 week | ~1 |
| Today's fixtures | `API_FOOTBALL_REVALIDATE_TODAY_SECONDS` (default 1200) | 72 |
| Yesterday / tomorrow | 1 day / 6 hours | ~5 |
| Match details (per fixture opened) | 2 min live, 1 day finished, 1 hour otherwise | 1 per fixture per window |
| Standings (per competition opened) | 1 hour (plan restriction: 1 day) | ≤ 8 |

Today's fixtures refresh at the configured interval only while a match is live
or within ±3h of kickoff; otherwise at most hourly.

That is about 80/day, within the free plan's 100. On a paid plan, lower the
revalidate values (e.g. `API_FOOTBALL_REVALIDATE_TODAY_SECONDS=60`).
The cache is in memory: serverless hosts may not share it between instances,
which raises usage.

### Tests

```bash
npm test               # time zones, API client, match feed, pages, storage, news, articles (no network)
npm run test:secrets   # after a build: no secret values in browser bundles or public files
npm run test:routes -- http://localhost:3000   # HTTP 200/404 checks against a running server
npm run test:deployment -- https://<url>       # every article page, image, 404, sitemap and robots on a deployment
```

## MatchPulse articles (original content)

Original articles live in `content/news/` as Markdown files and are published at
`/news/<file-name>` (e.g. `content/news/wydad-season-preview.md` →
`/news/wydad-season-preview`), with article metadata, canonical URLs, NewsArticle
structured data and sitemap entries. Copy `content/news/_template.md`, fill in
the front matter and write the article; `content/news/README.md` lists the
fields and rules. `npm test` validates every file; drafts (`draft: true`) and
future-dated articles are not published. Images go in `public/news-images/` and
need a credit. All published articles appear on `/news` (newest first) and the latest six under
"Latest News" on the homepage.

## News (Koora headlines) — not displayed

The site no longer shows Koora headlines: `/news` and the homepage's "Latest
News" list only original MatchPulse articles. The Koora integration below
(`src/lib/news`, `src/components/news/NewsFeedSection.tsx` and related files)
is kept, unused and tested, in case Koora grants written permission; nothing
calls it, so it makes no requests to koora.com or the translation API.


The News section shows the latest headlines from [Koora](https://koora.com/الأخبار),
newest publication date first, each linking to the original article.

- **Rights:** Koora publishes no RSS feed, API or reuse licence (its footer says
  "All rights reserved"), so MatchPulse shows **links only**: the headline, the
  article's own publication date, "Koora" as the source, and a link. No article
  text, summaries or images are copied. Ask Koora (content@koora.com) for written
  permission before showing thumbnails or summaries.
- **Access:** `robots.txt` is read on every refresh (it currently allows everything
  except `/api/`, `/_next/`, `/admin/`, `/login`). Sources: the public news sitemap
  (`/sitemap/news.xml`) and each article's own `NewsArticle` metadata. Requests
  identify themselves as `MatchPulseNewsBot/1.0`.
- **Updates:** fetched server-side on demand, never per visitor: the list is cached
  for 30 minutes and shared across instances through the storage layer (Redis or
  local files). A refresh reads robots.txt, the sitemap and at most 8 articles it
  has not seen before (article details are remembered for 30 days). No cron job is
  needed. If Koora is unreachable, the last good list (up to 14 days old) is shown
  with its fetch time; otherwise an "unavailable" notice.
- **English headlines:** Koora's Arabic headlines are machine-translated when a
  story is first fetched, using the free [MyMemory](https://mymemory.translated.net)
  API (no key or account; its terms allow automated access). Each headline is
  translated once and stored with the article, so a refresh only translates new
  stories. Limits: 5,000 characters a day anonymously (about 70 headlines;
  `MATCHPULSE_TRANSLATION_EMAIL` raises it to 50,000). Before translating, a
  football glossary (`src/lib/news/glossary.ts`) puts known names into their
  English spelling; afterwards the result must be English only, keep every number
  and glossary name, and have a plausible length. A headline that fails stays in
  Arabic, labelled "English translation unavailable", and is retried after 12
  hours. Cards label English headlines "Machine-translated from Arabic"; hovering
  shows the original. A few awkward machine translations have reviewed wording in
  `src/lib/news/corrections.ts`, keyed by the exact Arabic headline (labelled
  "Translated from Arabic"; keep that list short and faithful, and prune it as
  stories age out). The notice above the cards says whether all, some or none of
  the shown headlines are in English. `MATCHPULSE_NEWS_TRANSLATION=off` shows Arabic only;
  `=claude` with `ANTHROPIC_API_KEY` is an optional paid alternative.
- `MATCHPULSE_NEWS_SOURCE=off` disables the feed. Match reports remain a separate
  section (`/reports`).

## Deployment checklist (not deployed yet)

### 1. Hosting and storage

Runtime data goes through a small storage adapter (`src/lib/storage`):

| Data | Filesystem backend | Upstash Redis backend |
| --- | --- | --- |
| Match reports (write-once, by fixture ID) | `<MATCHPULSE_DATA_DIR>/match-reports/<id>.json` | `<prefix>:report:<id>` + index `<prefix>:index:reports` |
| Known-fixture index (real 404s) | `<MATCHPULSE_DATA_DIR>/known-fixtures.json` | `<prefix>:fixtures:known` |
| Shared API-Football cache and locks | `<MATCHPULSE_DATA_DIR>/kv/` | `<prefix>:api:*`, `<prefix>:lock:*` (with TTLs) |

The backend is chosen automatically: Upstash credentials → Redis; on Vercel
without credentials → **none** (nothing persisted, logged as a warning: the
Vercel disk is temporary); otherwise → filesystem. Override with
`MATCHPULSE_STORAGE=redis|filesystem|none`. Storage failures never break
pages: reads fall back to "missing" and the API is called as before.
`src/data/api-assets.json` stays static project data.

| Option | Cost | Notes |
| --- | --- | --- |
| **Vercel + Upstash Redis** (supported) | $0 on Vercel Hobby and Upstash Free | Vercel Hobby is **non-commercial only** (commercial use needs Pro). Upstash Free: 256 MB, 500,000 commands/month. |
| Always-on VM with a disk (e.g. Oracle Cloud Always Free) | $0 (card needed at sign-up) | Filesystem backend, no Redis needed; you manage Node, a process manager and HTTPS. |
| Small paid VPS / Fly.io machine with a volume | ~$2–7/month | Same as above, needs approval to spend. |
| Render free web service | – | **Not suitable**: sleeps after 15 min and wipes its disk. |

### 1a. Vercel Preview + Production checklist (manual, not done yet)

**How it works on Vercel**

- `npm run build` (Vercel's default for this project) first runs
  `npm run articles:index`, which validates every file in `content/news` (the
  build fails on an invalid article) and writes `src/data/article-index.json`.
- Article pages, `/news`, the home page and the sitemap read `content/news` at
  request time; `next.config.ts` (`outputFileTracingIncludes`) ships those files
  with every server function. Images in `public/news-images` are served as
  static files.
- `src/proxy.ts` (real 404s) runs separately and cannot read `content/news` on
  Vercel, so in production it uses the generated article index instead.
- Safeguards from `VERCEL_ENV` (`src/lib/deployment.ts`): Preview and
  Development deployments never call API-Football (even if a key is set for
  "All Environments") unless `MATCHPULSE_PREVIEW_LIVE_DATA=true`, and are never
  indexed, whatever the other variables say.

**Environment variables**

| Variable | Production | Preview | Notes |
| --- | --- | --- | --- |
| `API_FOOTBALL_KEY` | **set** (secret) | **do not set** | Server-only; never `NEXT_PUBLIC_`. Preview ignores it anyway. |
| `MATCHPULSE_DATA_SOURCE` | `api-football` | do not set (sample data) | |
| `UPSTASH_REDIS_REST_URL` | **set** | optional | Or `KV_REST_API_URL` from the Vercel Upstash integration. |
| `UPSTASH_REDIS_REST_TOKEN` | **set** (secret) | optional | Or `KV_REST_API_TOKEN`. |
| `MATCHPULSE_STORAGE_PREFIX` | do not set (`matchpulse`) | `matchpulse-preview` if Redis is set | Keeps Preview data apart. |
| `MATCHPULSE_SITE_URL` | `https://<real-domain>` once the domain is connected | do not set | Origin only, no path. |
| `MATCHPULSE_ALLOW_INDEXING` | **do not set** until step 9 | **never** | Needs a real `https://` domain; ignored on Preview. |
| `MATCHPULSE_PREVIEW_LIVE_DATA` | – | do not set | Only to test real data on Preview (spends the shared 100/day quota). |

Not needed on Vercel: `MATCHPULSE_DATA_DIR`, `MATCHPULSE_STORAGE`,
`MATCHPULSE_CONTENT_DIR`, the Koora/translation variables (`MATCHPULSE_NEWS_*`,
`ANTHROPIC_API_KEY`). `MATCHPULSE_SITE_URL` and `MATCHPULSE_ALLOW_INDEXING` are
read at build time: redeploy after changing them. Vercel adds new variables to
all environments by default: untick Preview/Development where the table says
"do not set".

**Steps**

1. Locally: `npm ci && npm test && npm run build` (all must pass), and check
   `src/data/article-index.json` is up to date (`npm test` does this).
2. GitHub: create a **private** repository, then commit and push this project.
   `.gitignore` already excludes `.env*` (except `.env.example`), `.data/`,
   `.next/` and `.vercel`. Commit `content/news/`, `public/news-images/` and
   `src/data/article-index.json`.
3. Vercel → your project → Settings → Git: connect the repository. Build
   settings: Framework "Next.js", build command `npm run build` (default),
   Node.js 22.x or newer.
4. Upstash: create a free Redis database and add its REST URL and token to the
   project (Production; optionally Preview with the prefix above).
5. Add the variables from the table, per environment.
6. Push a branch (or open a pull request) to get a **Preview** deployment.
7. Verify the Preview (it is behind Vercel Authentication by default):
   - In a browser while logged in to Vercel: open `/news`, all 10 articles, an
     unknown `/news/x` (404 page), `/robots.txt` (`Disallow: /`) and
     `/sitemap.xml`.
   - From a terminal: Vercel → Settings → Deployment Protection → "Protection
     Bypass for Automation" → create a secret, then run
     `VERCEL_AUTOMATION_BYPASS_SECRET=<secret> npm run test:deployment -- https://<preview-url>`
     (checks every article page and image, `/news`, the home page, the 404,
     the sitemap and `robots.txt`; the secret is sent as a header, never printed).
8. Merge to the production branch. Run the same check against the production
   URL; robots must still say `Disallow: /`.
9. Go-live: connect the real domain, set `MATCHPULSE_SITE_URL`, redeploy,
   follow "Enable indexing" below, then set `MATCHPULSE_ALLOW_INDEXING=true`
   and redeploy. `npm run test:deployment -- https://<domain> --production`
   then expects `Allow: /` and indexable articles.

### 2. Environment variables (set on the host, never committed)

Set them in the host's secret settings or a root-owned env file (for example
`/etc/matchpulse.env` with mode 600), **before `npm run build`**: several are read at build time.

| Variable | Required | Value |
| --- | --- | --- |
| `API_FOOTBALL_KEY` | yes | Server-only key. Never use a `NEXT_PUBLIC_` prefix. |
| `MATCHPULSE_DATA_SOURCE` | yes | `api-football` |
| `MATCHPULSE_SITE_URL` | yes | Your real origin, e.g. `https://www.example.com` (no path). |
| `MATCHPULSE_DATA_DIR` | yes | Persistent folder, e.g. `/var/lib/matchpulse` (reports in `match-reports/`, fixture index file). |
| `MATCHPULSE_ALLOW_INDEXING` | at go-live only | `true` (see step 4). Leave unset on staging. Has no effect unless `MATCHPULSE_SITE_URL` is a real `https://` domain: localhost, IP addresses and placeholders such as `example.com` keep indexing off. |

### 3. Build and run

```bash
npm ci
npm audit --omit=dev     # production dependencies: must report 0 vulnerabilities
npm run lint && npx tsc --noEmit && npm test
npm run build            # makes no API-Football requests
npm run test:secrets     # no secrets in browser bundles or public files
npm start                # behind HTTPS (reverse proxy) on the real domain
```

Avoid frequent restarts: each one empties the in-memory cache (about 10
requests on the first visit). Re-run `npm run api:sync-assets` (about 9 requests) at the start of each season.

### 4. Enable indexing only when the domain is live

1. Deploy with `MATCHPULSE_SITE_URL` set and **without** `MATCHPULSE_ALLOW_INDEXING`.
2. Check `https://<domain>/robots.txt` shows `Disallow: /`.
3. When everything below checks out, set `MATCHPULSE_ALLOW_INDEXING=true`, rebuild and restart.
4. Then confirm:
   - `/robots.txt` shows `Allow: /` and `Sitemap: https://<domain>/sitemap.xml`.
   - `/sitemap.xml` lists only `https://<domain>/…` URLs (home, matches, leagues, 8 standings pages, players, news, every published `/news/<slug>` article, and reports once they exist).
   - View source on `/`, `/matches`, `/leagues/premier-league`: `<link rel="canonical" href="https://<domain>/…">` and `og:image` present, robots `index, follow`.
   - `/news` and published articles are indexable; unknown `/news/...` URLs return HTTP 404.
   - `npm run test:routes -- https://<domain>` passes (unknown IDs return HTTP 404). It loads a few API-backed pages, so run it once, not repeatedly.

### 5. Test match reports after deployment

1. Open `/matches`, pick a **finished** match from yesterday and open its page.
2. If its data is complete, a "MatchPulse Match Report" section appears and a file
   `<MATCHPULSE_DATA_DIR>/match-reports/<fixtureId>.json` is created.
3. The report is then listed on `/reports`, available at `/reports/<fixtureId>`, and shown on the homepage.
4. Matches still in play, or with goal events that don't match the score, get no report (by design).
5. Restart the server and check `/reports` still lists it (persistent disk working).

### 6. Monitor the API-Football quota

- Free plan: **100 requests/day, 10/minute**. The dashboard at dashboard.api-football.com shows daily usage.
- Server logs print `[api-football] … requests left today` when 10 or fewer remain, and `failed (rate_limited|quota_exhausted)` lines when limits are hit; pages then show a notice instead of stale or sample data.
- Typical usage: about 10 requests per cold start, about 80/day under steady traffic, plus 1 per opened match page and standings or player view (cached).
- `npm run api:check` (8 requests) verifies the key and coverage; don't run it routinely.

### Known dependency advisory (development only)

`npm audit` reports 5 high-severity entries that are one advisory,
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
(`braces` ≤ 3.0.3, denial of service via deeply nested brace patterns), reached only through
the lint tooling: `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob@3.3.1` →
`micromatch@4.0.8` → `braces@3.0.3`. No patched `braces` release exists (3.0.3 is the latest),
and npm's suggested fix downgrades `eslint-config-next` to 14 (incompatible with Next 16), so
it is not applied. These packages are devDependencies: `npm audit --omit=dev` reports 0
vulnerabilities and none of them is in the production server output or browser bundles.
Re-check when `@next/eslint-plugin-next` or `braces` publishes a fix.

### Club and competition logos (licensing)

Crests and competition logos are loaded from API-Football's media server
(`media.api-sports.io`, through Next's image optimiser). API-SPORTS supplies
them "solely for identification and descriptive purposes", claims no rights in
them and grants no licence: the clubs, leagues and federations own them, and
permission may be needed, especially for commercial use. Showing a crest next
to the team name in fixtures and tables (identification) is lower risk than
decorative use such as the club-crest strip in the header. Options before a
commercial launch: keep them and accept the risk, keep them only next to team
names, ask the rights holders, or replace them with neutral badges (initials
and colours). Nothing has been removed: removing them changes the look of the
header, match lists, standings and players pages.

### Remaining limitations

- **News**: Koora headlines as links only (no licence for images or summaries). English headlines are free machine translations: occasional awkward wording is possible, and a headline that fails the reliability checks stays in Arabic until a retry succeeds; extend the glossary for new names. The first refresh shows up to 8 stories, filling to 24 over the next refreshes. Changes to Koora's sitemap or page metadata would stop updates (the last good list is shown meanwhile). Legacy sample-news files (`src/data/news.ts`, `src/components/news/{NewsCard,NewsGrid,FeaturedNews,NewsArtwork}.tsx`) are unused and can be deleted.
- **Plan**: current-season standings and player statistics need a paid API-Football plan.
- **Logos and crests** come from API-Football; review its terms for logo use before launch.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
