import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

async function checkProgress() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  
  try {
    // Get counties with data
    const counties = await pool.query(`
      SELECT county, COUNT(*) as clusters, SUM(parcel_count) as parcels, SUM(total_acres) as acres
      FROM parcel_aggregated
      GROUP BY county
      ORDER BY county
    `);
    
    console.log(`\n📊 Counties Completed: ${counties.rows.length}/98\n`);
    
    if (counties.rows.length > 0) {
      console.log('Completed counties:');
      counties.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. ${row.county}: ${row.clusters} clusters from ${row.parcels} parcels`);
      });
      
      // Total stats
      const totalClusters = counties.rows.reduce((sum, r) => sum + parseInt(r.clusters), 0);
      const totalParcels = counties.rows.reduce((sum, r) => sum + parseInt(r.parcels), 0);
      
      console.log(`\n📈 Total so far:`);
      console.log(`   Clusters: ${totalClusters.toLocaleString()}`);
      console.log(`   Parcels: ${totalParcels.toLocaleString()}`);
    } else {
      console.log('⚠️  No aggregated data found yet');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkProgress();

