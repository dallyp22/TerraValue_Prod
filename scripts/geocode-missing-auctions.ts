import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '@shared/schema';
import { eq } from 'drizzle-orm';
import { geocodeAuction } from '../server/services/aiGeocoder';

dotenv.config();
neonConfig.webSocketConstructor = ws;

interface GeocodingResult {
  auction_id: number;
  title: string;
  success: boolean;
  method?: string;
  confidence?: string;
  coordinates?: { latitude: number; longitude: number };
  county?: string;
  is_actual_auction?: boolean;
  reasoning?: string;
  error?: string;
}

/**
 * Geocode all auctions without coordinates using AI-enhanced pipeline
 */
async function geocodeMissingAuctions(): Promise<void> {
  console.log('🤖 AI-Enhanced Auction Geocoding');
  console.log('================================\n');
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required - add to .env file');
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle({ client: pool, schema });
  
  try {
    // Get all auctions without coordinates
    const missingCoords = await pool.query(`
      SELECT id, title, description, address, county, state, url, raw_data
      FROM auctions
      WHERE (latitude IS NULL OR longitude IS NULL)
      ORDER BY id DESC
    `);
    
    const auctions = missingCoords.rows;
    console.log(`Found ${auctions.length} auctions without coordinates\n`);
    
    const results: GeocodingResult[] = [];
    let successCount = 0;
    let failCount = 0;
    let nonAuctionCount = 0;
    
    // Process each auction
    for (let i = 0; i < auctions.length; i++) {
      const auction = auctions[i];
      console.log(`\n[${i + 1}/${auctions.length}] Processing auction ${auction.id}`);
      console.log('─'.repeat(60));
      
      try {
        const result = await geocodeAuction(auction, pool);
        
        const geocodingResult: GeocodingResult = {
          auction_id: auction.id,
          title: auction.title,
          ...result
        };
        
        results.push(geocodingResult);
        
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
                ai_analysis: result.reasoning
              },
              updatedAt: new Date()
            })
            .where(eq(schema.auctions.id, auction.id));
          
          console.log(`   ✅ Updated in database`);
          successCount++;
          
        } else if (result.is_actual_auction === false) {
          // Mark as non-auction (blog post/article)
          await db.update(schema.auctions)
            .set({
              status: 'excluded',
              rawData: {
                ...(auction.raw_data || {}),
                exclusion_reason: result.reasoning,
                excluded_at: new Date().toISOString()
              },
              updatedAt: new Date()
            })
            .where(eq(schema.auctions.id, auction.id));
          
          console.log(`   ⚠️  Marked as non-auction`);
          nonAuctionCount++;
          
        } else {
          console.log(`   ❌ Failed: ${result.error}`);
          failCount++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`   ❌ Error processing auction ${auction.id}:`, error);
        failCount++;
        
        results.push({
          auction_id: auction.id,
          title: auction.title,
          success: false,
          error: String(error)
        });
      }
    }
    
    // Generate summary report
    console.log('\n' + '='.repeat(60));
    console.log('📊 Geocoding Summary');
    console.log('='.repeat(60));
    console.log(`\nTotal processed: ${auctions.length}`);
    console.log(`✅ Successfully geocoded: ${successCount}`);
    console.log(`⚠️  Non-auctions excluded: ${nonAuctionCount}`);
    console.log(`❌ Failed: ${failCount}\n`);
    
    // Breakdown by method
    const methodBreakdown: { [key: string]: number } = {};
    results.filter(r => r.success).forEach(r => {
      const method = r.method || 'unknown';
      methodBreakdown[method] = (methodBreakdown[method] || 0) + 1;
    });
    
    console.log('📈 Geocoding Methods Used:\n');
    Object.entries(methodBreakdown).forEach(([method, count]) => {
      console.log(`   ${method}: ${count}`);
    });
    
    // Confidence breakdown
    const confidenceBreakdown: { [key: string]: number } = {};
    results.filter(r => r.success).forEach(r => {
      const conf = r.confidence || 'unknown';
      confidenceBreakdown[conf] = (confidenceBreakdown[conf] || 0) + 1;
    });
    
    console.log('\n📊 Confidence Levels:\n');
    Object.entries(confidenceBreakdown).forEach(([conf, count]) => {
      console.log(`   ${conf}: ${count}`);
    });
    
    // Save detailed results
    const fs = await import('fs');
    fs.writeFileSync(
      'geocoding-results.json',
      JSON.stringify(results, null, 2)
    );
    console.log(`\n💾 Detailed results saved to: geocoding-results.json`);
    
  } catch (error) {
    console.error('\n❌ Geocoding failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

geocodeMissingAuctions().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

