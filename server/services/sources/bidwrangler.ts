/**
 * BidWrangler — free, unauthenticated JSON API.
 *
 * BidWrangler is a white-label bidding platform; each auction company gets its own
 * subdomain, and every one of them exposes `/api/auctions` with no key, no signature
 * and no bot protection. That makes it the only source in the whole 2026-08 audit that
 * is genuinely zero-cost AND structured: no render, no LLM extraction, no credits.
 *
 * TWO-CALL PATTERN — this is the part the prior research got wrong.
 * The 2026-07-17 research claimed `/api/auctions` returns `location.lat/lng`. It does
 * not, for the records that matter: on 2026-08-03 all three upcoming Peoples Company
 * auctions had `location: null` on the list endpoint. Coordinates live one level down,
 * on `/api/auctions/{id}/items`, where they were present and correct
 * (Buchanan County tract → 42.4528262, -91.8902491, plus a `county` field).
 * So we list auctions, then fetch items for the survivors. Items are also where the
 * real per-tract description and address live.
 *
 * SUBSET WARNING — do not use this to replace a website scrape.
 * The API only carries auctions routed through BidWrangler's *online bidding* platform.
 * Live/in-person sales never appear. Walking all 618 Peoples Company records yielded 3
 * upcoming Iowa auctions while peoplescompany.com listed 14 — so swapping the existing
 * Firecrawl scrape for this API would silently drop 11 of 14. This adapter is ADDITIVE:
 * it onboards hosts we do not otherwise scrape, and (for a host we already scrape) it
 * contributes free coordinates and `updated_at` that the HTML scrape cannot give us.
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

/** Verified live on 2026-08-03; all returned 200 application/json. */
export const VERIFIED_BIDWRANGLER_HOSTS = [
  /** Hoenig Auctions — Burlington / Des Moines County. 42 auctions, 12 upcoming Iowa. */
  'hoenigauctions',
  /** United Country Iowa. 14 auctions, 2 upcoming Iowa land, both with coordinates. */
  'uciowa',
  /** Heritage Land & Auction Group — Dyersville. Small board; MN+IA farms. */
  'heritagelandauction',
] as const;

/**
 * Peoples Company is NOT in the default host list.
 *
 * It is already source #4 via Firecrawl, and its API view is a strict 3-of-14 subset
 * (see header). It is exported separately so it can be wired in deliberately as a
 * coordinate/freshness companion — never as a replacement for the website scrape.
 */
export const PEOPLES_COMPANY_HOST = 'peoplescompany';

interface BwLocation {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  county?: string | null;
  lat?: string | number | null;
  lng?: string | number | null;
}

interface BwAuction {
  id: number;
  name?: string | null;
  description?: string | null;
  simple_description?: string | null;
  status?: string | null;
  starts_at?: string | null;
  scheduled_end_time?: string | null;
  updated_at?: string | null;
  items_count?: number | null;
  complete?: boolean | null;
  archived?: boolean | null;
  published?: boolean | null;
  location?: BwLocation | null;
  contact_company?: string | null;
}

interface BwItem {
  id: number;
  name?: string | null;
  description_without_html?: string | null;
  location?: BwLocation | null;
  location_str?: string | null;
}

interface BwAuctionsPage {
  total?: number;
  auctions?: BwAuction[];
  all_auction_ids?: number[];
}

interface BwItemsPage {
  total?: number;
  items?: BwItem[];
}

/**
 * Hard ceiling on pagination. Peoples Company needs 13 pages for its full history;
 * 40 leaves generous headroom while guaranteeing a malformed response can never spin
 * this into an unbounded loop inside a scheduled scrape.
 */
const MAX_PAGES = 40;

/** Courtesy pause between requests. The API has no published rate limit and did not
 *  throttle 13 sequential fetches, but a scrape run touches several hosts in a row. */
const REQUEST_DELAY_MS = 150;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function getJson<T>(url: string): Promise<T> {
  const res = await fetchWithTimeout(url, { accept: 'application/json' });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * An auction is worth reporting only if it has not already happened.
 *
 * Prefers `scheduled_end_time` (online auctions close at the end) and falls back to
 * `starts_at` for live sales that carry no close time. `archived`/`complete` are
 * belt-and-braces: the API sets them on finished sales, but a live sale that lacks
 * both dates should not be silently dropped, so an unparseable date keeps the record.
 */
function isUpcoming(auction: BwAuction, now: Date): boolean {
  if (auction.archived || auction.complete) return false;
  const raw = auction.scheduled_end_time || auction.starts_at;
  if (!raw) return true;
  const when = new Date(raw);
  if (Number.isNaN(when.getTime())) return true;
  return when.getTime() >= now.getTime();
}

/** Walk every page of a host's auction list. */
async function fetchAllAuctions(host: string, warnings: string[]): Promise<BwAuction[]> {
  const base = `https://${host}.bidwrangler.com/api/auctions`;
  const seen = new Map<number, BwAuction>();
  let expectedTotal: number | null = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    let payload: BwAuctionsPage;
    try {
      payload = await getJson<BwAuctionsPage>(`${base}?page=${page}`);
    } catch (error) {
      warnings.push(`${host}: auction list page ${page} failed — ${(error as Error).message}`);
      break;
    }

    if (expectedTotal === null && typeof payload.total === 'number') expectedTotal = payload.total;

    const batch = payload.auctions ?? [];
    if (batch.length === 0) break;

    // Pages are disjoint (verified: page 1 and 2 shared 0 of 50 ids), but de-duping by
    // id keeps us correct if the host ever reorders mid-walk.
    for (const auction of batch) seen.set(auction.id, auction);
    if (expectedTotal !== null && seen.size >= expectedTotal) break;

    await sleep(REQUEST_DELAY_MS);
  }

  // Array.from rather than a spread: the repo's tsconfig sets no `target`, so it
  // defaults to ES5 and spreading a Map iterator trips TS2802.
  return Array.from(seen.values());
}

