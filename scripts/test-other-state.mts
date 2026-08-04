/**
 * Regression cases for namesOtherState / urlNamesOtherState.
 *
 * MUST-DROP are real production strings we paid Firecrawl to scrape and then
 * discarded, plus the California listing that got saved because its `state`
 * column was empty.
 *
 * MUST-KEEP is the important half. Iowa's borders are the Missouri, Mississippi
 * and Big Sioux rivers, and "Missouri River bottom ground" is standard Iowa
 * sale-bill language — a naive state-name match would drop prime Iowa farmland.
 *
 * Run: npx tsx scripts/test-other-state.mts
 */
import 'dotenv/config';
import { namesOtherState, urlNamesOtherState } from '../server/services/auctionScraper.js';

const dropText = [
  '1,120± Acres of Prime Farmland for Auction in Waupaca County, WI – Irrigated & Tillable',
  'Buildable 20 Acre Tract in Olmsted County near Rochester, MN',
  '3536.36+/- Acres Los Angeles County, California',
  'Land Auction — Adams County, North Dakota',
  '212 Acre Land Auction Lewis County, Missouri (Listing #18565)',
  'Grant County, Wisconsin Tillable and Recreational Land Auction',
  'Highly Productive Nebraska Farmland for Sale in Thurston County',
  'Benton County, MN Land Auction - 154± Acres',
];

const keepText = [
  '374.59 Taxable Acres M/L Shelby County Farmland',                      // no state named
  '240 Acres Missouri River Bottom Ground, Harrison County',              // border river
  '80 Acres Mississippi River Bluff Timber',                              // border river
  'Big Sioux River bottom, 120 acres',                                    // border river
  '155 Acres Dickinson County, Iowa',                                     // Iowa named
  '71.19 Taxable Acres M/L Shelby County (Union Township – Section 20)',   // nothing
  'Fremont County farm near the Missouri River, Iowa',                    // both, Iowa wins upstream
  // Iowa places that a bare state-word match would have destroyed:
  'Multi-Use Acreage For Sale in Missouri Valley',        // a TOWN in Harrison County, Iowa
  'Enjoy All That Missouri Valley and Harrison County Have to Offer',
  '80 Acres Washington County - Tillable',                // Washington County IS in Iowa
  '15± Acres Delaware County Prime Timber',               // Delaware County IS in Iowa
  '240 Acres in Union County, prime cropland',            // Union County IS in Iowa
  // ", in" must not read as Indiana — real McCall Auctions titles, Monona County, Iowa:
  '\u201cLIVE\u201d LAND AUCTION - 149.96 Taxable Acres, m/l, in Sec\u2019s 7 and 12',
  'LAND AUCTION - 107.87 Probable Irrigated Acres, m/l, in Monona County',
  'Small acreage, or a building site, near town',          // ", or" is not Oregon
  'Contact me, or see the sale bill',                      // ", me" is not Maine
];

const dropUrl = [
  'https://peoplescompany.com/listings/land-auction-waupaca-county-wisconsin-18764',
  'https://peoplescompany.com/listings/land-auction-olmsted-county-minnesota-18523',
  'https://www.landwatch.com/minnesota-land-for-sale/auctions',
  'https://www.highpointlandcompany.com/land/missouri/auctions',
];
const keepUrl = [
  'https://osbornauction.com/sept-9-farmland-auction/',
  'https://www.denisonlivestock.com/sales.asp',
  'https://www.highpointlandcompany.com/land/iowa/winneshiek',
  'https://www.landsearch.com/properties/zook-spur-pl-woodward-ia-50156/5371880',
  'https://kiloterra.com/property/15-acres-of-prime-timber-with-building-site',
  'https://www.ucloesshills.com/areainformation',
];

let failed = 0;
for (const t of dropText) if (!namesOtherState(t)) { console.log(`  FAIL kept: ${t.slice(0,60)}`); failed++; }
for (const t of keepText) if (namesOtherState(t)) { console.log(`  FAIL dropped: ${t.slice(0,60)}`); failed++; }
for (const u of dropUrl) if (!urlNamesOtherState(u)) { console.log(`  FAIL url kept: ${u}`); failed++; }
for (const u of keepUrl) if (urlNamesOtherState(u)) { console.log(`  FAIL url dropped: ${u}`); failed++; }
console.log(failed === 0
  ? `PASS — ${dropText.length + dropUrl.length} out-of-state dropped, ${keepText.length + keepUrl.length} kept`
  : `FAILED: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
