import "dotenv/config";
import { db } from "../server/db";
import { auctions } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { DateExtractorService } from "../server/services/dateExtractor";

async function backfillAuctionDates(dryRun: boolean = false) {
  console.log('📅 Backfill Auction Dates Script');
  console.log('================================\n');
  
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  const dateExtractor = new DateExtractorService();
  
  try {
    // Find auctions with missing dates
    console.log('🔍 Finding auctions with missing dates...');
    const auctionsNeedingDates = await db.query.auctions.findMany({
      where: and(
        eq(auctions.status, 'active'),
        isNull(auctions.auctionDate)
      ),
      orderBy: (auctions, { desc }) => [desc(auctions.scrapedAt)]
    });
    
    console.log(`\n📊 Found ${auctionsNeedingDates.length} auctions needing dates\n`);

    if (auctionsNeedingDates.length === 0) {
      console.log('✅ No auctions need date extraction!');
      return;
    }

    let extracted = 0;
    let failed = 0;
    let regexExtracted = 0;
    let aiExtracted = 0;
    const needsReview: any[] = [];
    const successfulExtractions: any[] = [];

    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < auctionsNeedingDates.length; i += batchSize) {
      const batch = auctionsNeedingDates.slice(i, i + batchSize);
      console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(auctionsNeedingDates.length / batchSize)} (${batch.length} auctions)...`);
      
      for (const auction of batch) {
        try {
          const result = await dateExtractor.extractDateFromText(
            auction.title,
            auction.description || ''
          );
          
          if (result.date) {
            // Successfully extracted date
            if (!dryRun) {
              await db.update(auctions)
                .set({
                  auctionDate: result.date,
                  dateExtractionMethod: result.method,
                  dateExtractionAttempted: new Date(),
                  needsDateReview: false
                })
                .where(eq(auctions.id, auction.id));
            }
            
            extracted++;
            if (result.method === 'regex') regexExtracted++;
            if (result.method === 'ai') aiExtracted++;
            
            successfulExtractions.push({
              title: auction.title,
              extractedDate: result.date,
              method: result.method
            });
            
            console.log(`   ✓ ${auction.title.substring(0, 60)}...`);
            console.log(`     → ${result.date.toLocaleDateString()} (${result.method})`);
          } else {
            // Could not find date - mark for manual review
            if (!dryRun) {
              await db.update(auctions)
                .set({
                  needsDateReview: true,
                  dateExtractionAttempted: new Date()
                })
                .where(eq(auctions.id, auction.id));
            }
            
            needsReview.push({
              id: auction.id,
              title: auction.title,
              sourceWebsite: auction.sourceWebsite
            });
            failed++;
            console.log(`   ✗ ${auction.title.substring(0, 60)}...`);
            console.log(`     → needs manual review`);
          }
          
          // Small delay between API calls to avoid rate limits
          if (result.method === 'ai') {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
        } catch (error) {
          console.error(`   ❌ Error processing auction ${auction.id}:`, error);
          failed++;
        }
      }
    }

    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total auctions processed: ${auctionsNeedingDates.length}`);
    console.log(`✅ Successfully extracted: ${extracted} (${((extracted / auctionsNeedingDates.length) * 100).toFixed(1)}%)`);
    console.log(`   - Via regex: ${regexExtracted}`);
    console.log(`   - Via AI: ${aiExtracted}`);
    console.log(`❌ Needs manual review: ${failed} (${((failed / auctionsNeedingDates.length) * 100).toFixed(1)}%)`);
    console.log('');

    if (needsReview.length > 0 && needsReview.length <= 10) {
      console.log('\n⚠️  Auctions needing manual review:');
      needsReview.forEach((auction, i) => {
        console.log(`   ${i + 1}. [ID: ${auction.id}] ${auction.title.substring(0, 50)}...`);
        console.log(`      Source: ${auction.sourceWebsite}`);
      });
    } else if (needsReview.length > 10) {
      console.log(`\n⚠️  ${needsReview.length} auctions need manual review`);
      console.log(`   Use /api/auctions/needs-review to see the full list`);
    }

    if (successfulExtractions.length > 0 && successfulExtractions.length <= 5) {
      console.log('\n✅ Sample successful extractions:');
      successfulExtractions.slice(0, 5).forEach((item, i) => {
        console.log(`   ${i + 1}. ${item.title.substring(0, 50)}...`);
        console.log(`      Date: ${item.extractedDate.toLocaleDateString()} (${item.method})`);
      });
    }

    if (dryRun) {
      console.log('\n⚠️  DRY RUN COMPLETE - No changes were made to the database');
      console.log('   Run without --dry-run flag to apply changes');
    } else {
      console.log('\n✅ Backfill complete! Database has been updated.');
      console.log('   Next step: Run the archiver to clean up past auctions');
      console.log('   Command: npm run auctions:archive');
    }

  } catch (error) {
    console.error('\n❌ Error during backfill process:');
    console.error(error);
    process.exit(1);
  }
}

// Check for dry-run flag
const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');

// Run the script
backfillAuctionDates(isDryRun)
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

