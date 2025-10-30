import axios from 'axios';
import NodeCache from 'node-cache';
import pLimit from 'p-limit';
import { csr2Service } from './csr2.js';

// Enhanced cache with longer TTL for soil properties (4 hours)
const enhancedCache = new NodeCache({ stdTTL: 14400 });

// Reuse rate limiting from existing CSR2 service
const limit = pLimit(3);

// USDA Soil Data Access Endpoint
const USDA_ENDPOINT = "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest";

// Types
export interface SoilProperties {
  slope?: number;
  drainageClass?: string;
  organicMatter?: number;
  cornYield?: number;
  soybeanYield?: number;
  mukey?: string;
  muname?: string;
}

export interface EnhancedCSR2Result {
  csr2Value: number;
  confidence: 'high' | 'medium' | 'low' | 'no_data' | 'error';
  source: 'MSU_ImageServer' | 'USDA_SoilDataAccess' | 'combined';
  coordinates: [number, number];
  timestamp: string;
  cached: boolean;
  soilProperties?: SoilProperties;
}

export interface SoilComposition {
  mukey: string;
  name: string;
  acres: number;
  percentage: number;
  csr2: number;
  slope?: number;
  drainageClass?: string;
  cornYield?: number;
}

export interface PolygonAnalysisResult {
  summary: {
    weightedAverageCSR2: number;
    totalAcres: number;
    dominantSoil: string;
    soilUnitCount: number;
    averageSlope?: number;
    drainageClass?: string;
  };
  soilComposition: SoilComposition[];
  statistics: {
    csr2: {
      min: number;
      max: number;
      mean: number;
      median: number;
      stdDev: number;
    };
    slope?: {
      min: number;
      max: number;
      mean: number;
    };
  };
}

export interface BatchResult {
  successful: number;
  failed: number;
  results: EnhancedCSR2Result[];
  processingTime: number;
}

class EnhancedCSR2Service {
  /**
   * Get CSR2 value with comprehensive soil properties
   */
  async getCSR2WithSoilProperties(
    latitude: number,
    longitude: number,
    useCache: boolean = true
  ): Promise<EnhancedCSR2Result> {
    // Check cache first
    if (useCache) {
      const cacheKey = this.getCacheKey(latitude, longitude);
      const cached = enhancedCache.get<EnhancedCSR2Result>(cacheKey);
      if (cached) {
        return { ...cached, cached: true };
      }
    }

    try {
      // Get base CSR2 value from existing service
      const csr2Value = await csr2Service.csr2PointValue(longitude, latitude);

      // Fetch additional soil properties from USDA
      const soilProperties = await this.fetchSoilProperties(latitude, longitude);

      const result: EnhancedCSR2Result = {
        csr2Value: csr2Value || 0,
        confidence: csr2Value && csr2Value > 0 ? 'high' : 'no_data',
        source: 'combined',
        coordinates: [latitude, longitude],
        timestamp: new Date().toISOString(),
        cached: false,
        soilProperties
      };

      // Cache the result
      if (useCache) {
        const cacheKey = this.getCacheKey(latitude, longitude);
        enhancedCache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      console.error('Enhanced CSR2 error:', error);
      return {
        csr2Value: 0,
        confidence: 'error',
        source: 'combined',
        coordinates: [latitude, longitude],
        timestamp: new Date().toISOString(),
        cached: false
      };
    }
  }

  /**
   * Batch process multiple coordinates
   */
  async batchGetCSR2(
    coordinates: Array<[number, number]>,
    useCache: boolean = true
  ): Promise<BatchResult> {
    const startTime = Date.now();

    // Process all coordinates with rate limiting
    const promises = coordinates.map(([lat, lon]) =>
      limit(() => this.getCSR2WithSoilProperties(lat, lon, useCache))
    );

    const results = await Promise.allSettled(promises);

    const processedResults: EnhancedCSR2Result[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Return error result
        const [lat, lon] = coordinates[index];
        return {
          csr2Value: 0,
          confidence: 'error',
          source: 'combined',
          coordinates: [lat, lon],
          timestamp: new Date().toISOString(),
          cached: false
        };
      }
    });

