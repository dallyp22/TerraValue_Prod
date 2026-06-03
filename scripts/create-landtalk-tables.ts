import "dotenv/config";
import { pool } from "../server/db.js";

/**
 * Create ONLY the Land Talk tables (land_talk_pdfs, land_sales_comps).
 *
 * We do NOT use `drizzle-kit push` for this: the main drizzle config models
 * only shared/schema.ts, but this Neon instance also holds the soil tables
 * (shared/soil-schema.ts, pushed via db:soil:push) and PostGIS `geom` columns
 * that Drizzle can't model. A full `push` therefore wants to DROP all of that.
 * These idempotent CREATE statements add our two tables without touching
 * anything else.
 */

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS land_talk_pdfs (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    title TEXT,
    month TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    sales_count INTEGER DEFAULT 0,
    error TEXT,
    scraped_at TIMESTAMP,
    ingested_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
  )`,

  `CREATE TABLE IF NOT EXISTS land_sales_comps (
    id SERIAL PRIMARY KEY,
    sale_date TIMESTAMP,
    county TEXT NOT NULL,
    land_type_raw TEXT,
    land_category TEXT,
    sold_acres REAL,
    price_per_acre REAL,
    sale_status TEXT NOT NULL DEFAULT 'sold',
    total_price REAL,
    tillable_csr2 REAL,
    tillable_acres REAL,
    dollar_per_tillable_csr2 REAL,
    sale_month TEXT,
    source_pdf_url TEXT NOT NULL,
    source_name TEXT NOT NULL DEFAULT 'Iowa Appraisal — Land Talk Monthly',
    extraction_confidence REAL,
    row_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
  )`,

  `CREATE INDEX IF NOT EXISTS land_sales_comps_county_date_idx ON land_sales_comps (county, sale_date)`,
  `CREATE INDEX IF NOT EXISTS land_sales_comps_category_idx ON land_sales_comps (land_category)`,
  `CREATE INDEX IF NOT EXISTS land_sales_comps_month_idx ON land_sales_comps (sale_month)`,
];

async function main() {
  console.log("🛠  Creating Land Talk tables (idempotent)…");
  for (const sql of STATEMENTS) {
    const label = sql.trim().split("\n")[0].replace(/\s+/g, " ").slice(0, 70);
    await pool.query(sql);
    console.log(`   ✓ ${label}…`);
  }
  console.log("✅ Done. land_talk_pdfs + land_sales_comps are ready.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
