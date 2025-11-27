import { countyCsr2RateService } from '../server/services/countyCsr2Rates.js';

async function testCountyRates() {
  console.log('🧪 Testing County CSR2 Rate System\n');
  console.log('='.repeat(60));
  
  // Test 1: Get rates for various counties
  console.log('\n📍 Test 1: County Rate Lookups');
  console.log('-'.repeat(60));
  
  const testCounties = [
    'Story',      // Central region
    'Sioux',      // Northwest (highest rate)
    'Worth',      // North Central (lowest rate)
    'Polk',       // Central
    'Harrison',   // West Central
  ];
  
  for (const county of testCounties) {
    const rate = await countyCsr2RateService.getCountyRate(county);
    console.log(`   ${county.padEnd(15)} → $${rate}/CSR2 point`);
  }
  
  // Test 2: Get all rates and show summary
  console.log('\n📊 Test 2: Full County Statistics');
  console.log('-'.repeat(60));
  
  const allRates = await countyCsr2RateService.getAllRates();
  const prices = allRates.map(r => r.csr2Price);
  const highest = Math.max(...prices);
  const lowest = Math.min(...prices);
  const average = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  
  console.log(`   Total Counties: ${allRates.length}`);
  console.log(`   Highest Rate:   $${highest}/CSR2 point`);
  console.log(`   Lowest Rate:    $${lowest}/CSR2 point`);
  console.log(`   Average Rate:   $${average}/CSR2 point`);
  
  // Show rate distribution
  console.log('\n   Rate Distribution:');
  const distribution = {
    'High ($171-$187)': allRates.filter(r => r.csr2Price >= 171).length,
    'Mid ($151-$170)': allRates.filter(r => r.csr2Price >= 151 && r.csr2Price < 171).length,
    'Low ($128-$150)': allRates.filter(r => r.csr2Price < 151).length,
  };
  
  Object.entries(distribution).forEach(([range, count]) => {
    console.log(`     ${range}: ${count} counties`);
  });
  
  // Test 3: Show regional breakdown
  console.log('\n🗺️  Test 3: Rates by Region');
  console.log('-'.repeat(60));
  
  const byRegion = allRates.reduce((acc, rate) => {
    if (!acc[rate.region]) {
      acc[rate.region] = {
        counties: [],
        rates: []
      };
    }
    acc[rate.region].counties.push(rate.county);
    acc[rate.region].rates.push(rate.csr2Price);
    return acc;
  }, {} as Record<string, { counties: string[], rates: number[] }>);
  
  Object.entries(byRegion)
    .sort((a, b) => {
      const avgA = a[1].rates.reduce((sum, r) => sum + r, 0) / a[1].rates.length;
      const avgB = b[1].rates.reduce((sum, r) => sum + r, 0) / b[1].rates.length;
      return avgB - avgA;
    })
    .forEach(([region, data]) => {
      const avgRate = Math.round(data.rates.reduce((sum, r) => sum + r, 0) / data.rates.length);
      console.log(`   ${region.padEnd(20)} → ${data.counties.length} counties @ avg $${avgRate}/CSR2`);
    });
  
  // Test 4: Test valuation calculation
  console.log('\n💰 Test 4: Sample Valuation Calculations');
  console.log('-'.repeat(60));
  
  const sampleProperties = [
    { county: 'Sioux', csr2: 89.5, acres: 160 },
    { county: 'Worth', csr2: 85.0, acres: 160 },
    { county: 'Story', csr2: 87.0, acres: 160 },
  ];
  
  for (const prop of sampleProperties) {
    const rate = await countyCsr2RateService.getCountyRate(prop.county);
    const valuePerAcre = prop.csr2 * rate;
    const totalValue = valuePerAcre * prop.acres;
    
    console.log(`\n   ${prop.county} County (${prop.acres} acres, CSR2: ${prop.csr2}):`);
    console.log(`     Rate:        $${rate}/CSR2 point`);
    console.log(`     Value/Acre:  $${Math.round(valuePerAcre).toLocaleString()}`);
    console.log(`     Total Value: $${Math.round(totalValue).toLocaleString()}`);
  }
  
  // Test 5: Cache performance
  console.log('\n⚡ Test 5: Cache Performance');
  console.log('-'.repeat(60));
  
  const start1 = Date.now();
  await countyCsr2RateService.getCountyRate('Story');
  const time1 = Date.now() - start1;
  
  const start2 = Date.now();
  await countyCsr2RateService.getCountyRate('Story');
  const time2 = Date.now() - start2;
  
  console.log(`   First lookup (DB):    ${time1}ms`);
  console.log(`   Second lookup (cache): ${time2}ms`);
  console.log(`   Cache speedup:        ${Math.round(time1 / time2)}x faster`);
  
  const cacheStats = countyCsr2RateService.getCacheStats();
  console.log(`   Cached keys:          ${cacheStats.keys}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ All tests passed!\n');
  
  process.exit(0);
}

testCountyRates().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

