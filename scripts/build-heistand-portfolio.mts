/**
 * Build the Heistand Family farm portfolio overlay.
 *
 * Reads TWO inputs and joins them by farm name:
 *   1. Heistand_Farm_Parcels_Iowa.csv — parcel identity per farm (parcel number,
 *      county, legal description, Sec-Twp-Rng, lat/long). This is the authority
 *      for WHICH ground belongs to each farm.
 *   2. Farm information sheet .csv    — farm economics (rent, CSR, tenant,
 *      closing date, sale price). This is the authority for the farm's numbers.
 *
 * Writes:
 *   - client/public/heistand-farms.geojson  (map overlay, one Feature per farm)
 *   - docs/heistand-match-report.md         (what matched, how, what needs review)
 *
 * WHY THIS REPLACED NAME MATCHING: the previous version guessed each farm by
 * fuzzy-matching a seller surname against `parcels.deed_holder` and then unioned
 * *every* parcel that holder owned in the county. That over- and under-covered
 * badly (Schultz was off by 99.9%, Wright by 86%) and 4 farms never matched at
 * all. With explicit parcel numbers we join directly and the surname heuristic
 * is gone entirely.
 *
 * MATCH TIERS, in order. Every parcel records which tier it came from, and the
 * report prints the mix per farm so a weak farm is visible rather than implied:
 *   exact    — (county, parcel_number) hit in `parcels`. Trustworthy.
 *   spatial  — parcel_number absent from our snapshot (the county has since
 *              split/renumbered it), so we fall back to the parcel polygon that
 *              CONTAINS the row's lat/long. Only allowed where the source gave
 *              per-parcel coordinates; see PER_PARCEL_COORDS below.
 *   missing  — neither worked. Reported, never guessed.
 *
 * Spatial hits are de-duplicated by parcel id. When a county splits one 40-acre
 * parcel into four, all four new numbers land inside the one old polygon we
 * hold; drawing that polygon once is correct, summing it four times is not.
 *
 * Usage:
 *   npx tsx scripts/build-heistand-portfolio.mts [parcels.csv] [farm-sheet.csv]
 */
import 'dotenv/config';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_PARCEL_CSV = '/Users/dallas/Downloads/Heistand_Farm_Parcels_Iowa.csv';
const DEFAULT_SHEET_CSV =
  '/Users/dallas/Downloads/Farm information sheet  7.8.26.xlsx - purchased Farms .csv';
const OUT_GEOJSON = 'client/public/heistand-farms.geojson';
const OUT_REPORT = 'docs/heistand-match-report.md';

/** Farms with no cropland geometry worth drawing (grain bin sites). */
const SKIP = new Set(['Earling Grain Bin Parcel 1', 'Earling Grain Bin Parcel 2']);

/**
 * Farms whose lat/long is a single repeated centroid rather than one point per
 * parcel — the source could not reach those county assessor portals, so it also
 * left Assessor Acres at 0. Point-in-polygon is meaningless here (every row
 * returns the same polygon), so spatial fallback is disabled and unmatched
 * parcels are reported as missing instead of silently mis-drawn.
 *
 * Derived, not assumed: a farm qualifies when its rows have fewer distinct
 * coordinate pairs than rows. Recomputed at runtime — this list is documentation.
 *   Behrendt, Wheatley, Free Land-Buman, Century Gross, Glennwood Exit,
 *   Audubon 270, Red Oak 128.
 */

/** Parcel-CSV farm name -> farm-sheet farm name, where the two disagree. */
const NAME_ALIASES: Record<string, string> = {
  'audubon 270 (fitzgerald 270)': 'audubon 270',
};

type ParcelRow = {
  farm: string;
  county: string;
  ownerEntity: string;
  parcelNumber: string;
  legal: string;
  secTwpRng: string;
  lat: number | null;
  lon: number | null;
  sheetTaxAcres: number | null;
  sourceConfidence: string;
};

type Farm = {
  name: string;
  location: string;
  county: string;
  owner: string;
  taxAcres: number | null;
  fsaAcres: number | null;
  rentPerAcre: number | null;
  csr: number | null;
  tenant: string;
  closingDate: string;
  salePrice: number | null;
};

