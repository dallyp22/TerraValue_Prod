import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

/**
 * Generate comprehensive comparison report between aggregation methods
 */
async function generateComparisonReport(): Promise<void> {
  console.log('📊 Parcel Aggregation Comparison Report');
  console.log('=======================================\n');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  
  try {
    // 1. Overall statistics
    console.log('1️⃣  OVERALL STATISTICS\n');
    
    const rawParcels = await pool.query(`
      SELECT COUNT(*) as count, SUM(area_sqm)/4046.86 as acres
      FROM parcels WHERE geom IS NOT NULL
    `);
    
    const ownershipGroups = await pool.query(`
      SELECT COUNT(*) as count, SUM(total_acres) as acres
      FROM parcel_ownership_groups
    `);
    
    const adjacentClusters = await pool.query(`
      SELECT COUNT(*) as count, SUM(total_acres) as acres
      FROM parcel_aggregated
    `);
    
    console.log('Raw Parcels (Individual):');
    console.log(`  Count: ${parseInt(rawParcels.rows[0].count).toLocaleString()}`);
    console.log(`  Acres: ${parseFloat(rawParcels.rows[0].acres).toLocaleString()}\n`);
    
    console.log('Ownership Groups (ALL parcels by owner):');
    console.log(`  Count: ${parseInt(ownershipGroups.rows[0].count).toLocaleString()}`);
    console.log(`  Acres: ${parseFloat(ownershipGroups.rows[0].acres).toLocaleString()}`);
    console.log(`  Reduction: ${((1 - parseInt(ownershipGroups.rows[0].count) / parseInt(rawParcels.rows[0].count)) * 100).toFixed(1)}%\n`);
    
    console.log('Adjacent Clusters (ONLY touching parcels):');
    console.log(`  Count: ${parseInt(adjacentClusters.rows[0].count).toLocaleString()}`);
    console.log(`  Acres: ${parseFloat(adjacentClusters.rows[0].acres).toLocaleString()}`);
    console.log(`  Reduction: ${((1 - parseInt(adjacentClusters.rows[0].count) / parseInt(rawParcels.rows[0].count)) * 100).toFixed(1)}%\n`);
    
    // 2. By county comparison
    console.log('2️⃣  COUNTY-BY-COUNTY BREAKDOWN\n');
    
    const countyComparison = await pool.query(`
      SELECT 
        p.county_name,
        COUNT(DISTINCT p.id) as raw_parcels,
        COUNT(DISTINCT pa.id) as aggregated_clusters,
        ROUND((1 - COUNT(DISTINCT pa.id)::float / COUNT(DISTINCT p.id)) * 100, 1) as reduction_pct
      FROM parcels p
      LEFT JOIN parcel_aggregated pa ON p.county_name = pa.county
        AND p.deed_holder_normalized = pa.normalized_owner
        AND p.id = ANY((pa.parcel_ids::text)::int[])
      WHERE p.geom IS NOT NULL
        AND p.county_name != 'HARRISON'  -- Excluded from aggregation
      GROUP BY p.county_name
      ORDER BY raw_parcels DESC
      LIMIT 15
    `);
    
    console.log('Top 15 Counties by Parcel Count:\n');
    console.table(countyComparison.rows);
    
    // 3. Largest combined parcels
    console.log('\n3️⃣  LARGEST ADJACENT PARCEL CLUSTERS\n');
    
    const largest = await pool.query(`
      SELECT 
        normalized_owner as owner,
        county,
        parcel_count,
        ROUND(total_acres::numeric, 1) as acres
      FROM parcel_aggregated
      ORDER BY parcel_count DESC
      LIMIT 20
    `);
    
    console.table(largest.rows);
    
    // 4. Comparison with Harrison County method
    console.log('\n4️⃣  HARRISON COUNTY COMPARISON\n');
    
    const harrisonStats = await pool.query(`
      SELECT 
        COUNT(*) as total_parcels,
        COUNT(DISTINCT deed_holder_normalized) as unique_owners,
        SUM(area_sqm) / 4046.86 as total_acres
      FROM parcels
      WHERE county_name = 'HARRISON'
        AND geom IS NOT NULL
    `);
    
    console.log('Harrison County (Client-side aggregation):');
    console.log(`  Total parcels: ${parseInt(harrisonStats.rows[0].total_parcels).toLocaleString()}`);
    console.log(`  Unique owners: ${parseInt(harrisonStats.rows[0].unique_owners).toLocaleString()}`);
    console.log(`  Total acres: ${parseFloat(harrisonStats.rows[0].total_acres).toLocaleString()}`);
    console.log(`  Method: Real-time Turf.js aggregation`);
    console.log(`  Performance: Instant (runs in browser on visible parcels)\n`);
    
    // 5. Feature count reduction analysis
    console.log('5️⃣  FEATURE REDUCTION ANALYSIS\n');
    
    const reductionBySize = await pool.query(`
      SELECT 
        CASE 
          WHEN parcel_count = 2 THEN '2 parcels'
          WHEN parcel_count BETWEEN 3 AND 5 THEN '3-5 parcels'
          WHEN parcel_count BETWEEN 6 AND 10 THEN '6-10 parcels'
          WHEN parcel_count BETWEEN 11 AND 50 THEN '11-50 parcels'
          WHEN parcel_count > 50 THEN '50+ parcels'
        END as cluster_size,
        COUNT(*) as cluster_count,
        SUM(parcel_count) as parcels_combined,
        ROUND(AVG(total_acres)::numeric, 1) as avg_acres
      FROM parcel_aggregated
      GROUP BY cluster_size
      ORDER BY MIN(parcel_count)
    `);
    
    console.table(reductionBySize.rows);
    
    // 6. Summary
    const rawCount = parseInt(rawParcels.rows[0].count);
    const aggCount = parseInt(adjacentClusters.rows[0].count);
    const fewerFeatures = rawCount - aggCount;
    const reductionPct = ((fewerFeatures / rawCount) * 100).toFixed(1);
    
    console.log('\n✅ SUMMARY\n');
    console.log('═'.repeat(60));
    console.log(`Original parcels: ${rawCount.toLocaleString()}`);
    console.log(`After adjacent aggregation: ${aggCount.toLocaleString()}`);
    console.log(`Features reduced: ${fewerFeatures.toLocaleString()} (${reductionPct}%)`);
    console.log('═'.repeat(60));
    console.log('\n💡 Benefits:');
    console.log('  ✅ Cleaner map visualization');
    console.log('  ✅ Faster tile generation');
    console.log('  ✅ Better understanding of contiguous land ownership');
    console.log('  ✅ Consistent experience across all Iowa counties');
    console.log('  ✅ Harrison County keeps its optimized client-side method\n');
    
  } catch (error) {
    console.error('❌ Report generation failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

generateComparisonReport().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

