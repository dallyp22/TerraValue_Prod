# Auction Scraping Overview

> Current as of July 2026. Reflects the pipeline in `server/services/auctionScraper.ts`,
> `firecrawl.ts`, `automaticScraper.ts`, and `auctionEnrichment.ts`.
> Supersedes the source list in `Auction_Scraper_Guide.md` (which predates the expansion to 51 sources).

## What we're looking for

**Iowa farmland auctions.** Target fields per listing: title, description, **auction date**,
address/location, **acreage**, land type, **county**, state, and sold status. Iowa-ness is
determined from the parsed listing state, not the URL.

## How we scrape

### Scheduling

`automaticScraper.ts` runs on a DB-configured schedule (`scraper_settings`: daily,
every-other-day, or weekly at a set time). It checks hourly whether `nextRun` has passed,
with a 2-hour guard against duplicate runs. A manual "trigger now" also exists in the UI.

### URL discovery (per source, all 51 sequentially)

All scraping goes through **Firecrawl**. For each source, three strategies are merged:

1. **Map API** — fast static link discovery on the source's search URL, filtered by "auction"
2. **Render-aware listing extraction** — always run, since many auctioneer sites
   (Lofty/HiBid embeds, JS carousels) render listing grids client-side; the page renders
   for ~4s, then an LLM extracts individual property/auction detail URLs
3. **Web search fallback** (`"{source name} land auction Iowa"`) — only if the first two
   find nothing

Junk URLs (social, nav, assets, contact pages) are filtered out. Iowa-looking URLs are
soft-prioritized (never dropped), and processing is capped at **60 URLs per source**, with
overflow logged as "missing" for diagnostics.

### Detail-page extraction

Each candidate URL is scraped via Firecrawl's JSON mode: an LLM extracts against a schema
with an aggressive date-hunting prompt (auction date, sale date, bid deadline, event date,
etc.) plus **sold/closed status**, title, description, address, acreage, land type, county,
and state.

### On save

- **Date parsing**: multiple scraped date fields tried first, then AI extraction from
  title/description; failures are flagged `needsDateReview`
- **Geocoding** (3-tier): street address → Iowa county centroid → Nominatim on
  "{County} County, {State}". If the geocoded county disagrees with the listing's stated
  county, the listing wins
- **Sold detection**: sold/pending/closed listings are marked `sold` and hidden from the map
- **Classification**: keyword-based property-category classification so non-land listings
  (equipment, houses) can be filtered out
- **Upsert by URL** into the `auctions` table (re-scrapes update rather than duplicate),
  then queued for enrichment
- **Diagnostics**: per-source coverage stats (discovered vs saved, Iowa %) and anomaly
  detection against 7-day history

### Post-scrape enrichment + valuation

After each scrape, a background **enrichment queue** runs each auction through OpenAI to
standardize the title ("155.29 Acres Webster County"), identify the auction house, separate
auction location from property location, and extract legal descriptions
(Township/Range/Section), soil mentions, tillable %, CRP, improvements, drainage,
mineral/water rights, financing, and key highlights.

Separately, auctions with coordinates get a **CSR2 valuation**: mean CSR2 within a 500m
radius × the county-specific $/CSR2-point rate = estimated $/acre.

## Sources (51)

Defined in `auctionScraper.ts` (`sources`). The scrape entry point is the base URL plus the
search path where one is configured.

