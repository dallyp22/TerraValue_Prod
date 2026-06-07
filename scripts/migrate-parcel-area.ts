import 'dotenv/config';
import { pool } from '../server/db.js';

/**
 * Fix parcels.area_sqm: stored in Web Mercator (~1.79x inflated at Iowa
 * latitudes). Recompute as true geodesic square-meters ST_Area(geom::geography).
 * Tiles/matching divide by 4046.86 for acres, so units stay m². Batched by id.
 */
(async () => {
  const { rows: mm } = await pool.query('SELECT min(id) lo, max(id) hi, count(*)::int n FROM parcels');
  const lo = Number(mm[0].lo), hi = Number(mm[0].hi);
  console.log(`Migrating area_sqm for ${mm[0].n} rows (id ${lo}..${hi})`);
  const STEP = 25000;
  let t0 = Date.now();
  for (let start = lo; start <= hi; start += STEP) {
    await pool.query(
      `UPDATE parcels SET area_sqm = ST_Area(geom::geography)
       WHERE id >= $1 AND id < $2 AND geom IS NOT NULL`,
      [start, start + STEP],
    );
    if ((start - lo) % 500000 < STEP) console.log(`  …id ${start + STEP} (${((Date.now()-t0)/1000).toFixed(0)}s)`);
  }
  const chk = await pool.query("SELECT round(avg(area_sqm / NULLIF(ST_Area(geom::geography),0))::numeric,4) ratio FROM (SELECT area_sqm, geom FROM parcels WHERE county_name ILIKE 'shelby' LIMIT 500) s");
  console.log('VERIFY area_sqm / true ratio (should be ~1.0):', chk.rows[0].ratio);
  console.log('DONE in', ((Date.now()-t0)/60000).toFixed(1), 'min');
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
