import OpenAI from 'openai';
import { db } from '../db.js';
import { auctions } from '@shared/schema';
import { and, eq } from 'drizzle-orm';
import { NOT_ARCHIVED } from './auctionStatus.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY2 || process.env.OPENAI_API_KEY || ''
});

export interface EnrichmentResult {
  // Standardized core fields
  enrichedTitle: string;
  enrichedDescription: string;
  enrichedAuctionHouse: string | null;
  enrichedAuctionDate: string | null;
  enrichedAuctionLocation: string | null;
  enrichedPropertyLocation: string | null;
  
  // Legal description
  legalDescription: string | null;
  legalDescriptionParsed: any;
  legalDescriptionSource: string | null;
  
  // Comprehensive details
  soilMentions: string | null;
  cropHistory: string | null;
  improvements: any[];
  utilities: any;
  roadAccess: string | null;
  drainage: string | null;
  tillablePercent: number | null;
  crpDetails: string | null;
  waterRights: string | null;
  mineralRights: string | null;
  zoningInfo: string | null;
  taxInfo: string | null;
  sellerMotivation: string | null;
  financingOptions: string | null;
  possession: string | null;
  keyHighlights: string[];
}

const ENRICHMENT_PROMPT = `You are an expert agricultural land auction data analyst. Your task is to extract and standardize comprehensive information from land auction listings.

Analyze the provided auction data and extract ALL available information into a structured format. Be thorough and precise.

CRITICAL INSTRUCTIONS:
1. **Title Format**: Create a standardized title in this EXACT format: "{Acreage} Acres {County} County" or "{Acreage} Acres {County} County, {State}"
   - Examples: "155.29 Acres Webster County", "234 Acres Franklin County, Iowa"
   - Use "+/-" if acreage is approximate: "155+/- Acres Webster County"
   - If no acreage, use: "{County} County Land Auction"
   - Keep it clean and consistent - this is the PRIMARY display title
2. **Auction Date**: Look for ANY date-related information - auction date, sale date, bid deadline, event date. Parse it carefully and return in ISO format (YYYY-MM-DD).
3. **Auction House**: Identify the company/organization conducting the auction (e.g., "Hertz Real Estate", "Sullivan Auctioneers", "Farmers National Company").
4. **Locations**: DISTINGUISH between:
   - Auction Location: Where the auction event is held (office, venue, online)
   - Property Location: Where the actual land/property is located
5. **Legal Description**: Extract any legal land descriptions (Township, Range, Section format) EXACTLY as written.
6. **Property Features**: Extract ALL mentions of:
   - Soil quality/types/characteristics
   - Crop history or current use
   - Improvements (buildings, barns, fences, irrigation, tile drainage)
   - Utilities (electric, gas, water availability)
   - Road access type
   - Drainage systems
   - Tillable percentage
   - CRP enrollment details
   - Water rights
   - Mineral rights
   - Zoning information
   - Tax information
   - Seller motivation (estate, retirement, etc.)
   - Financing options
   - Possession date/terms

7. **Key Highlights**: Extract 3-10 bullet points of the most important selling features.
8. **SOLD STATUS**: CRITICALLY IMPORTANT - Check if this auction/listing is SOLD, CLOSED, or COMPLETED:
   - Look for: "SOLD", "Sale Closed", "Auction Closed", "Contract Pending", "Under Contract"
   - Check for past tense: "was sold", "has been sold", "auction was held"
   - Return "sold" if definitely sold, "active" if still available, "unknown" if unclear

Return your analysis as a JSON object with the following structure:
{
  "enrichedTitle": "STANDARDIZED TITLE in format: {Acreage} Acres {County} County",
  "enrichedDescription": "Clean, well-formatted description paragraph",
  "soldStatus": "sold" or "active" or "unknown",
  "soldIndicators": "Any text that indicates this was sold/closed" or null,
  "enrichedAuctionHouse": "Company Name" or null,
  "enrichedAuctionDate": "YYYY-MM-DD" or null,
  "enrichedAuctionLocation": "Where auction is held" or null,
  "enrichedPropertyLocation": "Where land is located" or null,
  "legalDescription": "Full legal description if found" or null,
  "legalDescriptionSource": "original" or "ai_extracted" or null,
  "soilMentions": "All soil-related details" or null,
  "cropHistory": "Crop/usage history" or null,
  "improvements": [
    {"type": "barn", "description": "40x60 machine shed"},
    {"type": "tile", "description": "Tiled in 2018"}
  ],
  "utilities": {
    "electric": true/false,
    "water": true/false,
    "gas": true/false,
    "description": "Details about utilities"
  },
  "roadAccess": "Type of road access" or null,
  "drainage": "Drainage details" or null,
  "tillablePercent": 95.5 or null,
  "crpDetails": "CRP information" or null,
  "waterRights": "Water rights info" or null,
  "mineralRights": "Mineral rights info" or null,
  "zoningInfo": "Zoning details" or null,
  "taxInfo": "Tax information" or null,
  "sellerMotivation": "Why selling" or null,
  "financingOptions": "Financing details" or null,
  "possession": "When buyer gets possession" or null,
  "keyHighlights": [
    "Prime tillable farmland",
    "Excellent drainage",
    "Close to town"
  ]
}

Be precise, thorough, and extract EVERYTHING available. If information is not found, use null.`;