| # | Name | URL |
|---|---|---|
| 1 | Farmers National | https://www.farmersnational.com/real-estate/auctions |
| 2 | Midwest Ag Services | https://midwestagservices.com/farm-auctions/ |
| 3 | Iowa Land Company | https://iowalandcompany.com/auctions/ |
| 4 | Peoples Company | https://peoplescompany.com/listings?type=auctions |
| 5 | High Point Land | https://www.highpointlandcompany.com/land/?places=state%3DIA |
| 6 | Zomer Company | https://zomercompany.com/site/auctions/current-land-real-estate/ |
| 7 | Land Search | https://www.landsearch.com/properties/iowa/filter/format=auctions |
| 8 | DreamDirt | https://bid.dreamdirt.com |
| 9 | LandWatch | https://landwatch.com |
| 10 | Steffes | https://steffes-website-production.azurewebsites.net |
| 11 | Steffes Group | https://steffesgroup.com/auctions/land |
| 12 | McCall Auctions | https://www.mccallauctions.com/mccall-listings?cat=17 |
| 13 | Midwest Land Management | https://www.midwestlandmanagement.com/ |
| 14 | Randy Pryor Real Estate | https://randypryorrealestate.com/farm-land-auctions/ |
| 15 | Jim Schaben Real Estate | https://www.schabenre.com/auctions |
| 16 | Denison Livestock | https://www.denisonlivestock.com/ |
| 17 | Spencer Auction Group | https://spencerauctiongroup.com/auctions/ |
| 18 | Sieren Auction Sales | https://www.sierenauctionsales.com/current-auctions |
| 19 | Green Real Estate & Auction | https://www.greenrealestate-auction.com/#auctions-start |
| 20 | Iowa Land Sales | https://iowalandsales.com/iowa-farm-real-estate/ |
| 21 | Sullivan Auctioneers | https://www.sullivanauctioneers.com |
| 22 | BigIron | https://www.bigiron.com/Lots?distance=500&filter=Open&industry=RealEstate&provider=BigIron%7CSullivan&categories=Real+Estate+%3A+Farmland+Property%7CReal+Estate+%3A+Acreage+Property |
| 23 | Central States Real Estate | https://centralstatesrealestate.com/properties/land-auctions/ |
| 24 | The Acre Co | https://theacreco.com |
| 25 | Al Hughes Auction | https://alhughesauction.com/upcoming-auctions/ |
| 26 | Arrowhead Realty | https://www.arrowheadrealtycompany.com/towns/atlantic-homes-for-sale/farmland-auctions/ |
| 27 | Bergren Real Estate | https://bergrenrealestateandauction.com |
| 28 | Brock Auction | https://brockauction.com/auction-category/land-ranch-auctions/ |
| 29 | Daugherty Auction | https://www.daughertyauction.com/upcoming-auctions |
| 30 | Dvorak Auction | https://www.dvorakauctionservice.com/real-estate-for-sale-auction |
| 31 | Fox Auction | https://foxauctioncompany.com/current-auctions/ |
| 32 | Gary Juranek Auctioneers | https://www.juranekonlineauctions.com |
| 33 | Hallberg Auction | https://hallbergauction.hibid.com/company/71843/hallberg-auction-llc |
| 34 | Hertz Real Estate | https://www.hertz.ag/real-estate/auctions |
| 35 | Jim Hughes Real Estate | https://jimhughesrealestate.placebids.net/auctions |
| 36 | KILOTERRA | https://kiloterra.com/properties/ |
| 37 | Land.com | https://www.land.com |
| 38 | MACI | https://sellmaci.com/farmland |
| 39 | McGuire Auction | https://mcguireauction.hibid.com |
| 40 | Merit Auctions | https://meritauctions.com/auctions/land/ |
| 41 | Osborn Auction | https://osbornauction.com/category/auctions/ |
| 42 | Premier Land & Auction | https://premierlandsales.com/active-auctions |
| 43 | Rice Auction | https://riceauctioncompany.com/auctions/?_sft_productcategory=land |
| 44 | Smith Land Service | https://www.smithlandservice.com/land-auctions.php |
| 45 | Stabe Auction | https://stabeauctionandrealty.com/upcoming-and-past-auctions/ |
| 46 | Stalcup Agricultural | https://www.stalcupag.com/real-estate/farm-auctions/ |
| 47 | United Country Loess Hills | https://www.ucloesshills.com/auctions |
| 48 | Vander Werff & Associates | https://vw72.com/farmland-equipment-or-real-estate-auctioneers-proven-results/ |
| 49 | Wayne Hansen Auctions | https://www.waynehansen.com/auctions |
| 50 | Whitaker Marketing Group | https://www.wmgauction.com/auctions/ |
| 51 | Menke Auction | https://www.menke-auction.com/liveauctions.htm |

In addition to entry #9, LandWatch has three dedicated western-Iowa listing pages scraped
directly (`landWatchPages`):

- https://www.landwatch.com/iowa-land-for-sale/western-region/auctions
- https://www.landwatch.com/iowa-land-for-sale/western-region/auctions/page-2
- https://www.landwatch.com/iowa-land-for-sale/western-region/auctions/page-3
