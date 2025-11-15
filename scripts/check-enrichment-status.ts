/**
 * Quick enrichment status checker
 * Run: npx tsx scripts/check-enrichment-status.ts
 */

import 'dotenv/config';
import { db } from '../server/db.js';
import { auctions } from '../shared/schema.js';
import { eq, sql } from 'drizzle-orm';

async function checkStatus() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║        AI Enrichment Status - Live Monitor         ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    // Get counts by status
    const statusCounts = await db
      .select({
        status: auctions.enrichmentStatus,
        count: sql<number>`count(*)::int`
      })
      .from(auctions)
      .groupBy(auctions.enrichmentStatus);

    const stats = {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0
    };

    statusCounts.forEach(row => {
      const count = Number(row.count);
      stats.total += count;
      
      if (row.status === 'pending' || row.status === null) {
        stats.pending += count;
      } else if (row.status === 'processing') {
        stats.processing += count;
      } else if (row.status === 'completed') {
        stats.completed += count;
      } else if (row.status === 'failed') {
        stats.failed += count;
      }
    });

    const completionRate = stats.total > 0 
      ? Math.round((stats.completed / stats.total) * 100) 
      : 0;

    // Display stats
    console.log('📊 Overall Statistics:');
    console.log('─────────────────────────────────────────────────────');
    console.log(`  Total Auctions:    ${stats.total}`);
    console.log(`  ✅ Completed:       ${stats.completed} (${completionRate}%)`);
    console.log(`  ⏳ Pending:         ${stats.pending}`);
    console.log(`  🔄 Processing:      ${stats.processing}`);
    console.log(`  ❌ Failed:          ${stats.failed}`);
    console.log('');

    // Progress bar
    const barWidth = 40;
    const filledWidth = Math.round((completionRate / 100) * barWidth);
    const emptyWidth = barWidth - filledWidth;
    const bar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
    console.log(`  Progress: [${bar}] ${completionRate}%`);
    console.log('');

    // Get recent enrichments
    const recent = await db
      .select({
        id: auctions.id,
        title: auctions.title,
        enrichedAt: auctions.enrichedAt,
        status: auctions.enrichmentStatus
      })
      .from(auctions)
      .where(eq(auctions.enrichmentStatus, 'completed'))
      .orderBy(sql`${auctions.enrichedAt} DESC`)
      .limit(5);

    if (recent.length > 0) {
      console.log('🎉 Recently Completed:');
      console.log('─────────────────────────────────────────────────────');
      recent.forEach(r => {
        const timeAgo = r.enrichedAt 
          ? getTimeAgo(new Date(r.enrichedAt))
          : 'unknown';
        const titleShort = r.title.length > 50 
          ? r.title.substring(0, 47) + '...' 
          : r.title;
        console.log(`  • ${titleShort}`);
        console.log(`    ${timeAgo} ago`);
      });
      console.log('');
    }

    // Get failed enrichments
    const failed = await db
      .select({
        id: auctions.id,
        title: auctions.title,
        error: auctions.enrichmentError
      })
      .from(auctions)
      .where(eq(auctions.enrichmentStatus, 'failed'))
      .limit(5);

    if (failed.length > 0) {
      console.log('⚠️  Failed Enrichments:');
      console.log('─────────────────────────────────────────────────────');
      failed.forEach(f => {
        const titleShort = f.title.length > 50 
          ? f.title.substring(0, 47) + '...' 
          : f.title;
        const errorShort = f.error && f.error.length > 60
          ? f.error.substring(0, 57) + '...'
          : f.error || 'Unknown error';
        console.log(`  • ${titleShort}`);
        console.log(`    Error: ${errorShort}`);
      });
      console.log('');
    }

    // Status message
    if (stats.pending > 0 || stats.processing > 0) {
      console.log('🔄 Enrichment is in progress...');
      console.log(`   Run this script again in a few minutes to check progress.`);
    } else if (stats.failed > 0 && stats.pending === 0) {
      console.log('⚠️  All pending enrichments complete, but some failed.');
      console.log(`   Run: npm run auctions:enrich to retry failed enrichments.`);
    } else {
      console.log('✅ All auctions have been enriched!');
    }
    console.log('');

  } catch (error) {
    console.error('❌ Error checking status:', error);
    process.exit(1);
  }

  process.exit(0);
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''}`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
  return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
}

checkStatus();

