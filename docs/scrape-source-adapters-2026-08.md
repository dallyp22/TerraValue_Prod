# Zero-Credit Source Adapters — Build Report

> Built 2026-08-03. Implements Wave 1 of `docs/scrape-source-expansion.md`.
> All counts below are from live runs on 2026-08-03, not estimates.
>
> **Files added (all new, nothing existing was edited):**
> `server/services/sources/{types,bidwrangler,landhub,farmmarketauctions,iowaauctioneers,exchangeline,firecrawlStealth,index}.ts`
> and `scripts/probe-source.mts`.

---

## 1. What each adapter returns right now

Run `npx tsx scripts/probe-source.mts all` to reproduce.

| Adapter | Iowa listings | Land-looking | **With coordinates** | Runtime |
|---|---|---|---|---|
| `BidWrangler: hoenigauctions` | 12 | 2 | **11** | 1.5s |
| `BidWrangler: uciowa` | 2 | 2 | **2** | 2.5s |
| `BidWrangler: heritagelandauction` | 0 | 0 | 0 | 0.5s |
| `Farm Market Auctions` | 17 | 6 | 0 | 1.0s |
| `LandHub` | 4 | 4 | **4** | 9.4s |
| **Total (new sources)** | **35** | **14** | **17** | — |
| `Iowa Auctioneers Assn` (discovery) | — | — | — | 8.6s → **198 auctioneers** |
| `Peoples Company (companion)` | 3 | 3 | **3** | 32s |
| **`The Exchange` (billed — 1 credit)** | **19** | **12** | 0 | 3.3s |

"Land-looking" is a probe-script hint only (a keyword match on title/description). Real
classification stays with `auctionClassifier.ts` — the adapters deliberately do not
duplicate that logic, so they return every Iowa row and let the existing classifier
decide. Farm Market Auctions is a mixed calendar (equipment, household, farm toys), which
is why its 17 rows contain 6 land-ish ones.

**17 of 35 listings arrive with publisher-supplied coordinates**, which skips geocoding
entirely — no Nominatim call, no county-centroid fallback. Sample of what that looks like:

```
BidWrangler: uciowa
  • Marshall County Farmland Auction
      88.8ac | Marshall County | 41.96262,-92.81149 | 2026-08-06T17:00:00.000Z
  • Appanoose County Online Land Auction
      46.56ac | Appanoose County | 40.81220,-92.96160 | 2026-08-19T17:00:00.000Z

LandHub
  • 161.2 Acres Clay County - Offered in 2 Tracts   161.2ac | Clay | 43.02223,-95.13786
  • 152.8 Acres Emmet County, Iowa                  —      | Emmet | 43.38357,-94.52383
  • 155 Acres Dickinson County, Iowa                155ac  | Dickinson | 43.37093,-95.25176
  • Monroe County, IA Land Auction - 213± Acres     213ac  | Monroe | 41.07365,-92.75655
```

Note LandHub moved from 3 auctions (2026-08-03 morning audit) to 4 by the afternoon —
these boards turn over, so treat any single count as a snapshot.

### Discovery adapter output

`iowaauctioneers` walks all 21 archive pages and returns **198 auctioneers** (10/page,
minus 3 duplicate profiles). With `withDetails: true` it also resolves each firm's own
website, which is the field that makes the candidate loop actionable:

```
• Chris Richard (Mt. Pleasant, IA)          → https://steffesgroup.com          [= source #10/#11]
• Whitaker Marketing Group (Huxley, IA)     → https://www.wmgauction.com        [= source #50]
• Country Mile Auctions (Fayette County)    → https://www.countrymileauctions.com/   ← NOT in our 51
• Head Auctions LLC (Marshalltown, IA)      → https://headauctionsllc.com            ← NOT in our 51
```

It returns `directory` entries and **never** `listings` — an auctioneer is a business,
not an auction, and putting one on the map would be a fake gavel.

