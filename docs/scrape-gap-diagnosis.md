# Scrape Gap Diagnosis — why auctions are missing from the map

> Forensic report, 2026-08-03. Triggered by 4 examples from Todd Heistand.
> All claims below are read from source or queried against the production Neon DB
> (`terravalue-db`). Where I could not verify something, it is labelled as such.
> **No code was changed.**

---

## TL;DR

The `.pdf` JUNK filter is real but it is **not** the main cause. Two bugs are doing
far more damage:

1. **A substring match on the word "sold"** (`auctionScraper.ts:600-603`) marks any
   listing whose description says *"to be sold at auction"* as **SOLD**. That is
   standard sale-bill English. It killed **both** of Todd's Osborn and Denison
   examples — proven below with the actual stored description text. 2,584 auctions
   have been archived this way while their auction date was still in the future.

2. **The map API returns 200 rows ordered by `auction_date ASC`**
   (`worker/src/routes/api.ts:1017-1018`). With 1,773 map-eligible rows in the table,
   the 200 the map actually receives are dated **1955-01-15 through 2024-12-04** —
   *zero* upcoming auctions. Every genuinely upcoming, geocoded auction (300 of them)
   is outside the window regardless of where the user pans.

---

## A. The four URLs — where each one dies

| # | URL | Stage that drops it | File:line | Evidence | Minimal fix |
|---|-----|---------------------|-----------|----------|-------------|
| 1 | `osbornauction.com/.../Wilwerding-Sale-Bill-11x17-4.pdf` | **(iii) Saved, then flipped to `sold` and hard-deleted.** The PDF URL itself is dropped by the JUNK regex, but the *listing* was captured from the HTML page `osbornauction.com/sept-9-farmland-auction/`. Its description ends *"…to be sold at auction."* → substring match → `status='sold'` → archiver Category 2 → row deleted. | `auctionScraper.ts:600` (drop), `auctionScraper.ts:704` (upsert writes status), `auctionArchiver.ts:131,147,235` (delete). PDF also blocked at `auctionScraper.ts:348`. | `archived_auctions` id **48341**, `auction_date = 2026-09-09` (**future**), `status='sold'`, `archived_reason='marked_sold'`, `scraped_at 2026-04-10`, `updated_at 2026-05-11 12:06`, `archived_at 2026-05-11 14:00`. Description: *"71.19 taxable acres m/l in Shelby County … and 303.4 taxable acres m/l in Harrison County … **to be sold at auction**."* | Require a word-boundary + negative-lookbehind test, e.g. only treat as sold on `/\b(has been sold|was sold|sale closed|auction closed|sold for)\b/` — never on the bare token `sold`. Additionally: never mark sold when `auctionDate > now()`. |
| 2 | `exchangeline.com/auction/374-59-taxable-acres-m-l-shelby-harrison-county-farmland-auction/` | **(i) Never discovered.** The Exchange / exchangeline.com is not in the source list. | `auctionScraper.ts:77-137` (51 sources; no exchangeline entry) | 0 rows matching `%exchangeline%` in `auctions` **or** `archived_auctions`. Note: this is the *same farm* as #1 — 71.19 + 303.4 = 374.59 ac Shelby/Harrison — listed by a second broker. | Add `{ name: 'The Exchange', url: 'https://www.exchangeline.com', searchPath: '/auctions/' }` to `sources`. |
| 3 | `bid.dreamdirt.com/auction/741/item/tract-1-1549-acres-grant-twp-…` | **(i) Never discovered in this form, plus (ii) crowded out by the 60-URL cap.** DreamDirt is scraped, and item-level URLs *are* ingested (52 active / 4,110 archived) — but the 60 slots get filled with whatever the LLM extractor happened to return, which today is push mowers, bedsheets and box lots. The numeric `/auction/741/` path was never captured; only a slug form was, and it got the **wrong title**. | `auctionScraper.ts:370-371` (`MAX_URLS_PER_SOURCE = 60`), `auctionScraper.ts:306` + `firecrawl.ts:46-52` (Map filtered by `search: 'auction'`, `limit: 100`), `auctionScraper.ts:394` (rows only saved if the LLM returned a `title`) | DreamDirt ingested **57** URLs in the last run — at the 60 cap. Sample active rows: `/auction/713/item/mtd-gold-push-mower-33611`, `/auction/736/item/air-mattress-36135`. The only row referencing 741 is `.../auction/160-acres-ruth-n-morrice-revocable-trust-ida-county-iowa-741/bidgallery/` carrying the title of a *different* sale ("775 Acres Dean C Sandy Family Trust Pocahontas County"), archived as `past_auction_date`. | Give DreamDirt a source-specific discovery rule: enumerate `/auction/{id}/` catalogue pages and take the auction-level page, not `/item/` leaves. Raise or remove the cap for sources whose listings are item-partitioned. |
| 4 | `denisonlivestock.com/uploads/Verrdella%20Kenkel%20Land.pdf` | **(iii) Saved, then hidden by `status='sold'`.** Same failure as #1. PDF URL blocked by JUNK, but the listing was captured from `denisonlivestock.com/sales.asp`. Description: *"…377.25 taxable acres of farmground **sold** in 3 parcels."* Also the title contains *"to be **sold** in 3 Parcels"*, so `title.includes('sold')` fires too. | `auctionScraper.ts:599` (title), `auctionScraper.ts:600` (description), `auctionScraper.ts:348` (PDF), map filter `api.ts:1001` | **Live rows right now**: `auctions` id **144171** and **144177**, `auction_date = 2026-08-29` (**future**), `property_category='farmland'`, `latitude=42.01771` — everything needed to render, but `status='sold'` so `eq(auctions.status,'active')` excludes them. Four earlier copies already sit in `archived_auctions` (ids 91965, 92079, 92081, 92129) as `marked_sold`. | Same fix as #1. Then re-activate: `UPDATE auctions SET status='active' WHERE status='sold' AND auction_date > now()` (38 rows today). |

