import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';

dotenv.config();
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function optimizeParcelTiles() {
  console.log('🚀 Optimizing Parcel Tiles Performance');
  console.log('='.repeat(70));
  console.log();

  try {
    // Step 1: Add geom_3857 column
    console.log('1️⃣  Adding geom_3857 column...');
    await pool.query(`
      ALTER TABLE parcel_aggregated 
      ADD COLUMN IF NOT EXISTS geom_3857 GEOMETRY(MULTIPOLYGON, 3857)
    `);
    console.log('   ✅ Column added (or already exists)');
    console.log();

    // Step 2: Transform all geometries
    console.log('2️⃣  Transforming geometries to Web Mercator (EPSG:3857)...');
    console.log('   This will take 5-10 minutes for 605K parcels...');
    
    const result = await pool.query(`
      UPDATE parcel_aggregated 
      SET geom_3857 = ST_Transform(geom, 3857)
      WHERE geom_3857 IS NULL
    `);
    
    console.log(`   ✅ Transformed ${result.rowCount} geometries`);
    console.log();

    // Step 3: Create spatial index
    console.log('3️⃣  Creating spatial index on geom_3857...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS parcel_aggregated_geom_3857_idx 
      ON parcel_aggregated USING GIST(geom_3857)
    `);
    console.log('   ✅ Spatial index created');
    console.log();

    // Step 4: Analyze table for better query planning
    console.log('4️⃣  Analyzing table for query optimization...');
    await pool.query('ANALYZE parcel_aggregated');
    console.log('   ✅ Table analyzed');
    console.log();

    // Step 5: Verify the optimization
    console.log('5️⃣  Verifying optimization...');
    const check = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(geom_3857) as transformed
      FROM parcel_aggregated
    `);
    
    console.log(`   Total parcels: ${check.rows[0].total}`);
    console.log(`   Transformed: ${check.rows[0].transformed}`);
    
    if (check.rows[0].total === check.rows[0].transformed) {
      console.log('   ✅ All geometries transformed!');
    } else {
      console.warn(`   ⚠️  ${check.rows[0].total - check.rows[0].transformed} geometries not transformed`);
    }
    
    console.log();
    console.log('='.repeat(70));
    console.log('✅ OPTIMIZATION COMPLETE!');
    console.log();
    console.log('Expected improvement:');
    console.log('  - 50-70% faster tile generation');
    console.log('  - No more ST_Transform on every tile request');
    console.log('  - Better spatial index performance');
    console.log();
    console.log('Next: Update tile generation code to use geom_3857');
    
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await pool.end();
    process.exit(1);
  }
}

optimizeParcelTiles();

