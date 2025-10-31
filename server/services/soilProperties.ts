/**
 * Soil Properties Service
 * 
 * Query Iowa soil data from local PostgreSQL database
 * Provides fast access to slope, drainage, texture, and soil series data
 */

import { isSoilDbAvailable, executeSoilQuery, soilDb } from '../soil-db';
import { eq, and, desc } from 'drizzle-orm';
import { component, mapunit, chorizon } from '@shared/soil-schema';

export interface SoilComponentData {
  soilSeries: string;
  slope: number | null;
  slopeLow: number | null;
  slopeHigh: number | null;
  drainage: string | null;
  hydrologicGroup: string | null;
  farmlandClass: string | null;
  percentage: number | null;
  taxonomicOrder: string | null;
}

export interface SurfaceHorizonData {
  sand: number | null;
  silt: number | null;
  clay: number | null;
  ph: number | null;
  organicMatter: number | null;
  depth: number | null;
}

export interface SoilDataResponse {
  soilSeries: string;
  slope: number | null;
  drainage: string | null;
  hydrologicGroup: string | null;
  farmlandClass: string | null;
  texture: SurfaceHorizonData | null;
  components?: SoilComponentData[];
}

/**
 * Get soil data for a specific map unit key
 */
export async function getSoilDataByMukey(mukey: string): Promise<SoilDataResponse | null> {
  if (!isSoilDbAvailable() || !soilDb) {
    console.warn('Soil database not available');
    return null;
  }

  try {
    // Get dominant soil component
    const components = await soilDb
      .select({
        soilSeries: component.compname,
        slope: component.slope_r,
        slopeLow: component.slope_l,
        slopeHigh: component.slope_h,
        drainage: component.drainagecl,
        hydrologicGroup: component.hydgrp,
        percentage: component.comppct_r,
        taxonomicOrder: component.taxorder,
        cokey: component.cokey,
        mukey: component.mukey,
      })
      .from(component)
      .where(and(
        eq(component.mukey, mukey),
        eq(component.majcompflag, 'Yes')
      ))
      .orderBy(desc(component.comppct_r));

    if (!components || components.length === 0) {
      return null;
    }

    const dominantComponent = components[0];

    // Get farmland classification from map unit
    const mapunits = await soilDb
      .select({
        farmlandClass: mapunit.farmlndcl,
      })
      .from(mapunit)
      .where(eq(mapunit.mukey, mukey))
      .limit(1);

    const farmlandClass = mapunits[0]?.farmlandClass || null;

    // Get surface horizon texture data
    const horizons = await soilDb
      .select({
        sand: chorizon.sandtotal_r,
        silt: chorizon.silttotal_r,
        clay: chorizon.claytotal_r,
        ph: chorizon.ph1to1h2o_r,
        organicMatter: chorizon.om_r,
        depth: chorizon.hzdept_r,
      })
      .from(chorizon)
      .where(and(
        eq(chorizon.cokey, dominantComponent.cokey),
        eq(chorizon.hzdept_r, 0)
      ))
      .limit(1);

    const texture = horizons[0] || null;

    return {
      soilSeries: dominantComponent.soilSeries || 'Unknown',
      slope: dominantComponent.slope,
      drainage: dominantComponent.drainage,
      hydrologicGroup: dominantComponent.hydrologicGroup,
      farmlandClass,
      texture,
      components: components.map(c => ({
        soilSeries: c.soilSeries || 'Unknown',
        slope: c.slope,
        slopeLow: c.slopeLow,
        slopeHigh: c.slopeHigh,
        drainage: c.drainage,
        hydrologicGroup: c.hydrologicGroup,
        farmlandClass,
        percentage: c.percentage,
        taxonomicOrder: c.taxonomicOrder,
      })),
    };
  } catch (error) {
    console.error('Error fetching soil data by mukey:', error);
    return null;
  }
}

/**
 * Get soil data for coordinates (point query)
 * Note: Without PostGIS, we can't do spatial intersection
 * This is a placeholder for when spatial data becomes available
 */
