/**
 * LandHub — Next.js aggregator with listing data embedded in `__NEXT_DATA__`.
 *
 * LandHub server-renders its Iowa results page and ships the full record set as JSON in
 * the standard Next.js hydration payload. That means we get the data with a plain GET:
 * no render, no LLM, no Firecrawl credit. Crucially the records include `latitude`,
 * `longitude`, `county` and `acres`, so anything found here bypasses geocoding entirely.
 *
 * VOLUME REALITY CHECK — this source is small, and it was badly oversold.
 * The 2026-07-17 research claimed "~90 IA auction listings". A 2026-08-03 walk of all
 * 10 pages found 113 Iowa listings of which exactly 3 carry `listing_type == "Auction"`
 * (the rest are For Sale / Under Contract / New Listing). The research appears to have
 * counted total listings. Expect ~3 auctions, not ~90 — this adapter earns its place on
 * cost and coordinate quality, not on volume.
 *
 * We keep only `listing_type == "Auction"`. The pipeline maps farmland *auctions*; a
 * plain for-sale listing is a different product and would pollute the map.
 */

import {
  fetchWithTimeout,
  isIowa,
  normalizeCounty,
  parseAcreage,
  parseCounty,
  toCoord,
  type DiscoveredListing,
  type SourceAdapter,
  type SourceDiscovery,
} from './types.js';

const SOURCE_NAME = 'LandHub';

/** Canonical Iowa results page. `landhub.com` 301s to `www.`; we request www directly. */
const IOWA_URL = 'https://www.landhub.com/property-for-sale/iowa-land-for-sale';

/**
 * 12 records per page and ~113 Iowa listings today → 10 pages. The cap stops a layout
 * change (or an infinite-scroll rewrite that ignores `?page=`) from looping forever.
 */
const MAX_PAGES = 15;

const REQUEST_DELAY_MS = 250;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface LandHubRecord {
  id?: number;
  title?: string | null;
  description?: string | null;
  listing_type?: string | null;
  category?: string | null;
  acres?: number | string | null;
  price?: number | string | null;
  county?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  street_address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  updated_at?: string | null;
  listing_id?: string | number | null;
}

/**
 * Extract and parse the `__NEXT_DATA__` script block.
 *
 * Matched with a regex rather than a DOM parser because the repo has no HTML parsing
 * dependency and this payload is a single well-delimited `<script id="__NEXT_DATA__">`
 * element — pulling in cheerio for one tag would not pay for itself.
 */
function extractNextData(html: string): unknown | null {
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function readRecords(nextData: unknown): LandHubRecord[] {
  const pageProps = (nextData as { props?: { pageProps?: { dataFromServer?: unknown } } })?.props?.pageProps;
  const rows = pageProps?.dataFromServer;
  return Array.isArray(rows) ? (rows as LandHubRecord[]) : [];
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * LandHub records carry no detail-page path, so the listing URL is rebuilt from the
 * numeric id, which is the pattern its own result cards link to.
 */
function listingUrl(record: LandHubRecord): string {
  return record.id ? `https://www.landhub.com/land-detail/${record.id}` : IOWA_URL;
}

function toListing(record: LandHubRecord): DiscoveredListing | null {
  // `state` arrives as the full name ("Iowa") on this endpoint, so isIowa() handles both.
  if (!isIowa(record.state)) return null;

  const title = record.title?.trim();
  if (!title) return null;

  const latitude = toCoord(record.latitude);
  const longitude = toCoord(record.longitude);

  const address =
    [record.street_address, record.city, record.state, record.zipcode].filter(Boolean).join(', ') || undefined;

  return {
    url: listingUrl(record),
    title,
    description: record.description?.trim() || undefined,
    // LandHub exposes no auction date on the results payload — only the detail page has
    // one. Left undefined so the existing date pipeline flags it for review rather than
    // inventing a date from `updated_at`, which is a publication timestamp, not a sale date.
    auctionDate: undefined,
    address,
    // `acres` is occasionally null even when the title states it ("152.8 Acres Emmet
    // County, Iowa"), so fall back to the title rather than losing the figure.
    acreage: toNumber(record.acres) ?? parseAcreage(title),
    // `county` is frequently an empty string on this feed even when the title names the
    // county, and when present it arrives suffixed ("Clay County") — normalise both paths.
    county: normalizeCounty(record.county) ?? parseCounty(title),
    state: 'IA',
    latitude: latitude !== undefined && longitude !== undefined ? latitude : undefined,
    longitude: latitude !== undefined && longitude !== undefined ? longitude : undefined,
    sourceName: SOURCE_NAME,
    externalId: record.id ? `landhub:${record.id}` : undefined,
    updatedAt: record.updated_at ?? undefined,
  };
}

export function createLandHubAdapter(): SourceAdapter {
  return {
    name: SOURCE_NAME,
    async discover(): Promise<SourceDiscovery> {
      const warnings: string[] = [];
      const byId = new Map<string, DiscoveredListing>();
      let auctionCount = 0;

      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = page === 1 ? IOWA_URL : `${IOWA_URL}?page=${page}`;

        let html: string;
        try {
          const res = await fetchWithTimeout(url);
          if (!res.ok) {
            warnings.push(`${SOURCE_NAME}: page ${page} → HTTP ${res.status}`);
            break;
          }
          html = await res.text();
        } catch (error) {
          warnings.push(`${SOURCE_NAME}: page ${page} failed — ${(error as Error).message}`);
          break;
        }

        const nextData = extractNextData(html);
        if (!nextData) {
          // A missing payload means LandHub changed its rendering strategy — that is a
          // silent-zero failure mode, so make it loud rather than returning an empty list.
          warnings.push(`${SOURCE_NAME}: page ${page} had no __NEXT_DATA__ payload (site structure may have changed)`);
          break;
        }

        const records = readRecords(nextData);
        if (records.length === 0) break;

        for (const record of records) {
          if ((record.listing_type ?? '').trim().toLowerCase() !== 'auction') continue;
          auctionCount++;
          const listing = toListing(record);
          if (listing) byId.set(listing.externalId ?? listing.url, listing);
        }

        await sleep(REQUEST_DELAY_MS);
      }

      if (auctionCount === 0) {
        warnings.push(`${SOURCE_NAME}: no auction-typed listings found (expected ~3 as of 2026-08-03)`);
      }

      return { listings: Array.from(byId.values()), warnings };
    },
  };
}
