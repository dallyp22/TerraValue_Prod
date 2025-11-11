import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

async function inspect() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  
  try {
    console.log('🔍 Inspecting Aggregated Parcels in Neon Database\n');
    console.log('=' .repeat(60));
    
    // 1. Table schema
    console.log('\n📋 TABLE SCHEMA:\n');
    const schema = await pool.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_name = 'parcel_aggregated'
      ORDER BY ordinal_position
    `);
    console.table(schema.rows);
    
    // 2. Sample row from POLK County
    console.log('\n📊 SAMPLE DATA (POLK County - Largest Cluster):\n');
    const sample = await pool.query(`
      SELECT 
        id,
        normalized_owner,
        county,
        parcel_ids::text as parcel_ids_preview,
        parcel_count,
        total_acres,
        created_at,
        ST_AsText(ST_Envelope(geom)) as geometry_bbox,
        ST_GeometryType(geom) as geom_type,
        pg_column_size(geom) as geom_size_bytes
      FROM parcel_aggregated
      WHERE county = 'POLK'
      ORDER BY parcel_count DESC
      LIMIT 3
    `);
    
    sample.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.normalized_owner} (${row.county} County)`);
      console.log(`   ID: ${row.id}`);
      console.log(`   Parcel Count: ${row.parcel_count}`);
      console.log(`   Total Acres: ${row.total_acres}`);
      console.log(`   Parcel IDs: ${row.parcel_ids_preview.substring(0, 100)}...`);
      console.log(`   Geometry Type: ${row.geom_type}`);
      console.log(`   Geometry Size: ${row.geom_size_bytes} bytes`);
      console.log(`   BBox: ${row.geometry_bbox}`);
      console.log(`   Created: ${row.created_at}\n`);
    });
    
    // 3. Distribution by parcel count
    console.log('📈 DISTRIBUTION BY PARCEL COUNT:\n');
    const dist = await pool.query(`
      SELECT 
        CASE 
          WHEN parcel_count = 1 THEN '1 parcel (single)'
          WHEN parcel_count BETWEEN 2 AND 5 THEN '2-5 parcels'
          WHEN parcel_count BETWEEN 6 AND 10 THEN '6-10 parcels'
          WHEN parcel_count BETWEEN 11 AND 50 THEN '11-50 parcels'
          WHEN parcel_count > 50 THEN '50+ parcels'
        END as range,
        COUNT(*) as cluster_count,
        SUM(parcel_count) as total_parcels,
        ROUND(AVG(total_acres)::numeric, 1) as avg_acres
      FROM parcel_aggregated
      GROUP BY range
      ORDER BY MIN(parcel_count)
    `);
    console.table(dist.rows);
    
    // 4. Data quality checks
    console.log('\n✅ DATA QUALITY CHECKS:\n');
    
    const nullGeom = await pool.query(`SELECT COUNT(*) as count FROM parcel_aggregated WHERE geom IS NULL`);
    console.log(`Null geometries: ${nullGeom.rows[0].count}`);
    
    const nullAcres = await pool.query(`SELECT COUNT(*) as count FROM parcel_aggregated WHERE total_acres IS NULL OR total_acres = 0`);
    console.log(`Null/zero acres: ${nullAcres.rows[0].count}`);
    
    const validJson = await pool.query(`SELECT COUNT(*) as count FROM parcel_aggregated WHERE parcel_ids IS NOT NULL`);
    console.log(`Valid parcel_ids JSON: ${validJson.rows[0].count}`);
    
    // 5. Index information
    console.log('\n🗂️  INDEXES:\n');
    const indexes = await pool.query(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'parcel_aggregated'
    `);
    indexes.rows.forEach(row => {
      console.log(`${row.indexname}:`);
      console.log(`  ${row.indexdef}\n`);
    });
    
    // 6. Table size
    console.log('💾 STORAGE:\n');
    const size = await pool.query(`
      SELECT 
        pg_size_pretty(pg_total_relation_size('parcel_aggregated')) as total_size,
        pg_size_pretty(pg_relation_size('parcel_aggregated')) as table_size,
        pg_size_pretty(pg_indexes_size('parcel_aggregated')) as indexes_size
    `);
    console.table(size.rows);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

inspect();

