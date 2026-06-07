import "dotenv/config";
import { db } from "../server/db.js";
import { auctions, archivedAuctions } from "@shared/schema";
import { inArray } from "drizzle-orm";

/**
 * Archive (move to archived_auctions, then delete from active) auctions that are:
 *   - non-real-estate:   property_category = 'non_land'   (equipment, personal property, coins, etc.)
 *   - already happened:  auction_date in the past (trusted date), OR status = 'sold'
 *
 * Keeps all real estate (farmland, recreational, residential, commercial,
 * development, unknown) that is still upcoming.
 *
 *   tsx scripts/archive-nonfarm-and-past.ts --dry-run
 *   tsx scripts/archive-nonfarm-and-past.ts
 */

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const all = await db.select().from(auctions);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const reasonFor = (a: any): string | null => {
    if (a.status === "archived") return null;
    if (a.propertyCategory === "non_land") return "non_real_estate";
    if (a.status === "sold") return "marked_sold";
    if (a.auctionDate && !a.needsDateReview && new Date(a.auctionDate) < today) return "past_auction_date";
    return null;
  };

  const toArchive = all.map((a) => ({ a, reason: reasonFor(a) })).filter((x) => x.reason);

  const byReason: Record<string, number> = {};
  for (const { reason } of toArchive) byReason[reason!] = (byReason[reason!] || 0) + 1;

  console.log(`Active auctions: ${all.length}`);
  console.log(`To archive: ${toArchive.length}`);
  Object.entries(byReason).forEach(([r, n]) => console.log(`   - ${r}: ${n}`));

  if (toArchive.length === 0) { console.log("Nothing to archive."); process.exit(0); }

  if (dryRun) {
    console.log("\nSample (first 10):");
    toArchive.slice(0, 10).forEach(({ a, reason }) =>
      console.log(`  [${reason}] ${(a.title || "").slice(0, 55)} | ${a.county || "?"} | ${a.propertyCategory || "?"} | ${a.auctionDate ? new Date(a.auctionDate).toISOString().slice(0,10) : "no date"}`),
    );
    console.log("\n(dry-run: nothing written)");
    process.exit(0);
  }

  let archived = 0, failed = 0;
  for (const { a, reason } of toArchive) {
    try {
      await db.insert(archivedAuctions).values({
        title: a.title, description: a.description, url: a.url, sourceWebsite: a.sourceWebsite,
        auctionDate: a.auctionDate, auctionType: a.auctionType, auctioneer: a.auctioneer,
        address: a.address, county: a.county, state: a.state, acreage: a.acreage, landType: a.landType,
        latitude: a.latitude, longitude: a.longitude, csr2Mean: a.csr2Mean, csr2Min: a.csr2Min, csr2Max: a.csr2Max,
        estimatedValue: a.estimatedValue, rawData: a.rawData, scrapedAt: a.scrapedAt, updatedAt: a.updatedAt,
        status: a.status, archivedReason: reason!, originalId: a.id,
      });
      archived++;
    } catch (e) {
      console.error(`  ❌ archive failed id ${a.id}: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  // Delete the successfully-archived rows from active (batched).
  const ids = toArchive.map((x) => x.a.id);
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    try { await db.delete(auctions).where(inArray(auctions.id, batch)); deleted += batch.length; }
    catch (e) { console.error(`  ❌ delete batch failed: ${e instanceof Error ? e.message : e}`); }
  }

  console.log(`\n✅ Archived ${archived}, deleted ${deleted} from active${failed ? `, ${failed} failed` : ""}.`);
  process.exit(0);
}

main().catch((e) => { console.error("Fatal:", e instanceof Error ? e.message : e); process.exit(1); });
