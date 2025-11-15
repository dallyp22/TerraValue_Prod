import type { Auction } from '@shared/schema';
import { format } from 'date-fns';

/**
 * Helper functions to get standardized auction display data
 * Prefers enriched AI-processed data, falls back to original scraped data
 */

/**
 * Generate a standardized title format: "{Acreage} Acres {County} County"
 */
function generateStandardizedTitle(auction: Auction): string {
  const acreage = auction.acreage;
  const county = auction.county;
  const state = auction.state;

  if (acreage && county) {
    // Format acreage
    const acreageStr = Number.isInteger(acreage) 
      ? acreage.toString() 
      : acreage.toFixed(2).replace(/\.?0+$/, ''); // Remove trailing zeros
    
    // Build title
    if (state && state !== 'Iowa') {
      return `${acreageStr} Acres ${county} County, ${state}`;
    }
    return `${acreageStr} Acres ${county} County`;
  }
  
  if (county) {
    return `${county} County Land Auction`;
  }
  
  return 'Land Auction';
}

export function getAuctionTitle(auction: Auction): string {
  // Prefer AI-enriched title
  if (auction.enrichedTitle) {
    return auction.enrichedTitle;
  }
  
  // Generate standardized title from available data
  if (auction.acreage || auction.county) {
    return generateStandardizedTitle(auction);
  }
  
  // Last resort: use original title
  return auction.title || 'Untitled Auction';
}

export function getAuctionDescription(auction: Auction): string {
  return auction.enrichedDescription || auction.description || '';
}

export function getAuctionHouse(auction: Auction): string | null {
  return auction.enrichedAuctionHouse || auction.auctioneer || auction.sourceWebsite || null;
}

export function getAuctionDate(auction: Auction): Date | null {
  if (auction.enrichedAuctionDate) {
    return new Date(auction.enrichedAuctionDate);
  }
  if (auction.auctionDate) {
    return new Date(auction.auctionDate);
  }
  return null;
}

export function getFormattedAuctionDate(auction: Auction): string {
  const date = getAuctionDate(auction);
  if (!date) return 'Date TBD';
  
  try {
    return format(date, 'MMM dd, yyyy');
  } catch {
    return 'Date TBD';
  }
}

export function getAuctionLocation(auction: Auction): string | null {
  return auction.enrichedAuctionLocation || null;
}

export function getPropertyLocation(auction: Auction): string | null {
  return auction.enrichedPropertyLocation || auction.address || null;
}

export function getLegalDescription(auction: Auction): string | null {
  return auction.legalDescription || null;
}

export function getKeyHighlights(auction: Auction): string[] {
  if (auction.keyHighlights && Array.isArray(auction.keyHighlights)) {
    return auction.keyHighlights;
  }
  return [];
}

export function getImprovements(auction: Auction): any[] {
  if (auction.improvements && Array.isArray(auction.improvements)) {
    return auction.improvements;
  }
  return [];
}

export function getUtilities(auction: Auction): any | null {
  return auction.utilities || null;
}

export function getSoilMentions(auction: Auction): string | null {
  return auction.soilMentions || null;
}

export function getCropHistory(auction: Auction): string | null {
  return auction.cropHistory || null;
}

export function getTillablePercent(auction: Auction): number | null {
  return auction.tillablePercent || null;
}

export function getGeocodingInfo(auction: Auction): {
  method: string | null;
  confidence: number | null;
  source: string | null;
} {
  return {
    method: auction.geocodingMethod || null,
    confidence: auction.geocodingConfidence || null,
    source: auction.geocodingSource || null
  };
}

export function isEnriched(auction: Auction): boolean {
  return auction.enrichmentStatus === 'completed';
}

export function getEnrichmentStatus(auction: Auction): {
  status: string;
  isEnriched: boolean;
  isPending: boolean;
  isFailed: boolean;
  error: string | null;
} {
  const status = auction.enrichmentStatus || 'pending';
  return {
    status,
    isEnriched: status === 'completed',
    isPending: status === 'pending',
    isFailed: status === 'failed',
    error: auction.enrichmentError || null
  };
}

/**
 * Get comprehensive property details for display
 */
export function getPropertyDetails(auction: Auction): {
  tillablePercent: number | null;
  soilMentions: string | null;
  cropHistory: string | null;
  improvements: any[];
  utilities: any | null;
  roadAccess: string | null;
  drainage: string | null;
  crpDetails: string | null;
  waterRights: string | null;
  mineralRights: string | null;
  zoningInfo: string | null;
  taxInfo: string | null;
  sellerMotivation: string | null;
  financingOptions: string | null;
  possession: string | null;
} {
  return {
    tillablePercent: auction.tillablePercent || null,
    soilMentions: auction.soilMentions || null,
    cropHistory: auction.cropHistory || null,
    improvements: getImprovements(auction),
    utilities: auction.utilities || null,
    roadAccess: auction.roadAccess || null,
    drainage: auction.drainage || null,
    crpDetails: auction.crpDetails || null,
    waterRights: auction.waterRights || null,
    mineralRights: auction.mineralRights || null,
    zoningInfo: auction.zoningInfo || null,
    taxInfo: auction.taxInfo || null,
    sellerMotivation: auction.sellerMotivation || null,
    financingOptions: auction.financingOptions || null,
    possession: auction.possession || null
  };
}

/**
 * Get all available information for comprehensive display
 */
export function getComprehensiveAuctionData(auction: Auction) {
  return {
    // Core information
    title: getAuctionTitle(auction),
    description: getAuctionDescription(auction),
    auctionHouse: getAuctionHouse(auction),
    auctionDate: getAuctionDate(auction),
    formattedDate: getFormattedAuctionDate(auction),
    
    // Locations
    auctionLocation: getAuctionLocation(auction),
    propertyLocation: getPropertyLocation(auction),
    legalDescription: getLegalDescription(auction),
    
    // Basic property info
    acreage: auction.acreage || null,
    landType: auction.landType || null,
    county: auction.county || null,
    state: auction.state || null,
    
    // Highlights and features
    keyHighlights: getKeyHighlights(auction),
    propertyDetails: getPropertyDetails(auction),
    
    // Geocoding
    geocoding: getGeocodingInfo(auction),
    coordinates: auction.latitude && auction.longitude ? {
      latitude: auction.latitude,
      longitude: auction.longitude
    } : null,
    
    // Enrichment status
    enrichment: getEnrichmentStatus(auction),
    
    // Source and metadata
    sourceWebsite: auction.sourceWebsite,
    url: auction.url,
    status: auction.status || 'active'
  };
}

