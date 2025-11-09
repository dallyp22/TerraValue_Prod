import { Pool } from '@neondatabase/serverless';
import { db } from '../db';
import { parcels, parcelOwnershipGroups } from '@shared/schema';
import { eq, sql, ilike, or } from 'drizzle-orm';

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching of owner names
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Normalize owner name for consistent matching
 */
export function normalizeOwnerName(name: string | null | undefined): string | null {
  if (!name) return null;
  
  return name
    .toUpperCase()
    // Remove common suffixes
    .replace(/\s+(LLC|L\.?L\.?C\.?|INC\.?|INCORPORATED|TRUST|ESTATE|REVOCABLE|IRREVOCABLE|FAMILY|FARMS?|PROPERTIES|CORP\.?|CORPORATION|LTD\.?|LIMITED|CO\.?)$/gi, '')
    // Flip "LASTNAME, FIRSTNAME" to "FIRSTNAME LASTNAME"
    .replace(/^([^,]+),\s*(.+)$/, '$2 $1')
    // Remove punctuation except spaces
    .replace(/[^\w\s]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find similar owner names using fuzzy matching
 */
export async function findSimilarOwners(ownerName: string, threshold = 3): Promise<string[]> {
  const normalized = normalizeOwnerName(ownerName);
  if (!normalized) return [];

  try {
    // Get all unique normalized owner names from database
    const result = await db
      .selectDistinct({ normalizedOwner: parcels.deedHolderNormalized })
      .from(parcels)
      .where(sql`${parcels.deedHolderNormalized} IS NOT NULL`);

    // Find names within Levenshtein distance threshold
    const similarNames = result
      .map((row) => row.normalizedOwner)
      .filter((dbName): dbName is string => {
        if (!dbName) return false;
        const distance = levenshteinDistance(normalized, dbName);
        return distance > 0 && distance <= threshold;
      });

    return similarNames;
  } catch (error) {
    console.error('Error finding similar owners:', error);
    return [];
  }
}

/**
 * Get all parcels for a specific owner (exact match on normalized name)
 */
export async function getParcelsByOwner(normalizedOwner: string): Promise<any[]> {
  try {
    const result = await db
      .select()
      .from(parcels)
      .where(eq(parcels.deedHolderNormalized, normalizedOwner));

    return result;
  } catch (error) {
    console.error('Error getting parcels by owner:', error);
    return [];
  }
}

/**
 * Get ownership statistics for a specific owner
 */
export async function getOwnershipStats(normalizedOwner: string): Promise<{
  owner: string;
  parcelCount: number;
  totalAcres: number;
  counties: string[];
  parcels: any[];
} | null> {
  try {
    const parcelList = await getParcelsByOwner(normalizedOwner);
    
    if (parcelList.length === 0) return null;

    // Calculate total acres (convert square meters to acres: 1 acre = 4046.86 m²)
    const totalAcres = parcelList.reduce((sum, p) => {
      return sum + (p.areaSqm ? p.areaSqm / 4046.86 : 0);
    }, 0);

    // Get unique counties
    const counties = [...new Set(
      parcelList
        .map(p => p.countyName)
        .filter((c): c is string => c !== null && c !== undefined)
    )].sort();

    return {
      owner: normalizedOwner,
      parcelCount: parcelList.length,
      totalAcres: Math.round(totalAcres * 10) / 10, // Round to 1 decimal
      counties,
      parcels: parcelList,
    };
  } catch (error) {
    console.error('Error getting ownership stats:', error);
    return null;
  }
}

/**
 * Search for owners by name (supports partial matching)
 */
export async function searchOwners(query: string, limit = 50): Promise<Array<{
  normalizedOwner: string;
  originalName: string;
  parcelCount: number;
}>> {
  if (!query || query.trim().length === 0) return [];

  try {
    const searchTerm = normalizeOwnerName(query);
    if (!searchTerm) return [];

    // Search for owners with similar names
    const result = await db.execute(sql`
      SELECT 
        deed_holder_normalized as normalized_owner,
        deed_holder as original_name,
        COUNT(*) as parcel_count
      FROM parcels
      WHERE deed_holder_normalized ILIKE ${`%${searchTerm}%`}
        AND deed_holder_normalized IS NOT NULL
      GROUP BY deed_holder_normalized, deed_holder
      ORDER BY COUNT(*) DESC
      LIMIT ${limit}
    `);

    return (result.rows as any[]).map(row => ({
      normalizedOwner: row.normalized_owner,
      originalName: row.original_name,
      parcelCount: parseInt(row.parcel_count),
    }));
  } catch (error) {
    console.error('Error searching owners:', error);
    return [];
  }
}

/**
 * Get top landowners by total acreage
 */
export async function getTopLandowners(limit = 100): Promise<Array<{
  normalizedOwner: string;
  parcelCount: number;
  totalAcres: number;
  counties: string[];
}>> {
  try {
    const result = await db.execute(sql`
      SELECT 
        deed_holder_normalized as normalized_owner,
        COUNT(*) as parcel_count,
        SUM(area_sqm) / 4046.86 as total_acres,
        ARRAY_AGG(DISTINCT county_name) as counties
      FROM parcels
      WHERE deed_holder_normalized IS NOT NULL
        AND area_sqm IS NOT NULL
      GROUP BY deed_holder_normalized
      ORDER BY total_acres DESC
      LIMIT ${limit}
    `);

    return (result.rows as any[]).map(row => ({
      normalizedOwner: row.normalized_owner,
      parcelCount: parseInt(row.parcel_count),
      totalAcres: Math.round(parseFloat(row.total_acres) * 10) / 10,
      counties: row.counties.filter((c: string) => c !== null),
    }));
  } catch (error) {
    console.error('Error getting top landowners:', error);
    return [];
  }
}

/**
 * Aggregate parcels by owner and store in parcel_ownership_groups table
 * This creates combined geometries for all parcels owned by the same entity
 */
export async function aggregateOwnershipData(pool: Pool): Promise<void> {
  console.log('🔄 Aggregating ownership data...');
  
  try {
    // Clear existing ownership groups
    await pool.query('TRUNCATE TABLE parcel_ownership_groups');
    
    // Aggregate parcels by owner using PostGIS ST_Union
    const aggregateSQL = `
      INSERT INTO parcel_ownership_groups (
        normalized_owner, parcel_count, total_acres, parcel_ids, combined_geom
      )
      SELECT 
        deed_holder_normalized,
        COUNT(*) as parcel_count,
        SUM(area_sqm) / 4046.86 as total_acres,
        ARRAY_AGG(id) as parcel_ids,
        ST_Union(geom) as combined_geom
      FROM parcels
      WHERE deed_holder_normalized IS NOT NULL
        AND geom IS NOT NULL
      GROUP BY deed_holder_normalized
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `;
    
    const result = await pool.query(aggregateSQL);
    const rowCount = result.rowCount || 0;
    
    console.log(`✅ Created ${rowCount.toLocaleString()} ownership groups`);
    
    // Get statistics
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_groups,
        SUM(parcel_count) as total_parcels,
        SUM(total_acres) as total_acres,
        MAX(parcel_count) as max_parcels,
        AVG(parcel_count) as avg_parcels
      FROM parcel_ownership_groups
    `);
    
    if (statsResult.rows.length > 0) {
      const stats = statsResult.rows[0];
      console.log('\n📊 Ownership Aggregation Statistics:');
      console.log(`   Total ownership groups: ${parseInt(stats.total_groups).toLocaleString()}`);
      console.log(`   Total parcels in groups: ${parseInt(stats.total_parcels).toLocaleString()}`);
      console.log(`   Total acres in groups: ${parseFloat(stats.total_acres).toLocaleString()}`);
      console.log(`   Largest owner (parcels): ${parseInt(stats.max_parcels).toLocaleString()}`);
      console.log(`   Average parcels per owner: ${parseFloat(stats.avg_parcels).toFixed(1)}`);
    }
    
    // Show top 10 owners
    const topOwnersResult = await pool.query(`
      SELECT normalized_owner, parcel_count, total_acres
      FROM parcel_ownership_groups
      ORDER BY total_acres DESC
      LIMIT 10
    `);
    
    console.log('\n🏆 Top 10 Landowners by Acreage:');
    topOwnersResult.rows.forEach((row: any, idx: number) => {
      console.log(`   ${idx + 1}. ${row.normalized_owner}`);
      console.log(`      ${parseInt(row.parcel_count)} parcels | ${parseFloat(row.total_acres).toFixed(1)} acres`);
    });
    
  } catch (error) {
    console.error('❌ Error aggregating ownership data:', error);
    throw error;
  }
}

/**
 * Find parcels at a specific point (latitude, longitude)
 */
export async function findParcelsAtPoint(
  longitude: number,
  latitude: number,
  pool: Pool
): Promise<any[]> {
  try {
    const result = await pool.query(`
      SELECT 
        id, county_name, parcel_number, parcel_class,
        deed_holder, area_sqm / 4046.86 as acres,
        ST_AsGeoJSON(geom) as geometry
      FROM parcels
      WHERE ST_Intersects(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
      LIMIT 10
    `, [longitude, latitude]);
    
    return result.rows.map((row: any) => ({
      ...row,
      acres: parseFloat(row.acres).toFixed(2),
      geometry: JSON.parse(row.geometry),
    }));
  } catch (error) {
    console.error('Error finding parcels at point:', error);
    return [];
  }
}

/**
 * Get parcels within a bounding box
 */
export async function getParcelsInBounds(
  minLng: number,
  minLat: number,
  maxLng: number,
  maxLat: number,
  pool: Pool,
  limit = 1000
): Promise<any[]> {
  try {
    const result = await pool.query(`
      SELECT 
        id, county_name, parcel_number, parcel_class,
        deed_holder, deed_holder_normalized, area_sqm / 4046.86 as acres,
        ST_AsGeoJSON(geom) as geometry
      FROM parcels
      WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      LIMIT $5
    `, [minLng, minLat, maxLng, maxLat, limit]);
    
    return result.rows.map((row: any) => ({
      ...row,
      acres: parseFloat(row.acres).toFixed(2),
      geometry: JSON.parse(row.geometry),
    }));
  } catch (error) {
    console.error('Error getting parcels in bounds:', error);
    return [];
  }
}

