import axios from 'axios';
import NodeCache from 'node-cache';
import pLimit from 'p-limit';

// Cache for 1 hour (3600 seconds)
const cache = new NodeCache({ stdTTL: 3600 });

// Rate limiting - be courteous to the public server
const limit = pLimit(3);

// Iowa CSR2 raster endpoint (Public API - No authentication required)
const CSR2_ENDPOINT = "https://enterprise.rsgis.msu.edu/imageserver/rest/services/Iowa_Corn_Suitability_Rating/ImageServer";

// Service health tracking
let msuServiceStatus: {
  lastSuccess: Date | null;
  lastFailure: Date | null;
  consecutiveFailures: number;
  requiresAuth: boolean;
} = {
  lastSuccess: null,
  lastFailure: null,
  consecutiveFailures: 0,
  requiresAuth: false
};

export interface CSR2Stats {
  mean: number | null;
  min: number | null;
  max: number | null;
  count: number;
}

export interface FieldData {
  fieldId: string;
  acres: number;
  wkt: string;
}

/**
 * Get CSR2 value for a specific point using Michigan State ImageServer
 * This is the direct raster query approach that was working previously
 */
export async function csr2PointValue(longitude: number, latitude: number): Promise<number | null> {
  const cacheKey = `point:${longitude},${latitude}`;
  const cached = cache.get<number | null>(cacheKey);
  
  if (cached !== undefined) {
    return cached;
  }

  try {
    // Try Michigan State ImageServer first (original working approach)
    // Skip if we've detected auth requirements or too many failures
    if (!msuServiceStatus.requiresAuth && msuServiceStatus.consecutiveFailures < 10) {
      try {
        const response = await axios.get(`${CSR2_ENDPOINT}/identify`, {
          params: {
            f: 'json',
            geometry: `${longitude},${latitude}`,
            geometryType: 'esriGeometryPoint',
            sr: 4326,
            returnGeometry: false
          },
          headers: {
            'User-Agent': 'TerraValue/1.0 (Agricultural Land Valuation Tool)'
          },
          timeout: 10000,
          validateStatus: (status) => status < 500 // Don't throw on 4xx errors
        });

        // Detect authentication requirements (401/403)
        if (response.status === 401 || response.status === 403) {
          msuServiceStatus.requiresAuth = true;
          msuServiceStatus.consecutiveFailures++;
          msuServiceStatus.lastFailure = new Date();
          console.warn('⚠️ MSU CSR2 service now requires authentication (status ' + response.status + ')');
          throw new Error('MSU service requires authentication');
        }

        // Detect other errors
        if (response.status >= 400) {
          throw new Error(`MSU service returned status ${response.status}`);
        }

        const value = response.data?.value;
        
        if (value && value !== "NoData" && value !== -128) {
          const csr2Value = typeof value === 'string' ? parseFloat(value) : value;
          
          if (!isNaN(csr2Value)) {
            const result = Number(csr2Value.toFixed(1));
            console.log(`✅ CSR2 from MSU ImageServer for (${longitude}, ${latitude}): ${result}`);
            
            // Track success
            msuServiceStatus.lastSuccess = new Date();
            msuServiceStatus.consecutiveFailures = 0;
            
            cache.set(cacheKey, result);
            return result;
          }
        }
      } catch (msuError: any) {
        // Track failures
        msuServiceStatus.consecutiveFailures++;
        msuServiceStatus.lastFailure = new Date();
        
        // Log specific error types
        if (msuError.response?.status === 401 || msuError.response?.status === 403) {
          msuServiceStatus.requiresAuth = true;
          console.warn('⚠️ MSU CSR2 service authentication required - switching to USDA fallback');
        } else if (msuError.code === 'ECONNABORTED' || msuError.code === 'ETIMEDOUT') {
          console.log('⏱️ MSU ImageServer timeout, falling back to USDA...');
        } else if (msuError.response?.status >= 500) {
          console.log('🔴 MSU ImageServer server error, falling back to USDA...');
        } else {
          console.log('⚠️ MSU ImageServer unavailable, falling back to USDA...');
        }
        
        // If too many failures, skip MSU for a while
        if (msuServiceStatus.consecutiveFailures >= 10) {
          console.warn('⚠️ MSU service has failed 10+ times consecutively - temporarily disabled');
        }
      }
    } else {
      if (msuServiceStatus.requiresAuth) {
        console.log('ℹ️ MSU service requires auth, using USDA fallback...');
      } else {
        console.log('ℹ️ MSU service temporarily disabled due to failures, using USDA fallback...');
      }
    }

    // Fallback to USDA Soil Data Access Interpretation Service
    // Step 1: Get mukey for the point
    const wkt = `point(${longitude} ${latitude})`;
    const mukeyQuery = `SELECT TOP 1 mukey FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${wkt}')`;
    const mukeyParams = new URLSearchParams({ query: mukeyQuery, format: 'JSON' });

    const mukeyResponse = await fetch('https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: mukeyParams.toString()
    });

    const mukeyData = await mukeyResponse.json();
    if (!mukeyData.Table || mukeyData.Table.length === 0) {
      cache.set(cacheKey, null);
      return null;
    }

    const mukey = mukeyData.Table[0][0];

    // Step 2: Create AOI with the mapunit key
    const aoiParams = new URLSearchParams({ SERVICE: 'aoi', REQUEST: 'create', MUKEYLIST: mukey });
    const aoiResponse = await fetch('https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: aoiParams.toString()
    });

    const aoiData = await aoiResponse.json();
    if (!aoiData.id) {
      cache.set(cacheKey, null);
      return null;
    }

    const aoiId = aoiData.id;

    // Step 3: Run CSR2 interpretation (attributekey 189 = Iowa Corn Suitability Rating CSR2)
    const ratingParams = new URLSearchParams({
      SERVICE: 'interpretation',
      REQUEST: 'getrating',
      AOIID: aoiId.toString(),
      ATTRIBUTEKEY: '189'
    });

    const ratingResponse = await fetch('https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: ratingParams.toString()
    });

    const ratingData = await ratingResponse.json();
    const interpResultId = ratingData.interpresultid;

    if (!interpResultId) {
      cache.set(cacheKey, null);
      return null;
    }

    // Step 4: Query WFS to get the CSR2 rating value
    const bbox = `${longitude - 0.01},${latitude - 0.01},${longitude + 0.01},${latitude + 0.01}`;
    const wfsUrl = `https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDMWGS84Geographic.wfs?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature&TYPENAME=mapunitpolythematic&INTERPRESULTID=${interpResultId}&BBOX=${bbox}&SRSNAME=EPSG:4326&OUTPUTFORMAT=GML2&MAXFEATURES=1`;
    
    const wfsResponse = await fetch(wfsUrl);
    const gmlText = await wfsResponse.text();
    
    // Parse MapUnitRatingNumeric from GML
    const ratingMatch = gmlText.match(/<ms:MapUnitRatingNumeric>([\d.]+)<\/ms:MapUnitRatingNumeric>/);
    
    if (!ratingMatch) {
      cache.set(cacheKey, null);
      return null;
    }

    const csr2Value = parseFloat(ratingMatch[1]);
    const result = Number(csr2Value.toFixed(1));
    console.log(`✅ CSR2 from USDA for (${longitude}, ${latitude}): ${result}`);
    cache.set(cacheKey, result);
    return result;

  } catch (error) {
    console.error('CSR2 point analysis error:', error);
    return null;
  }
}

