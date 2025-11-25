import { db } from "../server/db.js";
import { auctions } from "@shared/schema";
import { isNull, sql } from "drizzle-orm";
import { auctionParcelExtractor } from "../server/services/auctionParcelExtractor.js";

/**
 * Backfill CSR2 data for all existing auctions
 * Extracts CSR2 from title, description, and enrichedDescription (AI Insights)
 */
async function backfillCSR2() {
  console.log('🔍 Starting CSR2 backfill for existing auctions...\n');

  try {
    // Get all auctions without CSR2 data
    const auctionsWithoutCSR2 = await db
      .select()
      .from(auctions)
      .where(isNull(auctions.csr2Mean));

    console.log(`📊 Found ${auctionsWithoutCSR2.length} auctions without CSR2 data\n`);

    if (auctionsWithoutCSR2.length === 0) {
      console.log('✅ All auctions already have CSR2 data!');
      process.exit(0);
    }

    let extracted = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < auctionsWithoutCSR2.length; i++) {
      const auction = auctionsWithoutCSR2[i];
      const progress = `[${i + 1}/${auctionsWithoutCSR2.length}]`;

      try {
        // Extract parcel info including CSR2
        console.log(`${progress} Processing: ${auction.title?.substring(0, 50)}...`);
        
        const extractedInfo = await auctionParcelExtractor.extractParcelInfo(auction);

        if (extractedInfo.csr2Data?.mean) {
          // Update auction with extracted CSR2
          await db
            .update(auctions)
            .set({
              csr2Mean: extractedInfo.csr2Data.mean,
              csr2Min: extractedInfo.csr2Data.min,
              csr2Max: extractedInfo.csr2Data.max,
            })
            .where(sql`${auctions.id} = ${auction.id}`);

          console.log(`   ✅ Extracted CSR2: ${extractedInfo.csr2Data.mean} (${extractedInfo.csr2Data.min}-${extractedInfo.csr2Data.max})`);
          extracted++;
        } else {
          console.log(`   ⏭️  No CSR2 found in listing`);
          skipped++;
        }

      } catch (error) {
        console.error(`   ❌ Failed to extract:`, error instanceof Error ? error.message : error);
        failed++;
      }

      // Add small delay to avoid rate limiting
      if (i < auctionsWithoutCSR2.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Backfill Complete!');
    console.log('='.repeat(60));
    console.log(`✅ Extracted: ${extracted} auctions`);
    console.log(`⏭️  Skipped: ${skipped} auctions (no CSR2 in listing)`);
    console.log(`❌ Failed: ${failed} auctions`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run backfill
backfillCSR2();

