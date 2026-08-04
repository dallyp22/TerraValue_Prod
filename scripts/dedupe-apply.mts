/**
 * Materialise entity resolution into the database.
 *
 * This is the WRITING counterpart to scripts/dedupe-report.mts. Run the report
 * first; this script performs no analysis you have not already been able to read.
 *
 *   npx tsx scripts/dedupe-apply.mts                    # refuses to run
 *   npx tsx scripts/dedupe-apply.mts --confirm          # active rows
 *   npx tsx scripts/dedupe-apply.mts --confirm --scope=upcoming
 *   npx tsx scripts/dedupe-apply.mts --rollback         # undo, leaves no trace
 *
 * WHAT THIS DOES AND DOES NOT CHANGE: it fills `auction_events`, points
 * `auctions.event_id` at those rows, records every scored pair in
 * `auction_match_audit`, and caches the blocking keys on `auctions`. It does not
 * modify a single field the application currently reads — no title, county,
 * acreage, date, status or coordinate is touched. Nothing in the Worker API, the
 * map, the tile route or the Heistand overlay reads `auction_events` yet, so
 * running this changes nothing a user can see. It is additive metadata that the
 * map cutover will later consume.
 *
 * REVERSIBILITY: everything written is tagged with the matcher version, and
 * `--rollback` removes all of it. `auctions.event_id` is ON DELETE SET NULL, so
 * deleting the events unlinks the observations automatically.
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import {
  resolve,
  MATCHER_VERSION,
  type DedupeInput,
  type Fingerprint,
} from '../server/services/dedupe.js';

const args = process.argv.slice(2);
const argOf = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
const has = (n: string) => args.includes(`--${n}`);

const scope = (argOf('scope') ?? 'active') as 'active' | 'upcoming';
const confirm = has('confirm');
const rollback = has('rollback');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
if (!confirm && !rollback) {
  console.error(
    'This script WRITES to the database. Re-run with --confirm (or --rollback to undo).\n' +
      'Read scripts/dedupe-report.mts output first.',
  );
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const log = (s = '') => console.log(s);

/** Build a parameterised multi-row VALUES list: ($1::int,$2::text),($3::int,...) */
function valuesList(rows: unknown[][], casts: string[]): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const placeholders = row.map((v, i) => {
      params.push(v);
      return `$${params.length}::${casts[i]}`;
    });
    return `(${placeholders.join(',')})`;
  });
  return { text: tuples.join(','), params };
}

