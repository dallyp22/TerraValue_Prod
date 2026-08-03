# Scrape Architecture Plan — making 100+ sources viable, and "are we missing anything" answerable

> Architecture proposal, 2026-08-03. **No code was changed.**
> Companion documents:
> - `docs/scrape-gap-diagnosis.md` (fs-scraper-diag) — why *individual listings* die inside
>   the pipeline (the `sold` substring bug, the archiver's `estate auction` heuristic, the
>   200-row map window). That document owns per-listing correctness; this one does not repeat it.
> - The new-source shortlist (fs-sources) — *which* sources to onboard. This document owns the
>   machinery that makes onboarding them cheap; it does not pick them.
> - Prior research: `~/Downloads/Kimi_Agent_Iowa Land Auction Sites & Capture (1)/research/`
>   (`iowa-auctions_insight.md`, `iowa-auctions_dim11.md`, `iowa-auction-sources-master.md`).
>
> Everything asserted here is either read from source, measured against the production Neon DB
> (`terravalue-db`), or pulled from Cloudflare production telemetry (Workers Observability +
> GraphQL analytics API, account `NewStack AI` / `74441f2451ab88fb62f7a2dba1347837`).
> Anything I could not verify is labelled **UNVERIFIED**.

---

## 0. TL;DR

1. **The Cloudflare Worker cron is running the scrape and it dies after ~2 of 51 sources with
   `Too many subrequests by single Worker invocation`.** This is not a theoretical limit
   concern — it is happening in production right now, ~5–6 times a day, and it is silent
   because every exception in the scrape path is caught and logged rather than surfaced.
   Worker runs save **~10 auctions**. A Node run of the same code saves **~1,290**.
   This is a ~99% top-of-funnel loss and is, in my judgement, the primary systemic cause of
   "clients report missing auctions" alongside the map-window bug in the sibling report.
2. **A second, long-running Node scraper also exists** (`server/index.ts` →
   `automaticScraperService.start()`, the process commit `b19901e` was fixing for Railway).
   Two schedulers share one `scraper_settings` row and race. The Node one is the only one that
   actually works, and it is the one nobody has been treating as production.
