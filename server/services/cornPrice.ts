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
      // Price is in cents per bushel, convert to dollars
      const priceInDollars = quote.regularMarketPrice / 100;
      return Number(priceInDollars.toFixed(2));
    }
    
    return null;
  } catch (error) {
    console.error('Failed to fetch corn futures price:', error);
    return null;
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