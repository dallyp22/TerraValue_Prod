import "dotenv/config";
import { db } from "../server/db";
import { auctions, archivedAuctions } from "@shared/schema";
import { and, lt, eq, inArray } from "drizzle-orm";

async function archivePastAuctions(dryRun: boolean = false) {
  console.log('🗄️  Archive Past Auctions Script');
  console.log('================================\n');
  
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  // Calculate cutoff date (7 days ago)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);
  
  console.log(`📅 Cutoff date: ${cutoffDate.toLocaleDateString()}`);
  console.log(`   (Archiving auctions with auction_date before ${cutoffDate.toISOString()})\n`);

  try {
    // Find auctions to archive
    console.log('🔍 Finding auctions to archive...');
    const pastAuctions = await db.query.auctions.findMany({
      where: and(
        lt(auctions.auctionDate, cutoffDate),
        eq(auctions.status, 'active')
      )
    });

    console.log(`\n📊 Found ${pastAuctions.length} auctions to archive\n`);

    if (pastAuctions.length === 0) {
      console.log('✅ No auctions to archive. Database is clean!');
      return;
    }

    // Display sample of auctions to be archived
    console.log('Sample of auctions to be archived:');
    pastAuctions.slice(0, 5).forEach((auction, i) => {
      console.log(`  ${i + 1}. ${auction.title}`);
      console.log(`     Date: ${auction.auctionDate ? new Date(auction.auctionDate).toLocaleDateString() : 'Unknown'}`);
      console.log(`     Source: ${auction.sourceWebsite}`);
      console.log(`     County: ${auction.county || 'Unknown'}, ${auction.state || 'Unknown'}`);
      console.log('');
    });

    if (pastAuctions.length > 5) {
      console.log(`  ... and ${pastAuctions.length - 5} more\n`);
    }

    if (dryRun) {
      console.log('✅ Dry run complete - no changes made');
      return;
    }

    // Ask for confirmation in production
    console.log('⚠️  About to archive these auctions. This will:');
    console.log('   1. Copy them to the archived_auctions table');
    console.log('   2. Remove them from the active auctions table');
    console.log('   3. They will no longer appear on the map\n');

    // Archive the auctions
    console.log('📦 Archiving auctions...');
    let archived = 0;
    
    for (const auction of pastAuctions) {
      try {
        // Copy to archived_auctions table
        await db.insert(archivedAuctions).values({
          title: auction.title,
          description: auction.description,
          url: auction.url,
          sourceWebsite: auction.sourceWebsite,
          auctionDate: auction.auctionDate,
          auctionType: auction.auctionType,
          auctioneer: auction.auctioneer,
          address: auction.address,
          county: auction.county,
          state: auction.state,
          acreage: auction.acreage,
          landType: auction.landType,
          latitude: auction.latitude,
          longitude: auction.longitude,
          csr2Mean: auction.csr2Mean,
          csr2Min: auction.csr2Min,
          csr2Max: auction.csr2Max,
          estimatedValue: auction.estimatedValue,
          rawData: auction.rawData,
          scrapedAt: auction.scrapedAt,
          updatedAt: auction.updatedAt,
          status: auction.status,
          archivedReason: 'past_auction_date',
          originalId: auction.id
        });
        archived++;
      } catch (error) {
        console.error(`   ❌ Failed to archive auction ${auction.id}: ${auction.title}`);
        console.error(`      Error: ${error}`);
      }
    }

    console.log(`✅ Archived ${archived} auctions to archived_auctions table\n`);

    // Delete from auctions table
    console.log('🗑️  Removing archived auctions from active table...');
    const auctionIds = pastAuctions.map(a => a.id);
    
    // Delete in batches to avoid potential issues with large datasets
    const batchSize = 100;
    let deleted = 0;
    
    for (let i = 0; i < auctionIds.length; i += batchSize) {
      const batch = auctionIds.slice(i, i + batchSize);
      const result = await db.delete(auctions).where(
        inArray(auctions.id, batch)
      );
      deleted += batch.length;
      console.log(`   Deleted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(auctionIds.length / batchSize)}`);
    }

    console.log(`\n✅ Archive complete!`);
    console.log(`   Archived: ${archived} auctions`);
    console.log(`   Deleted: ${deleted} auctions from active table`);
    console.log(`\n📊 Summary:`);
    console.log(`   - ${archived} past auctions now in archived_auctions table`);
    console.log(`   - Auctions older than ${cutoffDate.toLocaleDateString()} have been removed from map`);
    console.log(`   - Upcoming auctions remain active and visible\n`);

  } catch (error) {
    console.error('❌ Error during archiving process:');
    console.error(error);
    process.exit(1);
  }
}

// Check for dry-run flag
const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');

// Run the script
archivePastAuctions(isDryRun)
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

