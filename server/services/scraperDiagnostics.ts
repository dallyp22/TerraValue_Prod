import * as fs from 'fs';
import * as path from 'path';
import type { ScraperStats } from './auctionScraper.js';

/**
 * Scraper Diagnostics Service
 * 
 * Manages logging and analysis of scraper statistics to track:
 * - Coverage metrics per source
 * - Missing Iowa auctions
 * - Performance trends
 * - Anomaly detection
 */

const LOGS_DIR = path.join(process.cwd(), 'logs');
const DIAGNOSTICS_LOG = path.join(LOGS_DIR, 'scraper-diagnostics.jsonl');
const MISSING_AUCTIONS_LOG = path.join(LOGS_DIR, 'missing-auctions.jsonl');

// Ensure logs directory exists
function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

export interface MissingAuction {
  timestamp: string;
  source: string;
  url: string;
  reason: 'not_processed' | 'scrape_failed' | 'save_failed';
  is_iowa: boolean;
  discovered_in_scrape_id: string;
}

export interface CoverageMetrics {
  source: string;
  discovered: number;
  saved: number;
  coverage_percentage: number;
  iowa_discovered: number;
  iowa_saved: number;
  iowa_coverage_percentage: number;
  missing_count: number;
  failed_scrapes: number;
  failed_saves: number;
  duration_seconds: number;
}

export class ScraperDiagnosticsService {
  /**
   * Log scraper stats to JSONL file
   */
  logStats(stats: ScraperStats[]): void {
    ensureLogsDir();
    
    for (const stat of stats) {
      const logLine = JSON.stringify(stat) + '\n';
      fs.appendFileSync(DIAGNOSTICS_LOG, logLine);
    }
  }

  /**
   * Log missing auctions
   */
  logMissingAuctions(stats: ScraperStats[]): void {
    ensureLogsDir();
    
    for (const stat of stats) {
      // Log URLs that weren't processed (not_processed)
      for (const url of stat.missingUrls) {
        const isIowa = this.isIowaUrl(url);
        const missing: MissingAuction = {
          timestamp: new Date().toISOString(),
          source: stat.sourceName,
          url,
          reason: 'not_processed',
          is_iowa: isIowa,
          discovered_in_scrape_id: stat.scrapeId
        };
        
        const logLine = JSON.stringify(missing) + '\n';
        fs.appendFileSync(MISSING_AUCTIONS_LOG, logLine);
      }
    }
  }

  /**
   * Calculate coverage metrics from stats
   */
  calculateCoverageMetrics(stats: ScraperStats[]): CoverageMetrics[] {
    return stats.map(stat => {
      const coverage = stat.discoveredUrls > 0
        ? Math.round((stat.successfulSaves / stat.discoveredUrls) * 100)
        : 0;
      
      const iowaCoverage = stat.iowaDiscovered > 0
        ? Math.round((stat.iowaSaved / stat.iowaDiscovered) * 100)
        : 0;
      
      return {
        source: stat.sourceName,
        discovered: stat.discoveredUrls,
        saved: stat.successfulSaves,
        coverage_percentage: coverage,
        iowa_discovered: stat.iowaDiscovered,
        iowa_saved: stat.iowaSaved,
        iowa_coverage_percentage: iowaCoverage,
        missing_count: stat.missingUrls.length,
        failed_scrapes: stat.failedScrapes,
        failed_saves: stat.failedSaves,
        duration_seconds: Math.round(stat.duration / 1000)
      };
    });
  }

  /**
   * Get latest scrape stats from log
   */
  getLatestScrapeStats(limit: number = 24): ScraperStats[] {
    ensureLogsDir();
    
    if (!fs.existsSync(DIAGNOSTICS_LOG)) {
      return [];
    }
    
    const lines = fs.readFileSync(DIAGNOSTICS_LOG, 'utf-8')
      .trim()
      .split('\n')
      .filter(line => line.length > 0);
    
    if (lines.length === 0) {
      return [];
    }
    
    // Get the last scrape ID
    const lastLine = lines[lines.length - 1];
    const lastStat = JSON.parse(lastLine) as ScraperStats;
    const lastScrapeId = lastStat.scrapeId;
    
    // Get all stats from the last scrape
    const stats: ScraperStats[] = [];
    for (let i = lines.length - 1; i >= 0 && stats.length < limit; i--) {
      const stat = JSON.parse(lines[i]) as ScraperStats;
      if (stat.scrapeId === lastScrapeId) {
        stats.unshift(stat);
      } else {
        break;
      }
    }
    
    return stats;
  }

