/**
 * Create auction_blocklist table
 */

import 'dotenv/config';
import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

async function createBlocklistTable() {
  try {
    console.log('📋 Creating auction_blocklist table...\n');

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "auction_blocklist" (
        "id" SERIAL PRIMARY KEY,
        "url" TEXT NOT NULL UNIQUE,
        "reason" TEXT NOT NULL,
        "added_at" TIMESTAMP DEFAULT NOW(),
        "added_by" TEXT DEFAULT 'manual'
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "auction_blocklist_url_idx" ON "auction_blocklist" ("url")
    `);

    console.log('✅ Successfully created auction_blocklist table');
    console.log('✅ Created index on URL column\n');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

createBlocklistTable();

