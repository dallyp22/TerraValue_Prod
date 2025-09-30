import { csr2PolygonMean } from "../server/services/csr2.js";

// Test polygon in central Iowa (should have good CSR2 data)
const SAMPLE_POLYGON = "POLYGON((-93.612 41.615,-93.612 41.605,-93.602 41.605,-93.602 41.615,-93.612 41.615))";

console.log("Testing CSR2 service with sample polygon...");
console.log("Polygon:", SAMPLE_POLYGON);

csr2PolygonMean(SAMPLE_POLYGON)
  .then(result => {
    console.log("CSR2 Mean Result:", result);
    if (result !== null) {
      console.log(`✓ Success! CSR2 value: ${result}`);
      console.log(`Rating: ${result >= 80 ? 'Excellent' : result >= 60 ? 'Good' : result >= 40 ? 'Fair' : 'Poor'}`);
    } else {
      console.log("⚠ No CSR2 data available for this location");
    }
  })
  .catch(error => {
    console.error("✗ CSR2 test failed:", error.message);
  });