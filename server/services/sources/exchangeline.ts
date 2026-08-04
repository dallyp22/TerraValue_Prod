/**
 * The Exchange / KMA Auction Block (exchangeline.com) — SW Iowa auction calendar.
 *
 * This is the source with a client-reported gap attached to it: a 374.59-acre Shelby &
 * Harrison County farmland auction that was live here and missing from our map.
 *
 * WHY IT NEEDS FIRECRAWL. The 2026-07-17 research rated this "Easy / no anti-bot /
 * plain scrape". It is not: every path on the domain — the calendar, the detail pages
 * and the feed — returns 403 behind Cloudflare to a plain HTTP client. Firecrawl's
 * stealth proxy clears it in ~1–3s (verified 2026-08-03). So unlike the rest of this
 * folder, this adapter costs credits.
 *
 * WHY THE iCALENDAR FEED, NOT THE HTML CALENDAR. The site runs The Events Calendar
 * (WordPress), which publishes `/auctions/list/?ical=1`. That single request returns the
 * entire forward calendar as structured iCalendar data, which beats scraping the HTML
 * listing on every axis that matters:
 *
 *   - ONE Firecrawl call instead of one per paginated page (the HTML list caps at 25
 *     events on page 1 and paginates; the feed returned 28 events spanning 2026-06-13
 *     to 2026-11-18).
 *   - Exact timezone-qualified timestamps (`DTSTART;TZID=America/Chicago`), so we are
 *     not re-parsing "Mon 3" out of a rendered calendar grid and guessing the year.
 *   - A canonical `URL` per event, a full street `LOCATION`, and a `DESCRIPTION`.
 *
 * The client's missing auction is present in the feed with all of it:
 *   DTSTART;TZID=America/Chicago:20260909T100000
 *   SUMMARY:374.59 TAXABLE ACRES M/L SHELBY & HARRISON COUNTY FARMLAND AUCTION
 *   LOCATION:Therkildsen Center – 706 Victoria St., Harlan, IA, 51537, United States
 *
 * NO COORDINATES. Unlike BidWrangler/LandHub, the feed carries no lat/lng, so these
 * listings still geocode — but they geocode from a real street address, which is the
 * pipeline's best tier, not a county centroid.
 *
 * VENUE vs LAND. `LOCATION` is where the sale is *held*, which is often a community
 * centre in a neighbouring town, not the farm. So `address` gets the venue while
 * `county` is read from the title (which names the land), and the existing enrichment
 * step remains the thing that separates auction location from property location.
 */

import { stealthScrape } from './firecrawlStealth.js';
import {
  normalizeCounty,
  parseAcreage,
  parseCounty,
  type DiscoveredListing,
  type SourceAdapter,
  type SourceDiscovery,
} from './types.js';

const SOURCE_NAME = 'The Exchange (exchangeline.com)';

/** The Events Calendar's ICS export for the upcoming-events list view. */
const ICS_URL = 'https://www.exchangeline.com/auctions/list/?ical=1';

/** Feed timestamps are wall-clock in this zone unless they carry an explicit TZID. */
const DEFAULT_TZ = 'America/Chicago';

interface VEvent {
  summary?: string;
  description?: string;
  url?: string;
  location?: string;
  uid?: string;
  dtstart?: string;
  dtstartTz?: string;
  lastModified?: string;
}

/**
 * Undo RFC 5545 line folding.
 *
 * Long values are wrapped by inserting CRLF followed by a space or tab, so a URL or a
 * long SUMMARY arrives split across lines. Every other parse step depends on this
 * running first.
 */
function unfold(ics: string): string {
  return ics.replace(/\r?\n[ \t]/g, '');
}

/** RFC 5545 escapes: `\n`, `\,`, `\;`, `\\`. */
function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

/**
 * Offset in ms between a zone and UTC at a given instant.
 *
 * `Intl` is the only DST-correct option available in both Node and Workers without a
 * dependency; the feed spans a DST boundary (CDT → CST on 2026-11-01), so a hardcoded
 * -05:00 would put November auctions an hour off.
 */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  // `hour` can format as 24 for midnight under hour12:false in some engines.
  const hour = parts.hour === 24 ? 0 : parts.hour;
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, parts.minute, parts.second);
  return asUtc - utcMs;
}

/**
 * Convert an ICS DTSTART into a real ISO instant.
 *
 * Handles the three forms the spec allows: a UTC value ending in `Z`, a date-only value,
 * and a zone-qualified wall-clock value. The wall-clock case is resolved by guessing the
 * instant and correcting by the zone's offset — applied twice so a time sitting inside a
 * DST transition still lands correctly.
 */
function toIso(value?: string, tzid?: string): string | undefined {
  if (!value) return undefined;

  const utc = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utc) {
    const [, y, mo, d, h, mi, s] = utc.map(Number) as unknown as number[];
    return new Date(Date.UTC(y, mo - 1, d, h, mi, s)).toISOString();
  }

  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly.map(Number) as unknown as number[];
    return new Date(Date.UTC(y, mo - 1, d)).toISOString();
  }

  const local = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!local) return undefined;

  const [, y, mo, d, h, mi, s] = local.map(Number) as unknown as number[];
  const zone = tzid || DEFAULT_TZ;
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let instant = guess - zoneOffsetMs(guess, zone);
  instant = guess - zoneOffsetMs(instant, zone);
  return new Date(instant).toISOString();
}

