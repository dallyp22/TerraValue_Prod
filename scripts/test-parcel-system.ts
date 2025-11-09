import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration?: number;
}

const results: TestResult[] = [];

/**
 * Add test result
 */
function addResult(name: string, passed: boolean, message: string, duration?: number): void {
  results.push({ name, passed, message, duration });
  const icon = passed ? '✅' : '❌';
  const durationStr = duration ? ` (${duration.toFixed(0)}ms)` : '';
  console.log(`${icon} ${name}: ${message}${durationStr}`);
}

/**
 * Test database connection and PostGIS availability
 */
async function testDatabaseConnection(pool: Pool): Promise<void> {
  console.log('\n🔌 Database Connection Tests\n');
  const startTime = Date.now();
  
  try {
    // Test basic connection
    const result = await pool.query('SELECT NOW() as now');
    const duration = Date.now() - startTime;
    addResult('Database connection', true, 'Connected successfully', duration);
    
    // Test PostGIS extension
    const postgisCheck = await pool.query(`
      SELECT PostGIS_Version() as version
    `);
    
    if (postgisCheck.rows.length > 0) {
      addResult('PostGIS extension', true, `Version: ${postgisCheck.rows[0].version}`);
    } else {
      addResult('PostGIS extension', false, 'PostGIS not available');
    }
  } catch (error) {
    addResult('Database connection', false, `Error: ${error}`);
  }
}

/**
 * Test parcel data integrity
 */
