#!/usr/bin/env node
import { auctionScraperService } from '../server/services/auctionScraper.js';

/**
 * CLI tool to manually add an auction by URL
 * Usage: npx tsx scripts/add-auction-by-url.ts <url> [sourceName]
 */

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
Usage: npx tsx scripts/add-auction-by-url.ts <url> [sourceName]

Examples:
  npx tsx scripts/add-auction-by-url.ts "https://www.bigiron.com/Lots/466-46-acres-pottawattamie-county-ia"
  npx tsx scripts/add-auction-by-url.ts "https://example.com/auction" "Example Auctions"

This will:
  1. Scrape the auction data from the URL
  2. Geocode the address to get coordinates
  3. Save the auction to the database
  4. Make it available on the map
  `);
  process.exit(0);
}

const url = args[0];
const sourceName = args[1];

console.log('🚀 Manual Auction Addition Tool\n');
console.log(`URL: ${url}`);
if (sourceName) {
  console.log(`Source: ${sourceName}`);
}
console.log('');

auctionScraperService.scrapeSpecificUrl(url, sourceName)
  .then((result) => {
    if (result) {
      console.log('✅ Success! The auction has been added to your database.');
      console.log('   You can now view it on the map and calculate its CSR2 valuation.\n');
      process.exit(0);
    } else {
      console.log('❌ Failed to add auction. Please check the URL and try again.\n');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    console.log('\nPlease ensure:');
    console.log('  1. Your DATABASE_URL is set correctly');
    console.log('  2. The URL is valid and accessible');
    console.log('  3. The page contains auction information\n');
    process.exit(1);
  });