/** Minimal RFC-4180 CSV parser (handles quoted fields with embedded commas). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const clean = (s: string | undefined) => (s ?? '').trim();
const num = (s: string | undefined) => {
  const v = parseFloat(clean(s).replace(/[$,%\s]/g, ''));
  return Number.isFinite(v) ? v : null;
};
/** Farm names are compared with punctuation and spacing removed. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/**
 * Key used to look a farm up in the sheet. Display names always come from the
 * parcel CSV — aliasing must not rewrite what the map and report show.
 */
const sheetKey = (s: string) => norm(NAME_ALIASES[s.trim().toLowerCase()] ?? s);

function loadParcelRows(csvPath: string): ParcelRow[] {
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const header = rows[0].map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const iFarm = col('Farm Name'), iCounty = col('County'), iOwner = col('Owner Entity');
  const iPn = col('Parcel Number'), iLegal = col('Legal Description'), iStr = col('Sec-Twp-Rng');
  const iLat = col('Lat'), iLon = col('Long'), iTax = col('Sheet Tax Acres'), iConf = col('Match Confidence');

  return rows.slice(1)
    .filter((r) => clean(r[iFarm]) && clean(r[iCounty]))
    .map((r) => ({
      farm: clean(r[iFarm]),
      county: clean(r[iCounty]),
      ownerEntity: clean(r[iOwner]),
      parcelNumber: clean(r[iPn]),
      legal: clean(r[iLegal]).replace(/\s+/g, ' '),
      secTwpRng: clean(r[iStr]),
      lat: num(r[iLat]),
      lon: num(r[iLon]),
      sheetTaxAcres: num(r[iTax]),
      sourceConfidence: clean(r[iConf]).split(' - ')[0],
    }));
}

function loadFarmSheet(csvPath: string): Map<string, Farm> {
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  // Row 0 is a numeric column-index banner; row 1 is the real header.
  const farms = rows.slice(2)
    .filter((r) => clean(r[0]) && clean(r[2]))
    .map((r) => ({
      name: clean(r[0]),
      location: clean(r[1]),
      county: clean(r[2]),
      owner: clean(r[3]).replace(/\s+/g, ' '),
      taxAcres: num(r[5]),
      fsaAcres: num(r[6]),
      rentPerAcre: num(r[12]),
      csr: num(r[10]),
      tenant: clean(r[13]),
      closingDate: clean(r[25]),
      salePrice: num(r[19]),
    }));
  return new Map(farms.map((f) => [norm(f.name), f]));
}

/** A parcel number is real if it is digits; the source used prose for unknowns. */
const isRealParcelNumber = (pn: string) => /^\d{6,}$/.test(pn);

type Matched = { id: number; tier: 'exact' | 'spatial'; acres: number; deedHolder: string };

