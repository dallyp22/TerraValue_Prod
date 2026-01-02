/**
 * Verify blocklist is working
 */

import 'dotenv/config';
import { db } from '../server/db.js';
import { auctionBlocklist, auctions } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

const targetUrl = "https://www.juranekonlineauctions.com/hs-timed-auctions/listing/upcoming-auctions/251573669/nebraska-pheumatic-inc-2-ci323e80h-other-shop-slash-warehouse";

async function verifyBlocklist() {
  try {
    console.log('🔍 Verifying blocklist setup...\n');

    // Check if URL is in blocklist
    const blocklisted = await db.query.auctionBlocklist.findFirst({
      where: eq(auctionBlocklist.url, targetUrl)
    });

    if (blocklisted) {
      console.log('✅ URL is in blocklist:');
      console.log(`   Reason: ${blocklisted.reason}`);
      console.log(`   Added: ${blocklisted.addedAt}`);
      console.log(`   Added by: ${blocklisted.addedBy}`);
    } else {
      console.log('❌ URL is NOT in blocklist');
    }

    // Check if URL still exists in auctions
    const auction = await db.query.auctions.findFirst({
      where: eq(auctions.url, targetUrl)
    });

    if (auction) {
      console.log('\n❌ WARNING: Auction still exists in database!');
      console.log(`   ID: ${auction.id}`);
      console.log(`   Title: ${auction.title}`);
    } else {
      console.log('\n✅ Auction has been removed from database');
    }

    // Count total blocklist entries
    const allBlocked = await db.query.auctionBlocklist.findMany();
    console.log(`\n📊 Total blocklist entries: ${allBlocked.length}`);
    
    if (allBlocked.length > 0) {
      console.log('\n📋 All blocked URLs:');
      allBlocked.forEach((entry, i) => {
        const shortUrl = entry.url.length > 80 ? entry.url.substring(0, 77) + '...' : entry.url;
        console.log(`   ${i + 1}. ${entry.reason} - ${shortUrl}`);
      });
    }

    console.log('\n✅ Blocklist verification complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

verifyBlocklist();