---

## 2. The exchangeline / Turnstile verdict — **Firecrawl gets through both**

Probed live against the real `FIRECRAWL_API_KEY` from `.env`, `POST /v2/scrape` with
`proxy: "stealth"`. This was the open question gating Waves 2 and 3.

### exchangeline.com — **PASS**

The client's reported missing auction, which returns 403 to plain curl:

```
POST /v2/scrape  proxy=stealth
  url:  https://www.exchangeline.com/auction/374-59-taxable-acres-m-l-shelby-harrison-county-farmland-auction/
  → http 200 in 2.78s   success: true   statusCode: 200
  → title: "374.59 TAXABLE ACRES M/L SHELBY & HARRISON COUNTY FARMLAND AUCTION | The Exchange"
  → markdown: 10,108 chars
```

And the calendar index:

```
  url:  https://www.exchangeline.com/auctions/
  → http 200 in 3.22s   statusCode: 200   title: "Auctions | The Exchange"
  → markdown: 10,070 chars, opening with "25 auctions found."
```

**The client's specific gap is recoverable today.** The 403 is a plain Cloudflare block
that the stealth proxy clears in ~3 seconds, and the index confirms the 25-event figure
the prior research claimed but could not verify. This is now the highest-value remaining
onboarding job, and it is ordinary Firecrawl work — no special handling needed.

### HiBid — **also PASS**, which was not a given

HiBid uses Cloudflare **Turnstile**, a harder challenge than exchangeline's block, and a
plain curl of a company page returns 7 characters of text. It still rendered:

```
  url:  https://www.hibid.com/iowa/auctions/40311/real-estate/ag---farm-land
  → http 200 in 11.1s   statusCode: 200
  → title: "Ag & Farm Land Real Estate Auctions in Iowa - Live and Online Sales | HiBid.com"
  → markdown: 33,820 chars — 98 "acre" hits, 23 "County" hits

  url:  https://hallbergauction.hibid.com/company/71843/hallberg-auction-llc
  → http 200 in 13.3s   title: "Hallberg Auction LLC - Live and Online Auctions | HiBid.com"
  → markdown: 2,289 chars — 0 "acre" hits
```

The category page returns its **correct** title (plain curl got the generic
"Live and Online Auctions on HiBid.com" SPA shell) plus 33 KB of real listing content.
That is the single largest unverified claim in the whole plan, and it holds.

The Hallberg page rendering thin is a *content* result, not a failure — that company
simply has no current auctions. Worth noting because it means our existing sources #33
and #39 may be returning nothing for legitimate reasons, not broken ones.

**Caveats before anyone budgets on this:** these are two probes on one day. Turnstile
posture changes, stealth proxy costs more than a standard scrape, and 11–13s per page is
slow enough to matter across a 60-URL cap. I verified reachability, not cost or stability.

---

## 2b. The Exchange adapter — built on the iCalendar feed, not the HTML calendar

`server/services/sources/exchangeline.ts`. **This is the one billed adapter in the
folder**, and the only one that needs `FIRECRAWL_API_KEY`.

### Why the ICS feed

The site runs The Events Calendar (WordPress), which publishes
`/auctions/list/?ical=1`. Scraping that instead of the rendered calendar was worth doing:

| | HTML calendar | **iCalendar feed** |
|---|---|---|
| Firecrawl calls per run | 1 per page, paginated (`/auctions/list/page/2/` exists) | **1 total** |
| Events returned | 25 on page 1 | **28**, spanning 2026-06-13 → 2026-11-18 |
| Dates | "Mon 3" under a month heading — must be reassembled | `DTSTART;TZID=America/Chicago:20260909T100000` |
| Address | not in the listing | full `LOCATION` string |
| Detail URL | scraped from markup | canonical `URL` property |

