import { db } from "../db";
import { auctions, archivedAuctions } from "@shared/schema";
import { and, lt, eq, inArray, or, isNull, sql } from "drizzle-orm";
import { SOLD_PHRASES } from "./auctionScraper.js";

/**
 * Terminal status for a row the archiver has retired.
 *
 * Archiving used to be a hard DELETE. That made every archiving bug
 * unrecoverable: a one-word heuristic ("estate auction" matching "Real Estate
 * Auction") removed thousands of live land auctions, and getting them back
 * meant reconstructing rows out of `archived_auctions` by hand. Retiring a row
 * is now a status change, so a bad rule costs one UPDATE to undo.
 *
 * Every read of `auctions` that does not filter on status will now see these
 * rows. `active` is not a safe default to assume — say so explicitly, with
 * `NOT_ARCHIVED`.
 *
 * Defined in ./auctionStatus.ts and re-exported here so existing importers keep
 * working; that module is a leaf, this one is not.
 */
export { ARCHIVED_STATUS, NOT_ARCHIVED } from "./auctionStatus.js";
import { ARCHIVED_STATUS } from "./auctionStatus.js";

/**
 * Words that mean "there is real property in this sale".
 *
 * Deliberately narrow. Bare `farm` is NOT here: "FARM MACHINERY, SHOP EQUIPMENT
 * & PICKUP AUCTION" is an equipment sale and must still archive, so the signal
 * has to be `farmland`/`farm ground`, not the word farm on its own. `\bland\b`
 * is safe because the boundary stops it matching "landscaping".
 */
const LAND_SIGNAL =
  /\b(acres?|acreage|farmland|farm ?ground|farm land|cropland|tillable|pasture|grassland|crp|timber|hunting|ranch|land|real estate|m\/l)\b/;

/**
 * `land_type` values that describe something other than real property. These
 * come structured off the scrape rather than being inferred from prose, so they
 * are trustworthy enough to archive on directly.
 */
const NON_FARM_LAND_TYPES = new Set([
  "residential",
  "commercial",
  "commercial building",
  "auto auction",
  "personal property auction",
  "farm equipment auction",
  "equipment auction",
  "estate auction",
  "workshop",
  "church contents",
  "livestock",
  "farm equipment",
]);

/** Categories from `auctionClassifier` that mean "this IS real property". */
const LAND_CATEGORIES = new Set(["farmland", "recreational", "development"]);

/**
 * Is this listing selling something other than land?
 *
 * Exported so it can be exercised against real rows without running an archive
 * pass — see `scripts/test-archiver-heuristics.ts`.
 *
 * The rule this replaces was `title.includes('estate auction')` guarded only by
 * `!includes('land'/'farm'/'acre')`. "REAL ESTATE AUCTION" contains the literal
 * substring "estate auction", so the single most common title for the exact
 * product this app exists to show was treated as a personal-property sale:
 * 2,189 rows in `archived_auctions` match that string. Two things fix it —
 * deferring to the classifier, which reads title + description + land type +
 * acreage together rather than one substring, and matching on whole words
 * against an explicit land signal instead of ad-hoc negations.
 */
