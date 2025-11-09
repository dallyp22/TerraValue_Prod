import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

async function analyzeAuctions() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  
  try {
    console.log('🔍 Auction Geocoding Analysis\n');
    
    // Overall stats
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as with_coords,
        COUNT(CASE WHEN latitude IS NULL OR longitude IS NULL THEN 1 END) as without_coords,
        COUNT(CASE WHEN address IS NOT NULL THEN 1 END) as with_address,
        COUNT(CASE WHEN county IS NOT NULL THEN 1 END) as with_county
      FROM auctions
    `);
    
    const s = stats.rows[0];
    console.log('📊 Overall Statistics:');
    console.log(`   Total auctions: ${s.total}`);
    console.log(`   With coordinates: ${s.with_coords} (${(s.with_coords/s.total*100).toFixed(1)}%)`);
    console.log(`   Without coordinates: ${s.without_coords} (${(s.without_coords/s.total*100).toFixed(1)}%)`);
    console.log(`   With address: ${s.with_address}`);
    console.log(`   With county: ${s.with_county}\n`);
    
    // Sample missing coords
    const samples = await pool.query(`
      SELECT id, title, address, county, state, description, url
      FROM auctions
      WHERE latitude IS NULL OR longitude IS NULL
      ORDER BY id DESC
      LIMIT 10
    `);
    
    console.log('📋 Sample Auctions Without Coordinates:\n');
    samples.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.title}`);
      console.log(`   Address: ${row.address || 'N/A'}`);
      console.log(`   County: ${row.county || 'N/A'}, ${row.state || 'N/A'}`);
      console.log(`   URL: ${row.url}`);
      console.log('');
    });
    
    // Analyze by source
    const bySource = await pool.query(`
      SELECT 
        source_website,
        COUNT(*) as total,
        COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as with_coords,
        COUNT(CASE WHEN latitude IS NULL THEN 1 END) as without_coords
      FROM auctions
      GROUP BY source_website
      ORDER BY total DESC
    `);
    
    console.log('📈 By Source Website:\n');
    console.table(bySource.rows);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

analyzeAuctions();

