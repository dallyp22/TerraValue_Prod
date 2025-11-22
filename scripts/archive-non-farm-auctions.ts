import "dotenv/config";
import { db } from "../server/db";
import { auctions, archivedAuctions } from "@shared/schema";
import { inArray } from "drizzle-orm";

async function archiveNonFarmAuctions(dryRun: boolean = false) {
  console.log('🗄️  Archive Non-Farm Auctions Script');
  console.log('====================================\n');
  
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  try {
    // Get all active auctions
    const allAuctions = await db.query.auctions.findMany({
      where: (auctions, { eq, or }) => or(
        eq(auctions.status, 'active'),
        eq(auctions.status, 'sold')
      )
    });

    console.log(`📊 Total active auctions: ${allAuctions.length}\n`);

    // Define non-farm keywords
    const nonFarmKeywords = [
      'residential', 'commercial', 'house', 'building', 'sportsman', 
      'gun', 'collector', 'equipment', 'machinery', 'personal property',
      'estate auction', 'auto auction', 'vehicle', 'church contents',
      'workshop contents', 'livestock auction', 'cattle auction'
    ];
    
    // Filter non-farm auctions
    const nonFarmAuctions = allAuctions.filter(auction => {
      const landType = auction.landType?.toLowerCase() || '';
      const title = auction.title?.toLowerCase() || '';
      const description = auction.description?.toLowerCase() || '';
      
      // Check for equipment/personal property auctions in title
      if (title.includes('equipment') && !title.includes('land')) return true;
      if (title.includes('personal property')) return true;
      if (title.includes('estate auction') && !title.includes('land') && !title.includes('farm') && !title.includes('acre')) return true;
      if (title.includes('livestock') && !title.includes('land')) return true;
      if (title.includes('church contents')) return true;
      if (title.includes('sportsman')) return true;
      if (title.includes('gun')) return true;
      if (title.includes('collector')) return true;
      
      // Check land type
      if (landType === 'residential') return true;
      if (landType === 'commercial') return true;
      if (landType === 'commercial building') return true;
      if (landType === 'auto auction') return true;
      if (landType === 'personal property auction') return true;
      if (landType === 'farm equipment auction') return true;
      if (landType === 'equipment auction') return true;
      if (landType === 'estate auction') return true;
      if (landType === 'workshop') return true;
      if (landType === 'church contents') return true;
      if (landType === 'livestock') return true;
      
      return false;
    });

    console.log(`🚫 Found ${nonFarmAuctions.length} non-farm auctions to archive\n`);

    if (nonFarmAuctions.length === 0) {
      console.log('✅ No non-farm auctions to archive. Database is clean!');
      return;
    }

    // Display sample of auctions to be archived
    console.log('Sample of non-farm auctions to be archived:');
    nonFarmAuctions.slice(0, 10).forEach((auction, i) => {
      console.log(`  ${i + 1}. ${auction.title}`);
      console.log(`     Land Type: ${auction.landType || 'Unknown'}`);
      console.log(`     County: ${auction.county || 'Unknown'}, ${auction.state || 'Unknown'}`);
      console.log(`     Source: ${auction.sourceWebsite}`);
      console.log('');
    });

    if (nonFarmAuctions.length > 10) {
      console.log(`  ... and ${nonFarmAuctions.length - 10} more\n`);
    }

    if (dryRun) {
      console.log('✅ Dry run complete - no changes made');
      return;
    }

    // Ask for confirmation in production
    console.log('⚠️  About to archive these non-farm auctions. This will:');
    console.log('   1. Copy them to the archived_auctions table');
    console.log('   2. Remove them from the active auctions table');
    console.log('   3. They will no longer appear on the map\n');

    // Archive the auctions
    console.log('📦 Archiving non-farm auctions...');
    let archived = 0;
    
    for (const auction of nonFarmAuctions) {
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
          archivedReason: 'non_farm_property',
          originalId: auction.id
        });
        archived++;
      } catch (error) {
        console.error(`   ❌ Failed to archive auction ${auction.id}: ${auction.title}`);
        console.error(`      Error: ${error}`);
      }
    }

    console.log(`✅ Archived ${archived} non-farm auctions to archived_auctions table\n`);

    // Delete from auctions table
    console.log('🗑️  Removing archived auctions from active table...');
    const auctionIds = nonFarmAuctions.map(a => a.id);
    
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
    console.log(`   Archived: ${archived} non-farm auctions`);
    console.log(`   Deleted: ${deleted} auctions from active table`);
    console.log(`\n📊 Summary:`);
    console.log(`   - ${archived} non-farm auctions now in archived_auctions table`);
    console.log(`   - Equipment, residential, and other non-farm auctions have been removed`);
    console.log(`   - Only farm/agricultural land auctions remain active\n`);

  } catch (error) {
    console.error('❌ Error during archiving process:');
    console.error(error);
    process.exit(1);
  }
}

// Check for dry-run flag
const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');

// Run the script
archiveNonFarmAuctions(isDryRun)
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });


