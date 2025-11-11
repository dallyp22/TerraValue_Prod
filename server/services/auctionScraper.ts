import { firecrawlService } from './firecrawl.js';
import { csr2Service } from './csr2.js';
import { db } from '../db.js';
import { auctions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getCountyCentroid } from './iowaCountyCentroids.js';
import { scraperDiagnosticsService } from './scraperDiagnostics.js';
import { DateExtractorService } from './dateExtractor.js';

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
    totalSources: 24,
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
    { name: 'Jim Schaben Real Estate', url: 'https://jimschabenrealestate.com', searchPath: '/land-listings' },
    { name: 'Denison Livestock', url: 'https://www.denisonlivestock.com/' },
    { name: 'Spencer Auction Group', url: 'https://spencerauctiongroup.com', searchPath: '/auctions/' },
    { name: 'Sieren Auction Sales', url: 'https://www.sierenauctionsales.com', searchPath: '/current-auctions' },
    { name: 'Green Real Estate & Auction', url: 'https://www.greenrealestate-auction.com', searchPath: '/#auctions-start' },
    { name: 'Iowa Land Sales', url: 'https://iowalandsales.com', searchPath: '/iowa-farm-real-estate/' },
    { name: 'Sullivan Auctioneers', url: 'https://www.sullivanauctioneers.com' },
    { name: 'BigIron', url: 'https://www.bigiron.com', searchPath: '/Lots?distance=500&filter=Open&industry=RealEstate&provider=BigIron%7CSullivan&categories=Real+Estate+%3A+Farmland+Property%7CReal+Estate+%3A+Acreage+Property' },
    { name: 'Central States Real Estate', url: 'https://centralstatesrealestate.com', searchPath: '/properties/land-auctions/' },
    { name: 'The Acre Co', url: 'https://theacreco.com' }
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
    
    // Step 1: Try multiple strategies to find auction URLs
    const searchUrl = source.searchPath ? `${source.url}${source.searchPath}` : source.url;
    let auctionUrls: string[] = [];
    
    // Strategy 1: Try Map API
    try {
      console.log(`  Strategy 1: Map API...`);
      const mapResult = await firecrawlService.map(searchUrl, 'auction');
      const rawUrls = mapResult.links || mapResult.urls || [];
      
      for (const item of rawUrls) {
        if (typeof item === 'string') {
          auctionUrls.push(item);
        } else if (item && typeof item === 'object' && item.url) {
          auctionUrls.push(item.url);
        }
      }
      console.log(`    ✓ Map found ${auctionUrls.length} URLs`);
    } catch (error) {
      console.log(`    ⚠️  Map failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
    
    // Strategy 2: Try direct listing extraction if map didn't work well
    if (auctionUrls.length === 0) {
      try {
        console.log(`  Strategy 2: Direct listing extraction...`);
        const listingResult = await firecrawlService.scrapeListingUrls(searchUrl);
        if (listingResult.listing_urls && listingResult.listing_urls.length > 0) {
          auctionUrls = listingResult.listing_urls;
          console.log(`    ✓ Extraction found ${auctionUrls.length} URLs`);
        }
      } catch (extractError) {
        console.log(`    ⚠️  Listing extraction failed`);
      }
    }
    
    // Strategy 3: Try web search as last resort
    if (auctionUrls.length === 0) {
      try {
        console.log(`  Strategy 3: Web search fallback...`);
        const searchResult = await firecrawlService.search(`${source.name} land auction Iowa`);
        auctionUrls = searchResult.data?.map((r: any) => r.url) || [];
        console.log(`    ✓ Search found ${auctionUrls.length} URLs`);
      } catch (searchError) {
        console.log(`    ⚠️  Search also failed`);
      }
    }
    
    if (auctionUrls.length === 0) {
      console.log(`  ❌ No auction URLs found for ${source.name}`);
      stats.duration = Date.now() - startTime;
      this.lastScrapeStats.push(stats);
      return [];
    }
    
    // Update stats: discovered URLs
    stats.discoveredUrls = auctionUrls.length;
    
    // Filter for Iowa auctions first (prioritize Iowa)
    const iowaUrls = auctionUrls.filter(url => 
      url.toLowerCase().includes('-ia') || 
      url.toLowerCase().includes('iowa') ||
      url.toLowerCase().includes('_ia_')
    );
    const otherUrls = auctionUrls.filter(url => 
      !url.toLowerCase().includes('-ia') && 
      !url.toLowerCase().includes('iowa') &&
      !url.toLowerCase().includes('_ia_')
    );
    
    // Update stats: Iowa discovered
    stats.iowaDiscovered = iowaUrls.length;
    
    // Prioritize Iowa, but include others if we have room
    const prioritizedUrls = [...iowaUrls, ...otherUrls];
    
    // Increase limit to 20 URLs per source (from 10)
    const limitedUrls = prioritizedUrls.slice(0, 20);
    
    // Track URLs that won't be processed (missing)
    if (auctionUrls.length > limitedUrls.length) {
      stats.missingUrls = prioritizedUrls.slice(20);
    }
    
    console.log(`  ✅ Total URLs discovered: ${auctionUrls.length}`);
    console.log(`  📍 Iowa URLs: ${iowaUrls.length}`);
    console.log(`  🌍 Other URLs: ${otherUrls.length}`);
    console.log(`  ✂️  Processing first ${limitedUrls.length} URLs (Iowa prioritized)`);
    
    // Step 2: Scrape each URL individually with JSON extraction
    const savedAuctions = [];
    let successCount = 0;
    let failCount = 0;
    
    stats.processedUrls = limitedUrls.length;
    
    for (let i = 0; i < limitedUrls.length; i++) {
      const urlString = limitedUrls[i];
      const isIowa = iowaUrls.includes(urlString);
      
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
            
            // Check if this is an Iowa auction
            if (isIowa || auctionData.state?.toLowerCase() === 'iowa' || auctionData.state?.toLowerCase() === 'ia') {
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
    
    // Parse/extract auction date
    let auctionDate = null;
    let needsDateReview = false;
    let dateExtractionMethod = null;
    
    // First try to parse provided date
    if (auctionData.auction_date) {
      try {
        auctionDate = new Date(auctionData.auction_date);
        if (isNaN(auctionDate.getTime())) {
          auctionDate = null;
        } else {
          dateExtractionMethod = 'scraped';
        }
      } catch (error) {
        auctionDate = null;
      }
    }
    
    // If no date found, try to extract from title/description using AI
    if (!auctionDate && (auctionData.title || auctionData.description)) {
      try {
        const dateExtractor = new DateExtractorService();
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
    
    // Insert or update auction
    try {
      await db.insert(auctions).values({
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
        needsDateReview,
        dateExtractionMethod,
        dateExtractionAttempted: new Date(),
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
          latitude, // Update coordinates if they were obtained
          longitude,
          county,
          state,
          needsDateReview,
          dateExtractionMethod,
          dateExtractionAttempted: new Date(),
          updatedAt: new Date()
        }
      });
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
    
    // Calculate estimated value using standardized $174/CSR2 point
    const estimatedValue = csr2Stats.mean * 174;
    
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

