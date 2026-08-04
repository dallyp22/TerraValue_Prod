/**
 * Registry of structured-source adapters.
 *
 * These are additive to the 51 Firecrawl sources in `auctionScraper.ts` — none of them
 * replaces an existing source. They exist because a handful of sites hand us structured
 * data directly, so paying for a render + LLM extraction on them is pure waste.
 *
 * Three groups, and the caller must treat them differently:
 *   - LISTING adapters (`createListingAdapters`) return `listings` saveable without
 *     Firecrawl, and cost nothing to run.
 *   - STEALTH LISTING adapters (`createStealthListingAdapters`) also return `listings`
 *     but are billed, because the source is behind Cloudflare.
 *   - DISCOVERY adapters (`createDiscoveryAdapters`) return `directory` entries
 *     (auctioneers, not auctions) and feed a candidate-source review loop. They must
 *     never reach the `auctions` table.
 */

import { createBidWranglerAdapter, createVerifiedBidWranglerAdapters, createPeoplesCompanyCompanionAdapter } from './bidwrangler.js';
import { createExchangeLineAdapter } from './exchangeline.js';
import { createFarmMarketAuctionsAdapter } from './farmmarketauctions.js';
import { createIowaAuctioneersAdapter } from './iowaauctioneers.js';
import { createLandHubAdapter } from './landhub.js';
import type { SourceAdapter } from './types.js';

export * from './types.js';
export { stealthScrape } from './firecrawlStealth.js';
export { createExchangeLineAdapter } from './exchangeline.js';
export {
  createBidWranglerAdapter,
  createVerifiedBidWranglerAdapters,
  createPeoplesCompanyCompanionAdapter,
  VERIFIED_BIDWRANGLER_HOSTS,
} from './bidwrangler.js';
export { createFarmMarketAuctionsAdapter } from './farmmarketauctions.js';
export { createIowaAuctioneersAdapter } from './iowaauctioneers.js';
export { createLandHubAdapter } from './landhub.js';

/**
 * Adapters that yield saveable Iowa auction listings.
 *
 * Peoples Company is intentionally excluded: it is already Firecrawl source #4, and its
 * BidWrangler view is a strict subset (3 of 14 Iowa auctions on 2026-08-03). Wire
 * `createPeoplesCompanyCompanionAdapter()` in deliberately if you want its free
 * coordinates, never as a replacement.
 */
export function createListingAdapters(): SourceAdapter[] {
  return [
    ...createVerifiedBidWranglerAdapters(),
    createFarmMarketAuctionsAdapter(),
    createLandHubAdapter(),
  ];
}

/**
 * Adapters that cost Firecrawl credits.
 *
 * Kept separate from `createListingAdapters()` so the free set can run on any schedule
 * without anyone accidentally billing a stealth-proxied scrape every few minutes.
 * Exchangeline needs exactly one stealth call per run (it reads an iCalendar feed rather
 * than paginated HTML), but "one call" is still not "no call".
 */
export function createStealthListingAdapters(): SourceAdapter[] {
  return [createExchangeLineAdapter()];
}

/** Adapters that yield auctioneer candidates rather than auctions. */
export function createDiscoveryAdapters(): SourceAdapter[] {
  return [createIowaAuctioneersAdapter()];
}

/** Every adapter, keyed by a short slug — used by `scripts/probe-source.mts`. */
export function createAdapterRegistry(): Record<string, () => SourceAdapter> {
  return {
    hoenigauctions: () => createBidWranglerAdapter('hoenigauctions'),
    uciowa: () => createBidWranglerAdapter('uciowa'),
    heritagelandauction: () => createBidWranglerAdapter('heritagelandauction'),
    peoplescompany: () => createPeoplesCompanyCompanionAdapter(),
    farmmarketauctions: () => createFarmMarketAuctionsAdapter(),
    landhub: () => createLandHubAdapter(),
    exchangeline: () => createExchangeLineAdapter(),
    iowaauctioneers: () => createIowaAuctioneersAdapter(),
    'iowaauctioneers-details': () => createIowaAuctioneersAdapter({ withDetails: true, detailLimit: 10 }),
  };
}
