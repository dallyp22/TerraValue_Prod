import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { valuationService } from "./services/valuation.js";
import { csr2Service } from "./services/csr2.js";
import { fieldBoundaryService } from "./services/fieldBoundaries.js";
import { auctionScraperService } from "./services/auctionScraper.js";
import { soilPropertiesService } from "./services/soilProperties.js";
import { mukeyLookupService } from "./services/mukeyLookup.js";
import { parcelAggregationService } from "./services/parcelAggregation.js";
import { propertyFormSchema, auctions } from "@shared/schema";
import { db } from "./db.js";
import { and, gte, lte, eq, asc, desc, sql } from "drizzle-orm";
import { getCountyCentroid } from "./services/iowaCountyCentroids.js";

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

  // Apply general rate limiting to all API routes
  app.use('/api', generalRateLimiter);
  
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

  // Only create HTTP server if not running in serverless environment (Vercel)
  if (process.env.VERCEL) {
    console.log('Running in Vercel serverless environment - skipping HTTP server creation');
    return null;
  }
  
  const httpServer = createServer(app);
  return httpServer;
}
