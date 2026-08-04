/**
 * Measures the non-farm archiving heuristic against real production rows.
 *
 * Run: npx tsx scripts/test-archiver-heuristics.ts
 *
 * Two populations:
 *   1. `archived_auctions` rows already deleted as `non_farm_property` — how
 *      many would the new rule have spared? These rows have no
 *      property_category column, so this measures the title/land_type fix only.
 *   2. live `auctions` rows — exercises the classifier veto as well.
 *
 * Read-only. Nothing is written.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { isNonFarmProperty } from '../server/services/auctionArchiver.js';

/** The rule as it stood before this change, reproduced verbatim for comparison. */
function isNonFarmLegacy(auction: any): boolean {
  const landType = auction.landType?.toLowerCase() || '';
  const title = auction.title?.toLowerCase() || '';

  if (title.includes('equipment') && !title.includes('land')) return true;
  if (title.includes('personal property')) return true;
  if (title.includes('estate auction') && !title.includes('land') && !title.includes('farm') && !title.includes('acre')) return true;
  if (title.includes('livestock') && !title.includes('land')) return true;
  if (title.includes('church contents')) return true;
  if (title.includes('sportsman')) return true;
  if (title.includes('gun')) return true;
  if (title.includes('collector')) return true;

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
  if (landType === 'farm equipment') return true;

  return false;
}

const sql = neon(process.env.DATABASE_URL!);

function sample(rows: any[], n = 6) {
  return rows.slice(0, n).map(r => `      • ${String(r.title).slice(0, 96)}`).join('\n');
}

async function main() {
  console.log('\n=== 1. Rows already deleted as non_farm_property ===');
  const archived = await sql`
    SELECT title, land_type AS "landType", acreage
      FROM archived_auctions
     WHERE archived_reason = 'non_farm_property'
  ` as any[];

  const stillNonFarm = archived.filter(r => isNonFarmProperty(r));
  const spared = archived.filter(r => !isNonFarmProperty(r));

  console.log(`  total archived as non-farm : ${archived.length}`);
  console.log(`  still non-farm under new rule: ${stillNonFarm.length}`);
  console.log(`  SPARED by new rule           : ${spared.length}  (${((spared.length / archived.length) * 100).toFixed(1)}%)`);

  const realEstate = spared.filter(r => /real estate auction/i.test(r.title));
  console.log(`\n  of those spared, "Real Estate Auction" titles: ${realEstate.length}`);
  console.log(sample(realEstate));

  const withAcres = spared.filter(r => /\backes?|\bacres?\b|m\/l/i.test(r.title));
  console.log(`\n  of those spared, titles stating acreage: ${withAcres.length}`);
  console.log(sample(withAcres));

  console.log('\n  still archived (correctly) — sample:');
  console.log(sample(stillNonFarm, 8));

  // Anything the new rule catches that the old one missed is a NEW deletion.
  // This must stay tiny and must be inspected by hand.
  const newlyCaught = archived.filter(r => !isNonFarmLegacy(r) && isNonFarmProperty(r));
  console.log(`\n  newly caught by new rule (was NOT caught before): ${newlyCaught.length}`);
  if (newlyCaught.length) console.log(sample(newlyCaught, 10));

  console.log('\n=== 2. Live auctions (classifier veto in play) ===');
  const live = await sql`
    SELECT id, title, land_type AS "landType", property_category AS "propertyCategory",
           status, auction_date AS "auctionDate"
      FROM auctions
  ` as any[];

  const legacyFlags = live.filter(r => isNonFarmLegacy(r));
  const newFlags = live.filter(r => isNonFarmProperty(r));
  const rescued = live.filter(r => isNonFarmLegacy(r) && !isNonFarmProperty(r));
  const added = live.filter(r => !isNonFarmLegacy(r) && isNonFarmProperty(r));

  console.log(`  live rows                 : ${live.length}`);
  console.log(`  flagged non-farm (legacy) : ${legacyFlags.length}`);
  console.log(`  flagged non-farm (new)    : ${newFlags.length}`);
  console.log(`  rescued (legacy yes, new no): ${rescued.length}`);
  console.log(sample(rescued, 10));
  console.log(`\n  newly flagged (legacy no, new yes): ${added.length}`);
  if (added.length) console.log(sample(added, 10));

  const byCategory: Record<string, number> = {};
  for (const r of rescued) {
    const k = r.propertyCategory || 'null';
    byCategory[k] = (byCategory[k] || 0) + 1;
  }
  console.log('\n  rescued rows by classifier category:', byCategory);

  console.log('\n=== 3. Why the remaining "Real Estate Auction" rows still archive ===');
  const reStillArchived = stillNonFarm.filter(r => /real estate auction/i.test(r.title));
  const byLandType: Record<string, number> = {};
  for (const r of reStillArchived) {
    const k = (r.landType || 'null').toLowerCase();
    byLandType[k] = (byLandType[k] || 0) + 1;
  }
  console.log(`  "Real Estate Auction" titles still archived: ${reStillArchived.length}`);
  console.log('  by land_type (structured, still trusted):', byLandType);

  // THE invariant. The whole point of this change is that the rule may only
  // shrink; anything it newly catches is a listing the old code kept and the new
  // code would delete. That must be zero, on every population.
  console.log('\n=== INVARIANT: new rule ⊆ old rule ===');
  const violations = newlyCaught.length + added.length;
  if (violations === 0) {
    console.log('  ✓ no row is archived by the new rule that the old rule kept');
  } else {
    console.log(`  ✗ ${violations} rows would be NEWLY archived — the rule grew, which is not allowed`);
  }
  process.exit(violations === 0 ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
