/**
 * Script to reprocess all existing auctions with AI enrichment
 * 
 * Usage:
 *   npm run reprocess-auctions
 *   npm run reprocess-auctions -- --limit 100  (process first 100)
 *   npm run reprocess-auctions -- --force      (reprocess all, even completed)
 */

import 'dotenv/config';
import { db } from '../server/db.js';
import { auctions } from '../shared/schema.js';
import { eq, or, isNull } from 'drizzle-orm';
import { Pool } from '@neondatabase/serverless';
import { enrichmentQueue, enrichAllPendingAuctions, reEnrichAllAuctions } from '../server/services/enrichmentQueue.js';

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;
const force = args.includes('--force');

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   AI Auction Enrichment - Reprocessing Script      ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Initialize database pool for geocoding
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  enrichmentQueue.setPool(pool);

  try {
    if (force) {
      console.log('🔄 FORCE MODE: Re-enriching ALL auctions (including completed)\n');
      const stats = await reEnrichAllAuctions(pool);
      printStats(stats);
    } else {
      console.log('📋 STANDARD MODE: Enriching pending auctions only\n');
      
      // Get count of pending auctions
      const pendingAuctions = await db.query.auctions.findMany({
        where: or(
          eq(auctions.enrichmentStatus, 'pending'),
          eq(auctions.enrichmentStatus, 'failed'),
          isNull(auctions.enrichmentStatus)
        ),
        limit: limit
      });

      console.log(`📊 Found ${pendingAuctions.length} auctions to process${limit ? ` (limited to ${limit})` : ''}`);

      if (pendingAuctions.length === 0) {
        console.log('✅ No auctions need enrichment!');
        await pool.end();
        process.exit(0);
      }

      // Reset failed auctions to pending
      const failedCount = pendingAuctions.filter(a => a.enrichmentStatus === 'failed').length;
      if (failedCount > 0) {
        console.log(`🔄 Resetting ${failedCount} failed auctions to pending...\n`);
        await db.update(auctions)
          .set({ enrichmentStatus: 'pending', enrichmentError: null })
          .where(eq(auctions.enrichmentStatus, 'failed'));
      }

      // Process auctions
      const auctionIds = pendingAuctions.map(a => a.id);
      enrichmentQueue.addBatch(auctionIds, 'normal');
      const stats = await enrichmentQueue.processQueue();
      
      printStats(stats);
    }

    // Close pool
    await pool.end();
    
    console.log('\n✅ Reprocessing complete!\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error during reprocessing:', error);
    await pool.end();
    process.exit(1);
  }
}

function printStats(stats: any) {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║                  FINAL RESULTS                      ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log(`\n📊 Total Auctions:     ${stats.total}`);
  console.log(`✅ Successfully Enriched: ${stats.successful}`);
  console.log(`❌ Failed:               ${stats.failed}`);
  
  if (stats.startTime && stats.endTime) {
    const duration = ((stats.endTime.getTime() - stats.startTime.getTime()) / 1000).toFixed(1);
    const avgTime = stats.successful > 0 ? (parseFloat(duration) / stats.successful).toFixed(1) : '0';
    console.log(`⏱️  Total Duration:      ${duration}s`);
    console.log(`⚡ Avg Time per Auction: ${avgTime}s`);
  }

  if (stats.errors && stats.errors.length > 0) {
    console.log(`\n⚠️  Errors (${stats.errors.length}):`);
    stats.errors.slice(0, 10).forEach((err: any) => {
      console.log(`   - Auction ${err.id}: ${err.error}`);
    });
    if (stats.errors.length > 10) {
      console.log(`   ... and ${stats.errors.length - 10} more errors`);
    }
  }

  console.log('\n');
}

// Run the script
main();

