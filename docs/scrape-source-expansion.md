# Scrape Source Expansion — Onboarding Plan

> Author: source-coverage pass, 2026-08-03.
> Inputs: `docs/Auction_Scraping_Overview.md` (current 51), `server/services/auctionScraper.ts`,
> and the 2026-07-17 deep-research bundle (`Kimi_Agent_Iowa Land Auction Sites & Capture (1)/`).
> **All "VERIFIED" claims below were live-probed with curl on 2026-08-03.** Everything else is
> labelled ASSUMED and inherited from the research at face value.
>
> Scope note: this document covers **which sources and how to capture them**. It deliberately does
> not diagnose why the existing 51 miss listings — that is a separate workstream.

---

## 0. Executive summary

The research's central architectural thesis — *4 platform adapters beat 60 per-site scrapers* — is
**directionally right but its cost model is wrong**. The specific "free/easy" claims that made the
plan attractive did not survive live probing:

| Research claim | Live result 2026-08-03 | Verdict |
|---|---|---|
| BidWrangler `/api/auctions` returns `location.lat/lng` | `location` is **null on most auction-list records**; lat/lng lives on `/api/auctions/{id}/items` | **Partly wrong** — method works, wrong endpoint |
| Peoples Company can "move to $0" via BidWrangler | API exposes **3** upcoming IA auctions; peoplescompany.com shows **14** | **Wrong — swapping loses 79% of listings** |
| LandHub has "~90 IA auction listings" | 113 Iowa listings total, of which **3** are `listing_type == Auction` | **Wrong by ~30×** |
| Ranch & Farm Auctions is "plain HTTP scrape", "#1 new source" | 200 OK but **zero listings in static HTML** (Laravel+Vite client render) | **Wrong on method** |
| exchangeline.com is "Easy / plain scrape / no anti-bot" | **403 Cloudflare** on both the index and the client's missing auction | **Wrong** |
| HiBid: "parse embedded `lotModels` JSON" | Angular SPA shell, **no `lotModels`**, Cloudflare Turnstile present | **Wrong on method** |
| NextLot: "embedded `gon_NextLotJSDATA` JSON" | Present, but contains **site config only** (`site_id`, `site_name`) — no listings | **Wrong on method** |
| AuctionZip is behind a "403 wall" | **200 OK** to plain curl (listings still JS-rendered) | **Wrong in our favour** |
| iowaauctioneers.org/places is a static directory | Confirmed: WordPress GeoDirectory, plain HTML, 21 pages | **Correct** |
| farmmarketauctions.com is a plain HTML table | Confirmed: 90 data rows, 20 Iowa rows | **Correct** |

**The corrected headline:** the genuinely free wins are smaller than advertised (a handful of
auctions, not ~90), but three of them are real, zero-credit, and worth taking immediately. The
large-volume sources (HiBid, Ranch & Farm, The Exchange) *all* require Firecrawl rendering — the
"$0 platform adapter" shortcut mostly does not exist.

---

## A. Reconciliation against the current 51

### Bucket 1 — genuinely NEW (not represented in the 51)

Ordered by verified or best-estimated Iowa yield.