/**
 * Get CSR2 mean value for a polygon using point sampling method
 * This samples multiple points within the polygon to estimate the mean
 */
export async function csr2PolygonMean(wkt: string): Promise<number | null> {
  const cacheKey = Buffer.from(wkt).toString('base64');
  const cached = cache.get<number | null>(cacheKey);
  
  if (cached !== undefined) {
    return cached;
  }

  try {
    // Extract coordinates from WKT polygon
    const coordsMatch = /POLYGON\(\((.*)\)\)/.exec(wkt);
    if (!coordsMatch) {
      throw new Error('Invalid WKT polygon format');
    }

    const coords = coordsMatch[1];
    const points = coords.split(",").map((p) => {
      const [x, y] = p.trim().split(" ").map(Number);
      return [x, y];
    });
    
    // Calculate bounding box
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Generate sample points within the polygon bounds
    const samplePoints: [number, number][] = [];
    const gridSize = 5; // 5x5 grid of sample points
    
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const x = minX + (maxX - minX) * (i + 0.5) / gridSize;
        const y = minY + (maxY - minY) * (j + 0.5) / gridSize;
        samplePoints.push([x, y]);
      }
    }

    // Sample CSR2 values at multiple points
    const samplePromises = samplePoints.map(([x, y]) => csr2PointValue(x, y));
    const sampleValues = await Promise.all(samplePromises);
    
    // Filter out null values and calculate mean
    const validValues = sampleValues.filter((v): v is number => v !== null);
    
    if (!validValues.length) {
      cache.set(cacheKey, null);
      return null;
    }

    const mean = validValues.reduce((a, b) => a + b) / validValues.length;
    const result = Number(mean.toFixed(1));
    
    cache.set(cacheKey, result);
    return result;

  } catch (error) {
    console.error('CSR2 polygon sampling error:', error);
    return null;
  }
}

