import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from '@shared/schema';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Configure WebSocket for Neon
import { neonConfig } from '@neondatabase/serverless';
neonConfig.webSocketConstructor = ws;

const ARCGIS_BASE_URL = 'https://services3.arcgis.com/kd9gaiUExYqUbnoq/arcgis/rest/services/Iowa_Parcels_2017/FeatureServer/0';
const BATCH_SIZE = 2000; // ArcGIS max
const INSERT_BATCH_SIZE = 1000; // PostgreSQL batch insert size
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

interface ParcelFeature {
  geometry: {
    rings: number[][][];
  };
  attributes: {
    OBJECTID: number;
    COUNTYNAME: string;
    STATEPARID: string;
    UNPARCELID: string;
    PARCELNUMB: string;
    PARCELCLAS: string;
    DEEDHOLDER: string;
    Shape__Area: number;
    Shape__Length: number;
  };
}

// Progress tracking file
const PROGRESS_FILE = './parcel-load-progress.json';
let fs: any;
try {
  fs = await import('fs');
} catch (e) {
  // In production, fs might not be available
}

/**
 * Setup PostGIS extension and add geometry columns
 */
async function setupPostGIS(pool: Pool): Promise<void> {
  console.log('🔧 Setting up PostGIS extension...');
  
  try {
    // Enable PostGIS extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS postgis');
    console.log('✅ PostGIS extension enabled');
    
    // Check if geometry column already exists
    const checkGeomCol = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'parcels' AND column_name = 'geom'
    `);
    
    if (checkGeomCol.rows.length === 0) {
      // Add geometry column to parcels table
      await pool.query(`
        SELECT AddGeometryColumn('parcels', 'geom', 4326, 'MULTIPOLYGON', 2)
      `);
      console.log('✅ Added geometry column to parcels table');
      
      // Create spatial index
      await pool.query(`
        CREATE INDEX IF NOT EXISTS parcels_geom_idx 
        ON parcels USING GIST(geom)
      `);
      console.log('✅ Created spatial index on parcels.geom');
    } else {
      console.log('ℹ️  Geometry column already exists');
    }
    
    // Check if geometry column exists for ownership groups
    const checkOwnershipGeomCol = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'parcel_ownership_groups' AND column_name = 'combined_geom'
    `);
    
    if (checkOwnershipGeomCol.rows.length === 0) {
      // Add geometry column to parcel_ownership_groups table
      await pool.query(`
        SELECT AddGeometryColumn('parcel_ownership_groups', 'combined_geom', 4326, 'MULTIPOLYGON', 2)
      `);
      console.log('✅ Added geometry column to parcel_ownership_groups table');
      
      // Create spatial index
      await pool.query(`
        CREATE INDEX IF NOT EXISTS ownership_groups_geom_idx 
        ON parcel_ownership_groups USING GIST(combined_geom)
      `);
      console.log('✅ Created spatial index on parcel_ownership_groups.combined_geom');
    } else {
      console.log('ℹ️  Ownership groups geometry column already exists');
    }
  } catch (error) {
    console.error('❌ Error setting up PostGIS:', error);
    throw error;
  }
}

/**
 * Normalize owner name for fuzzy matching
 */