| Candidate | Coverage | Capture | Verified? |
|---|---|---|---|
| **Farm Market Auctions** (M6) | NW IA / MN / SD calendar | Plain HTML table, 0 credits | ✅ 90 rows, 20 IA, ~3–4 IA land live now |
| **The Exchange / KMA** (M5) | SW Iowa, near-complete | **Cloudflare — needs Firecrawl stealth** | ✅ 403 to curl; holds the client's missing Shelby/Harrison auction |
| **Ranch & Farm Auctions** (A1) | Statewide IA | Firecrawl render (not plain HTTP) | ✅ 200, Iowa page confirmed by `<title>`, listings JS-only |
| **HiBid Iowa Ag/Farm Land** (A2) | Statewide umbrella | Firecrawl stealth; Turnstile | ✅ SPA shell confirmed |
| **LandHub** (A5) | Statewide aggregator | `__NEXT_DATA__`, 0 credits, free lat/lon | ✅ 3 IA auctions, coords present |
| **Hoenig Auctions** (B28) | Burlington / Des Moines Co. | BidWrangler JSON, 0 credits | ✅ 42 total, 12 upcoming IA, 2 land |
| **UC Iowa (uciowa)** (A4) | Statewide UC franchise | BidWrangler JSON, 0 credits | ✅ 14 total, 2 upcoming IA land, **both with lat/lng** |
| **Heritage Land & Auction** (B11) | Dyersville | BidWrangler JSON, 0 credits | ✅ live, but **0 Iowa auctions right now** |
| **Iowa Auctioneers Assn directory** (M1) | Discovery only | Plain HTML, 21 pages, 0 credits | ✅ GeoDirectory confirmed |
| **Southlaw IA foreclosure PDF** (M8) | Distress early-warning | Single PDF fetch + parse, 0 credits | ✅ 200, 69 KB PDF |
| **TractorZoom IA directory** (M2) | Discovery only | Firecrawl render | ✅ 200, 431 KB |
| **United Country portal** (A6) | UC offices statewide | Firecrawl render | ✅ 200, 113 KB |
| **LandProz** (A3) | IA statewide (MN HQ) | Firecrawl render (JS) | ✅ 200 but listings JS-only |
| **AuctionZip Iowa** (M3) | Statewide directory + bills | Firecrawl render | ✅ **200, not 403** |
| B2–B41 long tail (~40 firms) | County-level | Mostly via HiBid/NextLot adapters | ❌ ASSUMED from research |

### Bucket 2 — already covered, proposed method differs

| Existing source | Proposed change | Verdict |
|---|---|---|
| **#4 Peoples Company** (Firecrawl) | Research: replace with BidWrangler JSON at $0 | ❌ **Reject as a replacement.** API = 3 upcoming IA auctions; site = 14. **Adopt as an additive companion** for free lat/lng + `updated_at` change detection. |
| **#4 Peoples Company** | *(new, mine)* the site's 14 Iowa auction slugs are in **static HTML** — a plain fetch may replace the render step | ✅ Verified; worth a cheap experiment |
| **#33 Hallberg, #39 McGuire** (HiBid subdomains) | Fold into one HiBid adapter | ✅ Sensible — both are Turnstile-gated today |
| **#35 Jim Hughes** (`placebids.net`) | Reclassify as NextLot | ✅ Confirmed — `gon_NextLotJSDATA` present |
| **#8 DreamDirt** | Add `/pastauctions` for results/$-per-acre | ✅ Reasonable; results not discovery |
| **#9 LandWatch** (western-IA only) | Widen to statewide | ✅ Real gap in the current config |

### Bucket 3 — redundant / skip

| Candidate | Reason |
|---|---|
| **Land And Farm** (A8) | 403 Akamai; research itself says ~100% overlap with existing Land.com/LandWatch |
| **Land Broker MLS** (A7) | 429 rate-limited on probe; ~5 live listings |
| **Whitetail Properties** | Same inventory as Ranch & Farm; CF-blocked |
| **Klein Realty / Westra / R. Stabe** | Consortium members of Iowa Auction Group; **Stabe is already #45** |
| **Mossy Oak Properties** (A10) | ~1–2 IA/yr |
| **AcreValue** (A9) | Hard, ~5–15, LOW confidence |
| **GovDeals** (M13), **NAA directory** (M14), **tax-sale liens** (M10) | Thin / not title / login-gated |
| **W1–W22 watchlist** | Unverified by construction — feed through the discovery loop, don't hand-onboard |

---

## B. Live probe results (2026-08-03)

Raw evidence for every claim above.

### B.1 BidWrangler JSON API — **works, with corrections**

```
GET https://{host}.bidwrangler.com/api/auctions
peoplescompany       200 application/json  545 KB
uciowa               200 application/json 1.83 MB
hoenigauctions       200 application/json 1.81 MB
heritagelandauction  200 application/json   48 KB
```

