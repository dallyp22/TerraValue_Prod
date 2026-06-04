import { pool } from "../db";
import { getCountyCentroid } from "./iowaCountyCentroids";

/**
 * Comparable-sales engine over land_sales_comps.
 *
 * Finds the sales most similar to a subject parcel (by CSR2 productivity,
 * geographic proximity, recency, land type, and size), then derives a
 * defensible per-acre value using the empirical $/CSR2-point method (Jim
 * Rothermich's methodology) cross-checked against productivity-adjusted comp
 * prices. This runs in pure SQL/JS (milliseconds) and, when strong, lets the
 * valuation pipeline skip its LLM reasoning entirely.
 */

const LOOKBACK_MONTHS = 36;
const TOP_K = 10;
const OUTLIER_CAP = 40000;

export interface SubjectParcel {
  county: string;
  landType: string;
  csr2Mean?: number | null;
  acreage: number;
  tillableAcres?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ComparableSale {
  county: string;
  saleDate: string | null;
  soldAcres: number | null;
  pricePerAcre: number;
  tillableCsr2: number;
  dollarPerTillableCsr2: number | null;
  landType: string | null;
  similarity: number;       // 0-1 overall
  impliedValuePerAcre: number; // comp price adjusted to the subject's CSR2
}

export interface ComparablesResult {
  comps: ComparableSale[];
  count: number;
  valuePerAcre: number | null;
  low: number | null;
  high: number | null;
  dollarPerCsr2Point: number | null;
  confidence: number;       // 0-1
  strong: boolean;          // ok to drive the valuation without the LLM
  scope: "county" | "regional";
  method: "csr2_point";
}

function landTypeToCategory(landType: string): string {
  const s = (landType || "").toLowerCase();
  if (s.includes("pasture")) return "pasture";
  if (s.includes("crp")) return "crp";
  if (s.includes("recreation")) return "recreational";
  return "tillable";
}

function normalizeCounty(name: string): string {
  return (name || "").replace(/county/i, "").trim().toLowerCase();
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function weightedMedian(pairs: { v: number; w: number }[]): number | null {
  const valid = pairs.filter((p) => p.w > 0 && isFinite(p.v));
  if (!valid.length) return null;
  valid.sort((a, b) => a.v - b.v);
  const total = valid.reduce((s, p) => s + p.w, 0);
  let acc = 0;
  for (const p of valid) {
    acc += p.w;
    if (acc >= total / 2) return p.v;
  }
  return valid[valid.length - 1].v;
}

function percentile(nums: number[], p: number): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[idx];
}

export async function findComparables(subject: SubjectParcel): Promise<ComparablesResult> {
  const empty: ComparablesResult = {
    comps: [], count: 0, valuePerAcre: null, low: null, high: null,
    dollarPerCsr2Point: null, confidence: 0, strong: false, scope: "county", method: "csr2_point",
  };

  const subjectCsr2 = subject.csr2Mean ?? null;
  if (!subjectCsr2 || subjectCsr2 <= 0) return empty; // CSR2 method needs subject CSR2

  const category = landTypeToCategory(subject.landType);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - LOOKBACK_MONTHS);

  const { rows } = await pool.query(
    `SELECT split_part(county,'-',1) AS county, sale_date, sold_acres,
            price_per_acre, tillable_csr2, dollar_per_tillable_csr2, land_type_raw
     FROM land_sales_comps
     WHERE sale_status='sold' AND price_per_acre IS NOT NULL AND price_per_acre <= $1
       AND sale_date >= $2 AND tillable_csr2 IS NOT NULL AND tillable_csr2 <= 100
       AND land_category = $3`,
    [OUTLIER_CAP, cutoff.toISOString(), category],
  );
  if (!rows.length) return empty;

  const subjCentroid = getCountyCentroid(subject.county);
  const now = Date.now();

