import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

// Check POLK County aggregated data
const polkData = await pool.query(`
  SELECT COUNT(*) as count FROM parcel_aggregated WHERE county = 'POLK'
`);
console.log('POLK aggregated clusters:', polkData.rows[0].count);

// Check raw POLK parcels
const rawPolk = await pool.query(`
  SELECT COUNT(*) as count FROM parcels WHERE county_name = 'POLK' AND geom IS NOT NULL
`);
console.log('POLK raw parcels:', rawPolk.rows[0].count);

// Test tile generation for Des Moines area (POLK County)
// Tile coordinates for Des Moines at zoom 14
const tileTest = await pool.query(`
  SELECT COUNT(*) as parcel_count
  FROM parcels
  WHERE geom && ST_TileEnvelope(14, 3932, 6106)
    AND county_name = 'POLK'
`);
console.log('Parcels in Des Moines tile (14/3932/6106):', tileTest.rows[0].parcel_count);

// Test aggregated tile
const aggTileTest = await pool.query(`
  SELECT COUNT(*) as cluster_count
  FROM parcel_aggregated
  WHERE geom && ST_TileEnvelope(13, 1966, 3053)
    AND county = 'POLK'
`);
console.log('Aggregated clusters in POLK tile (13/1966/3053):', aggTileTest.rows[0].cluster_count);

await pool.end();
