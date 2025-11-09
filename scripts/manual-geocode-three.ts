import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';

dotenv.config();
neonConfig.webSocketConstructor = ws;

/**
 * Manually geocode the 3 remaining Iowa auctions
 */
async function manualGeocodeThree(): Promise<void> {
  console.log('📍 Manual Geocoding - 3 Iowa Auctions');
  console.log('=====================================\n');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle({ client: pool, schema });
  
  try {
    // Geocode using OSM for these specific Iowa cities
    const auctions = [
      {
        id: null, // Will find by title
        title: '290.35 Acres in Osceola County, IA',
        city: 'Harris, IA',
        county: 'Osceola'
      },
      {
        id: null,
        title: 'D-Double-U Land Auction',
        city: 'Spencer, IA 51301',
        county: 'Clay'
      },
      {
        id: null,
        title: '80 Acres m/l in O\'Brien County, IA',
        city: 'Primghar, IA 51245',
        county: 'O\'Brien'
      }
    ];
    
    for (const auctionInfo of auctions) {
      console.log(`\n🔍 ${auctionInfo.title}`);
      
      // Find auction ID by title
      const auctionResult = await pool.query(
        'SELECT id FROM auctions WHERE title = $1',
        [auctionInfo.title]
      );
      
      if (auctionResult.rows.length === 0) {
        console.log('   ❌ Auction not found in database');
        continue;
      }
      
      const auctionId = auctionResult.rows[0].id;
      
      // Geocode with OSM
      console.log(`   Geocoding: ${auctionInfo.city}`);
      
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({
          q: auctionInfo.city,
          format: 'json',
          limit: '1'
        })}`, {
          headers: {
            'User-Agent': 'TerraValue-Agricultural-Valuation/1.0'
          }
        });
        
        const data = await response.json();
        
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          
          console.log(`   ✅ Coordinates: ${lat}, ${lng}`);
          
          // Update database
          await db.update(schema.auctions)
            .set({
              latitude: lat,
              longitude: lng,
              county: auctionInfo.county,
              rawData: {
                geocoding_method: 'manual_osm',
                geocoding_confidence: 'medium',
                geocoded_at: new Date().toISOString()
              },
              updatedAt: new Date()
            })
            .where(eq(schema.auctions.id, auctionId));
          
          console.log(`   ✅ Updated in database`);
        } else {
          console.log(`   ❌ OSM geocoding failed`);
        }
        
      } catch (error) {
        console.error(`   ❌ Error:`, error);
      }
      
      // Delay between requests
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    // Final stats
    const finalStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as with_coords
      FROM auctions
      WHERE (status IS NULL OR status != 'excluded')
    `);
    
    const s = finalStats.rows[0];
    const coverage = (s.with_coords / s.total * 100).toFixed(1);
    
    console.log('\n📊 Final Stats:');
    console.log(`   Active auctions: ${s.total}`);
    console.log(`   With coordinates: ${s.with_coords} (${coverage}%)`);
    
  } catch (error) {
    console.error('\n❌ Failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

manualGeocodeThree().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