3. **Recommendation: Cloudflare Queues + a consumer Worker.** Cron becomes a *producer* only.
   One queue message per unit of work (one source's discovery, or one detail page batch), so
   each unit gets its own subrequest and CPU budget, with built-in retry, DLQ, and concurrency
   control. Retire the Railway Node scraper once this lands so there is exactly one runtime.
4. **Cost: today we spend ~178 Firecrawl credits per newly-captured auction** because we
   re-run LLM JSON extraction on ~1,363 detail pages every single day, almost all of which are
   unchanged. Cheapest-first routing plus new-URL-only detail scraping gets 120 sources to
   roughly **one-tenth of today's spend** — more sources for less money.
5. **Dedupe: split observations from events, but do not rename `auctions`.** Grow the existing
   table into the observation table in place and add `auction_events` above it. Measured
   cross-source duplication today is low (6 clusters), so this is pre-work for the aggregator
   onboarding, not an emergency — but it must land *before* HiBid/LandHub/Land And Farm.
6. **Highest-leverage single change:** get the scrape off the Worker's per-invocation budget.

---

## 1. Runtime constraint analysis

### 1.1 What actually runs the scrape in production today

Two things do, and they fight.

**Path A — Cloudflare Worker cron.** `worker/wrangler.jsonc` registers `triggers.crons`
`["0 9 * * *", "0 * * * *"]`. `worker/src/index.ts:57-59` handles the hourly cron by calling
`ctx.waitUntil(automaticScraperService.checkAndRun())`. That import chain
(`automaticScraper` → `auctionScraper` → `firecrawl`) pulls the entire 51-source sequential
crawler into the Worker bundle.

Confirmed live via the Cloudflare API:

```
$ curl .../accounts/$ACC/workers/scripts/terravalue-api/schedules
{"schedules":[{"cron":"0 * * * *","modified_on":"2026-06-07T22:31:19Z"},
              {"cron":"0 9 * * *","modified_on":"2026-06-07T22:31:19Z"}]}
```

**Path B — a long-running Node process.** `server/index.ts:127` calls
`automaticScraperService.start()`, which installs an hourly `setInterval` inside an Express
process. `AutomaticScraperService.checkAndRun` is the same method the Worker cron calls.
Commit `b19901e` ("Railway runs the default npm run build + npm start … dist/index.js was
never produced, so today's push crash-looped the Railway service") confirms this process is
deployed, not vestigial.

Evidence that Path B is still running and is the one doing real work:

- `scraper_settings.next_run` is `2026-08-04T05:00:00.000Z`. `calculateNextRun`
  (`automaticScraper.ts:116-136`) does `next.setHours(hours, minutes, 0, 0)` with
  `scheduleTime = '00:00'`. `05:00Z` is midnight **America/Chicago**. A Cloudflare Worker
  runs in UTC and would have written `00:00Z`. So a Central-timezone Node process wrote it.
- `scraper_settings.updated_at = 2026-08-03T17:15:07Z` — 75 minutes after
  `last_run = 2026-08-03T16:00:21.890Z`. A 75-minute run cannot happen inside a Worker.
- 684 rows have `scraped_at` on 2026-08-03 and 1,217 rows have `updated_at` on 2026-08-03 —
  full-run volume. The Worker runs save ~10 each.
- The repo's local `logs/scraper-diagnostics.jsonl` was **not** written today (last write
  2026-07-31 03:09), so this was not a laptop run — `scraperDiagnostics.ts:16` writes whenever
  a real filesystem exists, which a Railway container has and a Worker does not.

**UNVERIFIED:** I did not have Railway credentials and there is no `railway.json` / `Procfile` /
`Dockerfile` in the repo, so I cannot name the host with certainty. The evidence above narrows
it to "a Node process, in US Central time, with a writable filesystem, running this code." That
is Railway or an equivalent. **Confirm this before deleting anything.**

### 1.2 Hard limits (Cloudflare, verified against developers.cloudflare.com/workers/platform/limits)

| Limit | Free | Paid | Applies how |
|---|---|---|---|
| CPU time, HTTP request | 10 ms | 5 min max, **default 30 s** | configurable via `limits.cpu_ms` |
| CPU time, Cron Trigger | 10 ms | **30 s** (< 1 h interval) / **15 min** (≥ 1 h interval) | our `0 * * * *` is exactly a 1-hour interval |
| Duration (wall clock), Cron Trigger | — | **15 min** | hard ceiling on the whole invocation, `waitUntil` included |
| Duration, HTTP-triggered | "no hard limit on duration" | same | not our case |
| Subrequests / invocation | **50** | docs table says **10,000 (up to 10M)**, configurable | *see below — observed behaviour differs* |
| Simultaneous open connections | 6 | 6 | per invocation, waiting on response headers |
| Memory | 128 MB | 128 MB | per isolate |

Against those limits, a full sequential 51-source Firecrawl crawl measured from
`logs/scraper-diagnostics.jsonl`:

| Run | Sources | Wall clock | Detail scrapes | Saved |
|---|---|---|---|---|
| `scrape_1780851027496` (2026-06-07) | 51 | **57.2 min** | 216 | 155 |
| `scrape_1785472970958` (2026-07-31) | 51 | **205.9 min** | 1,363 | 1,290 |

The July run is 3.4 hours — **13.7×** the 15-minute cron duration ceiling. The slowest single
source (Land.com) took 14.9 minutes on its own. At 120 sources this becomes an ~8-hour job.
There is no configuration that makes this fit a cron invocation.

### 1.3 Evidence the production runs are being cut off — this is worse than truncation

Cloudflare Workers Observability, `terravalue-api`, last 26 hours:

```
"🚀 Scheduled scrape triggered"   → 00:00:21Z, 02:00:21Z, 04:00:24Z, 06:00:25Z, 11:00:21Z  (5×/day)
"   Starting auction scrape..."   → 00:00:22Z, 02:00:22Z, 04:00:26Z, 06:00:27Z, 11:00:23Z
"🎉 Total auctions scraped: N"    → 10, 11, 10, 11, 10
"❌ Scheduled scrape failed:  at execute (index.js:4499) at async NeonHttpPreparedQuery.execute"
```

and the mechanism:

```
"  ⚠️  Map failed: Too many subrequests by single Worker invocation."          × 100 (query cap)
"Scrape Listing URLs Error: Too many subrequests by single Worker invocation."  × 100 (query cap)
"  ✓ Extraction added 0 URLs"                                                  × 98 of 100
"✅ Total URLs discovered: …"                                                   only 7 events across 5 runs
```

Read together this says:

1. The cron **does** start the full scrape and **does** iterate all 51 sources — the
   `Scraping <source>...` lines for all 51 appear, all flushed at the same teardown timestamp.
2. It exhausts the per-invocation subrequest budget inside the **first one or two sources**
   (a single source can issue 1 map + 1 listing-extract + up to 60 detail scrapes + 2 geocode
   calls per save + 1 DB write per save ≈ 240 subrequests).
3. Every source after that fails instantly. `Map failed` and `Scrape Listing URLs Error` are
   both swallowed (`auctionScraper.ts:314`, `firecrawl.ts:221`), the source logs
   `❌ No auction URLs found`, and the loop marches on. **Nothing throws. Nothing alerts.**
4. The run "completes" with ~10 auctions and the loop's exit path then tries the final
   `updateSettings({ nextRun })` DB write — which is *also* a subrequest, also over budget, and
   throws. That is the `NeonHttpPreparedQuery.execute` stack in `❌ Scheduled scrape failed`.
5. Because `nextRun` therefore never advances, the hourly cron re-fires the whole thing as soon
   as the 2-hour `lastRun` guard (`automaticScraper.ts:66-70`) expires — **every 2 hours,
   forever**, each time burning Firecrawl credits on the first two sources and re-stamping
   `lastRun` in a way that can suppress the Node process's own scheduled run.

Corroborating: the 30-day `workersInvocationsAdaptive` rollup shows `status: success` on 3,048
requests with **zero** `errors` and no `exceededCpu`/`scriptThrewException` bucket. From every
dashboard Cloudflare offers, this Worker looks perfectly healthy while capturing 0.8% of the
auctions it is supposed to.

Two secondary silent losses in the same path:

- `enrichmentQueue.startProcessing()` (`auctionScraper.ts:216`) is fire-and-forget, not
  `waitUntil`-wrapped. In a Worker the invocation ends and enrichment is dropped on the floor.
- `enrichmentQueue.setPool()` is never called on the Worker path, so legal-description
  geocoding (`enrichmentQueue.ts:101`) can never run there.

Note the docs table lists 10,000 subrequests on Paid, but the observed failure after ~2 sources
is consistent with a **1,000** ceiling. I did not attempt to change the limit to confirm. It
does not matter for the recommendation: raising `limits.subrequests` cannot defeat the 15-minute
cron duration ceiling against a 206-minute job.

### 1.4 Options

| Option | Fits 120 sources? | Retries/DLQ | Ops surface | Verdict |
|---|---|---|---|---|
| **A. Keep the Node worker (Railway), delete the Worker cron scrape** | Yes (it already does the work) | No — one failure kills a source silently | Two platforms, two deploy paths, `server/` and `worker/` drift | **Do this today as the stop-gap.** Not the destination. |
| **B. Cloudflare Queues + consumer Worker** | Yes — work is split into messages, each with its own subrequest/CPU/duration budget | Built in (`max_retries`, dead-letter queue) | One platform; wrangler-native | **Recommended.** |
| **C. Durable Object + alarms** | Partly — a DO invocation has the *same* per-invocation limits; it solves scheduling, not fan-out | Manual | Highest complexity | Good later as the *scheduler*, wrong as the fetcher. |
| **D. Cloudflare Workflows** | Yes for per-event durable lifecycle; each step still runs under Worker limits | Built in | Moderate | Right tool for the **per-auction lifecycle** state machine (§5), not for the bulk fan-out. |
| **E. Raise `limits.subrequests` / `limits.cpu_ms` and keep the monolith** | **No** — 15-min cron duration ceiling vs a 206-min job | No | Trivial | Rejected. Would convert a visible-in-logs failure into a mid-run cutoff, which is worse. |

### 1.5 Recommendation

**Cloudflare Queues, with the cron demoted to a producer.**

```
cron "*/15 * * * *"  →  producer Worker
                         └─ SELECT source_id FROM sources WHERE next_check_at <= now()
                            ORDER BY priority LIMIT N
                         └─ queue.sendBatch([{ type:'discover', source_id }, ...])
                                     │
                    ┌────────────────┴──────────────────┐
                    ▼                                   ▼
        queue: fs-discovery                   queue: fs-detail
        consumer: 1 message = 1 source        consumer: 1 message = ≤10 detail URLs
        → route (§2) → list of URLs           → route (§2) → extract → upsert observation
        → diff vs listing_observations        → enqueue enrichment message
        → enqueue ONLY new/changed URLs       → update next_check_at
                                     │
                                     ▼
                          queue: fs-enrich (OpenAI + geocode + CSR2)
                          DLQ: fs-dead → surfaced in the scorecard (§4)
```

Why this and not the others:

- **The budget problem disappears by construction.** One source's discovery is ~2–5
  subrequests. A 10-URL detail batch is ~40. Both are two orders of magnitude inside the
  per-invocation ceiling, and each finishes in seconds, nowhere near 15 minutes.
- **Failure stops being silent.** A message that throws is retried, then dead-lettered. A
  dead-letter count is a number you can alert on (§4). Today's `catch { console.log }` pattern
  is invisible; a DLQ is not.
- **Concurrency becomes a dial, not an accident.** `max_concurrency` on the consumer replaces
  the current for-loop and directly controls Firecrawl rate-limit pressure and Neon load.
- **One platform.** Retire `server/index.ts`'s scheduler, keep Express only for local dev.
  Eliminates the two-scheduler race on `scraper_settings` outright.
- **Ordering is irrelevant here.** Sources are independent; there is nothing to serialize.

Migration risk is low because the refactor Queues forces — "one source, one unit of work,
declared capture method, persisted next-check time" — is the *same* refactor that §2 (routing),
§4 (per-source scorecard) and §5 (lifecycle cadence) all require. It is not extra work; it is
the shared prerequisite.

**Sequencing:**

| Step | Change | Risk |
|---|---|---|
| 0 (today) | Delete the scraper branch from `handleScheduled` (`worker/src/index.ts:57-59`); keep the 09:00 archiver cron. Verify the Node process is alive and owns the schedule. | ~3 lines. Immediately stops 5 wasted partial runs/day and the `nextRun` corruption. |
| 1 | `sources` table (§2.1) — the 51 hard-coded entries become rows with `capture_method`, `authority_class`, `next_check_at`. | Additive DDL. |
| 2 | Queues: `fs-discovery` + `fs-detail` + DLQ; consumer Worker; cron becomes producer. Run **in parallel** with Node for one week, writing to the same tables (the URL upsert is idempotent). | Compare per-source yield between the two before cutting over. |
| 3 | Cut over; remove `automaticScraperService.start()` from `server/index.ts`; decommission the Node scraper. | One runtime. |

---

## 2. Cost and cheapest-first routing

### 2.1 How a source declares its capture method

Today the 51 sources are a hard-coded array of `{ name, url, searchPath }`
(`auctionScraper.ts:77-137`) and every one of them goes through Firecrawl. Replace with a
`sources` table (DDL in §3.4) whose relevant columns are:

```
capture_method   TEXT   -- 'json_api' | 'sitemap' | 'html' | 'firecrawl_scrape' | 'firecrawl_stealth'
capture_config   JSONB  -- { endpoint, page_param, json_path, selector, wait_for, ... }
platform_family  TEXT   -- 'bidwrangler' | 'hibid' | 'nextlot' | 'wp_rest' | 'own_site' | ...
authority_class  TEXT   -- AUCTIONEER_OWNED | PLATFORM_STOREFRONT | MARKETPLACE | AGGREGATOR | DIRECTORY
fallback_ladder  TEXT[] -- ordered; default derived from capture_method
```

The router is a small dispatcher in the discovery consumer:

```
tier 0  json_api          fetch() → JSON.parse            0 credits   (BidWrangler /api/auctions,
                                                                       LandHub __NEXT_DATA__, WP REST)
tier 1  sitemap | html    fetch() → parse/regex           0 credits   (sitemap.xml, SSR listing grids)
tier 2  firecrawl_scrape  Firecrawl /scrape               1 credit    (JS-rendered, no anti-bot)
tier 3  firecrawl_stealth Firecrawl /scrape + proxy       ~5 credits  (Cloudflare/Akamai/Sucuri)
```

**Fallback and demotion rules** (these matter more than the ladder itself):

- Move **down** the ladder (cheap → expensive) only on a *typed* failure: HTTP 403/429/503, a
  Cloudflare/Akamai challenge fingerprint, or a parse that yields zero candidate URLs when the
  trailing-20-run mean for that source is > 0. Never fall back on a network timeout — retry the
  same tier once, then dead-letter.
- Record the tier that succeeded in `scrape_runs.capture_tier_used`. If a source succeeds at a
  cheaper tier 3 runs in a row, **promote** its `capture_method` permanently. Cheapest-first is
  only cheap if the ladder ratchets.
- Cap the ladder per run. A source may consume tier 3 at most once per 24 h; beyond that it is
  marked `degraded` and reported, not silently retried at 5 credits a pop.
- Tier 0 and 1 run on the Worker's own `fetch()`. They cost zero Firecrawl credits and, being
  ~1 subrequest each, are also the cheapest thing in the queue budget.

**The unit that actually needs measuring is credits per *new* auction captured**, not credits
per request. Add to `scrape_runs`: `credits_spent`, `urls_seen`, `urls_new`, `observations_written`,
`events_created`. `credits_spent / events_created` is the number that decides whether a source
stays.

### 2.2 The real cost problem is re-scraping unchanged pages

From the 2026-07-31 run: **1,363 detail-page LLM extractions** to produce ~1,290 upserts, of
which the overwhelming majority were re-writes of listings we already had. Steady-state genuinely
new rows are 20–70/day (`scraped_at` by day: 67, 57, 55, 21, 29, 19, 26, 14, 15…). We are paying
full LLM-extraction price, daily, on ~1,300 pages that did not change.

The fix is not a cheaper model — it is **not fetching them at all**:

- `content_hash` on the observation (xxhash of the normalized extracted payload). Unchanged
  hash → bump `last_seen`, skip everything downstream.
- Detail-scrape **only URLs not already in `listing_observations`**, plus the lifecycle-driven
  re-polls in §5 (T−7→T, and results at T+1/3/7/14). That alone removes ~90% of tier-2/3 calls.
- Conditional GET (`If-Modified-Since` / `ETag`) on tier 0/1 sources; BidWrangler's
  `updated_at` field gives free change detection without even a hash.

### 2.3 Credit and spend estimates

Verified Firecrawl base rates (firecrawl.dev/pricing): scrape 1/page, map 1/page,
search 2/10 results. The page states "Advanced features (JSON format, Enhanced Mode, etc.) cost
additional credits" **without publishing the multiplier** — I could not verify it, so both
figures below are shown. **UNVERIFIED: the JSON-format surcharge.** Ask Firecrawl or read one
month of actual usage off the dashboard before committing to a plan tier.

Per full run today (measured 2026-07-31): 51 `map` + 51 `scrapeListingUrls` (JSON format,
`waitFor: 4000`) + 1,363 `scrapeWithJson` (JSON format, `waitFor: 2500`) + ~3 `search`.

| | credits/run | ×30 runs/mo | Plan needed |
|---|---|---|---|
| **51 sources today**, JSON = 1 credit | ~1,468 | ~44,000 | Standard (100k, $83/mo yearly) |
| **51 sources today**, JSON = 5 credits | ~7,121 | ~213,600 | Growth (500k, $333/mo yearly) |
| **120 sources**, same architecture, JSON = 1 | ~3,450 | ~103,500 | Growth |
| **120 sources**, same architecture, JSON = 5 | ~16,700 | ~501,000 | Scale (1M, $599/mo yearly) |
| **120 sources**, routed + diffed, JSON = 1 | ~270 | ~8,100 | Hobby / Standard |
| **120 sources**, routed + diffed, JSON = 5 | ~870 | ~26,100 | Standard |

Routed + diffed assumptions, stated so they can be argued with: ~40% of 120 sources reachable at
tier 0/1 (the research live-probed BidWrangler's open JSON API, LandHub's `__NEXT_DATA__`, and
found 8 of the existing 51 are WP REST); ~10% need tier 3; discovery is one page-op per source
per sweep; detail extraction runs on ~100 genuinely-new URLs/day in peak season plus ~90
lifecycle re-polls.

**Credits per new auction captured: ~178 today (at JSON = 5) → ~9 proposed.** That ratio, not
the absolute plan tier, is the argument. It is also the number that makes 120 sources a *cheaper*
system than 51, which is the counter-intuitive result worth stating plainly to Dallas.

---

## 3. Dedupe / entity resolution

### 3.1 What the data actually shows (measure before building)

The research (`iowa-auctions_dim11.md` §2, `insight.md` §4) calls dedupe "existential" and
proposes a four-layer matcher. I agree with the design and disagree with the urgency ordering.
Measured against production right now:

```
active auctions                                            1,933
  with county                                              1,933
  with acreage                                             1,932
  with auction_date                                          838   ← 57% have NO date
  blockable on county+date+acreage                           838

duplicate clusters on (county, date, round(acreage))          47
  rows inside those clusters                                 121
  redundant rows                                              74
  clusters spanning ≥2 distinct sources                        6
```

So today's *cross-source* duplication is 6 clusters / 13 rows. The single largest cluster
(Dallas County, 2026-08-04, 8 rows, Daugherty + Sullivan) has `acreage → 0`, i.e. it is a
blocking artefact of missing acreage, not a real 8-way repost.

Two honest conclusions:

1. **Dedupe is not currently the thing hurting Todd.** The 51 sources are almost all
   AUCTIONEER_OWNED with little mutual overlap. The research's 3–5× duplication is a forecast of
   what happens when HiBid's Iowa hub, LandHub, Land And Farm, and Ranch & Farm Auctions come
   online — all of which are aggregators/mirrors by construction. Build it **before** those land,
   not after, but do not let it block §1.
2. **The bigger data-quality problem is that 57% of active auctions have no date at all**
   (1,095 rows, all flagged `needsDateReview`). That guts the strongest blocking key before the
   matcher even starts, and it independently breaks the lifecycle scheduling in §5. Fixing date
   extraction is a prerequisite for good entity resolution, not a separate track.

### 3.2 Schema: evolve `auctions` in place, do **not** rename it

The research proposes renaming `auctions` → `listing_observations` with a compatibility view.
I recommend against the rename. `auctions` is read directly by the Worker API in ~20 places
(`worker/src/routes/api.ts`), by the map tile route, by the archiver, by the enrichment queue,
and by a dozen `scripts/*.ts`. A rename-plus-view swaps a small conceptual win for a large blast
radius on a system that is already mis-delivering.

Instead: **`auctions` *is* the observation table** — it already has `url UNIQUE`, `raw_data`,
`source_website`, `scraped_at`. Grow it, and add `auction_events` above it.

```
auctions            (observation: one row per source-sighting)   ← unchanged name, +8 columns
   └── event_id ──▶ auction_events   (canonical: one row per physical sale)  ← new
                       └── primary_observation_id
match_audit         (every scored pair + features + disposition)  ← new
sources             (100+ rows, capture + authority + cadence)    ← new
scrape_runs         (per-source-per-run instrumentation)          ← new
```

The map UI cuts over one endpoint at a time from `auctions` to `auction_events`. Until an
endpoint is cut over it keeps working untouched, because nothing about the existing columns
changes.

I would **defer** `auction_tracts` and `title_embedding`/pgvector to a later phase. Multi-tract
reconciliation matters, but it is a refinement on top of a working matcher, and pgvector is a
recall booster for the gray zone — neither is on the critical path to "stop losing auctions."

### 3.3 Matching layers

Layer 0 and 1 are cheap SQL and catch nearly everything at our scale. Layers 2–3 are the
insurance policy for the aggregator era.

**Layer 0 — deterministic.** `canonicalizeUrl()` exactly as in `dim11.md` §2.2 (force https,
lowercase host, strip `www.`, drop fragment, drop `utm_*|fbclid|gclid|mc_cid|mc_eid|ref|source`,
sort surviving params, single trailing-slash rule) plus platform-ID extraction into
`(platform, platform_object_id)` with a partial unique index. HiBid lot IDs, BigIron lot +
`provider`, placebids auction IDs, DreamDirt `/auction/{id}/`, and the Land.com-network internal
listing IDs are all deterministic within a platform. Free, exact, no fuzzy work.

**Layer 1 — blocking.** Given that 57% of rows lack a date, blocking must not depend on it:

| Key | Definition | Tolerance | Covers |
|---|---|---|---|
| B1 | `county` + `auction_date::date` | ±2 days | the strongest key when dates exist (838 rows today) |
| B2 | `county` + acreage bucket `round(acreage/20)*20` | — | **the date-less majority**; also LandWatch, which routinely omits dates |
| B3 | normalized `auctioneer` + `auction_date::date` | ±2 days | rows where county extraction failed |
| B4 | PostGIS `ST_DWithin(geo, geo, 1609)` | 1 mile | both rows geocoded — **gate on `geocoding_method`**, since county-centroid rows (`iowaCountyCentroids.ts`) would otherwise block every listing in a county against every other |
| B5 | `legal_description_parsed` Twp/Rng/Sec exact | — | only 143 rows carry it today, but it is decisive when present — and `auctionEnrichment.ts` already extracts it |

B5 is the one I would add beyond the research's list. A Township/Range/Section triple is a legal
identity for the land itself, independent of who is advertising it. It is the only key that
survives an aggregator rewriting the title, dropping the date, and re-rounding the acreage.

**Layer 2 — weighted scoring.** Take `dim11.md` §2.4's weight table as-is; it is well-calibrated
for this domain. Two amendments from what the data shows:

- Add `acreage IS NULL OR acreage = 0` → **skip the acreage terms entirely** rather than scoring
  them as agreement. The Dallas County 8-row artefact above is exactly this bug waiting to happen.
- Add `legal_description Twp/Rng/Sec exact` at **+6** (rarer and more discriminating than an
  address in rural Iowa) and `Twp/Rng/Sec disagree` at **−6**.

Thresholds `≥9 AUTO_MERGE`, `6–9 REVIEW`, `<6 DISTINCT`, with every scored pair written to
`match_audit` (features, score, disposition, matcher_version) so the thresholds are tunable from
data. `pg_trgm` is already enabled — `migrations/0004_enable_pg_trgm.sql` — so `similarity()` on
normalized titles is available today at no setup cost.

**Layer 3 — LLM adjudication**, gray zone only, batched. We already pay for OpenAI in the
enrichment path. A handful of calls per run.

**Clustering** — union-find over accepted pairs; each connected component is one
`auction_events` row. Golden-record merge by `authority_class` precedence
(AUCTIONEER_OWNED > PLATFORM_STOREFRONT > MARKETPLACE > AGGREGATOR), field by field, never
letting a null overwrite a non-null and never letting an aggregator overwrite the
auctioneer-of-record on `auction_date`, `sale_method`, or terms. Alert on any cluster with > 6
observations — that is the over-merge signature.

### 3.4 Migration path — targeted DDL only

**`npm run db:push` must never be run on this repo.** `drizzle-kit push` diffs against
`shared/schema.ts`, which does not describe the PostGIS/soil layer, and will drop it. Every
change below is a hand-written numbered file in `migrations/`, applied with `psql`, matching the
existing convention (`0001_…`, `0004_…`, `0005_…`, `0028_…`). Drizzle's `shared/schema.ts` is
updated afterwards to *describe* the result, never to generate it.

```sql
-- migrations/0029_sources_table.sql
CREATE TABLE sources (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  base_url         TEXT NOT NULL,
  discovery_path   TEXT,
  results_path     TEXT,
  platform_family  TEXT,
  authority_class  TEXT NOT NULL DEFAULT 'AUCTIONEER_OWNED',
  capture_method   TEXT NOT NULL DEFAULT 'firecrawl_scrape',
  capture_config   JSONB DEFAULT '{}'::jsonb,
  cadence_tier     INT  NOT NULL DEFAULT 2,
  status           TEXT NOT NULL DEFAULT 'active',  -- candidate|probation|active|degraded|dormant
  next_check_at    TIMESTAMPTZ DEFAULT now(),
  last_success_at  TIMESTAMPTZ,
  consecutive_failures INT DEFAULT 0,
  expected_weekly_yield REAL,            -- for the zero-yield alert (§4)
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (base_url, discovery_path)
);
-- seed: one INSERT per entry in auctionScraper.ts:77-137, preserving `name` exactly
--       so existing auctions.source_website joins cleanly.

-- migrations/0030_observation_columns.sql   (additive only — no rewrite of existing rows)
ALTER TABLE auctions
  ADD COLUMN canonical_url      TEXT,
  ADD COLUMN platform           TEXT,
  ADD COLUMN platform_object_id TEXT,
  ADD COLUMN content_hash       TEXT,
  ADD COLUMN source_id          INT REFERENCES sources(id),
  ADD COLUMN event_id           INT,           -- FK added in 0031
  ADD COLUMN first_seen         TIMESTAMPTZ,
  ADD COLUMN last_seen          TIMESTAMPTZ;
UPDATE auctions SET first_seen = scraped_at, last_seen = updated_at;  -- backfill, batched
CREATE UNIQUE INDEX CONCURRENTLY auctions_canonical_url_key
  ON auctions (canonical_url) WHERE canonical_url IS NOT NULL;
CREATE UNIQUE INDEX CONCURRENTLY auctions_platform_object_key
  ON auctions (platform, platform_object_id) WHERE platform_object_id IS NOT NULL;
CREATE INDEX CONCURRENTLY auctions_block_b1 ON auctions (county, (auction_date::date));
CREATE INDEX CONCURRENTLY auctions_block_b2 ON auctions (county, ((round(acreage::numeric/20)*20)));
CREATE INDEX CONCURRENTLY auctions_event_id ON auctions (event_id);

-- migrations/0031_auction_events.sql
CREATE TABLE auction_events (
  id SERIAL PRIMARY KEY,
  primary_observation_id INT REFERENCES auctions(id),
  listing_type   TEXT DEFAULT 'auction',   -- auction|sealed_bid|listing_for_sale
  title TEXT, normalized_title TEXT, description TEXT,
  auction_date TIMESTAMPTZ, event_end_date TIMESTAMPTZ, sale_method TEXT,
  auctioneer TEXT, auctioneer_source_id INT REFERENCES sources(id),
  address TEXT, county TEXT, state TEXT DEFAULT 'Iowa',
  legal_description TEXT, legal_description_parsed JSONB,
  acreage REAL, acreage_source_text TEXT, land_type TEXT,
  latitude REAL, longitude REAL, geocode_precision TEXT,
  csr2_mean REAL, csr2_min INT, csr2_max INT, estimated_value REAL,
  property_category TEXT,
  lifecycle_status TEXT DEFAULT 'announced',
  next_check_at TIMESTAMPTZ,
  observation_count INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE auctions ADD CONSTRAINT auctions_event_fk
  FOREIGN KEY (event_id) REFERENCES auction_events(id);
CREATE INDEX ON auction_events USING GIN (normalized_title gin_trgm_ops);
CREATE INDEX ON auction_events (next_check_at) WHERE lifecycle_status <> 'archived';
CREATE INDEX ON auction_events (auction_date) WHERE lifecycle_status <> 'archived';

-- migrations/0032_match_audit_and_runs.sql
CREATE TABLE match_audit (
  id BIGSERIAL PRIMARY KEY,
  obs_a INT, obs_b INT, features JSONB, score REAL,
  disposition TEXT, decided_by TEXT, matcher_version TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE scrape_runs (
  id BIGSERIAL PRIMARY KEY,
  source_id INT REFERENCES sources(id),
  started_at TIMESTAMPTZ DEFAULT now(), finished_at TIMESTAMPTZ,
  capture_tier_used TEXT, credits_spent INT,
  urls_seen INT, urls_new INT, observations_written INT, events_created INT,
  completeness_score REAL, error TEXT
);
CREATE INDEX ON scrape_runs (source_id, started_at DESC);
```

Backfill order (each step idempotent and independently re-runnable, as a `scripts/*.mts`
one-shot, never as part of a deploy):

1. `canonical_url` + `platform`/`platform_object_id` for all ~2,100 active + archived rows.
2. `source_id` by joining `source_website` → `sources.name`.
3. Run the matcher once over history in **dry-run**, writing only `match_audit`. Inspect the
   AUTO_MERGE pairs by hand — at 47 candidate clusters this is a 20-minute review.
4. Create `auction_events` for every cluster and every singleton; set `event_id`.
5. Cut the map endpoint over to `auction_events`; leave everything else on `auctions`.

The dry-run in step 3 is the important one. A false merge on a map UI is much worse than a false
split — it makes an auction *disappear*, which is precisely the complaint we are trying to fix.

---

## 4. Coverage measurement

Today the only coverage instrument is `scraperDiagnostics.ts`, which writes JSONL to a local
filesystem — a filesystem that does not exist in the Worker (`HAS_FS` is false, so every method
returns early) and is ephemeral on Railway. `detectAnomalies()` is real and reasonable logic that
is compared against `getHistoricalStats()`, which on any deployed host returns `[]`. **The anomaly
detector cannot fire in production.** That is why a 99% capture loss ran for weeks unnoticed.

Everything below moves that instrumentation into Postgres, where both runtimes can write it and
anyone can query it.

### 4.1 Per-source scorecard (from `scrape_runs`, daily rollup)

| Metric | Definition | Alert |
|---|---|---|
| Yield | `urls_new` per run, trailing 20 runs | — |
| **Zero-yield** | 0 URLs found on a source whose trailing-20 mean > 0, **2 consecutive runs** | page |
| Yield collapse | run yield < 50% of trailing-20 mean | warn |
| Completeness | `Σ wf · (non_empty_f / rows)`; weights: date .25, county .15, acreage .15, lat/lon .15, title .10, address/legal .10, auctioneer .05, land_type .05 | > 15pt below trailing-30d mean → warn |
| Success rate 30d | runs without error / runs | < 80% → warn |
| Cost efficiency | `credits_spent / events_created` | > 3× portfolio median → review for re-tiering |
| Capture tier drift | source falling back to a more expensive tier | info; 3 in a row → change `capture_method` |
| **DLQ depth** | dead-lettered messages per source per day | > 0 → warn (this is the signal that does not exist today) |

The zero-yield alert is the one that would have caught this incident on day one — 49 of 51
sources reporting 0 discovered URLs is not subtle, it just had nowhere to be reported to.

### 4.2 Known-truth benchmarks (external ground truth)

Per-source metrics tell you a source broke. They cannot tell you a source you never onboarded
exists. Three independent external estimates:

1. **DreamDirt monthly Iowa report** — publishes aggregate Iowa farmland auction volume
   (e.g. $115M / 9,911 acres, Sept 2025). Monthly job: sum our `auction_events` acreage for the
   same month and same `listing_type='auction'`, compute `captured_acres / reported_acres`.
   A ratio persistently below ~0.8 means missing *sources*, not missing *listings*. This is the
   single best "are we missing anything" number available and it costs one scrape a month.
2. **Iowa Public Notices** (`iowapublicnotices.com`) — Iowa Code §654.16A mandates ~60-day
   published notice for foreclosure/sheriff sales. Email-alert ingest is free and gives an
   advance signal on a channel no auctioneer-board scraper sees. Use it two ways: as a coverage
   *predictor* (a noticed farm sale that never appears in our data within 45 days is a concrete
   miss, with a name and a county to chase) and as a genuine early-warning feed.
3. **HiBid Iowa Ag/Farm Land hub + Iowa Auctioneers Association directory** — monthly
   enumeration of *companies* currently running Iowa auctions, diffed against `sources.domain`.
   Any company running Iowa land auctions that is not a source is a coverage hole with a URL.
   This is also the discovery feeder in `dim11.md` §6; it doubles as a measurement instrument.

Add a fourth, free and internal: **the unknown-auctioneer feedback loop.** Any observation whose
enriched `auctioneer` does not resolve to a known `sources.domain` becomes a `candidate_sources`
row. It fires exactly when coverage has a hole, and it costs nothing.

### 4.3 Recall harness (regression testing, in CI)

A stored fixture set of known-good auctions that the pipeline must still find after any change.

```
migrations/0033_recall_fixtures.sql
CREATE TABLE recall_fixtures (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  source_name TEXT,
  expected_county TEXT, expected_acreage REAL, expected_auction_date DATE,
  expect_visible_on_map BOOLEAN DEFAULT TRUE,
  added_reason TEXT,          -- 'todd_2026_08_03', 'regression_sold_substring', ...
  added_at TIMESTAMPTZ DEFAULT now(),
  last_pass_at TIMESTAMPTZ, last_fail_reason TEXT
);
```

Seed with the four URLs Todd reported (documented in `docs/scrape-gap-diagnosis.md` §A):
the Osborn/Wilwerding sale bill, the exchangeline.com Shelby/Harrison listing, the DreamDirt
`/auction/741/` tract, and the Denison Livestock Kenkel PDF. Add every future client-reported
miss, and add one fixture per bug fixed.

The harness has **two tiers**, because they answer different questions:

- **Tier A — offline, runs on every PR, no network.** Feed each fixture's *stored*
  `raw_data` payload through `saveAuction`'s pure logic (sold detection, date parsing,
  classification, county resolution) against a scratch schema, then through the map API's
  filter and window logic. Asserts: still `status='active'`, still `property_category` land-like,
  still inside the map's result set. This is where the "sold" substring bug and the 200-row
  window bug would each have been caught the day they were written. Fast, deterministic, free.