**Cross-cutting note on the `.pdf` filter** (`auctionScraper.ts:348`, added 2026-06-07 in
commit `67a70c8`): it is a genuine coverage hole — 3,631 rows in `archived_auctions` have
`.pdf` URLs, i.e. sale-bill PDFs used to be a real ingestion path, and since June 7 zero new
ones enter. For Osborn and Denison specifically it did *not* cause these two misses, because
both sites also expose an HTML page that was scraped. It will cause misses on any auctioneer
who posts a sale bill with no HTML detail page.

---

## B. The Wilwerding disappearance — every path that can un-render a saved auction

Ranked by likelihood, with the actual cause first (this one is proven, not inferred).

| Rank | Mechanism | File:line | Reversible? | Evidence / scale |
|------|-----------|-----------|-------------|------------------|
| **1** | **"sold" substring in title or description** → `status='sold'` on the *next re-scrape upsert*, then the daily archiver deletes the row. | `auctionScraper.ts:598-607`, written by upsert at `auctionScraper.ts:704`; deleted at `auctionArchiver.ts:131,147,235` | **No — hard `DELETE`**, the row only survives as a copy in `archived_auctions`. | **This is what happened.** Wilwerding: scraped 2026-04-10, active for a month, `updated_at` 2026-05-11 12:06 flipped it, archiver deleted it 2026-05-11 14:00. Matches Todd's "showed up for a while." Fleet-wide: **2,584** archived rows were `marked_sold` while `auction_date > archived_at`. |
| **2** | **AI enrichment sets `status='sold'`.** OpenAI is told to look for "was sold / has been sold" (`auctionEnrichment.ts:77-80`) and the result is written straight to `status`. A sale bill saying "will be sold" reads as sold to a model at temperature 0.1. | `auctionEnrichment.ts:182,249` | No — feeds the same archiver delete. | 111 rows archived as `ai_detected_sold`, 67 as `ai_detected_closed`. Smaller than #1 but the same class of bug. |
| **3** | **Archiver "non-farm" title heuristics.** `title.includes('estate auction')` fires on **"Real Estate Auction"**. `title.includes('gun')` fires on any name containing that substring. | `auctionArchiver.ts:100` (`estate auction`), `:104` (`gun`), `:98-106` | No — hard delete. | **4,030** archived rows have `estate auction` in the title; **1,997** of those are literally *"Real Estate Auction"*. 20 more matched on `gun`. Note this heuristic is *independent* of the classifier and ignores its verdict entirely. |
| **4** | **Archiver `aiDetectedSold` on `enrichedDescription`** — same substring problem, on AI-rewritten prose that is even more likely to contain "sold". Unlike Category 1 it does **not** respect `needsDateReview` and does **not** check whether the date is in the future. | `auctionArchiver.ts:134-142` | No. | Folded into the 2,584 figure above. |
| **5** | **Bad date → past date → archived.** `parseFlexibleDate` calls bare `new Date(str)` with **no sanity range check**, unlike the regex path which validates −1yr…+2yr (`dateExtractor.ts:147`). `new Date("April 24")` yields year 2001. | `dateExtractor.ts:19-72` (no validation) vs `:143-149` (validation exists) | No. | 58,680 rows archived as `past_auction_date`. Live proof of garbage dates surviving: active row id 142738 (`mccallauctions.com/blog`) carries `auction_date = 1955-01-15`. |
| **6** | **Classifier flips to `non_land`** → excluded by the map WHERE clause (but *not* deleted). | `auctionClassifier.ts:86-127`, filter at `api.ts:1004` | **Yes** — row survives, just hidden. | 178 active rows are `non_land`. Note: `classifyAuction` is only called from `auctionScraper.ts:662`; despite its docstring it does **not** re-run after enrichment. |
| **7** | **Falls out of the 200-row window** (see section C.1). Not a state change at all — the row is fine, the API just never returns it. | `api.ts:1017-1018` | Yes. | See C.1. This is why an auction can vanish with *nothing* having changed about it. |
| **8** | Geocoding regression on re-scrape: the upsert overwrites `latitude`/`longitude` unconditionally (`auctionScraper.ts:705-706`), so a re-scrape that fails to geocode nulls out coordinates that previously worked → dropped by the bbox filter at `api.ts:1043`. | `auctionScraper.ts:705-706`, `api.ts:1042-1050` | Yes, self-heals on a good re-scrape. | 193 active rows currently have no coordinates. Not the Wilwerding cause (it was deleted, not blanked). |
| **9** | Blocklist. **Ruled out** for these four — and worth flagging: `docs/AUCTION_BLOCKLIST.md:41,76-78` claims the blocklist is checked at the top of `saveAuction()`. **It is not.** There is no blocklist import or lookup anywhere in `auctionScraper.ts`; the only references are the API routes. Blocklisted URLs are deleted once and then re-added by the next scrape. | `auctionScraper.ts:515-731` (no check), `worker/src/routes/api.ts:1334-1372` | — | Todd was right to check it, and right that it wasn't the cause. |

