import "dotenv/config";
import { db } from "../server/db";
import { auctions } from "@shared/schema";
import { and, eq, or, sql } from "drizzle-orm";

async function markSoldAuctions(dryRun: boolean = false) {
  console.log('🏷️  Mark Sold Auctions Script');
  console.log('================================\n');
  
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  try {
    // Find auctions with "sold" indicators in title or description
    console.log('🔍 Searching for sold auctions...');
    
    const soldAuctions = await db.query.auctions.findMany({
      where: and(
        eq(auctions.status, 'active'),
        or(
          sql`LOWER(title) LIKE '%sold%'`,
          sql`LOWER(description) LIKE '%sold%'`,
          sql`LOWER(title) LIKE '%closed%'`,
          sql`LOWER(description) LIKE '%sale closed%'`,
          sql`LOWER(description) LIKE '%auction closed%'`,
          sql`LOWER(description) LIKE '%contract pending%'`
        )
      )
    });

    console.log(`\n📊 Found ${soldAuctions.length} auctions marked as sold\n`);

    if (soldAuctions.length === 0) {
      console.log('✅ No sold auctions found!');
      return;
    }

    // Display samples
    console.log('Sample of auctions to mark as sold:');
    soldAuctions.slice(0, 10).forEach((auction, i) => {
      const soldIndicator = 
        auction.title?.toLowerCase().includes('sold') ? 'SOLD in title' :
        auction.description?.toLowerCase().includes('sold') ? 'sold in description' :
        'closed/pending';
        
      console.log(`  ${i + 1}. ${auction.title.substring(0, 60)}...`);
      console.log(`     Source: ${auction.sourceWebsite}`);
      console.log(`     Indicator: ${soldIndicator}`);
      console.log('');
    });

    if (soldAuctions.length > 10) {
      console.log(`  ... and ${soldAuctions.length - 10} more\n`);
    }

    if (dryRun) {
      console.log('✅ Dry run complete - no changes made');
      console.log(`\n   ${soldAuctions.length} auctions would be marked as sold`);
      return;
    }

    // Mark auctions as sold
    console.log('🏷️  Marking auctions as sold...');
    let marked = 0;
    
    for (const auction of soldAuctions) {
      try {
        await db.update(auctions)
          .set({ 
            status: 'sold',
            updatedAt: new Date()
          })
          .where(eq(auctions.id, auction.id));
        marked++;
      } catch (error) {
        console.error(`   ❌ Failed to mark auction ${auction.id}: ${error}`);
      }
    }

    console.log(`\n✅ Complete!`);
    console.log(`   Marked: ${marked} auctions as sold`);
    console.log(`\n📊 Impact:`);
    console.log(`   - ${marked} sold auctions will no longer appear on map`);
    console.log(`   - Data preserved in database with status='sold'`);
    console.log(`   - Map now shows only active/upcoming auctions\n`);

  } catch (error) {
    console.error('\n❌ Error during processing:');
    console.error(error);
    process.exit(1);
  }
}

// Check for dry-run flag
const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');

// Run the script
markSoldAuctions(isDryRun)
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });

