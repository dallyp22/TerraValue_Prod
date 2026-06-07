import { firecrawlService } from './firecrawl.js';
import { csr2Service } from './csr2.js';
import { countyCsr2RateService } from './countyCsr2Rates.js';
import { db } from '../db.js';
import { auctions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { classifyAuction } from './auctionClassifier.js';
import { getCountyCentroid } from './iowaCountyCentroids.js';
import { scraperDiagnosticsService } from './scraperDiagnostics.js';
import { DateExtractorService } from './dateExtractor.js';
import { enrichmentQueue } from './enrichmentQueue.js';

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
        
        await this.saveAuction(auctionData);
        console.log(`  ✅ Auction saved to database!\n`);
        
        return auctionData;
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
    
    // Check if listing is sold/closed
    let auctionStatus = 'active';
    const soldStatus = auctionData.sold_status?.toLowerCase();
    
    if (soldStatus === 'sold' || soldStatus === 'pending' || soldStatus === 'closed') {
      auctionStatus = 'sold';
      console.log(`      ⚠️ Listing marked as SOLD - will not appear on map`);
    } else if (
      auctionData.title?.toLowerCase().includes('sold') ||
      auctionData.description?.toLowerCase().includes('sold') ||
      auctionData.title?.toLowerCase().includes('closed') ||
      auctionData.description?.toLowerCase().includes('sale closed') ||
      auctionData.description?.toLowerCase().includes('auction closed')
    ) {
      auctionStatus = 'sold';
      console.log(`      ⚠️ "Sold" detected in text - marking as sold`);
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
    
    // Classify the property kind (so non-land listings can be filtered out).
    const classification = classifyAuction({
      title: auctionData.title,
      description: auctionData.description,
      landType: auctionData.land_type,
      acreage: auctionData.acreage,
    });

    // Insert or update auction
    try {
      const result = await db.insert(auctions).values({
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
          status: auctionStatus,
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
          updatedAt: new Date()
        }
      }).returning();
      
      // Add to enrichment queue for AI processing (non-blocking)
      if (result && result.length > 0) {
        const auctionId = result[0].id;
        enrichmentQueue.add(auctionId, 'normal');
        console.log(`      📋 Added to enrichment queue: ID ${auctionId}`);
      }
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

