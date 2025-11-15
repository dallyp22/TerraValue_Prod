import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { valuationService } from "./services/valuation.js";
import { csr2Service } from "./services/csr2.js";
import { fieldBoundaryService } from "./services/fieldBoundaries.js";
import { auctionScraperService } from "./services/auctionScraper.js";
import { automaticScraperService } from "./services/automaticScraper.js";
import { soilPropertiesService } from "./services/soilProperties.js";
import { mukeyLookupService } from "./services/mukeyLookup.js";
import { parcelAggregationService } from "./services/parcelAggregation.js";
import { propertyFormSchema, auctions, parcels } from "@shared/schema";
import { db } from "./db.js";
import { and, gte, lte, eq, asc, desc, sql } from "drizzle-orm";
import { getCountyCentroid } from "./services/iowaCountyCentroids.js";
import { generateParcelTile, generateHybridTile, getTileCacheStats, clearTileCache } from "./services/parcelTiles.js";
import { 
  findParcelsAtPoint, 
  getParcelsInBounds, 
  getParcelsByOwner,
  getOwnershipStats,
  searchOwners,
  getTopLandowners,
  findSimilarOwners
} from "./services/parcelOwnership.js";
import { pool } from "./db.js";

// Simple rate limiting middleware
const createRateLimiter = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, { count: number; resetTime: number }>();
  
  return (req: any, res: any, next: any) => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const requestData = requests.get(clientIP);
    
    if (!requestData || now > requestData.resetTime) {
      requests.set(clientIP, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    if (requestData.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: "Too many requests. Please try again later."
      });
    }
    
    requestData.count++;
    next();
  };
};

// Rate limiters for different endpoints
const generalRateLimiter = createRateLimiter(300, 60000); // 300 requests per minute (increased for auctions)
const valuationRateLimiter = createRateLimiter(10, 60000); // 10 valuations per minute

