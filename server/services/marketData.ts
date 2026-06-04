import { pool } from "../db";
import { getCountyCentroid } from "./iowaCountyCentroids";

/**
 * Market Data aggregations over land_sales_comps (Land Talk Monthly comps).
 * Powers the "Market Data" tab. The table is small (~3k rows) so these run
 * instantly. Shared by the worker and express routes.
 */

export interface MarketFilters {
  dateFrom?: string;       // YYYY-MM-DD
  dateTo?: string;         // YYYY-MM-DD
  counties?: string[];
  landCategory?: string;   // tillable | pasture | crp | ...
  csr2Min?: number;
  csr2Max?: number;
}

export interface TimeseriesPoint {
  month: string;           // YYYY-MM
  avgPerAcre: number | null;
  medianPerAcre: number | null;
  avgPerCsr2: number | null;
  saleCount: number;
  acres: number | null;
}

export interface MarketSummary {
  totalSales: number;
  totalAcres: number | null;
  avgPerAcre: number | null;
  medianPerCsr2: number | null;
  latestMonth: string | null;
  latestAvgPerAcre: number | null;
  yoyPct: number | null;       // decimal, e.g. 0.043
  dateFrom: string | null;
  dateTo: string | null;
}

// Whitelisted sort columns for the sales table (avoid SQL injection).
const SALES_SORT_COLUMNS: Record<string, string> = {
  sale_date: "sale_date",
  price_per_acre: "price_per_acre",
  sold_acres: "sold_acres",
  tillable_csr2: "tillable_csr2",
  county: "county",
};

/** Build a WHERE fragment from filters. `startIdx` is the next $n placeholder. */
function buildFilters(
  f: MarketFilters,
  opts: { includeDate?: boolean } = { includeDate: true },
): { clause: string; params: any[]; next: number } {
  const conds: string[] = [];
  const params: any[] = [];
  let i = 1;
  if (opts.includeDate !== false && f.dateFrom) {
    conds.push(`sale_date >= $${i++}`);
    params.push(f.dateFrom);
  }
  if (opts.includeDate !== false && f.dateTo) {
    conds.push(`sale_date <= $${i++}`);
    params.push(f.dateTo);
  }
  if (f.counties?.length) {
    conds.push(`county = ANY($${i++})`);
    params.push(f.counties);
  }
  if (f.landCategory) {
    conds.push(`land_category = $${i++}`);
    params.push(f.landCategory);
  }
  if (f.csr2Min != null) {
    conds.push(`tillable_csr2 >= $${i++}`);
    params.push(f.csr2Min);
  }
  if (f.csr2Max != null) {
    conds.push(`tillable_csr2 <= $${i++}`);
    params.push(f.csr2Max);
  }
  return { clause: conds.length ? " AND " + conds.join(" AND ") : "", params, next: i };
}

/**
 * Base predicate for $ analytics: real, priced, dated sales — and a high cap
 * to exclude non-farmland outliers (development/commercial tracts that sell for
 * $50k–$100k+/acre and skew averages). The raw sales table is NOT capped.
 */
const OUTLIER_CAP = 40000;
const PRICED = `sale_status = 'sold' AND price_per_acre IS NOT NULL AND price_per_acre <= ${OUTLIER_CAP} AND sale_date IS NOT NULL`;

export async function getTimeseries(f: MarketFilters): Promise<TimeseriesPoint[]> {
  const { clause, params } = buildFilters(f);
  const sql = `
    SELECT
      to_char(date_trunc('month', sale_date), 'YYYY-MM') AS month,
      round(avg(price_per_acre))::int AS avg_per_acre,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price_per_acre))::int AS median_per_acre,
      round(avg(dollar_per_tillable_csr2))::int AS avg_per_csr2,
      count(*)::int AS sale_count,
      round(sum(sold_acres))::int AS acres
    FROM land_sales_comps
    WHERE ${PRICED}${clause}
    GROUP BY 1
    ORDER BY 1`;
  const { rows } = await pool.query(sql, params);
  return rows.map((r: any) => ({
    month: r.month,
    avgPerAcre: r.avg_per_acre,
    medianPerAcre: r.median_per_acre,
    avgPerCsr2: r.avg_per_csr2,
    saleCount: r.sale_count,
    acres: r.acres,
  }));
}

