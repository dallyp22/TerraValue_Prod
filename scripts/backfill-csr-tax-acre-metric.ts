import "dotenv/config";
import { db } from "../server/db";
import { valuations } from "../shared/schema";
import { isNotNull, sql } from "drizzle-orm";

/**
 * Backfill script to add dollarPerCsrTaxAcre metric to existing valuations
 * 
 * This metric normalizes land price by soil productivity:
 * Formula: (blendedValuePerAcre || csr2Value) ÷ csr2Mean
 */

async function backfillCsrTaxAcreMetric() {
  console.log("🔄 Starting backfill of $ per CSR Tax Acre metric...\n");

  try {
    // Fetch all valuations that have CSR2 data but no dollarPerCsrTaxAcre
    const allValuations = await db
      .select()
      .from(valuations)
      .where(isNotNull(valuations.breakdown));

    console.log(`📊 Found ${allValuations.length} total valuations\n`);

    let updated = 0;
    let skipped = 0;
    let noCSR2 = 0;

    for (const valuation of allValuations) {
      const breakdown = valuation.breakdown as any;

      // Skip if no breakdown
      if (!breakdown) {
        skipped++;
        continue;
      }

      // Skip if already has the metric
      if (breakdown.dollarPerCsrTaxAcre !== null && breakdown.dollarPerCsrTaxAcre !== undefined) {
        skipped++;
        continue;
      }

      // Skip if no CSR2 data
      if (!breakdown.csr2Mean || breakdown.csr2Mean <= 0) {
        noCSR2++;
        continue;
      }

      // Calculate the metric
      const valuePerAcre = breakdown.blendedValuePerAcre || breakdown.csr2Value;
      
      if (!valuePerAcre || valuePerAcre <= 0) {
        noCSR2++;
        continue;
      }

      const dollarPerCsrTaxAcre = Math.round((valuePerAcre / breakdown.csr2Mean) * 100) / 100;

      // Update the breakdown
      const updatedBreakdown = {
        ...breakdown,
        dollarPerCsrTaxAcre
      };

      // Update in database
      await db
        .update(valuations)
        .set({ breakdown: updatedBreakdown })
        .where(sql`${valuations.id} = ${valuation.id}`);

      updated++;
      
      // Log progress every 10 updates
      if (updated % 10 === 0) {
        console.log(`✅ Updated ${updated} valuations...`);
      }
    }

    console.log("\n📈 Backfill Complete!");
    console.log(`   ✅ Updated: ${updated} valuations`);
    console.log(`   ⏭️  Skipped (already had metric): ${skipped} valuations`);
    console.log(`   ⚠️  No CSR2 data: ${noCSR2} valuations`);
    console.log(`   📊 Total processed: ${allValuations.length} valuations\n`);

  } catch (error) {
    console.error("❌ Error during backfill:", error);
    throw error;
  }
}

// Run the backfill
backfillCsrTaxAcreMetric()
  .then(() => {
    console.log("✨ Backfill script completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Backfill script failed:", error);
    process.exit(1);
  });

