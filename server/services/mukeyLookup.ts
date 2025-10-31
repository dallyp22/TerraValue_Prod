/**
 * Mukey Lookup Service
 * 
 * Query USDA Soil Data Access to get map unit keys (mukey) for coordinates
 * Used to bridge spatial queries to the local soil database
 */

import NodeCache from 'node-cache';

// Cache mukeys for 24 hours (soil mapping doesn't change)
const mukeyCache = new NodeCache({ stdTTL: 86400 });

const SDA_ENDPOINT = 'https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest';

/**
 * Get map unit key (mukey) for a point location
 */
export async function getMukeyForPoint(
  longitude: number,
  latitude: number
): Promise<string | null> {
  const cacheKey = `mukey:${longitude},${latitude}`;
  const cached = mukeyCache.get<string>(cacheKey);
  
  if (cached) {
    console.log(`✅ Mukey from cache for (${longitude}, ${latitude}): ${cached}`);
    return cached;
  }

  try {
    const wkt = `point(${longitude} ${latitude})`;
    const query = `SELECT TOP 1 mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${wkt}')`;
    
    const params = new URLSearchParams({ 
      query, 
      format: 'JSON' 
    });

    const response = await fetch(SDA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await response.json();
    
    if (!data.Table || data.Table.length === 0) {
      console.warn(`No mukey found for (${longitude}, ${latitude})`);
      return null;
    }

    // USDA SDA returns array of arrays (no header row)
    const mukey = data.Table[0][0];
    
    if (mukey) {
      console.log(`✅ Mukey from USDA SDA for (${longitude}, ${latitude}): ${mukey}`);
      mukeyCache.set(cacheKey, mukey);
      return mukey;
    }

    return null;
  } catch (error) {
    console.error('Mukey lookup error:', error);
    return null;
  }
}

/**
 * Get map unit keys for a polygon
 * Returns all mukeys that intersect with the polygon
 */
export async function getMukeysForPolygon(wkt: string): Promise<string[]> {
  const cacheKey = `mukeys:${Buffer.from(wkt).toString('base64').substring(0, 50)}`;
  const cached = mukeyCache.get<string[]>(cacheKey);
  
  if (cached) {
    console.log(`✅ Mukeys from cache: ${cached.length} found`);
    return cached;
  }

  try {
    const query = `SELECT DISTINCT mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${wkt}')`;
    
    const params = new URLSearchParams({ 
      query, 
      format: 'JSON' 
    });

    const response = await fetch(SDA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    const data = await response.json();
    
    if (!data.Table || data.Table.length === 0) {
      console.warn('No mukeys found for polygon');
      return [];
    }

    // Extract mukeys from response
    const mukeys = data.Table.map((row: any[]) => row[0]).filter((m: any) => m);
    
    console.log(`✅ Mukeys from USDA SDA: ${mukeys.length} found`);
    mukeyCache.set(cacheKey, mukeys);
    return mukeys;
  } catch (error) {
    console.error('Mukey polygon lookup error:', error);
    return [];
  }
}

export const mukeyLookupService = {
  getMukeyForPoint,
  getMukeysForPolygon,
};