export async function getSummary(f: MarketFilters): Promise<MarketSummary> {
  const { clause, params } = buildFilters(f);
  const totalsSql = `
    SELECT
      count(*)::int AS total_sales,
      round(sum(sold_acres))::int AS total_acres,
      round(avg(price_per_acre))::int AS avg_per_acre,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY dollar_per_tillable_csr2)
        FILTER (WHERE dollar_per_tillable_csr2 IS NOT NULL))::int AS median_per_csr2,
      min(sale_date)::text AS date_from,
      max(sale_date)::text AS date_to
    FROM land_sales_comps
    WHERE ${PRICED}${clause}`;
  const { rows } = await pool.query(totalsSql, params);
  const t = rows[0] || {};

  // latest month + YoY from the monthly series (non-date filters only, so the
  // trailing-12 window has history regardless of the date range chosen).
  const series = await getTimeseries({ ...f, dateFrom: undefined, dateTo: undefined });
  const latest = series[series.length - 1];

  let yoyPct: number | null = null;
  if (series.length >= 13) {
    const weightedAvg = (pts: TimeseriesPoint[]) => {
      const n = pts.reduce((s, p) => s + p.saleCount, 0);
      if (!n) return null;
      return pts.reduce((s, p) => s + (p.avgPerAcre || 0) * p.saleCount, 0) / n;
    };
    const recent = weightedAvg(series.slice(-12));
    const prior = weightedAvg(series.slice(-24, -12));
    if (recent != null && prior != null && prior > 0) {
      yoyPct = Math.round(((recent - prior) / prior) * 1000) / 1000;
    }
  }

  return {
    totalSales: t.total_sales ?? 0,
    totalAcres: t.total_acres ?? null,
    avgPerAcre: t.avg_per_acre ?? null,
    medianPerCsr2: t.median_per_csr2 ?? null,
    latestMonth: latest?.month ?? null,
    latestAvgPerAcre: latest?.avgPerAcre ?? null,
    yoyPct,
    dateFrom: t.date_from ? t.date_from.slice(0, 10) : null,
    dateTo: t.date_to ? t.date_to.slice(0, 10) : null,
  };
}

export interface SalesQuery extends MarketFilters {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export async function getRecentSales(q: SalesQuery) {
  // Note: the sales table shows ALL statuses (incl. no_sale/undisclosed) so the
  // record is complete; $ aggregations elsewhere use only priced sales.
  const conds: string[] = ["sale_date IS NOT NULL"];
  const params: any[] = [];
  let i = 1;
  if (q.dateFrom) { conds.push(`sale_date >= $${i++}`); params.push(q.dateFrom); }
  if (q.dateTo) { conds.push(`sale_date <= $${i++}`); params.push(q.dateTo); }
  if (q.counties?.length) { conds.push(`county = ANY($${i++})`); params.push(q.counties); }
  if (q.landCategory) { conds.push(`land_category = $${i++}`); params.push(q.landCategory); }
  if (q.csr2Min != null) { conds.push(`tillable_csr2 >= $${i++}`); params.push(q.csr2Min); }
  if (q.csr2Max != null) { conds.push(`tillable_csr2 <= $${i++}`); params.push(q.csr2Max); }
  const where = `WHERE ${conds.join(" AND ")}`;

  const sortCol = SALES_SORT_COLUMNS[q.sortBy || "sale_date"] || "sale_date";
  const sortDir = q.sortDir === "asc" ? "ASC" : "DESC";
  const limit = Math.min(q.limit ?? 50, 200);
  const offset = q.offset ?? 0;

  const countRes = await pool.query(
    `SELECT count(*)::int AS n FROM land_sales_comps ${where}`,
    params,
  );
  const total = countRes.rows[0]?.n ?? 0;

