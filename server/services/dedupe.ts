/**
 * Entity resolution for auction listings.
 *
 * THE PROBLEM: `auctions` is keyed on `url UNIQUE`, so it holds one row per
 * source-sighting, not one row per sale. The same sale is already stored several
 * times — Verdella Kenkel (377.25 ac, Shelby/Crawford, 2026-08-29) is in there
 * four times under three different county spellings — and it gets much worse the
 * moment aggregators (LandHub, HiBid, Land And Farm) are onboarded, because
 * reposting each other's inventory is what those sources are for.
 *
 * WHAT THIS IS NOT: a title-similarity deduper. Measured on production, the 57
 * "duplicate title groups" among 361 upcoming auctions are mostly not
 * duplicates. "Lyon County Land Auction" appears 5 times with 5 different dates
 * — five different sales sharing a generic name. Clustering on title would merge
 * them and delete four real auctions from the map.
 *
 * DESIGN CONSTRAINTS TAKEN FROM THE DATA (all verified 2026-08-03):
 *
 *  - 75% of active rows have no `auction_date` at all (1,082 of 1,443). Date
 *    cannot be a required blocking key. It is used as corroboration when
 *    present, and as a veto when two rows disagree by more than two weeks.
 *  - `legal_description_parsed` is NULL on every row in the table.
 *    auctionEnrichment.ts sets it to null with a "will be filled by the
 *    geocoder" comment, and the geocoder only ever holds the components in
 *    memory. So Township/Range/Section is re-derived here from the raw
 *    `legal_description` text with regexes, no LLM call.
 *  - 375 distinct county strings exist across 1,443 active rows: "Crawford",
 *    "Crawford County", "Crawford, Shelby", "Shelby and Crawford", "", "Not
 *    specified". County has to be normalised to a *set* and compared by overlap.
 *  - 78 of 361 upcoming rows carry `acreage = 0`, which is "unknown" written as
 *    a number. Scoring that as agreement manufactures duplicates, so 0 becomes
 *    NULL here.
 *  - State is not always Iowa (Texas 89, Missouri 43, Alabama 33 …) and is
 *    written both "Iowa" and "IA". Disagreement is a hard veto.
 *
 * SAFETY POSTURE: a false merge removes an auction from the map — the exact
 * complaint this workstream exists to fix. A missed merge only shows a duplicate
 * pin. So the bar for merging is deliberately high and asymmetric:
 *
 *   1. hard vetoes run first and cannot be outscored;
 *   2. a merge additionally requires at least one *identity* signal — acreage
 *      agreement within 2%, a shared Township/Range/Section, or two shared rare
 *      name tokens. County + date + similar title is never enough on its own,
 *      however high it scores;
 *   2b. and a merge requires a *locality* signal — county overlap, shared TRS,
 *      or precise coordinates within 3 miles. Without one, a row whose county
 *      failed to extract can be pulled into a cluster on the other side of the
 *      country;
 *   3. observations whose URL is a site root or a listing index page can never
 *      be merged, only reviewed — that page describes whatever auction is
 *      featured today and will describe a different one next week;
 *   4. anything in the grey zone is recorded for a human, never merged;
 *   5. distinct tract numbers, or two distinct listing ids from the same host,
 *      veto unconditionally — those are the source telling us these are
 *      separate parcels or separate records;
 *   6. aggregator search pages are excluded from resolution altogether.
 */

// ---------------------------------------------------------------------------
// Tunables. Every one of these is a policy decision, so they live together.
// ---------------------------------------------------------------------------

export const MATCHER_VERSION = 'v1.1';

/** At or above this score, and with identity evidence, a pair is merged. */
export const MERGE_THRESHOLD = 8;
/** At or above this, below MERGE_THRESHOLD: recorded for human review. */
export const REVIEW_THRESHOLD = 4;
/** Two rows more than this many days apart are different sales, full stop. */
export const DATE_VETO_DAYS = 14;
/**
 * A cluster larger than this is over-merged far more often than it is a real
 * eight-way repost, so the whole component is demoted to review.
 */
export const MAX_CLUSTER_SIZE = 8;
/** Acreage agreement bands, as relative difference. */
const ACRE_EXACT = 0.005;
const ACRE_CLOSE = 0.02;
const ACRE_LOOSE = 0.10;
/** Beyond this, acreage is positive evidence *against* — unless tracts sum. */
const ACRE_VETO = 0.40;

export type Disposition = 'merge' | 'review' | 'distinct';

/** The subset of an `auctions` row the resolver needs. */
export interface DedupeInput {
  id: number;
  url: string | null;
  title: string | null;
  enrichedTitle?: string | null;
  description?: string | null;
  county: string | null;
  state: string | null;
  acreage: number | null;
  auctionDate: Date | string | null;
  sourceWebsite: string | null;
  enrichedAuctionHouse?: string | null;
  legalDescription?: string | null;
  /** Present in the schema but NULL on every row today; read anyway in case a
   *  future writer starts populating it. */
  legalDescriptionParsed?: unknown;
  latitude?: number | null;
  longitude?: number | null;
  /** `raw_data->>'isCountyLevel'`. County-centroid coordinates are shared by
   *  every listing in a county, so they must never count as geographic
   *  agreement. */
  isCountyLevel?: boolean | null;
}

/** Normalised, comparable form of one observation. */
export interface Fingerprint {
  id: number;
  countyKeys: string[];
  state: string | null;
  acreage: number | null;
  /** Every acreage-looking figure in the text, for the tract-sum test. */
  acreageMentions: number[];
  date: Date | null;
  trsKeys: string[];
  namedTownshipKeys: string[];
  nameTokens: string[];
  /** URL-path tokens. Corroboration only, never identity. */
  slugTokens: string[];
  titleTokens: string[];
  normalizedTitle: string;
  /** Title carries no distinguishing information of its own. */
  genericTitle: boolean;
  /** URL is a site root or listing index, not a specific sale. */
  weakIdentity: boolean;
  /** Tract/lot number within a multi-tract sale, when the listing exposes one. */
  tractNumber: number | null;
  /** Publishing host, e.g. "landsearch.com" — the host, not `source_website`. */
  listingHost: string | null;
  /** The host's own stable identifier for this listing, when the URL carries one. */
  listingId: string | null;
  /** Whether `acreage` is a total figure or a tillable subset. */
  acreageMeasure: 'total' | 'tillable';
  auctioneer: string | null;
  lat: number | null;
  lon: number | null;
  /** Coordinates are precise enough to be evidence. */
  preciseGeo: boolean;
}

