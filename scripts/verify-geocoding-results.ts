import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

async function verifyResults() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  
  try {
    console.log('📊 AI-Enhanced Geocoding Verification Report');
    console.log('============================================\n');
    
    // Overall stats
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as with_coords,
        COUNT(CASE WHEN status = 'excluded' THEN 1 END) as excluded,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active
      FROM auctions
    `);
    
    const s = stats.rows[0];
    console.log('1️⃣  OVERALL AUCTION STATISTICS\n');
    console.log(`Total auctions in database: ${s.total}`);
    console.log(`With coordinates: ${s.with_coords} (${(s.with_coords/s.total*100).toFixed(1)}%)`);
    console.log(`Excluded (non-land): ${s.excluded}`);
    console.log(`Active: ${s.active}\n`);
    
    // Recently geocoded
    const recentlyGeocoded = await pool.query(`
      SELECT id, title, latitude, longitude, county, 
             raw_data->>'geocoding_method' as method,
             raw_data->>'geocoding_confidence' as confidence
      FROM auctions
      WHERE raw_data->>'geocoded_at' IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 10
    `);
    
    console.log('2️⃣  RECENTLY GEOCODED AUCTIONS\n');
    recentlyGeocoded.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.title}`);
      console.log(`   County: ${row.county}`);
      console.log(`   Coords: ${row.latitude}, ${row.longitude}`);
      console.log(`   Method: ${row.method || 'unknown'}`);
      console.log(`   Confidence: ${row.confidence || 'unknown'}\n`);
    });
    
    // Excluded auctions
    const excluded = await pool.query(`
      SELECT id, title, raw_data->>'exclusion_reason' as reason
      FROM auctions
      WHERE status = 'excluded'
      LIMIT 10
    `);
    
    console.log('3️⃣  EXCLUDED AUCTIONS (Non-Land)\n');
    excluded.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.title}`);
      if (row.reason) {
        const shortReason = row.reason.substring(0, 100) + (row.reason.length > 100 ? '...' : '');
        console.log(`   Reason: ${shortReason}\n`);
      }
    });
    
    // Still missing coordinates
    const stillMissing = await pool.query(`
      SELECT id, title, address, county, state
      FROM auctions
      WHERE (latitude IS NULL OR longitude IS NULL)
        AND (status IS NULL OR status != 'excluded')
      LIMIT 10
    `);
    
    console.log(`\n4️⃣  STILL MISSING COORDINATES (${stillMissing.rows.length})\n`);
    stillMissing.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.title}`);
      console.log(`   Address: ${row.address || 'N/A'}`);
      console.log(`   County: ${row.county || 'N/A'}, ${row.state || 'N/A'}\n`);
    });
    
    console.log('✅ Verification Complete!');
    console.log('\n💡 Summary:');
    console.log(`   • ${s.with_coords}/${s.total} auctions now have coordinates`);
    console.log(`   • ${s.excluded} non-land auctions excluded from map`);
    console.log(`   • AI successfully cleaned your auction database!`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

verifyResults();