  const rowsRes = await pool.query(
    `SELECT id, sale_date, county, land_type_raw, land_category, sold_acres,
            price_per_acre, sale_status, tillable_csr2, tillable_acres,
            dollar_per_tillable_csr2, sale_month, source_pdf_url
     FROM land_sales_comps ${where}
     ORDER BY ${sortCol} ${sortDir} NULLS LAST, id DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...params, limit, offset],
  );

  return { total, rows: rowsRes.rows, limit, offset };
}

export interface CountyStat {
  county: string;
  sales: number;
  medianPerAcre: number | null;
  avgPerCsr2: number | null;
  lat: number;
  lng: number;
}

/** Per-county medians + centroid coords (for the bubble map and leaderboard). */
export async function getByCounty(f: MarketFilters): Promise<CountyStat[]> {
  const { clause, params } = buildFilters(f);
  // split_part attributes multi-county tracts ("Polk-Jasper") to the first county.
  const sql = `
    SELECT split_part(county, '-', 1) AS county,
      count(*)::int AS sales,
      round(percentile_cont(0.5) WITHIN GROUP (ORDER BY price_per_acre))::int AS median_per_acre,
      round(avg(dollar_per_tillable_csr2))::int AS avg_per_csr2
    FROM land_sales_comps
    WHERE ${PRICED}${clause}
    GROUP BY 1
    ORDER BY 2 DESC`;
  const { rows } = await pool.query(sql, params);
  const out: CountyStat[] = [];
  for (const r of rows as any[]) {
    const c = getCountyCentroid(r.county);
    if (!c) continue; // skip anything we can't place (rare odd values)
    out.push({
      county: r.county,
      sales: r.sales,
      medianPerAcre: r.median_per_acre,
      avgPerCsr2: r.avg_per_csr2,
      lat: c.latitude,
      lng: c.longitude,
    });
  }
  return out;
}

export interface ScatterPoint {
  csr2: number;
  pricePerAcre: number;
  county: string;
  year: number;
  acres: number | null;
}

/** Points for the price-vs-CSR2 scatter (sold, priced, capped, with a CSR2). */
export async function getScatter(f: MarketFilters): Promise<ScatterPoint[]> {
  const { clause, params } = buildFilters(f);
  const sql = `
    SELECT tillable_csr2 AS csr2, price_per_acre AS price, county,
           extract(year FROM sale_date)::int AS year, sold_acres AS acres
    FROM land_sales_comps
    WHERE ${PRICED} AND tillable_csr2 IS NOT NULL AND tillable_csr2 <= 100${clause}
    ORDER BY sale_date DESC
    LIMIT 2000`;
  const { rows } = await pool.query(sql, params);
  return (rows as any[]).map((r) => ({
    csr2: r.csr2,
    pricePerAcre: r.price,
    county: r.county,
    year: r.year,
    acres: r.acres,
  }));
}

export interface SeasonalityPoint {
  month: number;        // 1-12
  sales: number;
  avgPerAcre: number | null;
}

/** Sales activity by calendar month (seasonality). */
export async function getSeasonality(f: MarketFilters): Promise<SeasonalityPoint[]> {
  const { clause, params } = buildFilters(f);
  const sql = `
    SELECT extract(month FROM sale_date)::int AS m,
      count(*)::int AS sales,
      round(avg(price_per_acre))::int AS avg_per_acre
    FROM land_sales_comps
    WHERE ${PRICED}${clause}
    GROUP BY 1 ORDER BY 1`;
  const { rows } = await pool.query(sql, params);
  return (rows as any[]).map((r) => ({ month: r.m, sales: r.sales, avgPerAcre: r.avg_per_acre }));
}

/**
 * Minimal per-sale rows (month, county, price) for the client-side time-lapse
 * choropleth. Ignores the date filter (the slider drives time); honors land
 * category. Small payload (~3k rows) so the client can scrub instantly.
 */
export async function getSalesLite(f: MarketFilters): Promise<{ month: string; county: string; price: number }[]> {
  const { clause, params } = buildFilters({ landCategory: f.landCategory, csr2Min: f.csr2Min, csr2Max: f.csr2Max });
  const sql = `
    SELECT to_char(date_trunc('month', sale_date), 'YYYY-MM') AS month,
           split_part(county, '-', 1) AS county,
           price_per_acre AS price
    FROM land_sales_comps
    WHERE ${PRICED}${clause}
    ORDER BY sale_date`;
  const { rows } = await pool.query(sql, params);
  return (rows as any[]).map((r) => ({ month: r.month, county: r.county, price: r.price }));
}

export const marketDataService = {
  getSummary, getTimeseries, getRecentSales, getByCounty, getScatter, getSeasonality, getSalesLite,
};