export interface ScoredPair {
  aId: number;
  bId: number;
  score: number;
  disposition: Disposition;
  blockKey: string;
  features: Record<string, number>;
  holdReason?: string;
}

export interface Cluster {
  memberIds: number[];
  primaryId: number;
  matchMethod: string;
  /** Weakest accepted edge — a cluster is only as good as that. */
  confidence: number | null;
  reviewStatus: 'auto' | 'needs_review';
  holdReason?: string;
}

export interface ResolveResult {
  fingerprints: Map<number, Fingerprint>;
  pairs: ScoredPair[];
  clusters: Cluster[];
  /** Blocks skipped for being implausibly large; a key that fires like this is
   *  producing noise, not candidates. */
  oversizedBlocks: { key: string; size: number }[];
  /** Rows dropped before clustering as aggregator search pages (see
   *  `isAggregatorIndexUrl`). Reported, never silently discarded. */
  excluded: { id: number; url: string | null; reason: string }[];
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

const COUNTY_NOISE = new Set(['', 'unknown', 'n/a', 'na', 'none', 'not specified', 'various', 'multiple']);

/**
 * "Crawford, Shelby" / "Shelby and Crawford" / "Crawford County" -> ["crawford","shelby"].
 *
 * Returns a *set* because multi-county sales are common and are written every
 * possible way. Comparison is by overlap, never by equality of the raw string.
 */
export function normalizeCounty(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out = new Set<string>();
  for (const part of raw.split(/\s*(?:,|;|\/|\||\band\b|&|\+)\s*/i)) {
    const cleaned = part
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\b(counties|county|co)\b\.?/g, ' ')
      .replace(/[^a-z\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned || COUNTY_NOISE.has(cleaned) || cleaned.length < 3) continue;
    out.add(cleaned);
  }
  return Array.from(out).sort();
}

const STATE_CODES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY',
};

export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (STATE_CODES[s]) return STATE_CODES[s];
  if (/^[a-z]{2}$/.test(s)) return s.toUpperCase();
  return null;
}

/** 0 and negatives mean "unknown", not "zero acres". */
export function normalizeAcreage(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw;
}

export function toDate(raw: Date | string | null | undefined): Date | null {
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Township/Range/Section, parsed from free text.
 *
 * Derived from `legal_description` rather than `legal_description_parsed`
 * because the latter is NULL on every row in the database — the enrichment
 * service writes null and the geocoder never persists what it parses.
 *
 * Key format: `t{township}r{range}s{section}`. Only fires when all three
 * numbers are present; a named township without numbers is handled separately
 * by `parseNamedTownshipKeys`.
 */
export function parseTrsKeys(text: string | null | undefined): string[] {
  if (!text) return [];
  const keys = new Set<string>();
  const add = (twp: string, rng: string, sec: string) => {
    const t = Number(twp), r = Number(rng), s = Number(sec);
    // PLSS sanity: sections are 1-36, township/range numbers stay small.
    if (!t || !r || !s || s > 36 || t > 200 || r > 200) return;
    keys.add(`t${t}r${r}s${s}`);
  };

  // "Section 4, Township 78 North, Range 32 West"
  const re1 = /sec(?:tion)?s?\.?\s*(\d{1,2})\b[^.;]{0,40}?\btown(?:ship)?\.?\s*(\d{1,3})\s*[ns]?\b[^.;]{0,30}?\brange\s*(\d{1,3})\s*[we]?/gi;
  // "T34N-R3E ... Section 30" (township/range first)
  const re2 = /\bt(?:own(?:ship)?)?\.?\s*(\d{1,3})\s*n?\s*[-,\s]\s*r(?:ange)?\.?\s*(\d{1,3})\s*[we]?\b[^.;]{0,40}?\bsec(?:tion)?s?\.?\s*(\d{1,2})\b/gi;
  // "Section 12-102-56" -> section-township-range
  const re3 = /\bsec(?:tion)?s?\.?\s*(\d{1,2})\s*[-\/]\s*(\d{1,3})\s*[-\/]\s*(\d{1,3})\b/gi;
  // "STR 11/68/6" -> section/township/range
  const re4 = /\bstr\.?\s*(\d{1,2})\s*[\/-]\s*(\d{1,3})\s*[\/-]\s*(\d{1,3})\b/gi;
  // "SE 1/4 of 33-11-12" — bare triple, only trusted next to a quarter call.
  const re5 = /\b(?:[nsew]{1,2}\s*(?:1\/[24]|½|¼)\s*(?:of\s*)?)(\d{1,2})\s*-\s*(\d{1,3})\s*-\s*(\d{1,3})\b/gi;

  let m: RegExpExecArray | null;
  while ((m = re1.exec(text)) !== null) add(m[2], m[3], m[1]);
  while ((m = re2.exec(text)) !== null) add(m[1], m[2], m[3]);
  while ((m = re3.exec(text)) !== null) add(m[2], m[3], m[1]);
  while ((m = re4.exec(text)) !== null) add(m[2], m[3], m[1]);
  while ((m = re5.exec(text)) !== null) add(m[2], m[3], m[1]);

  return Array.from(keys).sort();
}

/**
 * "Section 22, Ashton Twp." / "Reading TWP, ... Section 34".
 *
 * Weaker than a numeric TRS (township names repeat across counties) so this is
 * always qualified by county at block time and scored lower.
 */
export function parseNamedTownshipKeys(text: string | null | undefined): string[] {
  if (!text) return [];
  const keys = new Set<string>();
  const norm = (name: string, sec: string) => {
    const n = name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
    const s = Number(sec);
    if (!n || n.length < 3 || !s || s > 36) return;
    keys.add(`${n}:${s}`);
  };
  const reA = /sec(?:tion)?s?\.?\s*(\d{1,2})\b[,\s]+([a-z][a-z\s]{2,24}?)\s*(?:twp|township)\b/gi;
  const reB = /\b([a-z][a-z\s]{2,24}?)\s*(?:twp|township)\b[,\s]+(?:.{0,20}?)sec(?:tion)?s?\.?\s*(\d{1,2})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = reA.exec(text)) !== null) norm(m[2], m[1]);
  while ((m = reB.exec(text)) !== null) norm(m[1], m[2]);
  return Array.from(keys).sort();
}

/**
 * Words that are everywhere in this corpus and therefore identify nothing.
 * Anything on this list can never become a "rare name token".
 */
