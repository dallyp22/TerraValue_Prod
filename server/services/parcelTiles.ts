import { Pool } from '@neondatabase/serverless';
import NodeCache from 'node-cache';

// Cache tiles for 1 hour
const tileCache = new NodeCache({ stdTTL: 3600 });

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
    
    if (z < 14) {
      // Show aggregated ADJACENT parcels for lower zoom levels (like Harrison County)
      // Uses parcel_aggregated table which only combines touching parcels
      sql = `
        WITH mvtgeom AS (
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
        SELECT ST_AsMVT(mvtgeom.*, 'ownership', 4096, 'geom')
        FROM mvtgeom
        WHERE geom IS NOT NULL
      `;
    } else {
      // Show individual parcels for high zoom levels
      sql = `
        WITH mvtgeom AS (
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
            parcel_class as class,
            deed_holder as owner,
            deed_holder_normalized as owner_norm,
            ROUND((area_sqm / 4046.86)::numeric, 2) as acres
          FROM parcels
          WHERE geom && ST_TileEnvelope($1, $2, $3)
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