Every one of the 28 events carries `DTSTART`, `SUMMARY`, `DESCRIPTION`, `URL` and
`LOCATION`. So one stealth call (~3.3s) yields the whole forward calendar with exact
timestamps — no date guessing, no pagination, no per-listing credit.

### The client's missing auction is captured

```
• 374.59 TAXABLE ACRES M/L SHELBY & HARRISON COUNTY FARMLAND AUCTION
    374.59ac | Harrison County | 2026-09-09T15:00:00.000Z
    https://www.exchangeline.com/auction/374-59-taxable-acres-m-l-shelby-harrison-county-farmland-auction/
```

Two things worth flagging about it:

1. **It is dated 2026-09-09 — still in the future**, and it is *not* on page 1 of the
   HTML calendar. Anything built on the HTML listing alone would have missed it again.
   The feed catches it.
2. **Its detail page says "AUCTION CONDUCTED BY: OSBORN AUCTION LLC"** — and Osborn is
   already source #41 in our 51. So this auction was reachable through a source we
   already scrape. That points at the sibling agents' territory (the archiver marking
   future-dated auctions as sold), not at a discovery gap. Adding exchangeline gives us
   a second independent path to it, which is worth having, but it is not the root cause.

Other Iowa farmland the feed surfaces right now: Poweshiek 220.50 ac, Mills & Montgomery
592.98 ac, Marshall 88.80 ac, Guthrie 140 ac, Cass 120.26 ac, Dallas 481.3 ac,
Appanoose 46.56 ac.

### DST correctness

The feed spans the 2026-11-01 CDT→CST boundary, so a hardcoded offset would put November
auctions an hour out. Offsets are resolved per-event with `Intl` (available in both Node
and Workers, no dependency). Verified on both sides of the boundary:

```
Sept 9  10:00 CDT → 2026-09-09T15:00:00.000Z   (UTC-5) ✓
Nov 18  10:00 CST → 2026-11-18T16:00:00.000Z   (UTC-6) ✓
```

### Known limits

- **No coordinates.** The feed has none, so these geocode — but from a real street
  address (tier 1), not a county centroid.
- **`LOCATION` is the sale venue, not the land.** The Shelby/Harrison sale is held in
  Harlan. `address` gets the venue, `county` is read from the title, and the existing
  enrichment step remains what separates auction location from property location.
- **Multi-county auctions collapse to one county.** "SHELBY & HARRISON" yields
  "Harrison". A single `county` column cannot represent both.
- **1 event skipped** on this run: an Iowa event with an empty `SUMMARY`. Reported as a
  warning rather than dropped silently.

---

## 3. Call signatures for wiring in

Everything is exported from `server/services/sources/index.js`. Nothing writes to the
database — each adapter discovers and returns; your save path owns persistence.

```ts
import {
  createVerifiedBidWranglerAdapters,
  createFarmMarketAuctionsAdapter,
  createLandHubAdapter,
  createIowaAuctioneersAdapter,
  createPeoplesCompanyCompanionAdapter,
  createBidWranglerAdapter,
  createListingAdapters,
  createDiscoveryAdapters,
  type SourceAdapter,
  type DiscoveredListing,
  type DirectoryEntry,
} from './sources/index.js';
```

The uniform contract:

```ts
interface SourceAdapter {
  name: string;
  discover(): Promise<{
    urls?: string[];            // feed these to the existing Firecrawl detail path
    listings?: DiscoveredListing[];  // save directly — no Firecrawl needed
    directory?: DirectoryEntry[];    // auctioneers, NOT auctions
    warnings?: string[];             // non-fatal parse/HTTP problems for diagnostics
  }>;
}
```

**The one call that covers the free listing sources:**

```ts
for (const adapter of createListingAdapters()) {   // 3 BidWrangler hosts + FMA + LandHub
  const { listings = [], warnings = [] } = await adapter.discover();
  // listings are Iowa-filtered, deduped, and ready for your existing save path
}
```

