/**
 * Regression cases for auctionClassifier keyword matching.
 *
 * Exists because `hasAny` used bare `includes()`, so "deer" in the recreational
 * list matched "John Deere" and put farm equipment on the land map. Every case
 * below is a real production title.
 *
 * Run: npx tsx scripts/test-classifier.mts
 */
import { classifyAuction } from '../server/services/auctionClassifier.js';

const cases: Array<{ title: string; want: 'not-rec' | 'rec' | 'farmland' | 'non_land' }> = [
  { title: '2022 John Deere S780 2WD Combine', want: 'not-rec' },
  { title: '2015 JOHN DEERE 2720 Rippers', want: 'not-rec' },
  { title: '1971 JOHN DEERE 4020', want: 'not-rec' },
  { title: 'JOHN DEERE KBA Disks', want: 'not-rec' },
  { title: 'JOHN DEERE SHAKER POTATO DIGGER 108', want: 'not-rec' },
  { title: '160 Acres Prime Deer Hunting Ground, Timber and Creek', want: 'rec' },
  { title: '80 acres recreational land with cabin and wildlife habitat', want: 'rec' },
  { title: '374.59 Taxable Acres M/L Shelby County Farmland', want: 'farmland' },
  { title: '155 Acres tillable cropland, 82 CSR2', want: 'farmland' },
  { title: '80 ac. m/l Harrison County', want: 'farmland' },
  // Bare implement titles must be non_land, not merely "unknown" — the map
  // filter only excludes non_land, so unknown still renders.
  { title: '2022 John Deere S780 2WD Combine', want: 'non_land' },
  { title: '2015 JOHN DEERE 2720 Rippers', want: 'non_land' },
  { title: 'MTD Gold Push Mower', want: 'non_land' },
  { title: '2000 Maroon F-250 Super Duty Pickup', want: 'non_land' },
  // ...but a land sale that merely MENTIONS equipment stays land.
  { title: '155 Acres tillable cropland with grain bins; tractor sells separately', want: 'farmland' },
  { title: '240 Acres M/L Harrison County Farmland & Farm Equipment Auction', want: 'farmland' },
];

let failed = 0;
for (const { title, want } of cases) {
  const r = classifyAuction({ title, description: '', landType: null, acreage: null, csr2Mean: null } as any);
  const ok =
    want === 'rec' ? r.category === 'recreational'
    : want === 'farmland' ? r.category === 'farmland'
    : want === 'non_land' ? r.category === 'non_land'
    : r.category !== 'recreational';
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${r.category.padEnd(12)} <- ${title.slice(0, 54)}`);
  if (!ok) failed++;
}
console.log(failed === 0 ? `PASS (${cases.length} cases)` : `FAILED: ${failed}/${cases.length}`);
process.exit(failed === 0 ? 0 : 1);
