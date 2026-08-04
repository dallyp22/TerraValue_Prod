/**
 * Dry-run entity resolution report.
 *
 * READ-ONLY. Issues exactly one SELECT and writes nothing — no INSERT, no
 * UPDATE, no DDL. The whole point is to read what the resolver *would* do before
 * anything merges, because a wrong merge removes an auction from the map and
 * that is the failure mode this workstream exists to fix.
 *
 *   npx tsx scripts/dedupe-report.mts                 # active upcoming auctions
 *   npx tsx scripts/dedupe-report.mts --scope=active  # all active rows
 *   npx tsx scripts/dedupe-report.mts --limit=200     # smaller sample
 *   npx tsx scripts/dedupe-report.mts --json=out.json # machine-readable dump
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import {
  resolve,
  MATCHER_VERSION,
  MERGE_THRESHOLD,
  REVIEW_THRESHOLD,
  MAX_CLUSTER_SIZE,
  type DedupeInput,
  type ScoredPair,
} from '../server/services/dedupe.js';

type Scope = 'upcoming' | 'active';

const args = process.argv.slice(2);
const argOf = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const scope: Scope = (argOf('scope') as Scope) ?? 'upcoming';
const limit = Number(argOf('limit') ?? 5000);
const jsonOut = argOf('json');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (expected in .env at the repo root)');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const scopeClause =
  scope === 'upcoming'
    ? `status = 'active' AND auction_date > now()`
    : `status = 'active'`;

// Single read. `raw_data->>'isCountyLevel'` is pulled because geocoding_method
// is NULL on 1,351 of 1,443 active rows, so it is the only usable precision
// flag — county-centroid coordinates are shared by every listing in a county and
// must never count as geographic agreement.
const rows = (await sql(
  `SELECT id, url, title, enriched_title, description, county, state, acreage,
          auction_date, source_website, enriched_auction_house,
          legal_description, legal_description_parsed,
          latitude, longitude,
          (raw_data->>'isCountyLevel') AS is_county_level
     FROM auctions
    WHERE ${scopeClause}
    ORDER BY id
    LIMIT $1`,
  [limit],
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

const started = Date.now();
const result = resolve(inputs);
const elapsed = Date.now() - started;

const byId = new Map(inputs.map((i) => [i.id, i]));
const label = (id: number): string => {
  const i = byId.get(id);
  if (!i) return `#${id}`;
  const t = (i.enrichedTitle || i.title || '(untitled)').slice(0, 46);
  const acres = i.acreage ? `${i.acreage}ac` : 'ac?';
  const date = i.auctionDate ? new Date(i.auctionDate).toISOString().slice(0, 10) : 'date?';
  return `#${id} [${i.sourceWebsite ?? '?'}] ${i.county ?? '?'} · ${acres} · ${date} · ${t}`;
};

const featureStr = (p: ScoredPair): string =>
  Object.entries(p.features)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([k, v]) => `${k}${v > 0 ? '+' : ''}${v}`)
    .join(' ');

const merges = result.pairs.filter((p) => p.disposition === 'merge');
const reviews = result.pairs.filter((p) => p.disposition === 'review');
const vetoed = result.pairs.filter((p) => p.disposition === 'distinct');
const multi = result.clusters.filter((c) => c.memberIds.length > 1);
const autoClusters = multi.filter((c) => c.reviewStatus === 'auto');
const heldClusters = multi.filter((c) => c.reviewStatus === 'needs_review');
const rowsInAuto = autoClusters.reduce((n, c) => n + c.memberIds.length, 0);

const line = (s = '') => console.log(s);
const rule = (ch = '─') => line(ch.repeat(78));

line();
rule('═');
line(`ENTITY RESOLUTION DRY RUN — matcher ${MATCHER_VERSION} — NOTHING WAS WRITTEN`);
rule('═');
line(`scope              ${scope} (${inputs.length} observations)`);
line(`excluded           ${result.excluded.length} aggregator search pages` +
     ` → ${inputs.length - result.excluded.length} resolvable`);
line(`thresholds         merge >= ${MERGE_THRESHOLD}, review >= ${REVIEW_THRESHOLD}, max cluster ${MAX_CLUSTER_SIZE}`);
line(`resolved in        ${elapsed} ms`);
line();
line(`candidate pairs    ${result.pairs.length} scored`);
line(`  merge            ${merges.length}`);
line(`  review (grey)    ${reviews.length}`);
line(`  vetoed/distinct  ${vetoed.length}`);
line();
line(`clusters           ${result.clusters.length} total`);
line(`  singletons       ${result.clusters.length - multi.length}`);
line(`  auto-merge       ${autoClusters.length} clusters covering ${rowsInAuto} rows` +
     ` (${rowsInAuto - autoClusters.length} rows collapse)`);
line(`  held for review  ${heldClusters.length}`);
line();

if (result.excluded.length > 0) {
  rule();
  line(`EXCLUDED FROM RESOLUTION — ${result.excluded.length} aggregator search pages`);
  line('State- or county-scoped listing indexes. They do not describe one sale,');
  line('so there is nothing to resolve them to. Listed rather than silently dropped.');
  rule();
  for (const e of result.excluded.slice(0, 15)) {
    line(`  #${e.id}  ${(e.url ?? '').slice(0, 68)}`);
  }
  if (result.excluded.length > 15) line(`  … ${result.excluded.length - 15} more`);
  line();
}

if (result.oversizedBlocks.length > 0) {
  rule();
  line(`OVERSIZED BLOCKS SKIPPED (${result.oversizedBlocks.length})`);
  line('A block bigger than any plausible repost group is a bad key, not a big');
  line('duplicate group. These pairs were never scored — listed so the skip is');
  line('visible rather than silent.');
  rule();
  for (const b of result.oversizedBlocks.sort((x, y) => y.size - x.size).slice(0, 15)) {
    line(`  ${String(b.size).padStart(4)}  ${b.key}`);
  }
  line();
}

rule();
line(`WOULD AUTO-MERGE — ${autoClusters.length} clusters`);
line('Every one required an identity signal (acreage agreement, a shared');
line('Township/Range/Section, or two shared rare name tokens) AND a locality');
line('signal — never county + date + a similar title on their own.');
rule();
if (autoClusters.length === 0) line('  (none)');
for (const c of autoClusters.sort((a, b) => b.memberIds.length - a.memberIds.length)) {
  line();
  line(`  ● ${c.memberIds.length} rows · via ${c.matchMethod} · weakest edge ${c.confidence}`);
  for (const id of c.memberIds) {
    line(`      ${id === c.primaryId ? '→' : ' '} ${label(id)}`);
  }
  const edges = merges.filter((p) => c.memberIds.includes(p.aId) && c.memberIds.includes(p.bId));
  for (const e of edges.slice(0, 6)) {
    line(`        ${e.aId}~${e.bId}  ${e.score}  [${featureStr(e)}]`);
  }
  if (edges.length > 6) line(`        … ${edges.length - 6} more edges`);
}
line();

if (heldClusters.length > 0) {
  rule();
  line(`HELD — cluster too large (${heldClusters.length})`);
  rule();
  for (const c of heldClusters) {
    line();
    line(`  ▲ ${c.memberIds.length} rows · ${c.holdReason}`);
    for (const id of c.memberIds) line(`      ${label(id)}`);
  }
  line();
}

rule();
line(`GREY ZONE — ${reviews.length} pairs flagged, NOT merged`);
line('Scored high enough to be suspicious, not high enough to act on. These are');
line('what a human should look at first.');
rule();
if (reviews.length === 0) line('  (none)');
for (const p of reviews.sort((a, b) => b.score - a.score).slice(0, 40)) {
  line();
  line(`  ? ${p.score}  [${featureStr(p)}]  via ${p.blockKey}`);
  line(`      ${label(p.aId)}`);
  line(`      ${label(p.bId)}`);
  if (p.holdReason) line(`      held: ${p.holdReason}`);
}
if (reviews.length > 40) line(`\n  … ${reviews.length - 40} more grey-zone pairs`);
line();

rule();
line('WHY PAIRS WERE VETOED');
rule();
const vetoReasons = new Map<string, number>();
for (const p of vetoed) {
  const reason = (p.holdReason ?? 'below review threshold').replace(/\{[^}]*\}/g, '{…}').replace(/\d+d apart/, 'Nd apart').replace(/veto: (state|county|dates|TRS|acreage)[^]*/, 'veto: $1');
  vetoReasons.set(reason, (vetoReasons.get(reason) ?? 0) + 1);
}
for (const [reason, n] of Array.from(vetoReasons.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  line(`  ${String(n).padStart(4)}  ${reason}`);
}
line();

rule();
line('FINGERPRINT COVERAGE — which signals actually exist in the data');
rule();
const fps = Array.from(result.fingerprints.values());
const pct = (n: number) => `${((n / Math.max(1, fps.length)) * 100).toFixed(1)}%`;
const counts = {
  'county normalised': fps.filter((f) => f.countyKeys.length > 0).length,
  'multi-county': fps.filter((f) => f.countyKeys.length > 1).length,
  'state resolved': fps.filter((f) => f.state !== null).length,
  'acreage usable': fps.filter((f) => f.acreage !== null).length,
  'auction date': fps.filter((f) => f.date !== null).length,
  'TRS parsed': fps.filter((f) => f.trsKeys.length > 0).length,
  'named township': fps.filter((f) => f.namedTownshipKeys.length > 0).length,
  'precise geo': fps.filter((f) => f.preciseGeo).length,
  'generic title': fps.filter((f) => f.genericTitle).length,
  'weak-identity URL': fps.filter((f) => f.weakIdentity).length,
  'tract-numbered': fps.filter((f) => f.tractNumber !== null).length,
  'has listing id': fps.filter((f) => f.listingId !== null).length,
  'acreage=tillable': fps.filter((f) => f.acreageMeasure === 'tillable').length,
};
for (const [k, v] of Object.entries(counts)) {
  line(`  ${k.padEnd(20)} ${String(v).padStart(5)}  ${pct(v).padStart(7)}`);
}
line();
rule('═');
line('NOTHING WAS WRITTEN. Re-run with --json=<path> to capture the full detail.');
rule('═');
line();

if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify(
      {
        matcherVersion: MATCHER_VERSION,
        scope,
        observations: inputs.length,
        thresholds: { MERGE_THRESHOLD, REVIEW_THRESHOLD, MAX_CLUSTER_SIZE },
        clusters: multi,
        pairs: result.pairs,
        oversizedBlocks: result.oversizedBlocks,
        excluded: result.excluded,
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${jsonOut}`);
}
