import { pool } from '../server/db.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  try {
    console.log('🔄 Running county CSR2 rates migration...');
    
    // Read the migration file
    const migrationPath = join(__dirname, '../migrations/0005_add_county_csr2_rates.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');
    
    // Run the migration
    await pool.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    console.log('✅ Created county_csr2_rates table with 99 Iowa counties');
    
    // Verify the data
    const result = await pool.query('SELECT COUNT(*) as count FROM county_csr2_rates');
    console.log(`✅ Verified: ${result.rows[0].count} counties loaded`);
    
    // Show sample rates by region
    const sampleRates = await pool.query(`
      SELECT region, COUNT(*) as county_count, AVG(csr2_price) as avg_price
      FROM county_csr2_rates
      GROUP BY region
      ORDER BY avg_price DESC
    `);
    
    console.log('\n📊 Rates by Region:');
    sampleRates.rows.forEach(row => {
      console.log(`   ${row.region}: ${row.county_count} counties, avg $${Math.round(row.avg_price)}/CSR2`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();