**The billed one is kept separate** so it can run on its own (slower) cadence and never
gets billed by accident alongside a frequent free sweep:

```ts
for (const adapter of createStealthListingAdapters()) {   // exchangeline — 1 credit/run
  const { listings = [], warnings = [] } = await adapter.discover();
}
```

It needs `FIRECRAWL_API_KEY` in the environment and **throws** if the key is missing or
the response is not an iCalendar document — deliberately, so an auth failure or a
Cloudflare block can never be mistaken for "this source has no auctions".

Individual constructors, if you prefer to register them one by one alongside the 51:

| Call | Returns |
|---|---|
| `createBidWranglerAdapter('hoenigauctions')` | listings |
| `createBidWranglerAdapter('uciowa')` | listings |
| `createBidWranglerAdapter('heritagelandauction')` | listings |
| `createFarmMarketAuctionsAdapter()` | listings |
| `createLandHubAdapter()` | listings |
| `createIowaAuctioneersAdapter()` | **directory only** |
| `createIowaAuctioneersAdapter({ withDetails: true, detailLimit: 200 })` | directory + websites |
| `createExchangeLineAdapter()` | listings — **billed, 1 Firecrawl credit per run** |
| `createPeoplesCompanyCompanionAdapter()` | listings — **see warning below** |

`createBidWranglerAdapter(host, displayName?)` is parameterised, so onboarding a newly
discovered BidWrangler tenant is a one-line change with no new code.

### `DiscoveredListing` fields

`url`, `title` are always present. Optional: `description`, `auctionDate`, `address`,
`acreage`, `county`, `state`, `latitude`, `longitude`, `sourceName`, `externalId`,
`updatedAt`, `auctionHouse`. Field names mirror the existing extraction schema in
`auctionScraper.ts` so no translation layer is needed.

Two conventions worth knowing when you wire the save path:

- **`auctionDate` is a string, not a Date.** BidWrangler gives real ISO timestamps;
  Farm Market Auctions gives its own text ("Wed, Aug 5, 2026 10:00 am"). Adapters do not
  resolve ambiguous dates or guess timezones — the existing date pipeline stays the single
  owner of date interpretation.
- **Missing means missing.** An adapter returns `undefined` rather than a default. A
  guessed `acreage` of 0 would flow into the CSR2 valuation as a real measurement.
- **`county` is normalised** — the "County" suffix is stripped, because LandHub returns
  "Clay County" while BidWrangler returns "Buchanan", and a stray suffix misses the county
  centroid and $/CSR2 rate lookups.

### ⚠ Peoples Company — additive only

`createPeoplesCompanyCompanionAdapter()` is deliberately **excluded** from
`createListingAdapters()`. Peoples Company is already Firecrawl source #4, and its
BidWrangler view is a strict subset: 3 upcoming Iowa auctions against 14 Iowa slugs on
peoplescompany.com, because the API only carries online-bidding sales. Wiring it as a
*replacement* silently drops 11 of 14 listings.

It is still worth adding **alongside** #4: all 3 records come with coordinates
(Buchanan 42.45283,-91.89025 / Fayette 42.66813,-91.89378 / Jones 42.22046,-91.17288),
plus `updated_at` for free change detection — neither of which the HTML scrape provides.
Note it takes ~32s because it walks all 13 pages of a 618-record history.

---

## 4. Implementation notes worth knowing

- **`fetch`, not axios.** These adapters must run in both the Node process and the
  Cloudflare Worker queue (`scrapeContext.ts`), and `fetch` is the only client available
  in both.
- **No new dependencies.** HTML parsing is regex-based because the repo has no
  cheerio/jsdom, and adding one for three well-delimited patterns would not pay for itself.
- **`Array.from` instead of spreads over Maps/matchAll.** The repo's `tsconfig.json` sets
  no `target`, so it defaults to ES5 and iterator spreads trip TS2802. My files typecheck
  clean under `npm run check`; note that check currently reports pre-existing errors in
  ~7 other server files that are not mine.
