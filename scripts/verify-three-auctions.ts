import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

async function verify() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  
  try {
    const result = await pool.query(`
      SELECT id, title, latitude, longitude, county
      FROM auctions
      WHERE title IN (
        '290.35 Acres in Osceola County, IA',
        'D-Double-U Land Auction',
        '80 Acres m/l in O''Brien County, IA'
      )
    `);
    
    console.log('✅ Recently geocoded auctions:\n');
    result.rows.forEach(r => {
      console.log(`${r.title}`);
      console.log(`  ID: ${r.id}`);
      console.log(`  Coords: ${r.latitude}, ${r.longitude}`);
      console.log(`  County: ${r.county}\n`);
    });
    
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as with_coords,
        COUNT(CASE WHEN status = 'excluded' THEN 1 END) as excluded
      FROM auctions
    `);
    
    const s = stats.rows[0];
    console.log('📊 Overall:');
    console.log(`  Total: ${s.total}`);
    console.log(`  With coords: ${s.with_coords}`);
    console.log(`  Excluded: ${s.excluded}`);
    console.log(`  Active with coords: ${s.with_coords - s.excluded}`);
    
  } finally {
    await pool.end();
  }
}

verify();