Response envelope: `{ total, page, per_page, auctions[], all_auction_ids[] }` — 50 per page.
`?page=N` pagination verified (page 1 vs page 2 share **0 of 50** IDs).

| Host | `total` | Upcoming | Upcoming IA | IA land | With lat/lng |
|---|---|---|---|---|---|
| peoplescompany | 618 | 3 | 3 | 3 | **0** |
| uciowa | 14 | 2 | 2 | 2 | **2** |
| hoenigauctions | 42 | 12 | 12 | 2 | 1 |
| heritagelandauction | 2 | 2 | 0 | 0 | 0 |

**Correction 1 — lat/lng is not where the research said.** On the auction-list endpoint,
`location` is null for the records that matter (all 3 upcoming Peoples Company auctions).
It *is* reliably present one level down:

```
GET /api/auctions/165570/items  → 200, 45 KB
item.location = {"street":"Jamestown Avenue","city":"Independence","state":"IA",
                 "zip":"50644","county":"Buchanan","lat":"42.4528262","lng":"-91.8902491"}
```

So the adapter is a **two-call pattern**: list auctions → fetch `/items` for Iowa candidates.
Still free. Item records also carry `description_without_html`, `documents`, `images`,
`scheduled_end_time`, and `ai_context`.

**Correction 2 — the API is a subset, not a superset.** Walking all 13 pages of Peoples Company
(618 unique auctions, full history) yields exactly **3** upcoming Iowa auctions:

- Buchanan County, IA ONLINE ONLY — 33.75 ac (ends 2026-08-14)
- Fayette County, IA — 151.86 ac (ends 2026-08-27)
- Jones County, IA ONLINE ONLY — 172.48 ac (ends 2026-09-02)

Meanwhile `peoplescompany.com/listings?type=auctions` exposes **14 Iowa auction slugs** in static
HTML: Buchanan, Cass, Fayette, Guthrie, Hamilton, Jasper, Jones, Monroe, Palo Alto,
Buchanan (residential), Madison, Warren, Wayne, Webster.

The API only carries auctions routed through BidWrangler's **online bidding** platform; live/
in-person sales never appear. **Replacing the Firecrawl scrape with the API would silently drop
11 of 14 Iowa auctions.** Use it additively.

### B.2 LandHub — method right, volume wrong

```
GET https://landhub.com/property-for-sale/iowa-land-for-sale → 200 (redirects to www.)
```

`__NEXT_DATA__` confirmed. `props.pageProps.dataFromServer` is an array of 12 records/page with:
`latitude, longitude, county, acres, price, listing_type, category, title, city, state, zipcode`.
`?page=N` pagination verified. `returnedPropertyNumberFromDatabase = 113`.

All 10 pages fetched → **113 unique Iowa listings**:

```
For Sale 104 | Under Contract 5 | Auction 3 | New Listing 1
```

The 3 auctions (all with coordinates):
- 161.2 ac Clay County — 2 tracts
- 155 ac Dickinson County
- 213± ac Monroe County, IA

**The "~90 IA auction listings" claim is wrong by roughly 30×** — it appears to have counted total
listings, not auction-typed ones. Still worth onboarding: zero credits, free coordinates, and it
surfaces sellers outside our auctioneer list. Just do not budget for 90.

### B.3 The Exchange / exchangeline.com — **Cloudflare, not "easy"**

```
GET https://www.exchangeline.com/auctions/                                    403
GET https://www.exchangeline.com/auction/374-59-taxable-acres-m-l-shelby-...  403
Body: "Attention Required! | Cloudflare"
```

Both the calendar index and **the exact auction the client reported missing** return 403 to plain
HTTP. The research rated this "Easy / None / plain scrape" — that is wrong today. It needs
Firecrawl stealth rendering, which also means it is not free.

This matters disproportionately: the client has a concrete, named coverage gap sitting on this
source, so it earns a Wave 1 slot despite the cost.

