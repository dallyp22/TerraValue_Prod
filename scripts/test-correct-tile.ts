import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Des Moines center: -93.65, 41.59
// Calculate correct tile at zoom 11
function lonToTileX(lon: number, zoom: number): number {
  return Math.floor((lon + 180) / 360 * Math.pow(2, zoom));
}

function latToTileY(lat: number, zoom: number): number {
  const latRad = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * Math.pow(2, zoom));
}

const lon = -93.65;  // Des Moines
const lat = 41.59;
const z = 11;
const x = lonToTileX(lon, z);
const y = latToTileY(lat, z);

console.log(`Des Moines coordinates: ${lon}, ${lat}`);
console.log(`Correct tile at zoom ${z}: ${x}/${y}\n`);

async function testTile() {
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

  try {
    console.log('Executing tile generation query...');
    const result = await pool.query(sql, [z, x, y]);
    
    if (result.rows.length > 0 && result.rows[0].st_asmvt) {
      const tile = result.rows[0].st_asmvt;
      console.log(`✅ Tile generated! Size: ${tile.length} bytes`);
      
      if (tile.length > 0) {
        console.log('\n✅ SUCCESS: Tile contains parcel data!');
        console.log(`\nTest this in browser:`);
        console.log(`http://localhost:5001/api/parcels/tiles/${z}/${x}/${y}.mvt`);
      } else {
        console.log('\n⚠️  Tile is empty (0 bytes)');
      }
    } else {
      console.log('⚠️  No tile in result');
    }
    
    // Check parcel count
    const countSql = `
      SELECT COUNT(*) as count
      FROM parcel_aggregated
      WHERE ST_Transform(geom, 3857) && ST_TileEnvelope($1, $2, $3)
        AND county != 'HARRISON'
    `;
    const countResult = await pool.query(countSql, [z, x, y]);
    console.log(`\nParcels in tile area: ${countResult.rows[0].count}`);
    
    await pool.end();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

testTile();