const NAME_STOPWORDS = new Set([
  'auction', 'auctions', 'auctioneer', 'auctioneers', 'land', 'lands', 'farm', 'farms',
  'farmland', 'farmground', 'acre', 'acres', 'county', 'counties', 'iowa', 'company',
  'real', 'estate', 'realty', 'sale', 'sales', 'sold', 'listing', 'listings', 'property',
  'properties', 'upcoming', 'current', 'online', 'bidding', 'bid', 'bids', 'hibid',
  'live', 'timed', 'tract', 'tracts', 'parcel', 'parcels', 'taxable', 'ground',
  'www', 'com', 'net', 'org', 'https', 'http', 'html', 'php', 'aspx', 'index',
  'detail', 'details', 'page', 'lot', 'lots', 'item', 'items', 'view', 'home',
  'north', 'south', 'east', 'west', 'section', 'township', 'range',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
]);

/**
 * Candidate identity tokens — the seller/estate name: "Kenkel", "Bunnell",
 * "Wilwerding".
 *
 * `seller_motivation` is populated on only 56 of 361 upcoming rows and holds
 * motivation prose rather than names, so the name is recovered from text
 * instead, and `resolve()` then keeps only the tokens that are *rare in this
 * corpus* — a shared token is worthless if half the table carries it.
 *
 * Only words that appear Capitalised in the title or description count. That
 * restriction is not cosmetic: the first version of this took tokens from the
 * URL slug too, and the dry run promptly proposed merging "Ellsworth County
 * Land Auction" into "Dallas County Land Auction" because both slugs happened
 * to share an incidental rare word. Case is the cheapest available proxy for
 * "this is a proper noun", and lowercase URL slugs cannot supply it.
 */
export function extractNameTokens(input: DedupeInput): string[] {
  const parts = [input.enrichedTitle, input.title, input.description?.slice(0, 400)]
    .filter((p): p is string => Boolean(p))
    .join(' ');

  const tokens = new Set<string>();
  // Capitalised word, not sentence-initial-only — we accept both, the corpus
  // rarity filter in resolve() removes the common sentence starters anyway.
  const re = /\b([A-Z][a-z]{3,23})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(parts)) !== null) {
    const t = m[1].toLowerCase();
    if (NAME_STOPWORDS.has(t)) continue;
    tokens.add(t);
  }
  return Array.from(tokens).sort();
}

/**
 * Lowercased URL-path tokens. Corroboration only — never identity evidence.
 * Useful because two brokers linking the same sale often share a slug fragment,
 * but far too noisy to merge on.
 */
export function extractSlugTokens(input: DedupeInput): string[] {
  if (!input.url) return [];
  let path: string;
  try {
    path = decodeURIComponent(new URL(input.url).pathname);
  } catch {
    return [];
  }
  const tokens = new Set<string>();
  for (const raw of path.replace(/[\/_-]+/g, ' ').split(/[^A-Za-z]+/)) {
    if (raw.length < 4 || raw.length > 24) continue;
    const t = raw.toLowerCase();
    if (NAME_STOPWORDS.has(t)) continue;
    tokens.add(t);
  }
  return Array.from(tokens).sort();
}

/** Every acreage-looking figure in the text, for the tract-sum test. */
export function extractAcreageMentions(input: DedupeInput): number[] {
  const text = [input.enrichedTitle, input.title, input.description?.slice(0, 600)]
    .filter(Boolean)
    .join(' ');
  const out: number[] = [];
  const re = /(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:\+\/-|±|m\/l)?\s*(?:taxable\s+)?acres?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n > 0 && n < 100000) out.push(n);
  }
  return out;
}

const TITLE_NOISE = /\b(auction|auctions|land|farm|farms|farmland|acres?|county|iowa|for|sale|the|of|in|at|and|a|an|online|live|real|estate|ml|m\/l)\b/gi;

export function normalizeTitle(input: DedupeInput): string {
  const raw = input.enrichedTitle || input.title || '';
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A title is "generic" when stripping the boilerplate leaves nothing that
 * distinguishes this sale from any other in the same county.
 *
 * This is the guard against the largest false-cluster generator in the data:
 * "Lyon County Land Auction" occurs 5 times with 5 different dates, "Dallas
 * County Land Auction" 8 times across 2 sources.
 */
export function isGenericTitle(input: DedupeInput): boolean {
  const stripped = normalizeTitle(input)
    .replace(TITLE_NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return true;
  // A number (acreage, tract count) or a leftover proper noun makes it specific.
  return !/\d/.test(stripped) && stripped.length < 6;
}

/**
 * True when the URL points at a site root or a listing index rather than one
 * sale.
 *
 * Real case from production: the eight-row "Dallas County Land Auction" group
 * contains `sullivanauctioneers.com`, `daughertyauction.com/upcoming-auctions`
 * and `daughertyauction.hibid.com/` alongside two genuine detail pages. Those
 * index pages describe whatever auction is featured today, so merging one into
 * an event would bind the event to a page that means something different next
 * week.
 */
export function hasWeakIdentityUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return true;
  }
  const segments = u.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return true;
  const last = segments[segments.length - 1].toLowerCase().replace(/\.(html?|php|aspx?)$/, '');
  const INDEXY = new Set([
    'auctions', 'auction', 'upcoming-auctions', 'current-auctions', 'listings',
    'listing', 'properties', 'land', 'farmland', 'real-estate', 'liveauctions',
    'sales', 'past-auctions', 'index', 'home', 'search', 'company', 'bidgallery',
  ]);
  if (segments.length === 1 && INDEXY.has(last)) return true;
  // A single segment with no digits and no multi-word slug is an index too.
  if (segments.length === 1 && !/\d/.test(last) && !last.includes('-')) return true;
  return false;
}

/**
 * Tract number within a multi-tract sale.
 *
 * Iowa farms are routinely offered as "Tract 1 / Tract 2 / Tract 3" under one
 * auction. Those are distinct parcels with distinct acreage and distinct
 * buyers, and every signal the scorer likes — same county, same date, same
 * auctioneer, near-identical acreage — points at merging them. Merging destroys
 * all but one. This is the strongest veto in the file for that reason.
 *
 * MEASURED: the URL is not merely "often" more reliable than the title, it is
 * currently the *only* source. Zero of 354 upcoming rows carry a tract number in
 * their title, because enrichment rewrites titles to the "40.5+/- Acres Dallas
 * County, Missouri" house style and drops it. 17 of 354 upcoming rows (39 of
 * 1,665 active) expose one in the URL. The title patterns are kept anyway: they
 * cost nothing, they match the raw pre-enrichment title, and a source onboarded
 * tomorrow may well put it there.
 */
