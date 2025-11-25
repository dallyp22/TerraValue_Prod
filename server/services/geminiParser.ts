import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Auction } from '@shared/schema';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface ParsedLegalDescription {
  type: 'plss' | 'lot_block' | 'metes_bounds' | 'unknown';
  plss?: {
    township: number;
    townshipDirection: 'N' | 'S';
    range: number;
    rangeDirection: 'E' | 'W';
    section: number;
    quarter?: string;
    subdivision?: string;
  };
  lotBlock?: {
    subdivision: string;
    lot: string;
    block?: string;
  };
  county: string;
  state: string;
  confidence: number;
  rawLegalDescription?: string;
  reasoning: string;
}

export class GeminiParserService {
  private model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash-exp",
    generationConfig: {
      responseMimeType: "application/json"
    }
  });

  /**
   * Parse legal description from auction using Gemini AI
   */
  async parseLegalDescription(auction: Auction): Promise<ParsedLegalDescription> {
    try {
      if (!process.env.GEMINI_API_KEY) {
        console.warn('⚠️  GEMINI_API_KEY not configured, skipping Gemini parsing');
        return this.createFallbackResult(auction);
      }

      console.log(`🤖 Parsing legal description with Gemini for: ${auction.title}`);

      const prompt = `
Parse this Iowa farmland auction listing and extract legal description information:

TITLE: ${auction.title}
DESCRIPTION: ${auction.description || 'N/A'}
ENRICHED: ${auction.enrichedDescription || 'N/A'}
ADDRESS: ${auction.address || 'N/A'}
COUNTY: ${auction.county || 'N/A'}
STATE: ${auction.state || 'Iowa'}
ACREAGE: ${auction.acreage || 'Unknown'}

Extract and return JSON with this EXACT structure:
{
  "type": "plss" | "lot_block" | "metes_bounds" | "unknown",
  "plss": {
    "township": number (e.g., 92),
    "townshipDirection": "N" or "S",
    "range": number (e.g., 42),
    "rangeDirection": "E" or "W",
    "section": number (e.g., 28),
    "quarter": string (e.g., "NW", "SW1/4 of NE1/4"),
    "subdivision": string (if applicable)
  } OR null if not PLSS,
  "lotBlock": {
    "subdivision": string,
    "lot": string,
    "block": string
  } OR null if not lot/block,
  "county": string,
  "state": string,
  "confidence": number (0-100),
  "rawLegalDescription": string (the original legal description text found),
  "reasoning": string (brief explanation of what you found and confidence level)
}

INSTRUCTIONS:
- Focus on Iowa PLSS format: Township N, Range W, Section
- Look for patterns like "Section 28", "T92N", "R42W", "NW 1/4"
- Township names like "Powhatan Township" help identify the section
- If you find "Section 28 of Powhatan Township", that's high confidence
- Return null for plss/lotBlock fields that don't apply
- Be specific in reasoning about what evidence you found`;

      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();
      
      const parsed: ParsedLegalDescription = JSON.parse(text);
      
      console.log(`✅ Gemini parsed: ${parsed.type} format, ${parsed.confidence}% confidence`);
      console.log(`   ${parsed.reasoning}`);
      
      return parsed;

    } catch (error) {
      console.error('Error parsing with Gemini:', error);
      return this.createFallbackResult(auction);
    }
  }

  /**
   * Create fallback result when Gemini fails or is unavailable
   */
  private createFallbackResult(auction: Auction): ParsedLegalDescription {
    return {
      type: 'unknown',
      county: auction.county || '',
      state: auction.state || 'Iowa',
      confidence: 0,
      reasoning: 'Gemini API unavailable or parsing failed'
    };
  }
}

export const geminiParserService = new GeminiParserService();

