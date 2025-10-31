import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as soilSchema from "@shared/soil-schema";

// Soil database is optional - used for faster CSR2 queries
// Falls back to external APIs if not configured
let soilPool: Pool | null = null;
let soilDb: ReturnType<typeof drizzle> | null = null;

if (process.env.DATABASE_URL_SOIL) {
  try {
    soilPool = new Pool({ 
      connectionString: process.env.DATABASE_URL_SOIL,
      // Standard PostgreSQL connection settings
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
    });
    soilDb = drizzle(soilPool, { schema: soilSchema });
    console.log('✅ Connected to soil database');
  } catch (error) {
    console.warn('⚠️  Failed to connect to soil database, will use external APIs:', error);
  }
}

export { soilPool, soilDb };

/**
 * Check if soil database is available
 */
export function isSoilDbAvailable(): boolean {
  return soilDb !== null;
}

/**
 * Execute raw SQL query on soil database
 * Useful for PostGIS queries that aren't easily expressed in Drizzle
 */
export async function executeSoilQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  if (!soilPool) {
    throw new Error('Soil database not available');
  }
  
  const client = await soilPool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

