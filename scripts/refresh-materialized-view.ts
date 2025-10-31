/**
 * Refresh Iowa Soil Summary Materialized View
 * 
 * This script refreshes the materialized view used for optimized CSR2 queries.
 * Run this after loading new soil data or periodically to update the view.
 * 
 * Usage:
 *   npm run db:soil:refresh
 */

import 'dotenv/config';
import { soilPool, executeSoilQuery } from '../server/soil-db';

async function main() {
  console.log('🔄 Refreshing Iowa soil summary materialized view...\n');
  
  if (!soilPool) {
    console.error('❌ Soil database not configured. Please set DATABASE_URL_SOIL environment variable.');
    process.exit(1);
  }
  
  try {
    const startTime = Date.now();
    
    await executeSoilQuery('REFRESH MATERIALIZED VIEW iowa_soil_summary');
    
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);
    
    console.log(`✅ Materialized view refreshed successfully`);
    console.log(`⏱️  Time: ${duration}s\n`);
    
    // Get row count
    const result = await executeSoilQuery<{ count: number }>('SELECT COUNT(*) as count FROM iowa_soil_summary');
    console.log(`📊 Total rows in view: ${result[0].count.toLocaleString()}`);
    
  } catch (error) {
    console.error('❌ Error refreshing materialized view:', error);
    process.exit(1);
  } finally {
    await soilPool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as refreshMaterializedView };

