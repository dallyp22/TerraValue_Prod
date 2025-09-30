// Test script to verify OpenAI assistant optimization
import axios from 'axios';

async function testAssistantOptimization() {
  console.log('Testing OpenAI Assistant Optimization...\n');
  
  const baseUrl = 'http://localhost:5000';
  
  // Test data for a simple valuation request
  const testProperty = {
    acreage: 100,
    county: "Harrison",
    state: "Iowa",
    landType: "Dryland",
    address: "Test Property, Harrison County, IA",
    improvements: [],
    valuationMethod: "ai"
  };
  
  console.log('1. Testing first valuation request (may create new assistant)...');
  const startTime1 = Date.now();
  
  try {
    const response1 = await axios.post(`${baseUrl}/api/start-valuation`, testProperty);
    const duration1 = (Date.now() - startTime1) / 1000;
    
    console.log(`   ✓ First request completed in ${duration1.toFixed(2)} seconds`);
    console.log(`   Session ID: ${response1.data.sessionId}`);
    
    // Small delay before second request
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('\n2. Testing second valuation request (should reuse assistant)...');
    const startTime2 = Date.now();
    
    const response2 = await axios.post(`${baseUrl}/api/start-valuation`, testProperty);
    const duration2 = (Date.now() - startTime2) / 1000;
    
    console.log(`   ✓ Second request completed in ${duration2.toFixed(2)} seconds`);
    console.log(`   Session ID: ${response2.data.sessionId}`);
    
    // Compare times
    console.log('\n=== Performance Comparison ===');
    console.log(`First request:  ${duration1.toFixed(2)} seconds`);
    console.log(`Second request: ${duration2.toFixed(2)} seconds`);
    
    if (duration2 < duration1) {
      const improvement = ((duration1 - duration2) / duration1 * 100).toFixed(1);
      console.log(`\n✅ Performance improved by ${improvement}%!`);
      console.log('   Assistant reuse optimization is working.');
    } else {
      console.log('\n⚠️  Second request was not faster.');
      console.log('   This may be normal if assistant was already cached.');
    }
    
    console.log('\n💡 Tip: To reuse the assistant across server restarts, check the');
    console.log('   server logs for the AGRICULTURAL_ASSISTANT_ID and add it to .env');
    
  } catch (error) {
    console.error('\n❌ Error during testing:', error.response?.data || error.message);
    console.log('\nMake sure:');
    console.log('1. The server is running on port 5000');
    console.log('2. You have valid OpenAI API credentials');
    console.log('3. The vector store IDs are configured');
  }
}

// Run the test
testAssistantOptimization();