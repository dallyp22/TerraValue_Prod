import { db } from "../db";
import { auctions, archivedAuctions } from "@shared/schema";
import { and, lt, eq, inArray, or, isNull } from "drizzle-orm";

export class AuctionArchiverService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  /**
   * Start the archiver service - runs immediately and then daily at midnight
   */
  start() {
    console.log('🗄️  Starting Auction Archiver Service');
    
    // Run immediately on start
    this.archivePastAuctions();
    
    // Calculate time until next midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    console.log(`   Next archive run at midnight (in ${Math.round(msUntilMidnight / 1000 / 60)} minutes)`);
    
    // Schedule first run at midnight
    setTimeout(() => {
      this.archivePastAuctions();
      
      // Then run daily at midnight
      this.intervalId = setInterval(() => {
        this.archivePastAuctions();
      }, 24 * 60 * 60 * 1000); // 24 hours
      
    }, msUntilMidnight);
  }

  /**
   * Stop the archiver service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🗄️  Auction Archiver Service stopped');
    }
  }

  /**
   * Archive auctions that are 7+ days past their auction date
   */
  async archivePastAuctions() {
    if (this.isRunning) {
      console.log('⚠️  Archive process already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();
    
    try {
      console.log(`\n🗄️  [${startTime.toISOString()}] Running automated auction archiver...`);
      
      // Calculate cutoff date (7 days ago)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7);
      
      // Find auctions to archive (exclude those needing manual review)
      const pastAuctions = await db.query.auctions.findMany({
        where: and(
          lt(auctions.auctionDate, cutoffDate),
          eq(auctions.status, 'active'),
          or(
            eq(auctions.needsDateReview, false),
            isNull(auctions.needsDateReview)
          )
        )
      });

      if (pastAuctions.length === 0) {
        console.log('   ✅ No auctions to archive');
        this.isRunning = false;
        return;
      }

      console.log(`   📦 Found ${pastAuctions.length} auctions to archive (older than ${cutoffDate.toLocaleDateString()})`);

      // Archive the auctions
      let archived = 0;
      let failed = 0;
      
      for (const auction of pastAuctions) {
        try {
          // Copy to archived_auctions table
          await db.insert(archivedAuctions).values({
            title: auction.title,
            description: auction.description,
            url: auction.url,
            sourceWebsite: auction.sourceWebsite,
            auctionDate: auction.auctionDate,
            auctionType: auction.auctionType,
            auctioneer: auction.auctioneer,
            address: auction.address,
            county: auction.county,
            state: auction.state,
            acreage: auction.acreage,
            landType: auction.landType,
            latitude: auction.latitude,
            longitude: auction.longitude,
            csr2Mean: auction.csr2Mean,
            csr2Min: auction.csr2Min,
            csr2Max: auction.csr2Max,
            estimatedValue: auction.estimatedValue,
            rawData: auction.rawData,
            scrapedAt: auction.scrapedAt,
            updatedAt: auction.updatedAt,
            status: auction.status,
            archivedReason: 'past_auction_date',
            originalId: auction.id
          });
          archived++;
        } catch (error) {
          console.error(`   ❌ Failed to archive auction ${auction.id}: ${error}`);
          failed++;
        }
      }

      // Delete from auctions table
      const auctionIds = pastAuctions.map(a => a.id);
      const batchSize = 100;
      let deleted = 0;
      
      for (let i = 0; i < auctionIds.length; i += batchSize) {
        const batch = auctionIds.slice(i, i + batchSize);
        try {
          await db.delete(auctions).where(inArray(auctions.id, batch));
          deleted += batch.length;
        } catch (error) {
          console.error(`   ❌ Failed to delete batch: ${error}`);
        }
      }

      const endTime = new Date();
      const duration = ((endTime.getTime() - startTime.getTime()) / 1000).toFixed(2);

      console.log(`   ✅ Archive complete in ${duration}s`);
      console.log(`      Archived: ${archived} auctions`);
      console.log(`      Deleted: ${deleted} from active table`);
      if (failed > 0) {
        console.log(`      Failed: ${failed} auctions`);
      }
      console.log(`      Next run: Tomorrow at midnight\n`);

    } catch (error) {
      console.error('   ❌ Error during archiving process:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Manually trigger archiving (useful for testing)
   */
  async runNow() {
    return this.archivePastAuctions();
  }
}