export function parseTractNumber(input: DedupeInput): number | null {
  if (input.url) {
    const m = /[\/-]tract-(\d{1,3})(?:-|\/|$)/i.exec(input.url);
    if (m) return Number(m[1]);
  }
  for (const text of [input.title, input.enrichedTitle]) {
    if (!text) continue;
    const m = /\btract\s*#?\s*(\d{1,3})\b/i.exec(text);
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * The publishing host and that host's own stable identifier for the listing.
 *
 * Uses the URL host rather than `source_website`, which is the *scraper's*
 * label: row 115904 is labelled "Sullivan Auctioneers" but published on
 * bigiron.com, and that pair is a genuine cross-source duplicate we want to
 * keep merging.
 *
 * Observed identifier shapes:
 *   landsearch.com/properties/{slug}/5371880        → trailing numeric segment
 *   highpointlandcompany.com/properties/{slug}/110553/ → trailing numeric segment
 *   peoplescompany.com/listings/{slug}-19547        → trailing -digits in the slug
 *   ?id= / ?lotid= / ?listingid=                     → query parameter
 */
export function extractListingRef(url: string | null | undefined): {
  host: string | null;
  id: string | null;
} {
  if (!url) return { host: null, id: null };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { host: null, id: null };
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const segments = u.pathname.split('/').filter(Boolean);
  const last = segments.length > 0 ? segments[segments.length - 1] : '';

  let id: string | null = null;
  if (/^\d{4,}$/.test(last)) id = last;
  else {
    const trailing = /-(\d{4,})$/.exec(last.replace(/\.(html?|php|aspx?)$/i, ''));
    if (trailing) id = trailing[1];
  }
  if (!id) {
    for (const key of ['id', 'lotid', 'listingid', 'lotId', 'listingId']) {
      const v = u.searchParams.get(key);
      if (v && /^\d{2,}$/.test(v)) {
        id = v;
        break;
      }
    }
  }
  return { host, id };
}

/**
 * Is the stored `acreage` a tillable subset rather than the whole farm?
 *
 * Comparing 30.89 tillable against 33.75 total is comparing two different
 * measurements of the same farm. They happened to fall 8.5% apart, inside the
 * loose tolerance — that is luck, not agreement, and the next pair will not be
 * so lucky in either direction.
 *
 * Detected from the *raw* title (enrichment rewrites titles into "30.89 Acres
 * Buchanan County, Iowa" and loses the word) and, failing that, from a
 * "N tillable acres" figure in the description that matches the stored acreage.
 */
export function acreageIsTillable(input: DedupeInput): boolean {
  if (input.title && /\btillable\b/i.test(input.title)) return true;
  const acres = normalizeAcreage(input.acreage);
  if (acres != null && input.description) {
    const re = /(\d{1,5}(?:\.\d{1,2})?)\s*(?:\+\/-|±)?\s*(?:fsa\s+)?tillable\s+acres?\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(input.description)) !== null) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0 && relDiff(n, acres) <= 0.01) return true;
    }
  }
  return false;
}

/** Path terminals that mean "a filtered list of auctions", not one auction. */
const INDEX_TERMINALS = new Set([
  'auction', 'auctions', 'at-auction', 'land-auctions', 'land-auction',
  'all-land', 'for-sale', 'farms-ranches', 'homes',
]);

/**
 * Aggregator search pages — a state- or county-scoped listing index.
 *
 * `landwatch.com/oklahoma-land-for-sale/kay-county/auctions` and
 * `land.com/Comanche-County-OK/all-land/at-auction` are search results. Whatever
 * the extractor pulled off them belongs to whichever listing happened to be on
 * screen, which is why one of them is stored with county "Dewey", a title
 * naming Garvin County and a URL scoped to Kay County. Three counties, one row.
 * These cannot be resolved because they do not describe a single sale.
 *
 * NARROWER THAN "has no listing identifier at all": that literal test excludes
 * 244 of 354 upcoming rows and takes with it all four Verdella Kenkel rows, all
 * five The Acre Co rows and both halves of the Sullivan/BigIron cross-post —
 * every one of which is a correct merge. Plenty of legitimate auctioneer pages
 * have no numeric id (`denisonlivestock.com/sales.asp`,
 * `theacreco.com/live-auction`). What distinguishes an aggregator search page is
 * the combination of a geographic scope segment *and* an index terminal.
 */
export function isAggregatorIndexUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const segments = u.pathname.split('/').filter(Boolean).map((s) => s.toLowerCase());
  if (segments.length === 0) return false;
  if (!INDEX_TERMINALS.has(segments[segments.length - 1])) return false;

  // A geographic scope segment: a state name, or anything county-shaped.
  return segments.slice(0, -1).some(
    (seg) =>
      /(^|-)county(-|$)/.test(seg) ||
      Object.keys(STATE_CODES).some((state) => seg.includes(state.replace(/\s+/g, '-'))),
  );
}

export function fingerprint(input: DedupeInput): Fingerprint {
  const legalText = [
    input.legalDescription,
    typeof input.legalDescriptionParsed === 'string' ? input.legalDescriptionParsed : null,
    input.legalDescriptionParsed && typeof input.legalDescriptionParsed === 'object'
      ? JSON.stringify(input.legalDescriptionParsed)
      : null,
    input.description?.slice(0, 600),
  ]
    .filter(Boolean)
    .join(' ');

  const normalizedTitle = normalizeTitle(input);
  const listingRef = extractListingRef(input.url);
  return {
    id: input.id,
    countyKeys: normalizeCounty(input.county),
    state: normalizeState(input.state),
    acreage: normalizeAcreage(input.acreage),
    acreageMentions: extractAcreageMentions(input),
    date: toDate(input.auctionDate),
    trsKeys: parseTrsKeys(legalText),
    namedTownshipKeys: parseNamedTownshipKeys(legalText),
    nameTokens: extractNameTokens(input),
    slugTokens: extractSlugTokens(input),
    titleTokens: normalizedTitle.split(' ').filter((t) => t.length > 2),
    normalizedTitle,
    genericTitle: isGenericTitle(input),
    weakIdentity: hasWeakIdentityUrl(input.url),
    tractNumber: parseTractNumber(input),
    listingHost: listingRef.host,
    listingId: listingRef.id,
    acreageMeasure: acreageIsTillable(input) ? 'tillable' : 'total',
    auctioneer: (input.enrichedAuctionHouse || input.sourceWebsite || '').toLowerCase().trim() || null,
    lat: input.latitude ?? null,
    lon: input.longitude ?? null,
    preciseGeo:
      input.latitude != null && input.longitude != null && input.isCountyLevel !== true,
  };
}

// ---------------------------------------------------------------------------
// Blocking
// ---------------------------------------------------------------------------

