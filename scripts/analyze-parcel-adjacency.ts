import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

async function analyzeParcelData(): Promise<void> {
  console.log('🔍 Deep Dive: Iowa Parcel Adjacency Analysis');
  console.log('=============================================\n');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  
  try {
    // 1. Overall ownership statistics
    console.log('📊 Ownership Statistics:\n');
    const ownerStats = await pool.query(`
      SELECT 
        COUNT(*) as owners_with_multiple_parcels,
        SUM(parcel_count) as total_parcels,
        AVG(parcel_count)::numeric(10,1) as avg_parcels,
        MAX(parcel_count) as max_parcels
      FROM parcel_ownership_groups
    `);
    console.log(ownerStats.rows[0]);
    
    // 2. Distribution of parcel counts
    console.log('\n📈 Parcel Count Distribution:\n');
    const distribution = await pool.query(`
      SELECT 
        CASE 
          WHEN parcel_count = 2 THEN '2 parcels'
          WHEN parcel_count BETWEEN 3 AND 5 THEN '3-5 parcels'
          WHEN parcel_count BETWEEN 6 AND 10 THEN '6-10 parcels'
          WHEN parcel_count BETWEEN 11 AND 20 THEN '11-20 parcels'
          WHEN parcel_count BETWEEN 21 AND 50 THEN '21-50 parcels'
          WHEN parcel_count BETWEEN 51 AND 100 THEN '51-100 parcels'
          WHEN parcel_count > 100 THEN '100+ parcels'
        END as range,
        COUNT(*) as owner_count,
        SUM(parcel_count) as total_parcels
      FROM parcel_ownership_groups
      GROUP BY range
      ORDER BY MIN(parcel_count)
    `);
    console.table(distribution.rows);
    
    // 3. Sample owners to test adjacency
    console.log('\n👥 Sample Owners (5-20 parcels):\n');
    const samples = await pool.query(`
      SELECT normalized_owner, parcel_count, total_acres
      FROM parcel_ownership_groups
      WHERE parcel_count BETWEEN 5 AND 20
      ORDER BY parcel_count DESC
      LIMIT 15
    `);
    console.table(samples.rows);
    
    // 4. Test adjacency for one owner
    console.log('\n🔬 Testing Adjacency Detection (Sample Owner):\n');
    const testOwner = samples.rows[0];
    console.log(`Testing: ${testOwner.normalized_owner} (${testOwner.parcel_count} parcels)\n`);
    
    const adjacencyTest = await pool.query(`
      WITH owner_parcels AS (
        SELECT id, geom, county_name, parcel_number
        FROM parcels
        WHERE deed_holder_normalized = $1
          AND geom IS NOT NULL
      ),
      adjacency_matrix AS (
        SELECT 
          p1.id as parcel1_id,
          p2.id as parcel2_id,
          p1.county_name,
          ST_Touches(p1.geom, p2.geom) as touches,
          ST_Distance(p1.geom, p2.geom) as distance
        FROM owner_parcels p1
        CROSS JOIN owner_parcels p2
        WHERE p1.id < p2.id
      )
      SELECT 
        COUNT(*) as total_parcel_pairs,
        SUM(CASE WHEN touches THEN 1 ELSE 0 END) as touching_pairs,
        SUM(CASE WHEN distance < 0.0001 THEN 1 ELSE 0 END) as very_close_pairs,
        AVG(distance)::numeric(10,6) as avg_distance
      FROM adjacency_matrix
    `, [testOwner.normalized_owner]);
    
    console.log('Adjacency Results:');
    console.log(adjacencyTest.rows[0]);
    
    // 5. Estimate performance for full aggregation
    console.log('\n⚡ Performance Estimates:\n');
    const perfEst = await pool.query(`
      SELECT 
        SUM(parcel_count) as total_parcels_to_process,
        SUM(parcel_count * parcel_count) as total_comparisons_needed,
        COUNT(*) as total_owners
      FROM parcel_ownership_groups
      WHERE parcel_count > 1
    `);
    
    const stats = perfEst.rows[0];
    console.log(`Owners to process: ${parseInt(stats.total_owners).toLocaleString()}`);
    console.log(`Parcels to process: ${parseInt(stats.total_parcels_to_process).toLocaleString()}`);
    console.log(`Adjacency checks needed: ${parseInt(stats.total_comparisons_needed).toLocaleString()}`);
    console.log(`Estimated time (naive): ${(parseInt(stats.total_comparisons_needed) / 1000 / 60).toFixed(0)} minutes`);
    
    // 6. Check spatial index performance
    console.log('\n🚀 Spatial Index Information:\n');
    const indexTest = await pool.query(`
      SELECT 
        indexname,
        pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
      FROM pg_indexes
      WHERE tablename = 'parcels' AND indexname LIKE '%geom%'
    `);
    console.table(indexTest.rows);
    
    // 7. Final recommendations
    console.log('\n💡 Recommendations:\n');
    console.log('✅ Process by county to reduce search space (98 counties, exclude Harrison)');
    console.log('✅ Use ST_DWithin + spatial index for fast adjacency detection');
    console.log('✅ Batch small owners (2-5 parcels) separately from large owners');
    console.log('✅ Expected runtime: 7-13 hours for full state (minus Harrison)');
    console.log('✅ Store in new parcel_aggregated table for fast tile generation');
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

analyzeParcelData().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