async function chunked<T>(items: T[], size: number, fn: (batch: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------
if (rollback) {
  log(`Rolling back matcher ${MATCHER_VERSION}…`);
  const before = (await sql(
    `select (select count(*) from auction_events where matcher_version=$1) e,
            (select count(*) from auction_match_audit where matcher_version=$1) a,
            (select count(*) from auctions where event_id is not null) l`,
    [MATCHER_VERSION],
  )) as any[];
  await sql(
    `update auctions set event_id=null, event_match_score=null, event_match_method=null
      where event_id in (select id from auction_events where matcher_version=$1)`,
    [MATCHER_VERSION],
  );
  await sql(`delete from auction_match_audit where matcher_version=$1`, [MATCHER_VERSION]);
  await sql(`delete from auction_events where matcher_version=$1`, [MATCHER_VERSION]);
  log(`  removed ${before[0].e} events, ${before[0].a} audit rows, unlinked ${before[0].l} observations`);
  log('  dedupe_* key cache left in place (it is derived data, harmless, and re-used on the next run)');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Load + resolve
// ---------------------------------------------------------------------------
const scopeClause = scope === 'upcoming' ? `status='active' AND auction_date > now()` : `status='active'`;

const rows = (await sql(
  `SELECT id, url, title, enriched_title, description, county, state, acreage,
          auction_date, source_website, enriched_auction_house,
          legal_description, legal_description_parsed, latitude, longitude,
          (raw_data->>'isCountyLevel') AS is_county_level
     FROM auctions WHERE ${scopeClause} ORDER BY id`,
)) as any[];

const inputs: DedupeInput[] = rows.map((r) => ({
  id: Number(r.id),
  url: r.url,
  title: r.title,
  enrichedTitle: r.enriched_title,
  description: r.description,
  county: r.county,
  state: r.state,
  acreage: r.acreage === null ? null : Number(r.acreage),
  auctionDate: r.auction_date,
  sourceWebsite: r.source_website,
  enrichedAuctionHouse: r.enriched_auction_house,
  legalDescription: r.legal_description,
  legalDescriptionParsed: r.legal_description_parsed,
  latitude: r.latitude === null ? null : Number(r.latitude),
  longitude: r.longitude === null ? null : Number(r.longitude),
  isCountyLevel: r.is_county_level === null ? null : r.is_county_level === 'true',
}));

log(`scope ${scope}: ${inputs.length} observations`);
const result = resolve(inputs);
const multi = result.clusters.filter((c) => c.memberIds.length > 1);
log(
  `resolved: ${result.clusters.length} clusters ` +
    `(${multi.length} multi-member, ${result.excluded.length} rows excluded as aggregator search pages)`,
);

// ---------------------------------------------------------------------------
// Clear any previous run of this matcher version, so the script is re-runnable
// and never double-writes.
// ---------------------------------------------------------------------------
await sql(
  `update auctions set event_id=null, event_match_score=null, event_match_method=null
    where event_id in (select id from auction_events where matcher_version=$1)`,
  [MATCHER_VERSION],
);
await sql(`delete from auction_match_audit where matcher_version=$1`, [MATCHER_VERSION]);
await sql(`delete from auction_events where matcher_version=$1`, [MATCHER_VERSION]);

// ---------------------------------------------------------------------------
// Events. Golden-record fields are copied inside SQL from the primary
// observation rather than round-tripped through JS: `auctions.auction_date` is
// `timestamp` and `auction_events.auction_date` is `timestamptz`, and letting
// the driver parse a naive timestamp into a local-time Date and write it back
// would shift every date by the machine's UTC offset.
// ---------------------------------------------------------------------------
const eventIdByPrimary = new Map<number, number>();
const clusterRows = result.clusters.map((c) => [
  c.primaryId,
  result.fingerprints.get(c.primaryId)?.countyKeys ?? [],
  result.fingerprints.get(c.primaryId)?.state ?? null,
  c.memberIds.length,
  c.matchMethod,
  c.confidence,
  c.reviewStatus,
  MATCHER_VERSION,
]);

await chunked(clusterRows, 150, async (batch) => {
  const { text, params } = valuesList(batch, [
    'int', 'text[]', 'text', 'int', 'text', 'real', 'text', 'text',
  ]);
  const out = (await sql(
    `INSERT INTO auction_events
       (primary_auction_id, title, county, county_keys, state, acreage, auction_date,
        auctioneer, land_type, latitude, longitude,
        member_count, match_method, match_confidence, review_status, matcher_version)
     SELECT a.id, COALESCE(a.enriched_title, a.title), a.county, v.county_keys, v.state,
            a.acreage, a.auction_date,
            COALESCE(a.enriched_auction_house, a.source_website), a.land_type,
            a.latitude, a.longitude,
            v.member_count, v.match_method, v.match_confidence, v.review_status, v.matcher_version
       FROM (VALUES ${text}) AS v(primary_id, county_keys, state, member_count,
                                  match_method, match_confidence, review_status, matcher_version)
       JOIN auctions a ON a.id = v.primary_id
     RETURNING id, primary_auction_id`,
    params,
  )) as any[];
  for (const r of out) eventIdByPrimary.set(Number(r.primary_auction_id), Number(r.id));
});
log(`wrote ${eventIdByPrimary.size} auction_events rows`);

// ---------------------------------------------------------------------------
// Link observations to their event.
// ---------------------------------------------------------------------------
const linkRows: unknown[][] = [];
for (const c of result.clusters) {
  const eid = eventIdByPrimary.get(c.primaryId);
  if (eid === undefined) continue;
  for (const id of c.memberIds) linkRows.push([id, eid, c.confidence, c.matchMethod]);
}
let linked = 0;
await chunked(linkRows, 200, async (batch) => {
  const { text, params } = valuesList(batch, ['int', 'int', 'real', 'text']);
  const out = (await sql(
    `UPDATE auctions a SET event_id=v.eid, event_match_score=v.score, event_match_method=v.method
       FROM (VALUES ${text}) AS v(aid, eid, score, method)
      WHERE a.id = v.aid RETURNING a.id`,
    params,
  )) as any[];
  linked += out.length;
});
log(`linked ${linked} observations to events`);

// ---------------------------------------------------------------------------
// Audit trail: every scored pair, including the ones we refused to merge.
// ---------------------------------------------------------------------------
const auditRows = result.pairs.map((p) => [
  Math.min(p.aId, p.bId),
  Math.max(p.aId, p.bId),
  p.score,
  p.disposition,
  p.blockKey,
  JSON.stringify(p.features),
  p.holdReason ?? null,
  'rules_v1',
  MATCHER_VERSION,
]);
let audits = 0;
await chunked(auditRows, 150, async (batch) => {
  const { text, params } = valuesList(batch, [
    'int', 'int', 'real', 'text', 'text', 'jsonb', 'text', 'text', 'text',
  ]);
  const out = (await sql(
    `INSERT INTO auction_match_audit
       (auction_a_id, auction_b_id, score, disposition, block_key, features,
        hold_reason, decided_by, matcher_version)
     VALUES ${text}
     ON CONFLICT (auction_a_id, auction_b_id, matcher_version) DO NOTHING
     RETURNING id`,
    params,
  )) as any[];
  audits += out.length;
});
log(`wrote ${audits} auction_match_audit rows`);

// ---------------------------------------------------------------------------
// Blocking-key cache, so the online resolver can block in SQL instead of
// re-fingerprinting the whole table.
// ---------------------------------------------------------------------------
const fpRows: unknown[][] = [];
for (const fp of Array.from(result.fingerprints.values()) as Fingerprint[]) {
  fpRows.push([fp.id, fp.countyKeys, fp.state, fp.acreage, fp.trsKeys, fp.nameTokens]);
}
let cached = 0;
await chunked(fpRows, 150, async (batch) => {
  const { text, params } = valuesList(batch, ['int', 'text[]', 'text', 'real', 'text[]', 'text[]']);
  const out = (await sql(
    `UPDATE auctions a
        SET dedupe_county_keys=v.ck, dedupe_state=v.st, dedupe_acreage=v.ac,
            dedupe_trs_keys=v.trs, dedupe_name_tokens=v.nt, dedupe_fingerprint_at=now()
       FROM (VALUES ${text}) AS v(aid, ck, st, ac, trs, nt)
      WHERE a.id = v.aid RETURNING a.id`,
    params,
  )) as any[];
  cached += out.length;
});
log(`cached blocking keys on ${cached} observations`);

log();
log('Done. Nothing the application currently reads was modified.');
log(`Undo with: npx tsx scripts/dedupe-apply.mts --rollback`);
