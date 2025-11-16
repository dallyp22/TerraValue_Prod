/**
 * View recently scraped auctions (last 20)
 * Run: npx tsx scripts/view-recent-auctions.ts
 */

import 'dotenv/config';
import { db } from '../server/db.js';
import { auctions } from '../shared/schema.js';
import { desc } from 'drizzle-orm';

async function viewRecent() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║         Recently Scraped Auctions (Last 20)       ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    const recent = await db.query.auctions.findMany({
      orderBy: [desc(auctions.scrapedAt)],
      limit: 20
    });

    if (recent.length === 0) {
      console.log('No auctions found.\n');
      process.exit(0);
    }

    console.log(`Found ${recent.length} recent auctions:\n`);

    recent.forEach((auction, idx) => {
      const scrapedAgo = getTimeAgo(new Date(auction.scrapedAt!));
      const enrichStatus = getEnrichmentBadge(auction.enrichmentStatus);
      const soldBadge = auction.status === 'sold' ? '🏷️  SOLD' : '';
      
      // Title - prefer enriched
      const title = auction.enrichedTitle || auction.title || 'Untitled';
      const titleShort = title.length > 60 ? title.substring(0, 57) + '...' : title;
      
      console.log(`${(idx + 1).toString().padStart(2)}. ${titleShort}`);
      console.log(`    📍 ${auction.county || 'Unknown'} County, ${auction.state || 'Unknown'}`);
      console.log(`    📏 ${auction.acreage ? auction.acreage + ' acres' : 'Acreage unknown'}`);
      console.log(`    📅 ${auction.auctionDate ? new Date(auction.auctionDate).toLocaleDateString() : 'Date TBD'}`);
      console.log(`    🏢 ${auction.sourceWebsite || 'Unknown source'}`);
      console.log(`    ⏱️  Scraped: ${scrapedAgo} ago`);
      console.log(`    ${enrichStatus} ${soldBadge}`);
      
      // Show coordinates if available
      if (auction.latitude && auction.longitude) {
        const geocode = auction.geocodingMethod 
          ? `(${auction.geocodingMethod}, ${auction.geocodingConfidence}% confidence)`
          : '';
        console.log(`    🌍 ${auction.latitude.toFixed(4)}, ${auction.longitude.toFixed(4)} ${geocode}`);
      }
      
      // Show enriched data preview if available
      if (auction.enrichmentStatus === 'completed') {
        if (auction.keyHighlights && Array.isArray(auction.keyHighlights) && auction.keyHighlights.length > 0) {
          console.log(`    ⭐ Highlights: ${auction.keyHighlights.slice(0, 2).join(', ')}`);
        }
        if (auction.soilMentions) {
          const soilShort = auction.soilMentions.length > 50 
            ? auction.soilMentions.substring(0, 47) + '...'
            : auction.soilMentions;
          console.log(`    🌱 Soil: ${soilShort}`);
        }
      }
      
      console.log('');
    });

    // Summary stats
    const enriched = recent.filter(a => a.enrichmentStatus === 'completed').length;
    const pending = recent.filter(a => a.enrichmentStatus === 'pending').length;
    const sold = recent.filter(a => a.status === 'sold').length;

    console.log('─────────────────────────────────────────────────────');
    console.log(`📊 Summary: ${enriched} enriched, ${pending} pending, ${sold} sold`);
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffSecs < 60) return `${diffSecs} sec${diffSecs !== 1 ? 's' : ''}`;
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''}`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
  return `${Math.floor(diffMs / 86400000)} day${Math.floor(diffMs / 86400000) !== 1 ? 's' : ''}`;
}

function getEnrichmentBadge(status: string | null): string {
  switch (status) {
    case 'completed': return '✅ Enriched';
    case 'pending': return '⏳ Pending';
    case 'processing': return '🔄 Processing';
    case 'failed': return '❌ Failed';
    default: return '⏳ Pending';
  }
}

viewRecent();

