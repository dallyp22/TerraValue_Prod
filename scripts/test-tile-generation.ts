import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Test tile generation query for Des Moines area
const z = 11;
const x = 494;
const y = 791;

console.log(`Testing tile generation for zoom ${z}, tile ${x}/${y}`);
console.log('(This tile should cover Des Moines/POLK County area)\n');

const sql = `
  WITH mvtgeom AS (
    SELECT 
      ST_AsMVTGeom(
        ST_Transform(geom, 3857),
        ST_TileEnvelope($1, $2, $3),
        4096,
        256,
        true
      ) AS geom,
      normalized_owner as owner,
      parcel_count,
      ROUND(total_acres::numeric, 1) as acres,
      county
    FROM parcel_aggregated
    WHERE ST_Transform(geom, 3857) && ST_TileEnvelope($1, $2, $3)
      AND county != 'HARRISON'
  )
  SELECT ST_AsMVT(mvtgeom.*, 'ownership', 4096, 'geom')
  FROM mvtgeom
  WHERE geom IS NOT NULL
`;

async function testTile() {
  try {
    const result = await pool.query(sql, [z, x, y]);
    console.log('Query executed successfully');
    console.log('Result rows:', result.rows.length);
    
    if (result.rows.length > 0 && result.rows[0].st_asmvt) {
      const tile = result.rows[0].st_asmvt;
      console.log('✅ Tile generated!');
      console.log('Tile size:', tile.length, 'bytes');
      
      if (tile.length > 0) {
        console.log('\n✅ SUCCESS: Tile contains data!');
      } else {
        console.log('\n⚠️  Tile generated but empty');
      }
    } else {
      console.log('⚠️  No tile data in result');
      console.log('This could mean:');
      console.log('  1. No parcels in this tile area');
      console.log('  2. Geometry transformation issue');
      console.log('  3. Tile envelope calculation problem');
    }
    
    // Also check if there's ANY data in the area
    console.log('\nChecking for parcels in this area...');
    const checkSql = `
      SELECT COUNT(*) as count
      FROM parcel_aggregated
      WHERE ST_Transform(geom, 3857) && ST_TileEnvelope($1, $2, $3)
        AND county != 'HARRISON'
    `;
    const checkResult = await pool.query(checkSql, [z, x, y]);
    console.log(`Found ${checkResult.rows[0].count} parcels in tile area`);
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

testTile();

