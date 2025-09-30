import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { valuationService } from "./services/valuation.js";
import { csr2Service } from "./services/csr2.js";
import { fieldBoundaryService } from "./services/fieldBoundaries.js";
import { propertyFormSchema } from "@shared/schema";

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
const generalRateLimiter = createRateLimiter(100, 60000); // 100 requests per minute
const valuationRateLimiter = createRateLimiter(10, 60000); // 10 valuations per minute

export async function registerRoutes(app: Express): Promise<Server> {
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

      const stats = await csr2Service.calculateAverageCSR2(polygon);
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

  const httpServer = createServer(app);
  return httpServer;
}
