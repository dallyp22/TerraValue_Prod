import { Pool } from '@neondatabase/serverless';

/**
 * Find clusters of adjacent parcels for a specific owner in a specific county
 * Uses PostGIS spatial operations for efficient adjacency detection
 */
export async function findAdjacentParcelClusters(
  pool: Pool,
  normalizedOwner: string,
  county: string
): Promise<Array<{ parcelIds: number[]; geometry: string }>> {
  
  try {
    // Strategy: Use ST_ClusterDBSCAN to group adjacent parcels
    // eps=0.0001 means parcels within ~11 meters are considered adjacent
    // This accounts for small gaps in parcel boundaries
    
    const sql = `
      WITH clustered_parcels AS (
        SELECT 
          id,
          deed_holder_normalized,
          county_name,
          geom,
          ST_ClusterDBSCAN(geom, eps := 0.0001, minpoints := 1) OVER (
            PARTITION BY deed_holder_normalized, county_name
            ORDER BY id
          ) as cluster_id
        FROM parcels
        WHERE deed_holder_normalized = $1
          AND county_name = $2
          AND geom IS NOT NULL
      ),
      clusters_with_union AS (
        SELECT 
          cluster_id,
          array_agg(id) as parcel_ids,
          COUNT(*) as parcel_count,
          ST_Union(geom) as combined_geom
        FROM clustered_parcels
        GROUP BY cluster_id
      )
      SELECT 
        parcel_ids,
        parcel_count,
        ST_AsText(combined_geom) as geometry_wkt
      FROM clusters_with_union
      ORDER BY parcel_count DESC
    `;
    
    const result = await pool.query(sql, [normalizedOwner, county]);
    
    return result.rows.map(row => ({
      parcelIds: row.parcel_ids,
      geometry: row.geometry_wkt
    }));
    
  } catch (error) {
    console.error(`Error finding adjacent clusters for ${normalizedOwner} in ${county}:`, error);
    return [];
  }
}

/**
 * Process all owners in a specific county and create aggregated parcels
 * Skips Harrison County as it has its own client-side implementation
 */
export async function processCountyAggregation(
  pool: Pool,
  county: string
): Promise<{ clustersCreated: number; parcelsProcessed: number }> {
  
  if (county === 'HARRISON') {
    console.log(`⏭️  Skipping ${county} County - using client-side aggregation`);
    return { clustersCreated: 0, parcelsProcessed: 0 };
  }
  
  console.log(`\n📍 Processing ${county} County...`);
  
  try {
    // Get all owners in this county with 2+ parcels
    const ownersResult = await pool.query(`
      SELECT 
        deed_holder_normalized,
        COUNT(*) as parcel_count
      FROM parcels
      WHERE county_name = $1
        AND deed_holder_normalized IS NOT NULL
        AND geom IS NOT NULL
      GROUP BY deed_holder_normalized
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) ASC  -- Process small owners first (faster)
    `, [county]);
    
    const owners = ownersResult.rows;
    console.log(`   Found ${owners.length} owners with multiple parcels`);
    
    let totalClusters = 0;
    let totalParcels = 0;
    
    // Process each owner
    for (let i = 0; i < owners.length; i++) {
      const owner = owners[i];
      
      if (i % 100 === 0 && i > 0) {
        console.log(`   Progress: ${i}/${owners.length} owners processed...`);
      }
      
      // Use ST_ClusterDBSCAN for this owner in this county
      const clustersSQL = `
        WITH clustered AS (
          SELECT 
            id,
            area_sqm,
            geom,
            ST_ClusterDBSCAN(geom, eps := 0.0001, minpoints := 1) OVER (ORDER BY id) as cluster_id
          FROM parcels
          WHERE deed_holder_normalized = $1
            AND county_name = $2
            AND geom IS NOT NULL
        ),
        clusters_unioned AS (
          SELECT 
            cluster_id,
            array_agg(id) as parcel_ids,
            COUNT(*) as parcel_count,
            COALESCE(SUM(area_sqm), 0) / 4046.86 as total_acres,
            ST_Union(geom) as combined_geom
          FROM clustered
          GROUP BY cluster_id
        )
        INSERT INTO parcel_aggregated (
          normalized_owner, county, parcel_ids, parcel_count, total_acres, geom
        )
        SELECT 
          $1,
          $2,
          to_json(parcel_ids),
          parcel_count,
          total_acres,
          combined_geom
        FROM clusters_unioned
        RETURNING id
      `;
      
      const insertResult = await pool.query(clustersSQL, [owner.deed_holder_normalized, county]);
      
      totalClusters += insertResult.rowCount || 0;
      totalParcels += parseInt(owner.parcel_count);
    }
    
    console.log(`   ✅ Created ${totalClusters} aggregated parcels from ${totalParcels} individual parcels`);
    
    return { clustersCreated: totalClusters, parcelsProcessed: totalParcels };
    
  } catch (error) {
    console.error(`❌ Error processing ${county} County:`, error);
    throw error;
  }
}

/**
 * Setup the parcel_aggregated table with PostGIS geometry column
 */
export async function setupAggregatedTable(pool: Pool): Promise<void> {
  console.log('🔧 Setting up parcel_aggregated table...');
  
  try {
    // Check if geometry column exists
    const checkGeomCol = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'parcel_aggregated' AND column_name = 'geom'
    `);
    
    if (checkGeomCol.rows.length === 0) {
      // Add geometry column
      await pool.query(`
        SELECT AddGeometryColumn('parcel_aggregated', 'geom', 4326, 'MULTIPOLYGON', 2)
      `);
      console.log('✅ Added geometry column to parcel_aggregated table');
      
      // Create spatial index
      await pool.query(`
        CREATE INDEX IF NOT EXISTS parcel_aggregated_geom_idx 
        ON parcel_aggregated USING GIST(geom)
      `);
      console.log('✅ Created spatial index on parcel_aggregated.geom');
    } else {
      console.log('ℹ️  Geometry column already exists');
    }
  } catch (error) {
    console.error('❌ Error setting up aggregated table:', error);
    throw error;
  }
}

