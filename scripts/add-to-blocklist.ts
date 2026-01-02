/**
 * Add URL to auction blocklist
 */

import 'dotenv/config';
import { db } from '../server/db.js';
import { auctionBlocklist, auctions } from '../shared/schema.js';
import { eq } from 'drizzle-orm';

const targetUrl = process.argv[2];
const reason = process.argv[3] || 'non-farm';

if (!targetUrl) {
  console.error('Usage: npx tsx scripts/add-to-blocklist.ts <URL> [reason]');
  console.error('Example: npx tsx scripts/add-to-blocklist.ts "https://example.com/shop-auction" "non-farm"');
  console.error('\nReasons: non-farm, spam, duplicate, equipment-only, etc.');
  process.exit(1);
}

async function addToBlocklist() {
  try {
    // Check if already in blocklist
    const existing = await db.query.auctionBlocklist.findFirst({
      where: eq(auctionBlocklist.url, targetUrl)
    });

    if (existing) {
      console.log(`⚠️  URL is already in blocklist:`);
      console.log(`   Added: ${existing.addedAt}`);
      console.log(`   Reason: ${existing.reason}`);
      process.exit(0);
    }

    // Add to blocklist
    await db.insert(auctionBlocklist).values({
      url: targetUrl,
      reason: reason,
      addedBy: 'manual'
    });

    console.log(`\n✅ Added to blocklist:`);
    console.log(`   URL: ${targetUrl}`);
    console.log(`   Reason: ${reason}`);

    // Also delete from auctions table if it exists
    const auction = await db.query.auctions.findFirst({
      where: eq(auctions.url, targetUrl)
    });

    if (auction) {
      await db.delete(auctions).where(eq(auctions.url, targetUrl));
      console.log(`   Also deleted auction ID ${auction.id} from database`);
    }

    console.log(`\n✅ This URL will no longer be scraped in future runs.\n`);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

addToBlocklist();