/**
 * Blocking keys, in descending order of how much we trust them.
 *
 * Deliberately no title-only block. Title is scoring evidence, never a reason to
 * consider two rows in the first place.
 *
 * Acreage buckets are emitted with their neighbours so that figures which
 * disagree slightly across sources still meet — 374.59 ("deeded") vs 377.25
 * ("taxable") is the same farm described by two brokers.
 */
export function blockKeysFor(fp: Fingerprint, rareTokens: Set<string>): string[] {
  const keys: string[] = [];

  for (const trs of fp.trsKeys) keys.push(`trs:${trs}`);

  for (const county of fp.countyKeys) {
    for (const nt of fp.namedTownshipKeys) keys.push(`nts:${county}:${nt}`);

    if (fp.acreage != null) {
      const bucket = Math.round(fp.acreage / 5);
      for (const b of [bucket - 1, bucket, bucket + 1]) keys.push(`ca:${county}:${b}`);
    }
    if (fp.date) keys.push(`cd:${county}:${fp.date.toISOString().slice(0, 10)}`);
    for (const token of fp.nameTokens) {
      if (rareTokens.has(token)) keys.push(`cn:${county}:${token}`);
    }
  }

  // A rare name token is discriminating enough to cross county-extraction
  // errors, which are common (375 distinct county strings for 99 real counties).
  for (const token of fp.nameTokens) {
    if (rareTokens.has(token)) keys.push(`name:${token}`);
  }

  return Array.from(new Set(keys));
}

/**
 * A token is "rare" when almost nothing else in the corpus carries it. The
 * threshold scales with corpus size so this behaves the same on 300 rows as on
 * 30,000.
 */
