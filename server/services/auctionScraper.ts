import { firecrawlService } from './firecrawl.js';
import { csr2Service } from './csr2.js';
import { countyCsr2RateService } from './countyCsr2Rates.js';
import { db } from '../db.js';
import { auctions } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { classifyAuction } from './auctionClassifier.js';
import { getCountyCentroid } from './iowaCountyCentroids.js';
import { scraperDiagnosticsService } from './scraperDiagnostics.js';
import { DateExtractorService } from './dateExtractor.js';
import { enrichmentQueue } from './enrichmentQueue.js';
import { getRuntime, getRunId } from './scrapeContext.js';

// Scraper statistics interface for diagnostics
export interface ScraperStats {
  scrapeId: string;
  sourceName: string;
  discoveredUrls: number;
  processedUrls: number;
  successfulSaves: number;
  failedScrapes: number;
  failedSaves: number;
  iowaDiscovered: number;
  iowaSaved: number;
  duration: number;
  timestamp: Date;
  missingUrls: string[];
}

// Extraction schema for auction data
const auctionSchema = {
  type: "object",
  properties: {
    auctions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          url: { type: "string" },
          auction_date: { type: "string" },
          address: { type: "string" },
          acreage: { type: "number" },
          land_type: { type: "string" },
          county: { type: "string" },
          state: { type: "string" }
        },
        required: ["title", "url"]
      }
    }
  },
  required: ["auctions"]
};

/**
 * Language that means a sale has already happened.
 *
 * Deliberately narrow. Iowa sale bills are written in the future tense — "374.59
 * taxable acres m/l ... TO BE SOLD in 3 parcels at PUBLIC AUCTION" — so the bare
 * token `sold` marks live auctions as closed. Every phrase here is past-tense or
 * a terminal state, and `\b` boundaries keep it off substrings. Anything
 * ambiguous ("selling", "will be sold", "for sale") belongs to an active auction.
 */
export const SOLD_PHRASES =
  /\b(?:has\s+been\s+sold|have\s+been\s+sold|was\s+sold|were\s+sold|sold\s+for|sold\s+on|now\s+sold|already\s+sold|auction\s+(?:has\s+)?(?:closed|ended|concluded)|sale\s+(?:has\s+)?(?:closed|ended|concluded)|bidding\s+(?:has\s+)?closed|no\s+longer\s+available)\b/i;

/**
 * Non-listing junk to drop during URL discovery: nav, social, assets.
 *
 * Deliberately does NOT filter on "iowa" tokens — Iowa-ness is decided later
 * from the parsed listing state, not by guessing at the URL string.
 *
 * `.pdf` is NOT in the asset list, deliberately. It was added on 2026-06-07 and
 * closed a real ingestion path: many Iowa auctioneers publish the sale bill as a
 * PDF with no HTML detail page, and 3,631 rows in `archived_auctions` have .pdf
 * URLs from before that change. Two of the four auctions a client reported
 * missing were PDF sale bills (Osborn's Wilwerding bill, Denison's Kenkel bill).
 * Firecrawl extracts PDFs fine; a PDF that yields no title simply is not saved,
 * which is the same outcome the filter was reaching for but without the
 * collateral damage.
 */
export const JUNK_URL = /(facebook|twitter|instagram|linkedin|youtube|mailto:|tel:|\.(?:jpg|jpeg|png|gif|svg|css|js)(?:$|\?)|\/(?:about|contact|privacy|terms|login|cart|wp-admin|wp-login)\b)/i;

/** URLs that look Iowa-ish get ordered first. Cheap heuristic; never drops. */
const looksIowaUrl = (url: string) => /(-ia\b|_ia_|\biowa\b)/i.test(url);

/**
 * Does this URL point at a listing INDEX rather than a single auction?
 *
 * Discovery was feeding search pages back in as auctions. Production held an
 * "event" of ten rows all titled "Multi-Use Acreage For Sale in Missouri" —
 * ucloesshills.com/results/, /results/iowa/, and the bare domain — each saved
 * as a 98-acre auction, and six arrowheadrealtycompany.com/towns/ category
 * pages saved as an 11.5-acre one. Several sources were also re-ingesting their
 * OWN search page: foxauctioncompany.com/current-auctions became a listing.
 *
 * This is deliberately broader than `isAggregatorIndexUrl` in dedupe.ts, and
 * the two should not be merged. There, a false positive loses a correct merge,
 * so it demands a geographic segment AND an index terminal. Here a false
 * NEGATIVE invents an auction that does not exist, which is worse — and the
 * cost of a false positive is only that one page is not scraped, while any
 * genuine listing it links to is still discovered on its own URL.
 */
const INDEX_TERMINAL = new Set([
  'auctions', 'auction', 'current-auctions', 'upcoming-auctions', 'past-auctions',
  'live-auctions', 'online-auctions', 'results', 'search', 'listings', 'properties',
  'land', 'land-for-sale', 'real-estate', 'farms', 'calendar', 'index',
  'at-auction', 'for-sale', 'all-land',
]);
/** A path segment that only ever appears on a browse page. */
const INDEX_SEGMENT =
  /^(category|categories|tag|tags|towns|town|page|archive|browse|filter|results|search)$/;