- **Tier B — live, runs nightly and on demand.** Actually run discovery for each fixture's
  source and assert the fixture URL appears in the candidate set, then that a detail extraction
  produces the expected county/acreage/date within tolerance. Catches upstream site changes and
  routing regressions. Costs a handful of credits; report as a pass/fail table, and write results
  back to `recall_fixtures.last_pass_at` so a permanently-red fixture is visible.

Fail the PR on any Tier A regression. Tier B failures open an issue rather than blocking, since
they can fail for reasons outside our control (site down, listing genuinely removed).

### 4.4 Where the numbers surface

One `/api/admin/coverage` endpoint returning the scorecard, the benchmark ratios, DLQ depth, and
the recall-harness status; one weekly digest email. The important property is that all of it is
a SQL query over `scrape_runs` + `sources` + `auction_events`, so it works identically from the
Worker, from a script, and from a psql prompt — unlike today's local JSONL.

---

## 5. Cadence

### 5.1 The two problems with today's schedule

`scraper_settings` holds a single global cadence (`daily | every-other-day | weekly`) applied
uniformly to all 51 sources, and there is no notion of an auction's lifecycle: an auction 200
days out and an auction closing in 6 hours are polled identically. Combined with the fact that
57% of active rows have no date at all, nothing in the system can currently say "this sale is
tomorrow, look at it again."

