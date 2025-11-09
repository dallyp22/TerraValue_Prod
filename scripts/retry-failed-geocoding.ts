import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '@shared/schema';
import { eq, and, or, isNull } from 'drizzle-orm';
import { geocodeAuction } from '../server/services/aiGeocoder';

dotenv.config();
neonConfig.webSocketConstructor = ws;

/**
 * Retry geocoding on the 6 failed auctions now that Mapbox is configured
 */
async function retryFailedGeocoding(): Promise<void> {
  console.log('🔄 Retrying Failed Geocoding with Mapbox');
  console.log('=========================================\n');
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const db = drizzle({ client: pool, schema });
  
  try {
    // Get auctions that are still missing coordinates and are not excluded
    const failed = await pool.query(`
      SELECT id, title, description, address, county, state, url, raw_data
      FROM auctions
      WHERE (latitude IS NULL OR longitude IS NULL)
        AND (status IS NULL OR status != 'excluded')
      ORDER BY id
    `);
    
    console.log(`Found ${failed.rows.length} auctions still needing geocoding\n`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < failed.rows.length; i++) {
      const auction = failed.rows[i];
      
      console.log(`\n[${i + 1}/${failed.rows.length}] Retrying auction ${auction.id}`);
      console.log('─'.repeat(60));
      
      const result = await geocodeAuction(auction, pool);
      
      if (result.success && result.coordinates) {
        // Update database
        await db.update(schema.auctions)
          .set({
            latitude: result.coordinates.latitude,
            longitude: result.coordinates.longitude,
            county: result.county || auction.county,
            rawData: {
              ...(auction.raw_data || {}),
              geocoding_method: result.method,
              geocoding_confidence: result.confidence,
              geocoded_at: new Date().toISOString(),
              geocoded_with_mapbox: true
            },
            updatedAt: new Date()
          })
          .where(eq(schema.auctions.id, auction.id));
        
        console.log(`✅ SUCCESS - Updated in database`);
        successCount++;
        
      } else {
        console.log(`❌ FAILED - ${result.error || 'Unknown error'}`);
        failCount++;
      }
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Retry Summary');
    console.log('='.repeat(60));
    console.log(`\nTotal retried: ${failed.rows.length}`);
    console.log(`✅ Newly geocoded: ${successCount}`);
    console.log(`❌ Still failed: ${failCount}\n`);
    
    // Final stats
    const finalStats = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as with_coords,
        COUNT(CASE WHEN status = 'excluded' THEN 1 END) as excluded
      FROM auctions
    `);
    
    const s = finalStats.rows[0];
    const coverage = (s.with_coords / s.total * 100).toFixed(1);
    
    console.log('🎯 Final Coverage:');
    console.log(`   Total auctions: ${s.total}`);
    console.log(`   With coordinates: ${s.with_coords} (${coverage}%)`);
    console.log(`   Excluded: ${s.excluded}`);
    console.log(`   Active land auctions: ${s.total - s.excluded}\n`);
    
  } catch (error) {
    console.error('\n❌ Retry failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

retryFailedGeocoding().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

