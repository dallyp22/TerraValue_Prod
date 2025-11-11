#!/usr/bin/env node
import { firecrawlService } from '../server/services/firecrawl.js';
import { db } from '../server/db.js';
import { auctions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Comprehensive Auction Coverage Audit Tool
 * 
 * Discovers ALL URLs from each auction source using Firecrawl map API,
 * compares against database, and generates detailed coverage report.
 */

interface SourceCoverage {
  discovered_count: number;
  database_count: number;
  coverage_percentage: number;
  missing_urls: string[];
  stale_urls: string[];
  iowa_discovered: number;
  iowa_in_database: number;
  iowa_missing_urls: string[];
}

interface AuditReport {
  audit_date: string;
  sources: Record<string, SourceCoverage>;
  summary: {
    total_sources: number;
    total_discovered: number;
    total_in_database: number;
    overall_coverage: number;
    iowa_discovered: number;
    iowa_in_database: number;
    iowa_coverage: number;
  };
}

// Auction sources from auctionScraper.ts
const AUCTION_SOURCES = [
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

function isIowaUrl(url: string): boolean {
  const urlLower = url.toLowerCase();
  return urlLower.includes('-ia') || 
         urlLower.includes('iowa') || 
         urlLower.includes('_ia_') ||
         urlLower.includes('/ia/') ||
         urlLower.includes('/ia-');
}

async function auditSource(source: typeof AUCTION_SOURCES[0]): Promise<SourceCoverage> {
  console.log(`\n🔍 Auditing ${source.name}...`);
  
  const searchUrl = source.searchPath ? `${source.url}${source.searchPath}` : source.url;
  
  // Step 1: Discover URLs via Firecrawl map (no limit)
  let discoveredUrls: string[] = [];
  try {
    console.log(`   Discovering URLs from ${searchUrl.substring(0, 60)}...`);
    const mapResult = await firecrawlService.map(searchUrl, 'auction');
    const rawUrls = mapResult.links || mapResult.urls || [];
    
    for (const item of rawUrls) {
      if (typeof item === 'string') {
        discoveredUrls.push(item);
      } else if (item && typeof item === 'object' && (item as any).url) {
        discoveredUrls.push((item as any).url);
      }
    }
    
    console.log(`   ✓ Discovered ${discoveredUrls.length} URLs`);
  } catch (error) {
    console.log(`   ✗ Map API failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }
  
  // Step 2: Get URLs from database
  let dbAuctions: any[] = [];
  try {
    dbAuctions = await db.query.auctions.findMany({
      where: eq(auctions.sourceWebsite, source.name),
      columns: {
        url: true,
        state: true,
        county: true
      }
    });
    console.log(`   ✓ Found ${dbAuctions.length} in database`);
  } catch (error) {
    console.log(`   ✗ Database query failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }
  
  const dbUrls = new Set(dbAuctions.map(a => a.url));
  const discoveredSet = new Set(discoveredUrls);
  
  // Step 3: Calculate differences
  const missingUrls = discoveredUrls.filter(url => !dbUrls.has(url));
  const staleUrls = Array.from(dbUrls).filter(url => !discoveredSet.has(url));
  
  // Step 4: Iowa-specific analysis
  const iowaDiscovered = discoveredUrls.filter(isIowaUrl);
  const iowaInDb = dbAuctions.filter(a => 
    a.state?.toLowerCase() === 'iowa' || 
    a.state?.toLowerCase() === 'ia' ||
    isIowaUrl(a.url)
  );
  const iowaMissing = missingUrls.filter(isIowaUrl);
  
  const coverage: SourceCoverage = {
    discovered_count: discoveredUrls.length,
    database_count: dbAuctions.length,
    coverage_percentage: discoveredUrls.length > 0 
      ? Math.round((dbAuctions.length / discoveredUrls.length) * 100) 
      : 0,
    missing_urls: missingUrls,
    stale_urls: staleUrls,
    iowa_discovered: iowaDiscovered.length,
    iowa_in_database: iowaInDb.length,
    iowa_missing_urls: iowaMissing
  };
  
  console.log(`   📊 Coverage: ${coverage.coverage_percentage}% (${dbAuctions.length}/${discoveredUrls.length})`);
  console.log(`   📍 Iowa: ${iowaInDb.length}/${iowaDiscovered.length} (${iowaMissing.length} missing)`);
  
  if (iowaMissing.length > 0) {
    console.log(`   ⚠️  Missing ${iowaMissing.length} Iowa auctions!`);
  }
  
  return coverage;
}

async function runAudit(): Promise<void> {
  console.log('🚀 Starting Comprehensive Auction Coverage Audit\n');
  console.log(`Auditing ${AUCTION_SOURCES.length} auction sources...\n`);
  
  const report: AuditReport = {
    audit_date: new Date().toISOString(),
    sources: {},
    summary: {
      total_sources: AUCTION_SOURCES.length,
      total_discovered: 0,
      total_in_database: 0,
      overall_coverage: 0,
      iowa_discovered: 0,
      iowa_in_database: 0,
      iowa_coverage: 0
    }
  };
  
  // Audit each source
  for (const source of AUCTION_SOURCES) {
    try {
      const coverage = await auditSource(source);
      report.sources[source.name] = coverage;
      
      // Update summary
      report.summary.total_discovered += coverage.discovered_count;
      report.summary.total_in_database += coverage.database_count;
      report.summary.iowa_discovered += coverage.iowa_discovered;
      report.summary.iowa_in_database += coverage.iowa_in_database;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`   ❌ Failed to audit ${source.name}:`, error instanceof Error ? error.message : error);
    }
  }
  
  // Calculate overall coverage
  if (report.summary.total_discovered > 0) {
    report.summary.overall_coverage = Math.round(
      (report.summary.total_in_database / report.summary.total_discovered) * 100
    );
  }
  
  if (report.summary.iowa_discovered > 0) {
    report.summary.iowa_coverage = Math.round(
      (report.summary.iowa_in_database / report.summary.iowa_discovered) * 100
    );
  }
  
  // Save report
  const reportPath = path.join(process.cwd(), 'AUCTION_COVERAGE_REPORT.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Print summary
  console.log('\n\n📊 AUDIT SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Total Sources Audited:     ${report.summary.total_sources}`);
  console.log(`Total URLs Discovered:     ${report.summary.total_discovered}`);
  console.log(`Total URLs in Database:    ${report.summary.total_in_database}`);
  console.log(`Overall Coverage:          ${report.summary.overall_coverage}%\n`);
  
  console.log(`Iowa URLs Discovered:      ${report.summary.iowa_discovered}`);
  console.log(`Iowa URLs in Database:     ${report.summary.iowa_in_database}`);
  console.log(`Iowa Coverage:             ${report.summary.iowa_coverage}%\n`);
  
  // List sources with low coverage
  const lowCoverage = Object.entries(report.sources)
    .filter(([_, data]) => data.coverage_percentage < 80 && data.discovered_count > 0)
    .sort((a, b) => a[1].coverage_percentage - b[1].coverage_percentage);
  
  if (lowCoverage.length > 0) {
    console.log('⚠️  Sources with <80% Coverage:\n');
    lowCoverage.forEach(([name, data]) => {
      console.log(`   ${name}: ${data.coverage_percentage}% (${data.database_count}/${data.discovered_count})`);
      if (data.iowa_missing_urls.length > 0) {
        console.log(`      → Missing ${data.iowa_missing_urls.length} Iowa auctions`);
      }
    });
    console.log('');
  }
  
  // List Iowa gaps
  const iowaGaps = Object.entries(report.sources)
    .filter(([_, data]) => data.iowa_missing_urls.length > 0)
    .sort((a, b) => b[1].iowa_missing_urls.length - a[1].iowa_missing_urls.length);
  
  if (iowaGaps.length > 0) {
    console.log('🌽 Missing Iowa Auctions by Source:\n');
    iowaGaps.forEach(([name, data]) => {
      console.log(`   ${name}: ${data.iowa_missing_urls.length} missing`);
      data.iowa_missing_urls.slice(0, 3).forEach(url => {
        const shortUrl = url.length > 60 ? url.substring(0, 60) + '...' : url;
        console.log(`      - ${shortUrl}`);
      });
      if (data.iowa_missing_urls.length > 3) {
        console.log(`      ... and ${data.iowa_missing_urls.length - 3} more`);
      }
    });
    console.log('');
  }
  
  console.log(`\n✅ Report saved to: ${reportPath}`);
  console.log('\nNext Steps:');
  console.log('  1. Review AUCTION_COVERAGE_REPORT.json for detailed analysis');
  console.log('  2. Add missing Iowa auctions using: npx tsx scripts/add-auction-by-url.ts <URL>');
  console.log('  3. Run regular scrapes to improve coverage\n');
}

// Run the audit
runAudit()
  .then(() => {
    console.log('✅ Audit completed successfully!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Audit failed:', error);
    process.exit(1);
  });

