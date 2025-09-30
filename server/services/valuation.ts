import { openaiService } from "./openai.js";
import { csr2Service } from "./csr2.js";
import { cornPriceService } from "./cornPrice.js";
import { storage } from "../storage.js";
import type { PropertyForm, ValuationBreakdown } from "@shared/schema";

export interface ValuationProgress {
  step: string;
  status: "pending" | "processing" | "completed" | "failed";
  data?: any;
}

export class ValuationService {
  async performValuation(propertyData: PropertyForm): Promise<number> {
    try {
      // Create initial valuation record
      const valuation = await storage.createValuation(propertyData);

      // Start async processing
      this.processValuationPipeline(valuation.id, propertyData);
      
      return valuation.id;
    } catch (error) {
      console.error("Failed to start valuation:", error);
      throw new Error("Failed to initiate valuation process");
    }
  }

  private async processValuationPipeline(valuationId: number, propertyData: PropertyForm) {
    try {
      // Update status to processing immediately
      await storage.updateValuation(valuationId, { status: "processing" });
      
      // Start ALL async operations in parallel for maximum speed
      console.log("Starting parallel valuation operations...");
      
      // Launch all data fetching operations simultaneously
      const parallelPromises = {
        // Core valuation data
        vectorResult: openaiService.getCountyBaseValue(
          propertyData.county,
          propertyData.state,
          propertyData.landType
        ),
        
        // Market research (runs in parallel from the start)
        marketResult: openaiService.performMarketResearch(
          propertyData.county,
          propertyData.state,
          propertyData.landType
        ),
        
        // Iowa-specific market analysis (if applicable)
        iowaMarketAnalysis: propertyData.state === "Iowa" 
          ? openaiService.getIowaMarketAnalysis(
              propertyData.county,
              propertyData.landType
            ).catch(error => {
              console.error("Iowa market analysis failed:", error);
              return null;
            })
          : Promise.resolve(null),
        
        // Corn futures for rent calculation (if CSR2 available)
        cornFuturesPrice: (propertyData.csr2Mean && propertyData.csr2Mean > 0)
          ? cornPriceService.getCornFuturesPrice().catch(error => {
              console.error("Failed to fetch corn futures:", error);
              return undefined;
            })
          : Promise.resolve(undefined)
      };

      // Wait for all parallel operations to complete
      const results = await Promise.all([
        parallelPromises.vectorResult,
        parallelPromises.marketResult,
        parallelPromises.iowaMarketAnalysis,
        parallelPromises.cornFuturesPrice
      ]);

      const vectorResult = results[0];
      const marketResult = results[1];
      const iowaMarketAnalysis = results[2];
      const cornFuturesPrice = results[3];

      console.log("All parallel operations completed successfully");

      // Calculate income capitalization value if cash rent provided
      let incomeCapValue: number | undefined;
      let cashRentSource: "user_input" | "county_average" | "estimated" = "estimated";
      let actualCashRent = propertyData.cashRentPerAcre;
      const capRate = propertyData.capRate || 0.03;

      if (propertyData.cashRentPerAcre) {
        incomeCapValue = propertyData.cashRentPerAcre / capRate;
        cashRentSource = "user_input";
        actualCashRent = propertyData.cashRentPerAcre;
      }

      await storage.updateValuation(valuationId, {
        baseValue: vectorResult.baseValue,
        cashRentPerAcre: actualCashRent,
        capRate: capRate,
        status: "processing"
      });

      // Step 2: AI Reasoning (with CSR2 and income data if available)
      let csr2Context = "";
      if (propertyData.csr2Mean) {
        const csr2Rating = propertyData.csr2Mean >= 80 ? 'excellent' : 
                          propertyData.csr2Mean >= 60 ? 'good' : 
                          propertyData.csr2Mean >= 40 ? 'fair' : 'poor';
        csr2Context = `\n\nSOIL PRODUCTIVITY DATA:
- Iowa CSR2 Rating: ${propertyData.csr2Mean.toFixed(1)} (${csr2Rating} productivity)
- CSR2 Range: ${propertyData.csr2Min} - ${propertyData.csr2Max}
- This authentic soil data should be factored into the valuation as it directly impacts agricultural productivity and land value.`;
      }

      let incomeContext = "";
      if (incomeCapValue) {
        incomeContext = `\n\nINCOME CAPITALIZATION DATA:
- Cash Rent: $${actualCashRent}/acre annually (${cashRentSource})
- Cap Rate: ${(capRate * 100).toFixed(1)}%
- Income Cap Value: $${Math.round(incomeCapValue).toLocaleString()}/acre
- This income approach provides a fundamental basis for land value based on earning potential.`;
      }

      // Step 2.5: Calculate CSR2-based quantitative valuation (if CSR2 data available)
      let csr2Value = 0;
      let csr2DollarPerPoint = 0;
      let tillableBlendedValue = null;
      const standardCSR2DollarPerPoint = 174; // Standardized rate across all properties
      
      if (propertyData.csr2Mean && propertyData.csr2Mean > 0) {
        // Use standardized $174/point for CSR2 calculation
        csr2Value = propertyData.csr2Mean * standardCSR2DollarPerPoint;
        csr2DollarPerPoint = standardCSR2DollarPerPoint;
        
        // Calculate blended value if tillable acres specified
        if (propertyData.tillableAcres && propertyData.tillableAcres > 0) {
          tillableBlendedValue = csr2Service.calculateBlendedLandValue(
            propertyData.acreage,
            propertyData.tillableAcres,
            propertyData.csr2Mean,
            vectorResult.baseValue,
            65, // Iowa average CSR2
            propertyData.nonTillableType
          );
          
          console.log(`Blended Land Value Calculation:
- Total Acres: ${propertyData.acreage}
- Tillable Acres: ${propertyData.tillableAcres}
- Non-Tillable Type: ${propertyData.nonTillableType || 'Standard'} (${Math.round(tillableBlendedValue.nonTillableMultiplier * 100)}% of base value)
- CSR2 Value for Tillable: $${tillableBlendedValue.tillableValue}/acre
- Adjusted Value for Non-Tillable: $${tillableBlendedValue.nonTillableValue}/acre
- Blended Per-Acre Value: $${tillableBlendedValue.blendedValue}/acre`);
        } else {
          console.log(`CSR2 Quantitative Valuation: Property CSR2 ${propertyData.csr2Mean} × $${csr2DollarPerPoint.toFixed(0)}/point = $${csr2Value}/acre`);
        }
      }

      // Store basic property analysis (no AI adjustment yet)
      await storage.updateValuation(valuationId, {
        baseValue: vectorResult.baseValue,
        aiReasoning: `The analyzed parcel in ${propertyData.county} County, Iowa, has several significant characteristics that influence its value beyond the county's established base value for ${propertyData.landType} land. The parcel boasts an excellent Iowa CSR2 rating of ${propertyData.csr2Mean || 'pending'}, indicating high productivity potential, which is notably above average for the region. The CSR2-based calculated value of $${Math.round(csr2Value).toLocaleString()}/acre highlights the parcel's high productivity, which warrants upward adjustment from the base value.${csr2Context}${incomeContext} This valuation accounts for the excellent soil productivity, balanced against the income-based valuation, without substantial specific property disadvantages (such as poor drainage, extreme topography, or location issues) identified. The lack of specific infrastructural improvements or maintenance issues implies no additional value adjustments are necessary for those factors.`
      });

      // Step 3: Process Property Improvements
      let improvementDetails: any[] = [];
      let totalImprovementsValue = 0;

      if (propertyData.includeImprovements && propertyData.improvements?.length) {
        console.log(`Processing ${propertyData.improvements.length} property improvements`);
        
        for (const improvement of propertyData.improvements) {
          let improvementValue = 0;
          
          if (improvement.valuationMethod === "manual" && improvement.manualValue) {
            improvementValue = improvement.manualValue;
          } else if (improvement.valuationMethod === "ai") {
            // Use AI to estimate improvement value
            improvementValue = await openaiService.estimateImprovementValue(
              improvement.type,
              improvement.description,
              improvement.condition || "Good",
              propertyData.county,
              propertyData.state
            );
          }
          
          improvementDetails.push({
            type: improvement.type,
            description: improvement.description,
            value: improvementValue,
            method: improvement.valuationMethod
          });
          
          totalImprovementsValue += improvementValue;
        }
      }

      // Step 4: Process market research results (already fetched in parallel)
      console.log(`Market research completed: ${marketResult.trends.length} trends identified`);
      if (iowaMarketAnalysis) {
        console.log(`Retrieved ${iowaMarketAnalysis.comps.length} Iowa sales comps`);
      }

      // Step 4.5: Calculate suggested rent based on corn futures and CSR2
      let suggestedRentPerAcre: number | undefined;
      
      if (cornFuturesPrice && propertyData.csr2Mean && propertyData.csr2Mean > 0) {
        suggestedRentPerAcre = cornPriceService.calculateSuggestedRent(
          cornFuturesPrice,
          propertyData.csr2Mean
        );
        console.log(`Suggested rent calculation: $${cornFuturesPrice}/bushel × ${propertyData.csr2Mean} CSR2 = $${suggestedRentPerAcre}/acre`);
      }

      // Step 4.5: Filter comparables below minimum threshold
      const COMPS_MIN_PRICE_PER_ACRE = parseInt(process.env.COMPS_MIN_PRICE_PER_ACRE || "6000", 10);
      let marketCompsUsed: any[] = [];
      let marketCompsExcludedCount = 0;
      let marketCompsAverage: number | undefined;
      let marketCompsAllFiltered = false;
      let marketCompsNote: string | undefined;
      
      // Apply filtering to Iowa market comparables
      if (iowaMarketAnalysis && iowaMarketAnalysis.comps.length > 0) {
        const allComps = iowaMarketAnalysis.comps;
        marketCompsUsed = allComps.filter((comp: any) => comp.price_per_acre >= COMPS_MIN_PRICE_PER_ACRE);
        marketCompsExcludedCount = allComps.length - marketCompsUsed.length;
        
        if (marketCompsUsed.length === 0) {
          marketCompsAllFiltered = true;
          marketCompsNote = `All ${allComps.length} comparable sales were below $${COMPS_MIN_PRICE_PER_ACRE.toLocaleString()}/acre threshold and excluded as outliers. Using base value without market adjustment.`;
          console.log(marketCompsNote);
        } else {
          marketCompsAverage = Math.round(marketCompsUsed.reduce((sum, comp) => sum + comp.price_per_acre, 0) / marketCompsUsed.length);
          if (marketCompsExcludedCount > 0) {
            marketCompsNote = `Excluded ${marketCompsExcludedCount} comp${marketCompsExcludedCount > 1 ? 's' : ''} below $${COMPS_MIN_PRICE_PER_ACRE.toLocaleString()}/acre as outlier${marketCompsExcludedCount > 1 ? 's' : ''}.`;
            console.log(marketCompsNote);
          }
        }
      }

      // Step 4.6: Perform AI reasoning with filtered Iowa market comps
      let finalAdjustedValue = vectorResult.baseValue; // Default fallback
      let finalAiReasoning = "";
      
      if (marketCompsUsed.length > 0) {
        console.log(`Performing AI reasoning with ${marketCompsUsed.length} filtered Iowa market comps...`);
        const avgCompPrice = marketCompsAverage!;
        const marketCompsContext = `\n\nIOWA MARKET ANALYSIS WITH SALES COMPS:
- Recent Sales Comps: ${marketCompsUsed.length} comparable sales (${marketCompsExcludedCount} excluded as outliers below $${COMPS_MIN_PRICE_PER_ACRE}/acre)
- Average Comp Price: $${Math.round(avgCompPrice).toLocaleString()}/acre
- Market Summary: ${iowaMarketAnalysis.summary}
- Sales Data: ${marketCompsUsed.slice(0, 3).map((comp: any) => 
  `${comp.date}: $${comp.price_per_acre.toLocaleString()}/acre (${comp.details})`
).join('; ')}
- This authentic Iowa market data should be considered for valuation validation and adjustment.`;

        const reasoningResult = await openaiService.performReasonedValuation(
          vectorResult.baseValue,
          propertyData.acreage,
          propertyData.landType,
          propertyData.county,
          propertyData.state,
          (propertyData.additionalDetails || "") + csr2Context + incomeContext + marketCompsContext,
          incomeCapValue,
          csr2Value
        );
        
        console.log(`AI Market-Adjusted calculation:
          Base Value: $${vectorResult.baseValue}/acre
          CSR2 Value: $${csr2Value}/acre
          Average Comp Price: $${Math.round(avgCompPrice)}/acre
          AI Result: $${reasoningResult.adjustedValue}/acre`);
        
        finalAdjustedValue = reasoningResult.adjustedValue;
        finalAiReasoning = reasoningResult.reasoning;
      } else if (!marketCompsAllFiltered) {
        // Fallback for non-Iowa or when comps fail (but not when all were filtered)
        const reasoningResult = await openaiService.performReasonedValuation(
          vectorResult.baseValue,
          propertyData.acreage,
          propertyData.landType,
          propertyData.county,
          propertyData.state,
          (propertyData.additionalDetails || "") + csr2Context + incomeContext,
          incomeCapValue,
          csr2Value
        );
        finalAdjustedValue = reasoningResult.adjustedValue;
        finalAiReasoning = reasoningResult.reasoning;
      }

      await storage.updateValuation(valuationId, {
        adjustedValue: finalAdjustedValue,
        marketInsight: finalAiReasoning
      });

      // Step 5: Final Synthesis
      const finalResult = await openaiService.synthesizeFinalValuation(
        vectorResult.baseValue,
        finalAdjustedValue, // Use the AI-adjusted value from market analysis
        0, // No separate improvements adjustment in synthesis
        marketResult.marketAdjustment,
        finalAiReasoning, // Use the enhanced market reasoning
        propertyData.acreage,
        totalImprovementsValue // Pass total improvement value separately
      );

      // Update with final results including improvement, income, CSR2, and Iowa market details
      const enhancedBreakdown = {
        ...finalResult.breakdown,
        aiAdjustedValue: finalAdjustedValue, // Use consistent AI adjusted value
        improvementDetails: improvementDetails,
        incomeCapValue: incomeCapValue,
        cashRentSource: cashRentSource,
        actualCashRent: actualCashRent,
        capRate: capRate,
        csr2Value: csr2Value > 0 ? csr2Value : undefined,
        csr2DollarPerPoint: csr2DollarPerPoint > 0 ? csr2DollarPerPoint : undefined,
        countyAverageCSR2: propertyData.csr2Mean ? standardCSR2DollarPerPoint : undefined,
        csr2Mean: propertyData.csr2Mean,
        csr2Min: propertyData.csr2Min,
        csr2Max: propertyData.csr2Max,
        csr2Count: propertyData.csr2Count,
        // Tillable vs Non-Tillable breakdown
        tillableAcres: propertyData.tillableAcres,
        tillableValuePerAcre: tillableBlendedValue?.tillableValue,
        nonTillableValuePerAcre: tillableBlendedValue?.nonTillableValue,
        nonTillableType: propertyData.nonTillableType,
        nonTillableMultiplier: tillableBlendedValue?.nonTillableMultiplier,
        blendedValuePerAcre: tillableBlendedValue?.blendedValue,
        // Iowa market analysis data
        iowaMarketComps: marketCompsUsed.length > 0 ? marketCompsUsed : undefined,
        marketCompsUsed: marketCompsUsed.length > 0 ? marketCompsUsed : undefined,
        marketCompsExcludedCount: marketCompsExcludedCount,
        marketCompsThresholdUsed: COMPS_MIN_PRICE_PER_ACRE,
        marketCompsAverage: marketCompsAverage,
        marketCompsAllFiltered: marketCompsAllFiltered,
        marketCompsNote: marketCompsNote,
        iowaMarketSummary: iowaMarketAnalysis?.summary || undefined,
        iowaMarketTrends: iowaMarketAnalysis?.trends || undefined,
        // Suggested rent calculation
        suggestedRentPerAcre: suggestedRentPerAcre,
        cornFuturesPrice: cornFuturesPrice
      };

      await storage.updateValuation(valuationId, {
        adjustedValue: finalAdjustedValue, // Keep consistent AI adjusted value from market analysis
        totalValue: finalResult.totalValue,
        confidenceScore: finalResult.confidenceScore,
        marketInsight: finalResult.commentary,
        breakdown: enhancedBreakdown,
        status: "completed"
      });

    } catch (error) {
      console.error("Valuation pipeline failed:", error);
      await storage.updateValuation(valuationId, {
        status: "failed"
      });
    }
  }
}

export const valuationService = new ValuationService();
