import yahooFinance from 'yahoo-finance2';

/**
 * Get current December corn futures price
 * Ticker: ZC=F represents CBOT corn futures
 */
export async function getCornFuturesPrice(): Promise<number | null> {
  try {
    // Get quote for corn futures
    const quote = await yahooFinance.quote('ZC=F');
    
    if (quote && quote.regularMarketPrice) {
      let priceInDollars = quote.regularMarketPrice;
      
      // Yahoo Finance returns corn futures in cents per bushel
      // Prices > 100 are clearly in cents (corn is typically $3-8/bushel = 300-800 cents)
      if (priceInDollars > 100) {
        priceInDollars = priceInDollars / 100;
      }
      
      console.log(`🌽 Corn futures price: $${priceInDollars.toFixed(2)}/bushel (raw: ${quote.regularMarketPrice})`);
      return Number(priceInDollars.toFixed(2));
    }
    
    // Fallback to a reasonable default if API fails
    console.log('⚠️ Corn price unavailable, using fallback $4.50/bushel');
    return 4.50;
  } catch (error) {
    console.error('Failed to fetch corn futures price:', error);
    // Return fallback price instead of null to ensure rent calculation works
    console.log('⚠️ Corn price error, using fallback $4.50/bushel');
    return 4.50;
  }
}

/**
 * Calculate suggested rent per acre based on corn price and CSR2
 * Formula: Corn Price ($/bushel) × CSR2 = Suggested Rent per Acre
 */
export function calculateSuggestedRent(cornPrice: number, csr2: number): number {
  if (!cornPrice || !csr2 || cornPrice <= 0 || csr2 <= 0) {
    return 0;
  }
  
  // Simple formula: Corn price × CSR2
  const suggestedRent = cornPrice * csr2;
  
  return Math.round(suggestedRent * 100) / 100; // Round to 2 decimal places
}

export const cornPriceService = {
  getCornFuturesPrice,
  calculateSuggestedRent
};