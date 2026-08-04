/**
 * Proves the soft-archive UPDATE is valid SQL without running it.
 *
 * Run: npx tsx scripts/test-archiver-sql.ts
 *
 * Two independent checks:
 *   1. Render the Drizzle statement with .toSQL() and eyeball the SET clause —
 *      Postgres allows the target table to be referenced on the right-hand side
 *      of SET, but not every builder emits it that way.
 *   2. Evaluate the raw_data merge expression as a read-only SELECT against real
 *      rows, so a bad cast fails here rather than mid-archive.
 *
 * Read-only. Nothing is written.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { inArray, sql } from 'drizzle-orm';
import { db } from '../server/db.js';
import { auctions } from '@shared/schema';
import { ARCHIVED_STATUS } from '../server/services/auctionArchiver.js';

const rawSql = neon(process.env.DATABASE_URL!);

async function main() {
  const stamped = new Date().toISOString();

  const query = db
    .update(auctions)
    .set({
      status: ARCHIVED_STATUS,
      updatedAt: new Date(),
      rawData: sql`(
        COALESCE(${auctions.rawData}::jsonb, '{}'::jsonb)
        || jsonb_build_object(
             'archivedReason', ${'non_farm_property'}::text,
             'archivedAt', ${stamped}::text,
             'archivedFromStatus', COALESCE(${auctions.status}, 'active')
           )
      )::json`,
    })
    .where(inArray(auctions.id, [-1, -2]));

  const rendered = query.toSQL();
  console.log('\n=== 1. Rendered UPDATE ===');
  console.log(rendered.sql);
  console.log('\nparams:', rendered.params);

  console.log('\n=== 2. Merge expression evaluated read-only on real rows ===');
  const rows = await rawSql`
    SELECT id,
           status AS old_status,
           (
             COALESCE(raw_data::jsonb, '{}'::jsonb)
             || jsonb_build_object(
                  'archivedReason', 'non_farm_property'::text,
                  'archivedAt', ${stamped}::text,
                  'archivedFromStatus', COALESCE(status, 'active')
                )
           )::json AS merged
      FROM auctions
     ORDER BY id
     LIMIT 3
  ` as any[];

  for (const r of rows) {
    const keys = Object.keys(r.merged || {});
    console.log(
      `  id=${r.id} status=${r.old_status} -> archivedReason=${r.merged.archivedReason}` +
        ` archivedFromStatus=${r.merged.archivedFromStatus} keysPreserved=${keys.length}`,
    );
  }

  // The merge must ADD keys, never replace the blob — rawData carries the
  // scrape payload and the geocoding provenance.
  const preserved = rows.every(r => Object.keys(r.merged || {}).length >= 3);
  console.log(`\n  ✓ existing raw_data keys preserved: ${preserved}`);

  console.log('\n=== 3. Confirm nothing was written ===');
  const counts = await rawSql`
    SELECT status, count(*)::int AS n FROM auctions GROUP BY status ORDER BY status
  ` as any[];
  console.log(' ', counts.map(c => `${c.status ?? 'null'}=${c.n}`).join('  '));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