export class AuctionEnrichmentService {
  /**
   * Enrich a single auction with AI-extracted comprehensive data
   */
  async enrichAuction(auctionId: number): Promise<EnrichmentResult> {
    try {
      // Get auction with raw data
      const auction = await db.query.auctions.findFirst({
        where: eq(auctions.id, auctionId)
      });

      if (!auction) {
        throw new Error(`Auction ${auctionId} not found`);
      }

      // Update status to processing
      await db.update(auctions)
        .set({ enrichmentStatus: 'processing' })
        .where(eq(auctions.id, auctionId));

      // Prepare data for OpenAI
      const auctionData = {
        title: auction.title,
        description: auction.description,
        url: auction.url,
        sourceWebsite: auction.sourceWebsite,
        address: auction.address,
        county: auction.county,
        state: auction.state,
        acreage: auction.acreage,
        landType: auction.landType,
        auctionDate: auction.auctionDate,
        auctioneer: auction.auctioneer,
        rawData: auction.rawData
      };

      // Call OpenAI for enrichment
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: ENRICHMENT_PROMPT
          },
          {
            role: "user",
            content: `Analyze this auction listing and extract all information:\n\n${JSON.stringify(auctionData, null, 2)}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1 // Low temperature for consistent, factual extraction
      });

      const enrichedData = JSON.parse(completion.choices[0].message.content || '{}');

      // Check if AI detected this auction as sold
      const aiDetectedSold = enrichedData.soldStatus === 'sold';
      if (aiDetectedSold) {
        console.log(`   🏷️  AI detected SOLD status: ${enrichedData.soldIndicators || 'indicators found in text'}`);
      }

      // Validate and structure the result
      const result: EnrichmentResult = {
        enrichedTitle: enrichedData.enrichedTitle || auction.title || 'Untitled Auction',
        enrichedDescription: enrichedData.enrichedDescription || auction.description || '',
        enrichedAuctionHouse: enrichedData.enrichedAuctionHouse || auction.auctioneer || null,
        enrichedAuctionDate: enrichedData.enrichedAuctionDate || null,
        enrichedAuctionLocation: enrichedData.enrichedAuctionLocation || null,
        enrichedPropertyLocation: enrichedData.enrichedPropertyLocation || auction.address || null,
        legalDescription: enrichedData.legalDescription || null,
        legalDescriptionParsed: null, // Will be filled by legal description geocoder
        legalDescriptionSource: enrichedData.legalDescription ? (enrichedData.legalDescriptionSource || 'ai_extracted') : null,
        soilMentions: enrichedData.soilMentions || null,
        cropHistory: enrichedData.cropHistory || null,
        improvements: Array.isArray(enrichedData.improvements) ? enrichedData.improvements : [],
        utilities: enrichedData.utilities || null,
        roadAccess: enrichedData.roadAccess || null,
        drainage: enrichedData.drainage || null,
        tillablePercent: enrichedData.tillablePercent || null,
        crpDetails: enrichedData.crpDetails || null,
        waterRights: enrichedData.waterRights || null,
        mineralRights: enrichedData.mineralRights || null,
        zoningInfo: enrichedData.zoningInfo || null,
        taxInfo: enrichedData.taxInfo || null,
        sellerMotivation: enrichedData.sellerMotivation || null,
        financingOptions: enrichedData.financingOptions || null,
        possession: enrichedData.possession || null,
        keyHighlights: Array.isArray(enrichedData.keyHighlights) ? enrichedData.keyHighlights : []
      };

      // Save enriched data to database
      await db.update(auctions)
        .set({
          enrichedTitle: result.enrichedTitle,
          enrichedDescription: result.enrichedDescription,
          enrichedAuctionHouse: result.enrichedAuctionHouse,
          enrichedAuctionDate: result.enrichedAuctionDate ? new Date(result.enrichedAuctionDate) : null,
          enrichedAuctionLocation: result.enrichedAuctionLocation,
          enrichedPropertyLocation: result.enrichedPropertyLocation,
          legalDescription: result.legalDescription,
          legalDescriptionParsed: result.legalDescriptionParsed,
          legalDescriptionSource: result.legalDescriptionSource,
          soilMentions: result.soilMentions,
          cropHistory: result.cropHistory,
          improvements: result.improvements,
          utilities: result.utilities,
          roadAccess: result.roadAccess,
          drainage: result.drainage,
          tillablePercent: result.tillablePercent,
          crpDetails: result.crpDetails,
          waterRights: result.waterRights,
          mineralRights: result.mineralRights,
          zoningInfo: result.zoningInfo,
          taxInfo: result.taxInfo,
          sellerMotivation: result.sellerMotivation,
          financingOptions: result.financingOptions,
          possession: result.possession,
          keyHighlights: result.keyHighlights,
          enrichmentStatus: 'completed',
          enrichedAt: new Date(),
          enrichmentVersion: 'v1',
          enrichmentError: null,
          // Update status to 'sold' if AI detected it
          status: aiDetectedSold ? 'sold' : auction.status
        })
        .where(eq(auctions.id, auctionId));

      console.log(`✅ Successfully enriched auction ${auctionId}: ${result.enrichedTitle}`);
      return result;

    } catch (error: any) {
      console.error(`❌ Failed to enrich auction ${auctionId}:`, error.message);
      
      // Update status to failed with error message
      await db.update(auctions)
        .set({
          enrichmentStatus: 'failed',
          enrichmentError: error.message || 'Unknown error during enrichment'
        })
        .where(eq(auctions.id, auctionId));

      throw error;
    }
  }

  /**
   * Enrich multiple auctions in batch
   */
  async enrichBatch(auctionIds: number[], batchSize: number = 5): Promise<{
    successful: number;
    failed: number;
    errors: { id: number; error: string }[];
  }> {
    const results = {
      successful: 0,
      failed: 0,
      errors: [] as { id: number; error: string }[]
    };

    console.log(`\n🔄 Starting batch enrichment of ${auctionIds.length} auctions (batch size: ${batchSize})...`);

    // Process in batches to avoid rate limits
    for (let i = 0; i < auctionIds.length; i += batchSize) {
      const batch = auctionIds.slice(i, i + batchSize);
      console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(auctionIds.length / batchSize)} (${batch.length} auctions)...`);

      // Process batch in parallel
      const promises = batch.map(async (id) => {
        try {
          await this.enrichAuction(id);
          results.successful++;
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            id,
            error: error.message || 'Unknown error'
          });
        }
      });

      await Promise.all(promises);

      // Rate limiting delay between batches (1 second)
      if (i + batchSize < auctionIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`\n✅ Batch enrichment complete: ${results.successful} successful, ${results.failed} failed`);
    return results;
  }

  /**
   * Enrich all pending auctions
   */
  async enrichAll(limit?: number): Promise<{
    successful: number;
    failed: number;
    errors: { id: number; error: string }[];
  }> {
    console.log('\n🚀 Starting enrichment of all pending auctions...');

    // Get all auctions with pending enrichment status.
    // Retired rows keep whatever enrichment_status they had, so without
    // NOT_ARCHIVED this picks the archive up and bills a GPT-4o call for every
    // listing the archiver already decided nobody will ever see.
    const pendingAuctions = await db.query.auctions.findMany({
      where: and(eq(auctions.enrichmentStatus, 'pending'), NOT_ARCHIVED),
      limit: limit || undefined
    });

    console.log(`📊 Found ${pendingAuctions.length} auctions pending enrichment`);

    if (pendingAuctions.length === 0) {
      console.log('✅ No auctions need enrichment');
      return { successful: 0, failed: 0, errors: [] };
    }

    const auctionIds = pendingAuctions.map(a => a.id);
    return await this.enrichBatch(auctionIds);
  }

  /**
   * Re-enrich auctions (update existing enriched data)
   */
  async reEnrichAll(): Promise<{
    successful: number;
    failed: number;
    errors: { id: number; error: string }[];
  }> {
    console.log('\n🔄 Re-enriching ALL live auctions (including previously enriched)...');

    // "ALL" means all LIVE auctions. The UPDATE below used to carry no WHERE
    // clause whatsoever, which was survivable only because retired rows were
    // deleted — the table was ~2k rows. It is now the archive too, so an
    // unscoped reset would push ~90k retired listings through GPT-4o.
    const allAuctions = await db.query.auctions.findMany({ where: NOT_ARCHIVED });
    console.log(`📊 Found ${allAuctions.length} live auctions`);

    // Reset to pending — scoped to the same rows we are about to enrich.
    await db.update(auctions)
      .set({ enrichmentStatus: 'pending' })
      .where(NOT_ARCHIVED);

    const auctionIds = allAuctions.map(a => a.id);
    return await this.enrichBatch(auctionIds);
  }

  /**
   * Get enrichment statistics
   */
  async getEnrichmentStats(): Promise<{
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    pendingIds: number[];
    failedIds: number[];
  }> {
    // Live rows only. Counting the archive here would report tens of thousands
    // of "pending" enrichments that nobody intends to run, and `pendingIds` is
    // fed straight back into enrichBatch by callers.
    const allAuctions = await db.query.auctions.findMany({ where: NOT_ARCHIVED });

    const stats = {
      total: allAuctions.length,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      pendingIds: [] as number[],
      failedIds: [] as number[]
    };

    for (const auction of allAuctions) {
      const status = auction.enrichmentStatus || 'pending';
      
      if (status === 'pending') {
        stats.pending++;
        stats.pendingIds.push(auction.id);
      } else if (status === 'processing') {
        stats.processing++;
      } else if (status === 'completed') {
        stats.completed++;
      } else if (status === 'failed') {
        stats.failed++;
        stats.failedIds.push(auction.id);
      }
    }

    return stats;
  }
}

// Export singleton instance
export const auctionEnrichmentService = new AuctionEnrichmentService();

