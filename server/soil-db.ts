import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as soilSchema from "@shared/soil-schema";

// Soil database is optional - used for faster CSR2 queries.
// Falls back to external APIs if not configured.
let soilSql: ReturnType<typeof neon> | null = null;
let soilDb: ReturnType<typeof drizzle> | null = null;

if (process.env.DATABASE_URL_SOIL) {
  try {
    soilSql = neon(process.env.DATABASE_URL_SOIL);
    soilDb = drizzle(soilSql, { schema: soilSchema });
    console.log("✅ Connected to soil database");
  } catch (error) {
    console.warn(
      "⚠️  Failed to connect to soil database, will use external APIs:",
      error,
    );
  }
}

async function runSoilSql<T = any>(text: string, params: any[] = []) {
  if (!soilSql) throw new Error("Soil database not available");
  const rows = (await (soilSql as any)(text, params)) as T[];
  return { rows, rowCount: rows.length };
}

// Pool-shaped wrapper for compatibility with existing callers (.query, .connect).
export const soilPool = soilSql
  ? {
      query: runSoilSql,
      async connect() {
        return { query: runSoilSql, release: () => {} };
      },
      async end() {},
    }
  : null;

export { soilDb };

/**
 * Check if soil database is available
 */
export function isSoilDbAvailable(): boolean {
  return soilDb !== null;
}

/**
 * Execute raw SQL query on soil database.
 * Useful for PostGIS queries that aren't easily expressed in Drizzle.
 */
export async function executeSoilQuery<T = any>(
  text: string,
  params: any[] = [],
): Promise<T[]> {
  if (!soilSql) {
    throw new Error("Soil database not available");
  }
  return (await (soilSql as any)(text, params)) as T[];
}
