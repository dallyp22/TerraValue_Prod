import OpenAI from "openai";
import type { Auction } from "@shared/schema";

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY2 || process.env.OPENAI_API_KEY || ""
});

export interface ExtractedParcelInfo {
  legalDescription?: string;
  actualLocation?: string;
  actualCounty?: string;
  actualAcreage?: number;
  numberOfTracts?: number;
  tractDescriptions?: string[];
  isIrrigated?: boolean;
  landCharacteristics?: {
    tillable?: boolean;
    pasture?: boolean;
    crp?: boolean;
    timber?: boolean;
  };
  extractedCoordinates?: {
    latitude?: number;
    longitude?: number;
  };
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

export class AuctionParcelExtractor {
  /**
   * Extract parcel information from auction data using AI
   */
  async extractParcelInfo(auction: Auction): Promise<ExtractedParcelInfo> {
    try {
      console.log(`🤖 Extracting parcel info for auction: ${auction.title}`);

      // Prepare auction text for analysis
      const auctionText = this.prepareAuctionText(auction);

      const systemPrompt = `You are an expert at analyzing agricultural land auction listings and extracting precise parcel information. Your goal is to extract the ACTUAL property location and details, not the auction house or city hall address.

Key tasks:
1. Extract legal land descriptions (Section, Township, Range, Quarter sections)
2. Identify the actual property county and location
3. Extract accurate acreage (not estimated ranges)
4. Determine number of tracts if multiple parcels
5. Identify land characteristics (irrigated, dryland, pasture, CRP, timber)
6. Extract coordinates if mentioned

IMPORTANT: 
- Distinguish between auction location (city hall, auction house) vs actual property location
- Legal descriptions are most reliable for location
- Be conservative - if unsure, indicate lower confidence`;

      const userPrompt = `Analyze this auction listing and extract parcel information:

TITLE: ${auction.title}

DESCRIPTION: ${auction.description || 'N/A'}

ENRICHED DESCRIPTION: ${auction.enrichedDescription || 'N/A'}

ADDRESS: ${auction.address || 'N/A'}

COUNTY: ${auction.county || 'N/A'}

STATE: ${auction.state || 'N/A'}

ACREAGE: ${auction.acreage || 'N/A'}

LAND TYPE: ${auction.landType || 'N/A'}

EXISTING COORDINATES: ${auction.latitude && auction.longitude ? `${auction.latitude}, ${auction.longitude}` : 'N/A'}

Return a JSON object with this exact structure:
{
  "legalDescription": "Full legal description if available",
  "actualLocation": "City/township name where property is located",
  "actualCounty": "County where property is located",
  "actualAcreage": numeric value or null,
  "numberOfTracts": number of separate parcels,
  "tractDescriptions": ["description of tract 1", "description of tract 2"],
  "isIrrigated": true/false/null,
  "landCharacteristics": {
    "tillable": true/false,
    "pasture": true/false,
    "crp": true/false,
    "timber": true/false
  },
  "extractedCoordinates": {
    "latitude": number or null,
    "longitude": number or null
  },
  "confidence": "high" | "medium" | "low",
  "reasoning": "Brief explanation of extraction confidence and key findings"
}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const result = JSON.parse(completion.choices[0].message.content || "{}");
      
      console.log(`✅ Extracted parcel info with ${result.confidence} confidence`);
      console.log(`   Location: ${result.actualLocation}, ${result.actualCounty}`);
      console.log(`   Acreage: ${result.actualAcreage || 'Unknown'}`);
      console.log(`   Tracts: ${result.numberOfTracts || 1}`);

      return result as ExtractedParcelInfo;

    } catch (error) {
      console.error('❌ Failed to extract parcel info:', error);
      
      // Return fallback with auction data
      return {
        actualCounty: auction.county,
        actualAcreage: auction.acreage,
        numberOfTracts: 1,
        confidence: 'low',
        reasoning: 'AI extraction failed, using basic auction data'
      };
    }
  }

  /**
   * Determine valuation land type from auction data and extracted characteristics
   */
  determineValuationLandType(
    auction: Auction, 
    extracted: ExtractedParcelInfo
  ): 'Irrigated' | 'Dryland' | 'Pasture' | 'CRP' {
    const text = `${auction.title} ${auction.description} ${auction.enrichedDescription} ${auction.landType}`.toLowerCase();
    
    // Check for irrigation
    if (extracted.isIrrigated || text.includes('irrigat')) {
      return 'Irrigated';
    }
    
    // Check for CRP
    if (extracted.landCharacteristics?.crp || text.includes('crp') || text.includes('conservation reserve')) {
      return 'CRP';
    }
    
    // Check for pasture/grass
    if (
      extracted.landCharacteristics?.pasture || 
      text.includes('pasture') || 
      text.includes('grass') || 
      text.includes('hay') ||
      text.includes('grazing')
    ) {
      return 'Pasture';
    }
    
    // Check for dryland keywords
    if (text.includes('dryland') || text.includes('dry land') || text.includes('non-irrigated')) {
      return 'Dryland';
    }
    
    // Default to Dryland for Iowa farm auctions
    return 'Dryland';
  }

  /**
   * Prepare auction text for AI analysis
   */
  private prepareAuctionText(auction: Auction): string {
    const parts: string[] = [];
    
    if (auction.title) parts.push(`Title: ${auction.title}`);
    if (auction.description) parts.push(`Description: ${auction.description}`);
    if (auction.enrichedDescription) parts.push(`Details: ${auction.enrichedDescription}`);
    if (auction.address) parts.push(`Address: ${auction.address}`);
    if (auction.county) parts.push(`County: ${auction.county}`);
    if (auction.acreage) parts.push(`Acreage: ${auction.acreage}`);
    
    return parts.join('\n');
  }
}

export const auctionParcelExtractor = new AuctionParcelExtractor();

