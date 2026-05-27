/**
 * Backfill soil_csr2_ratings via USDA's AOI + Interpretation + WFS pipeline.
 *
 * USDA SDA's bulk tabular API (cointerp) does NOT include Iowa CSR2 — it's
 * a state-specific interpretation run on demand. The original load script
 * (scripts/load-iowa-soil-data.ts) assumed it was there and silently wrote
 * zero rows. This loader uses the same 4-step flow the runtime csr2.ts
 * service uses for single points, but runs it per Iowa survey area so we
 * get every mukey → CSR2 mapping in one pass.
 *
 *   1. POST /Tabular/post.rest  SERVICE=aoi REQUEST=create MUKEYLIST=...
 *   2. POST /Tabular/post.rest  SERVICE=interpretation REQUEST=getrating
 *                                AOIID=... ATTRIBUTEKEY=189   (Iowa CSR2)
 *   3. GET  /Spatial/SDMWGS84Geographic.wfs
 *           TYPENAME=mapunitpolythematic INTERPRESULTID=...
 *           BBOX=<area-or-iowa-bbox>
 *   4. Parse GML → unique mukey → CSR2 value
 *   5. Join with local soil_component (majcompflag='Yes') for the cokey FK
 *   6. Insert into soil_csr2_ratings
 *
 * Runtime: ~10-15 minutes for the 99 Iowa survey areas.
 *
 * Usage:
 *   npx tsx scripts/backfill-soil-csr2.ts
 */
import "dotenv/config";
import { soilDb, soilPool, executeSoilQuery } from "../server/soil-db";
import { csr2Ratings } from "@shared/soil-schema";
import { iowaCountyCentroids } from "../server/services/iowaCountyCentroids";

const SDA = "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest";
const WFS = "https://SDMDataAccess.sc.egov.usda.gov/Spatial/SDMWGS84Geographic.wfs";
const CSR2_ATTRIBUTEKEY = "189";

// USDA caps each WFS BBOX at 10.1 billion sq m. Iowa counties are typically
// 30–55 km on a side, so a ±0.4° box around the centroid (~88km × ~89km =
// ~7.8 billion sq m) comfortably covers any county while staying under cap.
const BBOX_HALF_DEG = 0.4;

async function postSDA(body: URLSearchParams) {
  const r = await fetch(SDA, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await r.text();
  return { status: r.status, text };
}

async function createAOI(mukeys: string[]): Promise<number | null> {
  const { status, text } = await postSDA(
    new URLSearchParams({
      SERVICE: "aoi",
      REQUEST: "create",
      MUKEYLIST: mukeys.join(","),
    }),
  );
  if (status !== 200) return null;
  try {
    return JSON.parse(text).id;
  } catch {
    return null;
  }
}

async function runInterp(aoiId: number): Promise<string | null> {
  const { status, text } = await postSDA(
    new URLSearchParams({
      SERVICE: "interpretation",
      REQUEST: "getrating",
      AOIID: String(aoiId),
      ATTRIBUTEKEY: CSR2_ATTRIBUTEKEY,
    }),
  );
  if (status !== 200) return null;
  try {
    return JSON.parse(text).interpresultid;
  } catch {
    return null;
  }
}

async function fetchWFS(
  interpId: string,
  bbox: string,
): Promise<Map<string, number>> {
  const url =
    `${WFS}?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetFeature` +
    `&TYPENAME=mapunitpolythematic` +
    `&INTERPRESULTID=${interpId}` +
    `&BBOX=${bbox}` +
    `&SRSNAME=EPSG:4326&OUTPUTFORMAT=GML2` +
    `&MAXFEATURES=50000`;
  const r = await fetch(url);
  if (!r.ok) return new Map();
  const text = await r.text();
  const out = new Map<string, number>();
  const re =
    /fid="mapunitpolythematic\.(\d+)"[\s\S]*?<ms:MapUnitRatingNumeric>([\d.]+)<\/ms:MapUnitRatingNumeric>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.set(m[1], parseFloat(m[2]));
  }
  return out;
}

function bboxForArea(areaname: string): string | null {
  // soil_legend.areaname looks like "Adair County, Iowa"
  const county = areaname.replace(/\s*County,\s*Iowa\s*$/i, "").trim();
  const c = iowaCountyCentroids[county];
  if (!c) return null;
  // BBOX format: minLon,minLat,maxLon,maxLat
  return [
    (c.longitude - BBOX_HALF_DEG).toFixed(4),
    (c.latitude - BBOX_HALF_DEG).toFixed(4),
    (c.longitude + BBOX_HALF_DEG).toFixed(4),
    (c.latitude + BBOX_HALF_DEG).toFixed(4),
  ].join(",");
}

