# Plan — Capture every Iowa farmland auction

> 2026-08-03, revised end of day. Triggered by Todd Heistand reporting missing
> auctions (4 examples).
>
> Synthesis of three parallel investigations, each of which wrote its own report:
> - `docs/scrape-gap-diagnosis.md` — why individual listings die in the pipeline
> - `docs/scrape-source-expansion.md` — which new sources to onboard, live-probed
> - `docs/scrape-architecture-plan.md` — runtime, cost, dedupe, coverage measurement
>
> Every number here was measured against production Neon (`terravalue-db`) or the live
> API. Claims inherited from earlier research without verification are labelled ASSUMED.
>
> **STATUS — end of 2026-08-03.** Root causes 1, 2 and 3 are fixed and deployed to both
> runtimes. The scrape now runs on Cloudflare Queues (§3, Fix C) and reports per-source
> coverage (§3, Fix D). Railway was found still running — it was never decommissioned —
> and runs in parallel until the queue path is proven at full scale. Root causes 4-7
> remain open, and the queue path has been verified on 2-3 sources only. **Next gate:
> read `GET /api/scrape/coverage?days=1` after the first overnight run of both runtimes.**

---

## 1. What Todd actually found

He reported four auctions. Three of them **we had already captured** — we captured them
and then hid or deleted them. Only one was a genuine source gap.

| # | Auction | Reality |
|---|---|---|
| 1 | Wilwerding (Osborn) | Captured 4/10, active a month, flipped `sold` 5/11 12:06, **hard-deleted by the archiver 5/11 14:00** |
| 2 | Exchangeline 374.59ac | **True source gap.** Same farm as #1, listed by a second broker |
| 3 | DreamDirt tract 1 | Source scraped, but discovery filled its 60-URL budget with individual lots (push mowers, box lots) |
| 4 | Kenkel (Denison) | **Live in the DB right now** — farmland, geocoded, dated Aug 29 — marked `sold` |

The report was not "four auctions are missing." It was four auctions Todd personally knew
about. The measured gap is far larger.

---

## 2. Root causes, ranked by auctions lost

| Rank | Cause | Measured scale | Status |
|---|---|---|---|
| 1 | **Scrape truncates.** Worker cron blew its subrequest budget inside the first 1-2 sources | Production writes touched **2–8 distinct sources on most days** vs 51 configured. Worker runs saved ~10 auctions; a full Node run saves ~1,290 | **FIXED** — moved to Queues (§3) |
| 2 | **`sold` matched as a bare substring.** Fires on "to be **sold** at public auction" | **2,584** auctions archived while their sale date was still in the future | **FIXED** |
| 3 | **Map returned only 200 rows, ordered `auction_date ASC`.** 414 expired rows exhausted the window | Production returned **0 upcoming auctions** for Todd's viewport; 300 upcoming+geocoded rows unreachable | **FIXED** |
| 4 | **Archiver hard-deletes on `title.includes('estate auction')`** — matches "Real **Estate Auction**" | **2,189** archived rows match | Open |
| 5 | **`parseFlexibleDate` has no sanity range.** `new Date("April 24")` → year 2001 | 58,680 archived as `past_auction_date`; a live row dated **1955** | Open |
| 6 | **`.pdf` dropped by the JUNK regex** (`auctionScraper.ts:348`, added 6/07) | 3,631 archived rows have `.pdf` URLs — that ingestion path is now closed | Open |
| 7 | **Blocklist documented as enforced in `saveAuction()`; it is not** | Blocked URLs are deleted once, then re-added by the next scrape | Open |
| 8 | **`scraperDiagnostics.ts:16` disables itself on Workers** | No anomaly alert has ever fired in production | **SUPERSEDED** by DB telemetry (§3); the old file-based path is still dead code |

Note the shape: **items 2–7 are all the same failure mode** — an over-broad heuristic
wired directly to an irreversible `DELETE`, with no guard and no alarm.

---

## 3. Shipped today

**Fix A — the map window** (`worker/src/routes/api.ts`)
- Viewport filtering moved **into SQL, before the limit**. It ran in JS afterwards, so the
  limit truncated the result set before the map bounds were considered — panning could
  never recover a row.
- Added `auction_date IS NULL OR auction_date >= CURRENT_DATE`.
- Limit 200 → 2000.
- Verified for Todd's western-Iowa viewport: **0 upcoming auctions → 60**, 0 expired.

**Fix B — the `sold` heuristic** (`server/services/auctionScraper.ts`,
`server/services/auctionArchiver.ts`)
- Replaced `.includes('sold')` with `SOLD_PHRASES`, a narrow past-tense/terminal-state
  regex with word boundaries. Shared by scraper and archiver.
