import "dotenv/config";
import { db, pool } from "../server/db.js";
import { auctions } from "@shared/schema";
import { eq } from "drizzle-orm";
import { classifyAuction } from "../server/services/auctionClassifier.js";

/**
 * Add the classification columns (idempotent DDL — NOT drizzle-kit push, which
 * is destructive on this DB) and backfill propertyCategory on every auction.
 *   tsx scripts/classify-auctions.ts [--dry-run]
 */

const DDL = [
  `ALTER TABLE auctions ADD COLUMN IF NOT EXISTS property_category text`,
  `ALTER TABLE auctions ADD COLUMN IF NOT EXISTS classification_confidence real`,
  `ALTER TABLE auctions ADD COLUMN IF NOT EXISTS classification_source text`,
  `ALTER TABLE auctions ADD COLUMN IF NOT EXISTS classification_reason text`,
  `CREATE INDEX IF NOT EXISTS auctions_property_category_idx ON auctions (property_category)`,
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Always ensure the columns exist (idempotent, non-destructive) — the select
  // below reads them. --dry-run only skips the data backfill.
  console.log("🛠  Ensuring classification columns…");
  for (const s of DDL) await pool.query(s);

  const all = await db.select().from(auctions);
  console.log(`📊 Classifying ${all.length} auctions…`);

  const counts: Record<string, number> = {};
  const sampleNonLand: string[] = [];

  // Classify all in JS first.
  const classified = all.map((a) => {
    const c = classifyAuction({
      title: a.title,
      description: a.description,
      enrichedDescription: a.enrichedDescription,
      landType: a.landType,
      acreage: a.acreage,
      csr2Mean: a.csr2Mean,
    });
    counts[c.category] = (counts[c.category] || 0) + 1;
    if (c.category === "non_land" && sampleNonLand.length < 8) {
      sampleNonLand.push(`• ${(a.title || "").slice(0, 60)} [${a.landType || "—"}]`);
    }
    return { id: a.id, c };
  });

  console.log("Result:", JSON.stringify(counts));
  console.log("Sample non_land:\n" + sampleNonLand.join("\n"));

  if (dryRun) {
    console.log("(dry-run: nothing written)");
    process.exit(0);
  }

  // Write back in concurrent chunks.
  const CHUNK = 25;
  for (let i = 0; i < classified.length; i += CHUNK) {
    await Promise.all(
      classified.slice(i, i + CHUNK).map(({ id, c }) =>
        db.update(auctions).set({
          propertyCategory: c.category,
          classificationConfidence: c.confidence,
          classificationSource: "keyword",
          classificationReason: c.reason,
        }).where(eq(auctions.id, id)),
      ),
    );
  }
  console.log(`✅ Backfilled ${classified.length} auctions.`);
  process.exit(0);
}

main().catch((e) => { console.error("Failed:", e instanceof Error ? e.message : e); process.exit(1); });
