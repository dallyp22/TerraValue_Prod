# Farmscope/TerraValue — DB hosting + Auction scraping plan

_Saved 2026-06-07. Working reference for the MotherDuck question, Neon cost, and scraper improvements._

## 0. Neon DB topology (investigated 2026-06-07)

There is **only ONE Farmscope database.** The two projects on the Neon account are different products:

| Project | ID | Region | Size | What it is |
|---|---|---|---|---|
| **terravalue-db** | `noisy-breeze-73774441` | aws-us-east-2 | 5.8 GB, 1 branch (`main`) | THE Farmscope DB. Endpoint `ep-proud-sun-aeushju0`. Holds parcels, auctions, land_sales_comps, valuations, soil_*. App `.env` (DATABASE_URL / _UNPOOLED / _SOIL) all point here. |
| **neon-champagne-sail** | `winter-grass-89005980` | aws-us-east-1 | 112 MB, 3 branches | NOT Farmscope — it's the CoachIQ / Co-Create app (coach_settings, prep_briefs, sessions, transcripts, invoices, billing_groups; Prisma-managed). |

- Neon org: `org-royal-mountain-19995300` (Vercel-managed, "launch" plan). `neonctl` is installed at `~/.bun/bin/neonctl` and authenticated.
- Conclusion: Farmscope is **not** double-billing. All TerraValue Neon compute = `terravalue-db`.
- Co-Create cleanup (separate bill, not Farmscope): champagne-sail has 2 extra `preview/*` branches consuming storage.

## A. MotherDuck question

**Can't move the whole DB to MotherDuck.** The app is deeply PostGIS-dependent (verified across 12 modules):
live vector-tile serving (`ST_AsMVT`/`ST_AsMVTGeom`/`ST_TileEnvelope` in `server/services/parcelTiles.ts`,
worker route `/parcels/tiles/:z/:x/:y`), `ST_ClusterDBSCAN`, `ST_Intersects`, `ST_Union`, `ST_Simplify` over
parcels (2.45M geom) and parcel_aggregated (1.5M). MotherDuck/DuckDB is OLAP/columnar, has no `ST_AsMVT`,
weaker geo indexing, and isn't built for per-request transactional reads/writes from Workers. Moving it breaks
the map + geocoding.

**Recommended hybrid (do this):** scheduled sync publishes the tabular, non-geo slices to a MotherDuck
`farmscope` DB (read-only mirror): `land_sales_comps`, `auctions`, `valuations`, `county_csr2_rates`. Then the
MotherDuck MCP can query Farmscope comps/auctions/valuations directly in Claude for daily use — zero app load,
zero risk. Implementation: small Worker cron or script; these tables are tiny.

**Neon cost lever (the real fix — it's NOT the host):** the compute is the PostGIS tile/parcel workload, not
transactional queries. Smoking gun: `parcelTiles.ts` caches tiles with `NodeCache` (in-memory) — useless on
Cloudflare Workers (fresh isolate per request), so every map pan/zoom regenerates MVT tiles via `ST_AsMVT` over
1.5M parcels, hitting Neon each time. Fixes, in order:
1. Move tile cache off NodeCache → Cloudflare Cache API / KV / R2 (tiles immutable per z/x/y). Likely the big win.
2. Better: pre-bake parcels to a static tileset (parcels are static) served from R2/Mapbox like existing
   `dpolivka22.*` tilesets in `EnhancedMap` — removes the heaviest Neon workload entirely.
3. Verify autosuspend ~5 min on terravalue-db.
4. Pull Neon usage breakdown (compute vs storage vs transfer) to confirm (inference is code-based).

## B. Auction scraping — why auctions are being missed

Pipeline: `server/services/auctionScraper.ts` (51 hardcoded sources) → Firecrawl discovery → per-URL extract → upsert.

**Confirmed auction-droppers:**
1. **Hard 20-URL cap per source** (`auctionScraper.ts:373` and `:486`; `stats.missingUrls = prioritizedUrls.slice(20)`).
   Busy auctioneers lose everything past 20 listings, silently. Biggest miss.
2. **Naive Iowa detection by URL substring** (`:355–363`, only `-ia`/`iowa`/`_ia_`). Iowa auctions whose URL lacks
   those tokens get deprioritized then cut by the 20-cap. Also false positives.
3. **No retry logic** — every catch logs & continues (`:426`,`:437`,`:510`); a transient Firecrawl timeout
   permanently drops that URL for the run.
4. **Single-strategy capped discovery** — map → listing-extract → search, all capped; paginated/JS sites under-read.

**Structural gaps:** 51 sources hardcoded (adding one needs a deploy; no DB registry); blocklist not enforced at
scrape; no "what did we miss" audit surfaced (missingUrls only logged, file-writes are no-ops on Workers).

**Plan:**
- **Phase 1 (high ROI):** raise/remove the 20-cap (paginate, cap ~100 w/ logging); use parsed listing
  state/county instead of URL-substring for Iowa; add retry-with-backoff around Firecrawl; surface missed/failed
  counts in the admin console.
- **Phase 2 (coverage):** move sources to a DB table + admin "add source" UI; add missing big aggregators
  (LandWatch deeper paths, AuctionLook, Hibid/Proxibid filtered to Iowa farmland); discovery-audit job alerting
  when a source drops to zero (broken selector).
- **Phase 3 (quality):** URL normalization + content fingerprint (county+date+acreage) dedup; enforce blocklist
  at scrape.

**Cross-check we can run now:** Land Talk comps already name the auction company for thousands of real Iowa
sales. Diff "auction firms that actually sold Iowa farmland (per Jim)" vs the 51 scraper sources → data-driven
list of missing auctioneers. Turns "I heard we're missing some" into a concrete target list.

## Open decisions / suggested order
1. MotherDuck hybrid mirror (tabular → MotherDuck for MCP) — recommended yes.
2. Neon cost: start with tile-cache fix; pull Neon usage breakdown to confirm.
3. Scraping: start Phase 1 + run the Land Talk-vs-sources gap analysis.

Suggested order: scraping Phase 1 + gap analysis → tile-cache fix (cost lever) → MotherDuck mirror.
