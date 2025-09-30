// Test script to verify AI Market-Adjusted valuation
import { openaiService } from '../server/services/openai.js';

async function testAIValuation() {
  console.log('Testing AI Market-Adjusted Valuation...\n');
  
  const testData = {
    baseValue: 11000,
    acreage: 160,
    landType: 'Irrigated',
    county: 'Harrison',
    state: 'Iowa',
    csr2Value: 15576, // CSR2 89.5 * $174/point
    additionalDetails: `
      IOWA MARKET ANALYSIS WITH SALES COMPS:
      - Recent Sales Comps: 3 comparable sales
      - Average Comp Price: $12,500/acre
      - Market Summary: Strong demand for irrigated farmland
      - Sales Data: 2024-11: $13,200/acre (160 acres irrigated); 2024-10: $12,100/acre (80 acres irrigated); 2024-09: $12,200/acre (120 acres irrigated)
    `
  };
  
  try {
    const result = await openaiService.performReasonedValuation(
      testData.baseValue,
      testData.acreage,
      testData.landType,
      testData.county,
      testData.state,
      testData.additionalDetails,
      0, // No income cap value for this test
      testData.csr2Value
    );
    
    console.log('AI Market-Adjusted Results:');
    console.log(`Base Value: $${testData.baseValue}/acre`);
    console.log(`CSR2 Value: $${testData.csr2Value}/acre`);
    console.log(`Average Comp Price: $12,500/acre`);
    console.log(`\nAI Adjusted Value: $${result.adjustedValue}/acre`);
    console.log(`\nReasoning: ${result.reasoning}`);
    
    // Check if AI value is different from CSR2
    if (Math.abs(result.adjustedValue - testData.csr2Value) < 100) {
      console.log('\n⚠️  WARNING: AI value is too close to CSR2 value!');
    } else {
      console.log('\n✓ SUCCESS: AI value properly synthesizes multiple factors!');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testAIValuation();