### 5.2 Seasonal tiers

Iowa land auctions peak Nov–Apr (post-harvest through spring). Measured forward book right now
(early August, the trough): 201 events in Aug, 82 in Sep, 16 in Oct, 23 in Nov — thin, and
consistent with both the seasonality claim and with our own capture falling off past ~60 days out.

| Season | Months | Discovery sweep (aggregator/platform hubs) | Source list pages, tier 1 | tier 2 | tier 3 |
|---|---|---|---|---|---|
| Peak | Nov–Apr | 2×/day | daily | every 2 days | weekly |
| Shoulder | Sep–Oct, May | daily | daily | every 3 days | weekly |
| Trough | Jun–Aug | daily | every 2 days | weekly | biweekly |

Tiering is by measured yield, not by guesswork: promote a source into tier 1 if its trailing-20
`urls_new` is in the top quartile; demote to tier 3 after 20 runs with < 5% non-zero yield.
Newly onboarded sources sit in `probation` at daily cadence for two weeks regardless.

### 5.3 Lifecycle-driven polling

Replace `status TEXT` with an explicit state machine on `auction_events.lifecycle_status`:

```
discovered → announced → upcoming → live → closed_pending_results → results_posted → archived
                    ↘ cancelled / postponed          ↘ no_sale
                    ↘ removed_gone (404-verified ×2 — flagged, never deleted)
```

