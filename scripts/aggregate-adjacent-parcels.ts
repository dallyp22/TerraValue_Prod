import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import dotenv from 'dotenv';
import { processCountyAggregation, setupAggregatedTable } from '../server/services/adjacentParcelCombiner';

dotenv.config();
neonConfig.webSocketConstructor = ws;

const PROGRESS_FILE = './adjacent-parcel-progress.json';

let fs: any;
try {
  fs = await import('fs');
} catch (e) {
  console.log('File system not available - progress tracking disabled');
}

interface Progress {
  completedCounties: string[];
  totalClusters: number;
  totalParcelsProcessed: number;
}

function loadProgress(): Progress {
  if (!fs || !fs.existsSync(PROGRESS_FILE)) {
    return { completedCounties: [], totalClusters: 0, totalParcelsProcessed: 0 };
  }
  
  try {
    const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.warn('Could not load progress:', error);
    return { completedCounties: [], totalClusters: 0, totalParcelsProcessed: 0 };
  }
}

function saveProgress(progress: Progress): void {
  if (!fs) return;
  
  try {
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
  } catch (error) {
    console.warn('Could not save progress:', error);
  }
}

/**
 * Main aggregation function - processes all Iowa counties except Harrison
 */
async function aggregateAdjacentParcels(): Promise<void> {
  console.log('🏡 Statewide Adjacent Parcel Aggregation');
  console.log('========================================');
  console.log('Combines only ADJACENT parcels by owner (like Harrison County)');
  console.log('Excludes Harrison County (keeps client-side method)\n');
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    // Setup aggregated table
    await setupAggregatedTable(pool);
    
    // Load progress
    const progress = loadProgress();
    
    if (progress.completedCounties.length > 0) {
      console.log(`\n📍 Resuming from previous run...`);
      console.log(`   Already completed: ${progress.completedCounties.length} counties`);
      console.log(`   Clusters created: ${progress.totalClusters.toLocaleString()}`);
      console.log(`   Parcels processed: ${progress.totalParcelsProcessed.toLocaleString()}\n`);
    } else {
      // Clear any existing aggregated data if starting fresh
      console.log('🗑️  Clearing existing aggregated data...');
      await pool.query('TRUNCATE TABLE parcel_aggregated');
      console.log('✅ Table cleared\n');
    }
    
    // Get all counties except Harrison
    const countiesResult = await pool.query(`
      SELECT DISTINCT county_name
      FROM parcels
      WHERE county_name IS NOT NULL
        AND county_name != 'HARRISON'
      ORDER BY county_name
    `);
    
    const allCounties = countiesResult.rows.map(r => r.county_name);
    const remainingCounties = allCounties.filter(c => !progress.completedCounties.includes(c));
    
    console.log(`📊 Processing Status:`);
    console.log(`   Total counties: 98 (excluding Harrison)`);
    console.log(`   Completed: ${progress.completedCounties.length}`);
    console.log(`   Remaining: ${remainingCounties.length}\n`);
    
    const startTime = Date.now();
    
    // Process each county
    for (let i = 0; i < remainingCounties.length; i++) {
      const county = remainingCounties[i];
      const countyNum = progress.completedCounties.length + i + 1;
      
      console.log(`\n[${countyNum}/98] ${county} County`);
      console.log('─'.repeat(50));
      
      const countyStartTime = Date.now();
      
      try {
        const result = await processCountyAggregation(pool, county);
        
        const countyDuration = ((Date.now() - countyStartTime) / 1000).toFixed(1);
        
        // Update progress
        progress.completedCounties.push(county);
        progress.totalClusters += result.clustersCreated;
        progress.totalParcelsProcessed += result.parcelsProcessed;
        
        saveProgress(progress);
        
        // Calculate estimates
        const avgTimePerCounty = (Date.now() - startTime) / (i + 1);
        const remainingTime = (avgTimePerCounty * (remainingCounties.length - i - 1)) / 1000 / 60;
        const totalProgress = ((countyNum / 98) * 100).toFixed(1);
        
        console.log(`   ⏱️  County completed in ${countyDuration}s`);
        console.log(`   📊 Progress: ${totalProgress}% | ETA: ${remainingTime.toFixed(0)} minutes`);
        
      } catch (error) {
        console.error(`   ❌ Error processing ${county}:`, error);
        console.log(`   💾 Progress saved - can resume from here`);
        throw error;
      }
    }
    
    const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Statewide aggregation complete!');
    console.log('='.repeat(50));
    console.log(`\n📊 Final Statistics:`);
    console.log(`   Counties processed: 98 (excluding Harrison)`);
    console.log(`   Total clusters created: ${progress.totalClusters.toLocaleString()}`);
    console.log(`   Total parcels processed: ${progress.totalParcelsProcessed.toLocaleString()}`);
    console.log(`   Total time: ${totalDuration} minutes`);
    
    // Get final statistics
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_clusters,
        SUM(parcel_count) as total_parcels,
        AVG(parcel_count)::numeric(10,1) as avg_parcels_per_cluster,
        MAX(parcel_count) as max_parcels_in_cluster,
        SUM(total_acres) as total_acres
      FROM parcel_aggregated
    `);
    
    if (statsResult.rows.length > 0) {
      const stats = statsResult.rows[0];
      console.log(`\n📈 Aggregation Statistics:`);
      console.log(`   Total aggregated clusters: ${parseInt(stats.total_clusters).toLocaleString()}`);
      console.log(`   Parcels in clusters: ${parseInt(stats.total_parcels).toLocaleString()}`);
      console.log(`   Average parcels per cluster: ${stats.avg_parcels_per_cluster}`);
      console.log(`   Largest cluster: ${stats.max_parcels_in_cluster} parcels`);
      console.log(`   Total acres: ${parseFloat(stats.total_acres).toLocaleString()}`);
    }
    
    // Show top 10 largest clusters
    const topClustersResult = await pool.query(`
      SELECT normalized_owner, county, parcel_count, total_acres
      FROM parcel_aggregated
      ORDER BY total_acres DESC
      LIMIT 10
    `);
    
    console.log(`\n🏆 Top 10 Largest Aggregated Parcels:`);
    topClustersResult.rows.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.normalized_owner} (${row.county} County)`);
      console.log(`      ${row.parcel_count} parcels | ${parseFloat(row.total_acres).toFixed(1)} acres`);
    });
    
    // Clean up progress file
    if (fs && fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
      console.log(`\n✅ Progress file cleaned up`);
    }
    
  } catch (error) {
    console.error('\n❌ Aggregation failed:', error);
    console.log(`\n💾 Progress saved to: ${PROGRESS_FILE}`);
    console.log(`   Rerun this script to resume from where it stopped`);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the aggregation
aggregateAdjacentParcels().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