---

## C. Systemic failure modes — every silent discard, quantified

### C.1 The map API's 200-row window — **the largest single cause right now**

```ts
// worker/src/routes/api.ts:1015-1019
const auctionList = await db.query.auctions.findMany({
  where: and(...conditions),
  orderBy: [asc(auctions.auctionDate)],
  limit: 200,
});
```

- 1,773 rows are map-eligible (`status='active'`, not `non_land`).
- Postgres `ASC` defaults to `NULLS LAST`, so the 1,057 rows with no date sort to the bottom
  and are **unreachable**.
- The 200 rows the query actually returns are dated **1955-01-15 → 2024-12-04**. I checked:
  `past = 200, future = 0`.
- **300** rows are future-dated + geocoded + not `non_land` — the actual product. None of
  them are in the window.
- The bounding-box filter runs *in JS after* the limit (`api.ts:1042-1050`), so panning the
  map cannot recover them. Neither can the date filter — `auctionDateRange` only adds
  `lte(auctionDate, futureDate)` (`api.ts:1012`), an upper bound, which does nothing about
  past dates sorting first.
- Why the window is full of junk: the archiver and the scraper run back-to-back (archive
  batch at 14:00 stored-time, scrape 14:23–16:39 the same day). The archiver clears stale
  rows, then the scrape immediately re-inserts blog posts and expired listings with old
  parsed dates. So for ~22 hours a day the head of the sort is garbage.

