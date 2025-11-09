// Load environment variables FIRST before any imports
import dotenv from 'dotenv';
dotenv.config();

import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

/**
 * Aggregate parcels by owner and store in parcel_ownership_groups table
 * This creates combined geometries for all parcels owned by the same entity
 */
async function aggregateOwnershipData(pool: Pool): Promise<void> {
  console.log('🔄 Aggregating ownership data...');
  
  try {
    // Clear existing ownership groups
    await pool.query('TRUNCATE TABLE parcel_ownership_groups');
    
    // Aggregate parcels by owner using PostGIS ST_Union
    const aggregateSQL = `
      INSERT INTO parcel_ownership_groups (
        normalized_owner, parcel_count, total_acres, parcel_ids, combined_geom
      )
      SELECT 
        deed_holder_normalized,
        COUNT(*) as parcel_count,
        SUM(area_sqm) / 4046.86 as total_acres,
        to_json(ARRAY_AGG(id)) as parcel_ids,
        ST_Union(geom) as combined_geom
      FROM parcels
      WHERE deed_holder_normalized IS NOT NULL
        AND geom IS NOT NULL
      GROUP BY deed_holder_normalized
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `;
    
    const result = await pool.query(aggregateSQL);
    const rowCount = result.rowCount || 0;
    
    console.log(`✅ Created ${rowCount.toLocaleString()} ownership groups`);
    
    // Get statistics
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_groups,
        SUM(parcel_count) as total_parcels,
        SUM(total_acres) as total_acres,
        MAX(parcel_count) as max_parcels,
        AVG(parcel_count) as avg_parcels
      FROM parcel_ownership_groups
    `);
    
    if (statsResult.rows.length > 0) {
      const stats = statsResult.rows[0];
      console.log('\n📊 Ownership Aggregation Statistics:');
      console.log(`   Total ownership groups: ${parseInt(stats.total_groups).toLocaleString()}`);
      console.log(`   Total parcels in groups: ${parseInt(stats.total_parcels).toLocaleString()}`);
      console.log(`   Total acres in groups: ${parseFloat(stats.total_acres).toLocaleString()}`);
      console.log(`   Largest owner (parcels): ${parseInt(stats.max_parcels).toLocaleString()}`);
      console.log(`   Average parcels per owner: ${parseFloat(stats.avg_parcels).toFixed(1)}`);
    }
    
    // Show top 10 owners
    const topOwnersResult = await pool.query(`
      SELECT normalized_owner, parcel_count, total_acres
      FROM parcel_ownership_groups
      ORDER BY total_acres DESC
      LIMIT 10
    `);
    
    console.log('\n🏆 Top 10 Landowners by Acreage:');
    topOwnersResult.rows.forEach((row: any, idx: number) => {
      console.log(`   ${idx + 1}. ${row.normalized_owner}`);
      console.log(`      ${parseInt(row.parcel_count)} parcels | ${parseFloat(row.total_acres).toFixed(1)} acres`);
    });
    
  } catch (error) {
    console.error('❌ Error aggregating ownership data:', error);
    throw error;
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  console.log('🏡 Parcel Ownership Aggregation');
  console.log('================================\n');
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    await aggregateOwnershipData(pool);
    console.log('\n✅ Ownership aggregation complete!');
  } catch (error) {
    console.error('\n❌ Error aggregating ownership data:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