and drive polling from `next_check_at = f(lifecycle_status, auction_date)`:

| Phase | Re-poll |
|---|---|
| T−60 → T−14 | every 7 days |
| T−14 → T−7 | every 3 days |
| T−7 → T−1 | daily (postponements cluster here) |
| T (auction day) | 2–4× |
| T+1, T+3, T+7, T+14 | results polls, then fall back to the weekly results-page backstop |
| no date (`needs_date_review`) | every 3 days until a date resolves or 60 days elapse |

That last row matters given the 1,095 date-less rows: without it they are polled on the same
schedule forever and never converge.

**Never hard-delete.** The archiver currently deletes rows (`auctionArchiver.ts:131,147,235`) —
`docs/scrape-gap-diagnosis.md` documents 2,584 rows deleted while their auction date was still
in the future. Closed auctions are the price-trend dataset and the matcher's training data.
`archived` should be a lifecycle state, not a `DELETE`.

### 5.4 How this maps onto Cloudflare cron + Neon auto-suspend

Cron granularity stops mattering once the cron is a producer. One `*/15 * * * *` trigger runs a
single indexed query —

```sql
SELECT id FROM sources       WHERE next_check_at <= now() AND status IN ('active','probation')
UNION ALL
SELECT id FROM auction_events WHERE next_check_at <= now() AND lifecycle_status <> 'archived'
ORDER BY ... LIMIT 200;
```