async function processArea(areasymbol: string, areaname: string) {
  const bbox = bboxForArea(areaname);
  if (!bbox)
    return { area: areasymbol, mukeys: 0, rated: 0, err: "no-centroid" };

  const rows = await executeSoilQuery<{ mukey: string }>(
    `SELECT m.mukey FROM soil_mapunit m
       JOIN soil_legend l ON l.lkey = m.lkey
      WHERE l.areasymbol = $1`,
    [areasymbol],
  );
  const mukeys = rows.map((r) => r.mukey);
  if (mukeys.length === 0) return { area: areasymbol, mukeys: 0, rated: 0 };

  const aoiId = await createAOI(mukeys);
  if (!aoiId) return { area: areasymbol, mukeys: mukeys.length, rated: 0, err: "aoi" };

  const interpId = await runInterp(aoiId);
  if (!interpId)
    return { area: areasymbol, mukeys: mukeys.length, rated: 0, err: "interp" };

  // ONE WFS call per area — bbox is sized to the county centroid.
  const merged = await fetchWFS(interpId, bbox);

  // Restrict to mukeys we actually own (the AOI filters this server-side
  // already, but defense-in-depth).
  const ours = new Set(mukeys);
  const ratings = [...merged.entries()].filter(([k]) => ours.has(k));

  if (ratings.length === 0)
    return { area: areasymbol, mukeys: mukeys.length, rated: 0, err: "no-features" };

  // Join with the major component for each mukey.
  const cokeyRows = await executeSoilQuery<{
    mukey: string;
    cokey: string;
    comppct_r: number | null;
  }>(
    `SELECT mukey, cokey, comppct_r
       FROM soil_component
      WHERE majcompflag = 'Yes'
        AND mukey = ANY($1::text[])`,
    [ratings.map(([k]) => k)],
  );
  const majByMukey = new Map<string, { cokey: string; pct: number | null }>();
  for (const r of cokeyRows) {
    if (!majByMukey.has(r.mukey)) {
      majByMukey.set(r.mukey, { cokey: r.cokey, pct: r.comppct_r });
    }
  }

  // Build inserts for mukeys that have both a CSR2 and a major component.
  const toInsert = ratings
    .map(([mukey, csr2]) => {
      const c = majByMukey.get(mukey);
      if (!c) return null;
      return {
        mukey,
        cokey: c.cokey,
        csr2Value: csr2,
        componentPercent: c.pct,
      };
    })
    .filter(Boolean) as Array<{
    mukey: string;
    cokey: string;
    csr2Value: number;
    componentPercent: number | null;
  }>;

  if (toInsert.length === 0)
    return { area: areasymbol, mukeys: mukeys.length, rated: 0, err: "no-major-comp" };

  // Batch insert 500 at a time to keep the SQL well under the HTTP-driver limit.
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    await soilDb!.insert(csr2Ratings).values(batch).onConflictDoNothing();
  }

  return { area: areasymbol, mukeys: mukeys.length, rated: toInsert.length };
}

async function main() {
  if (!soilDb || !soilPool) {
    console.error("❌ DATABASE_URL_SOIL not set");
    process.exit(1);
  }
  console.log("🌽 CSR2 backfill (AOI+interp+WFS per Iowa survey area)\n");

  const areas = await executeSoilQuery<{ areasymbol: string; areaname: string }>(
    `SELECT areasymbol, areaname FROM soil_legend
      WHERE areasymbol LIKE 'IA%' ORDER BY areasymbol`,
  );
  console.log(`   ${areas.length} Iowa survey areas\n`);

  const start = Date.now();
  let totalRated = 0;
  let failed = 0;

  for (let i = 0; i < areas.length; i++) {
    const area = areas[i].areasymbol;
    const t0 = Date.now();
    try {
      const r = await processArea(area, areas[i].areaname);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      if (r.err) {
        failed++;
        console.log(
          `   [${i + 1}/${areas.length}] ${area}: SKIP (${r.err}) mukeys=${r.mukeys} ${elapsed}s`,
        );
      } else {
        totalRated += r.rated;
        console.log(
          `   [${i + 1}/${areas.length}] ${area}: ${r.rated}/${r.mukeys} mukeys rated, ${elapsed}s (total ${totalRated})`,
        );
      }
    } catch (err) {
      failed++;
      console.warn(
        `   [${i + 1}/${areas.length}] ${area}: ERROR — ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log(
    `\n✅ Done in ${Math.floor(elapsed / 60)}m ${elapsed % 60}s. ${totalRated} ratings inserted across ${areas.length - failed}/${areas.length} areas.`,
  );

  const cnt = await executeSoilQuery<{ n: number }>(
    "SELECT COUNT(*)::int AS n FROM soil_csr2_ratings",
  );
  console.log(
    `   soil_csr2_ratings final count: ${cnt[0].n.toLocaleString()}`,
  );

  await soilPool?.end();
}

main().catch((err) => {
  console.error("❌ Backfill failed:", err);
  process.exit(1);
});
