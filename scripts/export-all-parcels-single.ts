import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

const OUTPUT_FILE = './iowa-parcels-complete.geojson';
const BATCH_SIZE = 10000; // Process in batches to avoid memory issues

let fs: any;
try {
  fs = await import('fs');
} catch (e) {
  console.error('File system module not available');
}

/**
 * Export ALL Iowa parcels as a single GeoJSON file
 * WARNING: This will create a 2-5 GB file!
 */
async function exportAllParcels(): Promise<void> {
  console.log('🗺️  Exporting ALL Iowa Parcels to Single GeoJSON');
  console.log('=================================================');
  console.warn('⚠️  This will create a VERY LARGE file (2-5 GB)');
  console.log('');
  
  if (!fs) {
    throw new Error('File system module is required for export');
  }
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) as count FROM parcels WHERE geom IS NOT NULL');
    const totalCount = parseInt(countResult.rows[0].count);
    console.log(`Total parcels to export: ${totalCount.toLocaleString()}\n`);
    
    // Start writing GeoJSON file
    const header = {
      type: 'FeatureCollection',
      name: 'Iowa Parcels Complete Dataset',
      crs: {
        type: 'name',
        properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' }
      },
      features: [] as any[]
    };
    
    // Write header
    fs.writeFileSync(OUTPUT_FILE, '{\n');
    fs.appendFileSync(OUTPUT_FILE, '  "type": "FeatureCollection",\n');
    fs.appendFileSync(OUTPUT_FILE, '  "name": "Iowa Parcels Complete Dataset",\n');
    fs.appendFileSync(OUTPUT_FILE, '  "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:OGC:1.3:CRS84" } },\n');
    fs.appendFileSync(OUTPUT_FILE, '  "features": [\n');
    
    let offset = 0;
    let totalExported = 0;
    let isFirstFeature = true;
    
    while (offset < totalCount) {
      console.log(`Processing ${offset.toLocaleString()} - ${Math.min(offset + BATCH_SIZE, totalCount).toLocaleString()}...`);
      
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
          ST_AsGeoJSON(geom) as geometry
        FROM parcels
        WHERE geom IS NOT NULL
        ORDER BY id
        LIMIT $1 OFFSET $2
      `, [BATCH_SIZE, offset]);
      
      for (const row of result.rows) {
        const feature = {
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
        };
        
        // Add comma before feature if not first
        if (!isFirstFeature) {
          fs.appendFileSync(OUTPUT_FILE, ',\n');
        }
        isFirstFeature = false;
        
        fs.appendFileSync(OUTPUT_FILE, '    ' + JSON.stringify(feature));
        totalExported++;
      }
      
      offset += BATCH_SIZE;
      
      // Progress update
      const pct = ((offset / totalCount) * 100).toFixed(1);
      console.log(`  Exported ${totalExported.toLocaleString()} parcels (${pct}%)`);
    }
    
    // Close features array and file
    fs.appendFileSync(OUTPUT_FILE, '\n  ]\n}\n');
    
    // Get file size
    const stats = fs.statSync(OUTPUT_FILE);
    const fileSizeGB = (stats.size / (1024 * 1024 * 1024)).toFixed(2);
    
    console.log('\n✅ Export complete!');
    console.log(`   Total parcels: ${totalExported.toLocaleString()}`);
    console.log(`   File size: ${fileSizeGB} GB`);
    console.log(`   Location: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('\n❌ Export failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the export
exportAllParcels().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