    return {
      successful: processedResults.filter(r => r.confidence !== 'error').length,
      failed: processedResults.filter(r => r.confidence === 'error').length,
      results: processedResults,
      processingTime: Date.now() - startTime
    };
  }

  /**
   * Enhanced polygon analysis with soil composition
   */
  async analyzePolygonEnhanced(wkt: string): Promise<PolygonAnalysisResult> {
    // Check cache first
    const cacheKey = `polygon:${Buffer.from(wkt).toString('base64').substring(0, 100)}`;
    const cached = enhancedCache.get<PolygonAnalysisResult>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Fetch comprehensive USDA polygon data
      const polygonData = await this.fetchUSDAPolygonAnalysis(wkt);

      // Calculate statistics
      const statistics = this.calculateStatistics(polygonData.soilComposition);

      const result: PolygonAnalysisResult = {
        summary: polygonData.summary,
        soilComposition: polygonData.soilComposition,
        statistics
      };

      // Cache the result
      enhancedCache.set(cacheKey, result);

      return result;
    } catch (error) {
      console.error('Enhanced polygon analysis error:', error);
      throw new Error(`Failed to analyze polygon: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch soil properties from USDA for a point
   */
  private async fetchSoilProperties(latitude: number, longitude: number): Promise<SoilProperties> {
    const query = `
      SELECT TOP 1
        m.mukey,
        m.muname,
        mp.nonirryield_r as cornYield,
        mp2.nonirryield_r as soybeanYield,
        c.slope_r as slope,
        c.drainagecl as drainageClass,
        ch.om_r as organicMatter
      FROM 
        mapunit m
        LEFT JOIN mucropyld mp ON m.mukey = mp.mukey AND mp.cropname = 'Corn'
        LEFT JOIN mucropyld mp2 ON m.mukey = mp2.mukey AND mp2.cropname = 'Soybeans'
        LEFT JOIN component c ON m.mukey = c.mukey
        LEFT JOIN chorizon ch ON c.cokey = ch.cokey AND ch.hzdept_r = 0
      WHERE 
        m.mukey IN (
          SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84(
            'POINT(${longitude} ${latitude})'
          )
        )
        AND c.comppct_r = (
          SELECT MAX(c2.comppct_r) FROM component c2 WHERE c2.mukey = m.mukey
        )
    `;

    try {
      const response = await axios.post(
        USDA_ENDPOINT,
        new URLSearchParams({
          query,
          format: 'JSON'
        }),
        {
          timeout: 10000,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'TerraValue/1.0 (Agricultural Land Valuation Tool)'
          }
        }
      );

      if (response.data && response.data.Table && response.data.Table.length > 0) {
        const row = response.data.Table[0];
        return {
          mukey: row[0],
          muname: row[1],
          cornYield: row[2] ? parseFloat(row[2]) : undefined,
          soybeanYield: row[3] ? parseFloat(row[3]) : undefined,
          slope: row[4] ? parseFloat(row[4]) : undefined,
          drainageClass: row[5] || undefined,
          organicMatter: row[6] ? parseFloat(row[6]) : undefined
        };
      }

      return {};
    } catch (error) {
      console.warn('Failed to fetch soil properties:', error);
      return {};
    }
  }

  /**
   * Fetch comprehensive polygon analysis from USDA
   */
  private async fetchUSDAPolygonAnalysis(wkt: string): Promise<{
    summary: PolygonAnalysisResult['summary'];
    soilComposition: SoilComposition[];
  }> {
    // Simplified query without CTE - USDA's SQL parser is limited
    const query = `
      SELECT 
        m.mukey,
        m.musym,
        m.muname,
        m.muacres,
        mp.csr2corn as csr2,
        mp.nonirryield_r as cornYield,
        c.slope_r as slope,
        c.drainagecl as drainageClass,
        c.comppct_r as component_pct
      FROM 
        mapunit m
        LEFT JOIN mucropyld mp ON m.mukey = mp.mukey AND mp.cropname = 'Corn'
        LEFT JOIN component c ON m.mukey = c.mukey
      WHERE 
        m.mukey IN (
          SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${wkt}')
        )
      ORDER BY m.muacres DESC, c.comppct_r DESC
    `;

    const response = await axios.post(
      USDA_ENDPOINT,
      new URLSearchParams({
        query,
        format: 'JSON'
      }),
      {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'TerraValue/1.0 (Agricultural Land Valuation Tool)'
        }
      }
    );

    if (!response.data || !response.data.Table || response.data.Table.length === 0) {
      throw new Error('No soil data found for polygon');
    }

    const data = response.data.Table;

    // Group by mukey to get unique soil map units with dominant component
    const soilMap: { [mukey: string]: any } = {};
    
    data.forEach((row: any) => {
      const mukey = row[0];
      const componentPct = parseFloat(row[8]) || 0;
      
      // Keep only the dominant component for each map unit
      if (!soilMap[mukey] || componentPct > (parseFloat(soilMap[mukey][8]) || 0)) {
        soilMap[mukey] = row;
      }
    });

    const uniqueSoils = Object.values(soilMap);

    // Calculate total acres and weighted values
    const totalAcres = uniqueSoils.reduce((sum: number, row: any) => sum + (parseFloat(row[3]) || 0), 0);
    
    let weightedCSR2 = 0;
    let totalCSR2Weight = 0;
    let totalSlopeWeight = 0;
    let weightedSlope = 0;
    const drainageClasses: { [key: string]: number } = {};

    // Build soil composition and calculate weighted values
    const soilComposition: SoilComposition[] = uniqueSoils.map((row: any) => {
      const acres = parseFloat(row[3]) || 0;
      const csr2 = parseFloat(row[4]) || 0;
      const cornYield = parseFloat(row[5]) || undefined;
      const slope = parseFloat(row[6]) || undefined;
      const drainageClass = row[7] || undefined;

      // Calculate weighted CSR2
      if (csr2 > 0 && acres > 0) {
        weightedCSR2 += csr2 * acres;
        totalCSR2Weight += acres;
      }

      // Calculate weighted slope
      if (slope !== undefined && acres > 0) {
        weightedSlope += slope * acres;
        totalSlopeWeight += acres;
      }

      // Track drainage classes
      if (drainageClass && acres > 0) {
        drainageClasses[drainageClass] = (drainageClasses[drainageClass] || 0) + acres;
      }

      return {
        mukey: row[0],
        name: row[2],
        acres: Math.round(acres * 10) / 10,
        percentage: totalAcres > 0 ? Math.round((acres / totalAcres) * 1000) / 10 : 0,
        csr2: Math.round(csr2 * 10) / 10,
        slope: slope !== undefined ? Math.round(slope * 10) / 10 : undefined,
        drainageClass,
        cornYield: cornYield !== undefined ? Math.round(cornYield) : undefined
      };
    }).sort((a, b) => b.acres - a.acres); // Sort by acres descending

    // Calculate final weighted averages
    const finalWeightedCSR2 = totalCSR2Weight > 0 ? weightedCSR2 / totalCSR2Weight : 0;
    const finalWeightedSlope = totalSlopeWeight > 0 ? weightedSlope / totalSlopeWeight : undefined;

    // Find most common drainage class
    let dominantDrainageClass: string | undefined;
    let maxAcres = 0;
    for (const [drainageClass, acres] of Object.entries(drainageClasses)) {
      if (acres > maxAcres) {
        maxAcres = acres;
        dominantDrainageClass = drainageClass;
      }
    }

    return {
      summary: {
        weightedAverageCSR2: Math.round(finalWeightedCSR2 * 10) / 10,
        totalAcres: Math.round(totalAcres * 10) / 10,
        dominantSoil: soilComposition[0]?.name || 'Unknown',
        soilUnitCount: soilComposition.length,
        averageSlope: finalWeightedSlope !== undefined ? Math.round(finalWeightedSlope * 10) / 10 : undefined,
        drainageClass: dominantDrainageClass
      },
      soilComposition: soilComposition.slice(0, 10) // Return top 10 soil units
    };
  }

  /**
   * Calculate statistics from soil composition
   */
  private calculateStatistics(soilComposition: SoilComposition[]): PolygonAnalysisResult['statistics'] {
    const csr2Values = soilComposition.map(s => s.csr2).filter(v => v > 0);
    const slopeValues = soilComposition.map(s => s.slope).filter((v): v is number => v !== undefined && v >= 0);

    if (csr2Values.length === 0) {
      return {
        csr2: { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 }
      };
    }

    // CSR2 statistics
    const sortedCSR2 = [...csr2Values].sort((a, b) => a - b);
    const csr2Mean = csr2Values.reduce((a, b) => a + b) / csr2Values.length;
    const csr2Median = sortedCSR2[Math.floor(sortedCSR2.length / 2)];
    const csr2Variance = csr2Values.reduce((sum, val) => sum + Math.pow(val - csr2Mean, 2), 0) / csr2Values.length;
    const csr2StdDev = Math.sqrt(csr2Variance);

    const statistics: PolygonAnalysisResult['statistics'] = {
      csr2: {
        min: Math.round(Math.min(...csr2Values) * 10) / 10,
        max: Math.round(Math.max(...csr2Values) * 10) / 10,
        mean: Math.round(csr2Mean * 10) / 10,
        median: Math.round(csr2Median * 10) / 10,
        stdDev: Math.round(csr2StdDev * 10) / 10
      }
    };

    // Slope statistics (if available)
    if (slopeValues.length > 0) {
      const sortedSlope = [...slopeValues].sort((a, b) => a - b);
      const slopeMean = slopeValues.reduce((a, b) => a + b) / slopeValues.length;

      statistics.slope = {
        min: Math.round(Math.min(...slopeValues) * 10) / 10,
        max: Math.round(Math.max(...slopeValues) * 10) / 10,
        mean: Math.round(slopeMean * 10) / 10
      };
    }

    return statistics;
  }

  /**
   * Generate cache key for coordinate
   */
  private getCacheKey(latitude: number, longitude: number): string {
    return `enhanced_csr2:${latitude.toFixed(6)}:${longitude.toFixed(6)}`;
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    enhancedCache.flushAll();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): any {
    return enhancedCache.getStats();
  }
}

// Export singleton instance
export const enhancedCSR2Service = new EnhancedCSR2Service();

// Export types
export type { EnhancedCSR2Result, SoilProperties, PolygonAnalysisResult, BatchResult, SoilComposition };

