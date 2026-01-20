import { Pool } from '@neondatabase/serverless';
import NodeCache from 'node-cache';

// Cache tiles for 2 hours with size limits for better performance
const tileCache = new NodeCache({ 
  stdTTL: 7200,  // 2 hours instead of 1
  maxKeys: 10000,  // Limit number of cached tiles
  checkperiod: 600  // Check for expired keys every 10 minutes
});

/**
 * Generate a Mapbox Vector Tile (MVT) for parcels
 * Uses PostGIS ST_AsMVT for efficient tile generation
 */
export async function generateParcelTile(
  z: number,
  x: number,
  y: number,
  pool: Pool
): Promise<Buffer | null> {
  const cacheKey = `parcel-tile-${z}-${x}-${y}`;
  
  // Check cache first
  const cached = tileCache.get<Buffer>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    // Different zoom level strategies
    // Zoom 0-9: Show ownership groups (aggregated)
    // Zoom 10-13: Show ownership groups with more detail
    // Zoom 14+: Show individual parcels
    
    let sql: string;
    
    if (z <= 14) {
      // Show aggregated ADJACENT parcels up to zoom 14 (inclusive)
      // Uses parcel_aggregated table which only combines touching parcels
      // EXCLUDE Harrison County - it has its own Mapbox tileset
      sql = `
        WITH bbox AS (
          SELECT ST_TileEnvelope($1, $2, $3) AS geom
        ),
        mvtgeom AS (
          SELECT
            ST_AsMVTGeom(
              -- Aggressive simplification at low zooms for faster rendering
              CASE
                WHEN $1 <= 8 THEN ST_Simplify(geom_3857, 200)
                WHEN $1 <= 10 THEN ST_Simplify(geom_3857, 100)
                WHEN $1 <= 12 THEN ST_Simplify(geom_3857, 50)
                ELSE ST_Simplify(geom_3857, 10)
              END,
              bbox.geom,
              4096,
              256,
              true
            ) AS geom,
            id as cluster_id,  -- Include cluster ID for precise selection
            normalized_owner as owner,
            parcel_count,
            ROUND(total_acres::numeric, 1) as acres,
            county
          FROM parcel_aggregated, bbox
          WHERE geom_3857 && bbox.geom
            AND county != 'HARRISON'  -- Exclude Harrison County
            -- Progressive visibility filter based on zoom level
            AND (
              $1 > 10 OR  -- Show all parcels at zoom 11+
              ($1 > 8 AND total_acres > 5) OR  -- At zoom 9-10, show 5+ acre parcels
              total_acres > 20  -- At zoom 0-8, only show 20+ acre parcels
            )
        )
        SELECT ST_AsMVT(mvtgeom.*, 'ownership', 4096, 'geom')
        FROM mvtgeom
        WHERE geom IS NOT NULL
      `;
    } else {
      // Show individual parcels for high zoom levels
      // EXCLUDE Harrison County - it has its own Mapbox tileset
      sql = `
        WITH mvtgeom AS (
          SELECT 
            ST_AsMVTGeom(
              ST_Transform(geom, 3857),
              ST_TileEnvelope($1, $2, $3),
              4096,
              256,
              true
            ) AS geom,
            id,
            county_name as county,
            parcel_number,
            parcel_class as class,
            deed_holder as owner,
            deed_holder_normalized as owner_norm,
            ROUND((area_sqm / 4046.86)::numeric, 2) as acres
          FROM parcels
          WHERE ST_Transform(geom, 3857) && ST_TileEnvelope($1, $2, $3)
            AND county_name != 'HARRISON'  -- Exclude Harrison County
        )
        SELECT ST_AsMVT(mvtgeom.*, 'parcels', 4096, 'geom')
        FROM mvtgeom
        WHERE geom IS NOT NULL
      `;
    }
    
    const result = await pool.query(sql, [z, x, y]);
    
    if (result.rows.length > 0 && result.rows[0].st_asmvt) {
      const tile = result.rows[0].st_asmvt;
      
      // Cache the tile
      tileCache.set(cacheKey, tile);
      
      return tile;
    }
    
    return null;
  } catch (error) {
    console.error(`Error generating tile ${z}/${x}/${y}:`, error);
    return null;
  }
}

/**
 * Generate a hybrid MVT with both parcels and ownership layers
 * Useful for transitions between zoom levels
 */
export async function generateHybridTile(
  z: number,
  x: number,
  y: number,
  pool: Pool
): Promise<Buffer | null> {
  const cacheKey = `hybrid-tile-${z}-${x}-${y}`;
  
  // Check cache first
  const cached = tileCache.get<Buffer>(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    // Generate both layers and combine them
    const sql = `
      WITH parcel_mvt AS (
        SELECT 
          ST_AsMVTGeom(
            geom,
            ST_TileEnvelope($1, $2, $3),
            4096,
            256,
            true
          ) AS geom,
          id,
          county_name as county,
          parcel_number,
          deed_holder as owner,
          ROUND((area_sqm / 4046.86)::numeric, 2) as acres
        FROM parcels
        WHERE geom && ST_TileEnvelope($1, $2, $3)
      ),
      ownership_mvt AS (
        SELECT 
          ST_AsMVTGeom(
            geom,
            ST_TileEnvelope($1, $2, $3),
            4096,
            256,
            true
          ) AS geom,
          normalized_owner as owner,
          parcel_count,
          ROUND(total_acres::numeric, 1) as acres
        FROM parcel_aggregated
        WHERE geom && ST_TileEnvelope($1, $2, $3)
          AND parcel_count > 1
      )
      SELECT 
        (SELECT ST_AsMVT(parcel_mvt.*, 'parcels', 4096, 'geom') 
         FROM parcel_mvt WHERE geom IS NOT NULL) ||
        (SELECT ST_AsMVT(ownership_mvt.*, 'ownership', 4096, 'geom') 
         FROM ownership_mvt WHERE geom IS NOT NULL) as tile
    `;
    
    const result = await pool.query(sql, [z, x, y]);
    
    if (result.rows.length > 0 && result.rows[0].tile) {
      const tile = result.rows[0].tile;
      
      // Cache the tile
      tileCache.set(cacheKey, tile);
      
      return tile;
    }
    
    return null;
  } catch (error) {
    console.error(`Error generating hybrid tile ${z}/${x}/${y}:`, error);
    return null;
  }
}

/**
 * Clear the tile cache
 * Useful after data updates
 */
export function clearTileCache(): void {
  tileCache.flushAll();
  console.log('✅ Tile cache cleared');
}

/**
 * Get cache statistics
 */
export function getTileCacheStats(): {
  keys: number;
  hits: number;
  misses: number;
  ksize: number;
  vsize: number;
} {
  return tileCache.getStats();
}

