/**
 * Shared contract for structured-source adapters.
 *
 * Every source in the existing 51 goes through Firecrawl: map the site, render the
 * listing grid, then run an LLM extraction per detail page. That is the right tool
 * for a JS-rendered auctioneer site, but it is the wrong tool — and a wasted credit —
 * for a source that already hands us structured data. A 2026-08-03 coverage audit
 * (docs/scrape-source-expansion.md) live-probed ~60 candidates and found a handful
 * that serve JSON, iCalendar or plain server-rendered HTML: those are what live here.
 *
 * Most adapters here cost nothing — they fetch a public JSON API or a static page.
 * One exception is deliberate: `exchangeline.ts` sits behind Cloudflare and needs
 * Firecrawl's stealth proxy, so it is billed. It still belongs in this folder because
 * it reads a structured feed rather than LLM-extracting rendered HTML, which is what
 * keeps it to a single request per run. `createStealthListingAdapters()` in `index.ts`
 * keeps the billed ones separable from the free ones for scheduling purposes.
 *
 * The interface deliberately allows two very different return shapes because the
 * sources genuinely differ in kind:
 *
 *   - `listings` — the source gave us the actual auction data. The scraper can save
 *     these directly and SKIP Firecrawl entirely. This is the whole point.
 *   - `urls` — the source only told us *where* the auctions are. The scraper should
 *     feed these into its normal Firecrawl detail-extraction path.
 *
 * A source may return both (e.g. a listing whose detail page is still worth rendering).
 */

/**
 * One auction as the source described it.
 *
 * Field names mirror the existing extraction schema in `auctionScraper.ts` so the
 * save path does not need a second translation layer. Everything except `url` and
 * `title` is optional: the value of these sources is precisely that they vary in how
 * much they give away for free, and an adapter must never invent a field it did not
 * receive. A missing `acreage` is honest; a guessed one corrupts a valuation.
 */
export interface DiscoveredListing {
  /** Canonical public URL for the auction. Doubles as the upsert key downstream. */
  url: string;
  title: string;
  description?: string;
  /**
   * Auction date as an ISO-8601 string when the source gave us a real timestamp,
   * otherwise the source's raw date text. Left as a string rather than a Date so the
   * existing multi-strategy date parser stays the single owner of date interpretation —
   * adapters should not silently resolve an ambiguous "8/5" themselves.
   */
  auctionDate?: string;
  address?: string;
  acreage?: number;
  county?: string;
  /** Two-letter state code, uppercased (e.g. 'IA'). */
  state?: string;

  /**
   * Coordinates, when the source published them.
   *
   * This is the single most valuable field here. The existing pipeline geocodes in
   * three tiers (street address → county centroid → Nominatim), and the fallbacks are
   * lossy — a county centroid puts a farm tens of miles from where it actually is.
   * A source-published coordinate skips all of that and is more accurate than anything
   * we could derive.
   */
  latitude?: number;
  longitude?: number;

  /** Which adapter produced this, for per-source diagnostics. */
  sourceName: string;
  /** The source's own stable id, useful for dedupe when URLs drift. */
  externalId?: string;
  /**
   * Source-reported last-modified time, when available. Enables cheap incremental
   * refresh: an unchanged `updatedAt` means nothing needs re-processing.
   */
  updatedAt?: string;
  /** Auctioneer / listing company, when the source names one. */
  auctionHouse?: string;
}

/**
 * One auctioneer from a trade directory.
 *
 * Kept as a distinct type on purpose. Directories yield *businesses*, not auctions,
 * and collapsing them into `DiscoveredListing` would put fake gavels on the map. These
 * feed a candidate-source review loop, not the `auctions` table.
 */
export interface DirectoryEntry {
  name: string;
  /** Profile page within the directory. */
  profileUrl: string;
  /** The auctioneer's own website, when the directory exposes it. */
  website?: string;
  city?: string;
  state?: string;
  phone?: string;
  /** Directory-assigned specialty tags (e.g. 'farmland', 'real-estate'). */
  tags?: string[];
  sourceName: string;
}

/**
 * What a single `discover()` call produced.
 *
 * `directory` is separate from `listings` for the reason above: an adapter that found
 * 300 auctioneers has found zero auctions, and the caller must be able to tell.
 */
export interface SourceDiscovery {
  urls?: string[];
  listings?: DiscoveredListing[];
  directory?: DirectoryEntry[];
  /** Non-fatal problems worth surfacing in diagnostics (a page 500'd, a row failed to parse). */
  warnings?: string[];
}

export interface SourceAdapter {
  name: string;
  /**
   * Discover candidate listing URLs, or return fully-formed listings when the source
   * hands us structured data (which lets us skip Firecrawl entirely).
   *
   * Implementations must not write to the database — they discover and return, and the
   * existing save path owns persistence, dedupe, geocoding fallback and enrichment.
   */
  discover(): Promise<SourceDiscovery>;
}

