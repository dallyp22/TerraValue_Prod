import { pool } from '../server/db.js';

/**
 * Add single-parcel owners to parcel_aggregated table
 * The original aggregation only included owners with 2+ parcels,
 * causing gaps on the map for single-parcel owners
 */
async function addSingleParcelOwners() {
  console.log('🔄 Adding single-parcel owners to parcel_aggregated table...\n');
  
  try {
    // Get counties to process (excluding Harrison)
    const countiesResult = await pool.query(`
      SELECT DISTINCT county_name 
      FROM parcels 
      WHERE county_name != 'HARRISON'
        AND geom IS NOT NULL
      ORDER BY county_name
    `);
    
    const counties = countiesResult.rows.map(r => r.county_name);
    console.log(`Found ${counties.length} counties to process\n`);
    
    let totalAdded = 0;
    
    for (const county of counties) {
      console.log(`\n📍 Processing ${county} County...`);
      
      // Insert single-parcel owners that aren't already in parcel_aggregated
      const insertSQL = `
        INSERT INTO parcel_aggregated (
          normalized_owner, 
          county, 
          parcel_ids, 
          parcel_count, 
          total_acres, 
          geom
        )
        SELECT 
          p.deed_holder_normalized,
          p.county_name,
          json_build_array(p.id),
          1,
          COALESCE(p.area_sqm, 0) / 4046.86,
          p.geom
        FROM parcels p
        WHERE p.county_name = $1
          AND p.deed_holder_normalized IS NOT NULL
          AND p.geom IS NOT NULL
          -- Only single-parcel owners
          AND (
            SELECT COUNT(*) 
            FROM parcels p2 
            WHERE p2.deed_holder_normalized = p.deed_holder_normalized 
              AND p2.county_name = $1
              AND p2.geom IS NOT NULL
          ) = 1
          -- Not already in parcel_aggregated
          AND NOT EXISTS (
            SELECT 1 
            FROM parcel_aggregated pa 
            WHERE pa.normalized_owner = p.deed_holder_normalized 
              AND pa.county = p.county_name
          )
        ON CONFLICT DO NOTHING
      `;
      
      const result = await pool.query(insertSQL, [county]);
      const added = result.rowCount || 0;
      totalAdded += added;
      
      console.log(`   ✅ Added ${added} single-parcel owners`);
    }
    
    console.log(`\n✅ Complete! Added ${totalAdded.toLocaleString()} total single-parcel owners`);
    
    // Update geom_3857 for new records
    console.log('\n🔄 Updating Web Mercator geometries...');
    await pool.query(`
      UPDATE parcel_aggregated 
      SET geom_3857 = ST_Transform(geom, 3857)
      WHERE geom_3857 IS NULL
    `);
    console.log('✅ Geometries updated');
    
    // Show stats
    const stats = await pool.query(`
      SELECT 
        county,
        COUNT(*) as total_records,
        COUNT(*) FILTER (WHERE parcel_count = 1) as single_parcel,
        COUNT(*) FILTER (WHERE parcel_count > 1) as multi_parcel
      FROM parcel_aggregated
      WHERE county != 'HARRISON'
      GROUP BY county
      ORDER BY county
      LIMIT 10
    `);
    
    console.log('\n📊 Sample county statistics:');
    console.table(stats.rows);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addSingleParcelOwners();