### B.4 Ranch & Farm Auctions — no listings in static HTML

```
GET https://ranchandfarmauctions.com/auctions?state=IA → 200, 105 KB
<title>Auction Listings in Iowa | Ranch and Farm Auctions</title>
```

Right page, but the body contains **only the search form** (state/county dropdowns). Verified
absent: `__NEXT_DATA__`, `application/ld+json`, Inertia `data-page`, any `"lat"` token. Visible
text is 11.4 KB and contains 2 occurrences of "County" — all from the dropdown, no listings.
Single bundle: `/build/assets/app-DoqZzKRu.js` (Laravel + Vite, client-rendered).

The companion `ranchandfarmauctions.nextlot.com/auctions` is likewise a shell (see B.6).
So the research's "#1 new source, Easy, plain HTTP" is **wrong on method** — it is a
Firecrawl-render source. It may still be the best *new* statewide source by volume; that part is
untested and remains ASSUMED (research claimed 10 live IA events on 2026-07-17).

### B.5 HiBid — Angular SPA behind Turnstile

```
GET https://www.hibid.com/iowa/auctions/40311/real-estate/ag---farm-land  200, 704 KB
  lotModels: 0   __NEXT_DATA__: 0   ng-state: 0   ld+json: 0
  <title>Live and Online Auctions on HiBid.com</title>   (generic — not the category title)
  loads challenges.cloudflare.com/turnstile/v0/api.js
GET https://hallbergauction.hibid.com/company/71843/... 200, 10.7 KB
  visible text = "Hibid"  (7 chars) + turnstile + challenge markers
```

The PWA bundle (`cdn.hibid.com/cdn/pwa/1.20.9.2/main.*.js`) returned **2 bytes** to curl, so the
API base could not be recovered without a browser. Direct API guesses all failed
(`/api/v1/auctions` → 302, `/apiservices/auction/search` → 200 text/html, `api.hibid.com` → 302).

