import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';
import { processCountyAggregation, setupAggregatedTable } from '../server/services/adjacentParcelCombiner';

dotenv.config();
neonConfig.webSocketConstructor = ws;

/**
 * Test adjacent parcel aggregation on a single county (Polk by default)
 */
async function testCountyAggregation(testCounty = 'POLK'): Promise<void> {
  console.log(`🧪 Testing Adjacent Parcel Aggregation`);
  console.log(`=====================================`);
  console.log(`Test County: ${testCounty}\n`);
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Setup aggregated table
    await setupAggregatedTable(pool);
    
    // Clear any existing test data for this county
    await pool.query('DELETE FROM parcel_aggregated WHERE county = $1', [testCounty]);
    console.log(`✅ Cleared existing aggregated data for ${testCounty} County\n`);
    
    // Get stats before aggregation
    const beforeStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT deed_holder_normalized) as unique_owners,
        COUNT(*) as total_parcels,
        SUM(area_sqm) / 4046.86 as total_acres
      FROM parcels
      WHERE county_name = $1
        AND deed_holder_normalized IS NOT NULL
        AND geom IS NOT NULL
    `, [testCounty]);
    
    console.log(`📊 Before Aggregation:`);
    console.log(`   Unique owners: ${parseInt(beforeStats.rows[0].unique_owners).toLocaleString()}`);
    console.log(`   Total parcels: ${parseInt(beforeStats.rows[0].total_parcels).toLocaleString()}`);
    console.log(`   Total acres: ${parseFloat(beforeStats.rows[0].total_acres).toLocaleString()}\n`);
    
    // Run aggregation
    const startTime = Date.now();
    console.log(`🔄 Running aggregation...\n`);
    
    const result = await processCountyAggregation(pool, testCounty);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`\n⏱️  Aggregation completed in ${duration} seconds`);
    console.log(`   Clusters created: ${result.clustersCreated.toLocaleString()}`);
    console.log(`   Parcels processed: ${result.parcelsProcessed.toLocaleString()}`);
    
    // Reduction ratio
    const reductionPct = ((1 - (result.clustersCreated / result.parcelsProcessed)) * 100).toFixed(1);
    console.log(`   Reduction: ${reductionPct}% fewer features to render`);
    
    // Sample some results
    console.log(`\n📋 Sample Aggregated Parcels:\n`);
    const samples = await pool.query(`
      SELECT normalized_owner, parcel_count, total_acres
      FROM parcel_aggregated
      WHERE county = $1
        AND parcel_count > 2
      ORDER BY parcel_count DESC
      LIMIT 10
    `, [testCounty]);
    
    samples.rows.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.normalized_owner}`);
      console.log(`      ${row.parcel_count} adjacent parcels | ${parseFloat(row.total_acres).toFixed(1)} acres`);
    });
    
    // Performance estimate for full state
    const avgTimePerOwner = (Date.now() - startTime) / result.clustersCreated;
    const totalOwners = 309893; // From analysis
    const estimatedFullTime = (avgTimePerOwner * totalOwners / 1000 / 60 / 60).toFixed(1);
    
    console.log(`\n⚡ Full State Estimate:`);
    console.log(`   Based on ${testCounty} performance:`);
    console.log(`   Estimated time for 98 counties: ~${estimatedFullTime} hours`);
    console.log(`   (Actual time may vary by county size)`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Test with Polk County (largest county by parcel count)
testCountyAggregation('POLK').catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