- Added a backstop in both: **an auction dated in the future is never marked or archived
  as sold**, whatever the page says. The date is the authority; page text is not.
- Regression-tested against the real production strings that caused the damage, including
  the Kenkel and Wilwerding descriptions, plus adversarial cases ("Gold **Sold** Separately",
  "un**sold** reserve not met"). 9 active kept, 7 sold detected, 0 errors.

**Not yet done, deliberately:** no data has been restored. See §4.

**Behaviour change to be aware of:** undated rows are now reachable on the map (they were
not before, despite the code intending it). In Todd's viewport that is 291 rows — 355
farmland statewide, but also residential, commercial and `unknown` junk. Hiding them again
is one line; I left them visible because hiding real farmland auctions is the exact
complaint we are answering. Item 5 (the date parser) is what actually cleans this up.

---


**Fix C — the scrape moved to Cloudflare Queues** (`worker/src/queues.ts`,
`worker/wrangler.jsonc`, `worker/src/index.ts`)

The scrape ran as one sequential 51-source crawl inside a single cron invocation.
Measured runs take 57 minutes (June) and 206 minutes (July 31, 1,363 detail
fetches) against a **15-minute** cron wall-clock ceiling. It exhausted the
subrequest budget inside the first one or two sources; every later source logged
"0 URLs found"; and because the terminal `updateSettings({nextRun})` write was
itself over budget and threw, `nextRun` never advanced and the hourly cron
re-fired the whole thing **every 2 hours indefinitely**, burning Firecrawl
credits on the same two sources each time.

No limit is large enough to fix that shape, so the work fans out instead:

```
cron 06:00 UTC --produce--> tv-scrape-sources   one message per source
                                  | discovery only
                                  v
                            tv-scrape-details   one message per listing URL
                                  | scrape + save one listing
                                  v
                            tv-enrich           OpenAI enrichment + CSR2
                                  \--> tv-dlq   after 3 failed attempts
```

Each message is its own invocation with its own subrequest and CPU budget, plus
retries and a dead-letter queue. Enrichment gets a queue because
`enrichmentQueue.startProcessing()` was fire-and-forget — the Worker invocation
ended and the work was silently dropped.

- The hourly `0 * * * *` cron is **deleted**.
- `POST /api/auctions/refresh` enqueues instead of scraping inline (`?limit=N`
  for cheap verification). That button previously reported success while
  capturing almost nothing.
- Per-source URL cap **60 → 250** on the queue path, with overflow logged rather
  than dropped silently — the old cap is why DreamDirt's budget filled with push
  mowers while the actual land tracts never landed.
- Discovery was split into `discoverUrlsForSource()` **alongside** the existing
  `scrapeSingleSource()` rather than replacing it, so the Node path keeps working
  unchanged during the parallel run. Both call the same Firecrawl strategies, so
  behaviour cannot drift between runtimes.

Verified: a clean 2-source run recorded Farmers National 11 discovered / 11
queued / 10 saved and Midwest Ag 11 / 11 / 11. Under the old path the second
source always returned zero. **Not yet verified at full 54-source scale.**

**Fix D — coverage telemetry** (`migrations/0029`, `worker/src/routes/api.ts`,
`server/services/scrapeContext.ts`)

Nobody could answer "are we missing anything?" until a client emailed.
`scraperDiagnostics` writes a local JSONL file and disables itself when there is
no filesystem, so the Cloudflare runtime recorded nothing — which is why a scrape
capturing 0.8% of its target showed 3,048 requests and zero errors on every
Cloudflare dashboard.

- `scrape_source_runs` — one row per (run, source, runtime): discovered, queued,
  dropped, saved, failed, timing, error. Upserted, so a retried message corrects
  its row rather than double-counting.
- `auctions.first_captured_by` / `last_captured_by` / `last_captured_run` —
  per-listing attribution. Both runtimes upsert the same rows, so without this the
  parallel run can only be eyeballed. `first_captured_by` is never overwritten;
  the 1,444 pre-existing rows stay NULL rather than being retroactively credited
  to whoever touches them next.
- `GET /api/scrape/coverage?days=N` — per-source/per-runtime funnel, capture
  attribution, and **the sources whose most recent run saved nothing**. That last
  list is the alarm that has never existed: a silently broken source used to be
  indistinguishable from a source with no auctions.

Applied as targeted DDL. **Never `npm run db:push`** — it drops the soil/PostGIS layer.

**Also established: Railway was never actually decommissioned.** The Cloudflare
migration was believed complete; it was not. `web-production-51e54.up.railway.app`
answers, runs `server/index.ts` (which starts both the scraper and the archiver),
and was serving pre-fix code against the same database. It is now on the fixed
build and runs in parallel until the queue path is proven.