- **Loud failure, not silent zero.** Every adapter pushes a `warnings` entry when it
  fetches successfully but parses nothing (missing `__NEXT_DATA__`, no rows matching the
  auction signature). A source that quietly returns `[]` after a layout change is the
  failure mode that hides for months.
- **Bounded walks.** Every paginator has a hard page cap so a layout change cannot spin a
  scheduled scrape into an unbounded loop, plus a courtesy delay between requests.

### Bugs found and fixed during verification

Every one of these was found by running the adapters against live data, not by reading
the code — they all typechecked clean.

1. **`parseCounty` swallowed a leading word** — "155 Acres Clay County" parsed as
   "Acres Clay". Guarded with a stopword list, plus a single-letter rule after
   "120.26 ACRES M/L CASS COUNTY" produced "L Cass".
2. **Farm Market Auctions repeats auctions across its 8 tables** — one consignment sale
   appeared in 3 rows. Without dedupe that auction would upsert as three separate rows
   every night. Now keyed on URL + date (19 raw → 17 unique).
3. **`parseCounty` was case-sensitive on the word "County"** — so ALL-CAPS titles, which
   The Exchange uses almost exclusively, matched nothing. Now case-insensitive, and
   `normalizeCounty` title-cases an all-caps result so "SHELBY" becomes "Shelby" and
   actually hits the county centroid and $-per-CSR2 tables.
4. **`parseAcreage` missed the headline figure when a qualifier sat between number and
   unit** — "374.59 TAXABLE ACRES M/L" returned nothing, and "592.98 TAXABLE ACRES"
   silently fell through to a 43.66-acre tract figure buried in the description. That
   defect hit the client's own auction, which is exactly the listing this work is about.
5. **LandHub's `acres` is sometimes null** even when the title states it — "152.8 Acres
   Emmet County" was arriving with no acreage. Now falls back to the title.

---

## 5. What I did not build, and what I would do next

Not built: Ranch & Farm, HiBid, LandProz, United Country, AuctionZip, TractorZoom,
Southlaw PDF. These need full page rendering plus LLM extraction, so they belong in the
existing Firecrawl scraper rather than here — the adapters in this folder all read a
structured feed, which is what keeps them to one request each.

Ranked next steps:

1. **Wire the 6 listing adapters** — 54 Iowa listings total (35 free + 19 from The
   Exchange), 17 pre-geocoded, for 1 Firecrawl credit per run.
2. **Schedule the directory sweep monthly** and diff its 198 websites against the 51 to
   produce a standing candidate list. Country Mile and Head Auctions are already waiting.
3. **Reconsider HiBid** — it renders under stealth, so the Wave 3 risk is much lower than
   assumed, though 11–13s/page and stealth pricing still need a cost model. Note the ICS
   trick does not transfer: HiBid publishes no feed, so it is genuinely per-page.
4. **Check whether other sources expose an ICS feed.** The Exchange turned out to cost
   1 credit instead of ~5 purely because it runs The Events Calendar. Any WordPress
   auctioneer site on the same plugin has `?ical=1`, and that is worth probing before
   writing an HTML parser for them.

Open items I could not settle:
- Whether stealth rendering is *stable* on HiBid and exchangeline, or whether I caught a
  good moment. Both were probed on a single day.
- Whether these listings duplicate existing sources. Farm Market Auctions surfaces Zomer
  (source #6) and Sullivan (#21) rows, and The Exchange's Shelby/Harrison auction is run
  by Osborn (#41) — so overlap is certain. **The 54-listing count is gross, not net-new**,
  and the sibling dedupe work determines the real figure.
- Whether the ICS feed is bounded. It returned 28 events out to 2026-11-18, but I do not
  know whether The Events Calendar caps the export or simply had nothing further out. If
  auctions ever appear beyond the feed's horizon, this adapter would miss them silently.
