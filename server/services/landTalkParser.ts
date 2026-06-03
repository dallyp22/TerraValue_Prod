import OpenAI from "openai";
import { createHash } from "crypto";
import { firecrawlService } from "./firecrawl";
import type { InsertLandSalesComp } from "@shared/schema";

/**
 * Land Talk Monthly parser.
 *
 * Iowa Appraisal (Jim Rothermich) publishes a monthly PDF newsletter whose
 * pages 3-4 are a clean "Iowa Land Auction Results" table: Sale Date, County,
 * Land Type, Sold Acres, $/Acre, Tillable CSR2, Tillable Acres, $/Tillable CSR2.
 *
 * This module discovers the monthly PDFs, pulls their text (via Firecrawl,
 * which parses PDFs natively), and extracts the sales table into structured
 * comps. The LLM extraction runs ONCE per PDF at ingest time — never on the
 * valuation request path — so the per-valuation "market research" step can be
 * a plain SQL query against `land_sales_comps`.
 */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY2 || process.env.OPENAI_API_KEY || "",
});

const LAND_TALK_PAGE = "https://www.iowaappraisal.com/land-talk-monthly";

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
};

export interface DiscoveredPdf {
  url: string;
  title: string;
  month: string | null; // YYYY-MM
}

/** Raw row shape the LLM returns (strings preserved so we can map statuses in TS). */
interface RawSaleRow {
  sale_date?: string;          // "MM/DD/YY"
  county?: string;
  land_type?: string;
  sold_acres?: number | string;
  price_per_acre?: number | string;   // number, or "Undisclosed" / "No Sale" / "Undetermined"
  tillable_csr2?: number | string | null;
  tillable_acres?: number | string | null;
  dollar_per_tillable_csr2?: number | string | null; // number or "-"
}

// --------------------------------------------------------------------------
// Discovery
// --------------------------------------------------------------------------

/**
 * Scrape the Land Talk archive page and return every monthly PDF link.
 * The PDFs live on a Squarespace CDN with per-file UUID paths, so the URLs
 * cannot be constructed — we must read them off the page each run.
 */
