/**
 * Reset stuck enrichments (processing status for too long)
 */

import 'dotenv/config';
import { db } from '../server/db.js';
import { auctions } from '../shared/schema.js';
import { eq, sql } from 'drizzle-orm';

async function resetStuck() {
  console.log('🔄 Resetting stuck enrichments...\n');

  try {
    // Find auctions stuck in processing status
    const stuck = await db.query.auctions.findMany({
      where: eq(auctions.enrichmentStatus, 'processing')
    });

    console.log(`Found ${stuck.length} stuck auctions`);

    if (stuck.length === 0) {
      console.log('✅ No stuck enrichments!');
      process.exit(0);
    }

    // Reset them to pending
    const result = await db.update(auctions)
      .set({ 
        enrichmentStatus: 'pending',
        enrichmentError: null
      })
      .where(eq(auctions.enrichmentStatus, 'processing'));

    console.log(`✅ Reset ${stuck.length} auctions from 'processing' to 'pending'`);
    console.log('\nThey will be re-enriched on next run.\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

resetStuck();