async function main() {
  const parcelCsv = process.argv[2] ?? DEFAULT_PARCEL_CSV;
  const sheetCsv = process.argv[3] ?? DEFAULT_SHEET_CSV;
  for (const p of [parcelCsv, sheetCsv]) {
    if (!fs.existsSync(p)) throw new Error(`CSV not found: ${p}`);
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const parcelRows = loadParcelRows(parcelCsv);
  const sheet = loadFarmSheet(sheetCsv);
  console.log(`Loaded ${parcelRows.length} parcels from ${path.basename(parcelCsv)}`);
  console.log(`Loaded ${sheet.size} farms from ${path.basename(sheetCsv)}\n`);

  // Group parcels by farm, preserving sheet order.
  const byFarm = new Map<string, ParcelRow[]>();
  for (const r of parcelRows) {
    if (SKIP.has(r.farm)) continue;
    if (!byFarm.has(r.farm)) byFarm.set(r.farm, []);
    byFarm.get(r.farm)!.push(r);
  }

  const features: any[] = [];
  const reportRows: string[] = [];
  const tally = { full: 0, partial: 0, weak: 0, none: 0 };
  let totExact = 0, totSpatial = 0, totMissing = 0;

  for (const [farmName, rows] of byFarm) {
    // Spatial fallback is only sound when the source gave per-parcel coordinates.
    const distinctCoords = new Set(rows.map((r) => `${r.lat},${r.lon}`)).size;
    const perParcelCoords = distinctCoords === rows.length;

    const matched = new Map<number, Matched>();
    const missing: string[] = [];
    let exactCount = 0, spatialCount = 0;

    for (const r of rows) {
      let hit: { id: number; acres: number; deedHolder: string } | null = null;
      let hitTier: 'exact' | 'spatial' | null = null;

      if (isRealParcelNumber(r.parcelNumber)) {
        const { rows: q } = await pool.query(
          `SELECT id, ST_Area(geom::geography)/4046.86 AS acres, deed_holder AS "deedHolder"
             FROM parcels
            WHERE parcel_number = $1 AND upper(county_name) = upper($2)
            LIMIT 1`,
          [r.parcelNumber, r.county],
        );
        if (q.length) { hit = q[0]; hitTier = 'exact'; exactCount++; }
      }

      if (!hit && perParcelCoords && r.lat != null && r.lon != null) {
        const { rows: q } = await pool.query(
          `SELECT id, ST_Area(geom::geography)/4046.86 AS acres, deed_holder AS "deedHolder"
             FROM parcels
            WHERE upper(county_name) = upper($1)
              AND ST_Contains(geom, ST_SetSRID(ST_Point($2, $3), 4326))
            LIMIT 1`,
          [r.county, r.lon, r.lat],
        );
        if (q.length) { hit = q[0]; hitTier = 'spatial'; spatialCount++; }
      }

      if (hit) {
        // De-dupe: several split parcels can resolve to one polygon we still hold.
        if (!matched.has(hit.id)) {
          matched.set(hit.id, { id: hit.id, tier: hitTier!, acres: +hit.acres, deedHolder: hit.deedHolder });
        }
      } else {
        missing.push(r.parcelNumber || '(blank)');
      }
    }

    totExact += exactCount; totSpatial += spatialCount; totMissing += missing.length;

    const farm = sheet.get(sheetKey(farmName));
    const taxAcres = farm?.taxAcres ?? rows[0].sheetTaxAcres;
    const coverage = rows.length ? (rows.length - missing.length) / rows.length : 0;

    if (!matched.size) {
      tally.none++;
      reportRows.push(`| ${farmName} | ${rows[0].county} | ${taxAcres ?? '—'} | — | 0/${rows.length} | **no geometry** |`);
      console.log(`NONE      ${farmName.padEnd(32)} 0 of ${rows.length} parcels resolved`);
      continue;
    }

    const ids = [...matched.keys()];
    const { rows: geo } = await pool.query<{ geometry: string; acres: number }>(
      `SELECT ST_AsGeoJSON(ST_Union(geom)) AS geometry,
              SUM(ST_Area(geom::geography)/4046.86)::float8 AS acres
         FROM parcels WHERE id = ANY($1::int[])`,
      [ids],
    );
    if (!geo[0]?.geometry) {
      tally.none++;
      console.log(`NOGEOM    ${farmName}`);
      continue;
    }

    const dbAcres = Math.round(geo[0].acres * 10) / 10;
    const acreErr = taxAcres ? Math.abs(dbAcres - taxAcres) / taxAcres : null;

    // Confidence combines parcel coverage with acreage agreement — a farm can
    // resolve every parcel and still be wrong if the acres do not land.
    const grade =
      coverage === 1 && acreErr != null && acreErr < 0.05 ? 'full'
      : coverage >= 0.8 && (acreErr == null || acreErr < 0.2) ? 'partial'
      : 'weak';
    tally[grade as keyof typeof tally]++;
    // The map layer filters and colours on `confidence` with the original
    // high/medium/low vocabulary (EnhancedMap.tsx `match` expressions and the
    // LeftSidebar checkboxes). Keep emitting that so the overlay keeps working;
    // `grade` carries the clearer wording for the report and any future UI.
    const confidence = ({ full: 'high', partial: 'medium', weak: 'low' } as const)[grade];

    const deedHolders = [...new Set([...matched.values()].map((m) => (m.deedHolder ?? '').trim()).filter(Boolean))];

    features.push({
      type: 'Feature',
      geometry: JSON.parse(geo[0].geometry),
      properties: {
        farm: farmName,
        location: farm?.location ?? '',
        county: rows[0].county,
        owner: farm?.owner || rows[0].ownerEntity || '(not listed)',
        ownerEntity: rows[0].ownerEntity,
        taxAcres,
        fsaAcres: farm?.fsaAcres ?? null,
        dbAcres,
        parcelCount: matched.size,
        parcelsInSource: rows.length,
        matchExact: exactCount,
        matchSpatial: spatialCount,
        matchMissing: missing.length,
        deedHolders,
        // Legacy single-string field the popup still reads.
        matchedDeedHolder: deedHolders.join(', '),
        secTwpRng: [...new Set(rows.map((r) => r.secTwpRng).filter(Boolean))],
        confidence,
        grade,
        csr: farm?.csr ?? null,
        rentPerAcre: farm?.rentPerAcre ?? null,
        tenant: farm?.tenant ?? '',
        closingDate: farm?.closingDate ?? '',
        salePrice: farm?.salePrice ?? null,
      },
    });

    const pct = acreErr == null ? '—' : `${(acreErr * 100).toFixed(1)}%`;
    const mix = `${exactCount} exact${spatialCount ? ` + ${spatialCount} spatial` : ''}${missing.length ? ` + ${missing.length} missing` : ''}`;
    reportRows.push(
      `| ${farmName} | ${rows[0].county} | ${taxAcres ?? '—'} | ${dbAcres} | ${mix} | ${grade} (${pct}) |`,
    );
    console.log(
      `${grade.toUpperCase().padEnd(8)} ${farmName.padEnd(32)} tax=${String(taxAcres ?? '—').padStart(7)} db=${dbAcres.toFixed(1).padStart(7)}  ${mix}`,
    );
    if (missing.length) {
      reportRows.push(`| | | | | _unresolved parcels:_ ${missing.join(', ')} | |`);
    }
  }

  // Farms present in the sheet but absent from the parcel CSV.
  // Compare on the alias-aware key, or an aliased farm looks absent from itself.
  const parcelFarmNames = new Set([...byFarm.keys()].map(sheetKey));
  const sheetOnly = [...sheet.values()]
    .filter((f) => !parcelFarmNames.has(norm(f.name)) && !SKIP.has(f.name))
    .filter((f) => f.taxAcres != null || /farm|acre|\d/i.test(f.name));

  fs.mkdirSync(path.dirname(OUT_GEOJSON), { recursive: true });
  fs.writeFileSync(
    OUT_GEOJSON,
    JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
  );

  const totalAcres = features.reduce((s, f) => s + (f.properties.dbAcres ?? 0), 0);
  const totalTax = features.reduce((s, f) => s + (f.properties.taxAcres ?? 0), 0);

  const md = [
    '# Heistand Portfolio — Parcel Match Report',
    '',
    `Generated by \`scripts/build-heistand-portfolio.mts\` from \`${path.basename(parcelCsv)}\``,
    `joined to \`${path.basename(sheetCsv)}\` for farm economics.`,
    '',
    `- Farms with parcel data: **${byFarm.size}**`,
    `- Drawn on map: **${features.length}** (${totalAcres.toFixed(0)} acres from parcel geometry vs ${totalTax.toFixed(0)} sheet tax acres)`,
    `- Parcels resolved: **${totExact} exact** + **${totSpatial} spatial fallback** + **${totMissing} unresolved** of ${totExact + totSpatial + totMissing}`,
    `- Confidence: full ${tally.full} · partial ${tally.partial} · weak ${tally.weak} · no geometry ${tally.none}`,
    '',
    '**How to read this.** `exact` means the parcel number joined straight to our',
    'parcel snapshot. `spatial` means the county has since split or renumbered that',
    'parcel, so we drew the polygon containing its coordinates — sound, but coarser.',
    '`missing` parcels are reported, never guessed. Acreage comes from the geometry',
    'we actually drew, so it will trail the sheet wherever parcels are unresolved.',
    '',
    '| Farm | County | Sheet acres | Drawn acres | Parcel match | Confidence (acre err) |',
    '|---|---|---:|---:|---|---|',
    ...reportRows,
    '',
    ...(sheetOnly.length
      ? [
          '## In the farm sheet but absent from the parcel CSV',
          '',
          'These have no parcel identity yet, so nothing is drawn for them.',
          '',
          ...sheetOnly.map((f) => `- **${f.name}** (${f.county}${f.taxAcres ? `, ${f.taxAcres} tax acres` : ''})`),
          '',
        ]
      : []),
  ].join('\n');

  fs.writeFileSync(OUT_REPORT, md);
  console.log(`\nWrote ${OUT_GEOJSON} (${features.length} features)`);
  console.log(`Wrote ${OUT_REPORT}`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
