/**
 * Delete auction by URL
 */

import 'dotenv/config';
import { db } from '../server/db.js';
import { auctions } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

const targetUrl = process.argv[2];

if (!targetUrl) {
  console.error('Usage: npx tsx scripts/delete-auction-by-url.ts <URL>');
  process.exit(1);
}

async function deleteAuction() {
  try {
    // Find the auction
    const auction = await db.query.auctions.findFirst({
      where: eq(auctions.url, targetUrl)
    });

    if (!auction) {
      console.log(`❌ Auction not found with URL: ${targetUrl}`);
      process.exit(0);
    }

    console.log(`\n🔍 Found auction:`);
    console.log(`   ID: ${auction.id}`);
    console.log(`   Title: ${auction.title}`);
    console.log(`   Source: ${auction.sourceWebsite}`);
    console.log(`   County: ${auction.county || 'Unknown'}`);

    // Delete it
    await db.delete(auctions).where(eq(auctions.url, targetUrl));

    console.log(`\n✅ Successfully deleted auction ID ${auction.id}`);
    console.log(`   Removed from database and will no longer appear on map.\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

deleteAuction();