export function isIndexPageUrl(url: string | null | undefined, sourceEntryUrls?: Set<string>): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }

  // A source's own entry/search page is never one of its listings.
  if (sourceEntryUrls) {
    const canon = `${u.origin}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
    if (sourceEntryUrls.has(canon)) return true;
  }

  const segments = u.pathname.split('/').filter(Boolean).map((x) => x.toLowerCase());

  // Bare domain — a homepage is not a listing.
  if (segments.length === 0) return true;

  if (segments.some((seg) => INDEX_SEGMENT.test(seg))) return true;
  if (INDEX_TERMINAL.has(segments[segments.length - 1])) return true;

  // Trailing pagination, e.g. /auctions/page-2 or /land/2.
  if (/^(page-?\d+|\d+)$/.test(segments[segments.length - 1]) && segments.length > 1) {
    if (INDEX_TERMINAL.has(segments[segments.length - 2])) return true;
  }

  return false;
}

/**
 * Is this listing's state Iowa?
 *
 * Returns `null` for "cannot tell" — that case is deliberately distinct from
 * `false`. Several of our sources are national aggregators (Land.com, LandWatch,
 * BigIron) whose Iowa search pages return listings from everywhere: the live
 * table holds active auctions in Texas, Alabama, New York and Saskatchewan.
 * Those cost us enrichment, geocoding and CSR2 lookups, and CSR2 is an Iowa
 * soil rating that means nothing outside the state.
 *
 * Unknown must NOT be treated as non-Iowa. Dropping rows we merely failed to
 * parse is the exact failure mode that hid auctions from clients all day — a
 * confident "Texas" is a reason to skip; a blank is a reason to keep and flag.
 */
export function isIowaState(raw: string | null | undefined): boolean | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'ia' || s === 'iowa' || s === 'ia.' || s === 'us-ia') return true;
  // A multi-state listing that includes Iowa still counts (e.g. "Iowa/Missouri").
  if (/\biowa\b/.test(s)) return true;
  return false;
}

/**
 * Is this listing in Iowa, judged on every signal we have?
 *
 * `state` ALONE IS NOT TRUSTWORTHY and must never be the sole test. The LLM
 * extractor fills it with nonsense on a regular basis — production currently
 * holds "227.88+/- Acres Winneshiek County, IA" marked Texas, an Appanoose
 * County farm marked Washington, and a Pacific Junction (Mills County) farm
 * marked Massachusetts. Filtering on `state` by itself would hide dozens of
 * genuine Iowa auctions, which is the same class of bug as the `sold` substring
 * and the map's row window: a confident-looking rule quietly deleting real work.
 *
 * So: drop a listing only when its state is confidently some other state AND
 * nothing else points at Iowa. County name, title and URL are all cheaper to
 * extract than `state` and in practice far more reliable.
 *
 * Returns null when nothing is decisive — keep those and let a human look.
 */
export function isIowaListing(a: {
  state?: string | null;
  county?: string | null;
  title?: string | null;
  url?: string | null;
}): boolean | null {
  if (isIowaState(a.state) === true) return true;

  // County name is deliberately NOT a signal. It looks helpful and is a trap:
  // Benton, Union, Henry, Hancock, Crawford, Greene, Lincoln, Marshall and
  // Mercer all exist in Iowa AND elsewhere. Matching on county kept "Benton
  // County, MN Land Auction" and three Missouri listings, and every genuinely
  // Iowa row with a wrong state field was verified to also carry an Iowa token
  // in its URL — so the county clause cost 98 false keeps and saved nothing.

  const text = `${a.title ?? ''} ${a.url ?? ''}`;
  if (/\biowa\b/i.test(text) || /,\s*ia\b/i.test(text) || /-ia[-/]/i.test(text) || /\bia\s+\d{5}\b/i.test(text)) {
    return true;
  }

  return isIowaState(a.state) === false ? false : null;
}

export class AuctionScraperService {
  // Stats from last scrape run
  private lastScrapeStats: ScraperStats[] = [];
  private currentScrapeId: string = '';
  
  // Real-time progress tracking
  private scrapeProgress = {
    isActive: false,
    currentSource: '',
    completedSources: 0,
    totalSources: 51,
    currentSourceProgress: 0
  };

  // LandWatch specific listing pages
  private landWatchPages = [
    'https://www.landwatch.com/iowa-land-for-sale/western-region/auctions',
    'https://www.landwatch.com/iowa-land-for-sale/western-region/auctions/page-2',
    'https://www.landwatch.com/iowa-land-for-sale/western-region/auctions/page-3'
  ];

  // Source configurations for 24 auction sites
  private sources = [
    { name: 'Farmers National', url: 'https://www.farmersnational.com', searchPath: '/real-estate/auctions?fncRealEstate_properties%5BsortBy%5D=fncRealEstate_properties%3AauctionDate%3Aasc&fncRealEstate_properties%5Brange%5D%5BtotalAcres%5D=0%3A' },
    { name: 'Midwest Ag Services', url: 'https://midwestagservices.com', searchPath: '/farm-auctions/' },
    { name: 'Iowa Land Company', url: 'https://iowalandcompany.com', searchPath: '/auctions/' },
    { name: 'Peoples Company', url: 'https://peoplescompany.com', searchPath: '/listings?type=auctions' },
    { name: 'High Point Land', url: 'https://www.highpointlandcompany.com', searchPath: '/land/?places=state%3DIA' },
    { name: 'Zomer Company', url: 'https://zomercompany.com', searchPath: '/site/auctions/current-land-real-estate/' },
    { name: 'Land Search', url: 'https://www.landsearch.com', searchPath: '/properties/iowa/filter/format=auctions' },
    { name: 'DreamDirt', url: 'https://bid.dreamdirt.com' },
    { name: 'LandWatch', url: 'https://landwatch.com' },
    { name: 'Steffes', url: 'https://steffes-website-production.azurewebsites.net' },
    { name: 'Steffes Group', url: 'https://steffesgroup.com', searchPath: '/auctions/land' },
    { name: 'McCall Auctions', url: 'https://www.mccallauctions.com', searchPath: '/mccall-listings?cat=17' },
    { name: 'Midwest Land Management', url: 'https://www.midwestlandmanagement.com/' },
    { name: 'Randy Pryor Real Estate', url: 'https://randypryorrealestate.com', searchPath: '/farm-land-auctions/' },
    { name: 'Jim Schaben Real Estate', url: 'https://www.schabenre.com', searchPath: '/auctions' },
    { name: 'Denison Livestock', url: 'https://www.denisonlivestock.com/' },
    { name: 'Spencer Auction Group', url: 'https://spencerauctiongroup.com', searchPath: '/auctions/' },
    { name: 'Sieren Auction Sales', url: 'https://www.sierenauctionsales.com', searchPath: '/current-auctions' },
    { name: 'Green Real Estate & Auction', url: 'https://www.greenrealestate-auction.com', searchPath: '/#auctions-start' },
    { name: 'Iowa Land Sales', url: 'https://iowalandsales.com', searchPath: '/iowa-farm-real-estate/' },
    { name: 'Sullivan Auctioneers', url: 'https://www.sullivanauctioneers.com' },
    { name: 'BigIron', url: 'https://www.bigiron.com', searchPath: '/Lots?distance=500&filter=Open&industry=RealEstate&provider=BigIron%7CSullivan&categories=Real+Estate+%3A+Farmland+Property%7CReal+Estate+%3A+Acreage+Property' },
    { name: 'Central States Real Estate', url: 'https://centralstatesrealestate.com', searchPath: '/properties/land-auctions/' },
    { name: 'The Acre Co', url: 'https://theacreco.com' },
    
    // New sources - Batch 1 (10 sources)
    { name: 'Al Hughes Auction', url: 'https://alhughesauction.com', searchPath: '/upcoming-auctions/' },
    { name: 'Arrowhead Realty', url: 'https://www.arrowheadrealtycompany.com', searchPath: '/towns/atlantic-homes-for-sale/farmland-auctions/' },
    { name: 'Bergren Real Estate', url: 'https://bergrenrealestateandauction.com' },
    { name: 'Brock Auction', url: 'https://brockauction.com', searchPath: '/auction-category/land-ranch-auctions/' },
    { name: 'Daugherty Auction', url: 'https://www.daughertyauction.com', searchPath: '/upcoming-auctions' },
    { name: 'Dvorak Auction', url: 'https://www.dvorakauctionservice.com', searchPath: '/real-estate-for-sale-auction' },
    { name: 'Fox Auction', url: 'https://foxauctioncompany.com', searchPath: '/current-auctions/' },
    { name: 'Gary Juranek Auctioneers', url: 'https://www.juranekonlineauctions.com' },
    { name: 'Hallberg Auction', url: 'https://hallbergauction.hibid.com', searchPath: '/company/71843/hallberg-auction-llc' },
    { name: 'Hertz Real Estate', url: 'https://www.hertz.ag', searchPath: '/real-estate/auctions' },
    
    // New sources - Batch 2 (10 sources)
    { name: 'Jim Hughes Real Estate', url: 'https://jimhughesrealestate.placebids.net', searchPath: '/auctions' },
    { name: 'KILOTERRA', url: 'https://kiloterra.com', searchPath: '/properties/' },
    { name: 'Land.com', url: 'https://www.land.com' },
    { name: 'MACI', url: 'https://sellmaci.com', searchPath: '/farmland' },
    { name: 'McGuire Auction', url: 'https://mcguireauction.hibid.com' },
    { name: 'Merit Auctions', url: 'https://meritauctions.com', searchPath: '/auctions/land/' },
    { name: 'Osborn Auction', url: 'https://osbornauction.com', searchPath: '/category/auctions/' },
    { name: 'Premier Land & Auction', url: 'https://premierlandsales.com', searchPath: '/active-auctions' },
    { name: 'Rice Auction', url: 'https://riceauctioncompany.com', searchPath: '/auctions/?_sft_productcategory=land' },
    { name: 'Smith Land Service', url: 'https://www.smithlandservice.com', searchPath: '/land-auctions.php' },
    
    // New sources - Batch 3 (6 sources)
    { name: 'Stabe Auction', url: 'https://stabeauctionandrealty.com', searchPath: '/upcoming-and-past-auctions/' },
    { name: 'Stalcup Agricultural', url: 'https://www.stalcupag.com', searchPath: '/real-estate/farm-auctions/' },
    { name: 'United Country Loess Hills', url: 'https://www.ucloesshills.com', searchPath: '/auctions' },
    { name: 'Vander Werff & Associates', url: 'https://vw72.com', searchPath: '/farmland-equipment-or-real-estate-auctioneers-proven-results/' },
    { name: 'Wayne Hansen Auctions', url: 'https://www.waynehansen.com', searchPath: '/auctions' },
    { name: 'Whitaker Marketing Group', url: 'https://www.wmgauction.com', searchPath: '/auctions/' },
    
    // New source - Dec 3, 2025
    { name: 'Menke Auction', url: 'https://www.menke-auction.com', searchPath: '/liveauctions.htm' }
  ];

  // Get stats from last scrape
  getLastScrapeStats(): ScraperStats[] {
    return this.lastScrapeStats;
  }
  
  // Get current scrape progress
  getScrapeProgress() {
    return this.scrapeProgress;
  }

  // Scrape all auction sources
  async scrapeAllSources() {
    // Generate unique scrape ID
    this.currentScrapeId = `scrape_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.lastScrapeStats = [];
    
    // Initialize progress tracking
    this.scrapeProgress = {
      isActive: true,
      currentSource: 'Starting...',
      completedSources: 0,
      totalSources: this.sources.length,
      currentSourceProgress: 0
    };
    
    const results = [];
    
    for (let i = 0; i < this.sources.length; i++) {
      const source = this.sources[i];
      try {
        // Update progress
        this.scrapeProgress.currentSource = source.name;
        this.scrapeProgress.completedSources = i;
        
        console.log(`Scraping ${source.name}...`);
        const auctions = await this.scrapeSingleSource(source);
        results.push(...auctions);
        console.log(`✅ ${source.name}: Found ${auctions.length} auctions`);
        
        // Mark as completed
        this.scrapeProgress.completedSources = i + 1;
      } catch (error) {
        console.error(`❌ Failed to scrape ${source.name}:`, error instanceof Error ? error.message : error);
        this.scrapeProgress.completedSources = i + 1;
      }
    }
    
    console.log(`\n🎉 Total auctions scraped: ${results.length}`);
    
    // Log diagnostics
    if (this.lastScrapeStats.length > 0) {
      scraperDiagnosticsService.logStats(this.lastScrapeStats);
      scraperDiagnosticsService.logMissingAuctions(this.lastScrapeStats);
      
      // Calculate and log coverage metrics
      const metrics = scraperDiagnosticsService.calculateCoverageMetrics(this.lastScrapeStats);
      console.log('\n📊 Coverage Summary:');
      metrics.forEach(m => {
        console.log(`  ${m.source}: ${m.coverage_percentage}% (${m.saved}/${m.discovered}), Iowa: ${m.iowa_coverage_percentage}%`);
      });
      
      // Detect anomalies
      const historical = scraperDiagnosticsService.getHistoricalStats(7);
      const anomalies = scraperDiagnosticsService.detectAnomalies(this.lastScrapeStats, historical);
      if (anomalies.length > 0) {
        console.log('\n⚠️  Anomalies detected:');
        anomalies.forEach(a => console.log(`  - ${a}`));
      }
    }
    
    // Mark scraping as complete
    this.scrapeProgress.isActive = false;
    this.scrapeProgress.currentSource = 'Complete!';
    this.scrapeProgress.completedSources = this.sources.length;
    
    // Start enrichment queue processing in background (non-blocking)
    console.log('\n📋 Starting enrichment queue processing in background...');
    enrichmentQueue.startProcessing();
    
    return results;
  }

  // Manually scrape a specific auction URL (useful for adding missed auctions)
  /**
   * The configured sources, for the queue producer to fan out over.
   *
   * Includes the LandWatch listing pages as synthetic sources so they get their
   * own queue message instead of riding along inside one giant invocation.
   */
  /** Canonical entry/search URLs, so a source never ingests its own index. */
  private sourceEntryUrls(): Set<string> {
    const out = new Set<string>();
    for (const s of this.getSourceList()) {
      const canon = (u: string) => {
        try {
          const p = new URL(u);
          return `${p.origin}${p.pathname.replace(/\/+$/, '')}`.toLowerCase();
        } catch {
          return u.toLowerCase().replace(/\/+$/, '');
        }
      };
      out.add(canon(s.url));
      if (s.searchPath) out.add(canon(`${s.url}${s.searchPath}`));
    }
    return out;
  }

  getSourceList(): Array<{ name: string; url: string; searchPath?: string }> {
    return [
      ...this.sources,
      ...this.landWatchPages.map((url, i) => ({ name: `LandWatch Page ${i + 1}`, url })),
    ];
  }

  /**
   * Discovery half of a source scrape: find candidate listing URLs, no detail
   * fetching and no DB writes.
   *
   * Split out so the queue path can run discovery for ONE source per
   * invocation, then fan the URLs out as individual messages. `scrapeSingleSource`
   * still does discovery inline for the long-running Node path; both call the
   * same Firecrawl strategies, so behaviour cannot drift between runtimes.
   *
   * @param cap Max URLs to return. The in-process path uses 60 because every
   *   extra URL costs it subrequests inside one invocation. The queue path can
   *   afford far more, since each URL becomes its own invocation with its own
   *   budget — this cap is the single biggest coverage lever we have.
   */
  async discoverUrlsForSource(
    source: { name: string; url: string; searchPath?: string },
    cap = 250,
  ): Promise<{ urls: string[]; discovered: number; dropped: number }> {
    const searchUrl = source.searchPath ? `${source.url}${source.searchPath}` : source.url;
    const candidates = new Set<string>();

    // Strategy 1: Map API (static link discovery).
    try {
      const mapResult = await firecrawlService.map(searchUrl, 'auction');
      for (const item of (mapResult.links || mapResult.urls || [])) {
        const u = typeof item === 'string' ? item : (item && item.url);
        if (u) candidates.add(u);
      }
    } catch (error) {
      console.log(`    ⚠️  Map failed: ${error instanceof Error ? error.message : 'unknown'}`);
    }

    // Strategy 2: render-aware listing extraction — always merged, because many
    // auctioneer sites render their listing grid via JS and Map sees only the shell.
    try {
      const listingResult = await firecrawlService.scrapeListingUrls(searchUrl);
      for (const u of (listingResult.listing_urls || [])) {
        if (typeof u === 'string' && u) candidates.add(u);
      }
    } catch {
      console.log(`    ⚠️  Listing extraction failed`);
    }

    // Strategy 3: web search, only if the first two found nothing.
    if (candidates.size === 0) {
      try {
        const searchResult = await firecrawlService.search(`${source.name} land auction Iowa`);
        for (const r of (searchResult.data || [])) if (r?.url) candidates.add(r.url);
      } catch {
        console.log(`    ⚠️  Search also failed`);
      }
    }

    // Drop listing indexes here, not later: scraping one costs a Firecrawl
    // credit and yields a phantom auction carrying the index page's acreage.
    const entryUrls = this.sourceEntryUrls();
    const clean = Array.from(candidates).filter(
      (u) => /^https?:\/\//i.test(u) && !JUNK_URL.test(u) && !isIndexPageUrl(u, entryUrls),
    );
    const prioritized = [...clean.filter(looksIowaUrl), ...clean.filter((u) => !looksIowaUrl(u))];
    const urls = prioritized.slice(0, cap);

    return { urls, discovered: clean.length, dropped: Math.max(0, prioritized.length - urls.length) };
  }

  async scrapeSpecificUrl(url: string, sourceName?: string) {
    console.log(`\n🔍 Manually scraping auction: ${url}\n`);
    
    // Try to determine source from URL if not provided
    if (!sourceName) {
      for (const source of this.sources) {
        if (url.toLowerCase().includes(source.url.toLowerCase().replace('https://', '').replace('www.', ''))) {
          sourceName = source.name;
          break;
        }
      }
      sourceName = sourceName || 'Unknown Source';
    }
    
    console.log(`  Source: ${sourceName}`);
    
    try {
      const scrapeResult = await firecrawlService.scrapeWithJson(url);
      
      if (scrapeResult && scrapeResult.title) {
        const auctionData = {
          title: scrapeResult.title || 'Untitled Auction',
          description: scrapeResult.description || '',
          url: url,
          auction_date: scrapeResult.auction_date || scrapeResult.date,
          address: scrapeResult.address || scrapeResult.location,
          acreage: scrapeResult.acreage || scrapeResult.acres,
          land_type: scrapeResult.land_type || scrapeResult.property_type,
          county: scrapeResult.county,
          state: scrapeResult.state || 'Iowa',
          sourceWebsite: sourceName
        };
        
        console.log('  ✅ Data extracted:');
        console.log(`     Title: ${auctionData.title}`);
        console.log(`     County: ${auctionData.county || 'N/A'}`);
        console.log(`     State: ${auctionData.state}`);
        console.log(`     Acreage: ${auctionData.acreage || 'N/A'}`);
        console.log(`     Date: ${auctionData.auction_date || 'N/A'}\n`);
        
        const savedId = await this.saveAuction(auctionData);
        if (savedId == null) {
          // Skipped (out of state, or a listing index). Null keeps the queue
          // consumer's `saved` tally honest — a skip is not a save, and the
          // coverage scorecard is only useful if its numbers mean what they say.
          return null;
        }
        console.log(`  ✅ Auction saved to database! (id ${savedId})\n`);

        return { ...auctionData, id: savedId };
      } else {
        console.log(`  ❌ No data could be extracted from this URL\n`);
        return null;
      }
    } catch (error) {
      console.error(`  ❌ Error scraping URL:`, error instanceof Error ? error.message : error);
      throw error;
    }
  }

  // Scrape single auction source
  private async scrapeSingleSource(source: any) {
    const startTime = Date.now();
    
    // Initialize stats tracking
    const stats: ScraperStats = {
      scrapeId: this.currentScrapeId,
      sourceName: source.name,
      discoveredUrls: 0,
      processedUrls: 0,
      successfulSaves: 0,
      failedScrapes: 0,
      failedSaves: 0,
      iowaDiscovered: 0,
      iowaSaved: 0,
      duration: 0,
      timestamp: new Date(),
      missingUrls: []
    };
    
    // Step 1: Discover auction URLs. Map (fast link discovery) is MERGED with a
    // render-aware listing extraction, because many auctioneer sites render
    // their listing grid via JS — Map only sees the page shell/nav, so the real
    // auction detail links are invisible without rendering the page first.
    const searchUrl = source.searchPath ? `${source.url}${source.searchPath}` : source.url;
    const candidates = new Set<string>();

    // Strategy 1: Map API (static link discovery)
    try {
      console.log(`  Strategy 1: Map API...`);
      const mapResult = await firecrawlService.map(searchUrl, 'auction');
      const rawUrls = mapResult.links || mapResult.urls || [];
      let n = 0;
      for (const item of rawUrls) {
        const u = typeof item === 'string' ? item : (item && item.url);
        if (u) { candidates.add(u); n++; }
      }
      console.log(`    ✓ Map found ${n} URLs`);
    } catch (error) {
      console.log(`    ⚠️  Map failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    // Strategy 2: render-aware listing extraction — ALWAYS run and merge, so
    // JS-rendered cards (Lofty/HiBid/carousels) surface even when Map returned
    // some (shell/nav) links.
    try {
      console.log(`  Strategy 2: Render-aware listing extraction...`);
      const listingResult = await firecrawlService.scrapeListingUrls(searchUrl);
      const before = candidates.size;
      for (const u of (listingResult.listing_urls || [])) {
        if (typeof u === 'string' && u) candidates.add(u);
      }
      console.log(`    ✓ Extraction added ${candidates.size - before} URLs`);
    } catch (extractError) {
      console.log(`    ⚠️  Listing extraction failed`);
    }

    // Strategy 3: web search fallback only if we still found nothing
    if (candidates.size === 0) {
      try {
        console.log(`  Strategy 3: Web search fallback...`);
        const searchResult = await firecrawlService.search(`${source.name} land auction Iowa`);
        for (const r of (searchResult.data || [])) if (r?.url) candidates.add(r.url);
        console.log(`    ✓ Search found ${candidates.size} URLs`);
      } catch (searchError) {
        console.log(`    ⚠️  Search also failed`);
      }
    }

    // Drop obvious non-listing junk (nav, social, assets) but DO NOT filter by
    // "iowa" tokens — Iowa is determined later from the parsed listing state,
    // not from guessing at the URL string.
    const JUNK = /(facebook|twitter|instagram|linkedin|youtube|mailto:|tel:|\.(?:jpg|jpeg|png|gif|svg|pdf|css|js)(?:$|\?)|\/(?:about|contact|privacy|terms|login|cart|wp-admin|wp-login)\b)/i;
    let auctionUrls = Array.from(candidates).filter(u => /^https?:\/\//i.test(u) && !JUNK.test(u));

    if (auctionUrls.length === 0) {
      console.log(`  ❌ No auction URLs found for ${source.name}`);
      stats.duration = Date.now() - startTime;
      this.lastScrapeStats.push(stats);
      return [];
    }

    stats.discoveredUrls = auctionUrls.length;

    // Soft-prioritize URLs that LOOK Iowa-ish (cheap heuristic ordering only —
    // it never drops a URL), then cap. Cap raised 20 → 60 so busy auctioneers
    // aren't silently truncated.
    const looksIowa = (url: string) => /(-ia\b|_ia_|\biowa\b)/i.test(url);
    const prioritizedUrls = [
      ...auctionUrls.filter(looksIowa),
      ...auctionUrls.filter(u => !looksIowa(u)),
    ];
    stats.iowaDiscovered = auctionUrls.filter(looksIowa).length;

    const MAX_URLS_PER_SOURCE = 60;
    const limitedUrls = prioritizedUrls.slice(0, MAX_URLS_PER_SOURCE);
    if (prioritizedUrls.length > limitedUrls.length) {
      stats.missingUrls = prioritizedUrls.slice(MAX_URLS_PER_SOURCE);
      console.log(`  ⚠️  ${stats.missingUrls.length} URLs over the ${MAX_URLS_PER_SOURCE}-cap were not processed`);
    }

    console.log(`  ✅ Total URLs discovered: ${auctionUrls.length}`);
    console.log(`  ✂️  Processing ${limitedUrls.length} URLs`);
    
    // Step 2: Scrape each URL individually with JSON extraction
    const savedAuctions = [];
    let successCount = 0;
    let failCount = 0;
    
    stats.processedUrls = limitedUrls.length;
    
    for (let i = 0; i < limitedUrls.length; i++) {
      const urlString = limitedUrls[i];

      try {
        console.log(`    [${i + 1}/${limitedUrls.length}] Processing...`);
        const scrapeResult = await firecrawlService.scrapeWithJson(urlString);
        
        if (scrapeResult && scrapeResult.title) {
          const auctionData = {
            title: scrapeResult.title || 'Untitled Auction',
            description: scrapeResult.description || '',
            url: urlString,
            auction_date: scrapeResult.auction_date || scrapeResult.date,
            address: scrapeResult.address || scrapeResult.location,
            acreage: scrapeResult.acreage || scrapeResult.acres,
            land_type: scrapeResult.land_type || scrapeResult.property_type,
            county: scrapeResult.county,
            state: scrapeResult.state || 'Iowa',
            sourceWebsite: source.name
          };
          
          try {
            await this.saveAuction(auctionData);
            savedAuctions.push(auctionData);
            successCount++;
            stats.successfulSaves++;
            
            // Iowa is determined from the parsed listing state, not the URL.
            if (auctionData.state?.toLowerCase() === 'iowa' || auctionData.state?.toLowerCase() === 'ia') {
              stats.iowaSaved++;
            }
            
            console.log(`    ✓ [${i + 1}/${limitedUrls.length}] Saved: ${auctionData.title.substring(0, 50)}...`);
          } catch (saveError) {
            stats.failedSaves++;
            failCount++;
            console.log(`    ✗ [${i + 1}/${limitedUrls.length}] Save failed for ${auctionData.title.substring(0, 50)}...`);
          }
        } else {
          stats.failedScrapes++;
          failCount++;
          const shortUrl = urlString.length > 50 ? urlString.substring(0, 50) + '...' : urlString;
          console.log(`    ⚠ [${i + 1}/${limitedUrls.length}] No data extracted from ${shortUrl}`);
        }
      } catch (error) {
        stats.failedScrapes++;
        failCount++;
        const shortUrl = urlString.length > 50 ? urlString.substring(0, 50) + '...' : urlString;
        const errorMsg = error instanceof Error ? error.message : 'unknown error';
        console.log(`    ✗ [${i + 1}/${limitedUrls.length}] Failed: ${shortUrl} (${errorMsg})`);
      }
    }
    
    console.log(`\n  📊 Results: ${successCount} saved, ${failCount} failed`);
    
    // Finalize stats
    stats.duration = Date.now() - startTime;
    this.lastScrapeStats.push(stats);
    
    console.log(`  Saved ${savedAuctions.length} auctions from ${source.name}`);
    return savedAuctions;
  }

  // Scrape LandWatch listing pages specifically
  async scrapeLandWatchPages() {
    console.log('\n🏘️  Scraping LandWatch listing pages...');
    const allAuctionUrls: string[] = [];
    
    // Step 1: Scrape each listing page using JSON extraction to get listing URLs
    for (const pageUrl of this.landWatchPages) {
      try {
        console.log(`  Scraping listing page: ${pageUrl.substring(pageUrl.indexOf('landwatch'))}...`);
        
        // Use Firecrawl's JSON extraction to specifically extract listing URLs
        const response = await firecrawlService.scrapeListingUrls(pageUrl);
        
        if (response && response.listing_urls && response.listing_urls.length > 0) {
          console.log(`    Found ${response.listing_urls.length} listing URLs`);
          console.log(`    Sample URLs:`, response.listing_urls.slice(0, 2));
          allAuctionUrls.push(...response.listing_urls);
        } else {
          console.log(`    No listing URLs extracted from page`);
        }
        
      } catch (error) {
        console.log(`    ✗ Failed to scrape listing page:`, error instanceof Error ? error.message : error);
      }
    }
    
    console.log(`\n  Total unique auction URLs found: ${allAuctionUrls.length}`);
    
    // Step 2: Scrape each individual auction page
    const savedAuctions = [];
    const uniqueAuctionUrls = Array.from(new Set(allAuctionUrls)).slice(0, 20); // Limit to 20
    
    for (const auctionUrl of uniqueAuctionUrls) {
      try {
        const scrapeResult = await firecrawlService.scrapeWithJson(auctionUrl);
        
        if (scrapeResult && scrapeResult.title) {
          const auctionData = {
            title: scrapeResult.title || 'LandWatch Auction',
            description: scrapeResult.description || '',
            url: auctionUrl,
            auction_date: scrapeResult.auction_date || scrapeResult.date,
            address: scrapeResult.address || scrapeResult.location,
            acreage: scrapeResult.acreage || scrapeResult.acres,
            land_type: scrapeResult.land_type || scrapeResult.property_type,
            county: scrapeResult.county,
            state: scrapeResult.state || 'Iowa',
            sourceWebsite: 'LandWatch'
          };
          
          await this.saveAuction(auctionData);
          savedAuctions.push(auctionData);
          console.log(`    ✓ Saved: ${auctionData.title.substring(0, 50)}...`);
        }
      } catch (error) {
        const shortUrl = auctionUrl.length > 50 ? auctionUrl.substring(0, 50) + '...' : auctionUrl;
        console.log(`    ✗ Failed to scrape ${shortUrl}`);
      }
    }
    
    console.log(`\n✅ LandWatch: Saved ${savedAuctions.length} auctions`);
    return savedAuctions;
  }

  // Save auction to database with geocoding
  private async saveAuction(auctionData: any) {
    // Geocode address if available
    let latitude, longitude, county, state;
    let isCountyLevel = false; // Track if using county-level coordinates
    
    // Extract county and state from address or use provided values
    county = auctionData.county;

    // Out-of-state listings stop here, BEFORE we spend anything on them.
    // Everything below this line costs money — geocoding calls, then enrichment
    // and a CSR2 valuation on save. The national aggregators in our source list
    // return listings from every state, and CSR2 is an Iowa soil rating that is
    // meaningless elsewhere, so a Texas farm can never produce a usable number.
    //
    // Note this tests the RAW extracted value, not the defaulted one below:
    // `state || 'Iowa'` turns "unknown" into "Iowa", and unknown must stay in.
    // Only a confidently-parsed other state is skipped.
    // A listing index is not an auction. Discovery filters these too; this is the
    // backstop for URLs that arrive by another path (scrapeSpecificUrl, retries).
    if (isIndexPageUrl(auctionData.url, this.sourceEntryUrls())) {
      console.log(`      ⤫ Skipping listing index, not an auction: ${auctionData.url}`);
      return null;
    }

    // Judged on state + county + title + URL together — `state` alone is wrong
    // often enough to hide real Iowa auctions (see isIowaListing).
    if (isIowaListing(auctionData) === false) {
      console.log(`      ⤫ Skipping non-Iowa listing (${auctionData.state}): ${(auctionData.title || '').slice(0, 60)}`);
      return null;
    }

    state = auctionData.state || 'Iowa';

    // Strategy 1: Try to geocode specific address
    if (auctionData.address) {
      try {
        console.log(`      Geocoding: ${auctionData.address}`);
        const coords = await csr2Service.geocodeAddress(auctionData.address);
        if (coords) {
          latitude = coords.latitude;
          longitude = coords.longitude;
          console.log(`      ✓ Coordinates: ${latitude}, ${longitude}`);
          
          const location = await csr2Service.reverseGeocode(latitude, longitude);
          
          // VALIDATION: Check if geocoded county matches extracted county
          const geocodedCounty = location?.county;
          const extractedCounty = auctionData.county;
          
          if (geocodedCounty && extractedCounty && geocodedCounty !== extractedCounty) {
            console.warn(`      ⚠️  COUNTY MISMATCH!`);
            console.warn(`         Extracted from listing: "${extractedCounty}"`);
            console.warn(`         Geocoded from address: "${geocodedCounty}"`);
            console.warn(`         → Using EXTRACTED county (listing is more reliable than address)`);
            // Trust the extracted county from the auction listing over geocoded
            county = extractedCounty;
            state = location?.state || auctionData.state;
          } else {
            county = geocodedCounty || extractedCounty;
            state = location?.state || auctionData.state;
          }
        } else {
          console.log(`      ✗ No coordinates found for address`);
        }
      } catch (geocodeError) {
        console.log(`      ✗ Geocoding error: ${geocodeError instanceof Error ? geocodeError.message : 'unknown'}`);
      }
    }
    
    // Strategy 2: If no coordinates yet, try county centroid lookup (Iowa counties only)
    if (!latitude && county && state === 'Iowa') {
      console.log(`      ⚠ Using county centroid for ${county} County...`);
      const centroid = getCountyCentroid(county);
      if (centroid) {
        latitude = centroid.latitude;
        longitude = centroid.longitude;
        isCountyLevel = true;
        console.log(`      ✓ County centroid: ${latitude}, ${longitude}`);
      } else {
        console.log(`      ✗ County "${county}" not found in Iowa centroids`);
      }
    }
    
    // Strategy 3: Last resort - try geocoding county name via Nominatim
    if (!latitude && county && state) {
      try {
        console.log(`      ⚠ Attempting Nominatim geocoding for ${county} County...`);
        const countyAddress = `${county} County, ${state}`;
        const coords = await csr2Service.geocodeAddress(countyAddress);
        if (coords) {
          latitude = coords.latitude;
          longitude = coords.longitude;
          isCountyLevel = true;
          console.log(`      ✓ County geocoded: ${latitude}, ${longitude}`);
        }
      } catch (error) {
        console.log(`      ✗ County geocoding failed`);
      }
    }
    
    // Check if listing is sold/closed.
    //
    // NOTE: this used to test `title/description.includes('sold')`, which fires on
    // the standard Iowa sale-bill phrase "…to be sold at public auction" — i.e. on
    // the auctions we most want to keep. That one substring archived 2,584 auctions
    // whose sale date was still in the future. Only definite past-tense/closing
    // language counts now, and the future-date guard below is the backstop.
    let auctionStatus = 'active';
    const soldStatus = auctionData.sold_status?.toLowerCase();
    
    if (soldStatus === 'sold' || soldStatus === 'pending' || soldStatus === 'closed') {
      auctionStatus = 'sold';
      console.log(`      ⚠️ Listing marked as SOLD - will not appear on map`);
    } else if (
      SOLD_PHRASES.test(auctionData.title ?? '') ||
      SOLD_PHRASES.test(auctionData.description ?? '')
    ) {
      auctionStatus = 'sold';
      console.log(`      ⚠️ Past-tense sale language detected - marking as sold`);
    }
    
    // Parse/extract auction date
    let auctionDate = null;
    let needsDateReview = false;
    let dateExtractionMethod = null;
    
    // Try multiple date field variations from Firecrawl
    const dateFields = [
      auctionData.auction_date,
      auctionData.sale_date, 
      auctionData.start_date,
      auctionData.bid_deadline,
      auctionData.event_date,
      auctionData.date
    ];
    
    const dateExtractor = new DateExtractorService();
    
    for (const dateField of dateFields) {
      if (dateField) {
        // Use flexible parser to handle various date formats (DD-MM-YYYY, MM/DD/YYYY, etc.)
        const parsed = (dateExtractor as any).parseFlexibleDate(dateField);
        if (parsed) {
          auctionDate = parsed;
          dateExtractionMethod = 'scraped';
          console.log(`      ✓ Date from Firecrawl: ${auctionDate.toLocaleDateString()} (from: ${dateField})`);
          break;
        }
      }
    }
    
    // If no date found, try to extract from title/description using AI
    if (!auctionDate && (auctionData.title || auctionData.description)) {
      try {
        const result = await dateExtractor.extractDateFromText(
          auctionData.title,
          auctionData.description || ''
        );
        
        if (result.date) {
          auctionDate = result.date;
          dateExtractionMethod = result.method;
          console.log(`      ✓ Extracted date: ${auctionDate.toLocaleDateString()} (${result.method})`);
        } else {
          needsDateReview = true;
          console.log(`      ⚠ Could not extract date - flagged for review`);
        }
      } catch (extractError) {
        console.log(`      ⚠ Date extraction failed - flagged for review`);
        needsDateReview = true;
      }
    }

    // Backstop: an auction whose sale date is still in the future has not been
    // sold, whatever the page text says. Text heuristics and the LLM's
    // `sold_status` both misread future-tense sale-bill language; the date does
    // not. This is what stops a live listing from being hidden and then deleted
    // by the archiver's `marked_sold` pass.
    if (auctionStatus === 'sold' && auctionDate && auctionDate.getTime() > Date.now()) {
      auctionStatus = 'active';
      console.log(`      ↩ Sale date ${auctionDate.toLocaleDateString()} is in the future - keeping active`);
    }

    // Classify the property kind (so non-land listings can be filtered out).
    const classification = classifyAuction({
      title: auctionData.title,
      description: auctionData.description,
      landType: auctionData.land_type,
      acreage: auctionData.acreage,
    });

    // Insert or update auction
    try {
      const capturedBy = getRuntime();
      const capturedRun = getRunId();
      const result = await db.insert(auctions).values({
        lastCapturedBy: capturedBy,
        lastCapturedRun: capturedRun,
        firstCapturedBy: capturedBy,
        title: auctionData.title,
        description: auctionData.description,
        url: auctionData.url,
        sourceWebsite: auctionData.sourceWebsite,
        auctionDate: auctionDate,
        address: auctionData.address,
        county,
        state,
        acreage: auctionData.acreage,
        landType: auctionData.land_type,
        latitude,
        longitude,
        status: auctionStatus,
        needsDateReview,
        dateExtractionMethod,
        dateExtractionAttempted: new Date(),
        propertyCategory: classification.category,
        classificationConfidence: classification.confidence,
        classificationSource: 'keyword',
        classificationReason: classification.reason,
        enrichmentStatus: 'pending', // Set initial enrichment status
        rawData: { 
          ...auctionData, 
          isCountyLevel, // Flag to indicate approximate location
          geocodingMethod: latitude ? (isCountyLevel ? 'county-centroid' : 'address') : 'none'
        }
      }).onConflictDoUpdate({
        target: auctions.url,
        set: {
          title: auctionData.title,
          description: auctionData.description,
          auctionDate: auctionDate,
          // Don't resurrect a listing the archiver retired unless this scrape
          // actually found it a future sale date.
          //
          // Archiving no longer deletes, so a retired row keeps its URL, the
          // nightly scrape conflicts on it, and a plain assignment flips it
          // straight back to 'active' — a stale listing that never comes down
          // would flap active/archived every single night. Deliberately still
          // ALLOWS resurrection: a genuinely relisted farm with a new future
          // date must come back.
          status: sql`CASE
            WHEN ${auctions.status} = 'archived'
             AND ${auctionDate ?? null}::timestamp IS NOT NULL
             AND ${auctionDate ?? null}::timestamp >= CURRENT_DATE
            THEN ${auctionStatus}
            WHEN ${auctions.status} = 'archived' THEN 'archived'
            ELSE ${auctionStatus}
          END`,
          latitude, // Update coordinates if they were obtained
          longitude,
          county,
          state,
          needsDateReview,
          dateExtractionMethod,
          dateExtractionAttempted: new Date(),
          propertyCategory: classification.category,
          classificationConfidence: classification.confidence,
          classificationSource: 'keyword',
          classificationReason: classification.reason,
          // firstCapturedBy is intentionally NOT updated — it records who found
          // this listing originally, which is the number that matters when
          // comparing runtimes.
          lastCapturedBy: capturedBy,
          lastCapturedRun: capturedRun,
          updatedAt: new Date()
        }
      }).returning();
      
      // Hand off for enrichment. The in-memory queue only works in a
      // long-running process; in a Worker the invocation ends and the work is
      // dropped. Returning the id lets the queue consumer enqueue a durable
      // message instead — see worker/src/queues.ts.
      if (result && result.length > 0) {
        const auctionId = result[0].id;
        if (getRuntime() === 'node') {
          enrichmentQueue.add(auctionId, 'normal');
          console.log(`      📋 Added to enrichment queue: ID ${auctionId}`);
        }
        return auctionId;
      }
      return null;
    } catch (dbError) {
      // If onConflictDoUpdate doesn't work, just log and continue
      console.log(`    DB insert failed for: ${auctionData.title}`);
      throw dbError;
    }
  }

  // Calculate CSR2 valuation for specific auction
  async calculateValuation(auctionId: number) {
    const auction = await db.query.auctions.findFirst({
      where: eq(auctions.id, auctionId)
    });
    
    if (!auction || !auction.latitude || !auction.longitude) {
      throw new Error('Auction not found or missing coordinates');
    }
    
    // Create circular polygon around auction coordinates
    const wkt = csr2Service.createCircularPolygon(
      auction.latitude,
      auction.longitude,
      500 // 500m radius
    );
    
    // Get CSR2 stats
    const csr2Stats = await csr2Service.getCsr2PolygonStats(wkt);
    
    if (!csr2Stats.mean) {
      throw new Error('Unable to determine CSR2 for this location');
    }
    
    // Get county-specific CSR2 rate
    const csr2RatePerPoint = await countyCsr2RateService.getCountyRate(auction.county || '');
    const estimatedValue = csr2Stats.mean * csr2RatePerPoint;
    
    console.log(`CSR2 Valuation for ${auction.title}: ${csr2Stats.mean} × $${csr2RatePerPoint}/point (${auction.county || 'Unknown'} County) = $${Math.round(estimatedValue)}/acre`);
    
    // Update auction with CSR2 data
    await db.update(auctions)
      .set({
        csr2Mean: csr2Stats.mean,
        csr2Min: csr2Stats.min,
        csr2Max: csr2Stats.max,
        estimatedValue,
        updatedAt: new Date()
      })
      .where(eq(auctions.id, auctionId));
    
    return {
      csr2Mean: csr2Stats.mean,
      csr2Min: csr2Stats.min,
      csr2Max: csr2Stats.max,
      estimatedValue,
      estimatedTotalValue: auction.acreage ? estimatedValue * auction.acreage : null
    };
  }
}

export const auctionScraperService = new AuctionScraperService();

