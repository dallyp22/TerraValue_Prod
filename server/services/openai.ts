import OpenAI from "openai";

// Using gpt-4o model - required for this OpenAI project
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY2 || process.env.OPENAI_API_KEY || ""
});

const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID || "vs_6858949b51d48191a2edaee8b4e2b211";

export interface VectorStoreResult {
  baseValue: number;
  description: string;
}

export interface AIReasoningResult {
  adjustedValue: number;
  reasoning: string;
  improvements: number;
}

export interface MarketResearchResult {
  marketAdjustment: number;
  insight: string;
  trends: string[];
}

export interface SalesComp {
  date: string;
  price_per_acre: number;
  details: string;
  acres?: number;
  land_type?: string;
  county?: string;
}

export interface MarketAnalysisResult {
  comps: SalesComp[];
  trends: {
    yoy_change?: number;
    factors: string[];
  };
  summary: string;
}

export interface FinalValuationResult {
  perAcreValue: number;
  totalValue: number;
  confidenceScore: number;
  commentary: string;
  breakdown: {
    baseValue: number;
    improvements: number;
    marketAdjustment: number;
    finalValue: number;
  };
}

// Use existing assistant ID if available, otherwise create new one
const AGRICULTURAL_ASSISTANT_ID = process.env.AGRICULTURAL_ASSISTANT_ID || null;

// Iowa-specific market analysis assistant
const IOWA_MARKET_ASSISTANT_ID = "asst_mZOWphXE1Zaj4nppl5OGsHL7";
const IOWA_VECTOR_STORE_ID = "vs_68755fcbdfc081918788b7ce0db68682";

export class OpenAIService {
  private openai = openai;
  private assistantId: string | null = AGRICULTURAL_ASSISTANT_ID;
  
  private async getOrCreateAssistant() {
    // If we already have an assistant ID, just use it
    if (this.assistantId) {
      console.log(`Using existing agricultural database assistant: ${this.assistantId}`);
      return { id: this.assistantId };
    }
    
    // Only create a new assistant if we don't have one
    console.log("Creating new agricultural database assistant with gpt-4o model");
    const assistant = await openai.beta.assistants.create({
      name: "TerraValue Agricultural Database Assistant",
      instructions: "You are an expert agricultural land appraiser with access to comprehensive land value databases. Search through the provided agricultural data files to find specific land values by county and state. Focus on accurate dollar per acre values for different land types including Irrigated, Dryland, Pasture, and CRP land. Always return exact values from the database when available.",
      model: "gpt-4o",
      tools: [{ type: "file_search" }],
      tool_resources: {
        file_search: {
          vector_store_ids: [VECTOR_STORE_ID!]
        }
      }
    });
    
    // Store the assistant ID for future use
    this.assistantId = assistant.id;
    console.log(`Created new assistant with ID: ${assistant.id}`);
    console.log("To reuse this assistant in future sessions, add this to your .env file:");
    console.log(`AGRICULTURAL_ASSISTANT_ID=${assistant.id}`);
    
    return assistant;
  }

  async getCountyBaseValue(county: string, state: string, landType: string): Promise<VectorStoreResult> {
    console.log(`Searching agricultural database for ${landType} land values in ${county} County, ${state}`);
    
    if (!VECTOR_STORE_ID) {
      console.log("Vector store not configured, using AI estimation");
      return this.getAIPoweredEstimate(county, state, landType);
    }

    try {
      console.log(`Querying existing assistant for ${landType} land in ${county} County, ${state}`);
      
      const assistant = await this.getOrCreateAssistant();

      const thread = await openai.beta.threads.create();
      
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: `Search for ${landType} farmland values in ${county} County, ${state}. What is the per-acre value from your agricultural database?`
      });

