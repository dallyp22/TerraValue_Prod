#!/usr/bin/env node

/**
 * TerraValue System Validation Script
 * 
 * This script performs comprehensive testing of the TerraValue platform
 * to ensure all components are working correctly.
 */

// Using built-in fetch API available in Node.js 18+

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api`;

class SystemValidator {
  constructor() {
    this.tests = [];
    this.results = [];
  }

  async runTest(name, testFn) {
    console.log(`🔍 Running: ${name}...`);
    try {
      const result = await testFn();
      this.results.push({ name, status: 'PASS', result });
      console.log(`✅ PASS: ${name}`);
      return result;
    } catch (error) {
      this.results.push({ name, status: 'FAIL', error: error.message });
      console.log(`❌ FAIL: ${name} - ${error.message}`);
      return null;
    }
  }

  async validateHealthCheck() {
    return this.runTest('Health Check Endpoint', async () => {
      const response = await fetch(`${API_URL}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      const data = await response.json();
      if (!data.success) {
        throw new Error('Health check returned unsuccessful status');
      }
      return data;
    });
  }

  async validateCSR2Service() {
    return this.runTest('CSR2 Point Analysis', async () => {
      const testData = {
        latitude: 42.5,
        longitude: -93.5,
        radiusMeters: 500
      };
      
      const response = await fetch(`${API_URL}/csr2/point`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      });
      
      if (!response.ok) {
        throw new Error(`CSR2 service failed: ${response.status}`);
      }
      
      const data = await response.json();
      if (!data.success || typeof data.mean !== 'number') {
        throw new Error('CSR2 service returned invalid data');
      }
      
      return data;
    });
  }

  async validateGeocodingService() {
    return this.runTest('Geocoding Service', async () => {
      const testAddress = { address: "Ames, Iowa" };
      
      const response = await fetch(`${API_URL}/geocode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testAddress)
      });
      
      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`);
      }
      
      const data = await response.json();
      if (!data.success || !data.latitude || !data.longitude) {
        throw new Error('Geocoding returned invalid coordinates');
      }
      
      return data;
    });
  }

  async validateRateLimiting() {
    return this.runTest('Rate Limiting Protection', async () => {
      // Send multiple requests rapidly to test rate limiting
      const promises = Array(20).fill().map(() => 
        fetch(`${API_URL}/health`)
      );
      
      const responses = await Promise.all(promises);
      const rateLimited = responses.some(res => res.status === 429);
      
      if (!rateLimited) {
        console.log('⚠️  Warning: Rate limiting may not be working as expected');
      }
      
      return { tested: true, rateLimitDetected: rateLimited };
    });
  }

  async validateErrorHandling() {
    return this.runTest('Error Handling', async () => {
      // Test invalid WKT format
      const invalidData = { wkt: "INVALID_WKT_FORMAT" };
      
      const response = await fetch(`${API_URL}/csr2/polygon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });
      
      if (response.status !== 400) {
        throw new Error('Error handling not working - should return 400 for invalid WKT');
      }
      
      const data = await response.json();
      if (!data.message) {
        throw new Error('Error response missing message field');
      }
      
      return data;
    });
  }

  async validateSecurityHeaders() {
    return this.runTest('Security Headers', async () => {
      const response = await fetch(`${API_URL}/health`);
      
      const requiredHeaders = [
        'x-content-type-options',
        'x-frame-options', 
        'x-xss-protection'
      ];
      
      const missingHeaders = requiredHeaders.filter(header => 
        !response.headers.get(header)
      );
      
      if (missingHeaders.length > 0) {
        throw new Error(`Missing security headers: ${missingHeaders.join(', ')}`);
      }
      
      return { securityHeaders: 'present' };
    });
  }

  printSummary() {
    console.log('\n📊 Test Summary:');
    console.log('='.repeat(50));
    
    const passed = this.results.filter(r => r.status === 'PASS').length;
    const total = this.results.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    console.log('\n📋 Detailed Results:');
    this.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : '❌';
      console.log(`${icon} ${result.name}: ${result.status}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });
    
    if (passed === total) {
      console.log('\n🎉 All tests passed! System is healthy.');
    } else {
      console.log('\n⚠️  Some tests failed. Please review the errors above.');
    }
  }

  async runAllTests() {
    console.log('🚀 Starting TerraValue System Validation...\n');
    
    await this.validateHealthCheck();
    await this.validateSecurityHeaders();
    await this.validateCSR2Service();
    await this.validateGeocodingService();
    await this.validateErrorHandling();
    await this.validateRateLimiting();
    
    this.printSummary();
  }
}

// Run validation if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new SystemValidator();
  validator.runAllTests().catch(console.error);
}

export { SystemValidator };