/**
 * Fetch CSR2 statistics for a given Well-Known Text geometry
 * Handles both POINT and POLYGON formats
 */
export async function getCsr2PolygonStats(wkt: string): Promise<CSR2Stats> {
  return limit(async () => {
    try {
      // Check if WKT is a POINT
      const pointMatch = /POINT\(([-\d.]+)\s+([-\d.]+)\)/.exec(wkt);
      if (pointMatch) {
        // Handle single point query
        const x = parseFloat(pointMatch[1]);
        const y = parseFloat(pointMatch[2]);
        
        const value = await csr2PointValue(x, y);
        
        if (value === null) {
          return {
            mean: null,
            min: null,
            max: null,
            count: 0
          };
        }
        
        return {
          mean: Number(value.toFixed(1)),
          min: Math.round(value),
          max: Math.round(value),
          count: 1
        };
      }
      
      // Handle POLYGON format (existing code)
      const coordsMatch = /POLYGON\(\((.*)\)\)/.exec(wkt);
      if (!coordsMatch) {
        throw new Error('Invalid WKT format - must be POINT or POLYGON');
      }

      const coords = coordsMatch[1];
      const points = coords.split(",").map((p) => {
        const [x, y] = p.trim().split(" ").map(Number);
        return [x, y];
      });
      
      // Calculate bounding box
      const xs = points.map((p) => p[0]);
      const ys = points.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);

      // Generate sample points within the polygon bounds
      const samplePoints: [number, number][] = [];
      const gridSize = 5; // 5x5 grid of sample points
      
      for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
          const x = minX + (maxX - minX) * (i + 0.5) / gridSize;
          const y = minY + (maxY - minY) * (j + 0.5) / gridSize;
          samplePoints.push([x, y]);
        }
      }

      // Sample CSR2 values at multiple points
      const samplePromises = samplePoints.map(([x, y]) => csr2PointValue(x, y));
      const sampleValues = await Promise.all(samplePromises);
      
      // Filter out null values
      const validValues = sampleValues.filter((v): v is number => v !== null);
      
      if (!validValues.length) {
        return {
          mean: null,
          min: null,
          max: null,
          count: 0
        };
      }

      // Calculate statistics
      const mean = validValues.reduce((a, b) => a + b) / validValues.length;
      const min = Math.min(...validValues);
      const max = Math.max(...validValues);

      return {
        mean: Number(mean.toFixed(1)),
        min: Math.round(min),
        max: Math.round(max),
        count: validValues.length
      };

    } catch (error) {
      console.error('CSR2 polygon stats error:', error);
      return {
        mean: null,
        min: null,
        max: null,
        count: 0
      };
    }
  });
}

