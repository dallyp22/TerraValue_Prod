/**
 * Farm Market Auctions — plain server-rendered HTML auction calendar.
 *
 * The online companion to the twice-monthly Farm Market News, covering NW Iowa / MN / SD.
 * It is the easiest source in the entire 2026-08 audit: one GET returns a fully
 * server-rendered table (94 auction rows on 2026-08-03, 20 of them Iowa), with no
 * JavaScript, no pagination and no bot protection. Zero Firecrawl credits.
 *
 * Two distinct kinds of value:
 *   1. Listings — a handful of genuine Iowa farmland auctions at any time (O'Brien,
 *      Osceola and Kossuth County sales were live on 2026-08-03).
 *   2. Discovery — the auctioneer column surfaces firms outside our 51. The Osceola
 *      sale was run by Klaassen Auctions, which we do not scrape at all.
 *
 * PARSING NOTE — the markup is malformed on purpose-ish: `<td>` elements are frequently
 * left unclosed and a `colspan="2"` cell appears when a row has no separate sale-bill
 * link. So cells are split on the `<td` boundary rather than matched as balanced
 * `<td>…</td>` pairs, and each cell is identified by its content signature (the city
 * cell contains a `clear:both` div, the auctioneer cell a `popup.php` handler) instead
 * of by a fixed column index, which shifts between row variants.
 *
 * We deliberately do NOT filter to land-only here. The row text is short and the repo
 * already owns category decisions in `auctionClassifier.ts`; duplicating that logic in
 * an adapter would create a second, silently diverging definition of "farmland".
 */

import {
  fetchWithTimeout,
  isIowa,
  parseAcreage,
  parseCounty,
  type DiscoveredListing,
  type SourceAdapter,
  type SourceDiscovery,
} from './types.js';

const SOURCE_NAME = 'Farm Market Auctions';
const CALENDAR_URL = 'https://farmmarketauctions.com/';

/**
 * Recover a usable title when the anchor text is itself a bare URL.
 *
 * A few rows link out with the destination URL as the visible label. Storing that as
 * the auction title would put a raw link on the map, so fall back to the anchor's
 * `title` attribute (the page sets it to "Auctioneers Listing: <host>/<path>") and,
 * failing that, humanise the final path segment.
 */
function titleFromUrlish(titleCellHtml: string, urlish: string): string {
  const attr = titleCellHtml.match(/title="Auctioneers Listing:\s*([^"]+)"/i)?.[1];
  const source = attr && !/^https?:\/\//i.test(attr) ? attr : urlish;
  const slug = source.replace(/^https?:\/\/[^/]+/i, '').replace(/\/+$/, '').split('/').pop() ?? '';
  const humanised = slug
    .replace(/[-_]+/g, ' ')
    .replace(/\.\w+$/, '')
    .trim();
  return humanised || urlish;
}