      const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
        assistant_id: assistant.id
      });

      if (run.status === "completed") {
        const messages = await openai.beta.threads.messages.list(thread.id);
        const response = messages.data.find(msg => msg.role === "assistant");
        
        if (response?.content?.[0]?.type === "text") {
          const content = response.content[0].text.value;
          console.log("Vector store response:", content.substring(0, 300));

          const priceMatches = content.match(/\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g);
          if (priceMatches?.length) {
            const baseValue = parseFloat(priceMatches[0].replace(/\$|,/g, ''));
            
            if (baseValue >= 500 && baseValue <= 50000) {
              console.log(`Retrieved from agricultural database: $${baseValue}/acre`);
              return {
                baseValue,
                description: content.substring(0, 400)
              };
            }
          }
        }
      }

      console.log(`Vector store query completed with status: ${run.status}`);
      
    } catch (error) {
      console.error("Vector store access failed:", error instanceof Error ? error.message : String(error));
    }

    // Fallback to AI estimation if vector store fails
    console.log("Using AI-powered estimation as fallback");
    return this.getAIPoweredEstimate(county, state, landType);
  }

  async getAIPoweredEstimate(county: string, state: string, landType: string): Promise<VectorStoreResult> {
    try {
      const prompt = `As an agricultural land valuation expert, provide an estimated value per acre for ${landType} agricultural land in ${county} County, ${state}. 

Consider these factors:
- Regional agricultural market conditions
- Land type characteristics (${landType})
- Geographic location (${county} County, ${state})
- Current agricultural commodity prices
- Infrastructure and accessibility

Respond in JSON format:
{
  "baseValue": [dollar amount per acre],
  "description": "[detailed explanation of the valuation basis]"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert agricultural land appraiser with deep knowledge of land values across the United States. Provide realistic, market-based valuations."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        baseValue: result.baseValue || 3700,
        description: result.description || `AI-estimated base value for ${landType} land in ${county} County, ${state}`
      };

    } catch (error) {
      console.error("AI estimation failed:", error);
      
      // Use realistic fallback values based on land type and region
      const fallbackValues: Record<string, number> = {
        "Irrigated": 3700,
        "Dryland": 2800, 
        "Pasture": 2200,
        "CRP": 1800
      };
      
      return {
        baseValue: fallbackValues[landType] || 3000,
        description: `Conservative estimate for ${landType} land in ${county} County, ${state} based on regional averages`
      };
    }
  }

  async performReasonedValuation(
    baseValue: number,
    acreage: number,
    landType: string,
    county: string,
    state: string,
    additionalDetails: string,
    incomeCapValue?: number,
    csr2Value?: number
  ): Promise<AIReasoningResult> {
    try {
      const incomeContextMsg = incomeCapValue ? 
        `\n\nINCOME APPROACH VALIDATION:
        Income Capitalization Value: $${Math.round(incomeCapValue)}/acre
        This provides a fundamental income-based benchmark for comparison and validation.` : '';
      
      const csr2ContextMsg = csr2Value ? 
        `\n\nCSR2 QUANTITATIVE ANALYSIS:
        CSR2-Based Calculated Value: $${Math.round(csr2Value)}/acre
        This value is calculated using Iowa's standard CSR2 methodology and should be considered as an additional valuation benchmark.` : '';

      const prompt = `
        You are performing a comprehensive AI Market-Adjusted valuation that synthesizes multiple data sources.
        
        BASE DATA POINTS:
        - County Base Value: $${baseValue}/acre (from vector store)
        - Land Type: ${landType}
        - Location: ${county} County, ${state}
        - Acreage: ${acreage}
        ${incomeContextMsg}
        ${csr2ContextMsg}
        
        Property Details: ${additionalDetails || "No specific details provided"}

        YOUR TASK: Create an AI Market-Adjusted Value that intelligently combines ALL available data:
        
        1. Start with the county base value as a foundation
        2. Consider the CSR2 value (if available) - should influence but not solely determine the final value
        3. Factor in market comparables from the additional details - PRIORITIZE higher-value comparables ($6,000/acre and above) as they better reflect market reality for quality agricultural land
        4. Apply property-specific adjustments
        5. Weight income approach data if available
        
        The AI Market-Adjusted Value should be a sophisticated blend that:
        - Uses CSR2 as ONE factor (typically 30-40% weight)
        - Incorporates recent sales comps (30-40% weight) - give MORE weight to comparables above $6,000/acre as they represent quality agricultural properties
        - Considers county base values (20-30% weight)
        - Adjusts for property-specific features
        
        Return JSON format:
        {
          "adjustedValue": number (the AI Market-Adjusted per-acre value),
          "reasoning": "Comprehensive explanation of how you weighted different factors",
          "improvements": 0
        }

        IMPORTANT GUIDELINES:
        - The adjustedValue should be DIFFERENT from the CSR2 value unless coincidentally similar
        - Create a meaningful synthesis of all data points
        - Typical range: $${Math.round(baseValue * 0.8)} to $${Math.round(baseValue * 1.5)} per acre
        - If CSR2 suggests $${csr2Value || 'N/A'}/acre, your AI value should reflect market reality beyond just soil productivity
        
        Example reasoning: "The AI Market-Adjusted value of $X/acre represents a sophisticated analysis weighing CSR2 productivity ($Y/acre) at 35%, recent comparable sales averaging $Z/acre at 40%, and county base trends at 25%. This synthesis accounts for..."
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert agricultural land appraiser. Analyze property features and provide detailed valuation reasoning."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      // Validate that adjustedValue is a reasonable positive number
      let adjustedValue = result.adjustedValue || baseValue;
      
      // Reject unreasonable values (negative, zero, or extreme values)
      if (adjustedValue <= 0 || adjustedValue > baseValue * 5 || adjustedValue < baseValue * 0.2) {
        console.warn(`AI returned unreasonable adjustedValue: ${adjustedValue}. Using base value: ${baseValue}`);
        adjustedValue = baseValue;
      }
      
      return {
        adjustedValue: adjustedValue,
        reasoning: result.reasoning || "Basic valuation based on county averages",
        improvements: result.improvements || 0
      };
    } catch (error) {
      console.error("AI reasoning failed:", error);
      return {
        adjustedValue: baseValue,
        reasoning: "Unable to perform detailed analysis. Using base county value.",
        improvements: 0
      };
    }
  }

  async getIowaMarketAnalysis(county: string, landType: string): Promise<MarketAnalysisResult> {
    try {
      console.log(`Querying Iowa market analysis for ${landType} land in ${county} County, Iowa using vector store ${IOWA_VECTOR_STORE_ID}`);
      
      const thread = await openai.beta.threads.create();
      
      const systemInstructions = `You provide real-time, location-specific market information on Iowa land values by extracting and synthesizing data from the attached vector store. For each query, ensure all factual information—market trends, industry insights, and comparable sales—is derived directly from the content retrieved via the vector store. If insufficient or no relevant data is returned for the requested location, transparently explain the limitation and its likely cause.

Carefully follow these requirements:

- Analyze the user-provided Iowa location and retrieve related data from the attached vector store.
- Synthesize a concise, fact-based summary of current market trends for land values in that area, citing vector store sources.
- Present actionable industry insights relevant to the locality, clearly distinguishing which points are directly supported by data vs. your expert interpretation.
- List up to three recent, factual nearby comparable land sales, showing only those present in the vector store. Include sale date, location, price per acre, and pertinent characteristics. When selecting comparables, prioritize higher-value sales (especially those above $6,000/acre) as they typically represent better quality agricultural land and more accurate market conditions.
- If limited or no data exists in the vector store for any section, state this explicitly and briefly explain why (e.g., lack of recent area transactions, data not available).

Steps:
1. Retrieve all relevant information for the specified Iowa location from the attached vector store.
2. Analyze content to determine current market trends in the area.
3. Identify and extract industry insight data, making clear what is fact from the store versus your interpretation.
4. Locate and list up to 3 of the most recent local comparable sales available in the vector store, including required details.
5. Where factual (vector store) data is absent, indicate this and provide a succinct rationale.

Format your response as JSON with this structure:
{
  "comps": [{"date": "YYYY-MM", "price_per_acre": number, "details": "string", "acres": number, "location": "string", "county": "string"}],
  "trends": {"yoy_change": number, "factors": ["factor1", "factor2"]},
  "summary": "market summary text with vector store citations"
}

All market summaries, comparable sales, and insights must be directly supported by data from the attached vector store. Interpretive or speculative comments must be subordinate to sourced data and clearly attributed as such. Persist until all possible relevant facts are found from the vector store before producing the final answer.`;

      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: `${county} County, Iowa - ${landType} land market analysis. Please provide comprehensive market information for this specific location using only data from the vector store vs_68755fcbdfc081918788b7ce0db68682.`
      });

      const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
        assistant_id: IOWA_MARKET_ASSISTANT_ID,
        instructions: systemInstructions,
        tools: [{ type: "file_search" }]
      });

      if (run.status === "completed") {
        const messages = await openai.beta.threads.messages.list(thread.id);
        const response = messages.data.find(msg => msg.role === "assistant");
        
        if (response?.content?.[0]?.type === "text") {
          const content = response.content[0].text.value;
          console.log("Iowa market analysis response:", content.substring(0, 500));
          
          // Try to parse JSON response
          try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const marketData = JSON.parse(jsonMatch[0]);
              
              // Clean up the thread
              await openai.beta.threads.delete(thread.id);
              
              return {
                comps: marketData.comps || [],
                trends: marketData.trends || { factors: [] },
                summary: marketData.summary || content.substring(0, 500)
              };
            }
          } catch (parseError) {
            console.error("Failed to parse market analysis JSON:", parseError);
          }
          
          // Fallback: extract sales data from text using helper methods
          const comps = this.extractCompsFromText(content);
          const trends = this.extractTrendsFromText(content);
          const summary = this.extractSummaryFromText(content);
          
          // Clean up the thread
          await openai.beta.threads.delete(thread.id);
          
          return { comps, trends, summary };
        }
      }

      // Clean up the thread
      await openai.beta.threads.delete(thread.id);
      
      console.log(`Iowa market analysis query completed with status: ${run.status}`);
      return {
        comps: [],
        trends: { factors: ["No vector store data available for this location"] },
        summary: "Limited data available in the vector store for this specific Iowa location. This may be due to few recent transactions, private sales, or delays in data availability."
      };
      
    } catch (error) {
      console.error("Iowa market analysis failed:", error);
      return {
        comps: [],
        trends: { factors: ["Analysis service temporarily unavailable"] },
        summary: "Iowa market analysis service encountered an error accessing the vector store"
      };
    }
  }

  // Helper methods to extract data from text responses
  private extractCompsFromText(text: string): SalesComp[] {
    const comps: SalesComp[] = [];
    // Extract sales data using regex patterns for dates, prices, and details
    const compMatches = text.match(/(\d{4}[-/]\d{2}|\w+ \d{4})[^$]*\$([0-9,]+)[^a-z]*acre[^.]*\./gi);
    
    if (compMatches) {
      compMatches.slice(0, 3).forEach(match => {
        const dateMatch = match.match(/(\d{4}[-/]\d{2}|\w+ \d{4})/);
        const priceMatch = match.match(/\$([0-9,]+)/);
        const acresMatch = match.match(/(\d+)\s*acres/i);
        const locationMatch = match.match(/(north|south|east|west|miles?)\s+(?:of\s+)?([A-Za-z\s]+)/i);
        const countyMatch = match.match(/([A-Za-z]+)\s+County/i);
        
        if (dateMatch && priceMatch) {
          comps.push({
            date: dateMatch[1],
            price_per_acre: parseInt(priceMatch[1].replace(/,/g, '')),
            details: match.trim(),
            acres: acresMatch ? parseInt(acresMatch[1]) : undefined,
            county: countyMatch ? countyMatch[1] : undefined,
            land_type: text.includes('irrigated') ? 'Irrigated' : 'Dryland'
          });
        }
      });
    }
    
    return comps;
  }

  private extractTrendsFromText(text: string): { yoy_change?: number; factors: string[] } {
    const factors: string[] = [];
    const yoyMatch = text.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:increase|decrease|change|growth|appreciation)/i);
    
    // Extract trend factors from the text
    const factorMatches = text.match(/(?:factors?|trends?|influences?)[^.]*\.(?:[^.]*\.){0,2}/gi);
    if (factorMatches) {
      factorMatches.forEach(factor => {
        const cleaned = factor.replace(/^(?:factors?|trends?|influences?)[:\s]*/i, '').trim();
        if (cleaned.length > 10) factors.push(cleaned);
      });
    }
    
    // Also extract bullet points or numbered factors
    const bulletMatches = text.match(/[•\-\*]\s*([^.\n]+)/g);
    if (bulletMatches) {
      bulletMatches.slice(0, 3).forEach(bullet => {
        const cleaned = bullet.replace(/^[•\-\*]\s*/, '').trim();
        if (cleaned.length > 10) factors.push(cleaned);
      });
    }
    
    let yoyChange: number | undefined = undefined;
    if (yoyMatch) {
      const parsedValue = parseFloat(yoyMatch[1]);
      // Ensure it's a valid number and convert percentage to decimal
      if (!isNaN(parsedValue) && parsedValue >= 0 && parsedValue <= 100) {
        yoyChange = parsedValue / 100;
      }
    }
    
    return {
      yoy_change: yoyChange,
      factors: factors.slice(0, 5) // Limit to 5 factors
    };
  }

  private extractSummaryFromText(text: string): string {
    // Extract the main market summary (first substantial paragraph)
    const paragraphs = text.split('\n\n').filter(p => p.length > 100);
    const summary = paragraphs.find(p => !p.includes('comparable sales') && !p.includes('Recent')) || paragraphs[0];
    return summary?.trim() || text.substring(0, 300) + '...';
  }

  async performMarketResearch(county: string, state: string, landType: string): Promise<MarketResearchResult> {
    try {
      // Use Iowa-specific market analysis if available
      if (state === "Iowa") {
        const iowaAnalysis = await this.getIowaMarketAnalysis(county, landType);
        
        // Convert Iowa analysis to standard format
        const avgPricePerAcre = iowaAnalysis.comps.length > 0 
          ? iowaAnalysis.comps.reduce((sum, comp) => sum + comp.price_per_acre, 0) / iowaAnalysis.comps.length
          : 0;
        
        return {
          marketAdjustment: (typeof iowaAnalysis.trends.yoy_change === 'number' && !isNaN(iowaAnalysis.trends.yoy_change)) 
            ? iowaAnalysis.trends.yoy_change 
            : 0.02,
          insight: iowaAnalysis.summary,
          trends: iowaAnalysis.trends.factors.length > 0 
            ? iowaAnalysis.trends.factors 
            : ["Iowa market analysis", "Recent sales data", "Current market conditions"]
        };
      }
      
      // Fallback to general market research for non-Iowa states
      const searchQuery = `Current land values, trends, and economic conditions in ${county} County, ${state} for ${landType} farmland in 2025`;
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a market research analyst specializing in agricultural real estate. Analyze current market conditions and provide insights in JSON format."
          },
          {
            role: "user",
            content: `Research: ${searchQuery}

            Please provide market analysis in JSON format:
            {
              "marketAdjustment": number (percentage adjustment as decimal, e.g., 0.05 for +5%),
              "insight": "comprehensive market commentary",
              "trends": ["trend1", "trend2", "trend3"]
            }`
          }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        marketAdjustment: result.marketAdjustment || 0.02,
        insight: result.insight || "Market conditions are stable with moderate growth expected.",
        trends: result.trends || ["Stable commodity prices", "Increasing irrigation demand", "Infrastructure improvements"]
      };
    } catch (error) {
      console.error("Market research failed:", error);
      return {
        marketAdjustment: 0.02,
        insight: "Unable to access current market data. Applying conservative growth estimate.",
        trends: ["Limited market data available"]
      };
    }
  }

  async estimateImprovementValue(
    type: string,
    description: string,
    condition: string,
    county: string,
    state: string
  ): Promise<number> {
    try {
      const prompt = `You are an agricultural property improvement valuation expert. Estimate the fair market value of the following property improvement:

Type: ${type}
Description: ${description}
Condition: ${condition}
Location: ${county} County, ${state}

Consider:
- Current market conditions in ${state}
- Typical costs for ${type} in agricultural settings
- Condition factor adjustments
- Regional agricultural economics
- Depreciation and useful life

Provide ONLY a numeric dollar value (no currency symbols, commas, or text). Be realistic and conservative in your estimate.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 50
      });

      const valueString = response.choices[0].message.content?.trim() || "0";
      const estimatedValue = parseFloat(valueString.replace(/[^0-9.]/g, '')) || 0;
      
      console.log(`AI estimated ${type} value: $${estimatedValue}`);
      return Math.round(estimatedValue);
    } catch (error) {
      console.error("Failed to estimate improvement value:", error);
      // Return conservative default values based on improvement type
      const defaultValues: Record<string, number> = {
        "Building": 25000,
        "Barn": 15000,
        "Silo": 8000,
        "Well": 5000,
        "Irrigation System": 20000,
        "Fencing": 3000,
        "Road Access": 5000,
        "Other": 2000
      };
      return defaultValues[type] || 2000;
    }
  }

  async synthesizeFinalValuation(
    baseValue: number,
    reasonedValue: number,
    improvements: number,
    marketAdjustment: number,
    marketInsight: string,
    acreage: number,
    totalImprovementsValue: number = 0
  ): Promise<FinalValuationResult> {
    try {
      const prompt = `
        Given the following valuation components:
        - Base $/acre: $${baseValue}
        - Reasoned valuation: $${reasonedValue}/acre
        - Property improvements (per acre): $${improvements}/acre
        - Property improvements (total): $${totalImprovementsValue}
        - Market adjustment: ${(marketAdjustment * 100).toFixed(1)}%
        - Market insight: ${marketInsight}
        - Total acreage: ${acreage}

        Calculate final valuation where property improvements are added as total dollar amounts, not per-acre.
        Formula: (reasoned_value_per_acre * acreage) + total_improvements + market_adjustments

        Please produce a final valuation synthesis in JSON format:
        {
          "perAcreValue": number,
          "totalValue": number,
          "confidenceScore": number (1-10 scale),
          "commentary": "final market-adjusted commentary",
          "breakdown": {
            "baseValue": number,
            "improvements": number,
            "marketAdjustment": number,
            "finalValue": number
          }
        }
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a senior agricultural land appraiser providing final valuation synthesis. Be precise and professional."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      // Calculate breakdown step by step for transparency
      // Ensure marketAdjustment is a valid number and not extreme
      let validMarketAdjustment = (typeof marketAdjustment === 'number' && !isNaN(marketAdjustment)) ? marketAdjustment : 0.02;
      
      // Cap market adjustment to reasonable bounds (-20% to +50%)
      if (validMarketAdjustment < -0.2) {
        console.warn(`Market adjustment too negative (${validMarketAdjustment}), capping at -20%`);
        validMarketAdjustment = -0.2;
      } else if (validMarketAdjustment > 0.5) {
        console.warn(`Market adjustment too high (${validMarketAdjustment}), capping at +50%`);
        validMarketAdjustment = 0.5;
      }
      
      // Market adjustment should be applied to the AI-reasoned value, not the base value
      const marketAdjustmentPerAcre = Math.round((reasonedValue * validMarketAdjustment) * 100) / 100;
      const finalAdjustedValuePerAcre = Math.round((reasonedValue + marketAdjustmentPerAcre) * 100) / 100;
      const totalLandValue = Math.round((finalAdjustedValuePerAcre * acreage) * 100) / 100;
      const totalPropertyValue = Math.round((totalLandValue + totalImprovementsValue) * 100) / 100;
      
      console.log(`Final Valuation Calculation:
        Base County Value: $${baseValue}/acre
        AI Reasoned Value: $${reasonedValue}/acre
        Market Adjustment: $${marketAdjustmentPerAcre}/acre (${(validMarketAdjustment * 100).toFixed(1)}%)
        Final Adjusted Value: $${finalAdjustedValuePerAcre}/acre
        Total Land Value: $${totalLandValue} (${finalAdjustedValuePerAcre} × ${acreage} acres)
        Property Improvements: $${totalImprovementsValue}
        Total Property Value: $${totalPropertyValue}`);
      
      return {
        perAcreValue: finalAdjustedValuePerAcre,
        totalValue: totalPropertyValue,
        confidenceScore: result.confidenceScore || 7.5,
        commentary: result.commentary || marketInsight,
        breakdown: {
          baseValue: baseValue,
          improvements: totalImprovementsValue,
          marketAdjustment: marketAdjustmentPerAcre,
          finalValue: finalAdjustedValuePerAcre
        }
      };
    } catch (error) {
      console.error("Final synthesis failed:", error);
      let validMarketAdjustment = (typeof marketAdjustment === 'number' && !isNaN(marketAdjustment)) ? marketAdjustment : 0.02;
      
      // Cap market adjustment to reasonable bounds (-20% to +50%)
      if (validMarketAdjustment < -0.2) validMarketAdjustment = -0.2;
      else if (validMarketAdjustment > 0.5) validMarketAdjustment = 0.5;
      
      const marketAdjustmentPerAcre = Math.round((baseValue * validMarketAdjustment) * 100) / 100;
      const finalPerAcre = Math.round((baseValue + marketAdjustmentPerAcre) * 100) / 100;
      const totalLandValue = Math.round((finalPerAcre * acreage) * 100) / 100;
      const totalValue = Math.round((totalLandValue + totalImprovementsValue) * 100) / 100;
      
      console.log(`Fallback Valuation Calculation:
        Base Value: $${baseValue}/acre
        Market Adjustment: $${marketAdjustmentPerAcre}/acre
        Final Adjusted Value: $${finalPerAcre}/acre
        Total Land Value: $${totalLandValue}
        Property Improvements: $${totalImprovementsValue}
        Total Property Value: $${totalValue}`);
      
      return {
        perAcreValue: finalPerAcre,
        totalValue: totalValue,
        confidenceScore: 6.0,
        commentary: "Valuation completed with limited market data integration.",
        breakdown: {
          baseValue: baseValue,
          marketAdjustment: marketAdjustmentPerAcre,
          finalValue: finalPerAcre,
          improvements: totalImprovementsValue
        }
      };
    }
  }
}

export const openaiService = new OpenAIService();

// Cleanup function for graceful shutdown
export async function cleanupOpenAI() {
  // We no longer delete the assistant on cleanup since we want to reuse it
  // The assistant ID is stored and can be reused across sessions
  console.log("OpenAI cleanup completed - assistant preserved for reuse");
}