export async function discoverLandTalkPdfs(
  pageUrl: string = LAND_TALK_PAGE,
): Promise<DiscoveredPdf[]> {
  const { links, markdown } = await firecrawlService.scrapeWithLinks(pageUrl);

  const candidates = new Set<string>();
  for (const link of links || []) {
    if (typeof link === "string" && /\.pdf(\?|$)/i.test(link)) candidates.add(link);
  }
  // Belt-and-suspenders: also pull any .pdf URLs out of the markdown body.
  const mdMatches = (markdown || "").match(/https?:\/\/[^\s)"']+\.pdf/gi) || [];
  for (const m of mdMatches) candidates.add(m);

  return Array.from(candidates).map((url) => {
    const title = filenameToTitle(url);
    return { url, title, month: deriveMonth(url, title) };
  });
}

function filenameToTitle(url: string): string {
  try {
    const file = decodeURIComponent(url.split("/").pop() || "")
      .replace(/\.pdf$/i, "")
      .replace(/[-+_]/g, " ")
      .replace(/\b(web|opt|rfs|np5l|final|v\d+)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    return file || url;
  } catch {
    return url;
  }
}

/** Derive YYYY-MM from a filename/title like "April-2026-Land-Talk-Monthly-web.pdf". */
export function deriveMonth(url: string, title?: string): string | null {
  const haystack = `${decodeURIComponent(url)} ${title || ""}`.toLowerCase();
  const m = haystack.match(
    /(january|february|march|april|may|june|july|august|september|october|november|december)[-_+\s]*(\d{4})/,
  );
  if (m) return `${m[2]}-${MONTHS[m[1]]}`;
  return null;
}

// --------------------------------------------------------------------------
// PDF text
// --------------------------------------------------------------------------

/** Fetch a PDF's text via Firecrawl (parses PDFs to markdown natively). */
export async function fetchPdfText(url: string): Promise<string> {
  const res = await firecrawlService.scrape(url);
  const md = res?.data?.markdown || res?.markdown || "";
  if (!md || md.length < 50) {
    throw new Error(`Firecrawl returned little/no text for ${url} (${md.length} chars)`);
  }
  return md;
}

// --------------------------------------------------------------------------
// Extraction
// --------------------------------------------------------------------------

const EXTRACTION_PROMPT = `You are extracting Iowa land-sale records from the "Iowa Land Auction Results" table in a Land Talk Monthly newsletter.

ONLY extract rows from that auction-results table (pages titled "Iowa Land Auction Results"). IGNORE:
- market commentary / narrative text
- the "Acres Auctioned in Iowa" yearly summary table
- cash corn/soybean price lines
- the final TOTAL row
- any advertisements

The table columns are: SALE DATE, COUNTY, LAND TYPE, SOLD ACRES, $ PER ACRE, TILLABLE CSR2, TILLABLE ACRES, $/TILLABLE CSR2.

Rules:
- Preserve values verbatim as strings where a cell may be non-numeric.
- "$ PER ACRE" may be a dollar amount OR one of: "Undisclosed", "No Sale", "Undetermined". Return whichever appears.
- "$/TILLABLE CSR2" shows "-" when tillable acres are below 80% — return "-" in that case.
- Strip "$" and "," from numeric money values but keep the literal words above.
- Clean obvious OCR artifacts in county names (leading backticks/quotes) but keep the real county name.

Return JSON of exactly this shape:
{
  "sales": [
    {
      "sale_date": "MM/DD/YY",
      "county": "string",
      "land_type": "string",
      "sold_acres": number,
      "price_per_acre": number | "Undisclosed" | "No Sale" | "Undetermined",
      "tillable_csr2": number | null,
      "tillable_acres": number | null,
      "dollar_per_tillable_csr2": number | "-" | null
    }
  ]
}`;

export interface ParsedPdf {
  comps: InsertLandSalesComp[];
  rowCount: number;
  confidence: number;
}

/**
 * Extract structured comps from already-fetched PDF text.
 * Kept separate from fetching so it can be unit-tested against fixture text.
 */
export async function parseSalesFromText(
  text: string,
  sourcePdfUrl: string,
  fallbackMonth: string | null,
): Promise<ParsedPdf> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: text.slice(0, 120_000) },
    ],
    response_format: { type: "json_object" },
  });

  const parsed = JSON.parse(response.choices[0].message.content || "{}");
  const rows: RawSaleRow[] = Array.isArray(parsed.sales) ? parsed.sales : [];

  const saleMonth = fallbackMonth;
  const comps: InsertLandSalesComp[] = [];
  let lowConfidenceRows = 0;

  rows.forEach((row, index) => {
    const cleaned = cleanRow(row, sourcePdfUrl, saleMonth, index);
    if (!cleaned) {
      lowConfidenceRows++;
      return;
    }
    comps.push(cleaned);
  });

  // Crude confidence: fraction of returned rows we could fully clean.
  const confidence = rows.length > 0 ? (rows.length - lowConfidenceRows) / rows.length : 0;

  return { comps, rowCount: comps.length, confidence };
}

/** Fetch + extract in one shot. */
export async function parseLandTalkPdf(
  url: string,
  fallbackMonth: string | null,
): Promise<ParsedPdf> {
  const text = await fetchPdfText(url);
  return parseSalesFromText(text, url, fallbackMonth ?? deriveMonth(url));
}

// --------------------------------------------------------------------------
// Cleaning
// --------------------------------------------------------------------------

