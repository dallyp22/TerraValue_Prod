/**
 * Find auctions with SOLD indicators but not marked as sold
 */

import 'dotenv/config';
import { db } from '../server/db.js';
import { auctions } from '../shared/schema.js';
import { ne, or, isNull, eq } from 'drizzle-orm';

async function findSoldAuctions() {
  console.log('\n🔍 Finding SOLD auctions that need to be archived...\n');

  try {
    const allAuctions = await db.query.auctions.findMany();
    
    const soldButActive = allAuctions.filter(auction => {
      // Check if title or description contains "SOLD"
      const titleHasSold = auction.title?.toUpperCase().includes('SOLD');
      const titleHasSale = auction.title?.toUpperCase().includes('– SOLD') || 
                          auction.title?.toUpperCase().includes('- SOLD');
      const descHasSold = auction.description?.toLowerCase().includes('sold');
      const descHasClosed = auction.description?.toLowerCase().includes('sale closed') ||
                           auction.description?.toLowerCase().includes('auction closed');
      
      // Status is still active (not marked as sold)
      const isActive = auction.status === 'active';
      
      return isActive && (titleHasSold || titleHasSale || descHasSold || descHasClosed);
    });

    console.log(`Found ${soldButActive.length} ACTIVE auctions with SOLD indicators:\n`);

    soldButActive.forEach((auction, idx) => {
      console.log(`${idx + 1}. ${auction.title}`);
      console.log(`   ID: ${auction.id}`);
      console.log(`   Source: ${auction.sourceWebsite}`);
      console.log(`   Date: ${auction.auctionDate || 'No date'}`);
      console.log(`   Status: ${auction.status}`);
      console.log(`   Enriched: ${auction.enrichmentStatus || 'No'}`);
      console.log('');
    });

    if (soldButActive.length > 0) {
      console.log('─────────────────────────────────────────────────────');
      console.log(`\n💡 To remove these from the map, run:`);
      console.log(`   npm run auctions:mark-sold\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

findSoldAuctions();