/**
 * Geocode an address to coordinates
 */
export async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  try {
    // Using OpenStreetMap Nominatim as free geocoding service
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: address,
        format: 'json',
        limit: 1,
        countrycodes: 'us'
      },
      headers: {
        'User-Agent': 'LandIQ-Agricultural-Valuation/1.0'
      },
      timeout: 5000
    });

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon)
      };
    }

    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Reverse geocode coordinates to get county and state
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<{ county: string; state: string } | null> {
  try {
    // Using OpenStreetMap Nominatim for reverse geocoding
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        lat: latitude,
        lon: longitude,
        format: 'json',
        addressdetails: 1,
        zoom: 10 // County level detail
      },
      headers: {
        'User-Agent': 'LandIQ-Agricultural-Valuation/1.0'
      },
      timeout: 5000
    });

    if (response.data && response.data.address) {
      const address = response.data.address;
      
      // Extract county name, removing "County" suffix if present
      let county = address.county || '';
      if (county.toLowerCase().endsWith(' county')) {
        county = county.substring(0, county.length - 7);
      }
      
      // Get state abbreviation or full name
      const state = address.state || '';
      
      if (county && state) {
        return { county, state };
      }
    }

    return null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

/**
 * Create a circular polygon around a point for CSR2 sampling
 */
export function createCircularPolygon(lat: number, lon: number, radiusMeters: number = 500): string {
  const points: [number, number][] = [];
  const earthRadius = 6378137; // meters
  
  for (let i = 0; i <= 32; i++) {
    const angle = (i / 32) * 2 * Math.PI;
    const dx = radiusMeters * Math.cos(angle);
    const dy = radiusMeters * Math.sin(angle);
    
    const newLat = lat + (dy / earthRadius) * (180 / Math.PI);
    const newLon = lon + (dx / earthRadius) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);
    
    points.push([newLon, newLat]);
  }
  
  // Close the polygon
  points.push(points[0]);
  
  const coordinates = points.map(p => `${p[0]} ${p[1]}`).join(',');
  return `POLYGON((${coordinates}))`;
}

/**
 * Get average CSR2 value from multiple points (for multi-point selections)
 */
export async function csr2MultiPointAverage(points: Array<{longitude: number, latitude: number}>): Promise<CSR2Stats> {
  if (points.length === 0) {
    return { mean: null, min: null, max: null, count: 0 };
  }

  const validValues: number[] = [];
  
  // Get CSR2 values for all points
  for (const point of points) {
    try {
      const value = await csr2PointValue(point.longitude, point.latitude);
      if (value !== null && value > 0) {
        validValues.push(value);
      }
    } catch (error) {
      console.warn(`Failed to get CSR2 for point ${point.longitude},${point.latitude}:`, error);
    }
  }

  if (validValues.length === 0) {
    return { mean: null, min: null, max: null, count: 0 };
  }

  const mean = validValues.reduce((sum, val) => sum + val, 0) / validValues.length;
  const min = Math.min(...validValues);
  const max = Math.max(...validValues);

  return {
    mean: Math.round(mean * 10) / 10, // Round to 1 decimal place
    min: Math.round(min),
    max: Math.round(max),
    count: validValues.length
  };
}

/**
 * Calculate CSR2-based land value using Iowa methodology
 * Formula: Estimated Value per Acre = (Average Farmland Price per Acre) / (Average CSR2) × Property CSR2
 */