export function computeRareTokens(fingerprints: Fingerprint[]): Set<string> {
  const df = new Map<string, number>();
  for (const fp of fingerprints) {
    for (const token of fp.nameTokens) df.set(token, (df.get(token) ?? 0) + 1);
  }
  // Tight on purpose. A token shared by more than a handful of rows is a
  // regional word ("Prairie", "Valley"), not a seller.
  const maxDf = Math.max(2, Math.floor(fingerprints.length * 0.003));
  const rare = new Set<string>();
  for (const [token, count] of Array.from(df.entries())) {
    if (count >= 2 && count <= maxDf) rare.add(token);
  }
  return rare;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function relDiff(a: number, b: number): number {
  const max = Math.max(Math.abs(a), Math.abs(b));
  return max === 0 ? 0 : Math.abs(a - b) / max;
}

function daysApart(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86_400_000;
}

function overlap<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const inter = a.filter((x) => setB.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

function haversineMiles(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 3958.8;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Does one side's total acreage equal the sum of the parts the other side
 * lists?
 *
 * The Osborn/exchangeline case: the same farm is advertised by one broker as
 * "71.19 acres in Shelby County and 303.4 acres in Harrison County" and by
 * another as a single "374.59 acres". Without this test the two look 47% apart
 * and get vetoed.
 */
function tractSumAgrees(a: Fingerprint, b: Fingerprint): boolean {
  const check = (total: number | null, parts: number[]): boolean => {
    if (total == null || parts.length < 2) return false;
    const sum = parts.reduce((acc, n) => acc + n, 0);
    return relDiff(total, sum) <= ACRE_CLOSE;
  };
  return check(a.acreage, b.acreageMentions) || check(b.acreage, a.acreageMentions);
}

export interface ScoreOutcome {
  score: number;
  features: Record<string, number>;
  veto: string | null;
  /** At least one signal that identifies *this sale*, not just its county. */
  identityEvidence: boolean;
  /**
   * Identity evidence of the strongest kind — acreage agreeing to within half a
   * percent, a shared Township/Range/Section, or two shared rare names. Required
   * before a listing-index URL is allowed into a cluster.
   */
  strongIdentity: boolean;
}

/**
 * Weighted agreement score for one candidate pair.
 *
 * Vetoes are checked first and are absolute: no combination of positive signals
 * can rescue a pair whose states disagree or whose dates are three weeks apart.
 */
export function scorePair(a: Fingerprint, b: Fingerprint, rareTokens: Set<string>): ScoreOutcome {
  const f: Record<string, number> = {};
  let identityEvidence = false;

  // ---- vetoes ----
  if (a.state && b.state && a.state !== b.state) {
    return { score: 0, features: f, veto: `state ${a.state}≠${b.state}`, identityEvidence: false, strongIdentity: false };
  }
  if (a.countyKeys.length > 0 && b.countyKeys.length > 0 && overlap(a.countyKeys, b.countyKeys).length === 0) {
    return {
      score: 0,
      features: f,
      veto: `county {${a.countyKeys}}∩{${b.countyKeys}}=∅`,
      identityEvidence: false,
      strongIdentity: false,
    };
  }
  if (a.date && b.date && daysApart(a.date, b.date) > DATE_VETO_DAYS) {
    return {
      score: 0,
      features: f,
      veto: `dates ${Math.round(daysApart(a.date, b.date))}d apart`,
      identityEvidence: false,
      strongIdentity: false,
    };
  }
  if (a.trsKeys.length > 0 && b.trsKeys.length > 0 && overlap(a.trsKeys, b.trsKeys).length === 0) {
    return { score: 0, features: f, veto: 'TRS disjoint', identityEvidence: false, strongIdentity: false };
  }
  // Different tracts of the same multi-tract sale are different parcels with
  // different acreage and different buyers. Every other signal — county, date,
  // auctioneer, near-identical acreage — says "merge", and merging destroys all
  // but one. Unconditional, and deliberately placed where no score can reach it.
  if (a.tractNumber !== null && b.tractNumber !== null && a.tractNumber !== b.tractNumber) {
    return {
      score: 0,
      features: f,
      veto: `tract ${a.tractNumber} vs ${b.tractNumber}`,
      identityEvidence: false,
      strongIdentity: false,
    };
  }
  // A publisher does not list one sale twice under two of its own identifiers.
  // When both sides carry the same host's stable listing id and the ids differ,
  // the source itself is asserting these are distinct records — which outranks
  // anything the scorer can infer. Compares by URL host, not `source_website`,
  // so genuine cross-host reposts (sullivanauctioneers.com vs bigiron.com) are
  // untouched.
  if (
    a.listingHost !== null &&
    a.listingHost === b.listingHost &&
    a.listingId !== null &&
    b.listingId !== null &&
    a.listingId !== b.listingId
  ) {
    return {
      score: 0,
      features: f,
      veto: `same host ${a.listingHost}, distinct listing ids ${a.listingId}/${b.listingId}`,
      identityEvidence: false,
      strongIdentity: false,
    };
  }
  // Total vs tillable are two different measurements of the same farm, so a gap
  // between them is meaningless in BOTH directions: it may not score as
  // agreement, and it may not veto either. Suppressing only the positive half
  // would turn "33.75 total / 30.89 tillable" into a false veto the moment the
  // gap widened past 40%.
  const comparableAcreage =
    a.acreage != null && b.acreage != null && a.acreageMeasure === b.acreageMeasure;
  const acreVetoable = comparableAcreage && relDiff(a.acreage!, b.acreage!) > ACRE_VETO;
  if (acreVetoable && !tractSumAgrees(a, b)) {
    return {
      score: 0,
      features: f,
      veto: `acreage ${a.acreage} vs ${b.acreage}`,
      identityEvidence: false,
      strongIdentity: false,
    };
  }

  // ---- identity signals ----
  const trsShared = overlap(a.trsKeys, b.trsKeys);
  if (trsShared.length > 0) {
    f.trs = 6;
    identityEvidence = true;
  }

  const ntShared = overlap(a.namedTownshipKeys, b.namedTownshipKeys);
  if (ntShared.length > 0) {
    f.namedTownship = 4;
    // A named township repeats across counties, so only counts as identity when
    // the counties also agree.
    if (overlap(a.countyKeys, b.countyKeys).length > 0) identityEvidence = true;
  }

  if (comparableAcreage) {
    const d = relDiff(a.acreage!, b.acreage!);
    if (d <= ACRE_EXACT) f.acreage = 5;
    else if (d <= ACRE_CLOSE) f.acreage = 4;
    else if (d <= ACRE_LOOSE) f.acreage = 2;
    else f.acreage = -2;
    if ((f.acreage ?? 0) >= 4) identityEvidence = true;
  } else if (
    a.acreage != null &&
    b.acreage != null &&
    a.acreageMeasure !== b.acreageMeasure
  ) {
    // One figure is tillable, the other is the whole farm. No evidence either
    // way; the pair must stand or fall on its other identity signals.
    f.acreageMeasureMismatch = 0;
  } else if (tractSumAgrees(a, b)) {
    f.acreageTractSum = 3;
    identityEvidence = true;
  }

  // Two independent rare names ("Verdella" + "Kenkel") is a real signal. One is
  // not: the dry run showed single shared tokens pulling unrelated sales in
  // different counties together. One token corroborates, two identify.
  const sharedRareNames = overlap(a.nameTokens, b.nameTokens).filter((t) => rareTokens.has(t));
  if (sharedRareNames.length >= 2) {
    f.rareName = Math.min(6, 3 + sharedRareNames.length);
    identityEvidence = true;
  } else if (sharedRareNames.length === 1) {
    f.rareName = 2;
  }

  const sharedSlug = overlap(a.slugTokens, b.slugTokens).filter((t) => rareTokens.has(t));
  if (sharedSlug.length >= 2) f.slug = 1;

  // ---- corroborating signals ----
  const countyShared = overlap(a.countyKeys, b.countyKeys);
  if (countyShared.length > 0) {
    const sameSet =
      a.countyKeys.length === b.countyKeys.length && countyShared.length === a.countyKeys.length;
    f.county = sameSet ? 3 : 2;
  }

  if (a.date && b.date) {
    const d = daysApart(a.date, b.date);
    if (d < 1) f.date = 4;
    else if (d <= 2) f.date = 2;
    else f.date = -2;
  }

  const titleSim = jaccard(a.titleTokens, b.titleTokens);
  if (titleSim > 0) {
    // Capped hard when the title is boilerplate — "Lyon County Land Auction"
    // matching itself is not evidence of anything.
    const cap = a.genericTitle || b.genericTitle ? 1.5 : 4;
    f.title = Math.min(cap, 4 * titleSim);
  }

  // Only one side is tract-numbered: usually the numbered lot page of a sale
  // versus the sale's own summary page, which are legitimately different
  // records at different granularity. Not a veto — the pair may still be a real
  // duplicate — but it should have to clear the bar on stronger evidence.
  if ((a.tractNumber === null) !== (b.tractNumber === null)) {
    f.tractAsymmetry = -3;
  }

  if (a.auctioneer && b.auctioneer && a.auctioneer === b.auctioneer) {
    // Weak on purpose: one auctioneer runs many different sales.
    f.auctioneer = 0.5;
  }

  if (a.preciseGeo && b.preciseGeo && a.lat != null && a.lon != null && b.lat != null && b.lon != null) {
    const miles = haversineMiles(a.lat, a.lon, b.lat, b.lon);
    if (miles <= 0.5) f.geo = 3;
    else if (miles <= 3) f.geo = 1;
    else if (miles > 10) f.geo = -4;
  }

  const strongIdentity =
    (f.trs ?? 0) > 0 || (f.acreage ?? 0) >= 5 || (f.rareName ?? 0) >= 5;

  const score = Object.values(f).reduce((acc, n) => acc + n, 0);
  return { score, features: f, veto: null, identityEvidence, strongIdentity };
}

/**
 * Turn a score into a verdict, applying the safety gates that sit above the
 * threshold.
 */
export function classify(
  outcome: ScoreOutcome,
  a: Fingerprint,
  b: Fingerprint,
): { disposition: Disposition; holdReason?: string } {
  if (outcome.veto) return { disposition: 'distinct', holdReason: `veto: ${outcome.veto}` };
  if (outcome.score < REVIEW_THRESHOLD) return { disposition: 'distinct' };
  if (outcome.score < MERGE_THRESHOLD) return { disposition: 'review' };

  // Above the merge threshold — now the gates.
  if (!outcome.identityEvidence) {
    return {
      disposition: 'review',
      holdReason:
        'no identity evidence (county/date/title agreement only — acreage, TRS and name are all absent)',
    };
  }
  // Listing-index URLs. A site root or "/upcoming-auctions" page describes
  // whatever sale is featured today and will describe a different one next
  // month, so binding an event to one is risky.
  //
  // But an outright ban is wrong, and the dry run proved it: all four Verdella
  // Kenkel rows are index URLs on denisonlivestock.com (`/sales.asp`, `/`,
  // `/saturday_sale.asp`, and `/sales.asp#Land_Sale` — the last being the same
  // page as the first with a fragment). Banning them leaves the single most
  // obvious duplicate in the database unmerged. So index URLs may join a
  // cluster, but only on the strongest identity evidence — acreage agreeing to
  // half a percent, a shared TRS, or two shared rare names. The dangerous case,
  // an index page with no acreage at all latching onto a real detail page, is
  // already stopped by the identity gate above.
  if ((a.weakIdentity || b.weakIdentity) && !outcome.strongIdentity) {
    return {
      disposition: 'review',
      holdReason:
        'one side is a site root or listing-index URL and the identity evidence is not exact enough to bind it',
    };
  }
  // Date-disagreement gate. When both sides state a date and they differ, that
  // is positive evidence of two different events. The one benign explanation is
  // a postponement, and a postponement is exactly the kind of thing a human
  // should confirm rather than a scorer assume: the alternative reading is that
  // the auctioneer is running two similar sales a fortnight apart, and merging
  // those deletes one from the map.
  if (a.date && b.date && daysApart(a.date, b.date) > 2) {
    return {
      disposition: 'review',
      holdReason: `dates disagree by ${Math.round(daysApart(a.date, b.date))} days — postponement or two separate sales, a human decides`,
    };
  }
  // Locality gate. `normalizeCounty` maps "", "Not specified" and "Unknown" to
  // an empty set, which correctly avoids a false veto — but it also means such a
  // row has nothing anchoring it to a place. Without this gate the dry run
  // proposed merging an Ellsworth County (KS) listing into a Dallas County (IA)
  // one purely on a name token.
  const sharedCounty = overlap(a.countyKeys, b.countyKeys).length > 0;
  const sharedTrs = overlap(a.trsKeys, b.trsKeys).length > 0;
  const closeGeo =
    a.preciseGeo && b.preciseGeo && a.lat != null && a.lon != null && b.lat != null && b.lon != null
      ? haversineMiles(a.lat, a.lon, b.lat, b.lon) <= 3
      : false;
  if (!sharedCounty && !sharedTrs && !closeGeo) {
    return {
      disposition: 'review',
      holdReason: 'no locality evidence (county set empty or non-overlapping, no shared TRS, no precise nearby coordinates)',
    };
  }
  return { disposition: 'merge' };
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

/**
 * Per-component state used to enforce the hard vetoes across a whole cluster,
 * not merely across a pair.
 */
interface ComponentState {
  dateMin: number | null;
  dateMax: number | null;
  tracts: Set<number>;
  /** host -> the distinct listing ids seen for it inside this component */
  hostIds: Map<string, Set<string>>;
}

/**
 * Union-find that refuses any merge which would violate a cluster-wide
 * invariant.
 *
 * WHY THIS IS NOT A PLAIN UNION-FIND: the vetoes in `scorePair` are pairwise,
 * and transitive closure walks straight around them. A row with no date is
 * compatible with *every* date, so it bridges two rows the date gate explicitly
 * separated:
 *
 *     139354 (2026-08-28) ~ 124973 (no date)   → allowed, only one date
 *     124973 (no date)    ~ 143163 (2026-08-15) → allowed, only one date
 *     ⇒ 139354 and 143163 land in one cluster, 13 days apart
 *
 * That is not hypothetical — it shipped, and produced one cluster spanning 13
 * days and another spanning a full year (2022-01-06 to 2023-01-06), both bridged
 * by date-less rows. The same hole exists for tract numbers and for a host's own
 * listing ids: any row missing the attribute is a universal donor.
 *
 * So the invariants are enforced on the *component*: a cluster may hold at most
 * one tract number, at most one listing id per host, and a date span no wider
 * than the pairwise gate allows. Edges are offered strongest-first, so when an
 * edge has to be refused it is the weakest one that loses.
 */
class ConstrainedUnionFind {
  private parent = new Map<number, number>();
  private state = new Map<number, ComponentState>();

  constructor(fingerprints: Fingerprint[]) {
    for (const fp of fingerprints) {
      const t = fp.date ? fp.date.getTime() : null;
      const hostIds = new Map<string, Set<string>>();
      if (fp.listingHost && fp.listingId) hostIds.set(fp.listingHost, new Set([fp.listingId]));
      this.parent.set(fp.id, fp.id);
      this.state.set(fp.id, {
        dateMin: t,
        dateMax: t,
        tracts: fp.tractNumber !== null ? new Set([fp.tractNumber]) : new Set(),
        hostIds,
      });
    }
  }

  find(x: number): number {
    const p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      this.state.set(x, { dateMin: null, dateMax: null, tracts: new Set(), hostIds: new Map() });
      return x;
    }
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }

  /** Attempt a union. Returns null on success, or the reason it was refused. */
  tryUnion(a: number, b: number): string | null {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return null;
    const sa = this.state.get(ra)!;
    const sb = this.state.get(rb)!;

    const tracts = new Set([...Array.from(sa.tracts), ...Array.from(sb.tracts)]);
    if (tracts.size > 1) {
      return `cluster would span tracts ${Array.from(tracts).sort((x, y) => x - y).join(', ')}`;
    }

    const dates = [sa.dateMin, sa.dateMax, sb.dateMin, sb.dateMax].filter(
      (d): d is number => d !== null,
    );
    let dateMin: number | null = null;
    let dateMax: number | null = null;
    if (dates.length > 0) {
      dateMin = Math.min(...dates);
      dateMax = Math.max(...dates);
      const span = (dateMax - dateMin) / 86_400_000;
      if (span > 2) {
        return `cluster would span ${Math.round(span)} days of auction dates`;
      }
    }

    const hostIds = new Map<string, Set<string>>();
    for (const source of [sa.hostIds, sb.hostIds]) {
      for (const [host, ids] of Array.from(source.entries())) {
        const merged = hostIds.get(host) ?? new Set<string>();
        for (const id of Array.from(ids)) merged.add(id);
        if (merged.size > 1) {
          return `cluster would hold ${merged.size} distinct ${host} listing ids`;
        }
        hostIds.set(host, merged);
      }
    }

    this.parent.set(ra, rb);
    this.state.set(rb, { dateMin, dateMax, tracts, hostIds });
    return null;
  }
}

/**
 * Pick the observation whose values become the golden record.
 *
 * Prefers a strong URL over an index page, then completeness (date, acreage,
 * precise coordinates, legal description), then the lowest id so the choice is
 * stable across runs.
 */
function pickPrimary(ids: number[], fps: Map<number, Fingerprint>): number {
  const score = (id: number): number => {
    const fp = fps.get(id);
    if (!fp) return -1;
    let s = 0;
    if (!fp.weakIdentity) s += 8;
    if (fp.date) s += 4;
    if (fp.acreage != null) s += 4;
    if (fp.preciseGeo) s += 2;
    if (fp.trsKeys.length > 0) s += 2;
    if (!fp.genericTitle) s += 1;
    return s;
  };
  return ids.slice().sort((x, y) => score(y) - score(x) || x - y)[0];
}

/**
 * Full resolution pass over a set of observations.
 *
 * Only `merge` edges join a cluster. `review` edges are recorded and reported
 * but never union'd — otherwise one uncertain pair drags unrelated rows together
 * through transitive closure, which is exactly how a matcher starts deleting
 * real auctions from the map.
 */
export function resolve(inputs: DedupeInput[]): ResolveResult {
  // Aggregator search pages are dropped before anything else. They do not
  // describe one sale, so there is nothing to resolve them to — and left in,
  // they contaminate real clusters with whichever listing was on screen when
  // the extractor ran.
  const excluded: { id: number; url: string | null; reason: string }[] = [];
  const kept: DedupeInput[] = [];
  for (const input of inputs) {
    if (isAggregatorIndexUrl(input.url)) {
      excluded.push({ id: input.id, url: input.url, reason: 'aggregator search page' });
    } else {
      kept.push(input);
    }
  }

  const fingerprints = new Map<number, Fingerprint>();
  const fpList: Fingerprint[] = [];
  for (const input of kept) {
    const fp = fingerprint(input);
    fingerprints.set(fp.id, fp);
    fpList.push(fp);
  }

  const rareTokens = computeRareTokens(fpList);

  // ---- blocking ----
  const blocks = new Map<string, number[]>();
  for (const fp of fpList) {
    for (const key of blockKeysFor(fp, rareTokens)) {
      const bucket = blocks.get(key);
      if (bucket) bucket.push(fp.id);
      else blocks.set(key, [fp.id]);
    }
  }

  // A block far larger than any plausible repost group is a bad key, not a big
  // duplicate group. Skip it and say so rather than scoring O(n²) noise.
  const MAX_BLOCK = 60;
  const oversizedBlocks: { key: string; size: number }[] = [];
  const pairKeys = new Map<string, string>(); // "a:b" -> winning block key

  for (const [key, ids] of Array.from(blocks.entries())) {
    if (ids.length < 2) continue;
    if (ids.length > MAX_BLOCK) {
      oversizedBlocks.push({ key, size: ids.length });
      continue;
    }
    const sorted = ids.slice().sort((x, y) => x - y);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const pk = `${sorted[i]}:${sorted[j]}`;
        // Keep the most specific key that produced this pair, for the audit row.
        const existing = pairKeys.get(pk);
        if (!existing || keySpecificity(key) > keySpecificity(existing)) pairKeys.set(pk, key);
      }
    }
  }

  // ---- scoring ----
  const pairs: ScoredPair[] = [];
  const candidates: ScoredPair[] = [];

  for (const [pk, blockKey] of Array.from(pairKeys.entries())) {
    const [aRaw, bRaw] = pk.split(':');
    const aId = Number(aRaw);
    const bId = Number(bRaw);
    const a = fingerprints.get(aId)!;
    const b = fingerprints.get(bId)!;
    const outcome = scorePair(a, b, rareTokens);
    const { disposition, holdReason } = classify(outcome, a, b);
    if (disposition === 'distinct' && outcome.score < REVIEW_THRESHOLD && !outcome.veto) continue;

    const pair: ScoredPair = {
      aId,
      bId,
      score: Number(outcome.score.toFixed(2)),
      disposition,
      blockKey,
      features: outcome.features,
      holdReason,
    };
    pairs.push(pair);
    if (disposition === 'merge') candidates.push(pair);
  }

  // ---- constrained clustering ----
  // Strongest edges first, so that when the cluster invariants force an edge to
  // be dropped it is the least well-evidenced one that goes.
  const uf = new ConstrainedUnionFind(fpList);
  const mergeEdges: ScoredPair[] = [];
  for (const edge of candidates.slice().sort((x, y) => y.score - x.score)) {
    const refusal = uf.tryUnion(edge.aId, edge.bId);
    if (refusal === null) {
      mergeEdges.push(edge);
    } else {
      // Demote in place: the pair scored like a merge, but accepting it would
      // have built a cluster that violates a hard veto transitively.
      edge.disposition = 'review';
      edge.holdReason = refusal;
    }
  }

  // ---- clustering ----
  const components = new Map<number, number[]>();
  for (const fp of fpList) {
    const root = uf.find(fp.id);
    const members = components.get(root);
    if (members) members.push(fp.id);
    else components.set(root, [fp.id]);
  }

  const edgesByRoot = new Map<number, ScoredPair[]>();
  for (const edge of mergeEdges) {
    const root = uf.find(edge.aId);
    const list = edgesByRoot.get(root);
    if (list) list.push(edge);
    else edgesByRoot.set(root, [edge]);
  }

  const clusters: Cluster[] = [];
  for (const [root, memberIds] of Array.from(components.entries())) {
    const ids = memberIds.slice().sort((x, y) => x - y);
    if (ids.length === 1) {
      clusters.push({
        memberIds: ids,
        primaryId: ids[0],
        matchMethod: 'singleton',
        confidence: null,
        reviewStatus: 'auto',
      });
      continue;
    }
    const edges = edgesByRoot.get(root) ?? [];
    const weakest = edges.reduce((min, e) => Math.min(min, e.score), Number.POSITIVE_INFINITY);
    const oversized = ids.length > MAX_CLUSTER_SIZE;
    clusters.push({
      memberIds: ids,
      primaryId: pickPrimary(ids, fingerprints),
      matchMethod: dominantMethod(edges),
      confidence: Number.isFinite(weakest) ? Number(weakest.toFixed(2)) : null,
      reviewStatus: oversized ? 'needs_review' : 'auto',
      holdReason: oversized
        ? `cluster of ${ids.length} exceeds MAX_CLUSTER_SIZE=${MAX_CLUSTER_SIZE}; over-merge is more likely than a genuine ${ids.length}-way repost`
        : undefined,
    });
  }

  return { fingerprints, pairs, clusters, oversizedBlocks, excluded };
}

function keySpecificity(key: string): number {
  if (key.startsWith('trs:')) return 5;
  if (key.startsWith('nts:')) return 4;
  if (key.startsWith('cn:')) return 3;
  if (key.startsWith('name:')) return 2;
  if (key.startsWith('ca:')) return 1;
  return 0; // cd:
}

function dominantMethod(edges: ScoredPair[]): string {
  if (edges.length === 0) return 'singleton';
  const counts = new Map<string, number>();
  for (const e of edges) {
    const family = e.blockKey.split(':')[0];
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  let best = 'ca';
  let bestN = -1;
  for (const [family, n] of Array.from(counts.entries())) {
    if (n > bestN) {
      best = family;
      bestN = n;
    }
  }
  const LABEL: Record<string, string> = {
    trs: 'trs',
    nts: 'named-township',
    cn: 'name+county',
    name: 'rare-name',
    ca: 'acreage+county',
    cd: 'date+county',
  };
  return LABEL[best] ?? best;
}