async function testParcelDataIntegrity(pool: Pool): Promise<void> {
  console.log('\n📊 Parcel Data Integrity Tests\n');
  
  try {
    // Count total parcels
    const countStart = Date.now();
    const totalCount = await pool.query('SELECT COUNT(*) as count FROM parcels');
    const count = parseInt(totalCount.rows[0].count);
    const countDuration = Date.now() - countStart;
    
    if (count > 0) {
      addResult('Total parcel count', true, `${count.toLocaleString()} parcels`, countDuration);
    } else {
      addResult('Total parcel count', false, 'No parcels found in database');
      return;
    }
    
    // Check for parcels with geometries
    const geomCount = await pool.query(`
      SELECT COUNT(*) as count 
      FROM parcels 
      WHERE geom IS NOT NULL
    `);
    const geomTotal = parseInt(geomCount.rows[0].count);
    const geomPct = ((geomTotal / count) * 100).toFixed(1);
    
    addResult(
      'Parcels with geometry',
      geomTotal === count,
      `${geomTotal.toLocaleString()} (${geomPct}%)`
    );
    
    // Check for parcels with owner information
    const ownerCount = await pool.query(`
      SELECT COUNT(*) as count 
      FROM parcels 
      WHERE deed_holder IS NOT NULL
    `);
    const ownerTotal = parseInt(ownerCount.rows[0].count);
    const ownerPct = ((ownerTotal / count) * 100).toFixed(1);
    
    addResult(
      'Parcels with owner data',
      ownerTotal > 0,
      `${ownerTotal.toLocaleString()} (${ownerPct}%)`
    );
    
    // Check for normalized owner names
    const normalizedCount = await pool.query(`
      SELECT COUNT(*) as count 
      FROM parcels 
      WHERE deed_holder_normalized IS NOT NULL
    `);
    const normalizedTotal = parseInt(normalizedCount.rows[0].count);
    
    addResult(
      'Normalized owner names',
      normalizedTotal === ownerTotal,
      `${normalizedTotal.toLocaleString()} parcels`
    );
    
    // Check county coverage
    const countyCount = await pool.query(`
      SELECT COUNT(DISTINCT county_name) as count 
      FROM parcels 
      WHERE county_name IS NOT NULL
    `);
    const countyTotal = parseInt(countyCount.rows[0].count);
    
    addResult(
      'County coverage',
      countyTotal >= 90,
      `${countyTotal} counties (expected ~99 Iowa counties)`
    );
    
    // Verify spatial indexes
    const indexCheck = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'parcels' 
        AND indexname = 'parcels_geom_idx'
    `);
    
    addResult(
      'Spatial index on geometry',
      indexCheck.rows.length > 0,
      indexCheck.rows.length > 0 ? 'Index exists' : 'Index missing'
    );
    
  } catch (error) {
    addResult('Parcel data integrity', false, `Error: ${error}`);
  }
}

/**
 * Test ownership aggregation
 */
async function testOwnershipAggregation(pool: Pool): Promise<void> {
  console.log('\n👥 Ownership Aggregation Tests\n');
  
  try {
    // Count ownership groups
    const groupCount = await pool.query(`
      SELECT COUNT(*) as count 
      FROM parcel_ownership_groups
    `);
    const groupTotal = parseInt(groupCount.rows[0].count);
    
    if (groupTotal > 0) {
      addResult('Ownership groups created', true, `${groupTotal.toLocaleString()} groups`);
    } else {
      addResult('Ownership groups created', false, 'No ownership groups found');
      console.log('   ℹ️  Run "npm run db:parcels:aggregate" to create ownership groups');
      return;
    }
    
    // Check for groups with combined geometries
    const geomGroupCount = await pool.query(`
      SELECT COUNT(*) as count 
      FROM parcel_ownership_groups 
      WHERE combined_geom IS NOT NULL
    `);
    const geomGroupTotal = parseInt(geomGroupCount.rows[0].count);
    const geomGroupPct = ((geomGroupTotal / groupTotal) * 100).toFixed(1);
    
    addResult(
      'Groups with combined geometry',
      geomGroupTotal > 0,
      `${geomGroupTotal.toLocaleString()} (${geomGroupPct}%)`
    );
    
    // Find largest owner
    const largestOwner = await pool.query(`
      SELECT normalized_owner, parcel_count, total_acres
      FROM parcel_ownership_groups
      ORDER BY total_acres DESC
      LIMIT 1
    `);
    
    if (largestOwner.rows.length > 0) {
      const largest = largestOwner.rows[0];
      addResult(
        'Largest landowner',
        true,
        `${largest.normalized_owner}: ${parseInt(largest.parcel_count)} parcels, ${parseFloat(largest.total_acres).toFixed(1)} acres`
      );
    }
    
  } catch (error) {
    addResult('Ownership aggregation', false, `Error: ${error}`);
  }
}

/**
 * Test API endpoints
 */
async function testAPIEndpoints(baseURL: string): Promise<void> {
  console.log('\n🌐 API Endpoint Tests\n');
  
  const endpoints = [
    { path: '/api/health', method: 'GET', description: 'Health check' },
    { path: '/api/parcels/ownership/top?limit=10', method: 'GET', description: 'Top landowners' },
  ];
  
  for (const endpoint of endpoints) {
    const startTime = Date.now();
    try {
      const response = await axios.get(`${baseURL}${endpoint.path}`, { timeout: 10000 });
      const duration = Date.now() - startTime;
      
      if (response.status === 200) {
        addResult(
          `${endpoint.method} ${endpoint.path}`,
          true,
          `${endpoint.description} - Status ${response.status}`,
          duration
        );
      } else {
        addResult(
          `${endpoint.method} ${endpoint.path}`,
          false,
          `Unexpected status: ${response.status}`
        );
      }
    } catch (error: any) {
      addResult(
        `${endpoint.method} ${endpoint.path}`,
        false,
        `Error: ${error.message}`
      );
    }
  }
}

/**
 * Test vector tile generation performance
 */
async function testVectorTilePerformance(pool: Pool): Promise<void> {
  console.log('\n🗺️  Vector Tile Generation Tests\n');
  
  // Test a few sample tiles
  const testTiles = [
    { z: 10, x: 263, y: 384, description: 'Low zoom (Iowa)' },
    { z: 14, x: 4213, y: 6156, description: 'High zoom (Des Moines)' },
  ];
  
  for (const tile of testTiles) {
    const startTime = Date.now();
    try {
      const sql = `
        WITH mvtgeom AS (
          SELECT 
            ST_AsMVTGeom(
              geom,
              ST_TileEnvelope($1, $2, $3),
              4096,
              256,
              true
            ) AS geom,
            deed_holder as owner
          FROM parcels
          WHERE geom && ST_TileEnvelope($1, $2, $3)
          LIMIT 1000
        )
        SELECT ST_AsMVT(mvtgeom.*, 'parcels', 4096, 'geom')
        FROM mvtgeom
        WHERE geom IS NOT NULL
      `;
      
      const result = await pool.query(sql, [tile.z, tile.x, tile.y]);
      const duration = Date.now() - startTime;
      
      if (result.rows.length > 0 && result.rows[0].st_asmvt) {
        const tileSize = result.rows[0].st_asmvt.length;
        addResult(
          `Tile ${tile.z}/${tile.x}/${tile.y}`,
          duration < 1000,
          `${tile.description} - ${tileSize} bytes`,
          duration
        );
      } else {
        addResult(
          `Tile ${tile.z}/${tile.x}/${tile.y}`,
          true,
          `${tile.description} - Empty tile`,
          duration
        );
      }
    } catch (error) {
      addResult(
        `Tile ${tile.z}/${tile.x}/${tile.y}`,
        false,
        `Error: ${error}`
      );
    }
  }
}

/**
 * Test spatial queries performance
 */
async function testSpatialQueryPerformance(pool: Pool): Promise<void> {
  console.log('\n📍 Spatial Query Performance Tests\n');
  
  // Test point query (Des Moines coordinates)
  const pointStartTime = Date.now();
  try {
    const result = await pool.query(`
      SELECT id, county_name, parcel_number, deed_holder
      FROM parcels
      WHERE ST_Intersects(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
      LIMIT 5
    `, [-93.6091, 41.5868]); // Des Moines, IA
    
    const duration = Date.now() - pointStartTime;
    addResult(
      'Point intersection query',
      duration < 500,
      `Found ${result.rows.length} parcels at point`,
      duration
    );
  } catch (error) {
    addResult('Point intersection query', false, `Error: ${error}`);
  }
  
  // Test bounding box query
  const bboxStartTime = Date.now();
  try {
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM parcels
      WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
    `, [-93.65, 41.55, -93.55, 41.65]); // ~10km box around Des Moines
    
    const duration = Date.now() - bboxStartTime;
    const count = parseInt(result.rows[0].count);
    addResult(
      'Bounding box query',
      duration < 1000,
      `Found ${count.toLocaleString()} parcels in bbox`,
      duration
    );
  } catch (error) {
    addResult('Bounding box query', false, `Error: ${error}`);
  }
}