  // Score every candidate.
  const scored = (rows as any[]).map((r) => {
    const csr2 = Number(r.tillable_csr2);
    const csr2Sim = 1 / (1 + Math.abs(subjectCsr2 - csr2) / 10);

    let proxSim = 0.4; // unknown location → neutral-ish
    const compCentroid = getCountyCentroid(r.county);
    if (normalizeCounty(r.county) === normalizeCounty(subject.county)) {
      proxSim = 1;
    } else if (subjCentroid && compCentroid) {
      const d = Math.hypot(compCentroid.latitude - subjCentroid.latitude, compCentroid.longitude - subjCentroid.longitude);
      proxSim = 1 / (1 + d / 0.6); // ~0.6° ≈ 40mi half-weight
    }

    const monthsAgo = r.sale_date ? (now - new Date(r.sale_date).getTime()) / (1000 * 60 * 60 * 24 * 30) : LOOKBACK_MONTHS;
    const recSim = 1 / (1 + Math.max(0, monthsAgo) / 12);

    const acres = r.sold_acres != null ? Number(r.sold_acres) : null;
    const sizeSim = acres != null ? 1 / (1 + Math.abs(acres - subject.acreage) / Math.max(subject.acreage, 40)) : 0.5;

    const similarity = 0.45 * csr2Sim + 0.3 * proxSim + 0.2 * recSim + 0.05 * sizeSim;
    const price = Number(r.price_per_acre);
    // CSR2-normalize the comp price only for tillable cropland; for pasture/CRP/
    // recreational, value isn't CSR2-driven, so use the raw comp price.
    const impliedValuePerAcre =
      category === "tillable" ? Math.round(price * (subjectCsr2 / csr2)) : Math.round(price);

    return {
      county: r.county,
      saleDate: r.sale_date ? new Date(r.sale_date).toISOString().slice(0, 10) : null,
      soldAcres: acres,
      pricePerAcre: price,
      tillableCsr2: csr2,
      dollarPerTillableCsr2: r.dollar_per_tillable_csr2 != null ? Number(r.dollar_per_tillable_csr2) : null,
      landType: r.land_type_raw,
      similarity: Math.round(similarity * 1000) / 1000,
      impliedValuePerAcre,
    } as ComparableSale;
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  const comps = scored.slice(0, TOP_K);
  const sameCounty = comps.some((c) => normalizeCounty(c.county) === normalizeCounty(subject.county));

  // Empirical $/CSR2 point — only meaningful for tillable cropland (the metric
  // is reported when tillable acres are >= 80%).
  const isTillable = category === "tillable";
  const dollarPerCsr2Point = isTillable
    ? weightedMedian(
        comps.filter((c) => c.dollarPerTillableCsr2 != null && c.dollarPerTillableCsr2 > 0)
          .map((c) => ({ v: c.dollarPerTillableCsr2 as number, w: c.similarity })),
      )
    : null;

  const valueByPoint = dollarPerCsr2Point != null ? subjectCsr2 * dollarPerCsr2Point : null;
  const valueByAdjusted = weightedMedian(comps.map((c) => ({ v: c.impliedValuePerAcre, w: c.similarity })));

  const candidates = [valueByPoint, valueByAdjusted].filter((v): v is number => v != null && v > 0);
  const valuePerAcre = candidates.length ? Math.round(candidates.reduce((a, b) => a + b, 0) / candidates.length) : null;

  const implied = comps.map((c) => c.impliedValuePerAcre).filter((v) => v > 0);
  const low = percentile(implied, 20);
  const high = percentile(implied, 80);

  // Confidence: enough comps, similar, and tightly clustered.
  const countScore = Math.min(comps.length / 8, 1);
  const simScore = comps.length ? comps.reduce((s, c) => s + c.similarity, 0) / comps.length : 0;
  const dispScore = valuePerAcre && low != null && high != null
    ? 1 - Math.min(1, (high - low) / valuePerAcre)
    : 0.5;
  const confidence = Math.round((0.4 * countScore + 0.35 * simScore + 0.25 * dispScore) * 100) / 100;

  const strong = comps.length >= 5 && confidence >= 0.45 && valuePerAcre != null;

  return {
    comps,
    count: comps.length,
    valuePerAcre,
    low,
    high,
    dollarPerCsr2Point: dollarPerCsr2Point != null ? Math.round(dollarPerCsr2Point) : null,
    confidence,
    strong,
    scope: sameCounty ? "county" : "regional",
    method: "csr2_point",
  };
}

/**
 * County base $/acre derived from recent comps (median), with a nearest-county
 * fallback. Replaces the slow OpenAI vector-store base-value lookup when data
 * exists. Returns null if we have no comps for the county/region.
 */
export async function getCompsBaseValue(county: string, landType: string): Promise<number | null> {
  const category = landTypeToCategory(landType);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - LOOKBACK_MONTHS);
  const { rows } = await pool.query(
    `SELECT split_part(county,'-',1) AS county, price_per_acre
     FROM land_sales_comps
     WHERE sale_status='sold' AND price_per_acre IS NOT NULL AND price_per_acre <= $1
       AND sale_date >= $2 AND land_category = $3`,
    [OUTLIER_CAP, cutoff.toISOString(), category],
  );
  if (!rows.length) return null;
  const target = normalizeCounty(county);
  const inCounty = (rows as any[]).filter((r) => normalizeCounty(r.county) === target).map((r) => Number(r.price_per_acre));
  if (inCounty.length >= 3) return Math.round(median(inCounty)!);
  // statewide fallback within category
  const all = (rows as any[]).map((r) => Number(r.price_per_acre));
  return all.length ? Math.round(median(all)!) : null;
}

export const comparablesService = { findComparables, getCompsBaseValue };
