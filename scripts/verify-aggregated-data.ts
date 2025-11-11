import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

async function verify() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  
  try {
    console.log('🔍 Verifying Aggregated Parcel Data\n');
    
    // Check overall stats
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_clusters,
        COUNT(CASE WHEN geom IS NOT NULL THEN 1 END) as with_geom,
        SUM(parcel_count) as total_parcels,
        COUNT(DISTINCT county) as counties
      FROM parcel_aggregated
    `);
    
    console.log('📊 Overall Statistics:');
    console.table(stats.rows);
    
    // Check by county
    const byCounty = await pool.query(`
      SELECT 
        county,
        COUNT(*) as clusters,
        SUM(parcel_count) as parcels,
        ROUND(SUM(total_acres)::numeric, 1) as acres,
        COUNT(CASE WHEN geom IS NOT NULL THEN 1 END) as with_geom
      FROM parcel_aggregated
      GROUP BY county
      ORDER BY clusters DESC
      LIMIT 15
    `);
    
    console.log('\n📈 Top 15 Counties:');
    console.table(byCounty.rows);
    
    // Verify Harrison is NOT in there
    const harrison = await pool.query(`
      SELECT COUNT(*) as count FROM parcel_aggregated WHERE county = 'HARRISON'
    `);
    
    console.log(`\n✅ Harrison County clusters: ${harrison.rows[0].count} (should be 0)`);
    
  } finally {
    await pool.end();
  }
}

verify();