**Minimal fix:** add `gte(auctions.auctionDate, today)` (or `isNull`) to `conditions`, push
the bbox into SQL, and raise the limit. This one change is worth more than every scraper fix
combined.

### C.2 Filters and caps that silently discard candidates

| Filter / cap | File:line | Measured cost |
|---|---|---|
| `.pdf` (and `.jpg/.png/.css/.js`) in JUNK regex | `auctionScraper.ts:348` | 3,631 historical `.pdf` rows exist in `archived_auctions`; 23 still active. Zero new ones since 2026-06-07. Kills sale-bill-only auctioneers outright. |
| `/about\|contact\|privacy\|terms\|login\|cart/` in the same regex | `auctionScraper.ts:348` | Unmeasured, but `\b`-anchored on path segments, so a listing slug like `/farmland-terms-of-sale/` would be dropped. Low volume; worth a look. |
| `MAX_URLS_PER_SOURCE = 60` | `auctionScraper.ts:370-371` | Sources at/near the cap in the last run: Sullivan **58**, Steffes **57**, DreamDirt **57**, Green R.E. **56**, Midwest Land Mgmt **55**. Overflow is recorded only in `stats.missingUrls`, which is never persisted in production (see D). |
| Map API `search: 'auction'` | `auctionScraper.ts:306` → `firecrawl.ts:46-52` | Firecrawl only returns URLs matching "auction". Any detail page whose URL uses `/listing/`, `/property/`, `/land/`, `/sales.asp`, or an opaque id is invisible to Strategy 1. It survives only if Strategy 2's LLM extractor happens to find it. Denison's actual listing lives at `/sales.asp` — no "auction" in the path. |
| Firecrawl Map `limit: 100` | `firecrawl.ts:50` | Hard ceiling before the 60-cap even applies. |
| Web-search fallback runs **only** when the first two strategies return literally zero | `auctionScraper.ts:334` | A source returning 3 junk links never gets the fallback. |
| Row saved only if the LLM returned a non-empty `title` | `auctionScraper.ts:394` | Counted as `failedScrapes` and dropped. Silent in production. |
| Item-level vs auction-level URLs | `auctionScraper.ts` (no per-source URL shape rules) | DreamDirt uses `/auction/{id}/item/{slug}`. 52 active + 4,110 archived item rows. Each item inherits the **parent auction's** title/date, so a mower and a 154.9-acre tract become indistinguishable rows. |
| URL fragments create duplicate rows | upsert target is `auctions.url`, `auctionScraper.ts:698` | 31 active rows have `#` in the URL. Denison's single Kenkel sale exists as `sales.asp`, `#Land_Sale`, `#Farm_-_Machinery_Sale`, `#House_-_Household_and_Antique_Sale`, `#Livestock_Sale` — 5 rows, one auction. 134 duplicate-title groups among active rows. Duplicates consume both the 60-URL cap and the 200-row map window. |
| Archiver non-farm title heuristics | `auctionArchiver.ts:93-122` | 4,030 `estate auction` / 1,997 `real estate auction` / 20 `gun`. |
| `status='sold'` from substring match | `auctionScraper.ts:598-607` | 2,584 future-dated auctions archived; 38 live rows hidden today. |
| `/auctions/upcoming` excludes NULL dates | `api.ts:1397` (`auction_date::date >= CURRENT_DATE`) | 1,113 rows have `needsDateReview=true`; none can appear in the upcoming feed. |
| `looksIowa` prioritisation | `auctionScraper.ts:363-367` | Correctly documented as order-only, never drops. **No issue** — verified. |

**Nothing requires the word "auction" in the URL at the JUNK-filter stage** (that was fixed
in `67a70c8`) — but the Firecrawl Map `search` parameter reintroduces exactly that constraint
one layer up.

---

## D. Observability gap — why nothing flagged this

`scraperDiagnostics.ts` exists and computes the right things (per-source coverage, missing
URLs, 50%-drop anomaly detection, zero-Iowa-saved alert). **In production it is a no-op.**

