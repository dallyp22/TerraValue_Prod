/**
 * Run SQL migration file
 */

import 'dotenv/config';
import { Pool } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    console.log('📦 Reading migration file...');
    const migrationPath = join(process.cwd(), 'migrations', '0001_add_auction_enrichment_fields.sql');
    const sql = readFileSync(migrationPath, 'utf-8');

    console.log('🔄 Running migration...');
    await pool.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log('\n📊 New enrichment fields added to auctions table:');
    console.log('  - enriched_title, enriched_description, enriched_auction_house');
    console.log('  - enriched_auction_date, enriched_auction_location, enriched_property_location');
    console.log('  - legal_description, legal_description_parsed, legal_description_source');
    console.log('  - soil_mentions, crop_history, improvements, utilities, road_access');
    console.log('  - drainage, tillable_percent, crp_details, water_rights, mineral_rights');
    console.log('  - zoning_info, tax_info, seller_motivation, financing_options, possession');
    console.log('  - key_highlights, geocoding_method, geocoding_confidence, geocoding_source');
    console.log('  - enrichment_status, enriched_at, enrichment_version, enrichment_error');
    console.log('\n✨ Database is ready for AI enrichment!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

