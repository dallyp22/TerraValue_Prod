/**
 * Iowa Auctioneers Association member directory — DISCOVERY ONLY.
 *
 * This adapter finds *auctioneers*, not auctions. It returns `directory` entries and
 * never `listings`, because turning a business into a map pin would put fake gavels on
 * farmland. Its job is to feed a candidate-source review loop: the association has ~300
 * members across 21 pages, and each profile exposes the firm's own website — which is
 * exactly what you need to answer "is this someone we already scrape?".
 *
 * Why it matters: auctioneers churn and appear seasonally, so a fixed list of 51 sources
 * decays. A monthly sweep here keeps "find everything" true over time without another
 * manual research pass. It is a WordPress + GeoDirectory site rendered server-side, so
 * the sweep costs zero Firecrawl credits.
 *
 * Cost note: the archive pages give only name + profile URL. Contact details (website,
 * city, phone) require one fetch per member, so ~300 requests for a full detail sweep.
 * That is opt-in via `withDetails` and bounded by `detailLimit` — a routine scrape run
 * should take the cheap listing-only pass.
 */

import { fetchWithTimeout, type DirectoryEntry, type SourceAdapter, type SourceDiscovery } from './types.js';

const SOURCE_NAME = 'Iowa Auctioneers Association (directory)';
const ARCHIVE_URL = 'https://iowaauctioneers.org/places/';

/** Fallback when the page stops advertising `data-max-page`; 21 pages as of 2026-08-03. */
const DEFAULT_MAX_PAGES = 25;
const REQUEST_DELAY_MS = 300;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface IowaAuctioneersOptions {
  /** Fetch each member's profile page for website/city/phone. ~1 request per member. */
  withDetails?: boolean;
  /** Ceiling on profile fetches when `withDetails` is set. */
  detailLimit?: number;
}

function decode(text: string): string {
  return text
    .replace(/&#0?39;|&apos;|&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Members are Elementor post cards carrying the GeoDirectory `gd_place` post type.
 * Matching on `gd_place` rather than the generic `elementor-post` class avoids picking
 * up unrelated blog cards if the theme ever reuses the grid.
 */
function parseArchive(html: string): DirectoryEntry[] {
  const entries: DirectoryEntry[] = [];
  const articles = html.match(/<article[^>]*\bgd_place\b[\s\S]*?<\/article>/gi) ?? [];

  for (const article of articles) {
    const link = article.match(/<h3[^>]*elementor-post__title[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const name = decode(link[2].replace(/<[^>]+>/g, ''));
    if (!name) continue;
    entries.push({ name, profileUrl: link[1], state: 'IA', sourceName: SOURCE_NAME });
  }

  return entries;
}

/** The archive advertises its own length, so we do not have to guess how far to walk. */
function parseMaxPage(html: string): number | null {
  const attr = html.match(/data-max-page="(\d+)"/);
  if (attr) return Number(attr[1]);
  const numbered = Array.from(html.matchAll(/\/places\/page\/(\d+)\//g)).map((m) => Number(m[1]));
  return numbered.length ? Math.max(...numbered) : null;
}

/**
 * GeoDirectory renders every profile field as `geodir-field-{name}`, which makes the
 * fields addressable without guessing at label text. Social links reuse the same website
 * icon, so keying on the field class (not the icon) is what keeps Facebook out of the
 * `website` slot.
 */
function parseProfile(html: string): Partial<DirectoryEntry> {
  const fields = new Map<string, string>();
  const links = new Map<string, string>();

  // Array.from over matchAll: the repo's tsconfig sets no `target`, so it defaults to
  // ES5 and iterating the match iterator directly trips TS2802.
  for (const match of Array.from(html.matchAll(/geodir-field-([a-z_]+)"[^>]*>([\s\S]*?)<\/div>/gi))) {
    const field = match[1].toLowerCase();
    const chunk = match[2];
    const href = chunk.match(/<a[^>]+href="([^"]+)"/i)?.[1];
    if (href) links.set(field, href);
    const text = decode(chunk.replace(/<[^>]+>/g, ' ')).replace(/^[A-Za-z/ ]+:\s*/, '');
    if (text) fields.set(field, text);
  }

  const tags = fields.get('post_tags')?.split(',').map((t) => t.trim()).filter(Boolean);

  return {
    website: links.get('website'),
    city: fields.get('city'),
    phone: fields.get('phone'),
    tags: tags?.length ? tags : undefined,
  };
}

export function createIowaAuctioneersAdapter(options: IowaAuctioneersOptions = {}): SourceAdapter {
  const { withDetails = false, detailLimit = 40 } = options;

  return {
    name: SOURCE_NAME,
    async discover(): Promise<SourceDiscovery> {
      const warnings: string[] = [];
      const byUrl = new Map<string, DirectoryEntry>();
      let maxPage = DEFAULT_MAX_PAGES;

      for (let page = 1; page <= maxPage; page++) {
        const url = page === 1 ? ARCHIVE_URL : `${ARCHIVE_URL}page/${page}/`;

        let html: string;
        try {
          const res = await fetchWithTimeout(url);
          if (!res.ok) {
            // A 404 past the last page is the normal way this walk ends.
            if (res.status !== 404) warnings.push(`${SOURCE_NAME}: page ${page} → HTTP ${res.status}`);
            break;
          }
          html = await res.text();
        } catch (error) {
          warnings.push(`${SOURCE_NAME}: page ${page} failed — ${(error as Error).message}`);
          break;
        }

        if (page === 1) {
          const advertised = parseMaxPage(html);
          if (advertised && advertised > 0) maxPage = Math.min(advertised, DEFAULT_MAX_PAGES * 2);
        }

        const entries = parseArchive(html);
        if (entries.length === 0) {
          if (page === 1) {
            warnings.push(`${SOURCE_NAME}: no member cards found on page 1 (directory layout may have changed)`);
          }
          break;
        }

        for (const entry of entries) byUrl.set(entry.profileUrl, entry);
        await sleep(REQUEST_DELAY_MS);
      }

      const directory = Array.from(byUrl.values());

      if (withDetails) {
        const targets = directory.slice(0, detailLimit);
        for (const entry of targets) {
          try {
            const res = await fetchWithTimeout(entry.profileUrl);
            if (!res.ok) continue;
            Object.assign(entry, parseProfile(await res.text()));
          } catch (error) {
            warnings.push(`${SOURCE_NAME}: profile ${entry.profileUrl} failed — ${(error as Error).message}`);
          }
          await sleep(REQUEST_DELAY_MS);
        }
        if (directory.length > targets.length) {
          warnings.push(
            `${SOURCE_NAME}: detail fetch capped at ${detailLimit} of ${directory.length} members (raise detailLimit for a full sweep)`,
          );
        }
      }

      // Explicitly no `listings`: this source has none, and returning an empty array
      // rather than omitting the key would imply we looked for auctions and found zero.
      return { directory, warnings };
    },
  };
}