function normalizeOwnerName(name: string | null): string | null {
  if (!name) return null;
  
  return name
    .toUpperCase()
    // Remove common suffixes
    .replace(/\s+(LLC|INC|INCORPORATED|TRUST|ESTATE|REVOCABLE|IRREVOCABLE|FAMILY|FARMS?|PROPERTIES|L\.?L\.?C\.?|CORP|CORPORATION)\.?$/gi, '')
    // Flip "LASTNAME, FIRSTNAME" to "FIRSTNAME LASTNAME"
    .replace(/^([^,]+),\s*(.+)$/, '$2 $1')
    // Remove punctuation except spaces
    .replace(/[^\w\s]/g, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get total count of parcels from ArcGIS
 */
async function getTotalCount(): Promise<number> {
  const url = `${ARCGIS_BASE_URL}/query?where=1%3D1&returnCountOnly=true&f=json`;
  
  try {
    const response = await axios.get(url, { timeout: 30000 });
    return response.data.count || 0;
  } catch (error) {
    console.error('Error getting total count:', error);
    throw error;
  }
}

/**
 * Fetch parcel data from ArcGIS with pagination
 */
async function fetchParcelBatch(offset: number, retryCount = 0): Promise<ParcelFeature[]> {
  const url = `${ARCGIS_BASE_URL}/query`;
  const params = {
    where: '1=1',
    outFields: 'OBJECTID,COUNTYNAME,STATEPARID,UNPARCELID,PARCELNUMB,PARCELCLAS,DEEDHOLDER,Shape__Area,Shape__Length',
    resultOffset: offset,
    resultRecordCount: BATCH_SIZE,
    geometryPrecision: 6, // Reduce precision to save bandwidth
    returnGeometry: true,
    f: 'json',
  };
  
  try {
    const response = await axios.get(url, { 
      params,
      timeout: 60000, // 60 second timeout
    });
    
    if (response.data.features) {
      return response.data.features;
    } else {
      console.warn('No features in response');
      return [];
    }
  } catch (error: any) {
    if (retryCount < MAX_RETRIES) {
      console.warn(`Retry ${retryCount + 1}/${MAX_RETRIES} for offset ${offset}...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return fetchParcelBatch(offset, retryCount + 1);
    }
    console.error(`Failed to fetch batch at offset ${offset}:`, error.message);
    throw error;
  }
}

/**
 * Convert ESRI polygon rings to WKT MULTIPOLYGON
 */
function ringsToWKT(rings: number[][][]): string {
  if (!rings || rings.length === 0) {
    return 'MULTIPOLYGON EMPTY';
  }
  
  // Group rings into polygons (first ring is exterior, subsequent rings are holes)
  const polygons: string[] = [];
  let currentPolygon: string[] = [];
  
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    const ringWKT = ring.map(coord => `${coord[0]} ${coord[1]}`).join(', ');
    
    // Check if this is an exterior ring (clockwise) or hole (counter-clockwise)
    // For simplicity, we'll treat each ring as a separate polygon
    // In a more sophisticated implementation, we'd group holes with their parent polygons
    if (currentPolygon.length === 0) {
      currentPolygon.push(`(${ringWKT})`);
    } else {
      // Start new polygon
      polygons.push(`(${currentPolygon.join(', ')})`);
      currentPolygon = [`(${ringWKT})`];
    }
  }
  
  // Add last polygon
  if (currentPolygon.length > 0) {
    polygons.push(`(${currentPolygon.join(', ')})`);
  }
  
  return `MULTIPOLYGON(${polygons.join(', ')})`;
}

/**
 * Insert batch of parcels into database
 */
async function insertParcelBatch(pool: Pool, features: ParcelFeature[]): Promise<number> {
  if (features.length === 0) return 0;
  
  try {
    // Build VALUES clause for batch insert
    const values: any[] = [];
    const placeholders: string[] = [];
    
    features.forEach((feature, idx) => {
      const attrs = feature.attributes;
      
      // Skip parcels without valid geometry
      if (!feature.geometry || !feature.geometry.rings || feature.geometry.rings.length === 0) {
        console.warn(`Skipping parcel ${attrs.PARCELNUMB || 'unknown'} - no geometry`);
        return;
      }
      
      const geomWKT = ringsToWKT(feature.geometry.rings);
      
      const baseIdx = values.length;
      placeholders.push(
        `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8}, ST_GeomFromText($${baseIdx + 9}, 4326))`
      );
      
      values.push(
        attrs.COUNTYNAME || null,
        attrs.STATEPARID || null,
        attrs.PARCELNUMB || null,
        attrs.PARCELCLAS || null,
        attrs.DEEDHOLDER || null,
        normalizeOwnerName(attrs.DEEDHOLDER),
        attrs.Shape__Area || null,
        attrs.Shape__Length || null,
        geomWKT
      );
    });
    
    // If all features were skipped due to missing geometry, return 0
    if (placeholders.length === 0) {
      console.warn('All features in batch skipped due to missing geometry');
      return 0;
    }
    
    const sql = `
      INSERT INTO parcels (
        county_name, state_parcel_id, parcel_number, parcel_class,
        deed_holder, deed_holder_normalized, area_sqm, length_m, geom
      )
      VALUES ${placeholders.join(', ')}
      ON CONFLICT DO NOTHING
    `;
    
    const result = await pool.query(sql, values);
    return result.rowCount || 0;
  } catch (error) {
    console.error('Error inserting batch:', error);
    throw error;
  }
}

/**
 * Load progress from file
 */
function loadProgress(): { offset: number; totalInserted: number } {
  if (!fs) return { offset: 0, totalInserted: 0 };
  
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.warn('Could not load progress file:', error);
  }
  return { offset: 0, totalInserted: 0 };
}

/**
 * Save progress to file
 */
function saveProgress(offset: number, totalInserted: number): void {
  if (!fs) return;
  
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ offset, totalInserted }, null, 2));
  } catch (error) {
    console.warn('Could not save progress file:', error);
  }
}

/**
 * Main function to load all Iowa parcel data
 */
async function loadIowaParcels(): Promise<void> {
  console.log('🏡 Iowa Parcel Data Loader');
  console.log('==========================\n');
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool, schema });
  
  try {
    // Setup PostGIS
    await setupPostGIS(pool);
    
    // Get total count
    console.log('\n📊 Fetching total parcel count...');
    const totalCount = await getTotalCount();
    console.log(`Total parcels to download: ${totalCount.toLocaleString()}\n`);
    
    // Load previous progress
    const progress = loadProgress();
    let offset = progress.offset;
    let totalInserted = progress.totalInserted;
    
    if (offset > 0) {
      console.log(`📍 Resuming from offset ${offset.toLocaleString()} (${totalInserted.toLocaleString()} already inserted)\n`);
    }
    
    const startTime = Date.now();
    let batchCount = 0;
    
    // Fetch and insert in batches
    while (offset < totalCount) {
      batchCount++;
      const batchStartTime = Date.now();
      
      console.log(`\n📦 Batch ${batchCount}: Fetching records ${offset + 1} - ${Math.min(offset + BATCH_SIZE, totalCount)}...`);
      
      // Fetch batch from ArcGIS
      const features = await fetchParcelBatch(offset);
      
      if (features.length === 0) {
        console.log('No more features returned. Stopping.');
        break;
      }
      
      console.log(`   Downloaded ${features.length} features`);
      
      // Split into smaller batches for insertion
      for (let i = 0; i < features.length; i += INSERT_BATCH_SIZE) {
        const insertBatch = features.slice(i, i + INSERT_BATCH_SIZE);
        const inserted = await insertParcelBatch(pool, insertBatch);
        totalInserted += inserted;
        
        if (insertBatch.length !== inserted) {
          console.log(`   Inserted ${inserted}/${insertBatch.length} (${insertBatch.length - inserted} duplicates skipped)`);
        }
      }
      
      const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(1);
      const progress = ((offset + features.length) / totalCount * 100).toFixed(1);
      const avgTimePerRecord = (Date.now() - startTime) / (offset + features.length);
      const estimatedTimeRemaining = ((totalCount - offset - features.length) * avgTimePerRecord / 1000 / 60).toFixed(1);
      
      console.log(`   ✅ Batch complete in ${batchDuration}s`);
      console.log(`   Progress: ${progress}% | Inserted: ${totalInserted.toLocaleString()} | ETA: ${estimatedTimeRemaining}min`);
      
      // Move to next batch
      offset += features.length;
      
      // Save progress
      saveProgress(offset, totalInserted);
      
      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log('\n✅ Parcel data load complete!');
    console.log(`   Total inserted: ${totalInserted.toLocaleString()}`);
    console.log(`   Total time: ${totalDuration} minutes`);
    
    // Clean up progress file
    if (fs && fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
    }
    
    // Get final counts
    const countResult = await pool.query('SELECT COUNT(*) as count FROM parcels');
    console.log(`\n📊 Final database count: ${parseInt(countResult.rows[0].count).toLocaleString()} parcels`);
    
    // Show sample by county
    const countyStats = await pool.query(`
      SELECT county_name, COUNT(*) as count
      FROM parcels
      WHERE county_name IS NOT NULL
      GROUP BY county_name
      ORDER BY count DESC
      LIMIT 10
    `);
    
    console.log('\n🏆 Top 10 counties by parcel count:');
    countyStats.rows.forEach((row: any) => {
      console.log(`   ${row.county_name}: ${parseInt(row.count).toLocaleString()}`);
    });
    
  } catch (error) {
    console.error('\n❌ Error loading parcels:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the loader
loadIowaParcels().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