export function calculateCSR2Value(
  propertyCSR2: number,
  countyAveragePricePerAcre: number,
  countyAverageCSR2: number = 65 // Iowa statewide average is approximately 65
): number {
  if (propertyCSR2 <= 0 || countyAveragePricePerAcre <= 0 || countyAverageCSR2 <= 0) {
    return 0;
  }

  // Calculate dollar per CSR2 point for the county
  const dollarPerCSR2Point = countyAveragePricePerAcre / countyAverageCSR2;
  
  // Apply to property's CSR2 rating
  const estimatedValuePerAcre = dollarPerCSR2Point * propertyCSR2;
  
  return Math.round(estimatedValuePerAcre * 100) / 100; // Round to 2 decimal places
}

/**
 * Get non-tillable land type multiplier
 */
export function getNonTillableMultiplier(landType?: "CRP" | "Timber" | "Other"): number {
  switch (landType) {
    case "CRP":
      return 0.65; // 65% of base value
    case "Timber":
      return 0.55; // 55% of base value
    case "Other":
      return 0.20; // 20% of base value
    default:
      return 1.0; // Default to full base value if no type specified
  }
}

/**
 * Calculate blended land value for tillable vs non-tillable acres
 * Uses CSR2 value for tillable acres and adjusted base value for non-tillable acres
 */
export function calculateBlendedLandValue(
  totalAcres: number,
  tillableAcres: number,
  propertyCSR2: number,
  countyBaseValue: number,
  countyAverageCSR2: number = 65,
  nonTillableType?: "CRP" | "Timber" | "Other"
): {
  tillableValue: number;
  nonTillableValue: number;
  blendedValue: number;
  totalPropertyValue: number;
  nonTillableMultiplier: number;
} {
  const nonTillableAcres = totalAcres - tillableAcres;
  
  // Calculate CSR2 value for tillable acres using standardized rate
  const tillableValuePerAcre = propertyCSR2 * 174; // Use standardized $174/point rate for consistency
  
  // Calculate non-tillable value based on land type
  const nonTillableMultiplier = getNonTillableMultiplier(nonTillableType);
  const nonTillableValuePerAcre = countyBaseValue * nonTillableMultiplier;
  
  // Calculate total values
  const tillableValue = tillableValuePerAcre * tillableAcres;
  const nonTillableValue = nonTillableValuePerAcre * nonTillableAcres;
  const totalPropertyValue = tillableValue + nonTillableValue;
  
  // Calculate blended per-acre value
  const blendedValue = totalPropertyValue / totalAcres;
  
  return {
    tillableValue: Math.round(tillableValuePerAcre * 100) / 100,
    nonTillableValue: Math.round(nonTillableValuePerAcre * 100) / 100,
    blendedValue: Math.round(blendedValue * 100) / 100,
    totalPropertyValue: Math.round(totalPropertyValue * 100) / 100,
    nonTillableMultiplier: Math.round(nonTillableMultiplier * 100) / 100
  };
}

/**
 * Calculate average CSR2 for a custom polygon using USDA Soil Data Access API
 */
