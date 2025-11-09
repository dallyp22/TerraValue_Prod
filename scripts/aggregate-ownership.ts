import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';
import { aggregateOwnershipData } from '../server/services/parcelOwnership';

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

/**
 * Script to aggregate parcel ownership data
 * Creates combined geometries for all parcels owned by the same entity
 */
async function main(): Promise<void> {
  console.log('🏡 Parcel Ownership Aggregation');
  console.log('================================\n');
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    await aggregateOwnershipData(pool);
    console.log('\n✅ Ownership aggregation complete!');
  } catch (error) {
    console.error('\n❌ Error aggregating ownership data:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

