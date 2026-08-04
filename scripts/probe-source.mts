/**
 * Run one source adapter and print what it actually returned.
 *
 * These adapters hit live third-party sites, so "does it typecheck" says nothing about
 * whether it still works — a layout change turns a healthy parser into a silent zero.
 * This script exists so each adapter can be verified independently, without triggering
 * a full scrape run or writing anything to the database.
 *
 *   npx tsx scripts/probe-source.mts                    # list adapters
 *   npx tsx scripts/probe-source.mts farmmarketauctions # run one
 *   npx tsx scripts/probe-source.mts landhub --json     # raw JSON output
 *   npx tsx scripts/probe-source.mts all                # every listing adapter
 */

// The free adapters need no configuration, but the stealth-proxied ones read
// FIRECRAWL_API_KEY from the environment, so load .env the same way the other scripts do.
import 'dotenv/config';

import { createAdapterRegistry, type DiscoveredListing, type SourceDiscovery } from '../server/services/sources/index.js';

const registry = createAdapterRegistry();
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const target = args.find((arg) => !arg.startsWith('--'));

/** Land keywords, used only to report how much of a mixed calendar is farmland.
 *  The real classification lives in `auctionClassifier.ts`; this is a probe hint. */
const LAND_HINT = /\b(land|acre|acres|farmland|farm|tract|cropland|pasture|timber|csr)\b/i;

function looksLikeLand(listing: DiscoveredListing): boolean {
  return LAND_HINT.test(`${listing.title} ${listing.description ?? ''}`);
}

function summarise(name: string, result: SourceDiscovery): void {
  const listings = result.listings ?? [];
  const directory = result.directory ?? [];
  const urls = result.urls ?? [];
  const withCoords = listings.filter((l) => l.latitude !== undefined && l.longitude !== undefined);
  const landish = listings.filter(looksLikeLand);

  console.log(`\n=== ${name} ===`);
  console.log(
    `listings: ${listings.length}  (land-looking: ${landish.length}, with coordinates: ${withCoords.length})` +
      `  |  directory: ${directory.length}  |  urls: ${urls.length}`,
  );

  for (const listing of listings) {
    const coords =
      listing.latitude !== undefined ? `${listing.latitude.toFixed(5)},${listing.longitude!.toFixed(5)}` : 'no-coords';
    const acres = listing.acreage !== undefined ? `${listing.acreage}ac` : '—';
    console.log(`  • ${listing.title.slice(0, 78)}`);
    console.log(
      `      ${acres} | ${listing.county ?? 'no-county'} County | ${coords} | ${listing.auctionDate ?? 'no-date'}`,
    );
    console.log(`      ${listing.url.slice(0, 110)}`);
  }

  for (const entry of directory.slice(0, 15)) {
    const where = [entry.city, entry.state].filter(Boolean).join(', ');
    console.log(`  • ${entry.name}${where ? ` (${where})` : ''}${entry.website ? ` → ${entry.website}` : ''}`);
  }
  if (directory.length > 15) console.log(`  … and ${directory.length - 15} more`);

  for (const warning of result.warnings ?? []) console.log(`  ⚠ ${warning}`);
}

async function run(key: string): Promise<void> {
  const factory = registry[key];
  if (!factory) {
    console.error(`Unknown adapter "${key}". Available: ${Object.keys(registry).join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const adapter = factory();
  const startedAt = Date.now();
  try {
    const result = await adapter.discover();
    if (asJson) {
      console.log(JSON.stringify({ adapter: adapter.name, ...result }, null, 2));
    } else {
      summarise(adapter.name, result);
      console.log(`  (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
    }
  } catch (error) {
    console.error(`\n=== ${adapter.name} === FAILED`);
    console.error(error);
    process.exitCode = 1;
  }
}

if (!target) {
  console.log('Usage: npx tsx scripts/probe-source.mts <adapter|all> [--json]\n');
  console.log('Adapters:');
  for (const key of Object.keys(registry)) console.log(`  ${key}`);
} else if (target === 'all') {
  // Sequential on purpose: this is a diagnostic, and hammering four third-party hosts
  // in parallel is both ruder and harder to read than waiting a few seconds.
  for (const key of ['hoenigauctions', 'uciowa', 'heritagelandauction', 'farmmarketauctions', 'landhub']) {
    await run(key);
  }
} else {
  await run(target);
}