/** Strip tags and decode the handful of entities this page actually emits. */
function textOf(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a row into cell fragments.
 *
 * Because closing `</td>` tags are unreliable here, each fragment runs from one `<td`
 * to the next, which is exactly the content we want once the opening tag's attributes
 * are dropped.
 */
function splitCells(rowHtml: string): string[] {
  return rowHtml
    .split(/<td\b/i)
    .slice(1)
    .map((fragment) => fragment.replace(/^[^>]*>/, ''));
}

/** "ONLINE - Closes: Tue, Aug 4, 2026 10:30 am" → "Tue, Aug 4, 2026 10:30 am". */
function cleanDate(raw: string): string | undefined {
  const text = textOf(raw).replace(/^ONLINE\s*-\s*Closes:\s*/i, '').trim();
  return text || undefined;
}

/**
 * The city cell renders as `<span>City</span><div style="clear:both">ST</div>`, so the
 * state is whatever sits inside that trailing div.
 */
function parseCityState(cellHtml: string): { city?: string; state?: string } {
  const stateMatch = cellHtml.match(/clear:both[^>]*>\s*([A-Za-z]{2})\s*</);
  const city = textOf(cellHtml.replace(/<div[\s\S]*$/, '')) || undefined;
  return { city, state: stateMatch ? stateMatch[1].toUpperCase() : undefined };
}

/**
 * Build a stable URL for the row.
 *
 * Most title cells link straight to the auctioneer's own sale bill or auction page,
 * which is both a good upsert key and a page the existing Firecrawl detail pass could
 * enrich later. Rows without a link fall back to a deterministic fragment URL built
 * from the auctioneer id and date, so the same auction upserts to the same row across
 * runs instead of duplicating each night.
 */
function rowUrl(titleCellHtml: string, auctioneerId: string | undefined, date: string | undefined, title: string): string {
  const href = titleCellHtml.match(/href="([^"]+)"/i)?.[1];
  if (href && /^https?:\/\//i.test(href)) return href;
  const slug = `${auctioneerId ?? 'unknown'}-${date ?? 'undated'}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
  return `${CALENDAR_URL}#${slug}`;
}

export function createFarmMarketAuctionsAdapter(): SourceAdapter {
  return {
    name: SOURCE_NAME,
    async discover(): Promise<SourceDiscovery> {
      const warnings: string[] = [];

      let html: string;
      try {
        const res = await fetchWithTimeout(CALENDAR_URL);
        if (!res.ok) return { listings: [], warnings: [`${SOURCE_NAME}: HTTP ${res.status}`] };
        html = await res.text();
      } catch (error) {
        return { listings: [], warnings: [`${SOURCE_NAME}: fetch failed — ${(error as Error).message}`] };
      }

      const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
      // The auctioneer popup is what distinguishes a real auction row from the header
      // and the surrounding layout tables.
      const dataRows = rows.filter((row) => row.includes('popup.php'));

      if (dataRows.length === 0) {
        return {
          listings: [],
          warnings: [`${SOURCE_NAME}: found ${rows.length} table rows but none matched the auction-row signature (layout may have changed)`],
        };
      }

      // The page renders 8 tables and repeats some auctions across them (the same
      // consignment sale appeared in 3 rows on 2026-08-03), so rows are de-duplicated by
      // URL + date before returning — otherwise one auction upserts as several.
      const byKey = new Map<string, DiscoveredListing>();

      for (const row of dataRows) {
        const cells = splitCells(row);
        if (cells.length < 3) continue;

        const cityCell = cells.find((cell) => cell.includes('clear:both'));
        const auctioneerCell = cells.find((cell) => cell.includes('popup.php'));
        const { city, state } = cityCell ? parseCityState(cityCell) : {};

        if (!isIowa(state)) continue;

        const date = cleanDate(cells[0]);
        const titleCell = cells[1] ?? '';
        const rawTitle = textOf(titleCell).replace(/^Bidding is currently OPEN\.*\s*/i, '').trim();
        if (!rawTitle) continue;
        const title = /^https?:\/\//i.test(rawTitle) ? titleFromUrlish(titleCell, rawTitle) : rawTitle;

        const auctioneerId = auctioneerCell?.match(/aid=(\d+)/)?.[1];
        const auctionHouse = auctioneerCell ? textOf(auctioneerCell) || undefined : undefined;

        // The owner cell is whatever sits between the title and the city cell; it is
        // the only place a seller name appears and is useful context for enrichment.
        const cityIndex = cityCell ? cells.indexOf(cityCell) : -1;
        const owner = cityIndex > 2 ? textOf(cells[cityIndex - 1]) : undefined;

        const url = rowUrl(titleCell, auctioneerId, date, title);
        const key = `${url}|${date ?? ''}`;
        if (byKey.has(key)) continue;

        byKey.set(key, {
          url,
          title,
          description: [owner && `Seller: ${owner}`, city && `${city}, IA`].filter(Boolean).join(' — ') || undefined,
          // Passed through as the calendar's own text ("Wed, Aug 5, 2026 10:00 am").
          // It is unambiguous and the existing date pipeline owns interpretation — this
          // adapter must not guess a timezone offset the page never stated.
          auctionDate: date,
          address: city ? `${city}, IA` : undefined,
          acreage: parseAcreage(title),
          county: parseCounty(title),
          state: 'IA',
          // This calendar publishes no coordinates — geocoding still applies downstream.
          sourceName: SOURCE_NAME,
          externalId: auctioneerId ? `fma:${auctioneerId}:${date ?? ''}` : undefined,
          auctionHouse,
        });
      }

      const listings = Array.from(byKey.values());
      if (listings.length === 0) {
        warnings.push(`${SOURCE_NAME}: parsed ${dataRows.length} auction rows but none were Iowa`);
      }

      return { listings, warnings };
    },
  };
}