  /**
   * Get historical stats for trend analysis
   */
  getHistoricalStats(days: number = 7): ScraperStats[] {
    ensureLogsDir();
    
    if (!fs.existsSync(DIAGNOSTICS_LOG)) {
      return [];
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const lines = fs.readFileSync(DIAGNOSTICS_LOG, 'utf-8')
      .trim()
      .split('\n')
      .filter(line => line.length > 0);
    
    const stats: ScraperStats[] = [];
    
    for (const line of lines) {
      const stat = JSON.parse(line) as ScraperStats;
      const statDate = new Date(stat.timestamp);
      
      if (statDate >= cutoffDate) {
        stats.push(stat);
      }
    }
    
    return stats;
  }

  /**
   * Get missing Iowa auctions
   */
  getMissingIowaAuctions(limit: number = 100): MissingAuction[] {
    ensureLogsDir();
    
    if (!fs.existsSync(MISSING_AUCTIONS_LOG)) {
      return [];
    }
    
    const lines = fs.readFileSync(MISSING_AUCTIONS_LOG, 'utf-8')
      .trim()
      .split('\n')
      .filter(line => line.length > 0);
    
    const missingAuctions: MissingAuction[] = [];
    
    for (let i = lines.length - 1; i >= 0 && missingAuctions.length < limit; i--) {
      const missing = JSON.parse(lines[i]) as MissingAuction;
      if (missing.is_iowa) {
        missingAuctions.push(missing);
      }
    }
    
    return missingAuctions;
  }

  /**
   * Detect anomalies in scraper stats
   */
  detectAnomalies(currentStats: ScraperStats[], historicalStats: ScraperStats[]): string[] {
    const anomalies: string[] = [];
    
    for (const current of currentStats) {
      // Get historical stats for this source
      const sourceHistory = historicalStats.filter(s => s.sourceName === current.sourceName);
      
      if (sourceHistory.length === 0) {
        continue;
      }
      
      // Calculate average discovered URLs
      const avgDiscovered = sourceHistory.reduce((sum, s) => sum + s.discoveredUrls, 0) / sourceHistory.length;
      
      // Alert if discovered count dropped by more than 50%
      if (current.discoveredUrls < avgDiscovered * 0.5 && avgDiscovered > 5) {
        anomalies.push(
          `${current.sourceName}: Discovered URLs dropped significantly (${current.discoveredUrls} vs avg ${Math.round(avgDiscovered)})`
        );
      }
      
      // Alert if Iowa coverage is low
      if (current.iowaDiscovered > 0 && current.iowaSaved === 0) {
        anomalies.push(
          `${current.sourceName}: Found ${current.iowaDiscovered} Iowa auctions but saved 0!`
        );
      }
      
      // Alert if failure rate is high
      const failureRate = current.processedUrls > 0
        ? (current.failedScrapes + current.failedSaves) / current.processedUrls
        : 0;
      
      if (failureRate > 0.5 && current.processedUrls > 5) {
        anomalies.push(
          `${current.sourceName}: High failure rate (${Math.round(failureRate * 100)}%)`
        );
      }
    }
    
    return anomalies;
  }

  /**
   * Check if URL is likely an Iowa auction
   */
  private isIowaUrl(url: string): boolean {
    const urlLower = url.toLowerCase();
    return urlLower.includes('-ia') || 
           urlLower.includes('iowa') || 
           urlLower.includes('_ia_') ||
           urlLower.includes('/ia/') ||
           urlLower.includes('/ia-');
  }

  /**
   * Clear old logs (keep last N days)
   */
  cleanupOldLogs(daysToKeep: number = 30): void {
    ensureLogsDir();
    
    if (!fs.existsSync(DIAGNOSTICS_LOG)) {
      return;
    }
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const lines = fs.readFileSync(DIAGNOSTICS_LOG, 'utf-8')
      .trim()
      .split('\n')
      .filter(line => line.length > 0);
    
    const recentLines = lines.filter(line => {
      const stat = JSON.parse(line) as ScraperStats;
      return new Date(stat.timestamp) >= cutoffDate;
    });
    
    fs.writeFileSync(DIAGNOSTICS_LOG, recentLines.join('\n') + '\n');
    
    // Also cleanup missing auctions log
    if (fs.existsSync(MISSING_AUCTIONS_LOG)) {
      const missingLines = fs.readFileSync(MISSING_AUCTIONS_LOG, 'utf-8')
        .trim()
        .split('\n')
        .filter(line => line.length > 0);
      
      const recentMissing = missingLines.filter(line => {
        const missing = JSON.parse(line) as MissingAuction;
        return new Date(missing.timestamp) >= cutoffDate;
      });
      
      fs.writeFileSync(MISSING_AUCTIONS_LOG, recentMissing.join('\n') + '\n');
    }
  }
}

export const scraperDiagnosticsService = new ScraperDiagnosticsService();

