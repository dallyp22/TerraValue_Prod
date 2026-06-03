import { db } from "../db";
import { landSalesComps } from "@shared/schema";
import { and, gte, eq, isNotNull, desc } from "drizzle-orm";
import { iowaCountyCentroids, getCountyCentroid } from "./iowaCountyCentroids";
import type { MarketAnalysisResult, SalesComp } from "./openai";

/**
 * Iowa market analysis sourced from the local `land_sales_comps` table
 * (parsed from Land Talk Monthly), replacing the slow OpenAI Assistants +
 * vector-store retrieval. Returns the SAME shape as
 * openaiService.getIowaMarketAnalysis so it's a drop-in swap in the valuation
 * pipeline. Returns null when we have no usable comps (caller falls back).
 */

const MIN_COMPS = 3;        // below this in-county, expand to nearby counties
const MAX_COMPS_RETURNED = 10;
const LOOKBACK_MONTHS = 24;
const NEIGHBOR_COUNT = 6;

/** Map a subject parcel's land type to a comps land_category. */
function landTypeToCategory(landType: string): string {
  const s = (landType || "").toLowerCase();
  if (s.includes("pasture")) return "pasture";
  if (s.includes("crp")) return "crp";
  if (s.includes("recreation")) return "recreational";
  // Irrigated / Dryland / Tillable / Mixed and anything else → tillable cropland
  return "tillable";
}

function normalizeCounty(name: string): string {
  return (name || "").replace(/county/i, "").trim().toLowerCase();
}

/** K nearest Iowa counties to the subject county, by centroid distance. */
function nearestCounties(county: string, k: number): string[] {
  const origin = getCountyCentroid(county);
  if (!origin) return [];
  return Object.values(iowaCountyCentroids)
    .filter((c) => c.county !== origin.county)
    .map((c) => ({
      county: c.county,
      d: Math.hypot(c.latitude - origin.latitude, c.longitude - origin.longitude),
    }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k)
    .map((c) => c.county);
}

type CompRow = typeof landSalesComps.$inferSelect;

function toSalesComp(row: CompRow): SalesComp {
  const date = row.saleDate ? new Date(row.saleDate).toISOString().slice(0, 7) : "";
  const parts = [
    `${row.county} County`,
    row.landTypeRaw || row.landCategory || undefined,
    row.soldAcres ? `${Math.round(row.soldAcres)} ac` : undefined,
    row.tillableCsr2 ? `CSR2 ${row.tillableCsr2}` : undefined,
  ].filter(Boolean);
  return {
    date,
    price_per_acre: row.pricePerAcre ?? 0,
    details: parts.join(" — "),
    acres: row.soldAcres ?? undefined,
    land_type: row.landTypeRaw ?? undefined,
    county: row.county ?? undefined,
  };
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

/**
 * Year-over-year change from the comp set: avg $/acre in the most recent 12
 * months vs the prior 12 months. Returns a decimal (e.g. 0.04) or undefined.
 */
function computeYoy(rows: CompRow[]): number | undefined {
  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
  const recent: number[] = [];
  const prior: number[] = [];
  for (const r of rows) {
    if (!r.saleDate || r.pricePerAcre == null) continue;
    const t = new Date(r.saleDate).getTime();
    if (t >= oneYearAgo) recent.push(r.pricePerAcre);
    else prior.push(r.pricePerAcre);
  }
  if (recent.length < 2 || prior.length < 2) return undefined;
  const a = avg(recent);
  const p = avg(prior);
  if (p <= 0) return undefined;
  return Math.round(((a - p) / p) * 1000) / 1000;
}

export async function getIowaMarketAnalysisFromComps(
  county: string,
  landType: string,
): Promise<MarketAnalysisResult | null> {
  const category = landTypeToCategory(landType);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - LOOKBACK_MONTHS);

  // One small query: recent, sold, priced comps in the subject category.
  // The table is small, so we tier by county in JS to avoid casing/IN pitfalls.
  const pool = await db
    .select()
    .from(landSalesComps)
    .where(
      and(
        eq(landSalesComps.saleStatus, "sold"),
        isNotNull(landSalesComps.pricePerAcre),
        isNotNull(landSalesComps.saleDate),
        gte(landSalesComps.saleDate, cutoff),
        eq(landSalesComps.landCategory, category),
      ),
    )
    .orderBy(desc(landSalesComps.saleDate));

  if (pool.length === 0) return null;

  const target = normalizeCounty(county);
  const inCounty = pool.filter((r) => normalizeCounty(r.county) === target);

  let used = inCounty;
  let scope: "county" | "regional" = "county";

  if (inCounty.length < MIN_COMPS) {
    const neighbors = new Set(nearestCounties(county, NEIGHBOR_COUNT).map(normalizeCounty));
    const regional = pool.filter(
      (r) => normalizeCounty(r.county) === target || neighbors.has(normalizeCounty(r.county)),
    );
    if (regional.length >= MIN_COMPS) {
      used = regional;
      scope = "regional";
    } else {
      // Still thin — keep whatever we have in-county (may be < MIN, but real).
      used = inCounty.length > 0 ? inCounty : regional;
      scope = inCounty.length > 0 ? "county" : "regional";
    }
  }

  if (used.length === 0) return null;

  const prices = used.map((r) => r.pricePerAcre!).filter((p) => p > 0);
  const avgPrice = Math.round(avg(prices));
  const csr2s = used.map((r) => r.tillableCsr2).filter((v): v is number => v != null);
  const avgCsr2 = csr2s.length ? Math.round(avg(csr2s) * 10) / 10 : undefined;
  const yoy = computeYoy(used);

  const comps = used.slice(0, MAX_COMPS_RETURNED).map(toSalesComp);

  const factors: string[] = [
    `${used.length} comparable ${category} sale${used.length === 1 ? "" : "s"} analyzed${scope === "regional" ? " (county + nearby counties)" : ""}`,
    `Average sale price $${avgPrice.toLocaleString()}/acre`,
  ];
  if (avgCsr2 != null) factors.push(`Average tillable CSR2 ${avgCsr2}`);
  if (yoy != null) {
    factors.push(`Year-over-year ${yoy >= 0 ? "+" : ""}${(yoy * 100).toFixed(1)}% in $/acre`);
  }

  const scopeText = scope === "regional" ? `${county} County and nearby counties` : `${county} County`;
  const summary =
    `Based on ${used.length} recent ${category} land ${used.length === 1 ? "sale" : "sales"} in ${scopeText} ` +
    `(last ${LOOKBACK_MONTHS} months), the average sale price was $${avgPrice.toLocaleString()}/acre` +
    (avgCsr2 != null ? ` at an average tillable CSR2 of ${avgCsr2}` : "") +
    (yoy != null ? `, with prices ${yoy >= 0 ? "up" : "down"} ${Math.abs(yoy * 100).toFixed(1)}% year over year` : "") +
    `. Source: Iowa Appraisal — Land Talk Monthly.`;

  return {
    comps,
    trends: { yoy_change: yoy, factors },
    summary,
  };
}

export const landCompsService = { getIowaMarketAnalysisFromComps };