/**
 * Main test suite
 */
async function runTests(): Promise<void> {
  console.log('🧪 Iowa Parcel System Test Suite');
  console.log('=================================');
  
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Run all tests
    await testDatabaseConnection(pool);
    await testParcelDataIntegrity(pool);
    await testOwnershipAggregation(pool);
    await testSpatialQueryPerformance(pool);
    await testVectorTilePerformance(pool);
    
    // Test API endpoints if server is running
    const apiURL = process.env.API_URL || 'http://localhost:5000';
    console.log(`\n   Testing API at: ${apiURL}`);
    try {
      await testAPIEndpoints(apiURL);
    } catch (error) {
      console.log('   ⚠️  API tests skipped (server may not be running)');
    }
    
    // Summary
    console.log('\n📋 Test Summary');
    console.log('===============\n');
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => r.failed).length;
    const total = results.length;
    const passRate = ((passed / total) * 100).toFixed(1);
    
    console.log(`Total tests: ${total}`);
    console.log(`Passed: ${passed} (${passRate}%)`);
    console.log(`Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\n❌ Failed tests:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`   - ${r.name}: ${r.message}`);
      });
    }
    
    console.log('\n' + (failed === 0 ? '✅ All tests passed!' : '⚠️  Some tests failed'));
    
    // Exit with appropriate code
    process.exit(failed > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the test suite
runTests();

