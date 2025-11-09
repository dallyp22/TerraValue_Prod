import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';
import * as turf from '@turf/turf';

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

const TOLERANCE = 0.0001; // Simplification tolerance for geometries
const OUTPUT_DIR = './dist/public/parcels';

let fs: any;
let path: any;

try {
  fs = await import('fs');
  path = await import('path');
} catch (e) {
  console.error('File system modules not available');
}

/**
 * Export parcels for a specific county
 */
async function exportCountyParcels(
  pool: Pool,
  countyName: string,
  outputDir: string
): Promise<void> {
  try {
    console.log(`\n📦 Exporting ${countyName} County...`);
    
    const result = await pool.query(`
      SELECT 
        id,
        county_name,
        state_parcel_id,
        parcel_number,
        parcel_class,
        deed_holder,
        deed_holder_normalized,
        area_sqm / 4046.86 as acres,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, $1)) as geometry
      FROM parcels
      WHERE county_name = $2
        AND geom IS NOT NULL
      ORDER BY id
    `, [TOLERANCE, countyName]);
    
    if (result.rows.length === 0) {
      console.log(`   ⚠️  No parcels found for ${countyName}`);
      return;
    }
    
    // Build GeoJSON FeatureCollection
    const features = result.rows.map((row: any) => ({
      type: 'Feature',
      id: row.id,
      properties: {
        id: row.id,
        county: row.county_name,
        stateParcelId: row.state_parcel_id,
        parcelNumber: row.parcel_number,
        parcelClass: row.parcel_class,
        owner: row.deed_holder,
        ownerNormalized: row.deed_holder_normalized,
        acres: parseFloat(row.acres).toFixed(2),
      },
      geometry: JSON.parse(row.geometry),
    }));
    
    const geojson = {
      type: 'FeatureCollection',
      name: `${countyName} County Parcels`,
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }
      },
      features,
    };
    
    // Write to file
    const filename = `${countyName.toLowerCase().replace(/\s+/g, '-')}.geojson`;
    const filepath = path.join(outputDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(geojson, null, 2));
    
    // Calculate file size
    const stats = fs.statSync(filepath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log(`   ✅ Exported ${result.rows.length.toLocaleString()} parcels (${fileSizeMB} MB)`);
  } catch (error) {
    console.error(`   ❌ Error exporting ${countyName}:`, error);
  }
}

/**
 * Export ownership groups (top landowners)
 */
async function exportOwnershipGroups(
  pool: Pool,
  outputDir: string,
  limit = 1000
): Promise<void> {
  try {
    console.log(`\n📦 Exporting top ${limit} ownership groups...`);
    
    const result = await pool.query(`
      SELECT 
        id,
        normalized_owner,
        parcel_count,
        total_acres,
        parcel_ids,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(combined_geom, $1)) as geometry
      FROM parcel_ownership_groups
      WHERE combined_geom IS NOT NULL
      ORDER BY total_acres DESC
      LIMIT $2
    `, [TOLERANCE, limit]);
    
    if (result.rows.length === 0) {
      console.log('   ⚠️  No ownership groups found');
      return;
    }
    
    // Build GeoJSON FeatureCollection
    const features = result.rows.map((row: any) => ({
      type: 'Feature',
      id: row.id,
      properties: {
        id: row.id,
        owner: row.normalized_owner,
        parcelCount: row.parcel_count,
        acres: parseFloat(row.total_acres).toFixed(1),
        parcelIds: row.parcel_ids,
      },
      geometry: JSON.parse(row.geometry),
    }));
    
    const geojson = {
      type: 'FeatureCollection',
      name: 'Iowa Top Landowners',
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }
      },
      features,
    };
    
    // Write to file
    const filepath = path.join(outputDir, 'ownership-groups.geojson');
    fs.writeFileSync(filepath, JSON.stringify(geojson, null, 2));
    
    // Calculate file size
    const stats = fs.statSync(filepath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log(`   ✅ Exported ${result.rows.length.toLocaleString()} ownership groups (${fileSizeMB} MB)`);
  } catch (error) {
    console.error('   ❌ Error exporting ownership groups:', error);
  }
}

/**
 * Create an index manifest of all exported files
 */
async function createManifest(
  pool: Pool,
  outputDir: string
): Promise<void> {
  try {
    console.log('\n📋 Creating manifest...');
    
    // Get county statistics
    const countyStats = await pool.query(`
      SELECT 
        county_name,
        COUNT(*) as parcel_count,
        SUM(area_sqm) / 4046.86 as total_acres
      FROM parcels
      WHERE county_name IS NOT NULL
        AND geom IS NOT NULL
      GROUP BY county_name
      ORDER BY county_name
    `);
    
    const counties = countyStats.rows.map((row: any) => ({
      name: row.county_name,
      parcelCount: parseInt(row.parcel_count),
      totalAcres: parseFloat(row.total_acres).toFixed(1),
      filename: `${row.county_name.toLowerCase().replace(/\s+/g, '-')}.geojson`,
    }));
    
    // Get ownership group count
    const ownershipCount = await pool.query(
      'SELECT COUNT(*) as count FROM parcel_ownership_groups'
    );
    
    const manifest = {
      generated: new Date().toISOString(),
      totalCounties: counties.length,
      totalOwnershipGroups: parseInt(ownershipCount.rows[0].count),
      counties,
      ownershipFile: 'ownership-groups.geojson',
    };
    
    const filepath = path.join(outputDir, 'manifest.json');
    fs.writeFileSync(filepath, JSON.stringify(manifest, null, 2));
    
    console.log(`   ✅ Manifest created with ${counties.length} counties`);
  } catch (error) {
    console.error('   ❌ Error creating manifest:', error);
  }
}

/**
 * Main export function
 */
async function exportParcels(): Promise<void> {
  console.log('🗺️  Iowa Parcel GeoJSON Export');
  console.log('==============================\n');
  
  if (!fs || !path) {
    throw new Error('File system modules are required for export');
  }
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Create output directory
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      console.log(`✅ Created output directory: ${OUTPUT_DIR}\n`);
    }
    
    // Get all counties
    const countiesResult = await pool.query(`
      SELECT DISTINCT county_name
      FROM parcels
      WHERE county_name IS NOT NULL
        AND geom IS NOT NULL
      ORDER BY county_name
    `);
    
    const counties = countiesResult.rows.map((row: any) => row.county_name);
    console.log(`Found ${counties.length} counties to export\n`);
    
    // Export each county
    for (let i = 0; i < counties.length; i++) {
      const county = counties[i];
      console.log(`[${i + 1}/${counties.length}]`, '');
      await exportCountyParcels(pool, county, OUTPUT_DIR);
      
      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Export ownership groups
    await exportOwnershipGroups(pool, OUTPUT_DIR, 1000);
    
    // Create manifest
    await createManifest(pool, OUTPUT_DIR);
    
    // Calculate total size
    const files = fs.readdirSync(OUTPUT_DIR);
    let totalSize = 0;
    files.forEach((file: string) => {
      const stats = fs.statSync(path.join(OUTPUT_DIR, file));
      totalSize += stats.size;
    });
    
    console.log('\n✅ Export complete!');
    console.log(`   Files: ${files.length}`);
    console.log(`   Total size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`   Location: ${OUTPUT_DIR}`);
    
  } catch (error) {
    console.error('\n❌ Export failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the export
exportParcels().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