function cleanRow(
  row: RawSaleRow,
  sourcePdfUrl: string,
  saleMonth: string | null,
  index: number,
): InsertLandSalesComp | null {
  const county = cleanCounty(row.county);
  const saleDate = reconcileDate(parseSaleDate(row.sale_date), saleMonth);
  const soldAcres = toNumber(row.sold_acres);

  // A row without a county is unusable.
  if (!county) return null;

  const { pricePerAcre, saleStatus } = parsePrice(row.price_per_acre);
  const tillableCsr2 = toNumberOrNull(row.tillable_csr2);
  const tillableAcres = toNumberOrNull(row.tillable_acres);
  const dollarPerTillableCsr2 = parseDashNumber(row.dollar_per_tillable_csr2);
  const landTypeRaw = (row.land_type || "").trim() || null;

  const totalPrice =
    pricePerAcre != null && soldAcres != null
      ? Math.round(pricePerAcre * soldAcres)
      : null;

  // Include the row's position in the PDF so two genuinely-identical-looking
  // sales (same date/county/acres/price) get distinct hashes instead of
  // colliding (which breaks the batch upsert). The PDF table order is stable
  // across re-extractions of the same published document.
  const rowHash = createHash("sha1")
    .update(
      [
        sourcePdfUrl,
        index,
        row.sale_date || "",
        county,
        row.sold_acres ?? "",
        row.price_per_acre ?? "",
      ].join("|"),
    )
    .digest("hex");

  return {
    saleDate: saleDate ?? undefined,
    county,
    landTypeRaw: landTypeRaw ?? undefined,
    landCategory: normalizeCategory(landTypeRaw),
    soldAcres: soldAcres ?? undefined,
    pricePerAcre: pricePerAcre ?? undefined,
    saleStatus,
    totalPrice: totalPrice ?? undefined,
    tillableCsr2: tillableCsr2 ?? undefined,
    tillableAcres: tillableAcres ?? undefined,
    dollarPerTillableCsr2: dollarPerTillableCsr2 ?? undefined,
    saleMonth: saleMonth ?? undefined,
    sourcePdfUrl,
    rowHash,
  };
}

function cleanCounty(raw?: string): string | null {
  if (!raw) return null;
  const c = raw.replace(/[^A-Za-z\s'.-]/g, "").trim(); // drop leading backticks/quotes etc.
  return c.length >= 2 ? c : null;
}

/**
 * Reconcile a parsed sale date against the newsletter month. Sales reported in
 * a given month's newsletter occur in the months leading up to it, so a date
 * outside [newsletterMonth - 12mo, newsletterMonth + 1mo] is a misparse (e.g.
 * a "02" year read as 2002 when the newsletter is 2025). In that case — or when
 * no date parsed — attribute the sale to the start of the newsletter month.
 */
function reconcileDate(saleDate: Date | null, saleMonth: string | null): Date | null {
  if (!saleMonth) return saleDate;
  const [y, m] = saleMonth.split("-").map(Number);
  if (!y || !m) return saleDate;
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  if (!saleDate) return monthStart;
  const lower = new Date(Date.UTC(y - 1, m - 1, 1));
  const upper = new Date(Date.UTC(y, m, 1)); // newsletter month + 1
  if (saleDate < lower || saleDate > upper) return monthStart;
  return saleDate;
}

function parseSaleDate(raw?: string): Date | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function parsePrice(raw: number | string | null | undefined): {
  pricePerAcre: number | null;
  saleStatus: string;
} {
  if (raw == null) return { pricePerAcre: null, saleStatus: "undetermined" };
  if (typeof raw === "number") return { pricePerAcre: raw, saleStatus: "sold" };
  const s = raw.toString().trim().toLowerCase();
  if (s.includes("undisclosed")) return { pricePerAcre: null, saleStatus: "undisclosed" };
  if (s.includes("no sale")) return { pricePerAcre: null, saleStatus: "no_sale" };
  if (s.includes("undetermined")) return { pricePerAcre: null, saleStatus: "undetermined" };
  const n = toNumber(raw);
  return n != null ? { pricePerAcre: n, saleStatus: "sold" } : { pricePerAcre: null, saleStatus: "undetermined" };
}

/** "$/TILLABLE CSR2" — "-" means tillable < 80% (not reported). */
function parseDashNumber(raw: number | string | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  if (raw.toString().trim() === "-") return null;
  return toNumber(raw);
}

function toNumber(raw: number | string | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return isFinite(raw) ? raw : null;
  const n = parseFloat(raw.toString().replace(/[$,\s]/g, ""));
  return isFinite(n) ? n : null;
}

function toNumberOrNull(raw: number | string | null | undefined): number | null {
  return toNumber(raw);
}

/** Reduce a compound land-type string to a normalized primary category. */
export function normalizeCategory(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("tillable")) return "tillable";
  if (s.includes("pasture")) return "pasture";
  if (s.includes("crp")) return "crp";
  if (s.includes("recreation")) return "recreational";
  if (s.includes("development")) return "development";
  if (s.includes("woods") || s.includes("timber")) return "woods";
  return "other";
}
