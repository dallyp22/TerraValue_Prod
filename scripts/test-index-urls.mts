/**
 * Regression cases for isIndexPageUrl.
 *
 * MUST-DROP entries are real URLs that were saved as auctions in production.
 * MUST-KEEP entries are real listing URLs, several of which a naive rule breaks
 * — denisonlivestock.com/sales.asp holds the Kenkel sale a client reported
 * missing, and theacreco.com/live-auction is a genuine listing page.
 *
 * Run: npx tsx scripts/test-index-urls.mts
 */
import 'dotenv/config';
import { isIndexPageUrl } from '../server/services/auctionScraper.js';

const ENTRY = new Set([
  'https://foxauctioncompany.com/current-auctions',
  'https://theacreco.com',
  'https://www.ucloesshills.com/auctions',
]);

const drop = [
  'https://www.ucloesshills.com/results/',
  'https://www.ucloesshills.com/results/iowa/',
  'https://www.ucloesshills.com/results/ia/harrison',
  'https://www.ucloesshills.com/',
  'https://www.arrowheadrealtycompany.com/towns/atlantic-homes-for-sale/farmland-auctions/',
  'https://foxauctioncompany.com/current-auctions',
  'https://theacreco.com',
  'https://theacreco.com/category/live-auctions/',
  'https://www.landwatch.com/indiana-land-for-sale/auctions',
  'https://www.highpointlandcompany.com/land/missouri/auctions',
  'https://www.landwatch.com/iowa-land-for-sale/western-region/auctions/page-2',
  'https://www.land.com/Comanche-County-OK/all-land/at-auction',
];

const keep = [
  'https://www.denisonlivestock.com/sales.asp',
  'https://theacreco.com/live-auction',
  'https://osbornauction.com/sept-9-farmland-auction/',
  'https://osbornauction.com/wp-content/uploads/2026/04/Wilwerding-Sale-Bill-11x17-4.pdf',
  'https://www.exchangeline.com/auction/374-59-taxable-acres-m-l-shelby-harrison-county-farmland-auction/',
  'https://bid.dreamdirt.com/auction/741/item/tract-1-1549-acres-grant-twp-29-t88n-41w-688-csr2-36340/',
  'https://www.landsearch.com/properties/zook-spur-pl-woodward-ia-50156/5371880',
  'https://peoplescompany.com/listings/land-auction-buchanan-county-iowa-19547',
  'https://www.landhub.com/land-detail/80549850',
  'https://steffesgroup.com/auctions/6bbcf2d4-bc8a-40b3-bd57-28',
];

let failed = 0;
for (const u of drop) {
  const got = isIndexPageUrl(u, ENTRY);
  if (!got) { console.log(`  FAIL kept (should drop):  ${u}`); failed++; }
}
for (const u of keep) {
  const got = isIndexPageUrl(u, ENTRY);
  if (got) { console.log(`  FAIL dropped (should keep): ${u}`); failed++; }
}
console.log(failed === 0
  ? `PASS — ${drop.length} index pages dropped, ${keep.length} listings kept`
  : `FAILED: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