— enqueues the due work, and exits in well under a second and a handful of subrequests. Seasonal
and lifecycle cadence live entirely in the `next_check_at` values, so changing the schedule is a
data change, not a deploy.

On **Neon auto-suspend**: the current hourly cron exists specifically so the compute can suspend
(`worker/src/index.ts:44-47`, commit `027c2ea` "stop heartbeats that pinned Neon compute awake
24/7"). A `*/15` producer touches the DB 96×/day, which would keep the compute warm most of the
day and undo that work. Preserve it by **batching the producer into windows**: run the query at
`:00` and `:30` only during a defined active window (e.g. 05:00–23:00 UTC in peak season,
06:00–18:00 in trough), and let the queue consumers — which only touch the DB when they have
actual work — do the rest. Auction-day polls are the one exception worth waking for; give those
events a dedicated tighter window rather than raising the global cadence. Net DB-touch count is
roughly comparable to today, with far better coverage per touch.

---

## 6. Recommended order of work

| # | Change | Why now | Size |
|---|---|---|---|
| 1 | Remove the scraper branch from the Worker cron; confirm the Node scraper owns the schedule | Stops 5–6 broken partial runs/day, stops burning credits on the first 2 sources, stops `nextRun` corruption | ~3 lines |
| 2 | `scrape_runs` + `sources` tables; move `scraperDiagnostics` output into Postgres; wire the zero-yield alert | The anomaly detector physically cannot fire today; this is what makes every later change measurable | 1–2 days |
| 3 | Recall harness Tier A + the 4 Todd fixtures in CI | Freezes the bugs the sibling report found; makes every later change safe | 1 day |
| 4 | Queues + consumer Worker; run in parallel with Node for a week; then cut over | Removes the runtime ceiling permanently; prerequisite for 120 sources | 3–4 days |
| 5 | Cheapest-first router + `content_hash` diffing + new-URL-only detail scraping | ~10× cost reduction; makes 120 sources cheaper than today's 51 | 2–3 days |
| 6 | `auction_events` + Layer 0/1 matcher + dry-run backfill; map endpoint cutover | Must land *before* the aggregator sources | 3–4 days |
| 7 | Lifecycle state machine + `next_check_at` scheduling; archiver stops deleting | Fixes both freshness and the accidental-deletion class of bug | 2–3 days |
| 8 | Benchmarks: DreamDirt monthly ratio, Iowa Public Notices ingest, HiBid/IAA directory diff | Answers "are we missing anything" without waiting for a client email | 2 days |
| 9 | Layers 2–3 of the matcher (weighted scoring, LLM gray zone), `match_audit` review UI | Only needed once aggregator volume is real | 2–3 days |

Items 1–3 are the ones I would want done this week; they are small, and until they exist every
other measurement is unreliable.

---

## Appendix A — How to reproduce the runtime evidence

```bash
export CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' .env | cut -d= -f2-)
ACC=74441f2451ab88fb62f7a2dba1347837

# registered cron triggers
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/scripts/terravalue-api/schedules"

# the smoking gun — subrequest exhaustion in the cron path
curl -s -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'Content-Type: application/json' \
  "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/observability/telemetry/query" \
  -d '{"queryId":"q","timeframe":{"from":<ms>,"to":<ms>},
       "parameters":{"datasets":["cloudflare-workers"],
       "filters":[{"key":"$metadata.message","operation":"includes",
                   "value":"Too many subrequests","type":"string"}]},
       "limit":100,"view":"events"}'

# local run durations, for the 15-min-vs-206-min comparison
python3 -c "
import json,collections
runs=collections.OrderedDict()
[runs.setdefault(d['scrapeId'],[]).append(d) for d in
 (json.loads(l) for l in open('logs/scraper-diagnostics.jsonl') if l.strip())]
for sid,rows in runs.items():
    print(sid, len(rows),'sources',
          round(sum(r['duration'] for r in rows)/60000,1),'min',
          sum(r['processedUrls'] for r in rows),'detail scrapes',
          sum(r['successfulSaves'] for r in rows),'saved')"
```

## Appendix B — Open questions I could not resolve

1. **Where exactly does the Node scraper run?** Strongly indicated to be Railway (commit
   `b19901e`, `server/index.ts` CORS allowlist referencing a Vercel frontend and a "Railway
   backend", a Central-timezone `nextRun`, a writable filesystem). No Railway config exists in
   the repo and I had no Railway credentials. **Confirm before step 1** — if that process is in
   fact dead, the Worker is the *only* scraper and the capture loss is total, which changes the
   urgency of step 4 from "this month" to "this week."
2. **The Firecrawl JSON-format credit multiplier.** The pricing page says advanced features cost
   extra without publishing the number. Every cost figure in §2.3 is given at both 1× and 5×.
   One look at the Firecrawl usage dashboard for July resolves it.
3. **The actual per-invocation subrequest ceiling on this account.** The docs table says 10,000
   on Paid; observed behaviour is consistent with 1,000. Immaterial to the recommendation.
4. **Whether the 51 source entries have drifted.** Three sources returned 0 discovered URLs even
   in the healthy Node run (Al Hughes Auction, Central States Real Estate, Randy Pryor Real
   Estate). That is fs-scraper-diag's territory, but the zero-yield alert in §4.1 is what should
   have surfaced it.