export async function getSoilDataForPoint(
  longitude: number,
  latitude: number
): Promise<SoilDataResponse | null> {
  if (!isSoilDbAvailable()) {
    console.warn('Soil database not available');
    return null;
  }

  try {
    // Without PostGIS, we would need to:
    // 1. Get mukey from USDA SDA API for this point
    // 2. Query our local database with that mukey
    
    // For now, return null and let caller use external APIs
    // This can be implemented when PostGIS is available or
    // when we add mukey lookup integration
    
    console.log(`Soil point query for (${longitude}, ${latitude}) - PostGIS not available`);
    return null;
  } catch (error) {
    console.error('Error fetching soil data for point:', error);
    return null;
  }
}

/**
 * Get all unique soil series in database
 */
export async function getAllSoilSeries(): Promise<string[]> {
  if (!isSoilDbAvailable()) {
    return [];
  }

  try {
    const result = await executeSoilQuery<{ compname: string }>(`
      SELECT DISTINCT compname
      FROM soil_component
      WHERE majcompflag = 'Yes'
        AND compname IS NOT NULL
      ORDER BY compname
    `);

    return result.map(r => r.compname);
  } catch (error) {
    console.error('Error fetching soil series list:', error);
    return [];
  }
}

/**
 * Search soil components by criteria
 */
export async function searchSoilComponents(criteria: {
  minSlope?: number;
  maxSlope?: number;
  drainage?: string;
  hydrologicGroup?: string;
  soilSeries?: string;
  farmlandClass?: string;
}): Promise<SoilComponentData[]> {
  if (!isSoilDbAvailable()) {
    return [];
  }

  try {
    let query = `
      SELECT 
        c.compname as soil_series,
        c.slope_r as slope,
        c.slope_l as slope_low,
        c.slope_h as slope_high,
        c.drainagecl as drainage,
        c.hydgrp as hydrologic_group,
        c.comppct_r as percentage,
        c.taxorder as taxonomic_order,
        m.farmlndcl as farmland_class
      FROM soil_component c
      JOIN soil_mapunit m ON c.mukey = m.mukey
      WHERE c.majcompflag = 'Yes'
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (criteria.minSlope !== undefined) {
      query += ` AND c.slope_r >= $${paramIndex}`;
      params.push(criteria.minSlope);
      paramIndex++;
    }

    if (criteria.maxSlope !== undefined) {
      query += ` AND c.slope_r <= $${paramIndex}`;
      params.push(criteria.maxSlope);
      paramIndex++;
    }

    if (criteria.drainage) {
      query += ` AND c.drainagecl = $${paramIndex}`;
      params.push(criteria.drainage);
      paramIndex++;
    }

    if (criteria.hydrologicGroup) {
      query += ` AND c.hydgrp = $${paramIndex}`;
      params.push(criteria.hydrologicGroup);
      paramIndex++;
    }

    if (criteria.soilSeries) {
      query += ` AND c.compname LIKE $${paramIndex}`;
      params.push(`%${criteria.soilSeries}%`);
      paramIndex++;
    }

    if (criteria.farmlandClass) {
      query += ` AND m.farmlndcl LIKE $${paramIndex}`;
      params.push(`%${criteria.farmlandClass}%`);
      paramIndex++;
    }

    query += ` ORDER BY c.slope_r LIMIT 100`;

    const result = await executeSoilQuery<any>(query, params);

    return result.map(r => ({
      soilSeries: r.soil_series,
      slope: r.slope,
      slopeLow: r.slope_low,
      slopeHigh: r.slope_high,
      drainage: r.drainage,
      hydrologicGroup: r.hydrologic_group,
      farmlandClass: r.farmland_class,
      percentage: r.percentage,
      taxonomicOrder: r.taxonomic_order,
    }));
  } catch (error) {
    console.error('Error searching soil components:', error);
    return [];
  }
}

export const soilPropertiesService = {
  getSoilDataByMukey,
  getSoilDataForPoint,
  getAllSoilSeries,
  searchSoilComponents,
};