---

## 4. Wave 1 — stop the bleeding (in progress)

Ordered by auctions recovered per hour of work.

1. ~~**Get the scrape off the Worker's per-invocation budget.**~~ ✅ **DONE, but not the
   way this plan originally proposed.** The earlier recommendation was to delete the
   Worker's scraper branch and let the Node process do the work. That was written while
   Railway's status was unverified; deleting the branch would have been safe only if
   something else was scraping. Railway turned out to be alive, but the right fix was not
   to lean on it — it was to make the Worker capable of finishing the job. See Fix C in §3.

   **Next gate:** read `GET /api/scrape/coverage?days=1` after the first overnight run of
   both runtimes (Railway 05:00 UTC as `node`, Cloudflare 06:00 UTC as `cloudflare-queue`).
   The queue path has only been verified on 2-3 sources. Do not retire Railway until the
   per-source funnel shows it holding across all 54.
2. **Restore the falsely-archived auctions.** ✅ **38 live rows reactivated 2026-08-03**
   (`status='sold' AND auction_date > now()` → `active`; ids saved for rollback). Todd's
   Kenkel auction is live again.

   The bulk restore from `archived_auctions` was dry-run and **deliberately not executed.**
   The 2,584 figure describes historical damage, not present recoverable value:

   | Filter | Rows |
   |---|---|
   | archived as `marked_sold` while future-dated | 2,584 |
   | …whose sale date is *still* in the future | 1,038 |
   | …not already back in the live table | 105 distinct URLs |
   | …**distinct actual sales** (by normalized title) | **27** |

   So the prize is 27 auctions spread across 102 Iowa URLs — restoring all of them would
   put ~4 duplicate pins per sale on the map, some carrying junk `state` values ("Texas"
   for an O'Brien County, Iowa farm). **Recommendation: don't bulk-restore.** These are
   live listings still on the auctioneers' sites; with the `sold` bug fixed, the next
   complete scrape re-captures them with fresh, correct data. Re-check coverage after the
   first full run instead, and only hand-restore anything that fails to come back.
3. **Fix the archiver's `estate auction` heuristic** (item 4) — it ignores the classifier's
   verdict entirely and deletes on a substring.
4. **Give `parseFlexibleDate` the same ±1yr/+2yr sanity range the regex path already has**
   (`dateExtractor.ts:143-149` has it; `:19-72` does not).
5. **Make archiving reversible.** Archive should set a flag, not `DELETE`. Everything above
   is only expensive because the failure mode is destructive. **Highest-value item on this
   list now** — it converts every future heuristic bug from data loss into a visible mistake.
6. **`server/routes.ts:1003` is a second, unfixed copy of `/api/auctions`** — still
   `orderBy asc(auctionDate)`, still `limit: 200`, no past-date filter. Only the Worker's
   copy was fixed. It currently *looks* healthy because the archiver cleared the stale
   backlog, so the 200-row window happens to reach upcoming auctions; the bug is masked,
   not gone. Either it dies with Railway (§4a) or every fix has to be written twice forever.
7. **Two silent losses still in the Worker path:** `enrichmentQueue.setPool()` is never
   called there, so legal-description geocoding has never run on Cloudflare at all.
8. **The classifier lets equipment onto the land map** — "2015 JOHN DEERE 2720" and
   "1971 JOHN DEERE 4020" are live right now. They were always in the data; the 200-row
   window was hiding them.

### 4a. Retire Railway (gated on the coverage read above)

- Strip `automaticScraperService.start()` and `archiverService.start()` from
  `server/index.ts:127-131`.
- Delete or fix `server/routes.ts` (see item 6).
- Decommission the Railway service; keep Express for local dev only.
- Goal state: exactly one runtime, one API implementation, one scheduler.

## 5. Wave 2 — close the coverage gaps (next 2 weeks)

The prior research's headline — *4 platform adapters beat 60 per-site scrapers* — is
directionally right, but its cost model did not survive live probing. Corrections found:

| Research claim | Live result 2026-08-03 |
|---|---|
| BidWrangler returns `lat/lng` on the auction list | `location` is null on most list records; coords live on `/{id}/items` |
| Peoples Company "moves to $0" via BidWrangler | API exposes **3** upcoming IA auctions; their site shows **14** — swapping loses 79% |
| LandHub has "~90 IA auction listings" | **3**. Wrong by ~30× |
| Ranch & Farm is a "plain HTTP scrape" | Laravel + Vite; **zero listings in static HTML** |
| exchangeline.com is "Easy, no anti-bot" | **403 Cloudflare** — including on Todd's missing auction |
| HiBid: parse embedded `lotModels` | Angular SPA shell, no `lotModels`, Turnstile present |
| AuctionZip is behind a 403 wall | **200 OK** — wrong in our favour |

So: onboard the genuinely-free wins now, but budget Firecrawl for the high-volume ones.

- **Free / 0 credits:** Farm Market Auctions (plain HTML table, 20 IA rows), LandHub
  (`__NEXT_DATA__`, coords included), Hoenig + UC Iowa (BidWrangler JSON), Iowa Auctioneers
  Association directory (discovery), Southlaw foreclosure PDF (distress early-warning).
- **Firecrawl required, highest volume:** The Exchange / KMA (SW Iowa near-complete —
  and it holds Todd's missing auction), HiBid Iowa Ag/Farm Land (statewide umbrella),
  Ranch & Farm, LandProz, United Country portal.
- **Source-specific rule for DreamDirt:** enumerate `/auction/{id}/` catalogue pages and
  take the auction-level page, not `/item/` leaves. Today 52 of its rows are individual lots.
- ASSUMED and still unverified: actual volumes for Ranch & Farm and The Exchange, HiBid's
  yield, and **whether Firecrawl stealth defeats Turnstile** — the entire Wave 2 cost model
  rests on that last one. Probe it before committing to the HiBid work.

## 6. Wave 3 — cost, dedupe, and recall (next month)

Coverage measurement itself shipped today (Fix D in §3); what remains here is cost,
dedupe, and turning the scorecard into an alert rather than a query.

1. **Cheapest-first routing.** We currently spend ~178 Firecrawl credits per *newly captured*
   auction, because we re-run LLM extraction on ~1,363 detail pages daily, almost all
   unchanged. Route free-API → plain HTML → Firecrawl → stealth, and only run detail
   extraction on new or changed URLs. Estimated ~10× reduction, which is what makes 120
   sources affordable.
2. ~~**Cloudflare Queues + consumer Worker.**~~ ✅ **DONE** — see Fix C in §3. Retiring the
   Railway scraper is now §4a, gated on the coverage read.
3. **Split `listing_observations` from `auction_events`** — grow the existing `auctions`
   table in place, add `auction_events` above it. Do **not** rename. Measured cross-source
   duplication is low today (6 clusters), so this is prep work — but it must land *before*
   HiBid/LandHub/Land And Farm, which are aggregators and will multiply it. Blocking keys:
   county + acreage bucket, and Twp/Rng/Sec (already extracted by `auctionEnrichment`).
   57% of active rows have no `auction_date`, so date-based blocking cannot carry this.
   **DDL only — never `npm run db:push`, it drops the soil/PostGIS layer.**
4. **A recall harness.** Store known-good auction URLs — starting with Todd's four — and
   re-run them through the pipeline on every change, so a regression is caught in CI instead
   of by a client email. The per-source zero-yield alert now exists
   (`GET /api/scrape/coverage` → `silentSources`); what is still missing is something that
   *notifies* rather than waiting to be queried, and the fixed known-good URL set.

---

## 7. Heistand portfolio (separate track, shipped today)

Not part of the auction pipeline, but it landed the same day and shares the
`parcels` table. The overlay was rebuilt on explicit parcel numbers instead of
seller-surname guessing: 25 farms drawn (was 23), 13 full confidence (was 8),
0 unmatched (was 4), 5,344 acres drawn against 5,406 sheet acres. Detail and
open items in `docs/heistand-match-report.md`; the short version is that six
farms remain weak (the three Barry farms over-cover via spatial fallback,
Grell 100 has one parcel in the source for a 98-acre farm, Red Oak 128 and
Glennwood Exit have unresolved parcels), **Bolten 500 West** has no parcel data,
and **Red oak 304** is in the sheet with no county or acreage and needs a
human decision on whether it is real.

## 8. The lesson worth encoding

Every one of the top failures is the same: a cheap string heuristic wired to an
irreversible delete, with no date sanity check and no alarm when a source goes quiet. The
durable fix is not better heuristics — it is (a) archive as a flag, never a `DELETE`,
(b) the sale date outranks page text, and (c) a source that yields zero this week when it
yielded ten last week should page someone.

(b) shipped today as the future-date backstop, and (c) is half-shipped — the data and the
query exist (`silentSources`), but nothing pages anyone yet; you still have to ask. (a) is
untouched and is now the highest-value item on the list, because it is what converts every
future heuristic bug from silent data loss into a visible mistake.

The measure of success is not that today's bugs are fixed. It is that the next one gets
caught by us instead of by Todd.
