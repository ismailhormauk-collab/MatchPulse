# MatchPulse articles

Original articles written for MatchPulse. Each Markdown file in this folder is
published at `/news/<file-name>` and listed in the News section, the homepage
and the sitemap. No code changes are needed to add one.

## Add an article

1. Copy `_template.md` to a new file named after the article's URL, using
   lowercase words joined by hyphens, e.g. `wydad-season-preview.md` →
   `/news/wydad-season-preview`.
2. Fill in the front matter and write the article below it.
3. Run `npm test` (it checks every file in this folder), then rebuild/restart
   (`npm run build && npm start`). In `npm run dev` new files appear on reload.

## Front matter

| Field         | Required | Notes |
|---------------|----------|-------|
| `title`       | yes      | Up to 160 characters. |
| `summary`     | yes      | One or two sentences, up to 300 characters (cards, search results). |
| `author`      | yes      | The writer's name. |
| `publishedAt` | yes      | e.g. `2026-10-23T09:00:00Z`. A future date schedules the article. |
| `updatedAt`   | no       | Set when the article is corrected or updated. |
| `category`    | no       | e.g. `Analysis`, `Transfers`, `Botola Pro`. |
| `image`       | no       | A file in `public/news-images/`, e.g. `/news-images/wydad.jpg`. |
| `imageAlt`    | with image | Describes the image for screen readers. |
| `imageCredit` | with image | Who owns or licensed the image, e.g. `Photo: Jane Smith / MatchPulse`. |
| `imageCreditShort` | no  | Compact credit shown on news cards: the photographer's required credit, e.g. `Jane Smith` (defaults to `imageCredit`). |
| `imageCaption` | no      | What the image shows, e.g. `Villa Park, Birmingham (file photo)`. |
| `imageLicense` | no      | Licence name, e.g. `CC BY-SA 4.0`. Required with `imageLicenseUrl`. |
| `imageLicenseUrl` | no   | https link to the licence. |
| `imageSourceUrl` | no    | https link to where the image comes from (e.g. its Wikimedia Commons page). |
| `draft`       | no       | `true` keeps the article unpublished. |

## Writing rules

- Only original writing. Do not copy, translate or paraphrase articles from
  Koora or other publishers without written permission.
- Facts must be real and checkable; link sources where useful.
- Only use images you own or have a licence for, and credit them.
- Markdown supported: paragraphs, `## Heading`, `### Subheading`, `- lists`,
  `1. numbered lists`, `> quotes`, `**bold**`, `*italic*` and
  `[links](https://…)` or internal links such as `[standings](/leagues/botola-pro)`.

Files starting with `_` (like the template) and this README are never published.
