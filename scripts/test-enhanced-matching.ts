import "dotenv/config";
import { geminiParserService } from "../server/services/geminiParser";
import { blmPlssService } from "../server/services/blmPlss";
import type { Auction } from "@shared/schema";

async function testEnhancedMatching() {
  console.log('🧪 Testing Enhanced Parcel Matching\n');

  // Test auction with legal description
  const testAuction: Partial<Auction> = {
    id: 999,
    title: "80+/- Acres Pocahontas County, IA - AUCTION",
    description: "Located in Section 28 of Powhatan Township, just three miles south and ½ west of Plover, Iowa",
    enrichedDescription: "The NW 1/4 of Section 28, Township 92N, Range 42W, Pocahontas County, Iowa. Contains approximately 80 acres of prime farmland.",
    county: "Pocahontas",
    state: "Iowa",
    acreage: 80,
    latitude: 42.086952,
    longitude: -93.49678
  };

  console.log('📋 Test Auction:');
  console.log(`   Title: ${testAuction.title}`);
  console.log(`   County: ${testAuction.county}, ${testAuction.state}`);
  console.log(`   Acreage: ${testAuction.acreage}\n`);

  // Test 1: Gemini Parser
  console.log('--- Test 1: Gemini Legal Description Parser ---');
  const parsed = await geminiParserService.parseLegalDescription(testAuction as Auction);
  console.log('Parsed Result:', JSON.stringify(parsed, null, 2));
  console.log('');

  // Test 2: BLM PLSS (if we got PLSS data)
  if (parsed.plss) {
    console.log('--- Test 2: BLM PLSS Geometry Lookup ---');
    const plssResult = await blmPlssService.queryPLSS({
      township: parsed.plss.township,
      townshipDirection: parsed.plss.townshipDirection,
      range: parsed.plss.range,
      rangeDirection: parsed.plss.rangeDirection,
      section: parsed.plss.section,
      state: parsed.state
    });
    
    if (plssResult) {
      console.log('✅ BLM PLSS Result:');
      console.log(`   PLSS ID: ${plssResult.plssid}`);
      console.log(`   Confidence: ${plssResult.confidence}%`);
      console.log(`   Geometry Type: ${plssResult.geometry.type}`);
      console.log(`   Has Coordinates: ${plssResult.geometry.coordinates ? 'Yes' : 'No'}`);
    } else {
      console.log('❌ No BLM PLSS geometry found');
    }
  }

  console.log('\n✅ Test complete!');
}

testEnhancedMatching()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });

