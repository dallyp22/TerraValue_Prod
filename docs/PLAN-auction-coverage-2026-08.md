# Plan — Capture every Iowa farmland auction

> 2026-08-03. Triggered by Todd Heistand reporting missing auctions (4 examples).
> Synthesis of three parallel investigations, each of which wrote its own report:
> - `docs/scrape-gap-diagnosis.md` — why individual listings die in the pipeline
> - `docs/scrape-source-expansion.md` — which new sources to onboard, live-probed
> - `docs/scrape-architecture-plan.md` — runtime, cost, dedupe, coverage measurement
>
> Every number here was measured against production Neon (`terravalue-db`) or the live
> API. Claims inherited from earlier research without verification are labelled ASSUMED.

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
| 1 | **Scrape truncates.** Worker cron dies partway through the 51 sources | Production writes touch **2–8 distinct sources on most days** vs 51 configured. Worker runs save ~10 auctions; a full Node run saves ~1,290 | Open — biggest item |
| 2 | **`sold` matched as a bare substring.** Fires on "to be **sold** at public auction" | **2,584** auctions archived while their sale date was still in the future | **FIXED** |
| 3 | **Map returned only 200 rows, ordered `auction_date ASC`.** 414 expired rows exhausted the window | Production returned **0 upcoming auctions** for Todd's viewport; 300 upcoming+geocoded rows unreachable | **FIXED** |
| 4 | **Archiver hard-deletes on `title.includes('estate auction')`** — matches "Real **Estate Auction**" | **2,189** archived rows match | Open |
| 5 | **`parseFlexibleDate` has no sanity range.** `new Date("April 24")` → year 2001 | 58,680 archived as `past_auction_date`; a live row dated **1955** | Open |
| 6 | **`.pdf` dropped by the JUNK regex** (`auctionScraper.ts:348`, added 6/07) | 3,631 archived rows have `.pdf` URLs — that ingestion path is now closed | Open |
| 7 | **Blocklist documented as enforced in `saveAuction()`; it is not** | Blocked URLs are deleted once, then re-added by the next scrape | Open |
| 8 | **`scraperDiagnostics.ts:16` disables itself on Workers** | No anomaly alert has ever fired in production | Open |

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

## 4. Wave 1 — stop the bleeding (this week)

Ordered by auctions recovered per hour of work.

1. **Get the scrape off the Worker's per-invocation budget.** `worker/src/index.ts:57-59`.
   This is the single highest-leverage change and it is a ~3-line deletion, *provided* the
   Railway Node scraper is confirmed alive first — the two schedulers currently share one
   `scraper_settings` row and race, and the Worker's partial run corrupts `nextRun` in a way
   that can suppress the real one. **Confirm Railway, then cut the Worker branch.**
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
   is only expensive because the failure mode is destructive.

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

## 6. Wave 3 — make coverage measurable (next month)

1. **Cheapest-first routing.** We currently spend ~178 Firecrawl credits per *newly captured*
   auction, because we re-run LLM extraction on ~1,363 detail pages daily, almost all
   unchanged. Route free-API → plain HTML → Firecrawl → stealth, and only run detail
   extraction on new or changed URLs. Estimated ~10× reduction, which is what makes 120
   sources affordable.
2. **Cloudflare Queues + consumer Worker.** Cron becomes a producer only; one message per
   source, each with its own subrequest and CPU budget, plus retry and DLQ. Retire the
   Railway Node scraper afterwards so there is exactly one runtime.
3. **Split `listing_observations` from `auction_events`** — grow the existing `auctions`
   table in place, add `auction_events` above it. Do **not** rename. Measured cross-source
   duplication is low today (6 clusters), so this is prep work — but it must land *before*
   HiBid/LandHub/Land And Farm, which are aggregators and will multiply it. Blocking keys:
   county + acreage bucket, and Twp/Rng/Sec (already extracted by `auctionEnrichment`).
   57% of active rows have no `auction_date`, so date-based blocking cannot carry this.
   **DDL only — never `npm run db:push`, it drops the soil/PostGIS layer.**
4. **A recall harness.** Store known-good auction URLs — starting with Todd's four — and
   re-run them through the pipeline on every change, so a regression is caught in CI instead
   of by a client email. Add a per-source zero-yield alert, and re-enable
   `scraperDiagnostics` on the new runtime.

---

## 7. The lesson worth encoding

Every one of the top failures is the same: a cheap string heuristic wired to an
irreversible delete, with no date sanity check and no alarm when a source goes quiet. The
durable fix is not better heuristics — it is (a) archive as a flag, never a `DELETE`,
(b) the sale date outranks page text, and (c) a source that yields zero this week when it
yielded ten last week should page someone. Ship those three and the next class of this bug
gets caught by us instead of by Todd.
