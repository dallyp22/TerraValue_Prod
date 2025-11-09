import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

async function setupTable(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  
  try {
    console.log('🔧 Creating parcel_aggregated table...\n');
    
    // Create table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS parcel_aggregated (
        id SERIAL PRIMARY KEY,
        normalized_owner TEXT NOT NULL,
        county TEXT NOT NULL,
        parcel_ids JSON,
        parcel_count INTEGER NOT NULL,
        total_acres REAL NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Table created');
    
    // Add PostGIS geometry column
    await pool.query(`
      SELECT AddGeometryColumn('parcel_aggregated', 'geom', 4326, 'MULTIPOLYGON', 2)
    `).catch(() => console.log('Geometry column already exists'));
    
    console.log('✅ Geometry column added');
    
    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS aggregated_owner_county_idx ON parcel_aggregated(normalized_owner, county)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS aggregated_county_idx ON parcel_aggregated(county)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS aggregated_owner_idx ON parcel_aggregated(normalized_owner)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS parcel_aggregated_geom_idx ON parcel_aggregated USING GIST(geom)`);
    
    console.log('✅ All indexes created');
    console.log('\n✅ parcel_aggregated table is ready!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

setupTable().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

