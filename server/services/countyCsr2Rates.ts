import { db } from '../db';
import { countyCsr2Rates } from '@shared/schema';
import { eq } from 'drizzle-orm';
import NodeCache from 'node-cache';

// Cache county rates for 1 hour. checkperiod: 0 disables internal setTimeout
// so this module loads cleanly in Workers (lazy expiry on access).
const rateCache = new NodeCache({ stdTTL: 3600, checkperiod: 0 });
const CACHE_KEY = 'all_county_rates';
const DEFAULT_RATE = 174; // Fallback rate if county not found

export class CountyCsr2RateService {
  
  /**
   * Get CSR2 rate for a specific county
   * Returns rate in dollars per CSR2 point
   */
  async getCountyRate(countyName: string): Promise<number> {
    if (!countyName) {
      console.warn('No county provided, using default rate');
      return DEFAULT_RATE;
    }
    
    // Normalize county name (title case, trim whitespace)
    const normalizedCounty = this.normalizeCountyName(countyName);
    
    try {
      // Check cache first
      const cachedRates = rateCache.get<Record<string, number>>(CACHE_KEY);
      if (cachedRates && cachedRates[normalizedCounty]) {
        return cachedRates[normalizedCounty];
      }
      
      // Query database
      const rate = await db.query.countyCsr2Rates.findFirst({
        where: eq(countyCsr2Rates.county, normalizedCounty),
        columns: {
          csr2Price: true
        }
      });
      
      if (rate) {
        // Update cache
        await this.refreshCache();
        return rate.csr2Price;
      }
      
      console.warn(`County '${normalizedCounty}' not found in rates table, using default rate`);
      return DEFAULT_RATE;
      
    } catch (error) {
      console.error(`Error fetching county rate for ${normalizedCounty}:`, error);
      return DEFAULT_RATE;
    }
  }
  
  /**
   * Get all county rates
   * Returns array sorted by county name
   */
  async getAllRates(): Promise<Array<{
    id: number;
    county: string;
    region: string;
    csr2Price: number;
    effectiveDate: Date;
    updatedAt: Date;
    notes: string | null;
  }>> {
    try {
      const rates = await db.query.countyCsr2Rates.findMany({
        orderBy: (countyCsr2Rates, { asc }) => [asc(countyCsr2Rates.county)]
      });
      
      return rates;
    } catch (error) {
      console.error('Error fetching all county rates:', error);
      return [];
    }
  }
  
  /**
   * Update rate for a specific county
   */
  async updateCountyRate(
    countyName: string, 
    newRate: number, 
    notes?: string
  ): Promise<boolean> {
    const normalizedCounty = this.normalizeCountyName(countyName);
    
    try {
      await db.update(countyCsr2Rates)
        .set({
          csr2Price: newRate,
          updatedAt: new Date(),
          ...(notes && { notes })
        })
        .where(eq(countyCsr2Rates.county, normalizedCounty));
      
      // Clear cache to force refresh
      rateCache.del(CACHE_KEY);
      console.log(`✅ Updated CSR2 rate for ${normalizedCounty} to $${newRate}/point`);
      
      return true;
    } catch (error) {
      console.error(`Error updating county rate for ${normalizedCounty}:`, error);
      return false;
    }
  }
  
  /**
   * Bulk update multiple county rates
   */
  async bulkUpdateRates(updates: Array<{
    county: string;
    csr2Price: number;
    notes?: string;
  }>): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;
    
    for (const update of updates) {
      const result = await this.updateCountyRate(
        update.county,
        update.csr2Price,
        update.notes
      );
      
      if (result) {
        success++;
      } else {
        failed++;
      }
    }
    
    return { success, failed };
  }
  
  /**
   * Get default fallback rate
   */
  getDefaultRate(): number {
    return DEFAULT_RATE;
  }
  
  /**
   * Normalize county name for consistent matching
   * Handles: "Story County" → "Story", "story" → "Story", " Story " → "Story"
   */
  private normalizeCountyName(countyName: string): string {
    return countyName
      .replace(/\s+county\s*$/i, '') // Remove " County" suffix
      .trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  
  /**
   * Refresh the cache with all county rates
   */
  private async refreshCache(): Promise<void> {
    try {
      const rates = await db.query.countyCsr2Rates.findMany({
        columns: {
          county: true,
          csr2Price: true
        }
      });
      
      const rateMap: Record<string, number> = {};
      rates.forEach(rate => {
        rateMap[rate.county] = rate.csr2Price;
      });
      
      rateCache.set(CACHE_KEY, rateMap);
    } catch (error) {
      console.error('Error refreshing county rates cache:', error);
    }
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      keys: rateCache.keys().length,
      stats: rateCache.getStats()
    };
  }
  
  /**
   * Clear the cache (useful for testing/admin)
   */
  clearCache(): void {
    rateCache.flushAll();
    console.log('County rates cache cleared');
  }
}

export const countyCsr2RateService = new CountyCsr2RateService();

