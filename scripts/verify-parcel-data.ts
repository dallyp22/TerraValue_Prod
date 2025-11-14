import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

interface TableInfo {
  tablename: string;
  schemaname: string;
}

interface CountResult {
  count: string;
}

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

async function verifyParcelData() {
  console.log("🔍 VERIFYING IOWA PARCEL DATA\n");
  console.log("=" + "=".repeat(70) + "\n");

  try {
    // 1. Check if PostGIS is enabled
    console.log("1️⃣  Checking PostGIS Extension...");
    try {
      const postgisVersion = await sql`SELECT PostGIS_version() as version`;
      console.log(`   ✅ PostGIS is enabled: ${postgisVersion[0].version}\n`);
    } catch (error) {
      console.log(`   ❌ PostGIS is NOT enabled\n`);
    }

    // 2. Check if tables exist
    console.log("2️⃣  Checking Table Existence...");
    const tables = await sql<TableInfo[]>`
      SELECT tablename, schemaname 
      FROM pg_tables 
      WHERE tablename IN ('parcels', 'parcel_ownership_groups', 'parcel_aggregated')
      ORDER BY tablename
    `;
    
    console.log(`   Found ${tables.length} parcel-related tables:`);
    tables.forEach(table => {
      console.log(`   ✅ ${table.tablename} (schema: ${table.schemaname})`);
    });
    console.log();

    // 3. Check parcels table
    console.log("3️⃣  Checking PARCELS Table...");
    const parcelsExists = tables.some(t => t.tablename === 'parcels');
    
    if (parcelsExists) {
      // Get count
      const parcelCount = await sql<CountResult[]>`SELECT COUNT(*)::text as count FROM parcels`;
      console.log(`   📊 Total parcels: ${parseInt(parcelCount[0].count).toLocaleString()}`);

      // Get parcels with geometry
      const parcelGeomCount = await sql<CountResult[]>`
        SELECT COUNT(*)::text as count FROM parcels WHERE geom IS NOT NULL
      `;
      console.log(`   🗺️  Parcels with geometry: ${parseInt(parcelGeomCount[0].count).toLocaleString()}`);

      // Get county count
      const countyCount = await sql<CountResult[]>`
        SELECT COUNT(DISTINCT county_name)::text as count FROM parcels
      `;
      console.log(`   📍 Unique counties: ${countyCount[0].count}`);

      // Get sample counties
      const sampleCounties = await sql<{ county_name: string; count: string }[]>`
        SELECT county_name, COUNT(*)::text as count 
        FROM parcels 
        WHERE county_name IS NOT NULL
        GROUP BY county_name 
        ORDER BY COUNT(*) DESC 
        LIMIT 10
      `;
      console.log(`   🏙️  Top 10 counties by parcel count:`);
      sampleCounties.forEach(c => {
        console.log(`      - ${c.county_name}: ${parseInt(c.count).toLocaleString()} parcels`);
      });

      // Sample parcel
      const sampleParcel = await sql`
        SELECT id, county_name, parcel_number, deed_holder, 
               ST_AsText(ST_Envelope(geom)) as bbox
        FROM parcels 
        WHERE geom IS NOT NULL 
        LIMIT 1
      `;
      if (sampleParcel.length > 0) {
        console.log(`\n   📋 Sample parcel:`);
        console.log(`      ID: ${sampleParcel[0].id}`);
        console.log(`      County: ${sampleParcel[0].county_name}`);
        console.log(`      Parcel #: ${sampleParcel[0].parcel_number}`);
        console.log(`      Owner: ${sampleParcel[0].deed_holder}`);
      }

      // Check indexes
      const indexes = await sql<{ indexname: string }[]>`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'parcels'
        ORDER BY indexname
      `;
      console.log(`\n   🔑 Indexes on parcels table: ${indexes.length}`);
      indexes.forEach(idx => {
        console.log(`      - ${idx.indexname}`);
      });

    } else {
      console.log(`   ❌ PARCELS table does NOT exist!`);
    }
    console.log();

    // 4. Check parcel_ownership_groups table
    console.log("4️⃣  Checking PARCEL_OWNERSHIP_GROUPS Table...");
    const ownershipGroupsExists = tables.some(t => t.tablename === 'parcel_ownership_groups');
    
    if (ownershipGroupsExists) {
      const groupCount = await sql<CountResult[]>`SELECT COUNT(*)::text as count FROM parcel_ownership_groups`;
      console.log(`   📊 Total ownership groups: ${parseInt(groupCount[0].count).toLocaleString()}`);

      const groupGeomCount = await sql<CountResult[]>`
        SELECT COUNT(*)::text as count FROM parcel_ownership_groups WHERE combined_geom IS NOT NULL
      `;
      console.log(`   🗺️  Groups with geometry: ${parseInt(groupGeomCount[0].count).toLocaleString()}`);

      // Get stats
      const stats = await sql<{
        avg_parcels: string;
        max_parcels: string;
        total_parcels: string;
      }[]>`
        SELECT 
          AVG(parcel_count)::numeric(10,2)::text as avg_parcels,
          MAX(parcel_count)::text as max_parcels,
          SUM(parcel_count)::text as total_parcels
        FROM parcel_ownership_groups
      `;
      if (stats.length > 0) {
        console.log(`   📈 Average parcels per owner: ${parseFloat(stats[0].avg_parcels).toFixed(2)}`);
        console.log(`   📈 Max parcels by one owner: ${parseInt(stats[0].max_parcels).toLocaleString()}`);
        console.log(`   📈 Total parcels tracked: ${parseInt(stats[0].total_parcels).toLocaleString()}`);
      }

      // Top owners
      const topOwners = await sql<{
        normalized_owner: string;
        parcel_count: number;
        total_acres: number;
      }[]>`
        SELECT normalized_owner, parcel_count, total_acres
        FROM parcel_ownership_groups
        ORDER BY parcel_count DESC
        LIMIT 5
      `;
      console.log(`\n   🏆 Top 5 landowners by parcel count:`);
      topOwners.forEach((owner, i) => {
        console.log(`      ${i + 1}. ${owner.normalized_owner}: ${owner.parcel_count} parcels, ${owner.total_acres.toFixed(0)} acres`);
      });

    } else {
      console.log(`   ❌ PARCEL_OWNERSHIP_GROUPS table does NOT exist!`);
    }
    console.log();

    // 5. Check parcel_aggregated table (adjacent parcels)
    console.log("5️⃣  Checking PARCEL_AGGREGATED Table (Adjacent Parcels)...");
    const aggregatedExists = tables.some(t => t.tablename === 'parcel_aggregated');
    
    if (aggregatedExists) {
      const aggCount = await sql<CountResult[]>`SELECT COUNT(*)::text as count FROM parcel_aggregated`;
      const count = parseInt(aggCount[0].count);
      console.log(`   📊 Total aggregated clusters: ${count.toLocaleString()}`);

      if (count > 0) {
        const aggGeomCount = await sql<CountResult[]>`
          SELECT COUNT(*)::text as count FROM parcel_aggregated WHERE geom IS NOT NULL
        `;
        console.log(`   🗺️  Clusters with geometry: ${parseInt(aggGeomCount[0].count).toLocaleString()}`);

        // Get county coverage
        const countyCoverage = await sql<{ county_count: string }[]>`
          SELECT COUNT(DISTINCT county)::text as county_count FROM parcel_aggregated
        `;
        console.log(`   📍 Counties with aggregated data: ${countyCoverage[0].county_count}`);

        // Get stats
        const aggStats = await sql<{
          avg_parcels: string;
          max_parcels: string;
          total_parcels: string;
          total_acres: string;
        }[]>`
          SELECT 
            AVG(parcel_count)::numeric(10,2)::text as avg_parcels,
            MAX(parcel_count)::text as max_parcels,
            SUM(parcel_count)::text as total_parcels,
            SUM(total_acres)::numeric(10,2)::text as total_acres
          FROM parcel_aggregated
        `;
        if (aggStats.length > 0) {
          console.log(`   📈 Average parcels per cluster: ${parseFloat(aggStats[0].avg_parcels).toFixed(2)}`);
          console.log(`   📈 Max parcels in one cluster: ${parseInt(aggStats[0].max_parcels).toLocaleString()}`);
          console.log(`   📈 Total parcels aggregated: ${parseInt(aggStats[0].total_parcels).toLocaleString()}`);
          console.log(`   📈 Total acres: ${parseInt(aggStats[0].total_acres).toLocaleString()}`);
        }

        // County breakdown
        const countyBreakdown = await sql<{
          county: string;
          cluster_count: string;
          parcel_sum: string;
        }[]>`
          SELECT 
            county, 
            COUNT(*)::text as cluster_count, 
            SUM(parcel_count)::text as parcel_sum
          FROM parcel_aggregated
          GROUP BY county
          ORDER BY SUM(parcel_count) DESC
          LIMIT 10
        `;
        console.log(`\n   🏙️  Top 10 counties by aggregated parcel count:`);
        countyBreakdown.forEach(c => {
          console.log(`      - ${c.county}: ${parseInt(c.cluster_count).toLocaleString()} clusters (${parseInt(c.parcel_sum).toLocaleString()} parcels)`);
        });

        // Sample aggregated parcel
        const sampleAgg = await sql<{
          id: number;
          normalized_owner: string;
          county: string;
          parcel_count: number;
          total_acres: number;
        }[]>`
          SELECT id, normalized_owner, county, parcel_count, total_acres
          FROM parcel_aggregated
          WHERE parcel_count > 5
          LIMIT 3
        `;
        if (sampleAgg.length > 0) {
          console.log(`\n   📋 Sample aggregated clusters (multiple adjacent parcels):`);
          sampleAgg.forEach((agg, i) => {
            console.log(`      ${i + 1}. ${agg.normalized_owner} (${agg.county}): ${agg.parcel_count} adjacent parcels, ${agg.total_acres.toFixed(0)} acres`);
          });
        }

      } else {
        console.log(`   ⚠️  Table exists but has NO DATA - aggregation may not have run!`);
      }

    } else {
      console.log(`   ❌ PARCEL_AGGREGATED table does NOT exist!`);
      console.log(`   💡 Run: npm run db:parcels:aggregate-adjacent`);
    }
    console.log();

    // 6. Summary
    console.log("=" + "=".repeat(70));
    console.log("📋 SUMMARY\n");
    
    const summary = {
      parcels: parcelsExists,
      ownership_groups: ownershipGroupsExists,
      aggregated: aggregatedExists
    };

    if (summary.parcels && summary.ownership_groups && summary.aggregated) {
      const parcelCount = await sql<CountResult[]>`SELECT COUNT(*)::text as count FROM parcels`;
      const ownerCount = await sql<CountResult[]>`SELECT COUNT(*)::text as count FROM parcel_ownership_groups`;
      const aggCount = await sql<CountResult[]>`SELECT COUNT(*)::text as count FROM parcel_aggregated`;
      
      const parcels = parseInt(parcelCount[0].count);
      const owners = parseInt(ownerCount[0].count);
      const agg = parseInt(aggCount[0].count);

      console.log("✅ ALL THREE TABLES EXIST\n");
      console.log(`   1. Raw Parcels: ${parcels.toLocaleString()} individual parcels`);
      console.log(`   2. Ownership Groups: ${owners.toLocaleString()} unique owners`);
      console.log(`   3. Aggregated Parcels: ${agg.toLocaleString()} adjacent clusters\n`);

      if (parcels > 2000000 && owners > 250000 && agg > 500000) {
        console.log("🎉 DATA LOOKS COMPLETE AND HEALTHY!");
      } else if (parcels > 2000000 && owners > 250000 && agg === 0) {
        console.log("⚠️  PARCELS AND OWNERSHIP DATA EXISTS");
        console.log("❌ BUT AGGREGATED DATA IS MISSING!");
        console.log("\n💡 Run this command to create aggregated data:");
        console.log("   npm run db:parcels:aggregate-adjacent");
      } else if (parcels > 2000000 && owners > 250000) {
        console.log("⚠️  PARCELS AND OWNERSHIP DATA EXISTS");
        console.log(`⚠️  Aggregated data is incomplete (${agg.toLocaleString()} / expected ~1.2M)`);
        console.log("\n💡 You may need to resume/restart aggregation:");
        console.log("   npm run db:parcels:aggregate-adjacent");
      } else {
        console.log("⚠️  DATA APPEARS INCOMPLETE");
        console.log("\n💡 Expected counts:");
        console.log("   - Parcels: ~2,450,000");
        console.log("   - Ownership Groups: ~310,000");
        console.log("   - Aggregated Parcels: ~1,200,000");
      }
    } else {
      console.log("❌ MISSING TABLES:\n");
      if (!summary.parcels) {
        console.log("   ❌ parcels - Run: npm run db:parcels:load");
      }
      if (!summary.ownership_groups) {
        console.log("   ❌ parcel_ownership_groups - Run: npm run db:parcels:aggregate");
      }
      if (!summary.aggregated) {
        console.log("   ❌ parcel_aggregated - Run: npm run db:parcels:aggregate-adjacent");
      }
    }

    console.log("\n" + "=" + "=".repeat(70));

  } catch (error) {
    console.error("\n❌ ERROR:", error);
    process.exit(1);
  }
}

verifyParcelData();

