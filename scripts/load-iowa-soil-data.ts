/**
 * Iowa Soil Data Loader
 * 
 * This script loads Iowa SSURGO soil data and CSR2 ratings into a local PostgreSQL database
 * to replace slow external API calls for improved performance.
 * 
 * Data Sources:
 * - USDA Soil Data Access (SDA) - https://sdmdataaccess.sc.egov.usda.gov
 * - USDA Interpretation Service for CSR2 ratings
 * 
 * Usage:
 *   npm run db:soil:load
 * 
 * Estimated runtime: 30-60 minutes for full Iowa dataset
 */

import 'dotenv/config';
import { soilDb, soilPool, executeSoilQuery } from '../server/soil-db';
import { legend, mapunit, component, chorizon, csr2Ratings, syncStatus } from '@shared/soil-schema';
import { eq } from 'drizzle-orm';

const SDA_ENDPOINT = 'https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest';
const BATCH_SIZE = 1000;
const CHUNK_SIZE = 5000; // Rows per SDA query

interface SDAResponse {
  Table?: any[][];
}

/**
 * Query USDA Soil Data Access API
 * @param sql SQL query to execute
 * @param columns Optional array of column names. If provided, will map array results to objects.
 */
async function querySDA(sql: string, columns?: string[]): Promise<any[]> {
  const params = new URLSearchParams({
    query: sql,
    format: 'JSON'
  });

  const response = await fetch(SDA_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const data: SDAResponse = await response.json();
  
  if (!data.Table || data.Table.length === 0) {
    return [];
  }

  // USDA SDA returns all rows as data (NO header row with column names)
  const rows = data.Table;
  
  // If columns are provided, map arrays to objects
  if (columns) {
    return rows.map((row: any[]) => {
      const obj: any = {};
      columns.forEach((col: string, idx: number) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  }
  
  // Otherwise return raw array data
  return rows;
}

/**
 * Create PostGIS extension and spatial tables
 */
async function setupPostGIS(): Promise<boolean> {
  console.log('Setting up PostGIS extension...');
  
  try {
    await executeSoilQuery('CREATE EXTENSION IF NOT EXISTS postgis');
    console.log('✅ PostGIS extension enabled');
    
    // Add geometry columns to mapunit_spatial table
    await executeSoilQuery(`
      SELECT AddGeometryColumn('soil_mapunit_spatial', 'geom', 4326, 'MULTIPOLYGON', 2);
    `).catch(() => {
      console.log('Geometry column already exists or will be added later');
    });
    
    await executeSoilQuery(`
      SELECT AddGeometryColumn('soil_mapunit_spatial', 'centroid', 4326, 'POINT', 2);
    `).catch(() => {
      console.log('Centroid column already exists or will be added later');
    });
    
    // Create spatial indexes
    await executeSoilQuery(`
      CREATE INDEX IF NOT EXISTS soil_mapunit_spatial_geom_idx 
      ON soil_mapunit_spatial USING GIST(geom);
    `);
    
    await executeSoilQuery(`
      CREATE INDEX IF NOT EXISTS soil_mapunit_spatial_centroid_idx 
      ON soil_mapunit_spatial USING GIST(centroid);
    `);
    
    console.log('✅ Spatial indexes created');
    return true;
  } catch (error) {
    console.warn('⚠️  PostGIS not available - spatial queries will be disabled');
    console.warn('   Tabular data and CSR2 ratings will still be loaded for fast lookups');
    console.warn('   To enable spatial queries, install PostGIS extension in Railway');
    return false;
  }
}

/**
 * Load Iowa survey areas (legend table)
 */
async function loadLegends(): Promise<string[]> {
  console.log('\n📍 Loading Iowa survey areas...');
  
  // Define expected columns from our query
  const expectedColumns = ['lkey', 'areatypename', 'areasymbol', 'areaname', 'mlraoffice', 'legendsuituse', 'legendcertstat'];
  
  const sql = `
    SELECT 
      l.lkey, l.areatypename, l.areasymbol, l.areaname,
      l.mlraoffice, l.legendsuituse, l.legendcertstat
    FROM legend l
    WHERE l.areasymbol LIKE 'IA%'
    AND l.areatypename = 'Non-MLRA Soil Survey Area'
    ORDER BY l.areasymbol
  `;
  
  const legends = await querySDA(sql, expectedColumns);
  
  console.log(`Found ${legends.length} Iowa survey areas`);
  
  // Debug: Log first legend to see structure
  if (legends.length > 0) {
    console.log('  Sample legend structure:', JSON.stringify(legends[0], null, 2));
  }
  
  if (!soilDb) throw new Error('Soil database not available');
  
  // Filter out any rows with null lkey
  const validLegends = legends.filter(l => l.lkey && l.areasymbol);
  console.log(`  Valid legends (with lkey): ${validLegends.length}`);
  
  // Insert in batches
  for (let i = 0; i < validLegends.length; i += BATCH_SIZE) {
    const batch = validLegends.slice(i, i + BATCH_SIZE);
    await soilDb.insert(legend).values(
      batch.map(l => ({
        lkey: l.lkey,
        areatypename: l.areatypename,
        areasymbol: l.areasymbol,
        areaname: l.areaname,
        mlraoffice: l.mlraoffice,
        legendsuituse: l.legendsuituse ? parseInt(l.legendsuituse) : null,
        legendcertstat: l.legendcertstat
      }))
    ).onConflictDoNothing();
    
    console.log(`  Inserted ${Math.min(i + BATCH_SIZE, validLegends.length)}/${validLegends.length} legends`);
  }
  
  return validLegends.map(l => l.areasymbol);
}

/**
 * Load map units for a survey area
 */
async function loadMapUnits(areasymbol: string): Promise<number> {
  console.log(`\n🗺️  Loading map units for ${areasymbol}...`);
  
  const columns = ['mukey', 'lkey', 'musym', 'muname', 'mukind', 'mustatus', 'muacres', 'farmlndcl'];
  
  const sql = `
    SELECT 
      m.mukey, m.lkey, m.musym, m.muname, m.mukind, 
      m.mustatus, m.muacres, m.farmlndcl
    FROM legend l
    INNER JOIN mapunit m ON l.lkey = m.lkey
    WHERE l.areasymbol = '${areasymbol}'
  `;
  
  const mapunits = await querySDA(sql, columns);
  console.log(`  Found ${mapunits.length} map units`);
  
  if (mapunits.length === 0) return 0;
  if (!soilDb) throw new Error('Soil database not available');
  
  // Insert in batches
  for (let i = 0; i < mapunits.length; i += BATCH_SIZE) {
    const batch = mapunits.slice(i, i + BATCH_SIZE);
    await soilDb.insert(mapunit).values(
      batch.map(m => ({
        mukey: m.mukey,
        lkey: m.lkey,
        musym: m.musym,
        muname: m.muname,
        mukind: m.mukind,
        mustatus: m.mustatus,
        muacres: m.muacres ? parseFloat(m.muacres) : null,
        farmlndcl: m.farmlndcl
      }))
    ).onConflictDoNothing();
    
    console.log(`    Inserted ${Math.min(i + BATCH_SIZE, mapunits.length)}/${mapunits.length} map units`);
  }
  
  return mapunits.length;
}

/**
 * Load components for a survey area
 */
async function loadComponents(areasymbol: string): Promise<number> {
  console.log(`\n🧩 Loading components for ${areasymbol}...`);
  
  const columns = [
    'cokey', 'mukey', 'compname', 'comppct_l', 'comppct_r', 'comppct_h',
    'compkind', 'majcompflag', 'slope_l', 'slope_r', 'slope_h',
    'slopelenusle_l', 'slopelenusle_r', 'slopelenusle_h',
    'drainagecl', 'hydgrp', 'taxclname', 'taxorder', 'taxsuborder',
    'taxgrtgroup', 'taxsubgrp', 'taxpartsize', 'taxtempregime'
  ];
  
  const sql = `
    SELECT 
      c.cokey, c.mukey, c.compname, c.comppct_l, c.comppct_r, c.comppct_h,
      c.compkind, c.majcompflag, c.slope_l, c.slope_r, c.slope_h,
      c.slopelenusle_l, c.slopelenusle_r, c.slopelenusle_h,
      c.drainagecl, c.hydgrp, c.taxclname, c.taxorder, c.taxsuborder,
      c.taxgrtgroup, c.taxsubgrp, c.taxpartsize, c.taxtempregime
    FROM legend l
    INNER JOIN mapunit m ON l.lkey = m.lkey
    INNER JOIN component c ON m.mukey = c.mukey
    WHERE l.areasymbol = '${areasymbol}'
  `;
  
  const components = await querySDA(sql, columns);
  console.log(`  Found ${components.length} components`);
  
  if (components.length === 0) return 0;
  if (!soilDb) throw new Error('Soil database not available');
  
  // Insert in batches
  for (let i = 0; i < components.length; i += BATCH_SIZE) {
    const batch = components.slice(i, i + BATCH_SIZE);
    await soilDb.insert(component).values(
      batch.map(c => ({
        cokey: c.cokey,
        mukey: c.mukey,
        compname: c.compname,
        comppct_l: c.comppct_l ? parseInt(c.comppct_l) : null,
        comppct_r: c.comppct_r ? parseInt(c.comppct_r) : null,
        comppct_h: c.comppct_h ? parseInt(c.comppct_h) : null,
        compkind: c.compkind,
        majcompflag: c.majcompflag,
        slope_l: c.slope_l ? parseFloat(c.slope_l) : null,
        slope_r: c.slope_r ? parseFloat(c.slope_r) : null,
        slope_h: c.slope_h ? parseFloat(c.slope_h) : null,
        slopelenusle_l: c.slopelenusle_l ? parseInt(c.slopelenusle_l) : null,
        slopelenusle_r: c.slopelenusle_r ? parseInt(c.slopelenusle_r) : null,
        slopelenusle_h: c.slopelenusle_h ? parseInt(c.slopelenusle_h) : null,
        drainagecl: c.drainagecl,
        hydgrp: c.hydgrp,
        taxclname: c.taxclname,
        taxorder: c.taxorder,
        taxsuborder: c.taxsuborder,
        taxgrtgroup: c.taxgrtgroup,
        taxsubgrp: c.taxsubgrp,
        taxpartsize: c.taxpartsize,
        taxtempregime: c.taxtempregime
      }))
    ).onConflictDoNothing();
    
    console.log(`    Inserted ${Math.min(i + BATCH_SIZE, components.length)}/${components.length} components`);
  }
  
  return components.length;
}

/**
 * Load horizons for a survey area
 */
async function loadHorizons(areasymbol: string): Promise<number> {
  console.log(`\n📊 Loading horizons for ${areasymbol}...`);
  
  const columns = [
    'chkey', 'cokey', 'hzname', 'desgnmaster',
    'hzdept_l', 'hzdept_r', 'hzdept_h',
    'hzdepb_l', 'hzdepb_r', 'hzdepb_h',
    'sandtotal_l', 'sandtotal_r', 'sandtotal_h',
    'silttotal_l', 'silttotal_r', 'silttotal_h',
    'claytotal_l', 'claytotal_r', 'claytotal_h',
    'om_l', 'om_r', 'om_h',
    'ph1to1h2o_l', 'ph1to1h2o_r', 'ph1to1h2o_h',
    'ksat_l', 'ksat_r', 'ksat_h'
  ];
  
  const sql = `
    SELECT 
      h.chkey, h.cokey, h.hzname, h.desgnmaster,
      h.hzdept_l, h.hzdept_r, h.hzdept_h,
      h.hzdepb_l, h.hzdepb_r, h.hzdepb_h,
      h.sandtotal_l, h.sandtotal_r, h.sandtotal_h,
      h.silttotal_l, h.silttotal_r, h.silttotal_h,
      h.claytotal_l, h.claytotal_r, h.claytotal_h,
      h.om_l, h.om_r, h.om_h,
      h.ph1to1h2o_l, h.ph1to1h2o_r, h.ph1to1h2o_h,
      h.ksat_l, h.ksat_r, h.ksat_h
    FROM legend l
    INNER JOIN mapunit m ON l.lkey = m.lkey
    INNER JOIN component c ON m.mukey = c.mukey
    INNER JOIN chorizon h ON c.cokey = h.cokey
    WHERE l.areasymbol = '${areasymbol}'
  `;
  
  const horizons = await querySDA(sql, columns);
  console.log(`  Found ${horizons.length} horizons`);
  
  if (horizons.length === 0) return 0;
  if (!soilDb) throw new Error('Soil database not available');
  
  // Insert in batches
  for (let i = 0; i < horizons.length; i += BATCH_SIZE) {
    const batch = horizons.slice(i, i + BATCH_SIZE);
    await soilDb.insert(chorizon).values(
      batch.map(h => ({
        chkey: h.chkey,
        cokey: h.cokey,
        hzname: h.hzname,
        desgnmaster: h.desgnmaster,
        hzdept_l: h.hzdept_l ? parseInt(h.hzdept_l) : null,
        hzdept_r: h.hzdept_r ? parseInt(h.hzdept_r) : null,
        hzdept_h: h.hzdept_h ? parseInt(h.hzdept_h) : null,
        hzdepb_l: h.hzdepb_l ? parseInt(h.hzdepb_l) : null,
        hzdepb_r: h.hzdepb_r ? parseInt(h.hzdepb_r) : null,
        hzdepb_h: h.hzdepb_h ? parseInt(h.hzdepb_h) : null,
        sandtotal_l: h.sandtotal_l ? parseFloat(h.sandtotal_l) : null,
        sandtotal_r: h.sandtotal_r ? parseFloat(h.sandtotal_r) : null,
        sandtotal_h: h.sandtotal_h ? parseFloat(h.sandtotal_h) : null,
        silttotal_l: h.silttotal_l ? parseFloat(h.silttotal_l) : null,
        silttotal_r: h.silttotal_r ? parseFloat(h.silttotal_r) : null,
        silttotal_h: h.silttotal_h ? parseFloat(h.silttotal_h) : null,
        claytotal_l: h.claytotal_l ? parseFloat(h.claytotal_l) : null,
        claytotal_r: h.claytotal_r ? parseFloat(h.claytotal_r) : null,
        claytotal_h: h.claytotal_h ? parseFloat(h.claytotal_h) : null,
        om_l: h.om_l ? parseFloat(h.om_l) : null,
        om_r: h.om_r ? parseFloat(h.om_r) : null,
        om_h: h.om_h ? parseFloat(h.om_h) : null,
        ph1to1h2o_l: h.ph1to1h2o_l ? parseFloat(h.ph1to1h2o_l) : null,
        ph1to1h2o_r: h.ph1to1h2o_r ? parseFloat(h.ph1to1h2o_r) : null,
        ph1to1h2o_h: h.ph1to1h2o_h ? parseFloat(h.ph1to1h2o_h) : null,
        ksat_l: h.ksat_l ? parseFloat(h.ksat_l) : null,
        ksat_r: h.ksat_r ? parseFloat(h.ksat_r) : null,
        ksat_h: h.ksat_h ? parseFloat(h.ksat_h) : null
      }))
    ).onConflictDoNothing();
    
    console.log(`    Inserted ${Math.min(i + BATCH_SIZE, horizons.length)}/${horizons.length} horizons`);
  }
  
  return horizons.length;
}

/**
 * Load CSR2 ratings for a survey area
 */
async function loadCSR2Ratings(areasymbol: string): Promise<number> {
  console.log(`\n🌽 Loading CSR2 ratings for ${areasymbol}...`);
  
  const columns = ['cokey', 'mukey', 'comppct_r', 'csr2_rating'];
  
  const sql = `
    SELECT 
      c.cokey, c.mukey, c.comppct_r,
      cri.interplr AS csr2_rating
    FROM legend l
    INNER JOIN mapunit m ON l.lkey = m.lkey
    INNER JOIN component c ON m.mukey = c.mukey
    LEFT JOIN cointerp cri ON c.cokey = cri.cokey
    WHERE l.areasymbol = '${areasymbol}'
    AND cri.mrulename = 'Iowa Corn Suitability Rating'
    AND cri.interplr IS NOT NULL
    AND c.comppct_r > 0
  `;
  
  const ratings = await querySDA(sql, columns);
  console.log(`  Found ${ratings.length} CSR2 ratings`);
  
  if (ratings.length === 0) return 0;
  if (!soilDb) throw new Error('Soil database not available');
  
  // Insert in batches
  for (let i = 0; i < ratings.length; i += BATCH_SIZE) {
    const batch = ratings.slice(i, i + BATCH_SIZE);
    await soilDb.insert(csr2Ratings).values(
      batch.map(r => ({
        mukey: r.mukey,
        cokey: r.cokey,
        csr2Value: parseFloat(r.csr2_rating),
        componentPercent: r.comppct_r ? parseInt(r.comppct_r) : null
      }))
    ).onConflictDoNothing();
    
    console.log(`    Inserted ${Math.min(i + BATCH_SIZE, ratings.length)}/${ratings.length} CSR2 ratings`);
  }
  
  return ratings.length;
}

/**
 * Create materialized view for optimized queries
 */
async function createMaterializedView() {
  console.log('\n📈 Creating materialized view...');
  
  const sql = `
    DROP MATERIALIZED VIEW IF EXISTS iowa_soil_summary;
    
    CREATE MATERIALIZED VIEW iowa_soil_summary AS
    SELECT 
      m.mukey,
      m.musym,
      m.muname,
      m.farmlndcl,
      c.cokey,
      c.compname,
      c.comppct_r,
      c.slope_r,
      c.drainagecl,
      c.hydgrp,
      csr.csr2_value,
      h.sandtotal_r,
      h.silttotal_r,
      h.claytotal_r,
      h.om_r,
      h.ph1to1h2o_r,
      h.ksat_r
    FROM soil_mapunit m
    JOIN soil_component c ON m.mukey = c.mukey
    LEFT JOIN soil_csr2_ratings csr ON c.cokey = csr.cokey
    LEFT JOIN soil_chorizon h ON c.cokey = h.cokey AND h.hzdept_r = 0
    WHERE c.majcompflag = 'Yes';
    
    CREATE INDEX iowa_soil_summary_mukey_idx ON iowa_soil_summary(mukey);
    CREATE INDEX iowa_soil_summary_csr2_idx ON iowa_soil_summary(csr2_value);
  `;
  
  await executeSoilQuery(sql);
  console.log('✅ Materialized view created');
}

/**
 * Update sync status
 */
async function updateSyncStatus(areasymbol: string, tableName: string, count: number) {
  if (!soilDb) return;
  
  await soilDb.insert(syncStatus).values({
    areasymbol,
    tableName,
    recordCount: count,
    status: 'completed'
  }).onConflictDoUpdate({
    target: [syncStatus.areasymbol],
    set: {
      recordCount: count,
      lastSyncedAt: new Date(),
      status: 'completed'
    }
  });
}

/**
 * Main loader function
 */
async function main() {
  console.log('🚀 Iowa Soil Data Loader\n');
  console.log('This will load Iowa SSURGO and CSR2 data into your local database.');
  console.log('Estimated time: 30-60 minutes\n');
  
  if (!soilDb || !soilPool) {
    console.error('❌ Soil database not configured. Please set DATABASE_URL_SOIL environment variable.');
    process.exit(1);
  }
  
  const startTime = Date.now();
  
  try {
    // Setup PostGIS (optional - spatial queries will be disabled if not available)
    const hasPostGIS = await setupPostGIS();
    
    // Load legends (survey areas)
    const areasSymbols = await loadLegends();
    
    // Load data for each survey area
    for (const areasymbol of areasSymbols) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing ${areasymbol}`);
      console.log('='.repeat(60));
      
      const muCount = await loadMapUnits(areasymbol);
      const coCount = await loadComponents(areasymbol);
      const hzCount = await loadHorizons(areasymbol);
      const csrCount = await loadCSR2Ratings(areasymbol);
      
      await updateSyncStatus(areasymbol, 'all', muCount + coCount + hzCount + csrCount);
      
      console.log(`\n✅ ${areasymbol} complete: ${muCount} mapunits, ${coCount} components, ${hzCount} horizons, ${csrCount} CSR2 ratings`);
    }
    
    // Create materialized view
    await createMaterializedView();
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('✨ Load complete!');
    console.log(`⏱️  Total time: ${Math.floor(duration / 60)}m ${duration % 60}s`);
    if (!hasPostGIS) {
      console.log('⚠️  Note: PostGIS not enabled - spatial polygon queries will use fallback method');
      console.log('   Point-based CSR2 lookups will still work via component matching');
    }
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('\n❌ Error loading soil data:', error);
    process.exit(1);
  } finally {
    await soilPool?.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as loadIowaSoilData };