export async function registerRoutes(app: Express): Promise<Server | null> {
  // Health check endpoint (no rate limiting)
  app.get("/api/health", async (req, res) => {
    try {
      // Test database connection
      const dbCheck = await storage.listValuations();
      
      res.json({
        success: true,
        status: "healthy",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        services: {
          database: "connected",
          api: "operational"
        }
      });
    } catch (error) {
      console.error("Health check failed:", error);
      res.status(503).json({
        success: false,
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "development",
        services: {
          database: "error",
          api: "degraded"
        },
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Apply general rate limiting to all API routes EXCEPT tiles
  // Tiles need to be excluded because maps load dozens of tiles simultaneously
  app.use('/api', (req: any, res: any, next: any) => {
    // Skip rate limiting for tile endpoints
    if (req.path.includes('/tiles/')) {
      return next();
    }
    return generalRateLimiter(req, res, next);
  });
  
  // Start valuation process
  const valuationHandler = async (req: any, res: any) => {
    try {
      const validatedData = propertyFormSchema.parse(req.body);
      const valuationId = await valuationService.performValuation(validatedData);
      
      res.json({ 
        success: true, 
        valuationId,
        sessionId: valuationId, // For backward compatibility
        message: "Valuation process started" 
      });
    } catch (error) {
      console.error("Valuation creation failed:", error);
      res.status(400).json({ 
        success: false, 
        message: error instanceof Error ? error.message : "Validation failed" 
      });
    }
  };
  
  app.post("/api/valuations", valuationRateLimiter, valuationHandler);
  app.post("/api/start-valuation", valuationRateLimiter, valuationHandler); // Alias for compatibility

  // Get valuation status and results
  app.get("/api/valuations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid valuation ID" 
        });
      }

      const valuation = await storage.getValuation(id);
      if (!valuation) {
        return res.status(404).json({ 
          success: false, 
          message: "Valuation not found" 
        });
      }

      res.json({
        success: true,
        valuation
      });
    } catch (error) {
      console.error("Failed to get valuation:", error);
      res.status(500).json({ 
        success: false, 
        message: "Internal server error" 
      });
    }
  });

  // List all valuations
  app.get("/api/valuations", async (req, res) => {
    try {
      const valuations = await storage.listValuations();
      res.json({
        success: true,
        valuations
      });
    } catch (error) {
      console.error("Failed to list valuations:", error);
      res.status(500).json({ 
        success: false, 
        message: "Internal server error" 
      });
    }
  });

  // CSR2 polygon statistics
  app.post("/api/csr2/polygon", async (req, res) => {
    try {
      const { wkt } = req.body;
      
      if (!wkt || typeof wkt !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Valid WKT geometry is required"
        });
      }

      // Validate WKT format
      const wktRegex = /^(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\s*\(.+\)$/i;
      if (!wktRegex.test(wkt)) {
        return res.status(400).json({
          success: false,
          message: "Invalid WKT geometry format"
        });
      }

      const stats = await csr2Service.getCsr2PolygonStats(wkt);
      res.json({
        success: true,
        ...stats
      });
    } catch (error) {
      console.error("CSR2 polygon stats error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch CSR2 data"
      });
    }
  });

  // Geocode address to coordinates
  app.post("/api/geocode", async (req, res) => {
    try {
      const { address } = req.body;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Address is required"
        });
      }

      const coordinates = await csr2Service.geocodeAddress(address);
      if (!coordinates) {
        return res.status(404).json({
          success: false,
          message: "Address not found"
        });
      }

      res.json({
        success: true,
        ...coordinates
      });
    } catch (error) {
      console.error("Geocoding error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to geocode address"
      });
    }
  });

  // Get CSR2 for a circular area around coordinates
  app.post("/api/csr2/point", async (req, res) => {
    try {
      const { latitude, longitude, radiusMeters = 500 } = req.body;
      
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({
          success: false,
          message: "Valid latitude and longitude are required"
        });
      }

      const wkt = csr2Service.createCircularPolygon(latitude, longitude, radiusMeters);
      const stats = await csr2Service.getCsr2PolygonStats(wkt);
      
      res.json({
        success: true,
        wkt,
        ...stats
      });
    } catch (error) {
      console.error("CSR2 point stats error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch CSR2 data"
      });
    }
  });

  // Average CSR2 calculation for custom polygons
  app.post("/api/average-csr2", async (req, res) => {
    try {
      const { polygon } = req.body;
      
      if (!polygon || !polygon.coordinates) {
        return res.status(400).json({
          success: false,
          message: "Valid polygon geometry is required"
        });
      }

      // Convert GeoJSON polygon to WKT
      let wkt = '';
      if (polygon.type === 'Polygon') {
        const coords = polygon.coordinates[0].map((c: number[]) => `${c[0]} ${c[1]}`).join(', ');
        wkt = `POLYGON((${coords}))`;
      } else if (polygon.type === 'MultiPolygon') {
        const polys = polygon.coordinates.map((poly: number[][][]) => {
          const coords = poly[0].map((c: number[]) => `${c[0]} ${c[1]}`).join(', ');
          return `((${coords}))`;
        }).join(', ');
        wkt = `MULTIPOLYGON(${polys})`;
      } else {
        return res.status(400).json({
          success: false,
          message: "Polygon must be of type Polygon or MultiPolygon"
        });
      }

      console.log(`📐 Processing polygon CSR2 query, WKT length: ${wkt.length}`);

      // Use getCsr2PolygonStats which handles polygon queries properly
      const stats = await csr2Service.getCsr2PolygonStats(wkt);
      
      res.json({
        success: true,
        average: stats.mean || 0,
        ...stats
      });
    } catch (error) {
      console.error("Average CSR2 calculation error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to calculate average CSR2"
      });
    }
  });

  // Validate and fix auction county mismatches
  app.post("/api/auctions/validate-counties", async (req, res) => {
    try {
      // Get all auctions with coordinates
      const allAuctions = await db.query.auctions.findMany({
        where: sql`latitude IS NOT NULL AND longitude IS NOT NULL`
      });

      let validated = 0;
      let fixed = 0;
      const mismatches = [];

      for (const auction of allAuctions) {
        if (!auction.latitude || !auction.longitude) continue;
        
        try {
          // Reverse geocode to get actual county from coordinates
          const location = await csr2Service.reverseGeocode(auction.latitude, auction.longitude);
          
          if (location?.county && auction.county && location.county !== auction.county) {
            console.log(`Mismatch: "${auction.title.substring(0, 40)}"`);
            console.log(`  Stored: ${auction.county}, Geocoded: ${location.county}`);
            
            mismatches.push({
              id: auction.id,
              title: auction.title,
              storedCounty: auction.county,
              geocodedCounty: location.county,
              coordinates: [auction.latitude, auction.longitude]
            });
            
            // Auto-fix: Update to geocoded county (coordinates are more reliable)
            await db.update(auctions)
              .set({ county: location.county })
              .where(eq(auctions.id, auction.id));
            
            fixed++;
          }
          validated++;
        } catch (error) {
          // Skip on error
        }
      }

      res.json({
        success: true,
        validated,
        fixed,
        mismatches: mismatches.length,
        details: mismatches.slice(0, 20) // First 20
      });
    } catch (error) {
      console.error("Failed to validate counties:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  });

  // Get auctions needing date review
  app.get("/api/auctions/needs-review", async (req, res) => {
    try {
      const needsReview = await db.query.auctions.findMany({
        where: eq(auctions.needsDateReview, true),
        orderBy: [desc(auctions.scrapedAt)],
        limit: 100
      });
      
      res.json({ 
        success: true,
        count: needsReview.length,
        auctions: needsReview 
      });
    } catch (error) {
      console.error("Failed to get auctions needing review:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  });

  // Manually set auction date for auctions needing review
  app.post("/api/auctions/:id/set-date", async (req, res) => {
    try {
      const { id } = req.params;
      const { auctionDate } = req.body;
      
      if (!auctionDate) {
        return res.status(400).json({
          success: false,
          message: "auctionDate is required"
        });
      }
      
      const date = new Date(auctionDate);
      if (isNaN(date.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format"
        });
      }
      
      await db.update(auctions)
        .set({
          auctionDate: date,
          needsDateReview: false,
          dateExtractionMethod: 'manual',
          dateExtractionAttempted: new Date()
        })
        .where(eq(auctions.id, parseInt(id)));
      
      res.json({ 
        success: true,
        message: 'Auction date updated successfully'
      });
    } catch (error) {
      console.error("Failed to set auction date:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  });

  // Get source-level statistics
  app.get("/api/auctions/source-stats", async (req, res) => {
    try {
      const stats = await db.execute(sql`
        SELECT 
          source_website,
          COUNT(*) as total_auctions,
          COUNT(*) FILTER (WHERE status = 'active') as active_count,
          COUNT(*) FILTER (WHERE status = 'sold') as sold_count,
          COUNT(*) FILTER (WHERE auction_date IS NOT NULL) as with_dates,
          COUNT(*) FILTER (WHERE auction_date IS NOT NULL AND status = 'active') as active_with_dates,
          ROUND(100.0 * COUNT(*) FILTER (WHERE auction_date IS NOT NULL) / NULLIF(COUNT(*), 0), 1) as date_percentage,
          COUNT(*) FILTER (WHERE needs_date_review = true) as needs_review,
          COUNT(*) FILTER (WHERE auction_date >= NOW() AND status = 'active') as upcoming_count,
          MAX(scraped_at) as last_scraped
        FROM auctions
        GROUP BY source_website
        ORDER BY total_auctions DESC
      `);
      
      res.json({ 
        success: true, 
        stats: stats.rows 
      });
    } catch (error) {
      console.error("Failed to get source stats:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to get source statistics' 
      });
    }
  });

  // Get scraper schedule settings
  app.get("/api/auctions/schedule", async (req, res) => {
    try {
      const settings = await automaticScraperService.getSettings();
      res.json({ success: true, settings });
    } catch (error) {
      console.error("Failed to get schedule settings:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to get schedule settings' 
      });
    }
  });

  // Update scraper schedule settings
  app.post("/api/auctions/schedule", async (req, res) => {
    try {
      const { enabled, cadence, scheduleTime } = req.body;
      
      // Validate inputs
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Invalid enabled value' });
      }
      
      if (cadence && !['daily', 'every-other-day', 'weekly', 'manual'].includes(cadence)) {
        return res.status(400).json({ success: false, message: 'Invalid cadence' });
      }
      
      if (scheduleTime && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(scheduleTime)) {
        return res.status(400).json({ success: false, message: 'Invalid time format' });
      }
      
      const updates: any = { updatedAt: new Date() };
      if (enabled !== undefined) updates.enabled = enabled;
      if (cadence) updates.cadence = cadence;
      if (scheduleTime) updates.scheduleTime = scheduleTime;
      
      // Calculate next run if settings changed
      if (enabled && (cadence || scheduleTime)) {
        const current = await automaticScraperService.getSettings();
        const nextCadence = cadence || current.cadence;
        const nextTime = scheduleTime || current.scheduleTime;
        const now = new Date();
        updates.nextRun = automaticScraperService['calculateNextRun'](now, nextCadence, nextTime);
      }
      
      await automaticScraperService.updateSettings(updates);
      
      res.json({ 
        success: true, 
        message: 'Schedule updated successfully' 
      });
    } catch (error) {
      console.error("Failed to update schedule:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to update schedule' 
      });
    }
  });

  // ===============================
  // Parcel Aggregation API
  // ===============================

  // Get aggregated parcels (combines adjacent parcels with same owner)
  app.get("/api/parcels/aggregated", async (req, res) => {
    try {
      const { minLon, minLat, maxLon, maxLat } = req.query;
      
      if (!minLon || !minLat || !maxLon || !maxLat) {
        return res.status(400).json({
          success: false,
          message: "Bounding box required: minLon, minLat, maxLon, maxLat"
        });
      }
      
      const bbox: [number, number, number, number] = [
        parseFloat(minLon as string),
        parseFloat(minLat as string),
        parseFloat(maxLon as string),
        parseFloat(maxLat as string)
      ];
      
      const aggregated = await parcelAggregationService.aggregateParcels(bbox);
      
      res.json({
        success: true,
        count: aggregated.length,
        type: 'FeatureCollection',
        features: aggregated
      });
    } catch (error) {
      console.error("Parcel aggregation error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to aggregate parcels"
      });
    }
  });

  // ===============================
  // Soil Data API Endpoints
  // ===============================

  // Get soil data by map unit key (mukey)
  app.get("/api/soil/mukey/:mukey", async (req, res) => {
    try {
      const { mukey } = req.params;
      
      if (!mukey) {
        return res.status(400).json({
          success: false,
          message: "Map unit key (mukey) is required"
        });
      }

      const soilData = await soilPropertiesService.getSoilDataByMukey(mukey);
      
      if (!soilData) {
        return res.status(404).json({
          success: false,
          message: "No soil data found for this map unit key"
        });
      }

      res.json({
        success: true,
        data: soilData
      });
    } catch (error) {
      console.error("Soil data query error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch soil data"
      });
    }
  });

  // Get list of all soil series
  app.get("/api/soil/series", async (req, res) => {
    try {
      const series = await soilPropertiesService.getAllSoilSeries();
      
      res.json({
        success: true,
        count: series.length,
        series
      });
    } catch (error) {
      console.error("Soil series query error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to fetch soil series"
      });
    }
  });

  // Search soil components by criteria
  app.post("/api/soil/search", async (req, res) => {
    try {
      const criteria = req.body;
      
      const results = await soilPropertiesService.searchSoilComponents(criteria);
      
      res.json({
        success: true,
        count: results.length,
        results
      });
    } catch (error) {
      console.error("Soil search error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to search soil data"
      });
    }
  });

  // Get mukey (map unit key) for coordinates
  app.get("/api/mukey/point", async (req, res) => {
    try {
      const lon = parseFloat(req.query.lon as string);
      const lat = parseFloat(req.query.lat as string);
      
      if (isNaN(lon) || isNaN(lat)) {
        return res.status(400).json({
          success: false,
          message: "Valid longitude and latitude are required"
        });
      }

      const mukey = await mukeyLookupService.getMukeyForPoint(lon, lat);
      
      if (!mukey) {
        return res.status(404).json({
          success: false,
          message: "No soil map unit found for this location"
        });
      }

      res.json({
        success: true,
        mukey
      });
    } catch (error) {
      console.error("Mukey lookup error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to lookup mukey"
      });
    }
  });

  // Get mukeys for polygon
  app.post("/api/mukey/polygon", async (req, res) => {
    try {
      const { wkt } = req.body;
      
      if (!wkt || typeof wkt !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Valid WKT geometry is required"
        });
      }

      const mukeys = await mukeyLookupService.getMukeysForPolygon(wkt);
      
      res.json({
        success: true,
        count: mukeys.length,
        mukeys
      });
    } catch (error) {
      console.error("Mukey polygon lookup error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to lookup mukeys for polygon"
      });
    }
  });

  // Reverse geocode coordinates to get county and state
  app.post("/api/geocode/reverse", async (req, res) => {
    try {
      const { latitude, longitude } = req.body;
      
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({
          success: false,
          message: "Valid latitude and longitude are required"
        });
      }

      const location = await csr2Service.reverseGeocode(latitude, longitude);
      
      if (!location) {
        return res.json({
          success: true,
          county: null,
          state: null,
          message: "Unable to determine county and state for these coordinates"
        });
      }

      res.json({
        success: true,
        county: location.county,
        state: location.state
      });
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to reverse geocode coordinates"
      });
    }
  });

  // Field boundary search within geographic area
  app.get("/api/fields/search", async (req, res) => {
    try {
      const { minLat, maxLat, minLon, maxLon, limit = 50 } = req.query;
      
      if (!minLat || !maxLat || !minLon || !maxLon) {
        return res.status(400).json({
          success: false,
          message: "Bounding box coordinates (minLat, maxLat, minLon, maxLon) are required"
        });
      }

      const result = await fieldBoundaryService.searchFields(
        parseFloat(minLat as string),
        parseFloat(maxLat as string),
        parseFloat(minLon as string),
        parseFloat(maxLon as string),
        parseInt(limit as string)
      );
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error("Field search error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to search field boundaries"
      });
    }
  });

  // Get specific field boundary by ID
  app.get("/api/fields/:fieldId", async (req, res) => {
    try {
      const { fieldId } = req.params;
      
      const field = await fieldBoundaryService.getFieldById(fieldId);
      if (!field) {
        return res.status(404).json({
          success: false,
          message: "Field not found"
        });
      }

      res.json({
        success: true,
        field
      });
    } catch (error) {
      console.error("Field lookup error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch field data"
      });
    }
  });

  // Find fields near a point
  app.post("/api/fields/nearby", async (req, res) => {
    try {
      const { latitude, longitude, radiusMeters = 100 } = req.body;
      
      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({
          success: false,
          message: "Valid latitude and longitude are required"
        });
      }

      const fields = await fieldBoundaryService.findFieldsNearPoint(
        latitude, 
        longitude, 
        radiusMeters
      );
      
      res.json({
        success: true,
        fields,
        count: fields.length
      });
    } catch (error) {
      console.error("Nearby fields error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to find nearby fields"
      });
    }
  });

  // Get detailed field information
  app.get("/api/fields/:fieldId/details", async (req, res) => {
    try {
      const { fieldId } = req.params;
      
      const details = await fieldBoundaryService.getFieldDetails(fieldId);
      if (!details) {
        return res.status(404).json({
          success: false,
          message: "Field details not found"
        });
      }

      res.json({
        success: true,
        ...details
      });
    } catch (error) {
      console.error("Field details error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch field details"
      });
    }
  });

  // Parcels endpoint using Iowa field boundaries as parcel data
  app.get("/api/parcels", async (req, res) => {
    try {
      const { bounds } = req.query;
      
      if (!bounds || typeof bounds !== 'string') {
        return res.status(400).json({
          success: false,
          message: "Bounds parameter is required (format: minLon,minLat,maxLon,maxLat)"
        });
      }

      const [minLon, minLat, maxLon, maxLat] = bounds.split(',').map(Number);
      
      if ([minLon, minLat, maxLon, maxLat].some(isNaN)) {
        return res.status(400).json({
          success: false,
          message: "Invalid bounds format. Expected: minLon,minLat,maxLon,maxLat"
        });
      }

      // Return empty result for now since field boundary data isn't available in database
      // This allows the map to load without parcel outlines but still support drawing
      const parcels: any[] = [];
      
      res.json({
        type: 'FeatureCollection',
        features: parcels
      });
    } catch (error) {
      console.error("Parcels search error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : "Failed to search parcels"
      });
    }
  });

  // ===== AUCTION ENDPOINTS =====

  // Get all auctions (for diagnostics)
  app.get("/api/auctions/all", async (req, res) => {
    try {
      const allAuctions = await db.query.auctions.findMany({
        orderBy: [desc(auctions.scrapedAt)],
        limit: 500 // Reasonable limit
      });

      // Group by source
      const bySource: {[key: string]: any[]} = {};
      allAuctions.forEach(auction => {
        const source = auction.sourceWebsite || 'Unknown';
        if (!bySource[source]) bySource[source] = [];
        bySource[source].push(auction);
      });

      res.json({
        success: true,
        total: allAuctions.length,
        withCoordinates: allAuctions.filter(a => a.latitude && a.longitude).length,
        withoutCoordinates: allAuctions.filter(a => !a.latitude || !a.longitude).length,
        sources: Object.keys(bySource).length,
        auctions: allAuctions,
        bySource: Object.fromEntries(
          Object.entries(bySource).map(([k, v]) => [k, v.length])
        )
      });
    } catch (error) {
      console.error("Failed to list all auctions:", error);
      res.status(500).json({ 
        success: false, 
        message: "Internal server error" 
      });
    }
  });

  // Get auctions within map bounds
  app.get("/api/auctions", async (req, res) => {
    try {
      const { 
        minLat, maxLat, minLon, maxLon,
        minAcreage, maxAcreage,
        minCSR2, maxCSR2,
        auctionDateRange,
        minValue, maxValue,
        includeWithoutCoords
      } = req.query;
      
      const landTypes = req.query['landTypes[]'];
      const counties = req.query['counties[]'];
      
      if (!minLat || !maxLat || !minLon || !maxLon) {
        return res.status(400).json({
          success: false,
          message: "Bounding box coordinates are required (minLat, maxLat, minLon, maxLon)"
        });
      }

      // Build filter conditions - only filter by coordinates if auction has them
      const conditions = [
        eq(auctions.status, 'active')
      ];

      // Add acreage filters (only if auction has acreage value)
      if (minAcreage) {
        conditions.push(gte(auctions.acreage, parseFloat(minAcreage as string)));
      }
      if (maxAcreage) {
        conditions.push(lte(auctions.acreage, parseFloat(maxAcreage as string)));
      }

      // Note: CSR2 and value filters are applied client-side to include auctions without these values yet

      // Add date range filter
      if (auctionDateRange && auctionDateRange !== 'all') {
        const now = new Date();
        const daysAhead = parseInt(auctionDateRange as string);
        const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
        conditions.push(lte(auctions.auctionDate, futureDate));
      }

      const auctionList = await db.query.auctions.findMany({
        where: and(...conditions),
        orderBy: [asc(auctions.auctionDate)],
        limit: 200
      });

      // Apply client-side filters for fields that may be null (CSR2, value, landTypes, counties, map bounds)
      let filteredAuctions = auctionList;
      
      // Apply CSR2 filters (only filter OUT auctions that HAVE CSR2 outside range)
      if (minCSR2) {
        filteredAuctions = filteredAuctions.filter(auction =>
          !auction.csr2Mean || auction.csr2Mean >= parseFloat(minCSR2 as string)
        );
      }
      if (maxCSR2) {
        filteredAuctions = filteredAuctions.filter(auction =>
          !auction.csr2Mean || auction.csr2Mean <= parseFloat(maxCSR2 as string)
        );
      }

      // Apply value filters (only filter OUT auctions that HAVE value outside range)
      if (minValue) {
        filteredAuctions = filteredAuctions.filter(auction =>
          !auction.estimatedValue || auction.estimatedValue >= parseFloat(minValue as string)
        );
      }
      if (maxValue) {
        filteredAuctions = filteredAuctions.filter(auction =>
          !auction.estimatedValue || auction.estimatedValue <= parseFloat(maxValue as string)
        );
      }
      
      // Filter by map bounds (only include auctions with valid coordinates)
      filteredAuctions = filteredAuctions.filter(auction => {
        if (!auction.latitude || !auction.longitude) {
          // Include or exclude based on parameter
          return includeWithoutCoords === 'true';
        }
        return auction.latitude >= parseFloat(minLat as string) &&
               auction.latitude <= parseFloat(maxLat as string) &&
               auction.longitude >= parseFloat(minLon as string) &&
               auction.longitude <= parseFloat(maxLon as string);
      });
      
      if (landTypes) {
        const typesArray = Array.isArray(landTypes) ? landTypes : [landTypes];
        filteredAuctions = filteredAuctions.filter(auction => 
          auction.landType && typesArray.includes(auction.landType)
        );
      }

      if (counties) {
        const countiesArray = Array.isArray(counties) ? counties : [counties];
        filteredAuctions = filteredAuctions.filter(auction => 
          auction.county && countiesArray.includes(auction.county)
        );
      }
      
      res.json({ 
        success: true, 
        auctions: filteredAuctions,
        count: filteredAuctions.length,
        totalInDatabase: auctionList.length,
        withoutCoordinates: auctionList.filter(a => !a.latitude || !a.longitude).length
      });
    } catch (error) {
      console.error("Auction fetch error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch auctions' 
      });
    }
  });

  // Auction count endpoint for filter summary
  app.get("/api/auctions/count", async (req, res) => {
    try {
      const { 
        minAcreage, maxAcreage,
        minCSR2, maxCSR2,
        auctionDateRange,
        minValue, maxValue
      } = req.query;
      
      const landTypes = req.query['landTypes[]'];
      const counties = req.query['counties[]'];

      // Build filter conditions
      const conditions = [eq(auctions.status, 'active')];

      // Add acreage filters
      if (minAcreage) {
        conditions.push(gte(auctions.acreage, parseFloat(minAcreage as string)));
      }
      if (maxAcreage) {
        conditions.push(lte(auctions.acreage, parseFloat(maxAcreage as string)));
      }

      // Add CSR2 filters
      if (minCSR2) {
        conditions.push(gte(auctions.csr2Mean, parseFloat(minCSR2 as string)));
      }
      if (maxCSR2) {
        conditions.push(lte(auctions.csr2Mean, parseFloat(maxCSR2 as string)));
      }

      // Add value filters
      if (minValue) {
        conditions.push(gte(auctions.estimatedValue, parseFloat(minValue as string)));
      }
      if (maxValue) {
        conditions.push(lte(auctions.estimatedValue, parseFloat(maxValue as string)));
      }

      // Add date range filter
      if (auctionDateRange && auctionDateRange !== 'all') {
        const now = new Date();
        const daysAhead = parseInt(auctionDateRange as string);
        const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
        conditions.push(lte(auctions.auctionDate, futureDate));
      }

      const auctionList = await db.query.auctions.findMany({
        where: and(...conditions)
      });

      // Apply client-side filters for array fields
      let filteredAuctions = auctionList;
      
      if (landTypes) {
        const typesArray = Array.isArray(landTypes) ? landTypes : [landTypes];
        filteredAuctions = filteredAuctions.filter(auction => 
          auction.landType && typesArray.includes(auction.landType)
        );
      }

      if (counties) {
        const countiesArray = Array.isArray(counties) ? counties : [counties];
        filteredAuctions = filteredAuctions.filter(auction => 
          auction.county && countiesArray.includes(auction.county)
        );
      }
      
      res.json({ success: true, count: filteredAuctions.length });
    } catch (error) {
      console.error("Auction count error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to count auctions',
        count: 0
      });
    }
  });

  // Trigger auction scraping refresh
  app.post("/api/auctions/refresh", valuationRateLimiter, async (req, res) => {
    try {
      // Run scraping in background
      auctionScraperService.scrapeAllSources()
        .then(results => {
          console.log(`✅ Background scraping completed: ${results.length} auctions`);
        })
        .catch(error => {
          console.error('❌ Background scraping failed:', error);
        });
      
      res.json({ 
        success: true, 
        message: 'Auction scraping started in background. This may take several minutes.' 
      });
    } catch (error) {
      console.error("Auction scraping trigger error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to start scraping' 
      });
    }
  });

  // Get real-time scrape progress
  app.get("/api/auctions/scrape-progress", async (req, res) => {
    try {
      const progress = auctionScraperService.getScrapeProgress();
      
      // Always return success, even if not scraping
      res.json({
        success: true,
        isActive: progress.isActive || false,
        currentSource: progress.currentSource || '',
        completedSources: progress.completedSources || 0,
        totalSources: progress.totalSources || 24,
        currentSourceProgress: progress.currentSourceProgress || 0
      });
    } catch (error) {
      console.error("Scrape progress error:", error);
      res.status(500).json({
        success: false,
        isActive: false,
        currentSource: '',
        completedSources: 0,
        totalSources: 24,
        currentSourceProgress: 0,
        message: 'Failed to get scrape progress'
      });
    }
  });

  // Get auction details
  app.get("/api/auctions/:id", async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      
      if (isNaN(auctionId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid auction ID' 
        });
      }

      const auction = await db.query.auctions.findFirst({
        where: eq(auctions.id, auctionId)
      });
      
      if (!auction) {
        return res.status(404).json({ 
          success: false, 
          message: 'Auction not found' 
        });
      }
      
      res.json({ success: true, auction });
    } catch (error) {
      console.error("Auction details error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch auction details' 
      });
    }
  });

  // Calculate CSR2 valuation for auction
  app.post("/api/auctions/:id/valuation", async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      
      if (isNaN(auctionId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid auction ID' 
        });
      }

      const valuation = await auctionScraperService.calculateValuation(auctionId);
      
      res.json({ success: true, valuation });
    } catch (error) {
      console.error("Auction valuation error:", error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to calculate valuation' 
      });
    }
  });

  // Scrape LandWatch specific pages
  app.post("/api/auctions/refresh/landwatch", valuationRateLimiter, async (req, res) => {
    try {
      // Run LandWatch scraping in background
      auctionScraperService.scrapeLandWatchPages()
        .then(results => {
          console.log(`✅ LandWatch scraping completed: ${results.length} auctions`);
        })
        .catch(error => {
          console.error('❌ LandWatch scraping failed:', error);
        });
      
      res.json({ 
        success: true, 
        message: 'LandWatch auction scraping started in background. This may take a few minutes.' 
      });
    } catch (error) {
      console.error("LandWatch scraping trigger error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to start LandWatch scraping' 
      });
    }
  });

  // Manually add a specific auction by URL
  app.post("/api/auctions/add-by-url", valuationRateLimiter, async (req, res) => {
    try {
      const { url, sourceName } = req.body;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          message: 'URL is required'
        });
      }
      
      // Validate URL format
      try {
        new URL(url);
      } catch {
        return res.status(400).json({
          success: false,
          message: 'Invalid URL format'
        });
      }
      
      console.log(`🔍 Manual auction addition requested: ${url}`);
      
      // Scrape the auction synchronously for immediate feedback
      const result = await auctionScraperService.scrapeSpecificUrl(url, sourceName);
      
      if (result) {
        res.json({
          success: true,
          message: 'Auction added successfully!',
          auction: result
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Could not extract auction data from this URL. Please ensure it\'s a valid auction listing.'
        });
      }
    } catch (error) {
      console.error("Manual auction addition error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to add auction'
      });
    }
  });

  // ==== DIAGNOSTICS ENDPOINTS ====

  // Get latest scraper run statistics
  app.get("/api/auctions/diagnostics/latest", async (req, res) => {
    try {
      const { scraperDiagnosticsService } = await import('./services/scraperDiagnostics.js');
      const stats = scraperDiagnosticsService.getLatestScrapeStats();
      const metrics = scraperDiagnosticsService.calculateCoverageMetrics(stats);
      
      // Get last scrape timestamp
      const lastScrapeTime = stats.length > 0 ? stats[0].timestamp : null;
      
      res.json({
        success: true,
        lastScrapeTime,
        stats,
        metrics,
        summary: {
          totalSources: stats.length,
          totalDiscovered: stats.reduce((sum, s) => sum + s.discoveredUrls, 0),
          totalSaved: stats.reduce((sum, s) => sum + s.successfulSaves, 0),
          iowaDiscovered: stats.reduce((sum, s) => sum + s.iowaDiscovered, 0),
          iowaSaved: stats.reduce((sum, s) => sum + s.iowaSaved, 0)
        }
      });
    } catch (error) {
      console.error("Diagnostics latest error:", error);
      res.status(500).json({
        success: false,
        message: 'Failed to get latest diagnostics'
      });
    }
  });

  // Get historical scraper statistics
  app.get("/api/auctions/diagnostics/history", async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const { scraperDiagnosticsService } = await import('./services/scraperDiagnostics.js');
      const stats = scraperDiagnosticsService.getHistoricalStats(days);
      
      res.json({
        success: true,
        days,
        stats,
        count: stats.length
      });
    } catch (error) {
      console.error("Diagnostics history error:", error);
      res.status(500).json({
        success: false,
        message: 'Failed to get historical diagnostics'
      });
    }
  });

  // Get coverage metrics
  app.get("/api/auctions/diagnostics/coverage", async (req, res) => {
    try {
      const { scraperDiagnosticsService } = await import('./services/scraperDiagnostics.js');
      const stats = scraperDiagnosticsService.getLatestScrapeStats();
      const metrics = scraperDiagnosticsService.calculateCoverageMetrics(stats);
      
      // Sort by coverage percentage (lowest first to highlight issues)
      const sortedMetrics = metrics.sort((a, b) => a.coverage_percentage - b.coverage_percentage);
      
      res.json({
        success: true,
        metrics: sortedMetrics,
        summary: {
          averageCoverage: metrics.length > 0 
            ? Math.round(metrics.reduce((sum, m) => sum + m.coverage_percentage, 0) / metrics.length)
            : 0,
          lowCoverageCount: metrics.filter(m => m.coverage_percentage < 80).length,
          iowaAverageCoverage: metrics.length > 0
            ? Math.round(metrics.reduce((sum, m) => sum + m.iowa_coverage_percentage, 0) / metrics.length)
            : 0
        }
      });
    } catch (error) {
      console.error("Diagnostics coverage error:", error);
      res.status(500).json({
        success: false,
        message: 'Failed to get coverage metrics'
      });
    }
  });

  // Get missing Iowa auctions
  app.get("/api/auctions/diagnostics/missing-iowa", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const { scraperDiagnosticsService } = await import('./services/scraperDiagnostics.js');
      const missing = scraperDiagnosticsService.getMissingIowaAuctions(limit);
      
      // Group by source
      const bySource: Record<string, any[]> = {};
      missing.forEach(m => {
        if (!bySource[m.source]) bySource[m.source] = [];
        bySource[m.source].push(m);
      });
      
      res.json({
        success: true,
        total: missing.length,
        missing,
        bySource: Object.fromEntries(
          Object.entries(bySource).map(([k, v]) => [k, v.length])
        )
      });
    } catch (error) {
      console.error("Diagnostics missing Iowa error:", error);
      res.status(500).json({
        success: false,
        message: 'Failed to get missing Iowa auctions'
      });
    }
  });

  // Get most recent auctions (newly scraped)
  app.get("/api/auctions/diagnostics/recent-acquisitions", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      
      const recentAuctions = await db.query.auctions.findMany({
        orderBy: [desc(auctions.scrapedAt)],
        limit
      });
      
      res.json({
        success: true,
        auctions: recentAuctions
      });
    } catch (error) {
      console.error("Recent acquisitions error:", error);
      res.status(500).json({
        success: false,
        message: 'Failed to get recent acquisitions'
      });
    }
  });

  // Get upcoming auctions (soonest auction dates)
  app.get("/api/auctions/diagnostics/upcoming", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 15;
      
      const upcomingAuctions = await db.query.auctions.findMany({
        where: sql`auction_date::date >= CURRENT_DATE`,  // Include all of today's auctions
        orderBy: [asc(auctions.auctionDate)],
        limit
      });
      
      res.json({
        success: true,
        auctions: upcomingAuctions
      });
    } catch (error) {
      console.error("Upcoming auctions error:", error);
      res.status(500).json({
        success: false,
        message: 'Failed to get upcoming auctions'
      });
    }
  });

  // Get enrichment statistics
  app.get("/api/auctions/enrichment-stats", async (req, res) => {
    try {
      const { auctionEnrichmentService } = await import('./services/auctionEnrichment.js');
      const stats = await auctionEnrichmentService.getEnrichmentStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      console.error("Enrichment stats error:", error);
      res.status(500).json({
        success: false,
        message: 'Failed to get enrichment statistics'
      });
    }
  });

  // Get enrichment errors
  app.get("/api/auctions/enrichment-errors", async (req, res) => {
    try {
      const failedAuctions = await db.query.auctions.findMany({
        where: eq(auctions.enrichmentStatus, 'failed'),
        limit: 50
      });
      
      res.json({
        success: true,
        errors: failedAuctions.map(a => ({
          id: a.id,
          title: a.title,
          error: a.enrichmentError,
          url: a.url
        }))
      });
    } catch (error) {
      console.error("Enrichment errors error:", error);
      res.status(500).json({
        success: false,
        message: 'Failed to get enrichment errors'
      });
    }
  });

  // Enrich single auction
  app.post("/api/auctions/:id/enrich", async (req, res) => {
    try {
      const auctionId = parseInt(req.params.id);
      const { auctionEnrichmentService } = await import('./services/auctionEnrichment.js');
      
      const result = await auctionEnrichmentService.enrichAuction(auctionId);
      
      res.json({
        success: true,
        enrichment: result
      });
    } catch (error) {
      console.error("Enrich auction error:", error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to enrich auction'
      });
    }
  });

  // Enrich all pending auctions
  app.post("/api/auctions/enrich-all", async (req, res) => {
    try {
      const { enrichAllPendingAuctions } = await import('./services/enrichmentQueue.js');
      const { Pool } = await import('@neondatabase/serverless');
      
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      
      // Start enrichment in background
      enrichAllPendingAuctions(pool).then(stats => {
        console.log('✅ Enrichment complete:', stats);
        pool.end();
      }).catch(error => {
        console.error('❌ Enrichment failed:', error);
        pool.end();
      });
      
      res.json({
        success: true,
        message: 'Enrichment started in background'
      });
    } catch (error) {
      console.error("Enrich all error:", error);
      res.status(500).json({
        success: false,
        message: 'Failed to start enrichment'
      });
    }
  });

  // Retry failed enrichments
  app.post("/api/auctions/retry-failed-enrichments", async (req, res) => {
    try {
      // Reset failed auctions to pending
      await db.update(auctions)
        .set({ 
          enrichmentStatus: 'pending',
          enrichmentError: null
        })
        .where(eq(auctions.enrichmentStatus, 'failed'));
      
      const { enrichAllPendingAuctions } = await import('./services/enrichmentQueue.js');
      const { Pool } = await import('@neondatabase/serverless');
      
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      
      // Start enrichment in background
      enrichAllPendingAuctions(pool).then(stats => {
        console.log('✅ Retry enrichment complete:', stats);
        pool.end();
      }).catch(error => {
        console.error('❌ Retry enrichment failed:', error);
        pool.end();
      });
      
      res.json({
        success: true,
        message: 'Retry enrichment started in background'
      });
    } catch (error) {
      console.error("Retry enrichments error:", error);
      res.status(500).json({
        success: false,
        message: 'Failed to retry enrichments'
      });
    }
  });

  // Investigate auction coordinates status
  app.get("/api/auctions/investigate", async (req, res) => {
    try {
      const totalCount = await db.select({ count: sql`count(*)` }).from(auctions);
      
      const withCoords = await db.select({ count: sql`count(*)` })
        .from(auctions)
        .where(sql`latitude IS NOT NULL AND longitude IS NOT NULL`);
      
      const withoutCoords = await db.select({ count: sql`count(*)` })
        .from(auctions)
        .where(sql`latitude IS NULL OR longitude IS NULL`);
      
      // Check how many can be fixed with county centroids
      const noCoordButHasCounty = await db.select({
        id: auctions.id,
        county: auctions.county,
        state: auctions.state
      })
      .from(auctions)
      .where(sql`(latitude IS NULL OR longitude IS NULL) AND county IS NOT NULL AND state = 'Iowa'`);
      
      const canBeFixed = noCoordButHasCounty.filter(a => {
        const centroid = getCountyCentroid(a.county || '');
        return centroid !== null;
      }).length;
      
      // Get by source stats
      const bySource = await db.select({
        source: auctions.sourceWebsite,
        total: sql`count(*)`,
        withCoords: sql`count(CASE WHEN latitude IS NOT NULL THEN 1 END)`
      })
      .from(auctions)
      .groupBy(auctions.sourceWebsite);
      
      res.json({
        success: true,
        total: parseInt(totalCount[0].count as string),
        withCoordinates: parseInt(withCoords[0].count as string),
        withoutCoordinates: parseInt(withoutCoords[0].count as string),
        canBeFixed: canBeFixed,
        potentialTotal: parseInt(withCoords[0].count as string) + canBeFixed,
        bySource: bySource.map(s => ({
          source: s.source,
          total: parseInt(s.total as string),
          withCoords: parseInt(s.withCoords as string),
          coverage: ((parseInt(s.withCoords as string) / parseInt(s.total as string)) * 100).toFixed(1)
        }))
      });
    } catch (error) {
      console.error("Investigation error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to investigate auctions' 
      });
    }
  });

  // Update auction coordinates using county centroids
  app.post("/api/auctions/update-coordinates", valuationRateLimiter, async (req, res) => {
    try {
      // Get auctions without coordinates but with county data
      const auctionsToUpdate = await db.select({
        id: auctions.id,
        county: auctions.county,
        state: auctions.state,
        rawData: auctions.rawData
      })
      .from(auctions)
      .where(sql`(latitude IS NULL OR longitude IS NULL) AND county IS NOT NULL AND state = 'Iowa'`);

      let updated = 0;
      let failed = 0;
      const updates = [];

      for (const auction of auctionsToUpdate) {
        const centroid = getCountyCentroid(auction.county || '');
        
        if (centroid) {
          try {
            await db.update(auctions)
              .set({
                latitude: centroid.latitude,
                longitude: centroid.longitude,
                rawData: {
                  ...(auction.rawData || {}),
                  isCountyLevel: true,
                  geocodingMethod: 'county-centroid',
                  updatedViaAPI: true,
                  updatedAt: new Date().toISOString()
                }
              })
              .where(eq(auctions.id, auction.id));

            updated++;
            updates.push({
              id: auction.id,
              county: auction.county,
              latitude: centroid.latitude,
              longitude: centroid.longitude
            });
          } catch (error) {
            failed++;
            console.error(`Failed to update auction ${auction.id}:`, error);
          }
        } else {
          failed++;
        }
      }

      res.json({
        success: true,
        message: `Updated ${updated} auctions with county coordinates`,
        updated,
        failed,
        total: auctionsToUpdate.length,
        updates: updates.slice(0, 10) // Sample of updates
      });
    } catch (error) {
      console.error("Update coordinates error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to update auction coordinates' 
      });
    }
  });

  // ===============================================
  // PARCEL DATA ENDPOINTS
  // ===============================================

  // Vector tile endpoint - Generate MVT tiles for parcels
  app.get("/api/parcels/tiles/:z/:x/:y.mvt", async (req, res) => {
    try {
      const z = parseInt(req.params.z);
      const x = parseInt(req.params.x);
      const y = parseInt(req.params.y);
      
      // Validate tile coordinates
      if (isNaN(z) || isNaN(x) || isNaN(y)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid tile coordinates' 
        });
      }
      
      if (z < 0 || z > 22) {
        return res.status(400).json({ 
          success: false, 
          message: 'Zoom level must be between 0 and 22' 
        });
      }
      
      // Generate tile
      const tile = await generateParcelTile(z, x, y, pool);
      
      // Always set CORS header
      res.set('Access-Control-Allow-Origin', '*');
      
      if (!tile || tile.length === 0) {
        // Return empty tile with CORS header
        res.status(204).send();
        return;
      }
      
      // Set appropriate headers for MVT
      res.set({
        'Content-Type': 'application/x-protobuf',
        'Cache-Control': 'public, max-age=3600'
      });
      
      res.send(tile);
    } catch (error) {
      console.error("Tile generation error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate tile' 
      });
    }
  });

  // Hybrid tile endpoint (both parcels and ownership layers)
  app.get("/api/parcels/tiles/hybrid/:z/:x/:y.mvt", async (req, res) => {
    try {
      const z = parseInt(req.params.z);
      const x = parseInt(req.params.x);
      const y = parseInt(req.params.y);
      
      if (isNaN(z) || isNaN(x) || isNaN(y)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid tile coordinates' 
        });
      }
      
      const tile = await generateHybridTile(z, x, y, pool);
      
      // Always set CORS header
      res.set('Access-Control-Allow-Origin', '*');
      
      if (!tile || tile.length === 0) {
        res.status(204).send();
        return;
      }
      
      res.set({
        'Content-Type': 'application/x-protobuf',
        'Cache-Control': 'public, max-age=3600'
      });
      
      res.send(tile);
    } catch (error) {
      console.error("Hybrid tile generation error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate hybrid tile' 
      });
    }
  });

  // Get tile cache statistics
  app.get("/api/parcels/tiles/stats", async (req, res) => {
    try {
      const stats = getTileCacheStats();
      res.json({ success: true, stats });
    } catch (error) {
      console.error("Tile stats error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to get tile statistics' 
      });
    }
  });

  // Clear tile cache
  app.post("/api/parcels/tiles/clear-cache", async (req, res) => {
    try {
      clearTileCache();
      res.json({ success: true, message: 'Tile cache cleared' });
    } catch (error) {
      console.error("Cache clear error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to clear cache' 
      });
    }
  });

  // Search for parcels at a point (lat/lng)
  app.get("/api/parcels/search", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lng = parseFloat(req.query.lng as string);
      
      if (isNaN(lat) || isNaN(lng)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Valid latitude and longitude are required' 
        });
      }
      
      const results = await findParcelsAtPoint(lng, lat, pool);
      
      res.json({ 
        success: true, 
        parcels: results,
        count: results.length
      });
    } catch (error) {
      console.error("Parcel search error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to search parcels' 
      });
    }
  });

  // Get parcel by ID
  app.get("/api/parcels/:id", async (req, res) => {
    try {
      const parcelId = parseInt(req.params.id);
      
      if (isNaN(parcelId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid parcel ID' 
        });
      }
      
      const parcel = await db.query.parcels.findFirst({
        where: eq(parcels.id, parcelId)
      });
      
      if (!parcel) {
        return res.status(404).json({ 
          success: false, 
          message: 'Parcel not found' 
        });
      }
      
      // Get geometry as GeoJSON
      const geomResult = await pool.query(
        'SELECT ST_AsGeoJSON(geom) as geometry FROM parcels WHERE id = $1',
        [parcelId]
      );
      
      const geometry = geomResult.rows[0]?.geometry 
        ? JSON.parse(geomResult.rows[0].geometry) 
        : null;
      
      res.json({ 
        success: true, 
        parcel: {
          ...parcel,
          geometry,
          acres: parcel.areaSqm ? (parcel.areaSqm / 4046.86).toFixed(2) : null
        }
      });
    } catch (error) {
      console.error("Parcel fetch error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch parcel' 
      });
    }
  });

  // Get parcels by owner (normalized name)
  app.get("/api/parcels/owner/:name", async (req, res) => {
    try {
      const normalizedOwner = decodeURIComponent(req.params.name);
      const stats = await getOwnershipStats(normalizedOwner);
      
      if (!stats) {
        return res.status(404).json({ 
          success: false, 
          message: 'No parcels found for this owner' 
        });
      }
      
      res.json({ success: true, ...stats });
    } catch (error) {
      console.error("Owner parcels error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch owner parcels' 
      });
    }
  });

  // Get parcels by county
  app.get("/api/parcels/county/:county", async (req, res) => {
    try {
      const county = decodeURIComponent(req.params.county);
      const limit = parseInt(req.query.limit as string) || 1000;
      
      const result = await db.select()
        .from(parcels)
        .where(eq(parcels.countyName, county))
        .limit(Math.min(limit, 5000));
      
      res.json({ 
        success: true, 
        parcels: result,
        count: result.length
      });
    } catch (error) {
      console.error("County parcels error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch county parcels' 
      });
    }
  });

  // Search for owners (fuzzy matching)
  app.get("/api/parcels/ownership/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      const limit = parseInt(req.query.limit as string) || 50;
      
      if (!query || query.trim().length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Search query is required' 
        });
      }
      
      const results = await searchOwners(query, limit);
      
      res.json({ 
        success: true, 
        owners: results,
        count: results.length
      });
    } catch (error) {
      console.error("Owner search error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to search owners' 
      });
    }
  });

  // Find similar owner names
  app.get("/api/parcels/ownership/similar", async (req, res) => {
    try {
      const name = req.query.name as string;
      const threshold = parseInt(req.query.threshold as string) || 3;
      
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Owner name is required' 
        });
      }
      
      const similar = await findSimilarOwners(name, threshold);
      
      res.json({ 
        success: true, 
        similarOwners: similar,
        count: similar.length
      });
    } catch (error) {
      console.error("Similar owners error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to find similar owners' 
      });
    }
  });

  // Get top landowners
  app.get("/api/parcels/ownership/top", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const topOwners = await getTopLandowners(Math.min(limit, 1000));
      
      res.json({ 
        success: true, 
        owners: topOwners,
        count: topOwners.length
      });
    } catch (error) {
      console.error("Top landowners error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch top landowners' 
      });
    }
  });

  // Get parcels within bounding box
  app.get("/api/parcels/bounds", async (req, res) => {
    try {
      const minLng = parseFloat(req.query.minLng as string);
      const minLat = parseFloat(req.query.minLat as string);
      const maxLng = parseFloat(req.query.maxLng as string);
      const maxLat = parseFloat(req.query.maxLat as string);
      const limit = parseInt(req.query.limit as string) || 1000;
      
      if (isNaN(minLng) || isNaN(minLat) || isNaN(maxLng) || isNaN(maxLat)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Valid bounding box coordinates are required' 
        });
      }
      
      const results = await getParcelsInBounds(minLng, minLat, maxLng, maxLat, pool, limit);
      
      res.json({ 
        success: true, 
        parcels: results,
        count: results.length
      });
    } catch (error) {
      console.error("Bounds search error:", error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to search parcels in bounds' 
      });
    }
  });

  // Only create HTTP server if not running in serverless environment (Vercel)
  if (process.env.VERCEL) {
    console.log('Running in Vercel serverless environment - skipping HTTP server creation');
    return null;
  }
  
  const httpServer = createServer(app);
  return httpServer;
}
