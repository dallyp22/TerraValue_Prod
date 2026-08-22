# Railway decommission — Farmscope goes fully Cloudflare

**Date:** 2026-08-21

Production is Cloudflare end to end: **Pages (`terravalue`) → service binding →
Worker (`terravalue-api`) → Neon (`terravalue-db`)**, with all scheduled work
driven by the Worker's crons and Cloudflare Queues.

## Why Railway had to go

Railway was not a fallback. It was a **second writer against the same Neon
database**. `server/index.ts` started `automaticScraperService` and
`AuctionArchiverService` on boot, so both stacks scraped the same ~54 sources
and upserted the same `auctions` rows. That cost double Firecrawl spend, made
row attribution meaningless, and left two copies of the API to drift apart.

Nothing depended on it:

| Consumer | Status |
| --- | --- |
| `terravalue.pages.dev` | Calls the Worker via service binding. Never touched Railway. |
| `terra-value-prod.vercel.app` | Legacy shell. Its own `/api/*` already returns 404 — dead before this change. |
| Client code | Uses relative `/api/...` only. No Railway host is baked into any bundle. |

## The evidence that the queue path is ready

`scrape_source_runs`, 2026-08-04 → 2026-08-21 — ten consecutive runs, **all 54
sources reporting, zero failures**:

```
run_1787292027000   54 srcs  1366 discovered  437 queued  929 skipped_fresh  121 saved  0 failed
run_1787119227000   54 srcs  1331 discovered  467 queued  864 skipped_fresh  156 saved  0 failed
...
manual_1785847485991 54 srcs 1493 discovered  523 queued  970 skipped_fresh  160 saved  0 failed
```

Discovery attribution (`auctions.first_captured_by`, 2026-08-06 → 08-21, excluding
the 08-04/05 tagging backfill):

- **Days both stacks ran** (odd days): Cloudflare first-discovered **201**, Node **63**.
  Per run, Cloudflare finds ~3× more — its per-source URL cap is 250 vs Node's 60.
- **Days only Node ran** (even days): Node first-discovered **104**.

Those 104 are the only thing Node contributed, and they are a **cadence artifact,
not a coverage advantage** — the Worker's cron was `0 6 */2 * *`, which fires on
odd days of the month. Both stacks read the same `getSourceList()`. Making the
cron daily closes that gap entirely.

## Changes made

1. **`worker/wrangler.jsonc`** — `"0 6 */2 * *"` → `"0 6 * * *"`. Deployed
   (version `98e253be`); triggers confirmed as `0 9 * * *` and `0 6 * * *`.
   The `*/2` form was a trap twice over: it was a day-of-month *step*, so it
   fired on odd days only and silently skipped every even one.
2. **`worker/src/index.ts`** — cron matcher updated to the new string. A
   mismatch here is silent: the handler falls through to `console.warn` and no
   scrape is enqueued.
3. **`server/index.ts`** — background services removed. This process is now a
   local-dev convenience that serves requests and writes nothing on a schedule.
4. **`package.json`** — `build:server` and `start` deleted, so there is no
   longer a deployable Node artifact (`dist/index.js`) for Railway to run.
   `build` is now just `vite build`. Added `deploy:api` and `deploy:web`.

## Known wrinkle, self-resolving

Railway-written `auctions.updated_at` values are stamped **5 hours ahead of true
UTC** (CDT written as UTC) — `db_now` 01:02Z against a Node write at 06:02Z.
Freshness-skip and archiving both compare against this column. It stops
accumulating the moment Railway is off; existing rows age out.

## Manual step remaining

The Railway service must be deleted from the dashboard — the local CLI is not
authenticated (`railway whoami` → Unauthorized). Until then it keeps scraping
and writing.

Also worth deleting: the `terra-value-prod` Vercel project, which serves a
frontend whose API has been 404 for some time.

## Follow-on: Land Talk comps had no schedule either

Same failure mode, found while verifying the cutover. `land_sales_comps` — read
by `valuation`, `comparables`, `marketData` and `landComps` — was last written
on 2026-06-04 by a manual backfill. Nothing scheduled it, and nothing errored;
valuations simply read comps that stopped at 2026-05.

- Ingested June 2026 (64 sales) and July 2026 (49).
- Recovered 2022-05, 2022-07 and 2022-11, which had sat at `status='failed'`
  with 0 sales since the backfill — 279 more comps.
- Coverage is now **3,719 comps across all 55 months, 2022-01 → 2026-07, no gaps.**
- New `server/services/landTalkIngest.ts` + cron `0 12 4,8,12 * *`.

The ingest keys "already held" on **month**, not URL. The existing script diffs
`land_talk_pdfs.url`, and Iowa Appraisal re-uploads older newsletters under
changed filenames, so it reported 36 PDFs as unparsed when 2 months were
actually missing. On a schedule that would have meant ~34 needless Firecrawl
scrapes and LLM extractions every run. A "failed" row with 0 sales also does not
count as held, which is what let the three 2022 months stay invisible.

## Still open (unrelated to the cutover)

- `server/routes.ts` (2,874 lines) is a second, unfixed copy of the API — still
  carries the 200-row `/api/auctions` cap that hid 683 upcoming auctions. The
  Worker's `routes/api.ts` is a strict superset of it (84 routes vs 74; the two
  "missing" tile routes are the same handlers, which strip `.mvt` themselves).
  Nothing in production reads it. It should be deleted along with
  `server/index.ts`, `server/vite.ts`, and `server/warmup.ts`.
- A single 06:00 UTC scrape means a listing posted mid-morning is found the next
  day. A second daily cron would close that; discovery is ~54 Firecrawl map
  calls, and the freshness skip already suppresses ~68% of detail fetches.
