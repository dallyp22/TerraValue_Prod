// Quick test to show ownership layer data exists
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

// Sample one cluster from POLK
const sample = await pool.query(`
  SELECT 
    normalized_owner,
    county,
    parcel_count,
    total_acres,
    ST_AsText(ST_Envelope(geom)) as bbox
  FROM parcel_aggregated
  WHERE county = 'POLK'
  ORDER BY parcel_count DESC
  LIMIT 5
`);

console.log('Sample aggregated parcels from POLK County:\n');
sample.rows.forEach((row, idx) => {
  console.log(`${idx + 1}. ${row.normalized_owner}`);
  console.log(`   Parcels: ${row.parcel_count}`);
  console.log(`   Acres: ${row.total_acres}`);
  console.log(`   BBox: ${row.bbox}\n`);
});

await pool.end();