export async function calculateAverageCSR2(polygon: any): Promise<CSR2Stats> {
  // Convert GeoJSON polygon to WKT manually
  const coordinates = polygon.coordinates[0]; // First ring of polygon
  const coordPairs = coordinates.map((coord: [number, number]) => `${coord[0]} ${coord[1]}`).join(', ');
  const wkt = `POLYGON((${coordPairs}))`;

  const sql = `
    SELECT 
      m.mukey,
      m.muname,
      c.comppct_r AS component_percent,
      cri.interplr AS csr2_rating
    FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${wkt}') AS p
    INNER JOIN mapunit m ON p.mukey = m.mukey
    INNER JOIN component c ON m.mukey = c.mukey
    LEFT JOIN cointerp cri ON c.cokey = cri.cokey
    WHERE cri.mrulename = 'Iowa Corn Suitability Rating'
      AND c.comppct_r > 0
    ORDER BY m.mukey, c.comppct_r DESC
  `;

  try {
    const params = new URLSearchParams({
      query: sql,
      format: 'JSON'
    });

    const response = await fetch('https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();
    if (!data.Table || data.Table.length === 0) {
      throw new Error('No CSR2 data found for polygon');
    }

    // Parse response - first row is column names, subsequent rows are data
    const columns = data.Table[0];
    const rows = data.Table.slice(1);
    
    if (rows.length === 0) {
      throw new Error('No CSR2 data found for polygon');
    }

    // Group by map unit and calculate weighted CSR2 for each
    const mapUnits: { [key: string]: { weights: number[]; values: number[] } } = {};
    
    rows.forEach((row: any[]) => {
      const rowData: any = {};
      columns.forEach((col: string, idx: number) => {
        rowData[col] = row[idx];
      });

      const mukey = rowData.mukey;
      const percent = parseFloat(rowData.component_percent) || 0;
      const csr2 = parseFloat(rowData.csr2_rating) || 0;

      if (!mapUnits[mukey]) {
        mapUnits[mukey] = { weights: [], values: [] };
      }

      mapUnits[mukey].weights.push(percent);
      mapUnits[mukey].values.push(csr2);
    });

    // Calculate weighted average for each map unit, then overall average
    const mapUnitCSR2s: number[] = [];
    
    Object.values(mapUnits).forEach(mu => {
      let totalWeight = 0;
      let weightedSum = 0;

      mu.weights.forEach((weight, idx) => {
        weightedSum += weight * mu.values[idx];
        totalWeight += weight;
      });

      if (totalWeight > 0) {
        mapUnitCSR2s.push(weightedSum / totalWeight);
      }
    });

    if (mapUnitCSR2s.length === 0) {
      throw new Error('No valid CSR2 values found');
    }

    const avgCSR2 = mapUnitCSR2s.reduce((a, b) => a + b, 0) / mapUnitCSR2s.length;
    const minCSR2 = Math.min(...mapUnitCSR2s);
    const maxCSR2 = Math.max(...mapUnitCSR2s);
    const count = mapUnitCSR2s.length;

    return {
      mean: Number(avgCSR2.toFixed(1)),
      min: Math.round(minCSR2),
      max: Math.round(maxCSR2),
      count: count
    };
  } catch (error) {
    console.error('USDA CSR2 query failed, falling back to polygon sampling:', error);
    
    // Fallback to using getCsr2PolygonStats for full statistics
    const stats = await getCsr2PolygonStats(wkt);
    if (stats.mean === null) {
      throw new Error('Failed to calculate CSR2 statistics using fallback method');
    }
    return stats;
  }
}

/**
 * Get MSU service health status
 * Useful for monitoring and debugging
 */
export function getMSUServiceStatus() {
  return {
    ...msuServiceStatus,
    lastSuccess: msuServiceStatus.lastSuccess?.toISOString() || null,
    lastFailure: msuServiceStatus.lastFailure?.toISOString() || null,
    isHealthy: msuServiceStatus.consecutiveFailures < 10 && !msuServiceStatus.requiresAuth
  };
}

/**
 * Reset MSU service status (useful for recovery/testing)
 */
export function resetMSUServiceStatus() {
  msuServiceStatus = {
    lastSuccess: null,
    lastFailure: null,
    consecutiveFailures: 0,
    requiresAuth: false
  };
  console.log('✅ MSU service status reset');
}

export const csr2Service = {
  csr2PointValue,
  csr2PolygonMean,
  getCsr2PolygonStats,
  csr2MultiPointAverage,
  calculateCSR2Value,
  calculateBlendedLandValue,
  getNonTillableMultiplier,
  geocodeAddress,
  reverseGeocode,
  createCircularPolygon,
  calculateAverageCSR2,
  getMSUServiceStatus,
  resetMSUServiceStatus
};