/** Split the calendar into events and read the properties we use. */
function parseEvents(ics: string): VEvent[] {
  const body = unfold(ics);
  const blocks = body.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];

  return blocks.map((block) => {
    const event: VEvent = {};

    for (const line of block.split(/\r?\n/)) {
      const separator = line.indexOf(':');
      if (separator === -1) continue;
      const rawName = line.slice(0, separator);
      const value = line.slice(separator + 1);
      const [name, ...params] = rawName.split(';');

      switch (name.toUpperCase()) {
        case 'SUMMARY':
          event.summary = unescapeText(value);
          break;
        case 'DESCRIPTION':
          event.description = unescapeText(value);
          break;
        case 'URL':
          event.url = value.trim();
          break;
        case 'LOCATION':
          event.location = unescapeText(value);
          break;
        case 'UID':
          event.uid = value.trim();
          break;
        case 'LAST-MODIFIED':
          event.lastModified = toIso(value.trim());
          break;
        case 'DTSTART':
          event.dtstart = value.trim();
          event.dtstartTz = params.find((p) => p.toUpperCase().startsWith('TZID='))?.slice(5);
          break;
        default:
          break;
      }
    }

    return event;
  });
}

/**
 * Is this an Iowa auction?
 *
 * The feed mixes in Missouri sales (whose LOCATION is often the bare string "MO"), so
 * both the venue and the title are checked — some Iowa land auctions are held out of
 * state or list only a county in the title.
 */
function looksIowa(event: VEvent): boolean {
  const location = event.location ?? '';
  const title = event.summary ?? '';

  if (/\bIOWA\b/i.test(location) || /\bIOWA\b/i.test(title)) return true;
  if (/(^|[,\s])IA([,\s]|$)/i.test(location)) return true;
  if (/(^|[,\s])IA([,\s]|$)/.test(title)) return true;
  return false;
}

/**
 * LOCATION frequently carries the venue on the first line and then unrelated prose —
 * driving directions, open-house times, even a household-goods inventory. Everything
 * after the first newline is dropped so a geocoder is not handed a paragraph.
 */
function venueAddress(location?: string): string | undefined {
  if (!location) return undefined;
  const firstLine = location.split('\n')[0].trim();
  if (!firstLine || firstLine.length < 3) return undefined;
  // Bare state codes ("MO") are a placeholder, not an address.
  if (/^[A-Z]{2}$/.test(firstLine)) return undefined;
  return firstLine;
}

export function createExchangeLineAdapter(): SourceAdapter {
  return {
    name: SOURCE_NAME,
    async discover(): Promise<SourceDiscovery> {
      const warnings: string[] = [];

      // rawHtml, not markdown: this is an .ics document and markdown conversion would
      // mangle the property lines we need to parse.
      const result = await stealthScrape(ICS_URL, { formats: ['rawHtml'] });
      const ics = result.rawHtml ?? '';

      if (!ics.includes('BEGIN:VCALENDAR')) {
        // Cloudflare serving us a challenge page instead of the feed looks exactly like
        // "no auctions" unless we say so explicitly.
        return {
          listings: [],
          warnings: [
            `${SOURCE_NAME}: response was not an iCalendar document (status ${result.statusCode ?? '?'}, ${ics.length} chars) — stealth proxy may have been blocked`,
          ],
        };
      }

      const events = parseEvents(ics);
      if (events.length === 0) {
        return { listings: [], warnings: [`${SOURCE_NAME}: feed parsed but contained no VEVENT blocks`] };
      }

      const byUrl = new Map<string, DiscoveredListing>();
      let iowaCount = 0;

      for (const event of events) {
        if (!looksIowa(event)) continue;
        iowaCount++;

        const title = event.summary?.trim();
        const url = event.url?.trim();
        if (!title || !url) {
          warnings.push(`${SOURCE_NAME}: skipped an Iowa event missing ${!title ? 'SUMMARY' : 'URL'}`);
          continue;
        }

        // Titles are frequently ALL CAPS ("SHELBY & HARRISON COUNTY"); parseCounty
        // matches case-insensitively and title-cases the result so it lines up with the
        // county centroid and $-per-CSR2-point tables.
        const county = parseCounty(title) ?? parseCounty(event.description);

        byUrl.set(url, {
          url,
          title,
          description: event.description?.trim() || undefined,
          auctionDate: toIso(event.dtstart, event.dtstartTz),
          address: venueAddress(event.location),
          acreage: parseAcreage(title) ?? parseAcreage(event.description),
          county,
          state: 'IA',
          // The feed publishes no coordinates; the venue address geocodes at tier 1.
          sourceName: SOURCE_NAME,
          externalId: event.uid ? `exchangeline:${event.uid}` : undefined,
          updatedAt: event.lastModified,
        });
      }

      if (iowaCount === 0) {
        warnings.push(`${SOURCE_NAME}: parsed ${events.length} events but none were Iowa`);
      }

      return { listings: Array.from(byUrl.values()), warnings };
    },
  };
}