Implication: **our existing HiBid sources (#33 Hallberg, #39 McGuire) are already dependent on
Firecrawl stealth** and get a 7-character page on a plain fetch. A HiBid adapter is the highest
potential yield *and* the highest cost/risk item in the plan. It is Wave 3, not Wave 1.

### B.6 NextLot — `gon_NextLotJSDATA` is site config, not listings

```
ranchandfarmauctions.nextlot.com/auctions  200, 22.7 KB  gon_NextLotJSDATA ×13
hufflandcompany.nextlot.com/auctions       200, 19.3 KB  gon_NextLotJSDATA ×13
jimhughesrealestate.placebids.net/auctions 200, 27.6 KB  gon_NextLotJSDATA ×13
```

The object's assigned keys are exclusively site metadata:

```
global, current_site, webapp_root_path, webapp_root_base_url, webapp_bidder_login_url,
site_id, site_name, site_name_short, site_timezone_name, site_homepage_banner,
site_initial_catalog_lots_view_mode, site_notification_sms_auction_timeline_enabled
```

No lots, no auctions, no coordinates. RFA's NextLot page has 4.2 KB of visible text — all
navigation, brokerage licensing boilerplate, and PWA install instructions; the only `auction`
hrefs point back to marketing pages. **NextLot needs rendering too.** Confirms `placebids.net`
is NextLot (so existing #35 is a NextLot source), which is useful for adapter consolidation.

### B.7 AuctionMethod / DreamDirt

```
GET https://bid.dreamdirt.com  200, 42.6 KB
  ng-cloak markers (Angular), no embedded JSON, 2.8 KB visible text, 0 "acre" mentions
```

Client-rendered. Already source #8, so no change; the incremental value is `/pastauctions` for
sold-price capture.

### B.8 Farm Market Auctions — **the best verified free win**

```
GET https://farmmarketauctions.com  200, 117 KB — 8 tables, 103 <tr>, 90 data rows
```

Plain server-rendered HTML table, no anti-bot, columns `DATE | AUCTION | OWNER | CITY | AUCTIONEER`.
**20 Iowa rows**, of which 5 match land keywords and ~3 are genuine Iowa farmland auctions today:

- Tue Aug 4 — Major Live Public Land Auction, 8 Tracts, **O'Brien County IA** — Zomer Company
- Wed Aug 5 — Land Auction 120± ac, **Osceola County, Iowa** — Klaassen
- Wed Sep 2 — Farmland Auction 392± ac, **Seneca Twp, Kossuth County, Iowa** — Hurlburt Family

Note the discovery value: Zomer is already source #6, but **Klaassen is not in our 51**. This is
simultaneously the cheapest listing source and a working auctioneer-discovery feed.

### B.9 Discovery directories

```
GET https://iowaauctioneers.org/places/   200, 195 KB
  WordPress GeoDirectory (268 "geodir" markers, 49 "gd_place"), pagination /places/page/2..21
  16 member profile links on page 1 → ~300 members statewide
GET https://tractorzoom.com/auctioneer/midwest/iowa  200, 431 KB  (JS SPA — needs render)
```

M1 confirmed: plain HTML, zero credits, ~21 pages. This is the cheapest scaling mechanism in the
whole plan and the research was right about it.

### B.10 Remaining probes

| URL | Status | Note |
|---|---|---|
| `landproz.com/auctions/` | 200, 293 KB | JS-rendered — 0 "County", 4 "acre", no detail links |
| `iowaauctiongroup.com/.../upcoming-auctions/` | **403** | Cloudflare, as research predicted |
| `auctions.unitedcountry.com/search-auction/us/ia` | 200, 113 KB | SPA, needs render |
| `southlaw.com/report/Sales_Report_IA.pdf` | 200, 69 KB | ✅ real PDF, parseable |
| `landbrokermls.com/...?selectedListingFormat=Auction` | **429** | rate-limited (research said 403) |
| `landandfarm.com/search/iowa-land-for-sale/auctions/` | **403** | Akamai, as predicted |
| `auctionzip.com/ia.html` | **200**, 150 KB | research said 403 — **wrong**; listings still JS-only |

---

## C. Onboarding sequence

Ranked by (Iowa auctions gained) / (effort + Firecrawl cost). Counts marked ✅ are ones I counted
live today; counts marked ~ are estimates.

### Wave 1 — free or client-critical (target: ~2 days)

Everything here except item 6 costs **zero Firecrawl credits**.

| # | Source | Capture | IA auctions added | Cost |
|---|---|---|---|---|
| 1 | **Farm Market Auctions** | Plain HTML table parse | ✅ 3–4 now (+ discovery) | 0 |
| 2 | **BidWrangler adapter** — `uciowa`, `hoenigauctions`, `heritagelandauction` as new sources | JSON list → `/items` for coords | ✅ 4 now | 0 |
| 3 | **BidWrangler as companion to #4 Peoples Company** — *additive, not a swap* | JSON → free lat/lng + `updated_at` | 0 new, but **kills geocoding for 3** | 0 |
| 4 | **LandHub** | `__NEXT_DATA__` parse, 10 pages | ✅ 3 now, with coords | 0 |
| 5 | **Iowa Auctioneers Assn directory** | Plain HTML, 21 pages, monthly | 0 direct — feeds the loop | 0 |
| 6 | **The Exchange / exchangeline** | **Firecrawl stealth** (403 to curl) | ~10–25 SW IA + the client's reported miss | ~25 cr/run |
| 7 | **Southlaw foreclosure PDF** | Fetch + parse, weekly | Distress early-warning | 0 |

**Wave 1 net new Iowa auctions visible today: ~10–14** (10 verified by direct count, plus The
Exchange's SW Iowa calendar which I could not enumerate through the 403).

Also in Wave 1 as a cheap experiment: **test whether Peoples Company's 14 Iowa slugs can be read
with a plain fetch** instead of a Firecrawl render — the slugs are in static HTML today, so this
may cut cost on an existing source rather than add one.

### Wave 2 — render-dependent, good yield (target: ~1 week)

| # | Source | Capture | IA auctions added | Cost |
|---|---|---|---|---|
| 8 | **Ranch & Farm Auctions** | Firecrawl render `?state=IA`, paginate | ~10–25/yr (ASSUMED) | ~15 cr/run |
| 9 | **LandWatch statewide** (widen existing #9 from western-only) | existing pipeline, new URLs | ~5–15 | low |
| 10 | **LandProz** | Firecrawl render | ~10–30/yr (ASSUMED) | ~10 cr |
| 11 | **United Country portal** | Firecrawl render | covers 6 UC offices | ~10 cr |
| 12 | **TractorZoom directory** | Firecrawl render, monthly | discovery + reveals each firm's platform | ~10 cr |
| 13 | **AuctionZip Iowa** | Firecrawl render (200, cheaper than assumed) | directory + sale bills | ~10 cr |
| 14 | **DreamDirt `/pastauctions`** | extend existing #8 | results/$-per-acre, not discovery | low |

**Wave 2 estimated net new Iowa auctions: ~20–40/yr**, mostly ASSUMED rather than counted.

### Wave 3 — hard, high-ceiling (target: opportunistic)

| # | Source | Why last |
|---|---|---|
| 15 | **HiBid Iowa adapter** | Highest single yield claimed, but Turnstile + Angular + CDN closed to curl. Also the fix for existing #33/#39. Budget a real spike. |
| 16 | **NextLot adapter** (RFA, Huff, Webster, + existing #35) | Needs rendering; consolidates rather than adds |
| 17 | **Iowa Auction Group** (403) + long-tail B-list | Per-site Cloudflare work, county-level yield |
| 18 | **Iowa Public Notices email alerts** | Free but email-ingest plumbing, not scraping |
| 19 | **County sheriff-sale viewers** (Polk et al.) | Bespoke per county |

---

## D. Platform adapter contracts

### D.1 BidWrangler — **build this one first**

- **Entry:** `GET https://{client}.bidwrangler.com/api/auctions`
- **Pagination:** `?page=N`, 50/page. `total` and `all_auction_ids[]` let you size the walk up
  front. Verified: no overlap between pages.
- **Structured data:** native JSON. No parsing, no LLM, no render.
- **Free fields (auction):** `id, name, description, simple_description, status, starts_at,
  scheduled_end_time, updated_at, items_count, online_only, complete, archived, photo_url,
  contact_*, timezone`
- **Free fields (item, via `/api/auctions/{id}/items`):** `location{street,city,state,zip,county,
  lat,lng}`, `description_without_html`, `images`, `documents`, `scheduled_end_time`,
  `listing_price`, `details_url`
- **lat/lng:** ✅ on **items**, ❌ mostly null on the auction list. Two-call pattern required.
  When present it **fully skips geocoding** — county comes free too.
- **Change detection:** `updated_at` on every record — cheap incremental refresh.
- **Anti-bot:** none observed. Plain curl, no UA requirement, no rate limiting hit across 13
  sequential page fetches.
- **Replaces:** nothing outright. **Augments** #4 Peoples Company (coords + freshness only).
  **Adds** uciowa, hoenigauctions, heritagelandauction.
- **Caveat:** covers only online-bidding auctions. Never treat as a complete view of a house's
  inventory — proven 3-of-14 on Peoples Company.

### D.2 HiBid

- **Entry:** `https://www.hibid.com/iowa/auctions/40311/real-estate/ag---farm-land`; per-company
  `https://{company}.hibid.com/company/{id}/{slug}`
- **Pagination:** `?apage=N` (ASSUMED — not reachable without a browser)
- **Structured data:** **none in HTML.** Angular PWA; research's `lotModels` claim did not
  reproduce. Data must come from the XHR the SPA makes, captured via a real browser.
- **Free fields:** unknown — could not observe. Historically HiBid exposes lot titles, dates,
  and company/city; **coordinates are not expected**, so geocoding still required.
- **Anti-bot:** **Cloudflare Turnstile**, explicit. Plain curl on a company page yields a
  7-character body. CDN bundle refused to serve (2 bytes).
- **Replaces:** existing #33 Hallberg and #39 McGuire; unlocks B2, B3, B5, B26–B31, B34.
- **Recommendation:** do a timeboxed spike with Firecrawl stealth to see whether the category
  page renders at all before committing. This is the plan's main unquantified risk.

### D.3 NextLot

- **Entry:** `https://{client}.nextlot.com/auctions`; also `*.placebids.net`
- **Pagination:** unknown (listings not observable without render)
- **Structured data:** `gon_NextLotJSDATA` exists but is **site config only** — `site_id`,
  `site_name`, `site_timezone_name`, root paths. Useful for identifying the tenant, useless for
  listings.
- **Free fields:** none server-side. `site_timezone_name` helps date normalization.
- **lat/lng:** none observed.
- **Anti-bot:** none — plain 200s on all three hosts. Just empty of data.
- **Replaces:** consolidates existing #35 (Jim Hughes / placebids); adds Huff, Webster, and the
  RFA mirror.
- **Note:** since RFA's own site and its NextLot mirror are both render-only, scrape whichever
  renders more cheaply — no reason to do both.

### D.4 AuctionMethod (DreamDirt)

- **Entry:** `https://bid.dreamdirt.com`, plus `/pastauctions` for results
- **Structured data:** none embedded; AngularJS (`ng-cloak`) client render
- **Free fields:** none server-side
- **lat/lng:** none observed — geocoding still required
- **Anti-bot:** none; 200 to plain curl, just empty
- **Replaces:** nothing — DreamDirt is already #8. The only new value is results capture
  (`$/acre`, `$/CSR2 point`) from `/pastauctions`.

### D.5 The pattern worth internalizing

Three of the four platform families embed **no listing data server-side**. The adapter dividend
the research promised is real only for **BidWrangler**. For HiBid / NextLot / AuctionMethod, an
"adapter" means *a shared render + extraction recipe*, which saves engineering effort but **not
Firecrawl credits**. Budget accordingly: this plan reduces per-site code, not per-site cost.

---

## E. Recommended immediate actions

1. Build the **BidWrangler adapter** (list → items). Three new sources, free coordinates,
   free change detection, no anti-bot. Highest confidence item in the plan.
2. Add **Farm Market Auctions** — a plain table parse, arguably an afternoon's work.
3. Add **LandHub** `__NEXT_DATA__` — free coordinates; set expectations at ~3 auctions, not 90.
4. **Do not** swap Peoples Company to the BidWrangler API. Wire it in additively.
5. Route **The Exchange** through Firecrawl stealth and confirm the client's reported
   Shelby/Harrison auction lands — that is the one gap with a name attached to it.
6. Stand up the **Iowa Auctioneers Assn** monthly directory sweep so new auctioneers keep arriving
   without manual research passes.
7. Timebox a **HiBid render spike** before planning anything that depends on it.

## F. Open questions / what I did not verify

- **Ranch & Farm Auctions' actual Iowa volume.** Listings are render-only; I confirmed the page
  exists and is Iowa-scoped but never saw a listing. The research's "10 live IA events" is
  unverified.
- **The Exchange's Iowa volume** — blocked by 403; "25 upcoming events" is inherited on faith.
- **HiBid's yield**, the single largest claim in the research, is entirely unverified.
- **The ~40-firm B-list (B2–B41)** was accepted from the research without probing.
- **Dedupe load.** The research's Insight 4 (same sale appearing 3–5×) is plausible and, if
  correct, means the marginal *unique* yield of aggregators (LandHub, AuctionZip, Land And Farm)
  is lower than their raw counts. I did not cross-match listings between sources to test it.
- Whether **Firecrawl stealth actually defeats** Cloudflare Turnstile on HiBid or the Cloudflare
  challenge on exchangeline — untested; the whole Wave 2/3 cost model rests on it.
