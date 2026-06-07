import 'dotenv/config';
import { pool } from '../server/db.js';

/**
 * Fix parcel_aggregated.total_acres: it was stored in Web Mercator
 * (ST_Area(geom_3857)), inflating area ~1.79x at Iowa latitudes. Recompute as
 * true geodesic acreage (ST_Area(geom::geography)/4046.86). Batched by id.
 */
(async () => {
  const { rows: mm } = await pool.query('SELECT min(id) lo, max(id) hi, count(*)::int n FROM parcel_aggregated');
  const lo = Number(mm[0].lo), hi = Number(mm[0].hi);
  console.log(`Migrating total_acres for ${mm[0].n} rows (id ${lo}..${hi})`);
  const STEP = 25000;
  let done = 0, t0 = Date.now();
  for (let start = lo; start <= hi; start += STEP) {
    await pool.query(
      `UPDATE parcel_aggregated
         SET total_acres = ST_Area(geom::geography)/4046.86
       WHERE id >= $1 AND id < $2 AND geom IS NOT NULL`,
      [start, start + STEP],
    );
    done += STEP;
    if (done % 250000 < STEP) console.log(`  …id ${start + STEP} (${((Date.now()-t0)/1000).toFixed(0)}s)`);
  }
  const chk = await pool.query('SELECT round(total_acres::numeric,1) ta, round((ST_Area(geom::geography)/4046.86)::numeric,1) geo FROM parcel_aggregated WHERE id=1205492');
  console.log('VERIFY id 1205492 → total_acres:', chk.rows[0].ta, '| geodesic:', chk.rows[0].geo);
  console.log('DONE in', ((Date.now()-t0)/60000).toFixed(1), 'min');
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
