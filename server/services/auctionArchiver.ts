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
   * Archive auctions that are past their date OR marked as sold
   * Enhanced with AI-detected sold status
   */
  async archivePastAuctions() {
    if (this.isRunning) {
      console.log('⚠️  Archive process already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();
    
    try {
      console.log(`\n🗄️  [${startTime.toISOString()}] Running automated auction archiver (AI-enhanced)...`);
      
      // Calculate cutoff date (end of yesterday)
      const cutoffDate = new Date();
      cutoffDate.setHours(0, 0, 0, 0);
      
      // Find auctions to archive - THREE categories:
      // 1. Past auction dates (traditional)
      // 2. Status = 'sold' (from scraper detection)
      // 3. AI-enriched sold indicators
      
      const allAuctions = await db.query.auctions.findMany();
      
      const toArchive = allAuctions.filter(auction => {
        // Category 1: Past auction date (traditional method)
        const isPastDate = auction.auctionDate && 
                          new Date(auction.auctionDate) < cutoffDate &&
                          !auction.needsDateReview;
        
        // Category 2: Explicitly marked as sold by scraper
        const isMarkedSold = auction.status === 'sold';
        
        // Category 3: AI-enriched data indicates sold
        const aiDetectedSold = auction.enrichmentStatus === 'completed' && (
          // Check enriched description for sold indicators
          auction.enrichedDescription?.toLowerCase().includes('sold') ||
          auction.enrichedDescription?.toLowerCase().includes('sale closed') ||
          auction.enrichedDescription?.toLowerCase().includes('auction closed') ||
          auction.enrichedDescription?.toLowerCase().includes('contract pending') ||
          // Check if possession date is in the past (property already transferred)
          (auction.possession?.toLowerCase().includes('immediate') && isPastDate)
        );
        
        return (isPastDate || isMarkedSold || aiDetectedSold) && auction.status !== 'archived';
      });

      if (toArchive.length === 0) {
        console.log('   ✅ No auctions to archive');
        this.isRunning = false;
        return;
      }

      // Count by reason
      const byReason = {
        pastDate: toArchive.filter(a => a.auctionDate && new Date(a.auctionDate) < cutoffDate).length,
        markedSold: toArchive.filter(a => a.status === 'sold').length,
        aiDetected: toArchive.filter(a => 
          a.enrichedDescription?.toLowerCase().includes('sold') ||
          a.enrichedDescription?.toLowerCase().includes('closed')
        ).length
      };

      console.log(`   📦 Found ${toArchive.length} auctions to archive:`);
      console.log(`      - ${byReason.pastDate} past auction date`);
      console.log(`      - ${byReason.markedSold} marked as sold`);
      console.log(`      - ${byReason.aiDetected} AI-detected sold`);

      const pastAuctions = toArchive;

      // Archive the auctions
      let archived = 0;
      let failed = 0;
      
      for (const auction of pastAuctions) {
        try {
          // Determine archive reason
          let archiveReason = 'past_auction_date';
          if (auction.status === 'sold') {
            archiveReason = 'marked_sold';
          } else if (auction.enrichedDescription?.toLowerCase().includes('sold')) {
            archiveReason = 'ai_detected_sold';
          } else if (auction.enrichedDescription?.toLowerCase().includes('closed')) {
            archiveReason = 'ai_detected_closed';
          }
          
          // Copy to archived_auctions table (including enriched fields)
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
            archivedReason: archiveReason,
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
      console.log(`      Archived: ${archived} auctions (${byReason.pastDate} past date, ${byReason.markedSold} marked sold, ${byReason.aiDetected} AI-detected)`);
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