/**
 * Fetch an auction's items to recover location.
 *
 * Only the first page is read: a land auction's tracts all sit in the same county, and
 * the first located item is enough to place the auction on the map. Pulling every page
 * of a 300-lot equipment sale would cost far more requests than the location is worth.
 */
async function fetchFirstItems(host: string, auctionId: number, warnings: string[]): Promise<BwItem[]> {
  try {
    const payload = await getJson<BwItemsPage>(
      `https://${host}.bidwrangler.com/api/auctions/${auctionId}/items`,
    );
    return payload.items ?? [];
  } catch (error) {
    warnings.push(`${host}: items for auction ${auctionId} failed — ${(error as Error).message}`);
    return [];
  }
}

function firstLocated(items: BwItem[]): BwItem | undefined {
  return items.find((item) => toCoord(item.location?.lat) !== undefined) ?? items.find((item) => item.location);
}

function buildAddress(location?: BwLocation | null, fallback?: string | null): string | undefined {
  if (fallback) return fallback;
  if (!location) return undefined;
  const parts = [location.street, location.city, location.state, location.zip].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

/**
 * Turn one auction + its items into a listing, or null if it is not an Iowa auction.
 *
 * State is decided by the item/auction location first because that is authoritative;
 * the title is only consulted when the record carries no location at all. Titles like
 * "Buchanan County, IA ONLINE ONLY Land Auction" are the common case for hosts that
 * leave `location` null.
 */
function toListing(host: string, sourceName: string, auction: BwAuction, items: BwItem[]): DiscoveredListing | null {
  const item = firstLocated(items);
  const location = item?.location ?? auction.location ?? null;
  const title = auction.name?.trim() || `BidWrangler auction ${auction.id}`;

  const stateFromData = location?.state ?? undefined;
  const titleSaysIowa = /\b(IA|Iowa)\b/.test(title);
  if (stateFromData ? !isIowa(stateFromData) : !titleSaysIowa) return null;

  const description =
    item?.description_without_html?.trim() ||
    auction.simple_description?.trim() ||
    auction.description?.trim() ||
    undefined;

  const latitude = toCoord(location?.lat);
  const longitude = toCoord(location?.lng);

  return {
    // /ui/auction/{id} is the public permalink (verified 200); the /api path is not
    // a page a user could ever open, so it must not become the stored URL.
    url: `https://${host}.bidwrangler.com/ui/auction/${auction.id}`,
    title,
    description,
    auctionDate: auction.scheduled_end_time || auction.starts_at || undefined,
    address: buildAddress(location, item?.location_str),
    // Acreage is almost always in the auction title ("33.75 Acres M/L"); the item name
    // carries it for single-tract sales.
    acreage: parseAcreage(title) ?? parseAcreage(item?.name) ?? parseAcreage(description),
    county: normalizeCounty(location?.county) ?? parseCounty(title),
    state: 'IA',
    latitude: latitude !== undefined && longitude !== undefined ? latitude : undefined,
    longitude: latitude !== undefined && longitude !== undefined ? longitude : undefined,
    sourceName,
    externalId: `bidwrangler:${host}:${auction.id}`,
    updatedAt: auction.updated_at ?? undefined,
    auctionHouse: auction.contact_company?.trim() || undefined,
  };
}

/**
 * One adapter instance per BidWrangler host, so each auction company still shows up as
 * its own named source in per-source coverage diagnostics.
 */
export function createBidWranglerAdapter(host: string, displayName?: string): SourceAdapter {
  const name = displayName ?? `BidWrangler: ${host}`;

  return {
    name,
    async discover(): Promise<SourceDiscovery> {
      const warnings: string[] = [];
      const now = new Date();

      const all = await fetchAllAuctions(host, warnings);
      const upcoming = all.filter((auction) => isUpcoming(auction, now));

      const listings: DiscoveredListing[] = [];
      for (const auction of upcoming) {
        // Cheap pre-filter: skip the items call for auctions that already declare a
        // non-Iowa location, so a multi-state host does not cost us a request per sale.
        const declared = auction.location?.state;
        if (declared && !isIowa(declared)) continue;

        const items = await fetchFirstItems(host, auction.id, warnings);
        const listing = toListing(host, name, auction, items);
        if (listing) listings.push(listing);
        await sleep(REQUEST_DELAY_MS);
      }

      return { listings, warnings };
    },
  };
}

/** The three hosts verified live on 2026-08-03. Peoples Company is deliberately absent. */
export function createVerifiedBidWranglerAdapters(): SourceAdapter[] {
  return VERIFIED_BIDWRANGLER_HOSTS.map((host) => createBidWranglerAdapter(host));
}

/**
 * Peoples Company via BidWrangler — coordinate/freshness companion only.
 *
 * Named distinctly so it can never be mistaken for the existing Firecrawl source #4 in
 * diagnostics, and so a future reader sees immediately that two sources intentionally
 * cover the same company.
 */
export function createPeoplesCompanyCompanionAdapter(): SourceAdapter {
  return createBidWranglerAdapter(PEOPLES_COMPANY_HOST, 'Peoples Company (BidWrangler companion)');
}