export function isNonFarmProperty(auction: {
  title?: string | null;
  landType?: string | null;
  propertyCategory?: string | null;
}): boolean {
  const landType = auction.landType?.trim().toLowerCase() || "";
  const title = auction.title?.toLowerCase() || "";
  const category = auction.propertyCategory?.trim().toLowerCase() || "";

  // The classifier has already weighed the whole listing. Where it committed to
  // a land category, its verdict outranks anything a single title word implies —
  // this is the check that keeps "Real Estate Auction" out of the archive.
  //
  // It is deliberately a veto only: a `non_land` verdict does NOT archive a row
  // that the keyword rules would have kept. Archiving is the destructive
  // direction, and this function is being changed precisely because it deleted
  // too much — so it may only ever shrink. (Measured: allowing `non_land` to
  // archive would have retired 58 further live rows. The map already hides them
  // via `propertyCategory <> 'non_land'`, so nothing is gained by deleting too.)
  if (LAND_CATEGORIES.has(category)) return false;

  // Structured land_type. Left ahead of the title rules and behind the
  // classifier veto, matching the same precedence auctionClassifier uses.
  if (NON_FARM_LAND_TYPES.has(landType)) return true;

  // Title keywords are the weakest evidence, so they only apply when the title
  // makes no claim to real property at all. One land signal beats all of them.
  if (LAND_SIGNAL.test(title)) return false;

  // Each of these is a narrowed form of the rule it replaces — never a new one.
  // Adding keywords here would mean archiving listings the old rule kept, and
  // this function is only allowed to shrink.
  if (/\bequipment\b/.test(title)) return true;
  if (/\bpersonal property\b/.test(title)) return true;
  // The rule this replaces was guarded on land/farm/acre. LAND_SIGNAL covers
  // land and acre and more, but deliberately NOT bare `farm` — otherwise
  // "FARM MACHINERY, SHOP EQUIPMENT & PICKUP AUCTION" would stop archiving. So
  // `farm` has to be re-added here specifically, or "NO-RESERVE FARM ESTATE
  // AUCTION - SCHERTZ FAMILY" gets retired when the old rule kept it.
  if (/\bestate auction\b/.test(title) && !title.includes('farm')) return true;
  if (/\blivestock\b/.test(title)) return true;
  if (/\bchurch contents\b/.test(title)) return true;
  if (/\bsportsman'?s?\b/.test(title)) return true;
  // `includes('gun')` also fired on Ferguson, Gunderson and any other name
  // containing those three letters; 20 rows were archived on that substring.
  if (/\bguns?\b/.test(title)) return true;
  if (/\bcollector\b/.test(title)) return true;

  return false;
}

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
   * Archive auctions that are past their date OR marked as sold.
   *
   * "Archive" now means `status = 'archived'`, not DELETE. The audit copy in
   * `archived_auctions` is still written, but it is an audit trail rather than
   * the only surviving record — a rule that turns out to be wrong is undone
   * with `UPDATE auctions SET status='active' WHERE ...`.
   *
   * Callers that read `auctions` must filter on status. They used to get the
   * right answer for free because retired rows were physically gone.
   */
  async archivePastAuctions(options: { dryRun?: boolean } = {}) {
    const dryRun = options.dryRun === true;
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
      
      // Only scan rows that are still live. Under hard-delete this table held
      // ~2k rows and an unbounded findMany() was harmless; retired rows now stay
      // put, so without this predicate the daily scan would grow without limit
      // (92k rows and counting) and re-examine everything it already retired.
      const allAuctions = await db.query.auctions.findMany({
        where: or(isNull(auctions.status), sql`${auctions.status} <> ${ARCHIVED_STATUS}`),
      });

      const isNonFarm = isNonFarmProperty;

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
        const isNonFarmListing = isNonFarm(auction);

        // A sale that has not been held yet cannot be archived as sold. Categories
        // 2 and 3 both trace back to text heuristics, and that combination
        // retired 2,584 auctions whose sale date was still in the future — back
        // when retiring meant deleting. The date is the authority; the page text
        // is not.
        const isFutureDated =
          !!auction.auctionDate && new Date(auction.auctionDate) >= cutoffDate;
        if ((isMarkedSold || aiDetectedSold) && isFutureDated) return false;

        return (isPastDate || isMarkedSold || aiDetectedSold || isNonFarmListing) && auction.status !== ARCHIVED_STATUS;
      });

      if (toArchive.length === 0) {
        console.log('   ✅ No auctions to archive');
        this.isRunning = false;
        return;
      }

      // Resolve one reason per row, in the same precedence the audit copy uses,
      // so the counters below and `archived_reason` can never disagree.
      const reasonFor = (auction: any): string => {
        if (isNonFarm(auction)) return 'non_farm_property';
        if (auction.status === 'sold') return 'marked_sold';
        if (SOLD_PHRASES.test(auction.enrichedDescription ?? '')) return 'ai_detected_sold';
        if (auction.enrichedDescription?.toLowerCase().includes('auction closed')) return 'ai_detected_closed';
        return 'past_auction_date';
      };
      const reasons = new Map<number, string>(toArchive.map(a => [a.id, reasonFor(a)]));
      const countOf = (reason: string) =>
        toArchive.filter(a => reasons.get(a.id) === reason).length;

      const byReason = {
        pastDate: countOf('past_auction_date'),
        markedSold: countOf('marked_sold'),
        aiDetected: countOf('ai_detected_sold') + countOf('ai_detected_closed'),
        nonFarm: countOf('non_farm_property')
      };

      console.log(`   📦 Found ${toArchive.length} auctions to archive:`);
      console.log(`      - ${byReason.pastDate} past auction date`);
      console.log(`      - ${byReason.markedSold} marked as sold`);
      console.log(`      - ${byReason.aiDetected} AI-detected sold`);
      console.log(`      - ${byReason.nonFarm} non-farm properties`);

      // Dry run exists because the selection above is heuristic. It replaces the
      // --dry-run flag on the three standalone archive scripts, which each
      // carried their own drifted copy of these rules and were removed.
      if (dryRun) {
        console.log('\n   ⚠️  DRY RUN — nothing written. Sample of what would be retired:');
        for (const a of toArchive.slice(0, 20)) {
          console.log(`      [${reasons.get(a.id)}] ${a.id} ${String(a.title).slice(0, 80)}`);
        }
        if (toArchive.length > 20) console.log(`      ... and ${toArchive.length - 20} more`);
        this.isRunning = false;
        return;
      }

      const pastAuctions = toArchive;

      // The audit copy is keyed on the live row's id. Under hard-delete a
      // re-scraped listing came back with a NEW id every night, so each nightly
      // pass appended another copy — that is how 2,100 auctions produced 92,389
      // archive rows. Ids are stable now, so skip rows already on file.
      const existingAudit = new Set<number>();
      const auditBatch = 500;
      const allIds = pastAuctions.map(a => a.id);
      for (let i = 0; i < allIds.length; i += auditBatch) {
        const rows = await db
          .select({ originalId: archivedAuctions.originalId })
          .from(archivedAuctions)
          .where(inArray(archivedAuctions.originalId, allIds.slice(i, i + auditBatch)));
        rows.forEach(r => r.originalId != null && existingAudit.add(r.originalId));
      }

      // Archive the auctions
      let archived = 0;
      let failed = 0;
      let auditSkipped = 0;

      for (const auction of pastAuctions) {
        try {
          const archiveReason = reasons.get(auction.id) ?? 'past_auction_date';

          if (existingAudit.has(auction.id)) {
            auditSkipped++;
            archived++;
            continue;
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

      // Retire in place instead of deleting. `auctions.status` already carries a
      // lifecycle ('active'/'sold'/'cancelled'), so 'archived' needs no schema
      // change — and an operator who disagrees with a rule can reverse a day's
      // work with a single UPDATE ... SET status='active' instead of restoring
      // rows out of the audit table by hand.
      //
      // Note this runs over every selected row, including any whose audit copy
      // failed above. That used to mean the row was deleted with no copy left
      // anywhere; now the worst case is a retired row missing its audit entry,
      // and the row itself is still there to re-derive it from.
      //
      // The reason is stamped into raw_data because `auctions` has no
      // archived_reason column; merging through jsonb keeps the rest of the blob
      // intact (the column is json, hence the cast on both sides).
      const byReasonIds = new Map<string, number[]>();
      for (const auction of pastAuctions) {
        const reason = reasons.get(auction.id) ?? 'past_auction_date';
        const bucket = byReasonIds.get(reason);
        if (bucket) bucket.push(auction.id);
        else byReasonIds.set(reason, [auction.id]);
      }

      const batchSize = 100;
      let retired = 0;

      for (const [reason, ids] of Array.from(byReasonIds.entries())) {
        for (let i = 0; i < ids.length; i += batchSize) {
          const batch = ids.slice(i, i + batchSize);
          try {
            await db
              .update(auctions)
              .set({
                status: ARCHIVED_STATUS,
                updatedAt: new Date(),
                rawData: sql`(
                  COALESCE(${auctions.rawData}::jsonb, '{}'::jsonb)
                  || jsonb_build_object(
                       'archivedReason', ${reason}::text,
                       'archivedAt', ${new Date().toISOString()}::text,
                       'archivedFromStatus', COALESCE(${auctions.status}, 'active')
                     )
                )::json`,
              })
              .where(inArray(auctions.id, batch));
            retired += batch.length;
          } catch (error) {
            console.error(`   ❌ Failed to retire batch (${reason}): ${error}`);
          }
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
      console.log(`      Retired: ${retired} rows set to status='${ARCHIVED_STATUS}' (reversible)`);
      if (auditSkipped > 0) {
        console.log(`      Audit copies skipped (already on file): ${auditSkipped}`);
      }
      if (failed > 0) {
        console.log(`      Failed: ${failed} auctions`);
      }
      console.log(`      Next run: Tomorrow at 3:00 AM CST\n`);

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