/**
 * Adapters run in both the Node process and the Cloudflare Worker queue (see
 * `scrapeContext.ts`), so they use the global `fetch` rather than axios — it is the only
 * HTTP client available in both runtimes.
 *
 * A browser-ish User-Agent is sent because several of these hosts return an empty body
 * or a soft block to an unadorned client, and a timeout is enforced because a hung
 * source must not stall an entire scrape run.
 */
export async function fetchWithTimeout(
  url: string,
  { timeoutMs = 30_000, accept = 'text/html,application/xhtml+xml' }: { timeoutMs?: number; accept?: string } = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: accept,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Iowa-only pipeline: every adapter filters on this before returning listings. */
export function isIowa(state?: string | null): boolean {
  if (!state) return false;
  const s = state.trim().toUpperCase();
  return s === 'IA' || s === 'IOWA';
}

/**
 * Pull an acreage figure out of free text ("155.29 Acres M/L", "374.59± acres").
 *
 * Returns undefined rather than 0 when nothing matches — a listing with unknown
 * acreage must stay unknown, because 0 would flow into the CSR2 valuation as a real
 * measurement. The upper bound rejects parses that are obviously a year or a price.
 */
export function parseAcreage(text?: string | null): number | undefined {
  if (!text) return undefined;
  // Auction titles routinely put a qualifier between the number and the unit —
  // "374.59 TAXABLE ACRES M/L", "220.50 +/- ACRES", "155 tillable acres". Without
  // allowing for it, a headline acreage is missed and the parser silently falls through
  // to some smaller per-tract figure buried in the description.
  const match = text.match(
    /(\d[\d,]*(?:\.\d+)?)\s*(?:\+\/-|±|\+-)?\s*(?:m\/l\s*)?(?:taxable|tillable|tax|deeded|surveyed|gross|net|total|cropland|crop|farmland)?\s*(?:acres?|ac\b)/i,
  );
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value) || value <= 0 || value > 100_000) return undefined;
  return value;
}

/**
 * Strip the word "County" off a county name.
 *
 * Sources are inconsistent — LandHub returns "Clay County" while BidWrangler returns
 * "Buchanan" — and the pipeline matches county names against the Iowa county centroid
 * table and the county-specific $/CSR2 rate table. A stray suffix means a lookup miss,
 * which silently degrades a listing to a worse geocode tier or a missing valuation, so
 * every adapter normalises before returning.
 */
export function normalizeCounty(name?: string | null): string | undefined {
  if (!name) return undefined;
  const cleaned = name
    .replace(/\bcounty\b\.?/gi, '')
    .replace(/\bco\.\s*$/i, '')
    .replace(/[,\s]+$/, '')
    .trim();
  if (!cleaned) return undefined;

  // Several sources publish ALL-CAPS titles ("SHELBY & HARRISON COUNTY FARMLAND"),
  // which would miss a case-sensitive county lookup just as surely as a stray suffix.
  // Only reshape when the whole string is uppercase, so a correctly-cased "O'Brien"
  // or "Van Buren" is left exactly as the source wrote it.
  if (cleaned !== cleaned.toUpperCase()) return cleaned;

  return cleaned
    .toLowerCase()
    .replace(/(^|[\s'-])([a-z])/g, (_, boundary: string, letter: string) => `${boundary}${letter.toUpperCase()}`);
}

/**
 * Pull a county name out of free text ("Buchanan County, IA Land Auction").
 * Adapters prefer a source-provided county field and fall back to this only for
 * sources that bury the county in a title.
 *
 * The leading-word guard matters: "155 Acres Clay County" would otherwise capture
 * "Acres Clay", because the two-word branch happily swallows a preceding capitalised
 * word. Words that are never part of a county name are rejected explicitly.
 */
const NOT_A_COUNTY_WORD =
  /^(acres?|the|in|at|of|and|tracts?|land|farm|farmland|auction|online|only|iowa|ia|m|taxable|recreational|estate|real|public|sealed|bid)$/i;

export function parseCounty(text?: string | null): string | undefined {
  if (!text) return undefined;
  // Case-insensitive on purpose: several sources publish ALL-CAPS titles, where a
  // literal "County" would never match "COUNTY". Dropping the uppercase-initial
  // requirement means lowercase filler words can be captured too, which is exactly what
  // the stopword guard below exists to strip.
  const match = text.match(/\b([A-Za-z']+(?:\s+[A-Za-z']+)?)\s+County\b/i);
  if (!match) return undefined;

  const words = match[1].trim().split(/\s+/);
  // Single letters are never a county name but are common noise — "120.26 ACRES M/L
  // CASS COUNTY" would otherwise yield "L Cass".
  while (words.length > 1 && (NOT_A_COUNTY_WORD.test(words[0]) || words[0].length === 1)) words.shift();
  const candidate = words.join(' ');
  return NOT_A_COUNTY_WORD.test(candidate) ? undefined : normalizeCounty(candidate);
}

/** Coordinates arrive as strings from some APIs and numbers from others. */
export function toCoord(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
}
