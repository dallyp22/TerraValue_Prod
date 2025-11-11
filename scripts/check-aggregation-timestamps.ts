import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

async function checkTimestamps() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  
  try {
    console.log('🕐 Checking Aggregation Timestamps\n');
    
    // When was data created
    const timestamps = await pool.query(`
      SELECT 
        county,
        COUNT(*) as clusters,
        MIN(created_at) as first_created,
        MAX(created_at) as last_created
      FROM parcel_aggregated
      GROUP BY county
      ORDER BY MAX(created_at) DESC
      LIMIT 20
    `);
    
    console.log('Last 20 counties by creation time:');
    console.table(timestamps.rows);
    
    // Check POLK specifically
    const polk = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN parcel_count > 1 THEN 1 END) as multi_parcel_clusters,
        COUNT(CASE WHEN parcel_count = 1 THEN 1 END) as single_parcels,
        MAX(parcel_count) as largest_cluster,
        MIN(created_at) as first,
        MAX(created_at) as last
      FROM parcel_aggregated
      WHERE county = 'POLK'
    `);
    
    console.log('\n📊 POLK County Details:');
    console.table(polk.rows);
    
    // Sample a few to show they exist
    const samples = await pool.query(`
      SELECT 
        id,
        normalized_owner,
        parcel_count,
        total_acres,
        created_at,
        ST_AsText(ST_Centroid(geom)) as centroid
      FROM parcel_aggregated
      WHERE county = 'POLK'
        AND parcel_count > 100
      ORDER BY parcel_count DESC
      LIMIT 5
    `);
    
    console.log('\n🏆 POLK County - Largest Clusters:');
    samples.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.normalized_owner}: ${row.parcel_count} parcels, ${row.total_acres} acres`);
      console.log(`   Created: ${row.created_at}`);
      console.log(`   Centroid: ${row.centroid}\n`);
    });
    
  } finally {
    await pool.end();
  }
}

checkTimestamps();

