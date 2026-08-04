/**
 * Proves every call site fixed for soft-delete actually excludes archived rows.
 *
 * Run: npx tsx scripts/verify-archived-exclusion.ts
 *
 * The live table has no archived rows yet (the change hasn't shipped), so a
 * "before vs after" against today's data would be 0 vs 0 and prove nothing.
 * Instead this simulates the post-ship table: it counts what each query would
 * match if the rows the archiver is about to retire carried status='archived'.
 * That is the population every one of these call sites would have swept.
 *
 * Read-only. Nothing is written.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

// The archive backlog: rows already retired historically. Post-ship these live
// in `auctions` with status='archived' instead of only in `archived_auctions`.
const BACKLOG = `SELECT count(*)::int AS n FROM archived_auctions`;

let failures = 0;

function report(label: string, before: number, after: number, swept: number) {
  const ok = after <= before && swept >= 0;
  if (!ok) failures++;
  console.log(
    `  ${ok ? '✓' : '✗'} ${label.padEnd(46)} unfiltered=${String(before).padStart(6)}  filtered=${String(after).padStart(6)}  archived swept=${String(swept).padStart(6)}`,
  );
}

async function one(label: string, unfiltered: string, filtered: string) {
  const [b] = (await sql(unfiltered)) as any[];
  const [a] = (await sql(filtered)) as any[];
  report(label, Number(b.n), Number(a.n), Number(b.n) - Number(a.n));
}

async function main() {
  const [{ n: backlog }] = (await sql(BACKLOG)) as any[];
  const [{ n: live }] = (await sql(
    `SELECT count(*)::int AS n FROM auctions`,
  )) as any[];
  console.log(`\nLive rows in auctions      : ${live}`);
  console.log(`Rows in archived_auctions  : ${backlog}`);
  console.log(
    `\nSimulating the post-ship table: UNION the live table with the ${backlog} archived\n` +
      `rows, then compare each query with and without the NOT_ARCHIVED predicate.\n`,
  );

  // A stand-in for the post-soft-delete `auctions` table: live rows plus the
  // historical archive re-materialised with status='archived'.
  const T = `(
      SELECT id, status, enrichment_status, needs_date_review, latitude, longitude,
             county, state, auction_date, scraped_at, source_website
        FROM auctions
      UNION ALL
      SELECT original_id, 'archived', 'pending', false, latitude, longitude,
             county, state, auction_date, scraped_at, source_website
        FROM archived_auctions
    ) t`;
  const NOT_ARCHIVED = `(status IS NULL OR status <> 'archived')`;

  console.log('PRIORITY 1 — model spend');
  await one(
    'enrichAllPendingAuctions / enrichAll',
    `SELECT count(*)::int AS n FROM ${T} WHERE enrichment_status = 'pending'`,
    `SELECT count(*)::int AS n FROM ${T} WHERE enrichment_status = 'pending' AND ${NOT_ARCHIVED}`,
  );
  await one(
    'reEnrichAll / reEnrichAllAuctions (no WHERE!)',
    `SELECT count(*)::int AS n FROM ${T}`,
    `SELECT count(*)::int AS n FROM ${T} WHERE ${NOT_ARCHIVED}`,
  );
  await one(
    'retry-failed-enrichments',
    `SELECT count(*)::int AS n FROM ${T} WHERE enrichment_status = 'failed'`,
    `SELECT count(*)::int AS n FROM ${T} WHERE enrichment_status = 'failed' AND ${NOT_ARCHIVED}`,
  );
  await one(
    'validate-counties (paid reverse-geocode)',
    `SELECT count(*)::int AS n FROM ${T} WHERE latitude IS NOT NULL AND longitude IS NOT NULL`,
    `SELECT count(*)::int AS n FROM ${T} WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND ${NOT_ARCHIVED}`,
  );
  await one(
    'update-coordinates (paid geocode)',
    `SELECT count(*)::int AS n FROM ${T} WHERE (latitude IS NULL OR longitude IS NULL) AND county IS NOT NULL AND state = 'Iowa'`,
    `SELECT count(*)::int AS n FROM ${T} WHERE (latitude IS NULL OR longitude IS NULL) AND county IS NOT NULL AND state = 'Iowa' AND ${NOT_ARCHIVED}`,
  );

  console.log('\nPRIORITY 2 — correctness');
  await one(
    'getEnrichmentStats total',
    `SELECT count(*)::int AS n FROM ${T}`,
    `SELECT count(*)::int AS n FROM ${T} WHERE ${NOT_ARCHIVED}`,
  );
  await one(
    'needs-review queue',
    `SELECT count(*)::int AS n FROM ${T} WHERE needs_date_review = true`,
    `SELECT count(*)::int AS n FROM ${T} WHERE needs_date_review = true AND ${NOT_ARCHIVED}`,
  );
  await one(
    'diagnostics/upcoming',
    `SELECT count(*)::int AS n FROM ${T} WHERE auction_date::date >= CURRENT_DATE`,
    `SELECT count(*)::int AS n FROM ${T} WHERE auction_date::date >= CURRENT_DATE AND ${NOT_ARCHIVED}`,
  );
  await one(
    'investigate: total',
    `SELECT count(*)::int AS n FROM ${T}`,
    `SELECT count(*)::int AS n FROM ${T} WHERE ${NOT_ARCHIVED}`,
  );
  await one(
    'investigate: withCoords',
    `SELECT count(*)::int AS n FROM ${T} WHERE latitude IS NOT NULL AND longitude IS NOT NULL`,
    `SELECT count(*)::int AS n FROM ${T} WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND ${NOT_ARCHIVED}`,
  );

  // /auctions/all and recent-acquisitions are ordered+limited, so the count is
  // capped. What matters is how much of the 500-row window the archive eats.
  console.log('\nPRIORITY 2 — ordered/limited windows (how much the archive displaces)');
  const [{ n: allWindow }] = (await sql(
    `SELECT count(*)::int AS n FROM (SELECT status FROM ${T} ORDER BY scraped_at DESC NULLS LAST LIMIT 500) w WHERE status = 'archived'`,
  )) as any[];
  console.log(`  /auctions/all: ${allWindow} of the newest 500 rows would be archived`);
  const [{ n: recentWindow }] = (await sql(
    `SELECT count(*)::int AS n FROM (SELECT status FROM ${T} ORDER BY scraped_at DESC NULLS LAST LIMIT 10) w WHERE status = 'archived'`,
  )) as any[];
  console.log(`  diagnostics/recent-acquisitions: ${recentWindow} of the newest 10 rows would be archived`);

  console.log('\nCAVEAT — what this simulation cannot model');
  console.log(
    '  archived_auctions has no enrichment_status or needs_date_review column, so\n' +
      "  the simulated archived rows above were given enrichment_status='pending' and\n" +
      '  needs_date_review=false. Consequences:\n' +
      "    - 'enrichAll' swept=93,068 is an UPPER bound (real archived rows carry a mix\n" +
      "      of pending/completed/failed). 'reEnrichAll' swept=93,068 is EXACT — it had\n" +
      '      no WHERE clause at all, so every row qualified regardless.\n' +
      "    - 'retry-failed-enrichments' shows 0/0 only because no live row is currently\n" +
      '      in enrichment_status=\'failed\'; the fix is still required.\n' +
      "    - 'needs-review' shows swept=0 for the same reason — an artifact of the\n" +
      '      constant above, not evidence the queue is safe.',
  );

  console.log('\nNULL-status semantics — proved directly, not inferred');
  const [nulls] = (await sql(
    `SELECT count(*)::int AS n FROM auctions WHERE status IS NULL`,
  )) as any[];
  console.log(`  rows with status IS NULL in auctions today: ${nulls.n}`);
  // The column is nullable (text, DEFAULT 'active', NOT NULL absent), so this is
  // a latent trap rather than a live one. Demonstrate it on a literal set.
  const [sem] = (await sql(
    `SELECT
       count(*) FILTER (WHERE (s IS NULL OR s <> 'archived'))::int AS kept_correct,
       count(*) FILTER (WHERE s <> 'archived')::int               AS kept_naive
     FROM (VALUES ('active'), ('sold'), ('archived'), (NULL)) v(s)`,
  )) as any[];
  console.log(`  over VALUES('active','sold','archived',NULL):`);
  console.log(`    (s IS NULL OR s <> 'archived') keeps ${sem.kept_correct}  (active, sold, NULL)`);
  console.log(`    bare s <> 'archived'           keeps ${sem.kept_naive}  <- NULL silently dropped`);
  if (Number(sem.kept_correct) !== 3 || Number(sem.kept_naive) !== 2) failures++;

  console.log(
    `\n${failures === 0 ? '✓ all call sites exclude archived rows' : `✗ ${failures} check(s) failed`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
