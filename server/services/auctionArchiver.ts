import { db } from "../db";
import { auctions, archivedAuctions } from "@shared/schema";
import { and, lt, eq, inArray, or, isNull } from "drizzle-orm";
import { SOLD_PHRASES } from "./auctionScraper.js";

export class AuctionArchiverService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  /**
   * Start the archiver service - runs immediately and then daily at 3:00 AM CST
   */
  start() {
    console.log('🗄️  Starting Auction Archiver Service');
    
    // Run immediately on start
    this.archivePastAuctions();
    
    // Calculate time until next 3:00 AM CST
    const now = new Date();
    
    // Get current time in CST (UTC-6)
    const cstOffset = -6 * 60; // CST is UTC-6
    const localOffset = now.getTimezoneOffset(); // Current timezone offset
    const cstTime = new Date(now.getTime() + (cstOffset + localOffset) * 60 * 1000);
    
    // Set target time to 3:00 AM CST
    const nextRun = new Date(cstTime);
    nextRun.setHours(3, 0, 0, 0);
    
    // If we've already passed 3:00 AM today, schedule for tomorrow
    if (nextRun <= cstTime) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    // Convert back to local time
    const nextRunLocal = new Date(nextRun.getTime() - (cstOffset + localOffset) * 60 * 1000);
    const msUntilNextRun = nextRunLocal.getTime() - now.getTime();
    
    console.log(`   Next archive run at 3:00 AM CST (in ${Math.round(msUntilNextRun / 1000 / 60)} minutes)`);
    
    // Schedule first run at 3:00 AM CST
    setTimeout(() => {
      this.archivePastAuctions();
      
      // Then run daily at 3:00 AM CST
      this.intervalId = setInterval(() => {
        this.archivePastAuctions();
      }, 24 * 60 * 60 * 1000); // 24 hours
      
    }, msUntilNextRun);
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
   * Enhanced with AI-detected sold status and non-farm filtering
   */
  async archivePastAuctions() {
    if (this.isRunning) {
      console.log('⚠️  Archive process already running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = new Date();
    
    try {
      console.log(`\n🗄️  [${startTime.toISOString()}] Running automated auction archiver (AI-enhanced + non-farm filtering)...`);
      
      // Calculate cutoff date (end of yesterday)
      const cutoffDate = new Date();
      cutoffDate.setHours(0, 0, 0, 0);
      
      // Find auctions to archive - FOUR categories:
      // 1. Past auction dates (traditional)
      // 2. Status = 'sold' (from scraper detection)
      // 3. AI-enriched sold indicators
      // 4. Non-farm properties (equipment, residential, commercial)
      
      const allAuctions = await db.query.auctions.findMany();
      
      // Non-farm keywords for filtering
      const isNonFarm = (auction: any) => {
        const landType = auction.landType?.toLowerCase() || '';
        const title = auction.title?.toLowerCase() || '';
        
        // Check for equipment/personal property auctions in title
        if (title.includes('equipment') && !title.includes('land')) return true;
        if (title.includes('personal property')) return true;
        if (title.includes('estate auction') && !title.includes('land') && !title.includes('farm') && !title.includes('acre')) return true;
        if (title.includes('livestock') && !title.includes('land')) return true;
        if (title.includes('church contents')) return true;
        if (title.includes('sportsman')) return true;
        if (title.includes('gun')) return true;
        if (title.includes('collector')) return true;
        
        // Check land type
        if (landType === 'residential') return true;
        if (landType === 'commercial') return true;
        if (landType === 'commercial building') return true;
        if (landType === 'auto auction') return true;
        if (landType === 'personal property auction') return true;
        if (landType === 'farm equipment auction') return true;
        if (landType === 'equipment auction') return true;
        if (landType === 'estate auction') return true;
        if (landType === 'workshop') return true;
        if (landType === 'church contents') return true;
        if (landType === 'livestock') return true;
        if (landType === 'farm equipment') return true;
        
        return false;
      };
      
      const toArchive = allAuctions.filter(auction => {
        // Category 1: Past auction date (traditional method)
        const isPastDate = auction.auctionDate && 
                          new Date(auction.auctionDate) < cutoffDate &&
                          !auction.needsDateReview;
        
        // Category 2: Explicitly marked as sold by scraper
        const isMarkedSold = auction.status === 'sold';
        
        // Category 3: AI-enriched data indicates sold.
        // Uses the same narrow past-tense matcher as the scraper — the old
        // `.includes('sold')` fired on enriched prose describing a sale that
        // had not been held yet.
        const aiDetectedSold = auction.enrichmentStatus === 'completed' && (
          SOLD_PHRASES.test(auction.enrichedDescription ?? '') ||
          auction.enrichedDescription?.toLowerCase().includes('contract pending') ||
          // Check if possession date is in the past (property already transferred)
          (auction.possession?.toLowerCase().includes('immediate') && isPastDate)
        );
        
        // Category 4: Non-farm properties
        const isNonFarmProperty = isNonFarm(auction);
        
        // A sale that has not been held yet cannot be archived as sold. Categories
        // 2 and 3 both trace back to text heuristics, and archiving here is a hard
        // DELETE — that combination removed 2,584 auctions whose sale date was
        // still in the future. The date is the authority; the page text is not.
        const isFutureDated =
          !!auction.auctionDate && new Date(auction.auctionDate) >= cutoffDate;
        if ((isMarkedSold || aiDetectedSold) && isFutureDated) return false;

        return (isPastDate || isMarkedSold || aiDetectedSold || isNonFarmProperty) && auction.status !== 'archived';
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
        ).length,
        nonFarm: toArchive.filter(a => isNonFarm(a)).length
      };

      console.log(`   📦 Found ${toArchive.length} auctions to archive:`);
      console.log(`      - ${byReason.pastDate} past auction date`);
      console.log(`      - ${byReason.markedSold} marked as sold`);
      console.log(`      - ${byReason.aiDetected} AI-detected sold`);
      console.log(`      - ${byReason.nonFarm} non-farm properties`);

      const pastAuctions = toArchive;

      // Archive the auctions
      let archived = 0;
      let failed = 0;
      
      for (const auction of pastAuctions) {
        try {
          // Determine archive reason
          let archiveReason = 'past_auction_date';
          if (isNonFarm(auction)) {
            archiveReason = 'non_farm_property';
          } else if (auction.status === 'sold') {
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
      console.log(`      Archived: ${archived} auctions`);
      console.log(`         - ${byReason.pastDate} past date`);
      console.log(`         - ${byReason.markedSold} marked sold`);
      console.log(`         - ${byReason.aiDetected} AI-detected`);
      console.log(`         - ${byReason.nonFarm} non-farm`);
      console.log(`      Deleted: ${deleted} from active table`);
      if (failed > 0) {
        console.log(`      Failed: ${failed} auctions`);
      }
      console.log(`      Next run: Tomorrow at 4:30 AM CST\n`);

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

