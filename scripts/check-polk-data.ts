import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

async function checkPolkData() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  
  try {
    console.log('🔍 Checking Polk County Aggregated Data\n');
    
    // Check count
    const count = await pool.query(`
      SELECT COUNT(*) as count FROM parcel_aggregated WHERE county = 'POLK'
    `);
    console.log(`Aggregated clusters in Polk County: ${count.rows[0].count}`);
    
    // Check geometries
    const withGeom = await pool.query(`
      SELECT COUNT(*) as count FROM parcel_aggregated WHERE county = 'POLK' AND geom IS NOT NULL
    `);
    console.log(`Clusters with geometry: ${withGeom.rows[0].count}\n`);
    
    // Sample data
    const samples = await pool.query(`
      SELECT normalized_owner, parcel_count, total_acres
      FROM parcel_aggregated
      WHERE county = 'POLK'
      ORDER BY parcel_count DESC
      LIMIT 10
    `);
    
    console.log('Top 10 aggregated parcels:\n');
    samples.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.normalized_owner}: ${row.parcel_count} parcels, ${parseFloat(row.total_acres).toFixed(1)} acres`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkPolkData();

