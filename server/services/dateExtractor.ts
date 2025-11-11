import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface DateExtractionResult {
  date: Date | null;
  confidence: 'high' | 'medium' | 'low';
  method: 'ai' | 'regex';
  rawText?: string;
}

export class DateExtractorService {
  /**
   * Extract auction date from title and description
   * Tries regex patterns first (fast, free), falls back to AI if needed
   */
  async extractDateFromText(title: string, description: string): Promise<DateExtractionResult> {
    const combinedText = `${title} ${description || ''}`;
    
    // Try regex extraction first (free and fast)
    const regexResult = this.tryRegexExtraction(combinedText);
    if (regexResult) {
      return {
        date: regexResult,
        confidence: 'high',
        method: 'regex',
        rawText: combinedText.substring(0, 200)
      };
    }
    
    // Fall back to AI extraction
    return await this.aiExtraction(title, description);
  }

  /**
   * Try to extract date using regex patterns
   * Covers common date formats in auction listings
   */
  private tryRegexExtraction(text: string): Date | null {
    if (!text) return null;

    // Common patterns in auction listings
    const patterns = [
      // "September 9th, 2025" or "September 9, 2025"
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i,
      
      // "Sept 9, 2025" or "Sep 9, 2025"
      /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i,
      
      // "12/15/2025" or "12-15-2025"
      /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/,
      
      // "2025-12-15" (ISO format)
      /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
      
      // "Bids Due: October 24, 2025" or "Sale Date: Nov 30, 2025"
      /(?:Bids?\s+Due|Sale\s+Date|Auction\s+Date|Bidding\s+Ends?|Closes?):\s*([A-Za-z]+\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        try {
          let dateStr: string;
          
          // Handle different match groups
          if (match[0].match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
            // ISO format: YYYY-MM-DD
            dateStr = match[0];
          } else if (match[0].match(/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/)) {
            // MM/DD/YYYY format
            const [month, day, year] = match[0].split(/[/-]/);
            dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          } else {
            // Month name format - use the full match or the capture group from patterns with text before
            dateStr = match[1] ? match[0].substring(match[0].indexOf(match[1])) : match[0];
          }
          
          const date = new Date(dateStr);
          
          // Validate date is reasonable (not in distant past, not too far future)
          const now = new Date();
          const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          const twoYearsAhead = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());
          
          if (date >= oneYearAgo && date <= twoYearsAhead && !isNaN(date.getTime())) {
            return date;
          }
        } catch (error) {
          // Continue to next pattern if parsing fails
          continue;
        }
      }
    }
    
    return null;
  }

  /**
   * Use AI to extract date when regex fails
   * More expensive but handles complex/unusual formats
   */
  private async aiExtraction(title: string, description: string): Promise<DateExtractionResult> {
    try {
      const prompt = `Extract the auction date from this listing. If you find a date, return ONLY the date in ISO format (YYYY-MM-DD). If no date is found, return exactly "null".

Title: ${title}

Description: ${description || 'No description provided'}

Remember: Return ONLY the date in YYYY-MM-DD format, or the word "null" if no date found. Nothing else.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a date extraction assistant. Extract auction dates from text and return them in ISO format (YYYY-MM-DD) or 'null' if no date found. Return ONLY the date or 'null', nothing else."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0,
        max_tokens: 20
      });

      const result = response.choices[0]?.message?.content?.trim();
      
      if (!result || result.toLowerCase() === 'null' || result.toLowerCase() === 'none') {
        return {
          date: null,
          confidence: 'low',
          method: 'ai'
        };
      }

      // Parse the AI response
      const date = new Date(result);
      
      // Validate date
      if (isNaN(date.getTime())) {
        console.warn(`AI returned invalid date: ${result}`);
        return {
          date: null,
          confidence: 'low',
          method: 'ai'
        };
      }

      // Check if date is reasonable
      const now = new Date();
      const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const twoYearsAhead = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());
      
      if (date < oneYearAgo || date > twoYearsAhead) {
        console.warn(`AI returned unreasonable date: ${result}`);
        return {
          date: null,
          confidence: 'low',
          method: 'ai'
        };
      }

      // Determine confidence based on how recent the date is
      const confidence = date > now ? 'high' : 'medium';

      return {
        date,
        confidence,
        method: 'ai'
      };

    } catch (error) {
      console.error('AI date extraction failed:', error);
      return {
        date: null,
        confidence: 'low',
        method: 'ai'
      };
    }
  }
}

