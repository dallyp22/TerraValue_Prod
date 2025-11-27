import { pool } from '../server/db.js';

/**
 * Add parcels with missing owner names to aggregated table as "Unknown Owner"
 * This fills in gaps on the map for parcels that don't have deed holder info
 */
async function addUnknownOwners() {
  console.log('🔄 Adding parcels with missing owners as "Unknown Owner"...\n');
  
  try {
    // Get counties to process (excluding Harrison)
    const countiesResult = await pool.query(`
      SELECT DISTINCT county_name 
      FROM parcels 
      WHERE county_name != 'HARRISON'
        AND geom IS NOT NULL
        AND deed_holder_normalized IS NULL
      ORDER BY county_name
    `);
    
    const counties = countiesResult.rows.map(r => r.county_name);
    console.log(`Found ${counties.length} counties with unknown owner parcels\n`);
    
    let totalAdded = 0;
    
    for (const county of counties) {
      console.log(`📍 Processing ${county} County...`);
      
      // Insert parcels with missing owners as "Unknown Owner"
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
          'Unknown Owner',
          $1,
          json_agg(id),
          COUNT(*),
          COALESCE(SUM(area_sqm), 0) / 4046.86,
          ST_Union(geom)
        FROM parcels
        WHERE county_name = $1
          AND geom IS NOT NULL
          AND (deed_holder_normalized IS NULL OR deed_holder_normalized = '')
          -- Try to fix invalid geometries
          AND ST_IsValid(ST_MakeValid(geom))
        GROUP BY county_name
        HAVING COUNT(*) > 0
        ON CONFLICT DO NOTHING
      `;
      
      const result = await pool.query(insertSQL, [county]);
      const added = result.rowCount || 0;
      totalAdded += added;
      
      if (added > 0) {
        // Get the count of parcels added
        const countResult = await pool.query(`
          SELECT parcel_count 
          FROM parcel_aggregated 
          WHERE county = $1 AND normalized_owner = 'Unknown Owner'
        `, [county]);
        
        const parcelCount = countResult.rows[0]?.parcel_count || 0;
        console.log(`   ✅ Added 1 "Unknown Owner" record representing ${parcelCount} parcels`);
      } else {
        console.log(`   ⏭️  No unknown owner parcels to add`);
      }
    }
    
    console.log(`\n✅ Complete! Added ${totalAdded} "Unknown Owner" records`);
    
    // Update geom_3857 for new records
    if (totalAdded > 0) {
      console.log('\n🔄 Updating Web Mercator geometries...');
      await pool.query(`
        UPDATE parcel_aggregated 
        SET geom_3857 = ST_Transform(geom, 3857)
        WHERE geom_3857 IS NULL
      `);
      console.log('✅ Geometries updated');
    }
    
    // Show summary for counties with unknown owners
    const summary = await pool.query(`
      SELECT 
        county,
        parcel_count,
        ROUND(total_acres::numeric, 1) as acres
      FROM parcel_aggregated
      WHERE normalized_owner = 'Unknown Owner'
      ORDER BY parcel_count DESC
      LIMIT 20
    `);
    
    if (summary.rows.length > 0) {
      console.log('\n📊 Counties with Unknown Owner parcels:');
      console.table(summary.rows);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addUnknownOwners();

