import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';
import { geocodeAuction } from '../server/services/aiGeocoder';

dotenv.config();
neonConfig.webSocketConstructor = ws;

/**
 * Test AI-enhanced geocoding on 5 sample auctions
 */
async function testGeocodingSample(): Promise<void> {
  console.log('🧪 Testing AI-Enhanced Geocoding (5 Samples)');
  console.log('============================================\n');
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required - add to .env file');
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Get 5 diverse sample auctions
    const samples = await pool.query(`
      SELECT id, title, description, address, county, state, url, raw_data
      FROM auctions
      WHERE (latitude IS NULL OR longitude IS NULL)
      ORDER BY id DESC
      LIMIT 5
    `);
    
    console.log(`Testing on ${samples.rows.length} auctions:\n`);
    
    const results = [];
    
    for (let i = 0; i < samples.rows.length; i++) {
      const auction = samples.rows[i];
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Test ${i + 1}/5: ${auction.title}`);
      console.log('='.repeat(60));
      
      const result = await geocodeAuction(auction, pool);
      results.push({ auction, result });
      
      if (result.success) {
        console.log(`\n✅ SUCCESS`);
        console.log(`   Method: ${result.method}`);
        console.log(`   Confidence: ${result.confidence}`);
        console.log(`   Coordinates: ${result.coordinates?.latitude}, ${result.coordinates?.longitude}`);
        console.log(`   County: ${result.county || 'Unknown'}`);
      } else if (result.is_actual_auction === false) {
        console.log(`\n⚠️  NON-AUCTION`);
        console.log(`   Reason: ${result.reasoning}`);
      } else {
        console.log(`\n❌ FAILED`);
        console.log(`   Error: ${result.error}`);
      }
      
      // Delay between requests
      if (i < samples.rows.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Test Summary');
    console.log('='.repeat(60));
    
    const successful = results.filter(r => r.result.success).length;
    const nonAuctions = results.filter(r => r.result.is_actual_auction === false).length;
    const failed = results.filter(r => !r.result.success && r.result.is_actual_auction !== false).length;
    
    console.log(`\n✅ Successfully geocoded: ${successful}/${samples.rows.length}`);
    console.log(`⚠️  Non-auctions identified: ${nonAuctions}/${samples.rows.length}`);
    console.log(`❌ Failed: ${failed}/${samples.rows.length}`);
    
    // Method breakdown
    const methods: { [key: string]: number } = {};
    results.filter(r => r.result.success).forEach(r => {
      const method = r.result.method || 'unknown';
      methods[method] = (methods[method] || 0) + 1;
    });
    
    if (Object.keys(methods).length > 0) {
      console.log(`\n📈 Methods Used:`);
      Object.entries(methods).forEach(([method, count]) => {
        console.log(`   ${method}: ${count}`);
      });
    }
    
    console.log('\n💡 Next Steps:');
    if (successful > 0) {
      console.log('   ✅ Test successful! Ready to run full batch:');
      console.log('   npm run auctions:geocode');
    } else {
      console.log('   ⚠️  Review errors and adjust before running full batch');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

testGeocodingSample().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