1. `scraperDiagnostics.ts:16` — `HAS_FS` is gated on `!globalThis.WorkerGlobalScope`. The
   scraper runs inside a Cloudflare Worker (`worker/src/index.ts:57-59`, cron `0 * * * *`),
   where that global is defined, so `logStats`, `logMissingAuctions`, `getHistoricalStats`
   and `getMissingIowaAuctions` all return immediately. Even if the guard passed, a Worker's
   filesystem is per-isolate and discarded, and every write is wrapped in a silent
   `catch {}` (`:70`, `:100`).
2. `getHistoricalStats()` therefore returns `[]`, so `detectAnomalies` hits
   `if (sourceHistory.length === 0) continue` (`:244-246`) for **every** source. **No anomaly
   has ever fired in production.**
3. The local `logs/*.jsonl` files were last written **2026-07-31 03:09** — dev runs only.
4. Stats live only in `this.lastScrapeStats` (in-memory, `auctionScraper.ts:57`), which dies
   with the isolate. `/api/auctions/scrape-progress` reads the same dead object.
5. **Osborn and Denison would not have been flagged even with working diagnostics**, because
   they are not discovery failures. Both auctions *were* discovered, scraped and saved
   successfully — `successfulSaves` counted them. They died in `saveAuction`'s sold-detection
   and in the archiver, neither of which emits a metric. The existing diagnostics measure
   discovery→save. Every failure in this report is downstream of that.
6. `isIowaUrl` (`:283-289`) infers Iowa from the URL string, contradicting the design note at
   `auctionScraper.ts:345-347` that Iowa is determined from parsed state. `iowaDiscovered` is
   therefore not comparable to `iowaSaved`, making the "found N Iowa, saved 0" alert
   (`:259-263`) unreliable.
7. `scraped_at` / `archived_at` are `timestamp without time zone` (`shared/schema.ts:207`),
   so stored times don't line up with the UTC cron (`0 9 * * *` vs 14:00 stored). Any
   timeline reconstruction from these columns needs that offset accounted for.

### What we would need to have caught this automatically

- **Persist diagnostics to Postgres, not the filesystem.** A `scrape_runs` /
  `scrape_run_sources` table. Everything else depends on this.
- **Instrument the drop reasons that currently have no counter**: rows marked `sold` at save
  time (with the matched substring and the auction date recorded), rows classified `non_land`,
  rows archived by reason, rows whose parsed date landed outside −1yr…+2yr.
- **A single alarm that would have caught all four examples:**
  `COUNT(*) WHERE status='sold' AND auction_date > now()` — should be 0, is 38.
  And its archive twin: `archived_reason='marked_sold' AND auction_date > archived_at` —
  2,584 lifetime.
- **A map-reachability metric**: rows that are map-eligible vs rows that actually fit inside
  the API's `limit`/ordering window. Today that is 1,773 vs 200-with-zero-future — a ratio
  that would have screamed.
- **Per-source freshness**: last time source X produced a *future-dated, active, geocoded*
  row. Osborn and Denison would each show a long gap despite healthy save counts.
- **Archive-rate anomaly**: 763 rows archived on 2026-08-03, 84 on 08-02, 1,565 on 07-31.
  That variance is not normal auction turnover.

---

## Fix order (highest value first)

1. `api.ts:1017-1018` — filter to upcoming, push bbox into SQL, raise the limit. Restores
   ~300 auctions immediately, no scraper change needed.
2. `auctionScraper.ts:598-607` + `auctionEnrichment.ts:249` — word-boundary sold detection,
   and never mark sold when `auctionDate > now()`. Then re-activate the 38 live false
   positives.
3. `auctionArchiver.ts:93-122` — delete the title heuristics and defer to `propertyCategory`;
   at minimum drop the `estate auction` and `gun` rules.
4. `auctionArchiver.ts` — soft-archive (`status='archived'`) instead of `DELETE`, so this
   class of bug is recoverable without a restore.
5. `dateExtractor.ts:19-72` — apply the same −1yr…+2yr validation the regex path already has.
6. `auctionScraper.ts:348` — allow `.pdf` through and route it to a PDF-capable scrape.
7. Persist diagnostics to Postgres; add the `sold-but-future` alarm.
8. Add exchangeline.com; add per-source URL-shape rules for DreamDirt; strip URL fragments
   before upsert.
