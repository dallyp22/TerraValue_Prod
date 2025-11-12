import { auctionScraperService } from './auctionScraper';
import { db } from '../db';
import { scraperSettings } from '@shared/schema';
import { eq } from 'drizzle-orm';

export class AutomaticScraperService {
  private intervalId: NodeJS.Timeout | null = null;
  private checkInterval = 60000; // Check every minute
  private isRunning = false;
  
  /**
   * Start the automatic scraper service
   * Checks every minute if it's time to run based on schedule settings
   */
  async start() {
    console.log('🤖 Starting Automatic Scraper Service');
    
    // Check settings and run if needed
    await this.checkAndRun();
    
    // Check every minute if it's time to run
    this.intervalId = setInterval(() => {
      this.checkAndRun();
    }, this.checkInterval);
    
    console.log('   Checking schedule every minute...');
  }
  
  /**
   * Check if it's time to run and execute scraper if needed
   */
  async checkAndRun() {
    if (this.isRunning) {
      return; // Already running, skip
    }
    
    try {
      const settings = await this.getSettings();
      
      if (!settings.enabled) {
        return; // Automatic scraping disabled
      }
      
      const now = new Date();
      const [hours, minutes] = settings.scheduleTime.split(':').map(Number);
      
      // Check if it's the scheduled time (within current minute)
      if (now.getHours() === hours && now.getMinutes() === minutes) {
        // Check if we already ran in the last 2 hours (prevent duplicate runs)
        if (settings.lastRun) {
          const hoursSinceLastRun = (now.getTime() - new Date(settings.lastRun).getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastRun < 2) {
            return; // Already ran recently
          }
        }
        
        console.log(`\n🚀 Scheduled scrape triggered (${settings.cadence} at ${settings.scheduleTime})`);
        await this.runScraper();
      }
    } catch (error) {
      console.error('Error checking scraper schedule:', error);
    }
  }
  
  /**
   * Execute the scraper and update schedule
   */
  async runScraper() {
    this.isRunning = true;
    
    try {
      const now = new Date();
      const settings = await this.getSettings();
      
      // Update last run time
      await this.updateSettings({ lastRun: now });
      
      console.log('   Starting auction scrape...');
      
      // Run the scraper
      const results = await auctionScraperService.scrapeAllSources();
      
      console.log(`   ✅ Scheduled scrape complete: ${results.length} auctions processed`);
      
      // Calculate next run based on cadence
      const nextRun = this.calculateNextRun(now, settings.cadence, settings.scheduleTime);
      await this.updateSettings({ nextRun });
      
      console.log(`   Next scheduled scrape: ${nextRun.toLocaleString()}\n`);
      
    } catch (error) {
      console.error('   ❌ Scheduled scrape failed:', error);
    } finally {
      this.isRunning = false;
    }
  }
  
  /**
   * Calculate next run time based on cadence
   */
  private calculateNextRun(from: Date, cadence: string, scheduleTime: string): Date {
    const [hours, minutes] = scheduleTime.split(':').map(Number);
    const next = new Date(from);
    
    // Add days based on cadence
    if (cadence === 'daily') {
      next.setDate(next.getDate() + 1);
    } else if (cadence === 'every-other-day') {
      next.setDate(next.getDate() + 2);
    } else if (cadence === 'weekly') {
      next.setDate(next.getDate() + 7);
    } else {
      // Manual - don't schedule next run
      return next;
    }
    
    // Set to scheduled time
    next.setHours(hours, minutes, 0, 0);
    
    return next;
  }
  
  /**
   * Get current schedule settings (creates default if doesn't exist)
   */
  async getSettings() {
    let settings = await db.query.scraperSettings.findFirst();
    
    // Create default settings if doesn't exist
    if (!settings) {
      await db.insert(scraperSettings).values({
        enabled: false,
        cadence: 'daily',
        scheduleTime: '00:00'
      });
      settings = await db.query.scraperSettings.findFirst();
    }
    
    return settings!;
  }
  
  /**
   * Update schedule settings
   */
  async updateSettings(updates: Partial<typeof scraperSettings.$inferInsert>) {
    const current = await this.getSettings();
    
    await db.update(scraperSettings)
      .set({ 
        ...updates, 
        updatedAt: new Date() 
      })
      .where(eq(scraperSettings.id, current.id));
    
    console.log('🤖 Scraper schedule updated:', updates);
  }
  
  /**
   * Stop the automatic scraper service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🤖 Automatic Scraper Service stopped');
    }
  }
  
  /**
   * Manually trigger a scrape now (used by UI button)
   */
  async triggerNow() {
    if (this.isRunning) {
      throw new Error('Scraper is already running');
    }
    
    return this.runScraper();
  }
}

export const automaticScraperService = new AutomaticScraperService();

