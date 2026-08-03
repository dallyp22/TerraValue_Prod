/**
 * Hono port of server/routes.ts.
 *
 * Strategy: reuse the existing server/services/* and server/db.ts unchanged.
 * On Workers, secrets become process.env.X via the nodejs_compat flag, so the
 * services don't need to be parameterized by request context.
 */
import { Hono } from "hono";
import { and, asc, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";

import type { Env } from "../env";
import { db, pool } from "../../../server/db";
import { storage } from "../../../server/storage";
import { valuationService } from "../../../server/services/valuation";
import { csr2Service } from "../../../server/services/csr2";
import { countyCsr2RateService } from "../../../server/services/countyCsr2Rates";
import { fieldBoundaryService } from "../../../server/services/fieldBoundaries";
import { auctionScraperService } from "../../../server/services/auctionScraper";
import { automaticScraperService } from "../../../server/services/automaticScraper";
import { AuctionArchiverService } from "../../../server/services/auctionArchiver";
import { marketDataService, type MarketFilters } from "../../../server/services/marketData";
import { comparablesService } from "../../../server/services/comparables";
import { cornPriceService } from "../../../server/services/cornPrice";
import { soilPropertiesService } from "../../../server/services/soilProperties";
import { mukeyLookupService } from "../../../server/services/mukeyLookup";
import { enqueueScrapeRun } from "../queues";
import { parcelAggregationService } from "../../../server/services/parcelAggregation";
import { auctionParcelExtractor } from "../../../server/services/auctionParcelExtractor";
import { getCountyCentroid } from "../../../server/services/iowaCountyCentroids";
import {
  clearTileCache,
  generateHybridTile,
  generateParcelTile,
  getTileCacheStats,
} from "../../../server/services/parcelTiles";
import {
  findParcelsAtPoint,
  findSimilarOwners,
  getOwnershipStats,
  getParcelsInBounds,
  getTopLandowners,
  searchOwners,
} from "../../../server/services/parcelOwnership";
import {
  auctionBlocklist,
  auctions,
  parcels,
  propertyFormSchema,
  valuations,
} from "../../../shared/schema";

export const api = new Hono<{ Bindings: Env }>();

// ============================================================================
// Health
// ============================================================================
api.get("/health", async (c) => {
  try {
    await storage.listValuations();
    return c.json({
      success: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: (globalThis as any).process?.env?.NODE_ENV || "production",
      services: { database: "connected", api: "operational" },
    });
  } catch (error) {
    console.error("Health check failed:", error);
    return c.json(
      {
        success: false,
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        services: { database: "error", api: "degraded" },
        error: error instanceof Error ? error.message : "Unknown error",
      },
      503,
    );
  }
});

// ============================================================================
// Corn price
// ============================================================================
api.get("/corn-price", async (c) => {
  try {
    const price = await cornPriceService.getCornFuturesPrice();
    if (price !== null) {
      return c.json({ success: true, price, timestamp: new Date().toISOString() });
    }
    return c.json(
      { success: false, message: "Unable to fetch corn futures price" },
      500,
    );
  } catch (error) {
    console.error("Corn price fetch error:", error);
    return c.json(
      { success: false, message: "Failed to fetch corn futures price" },
      500,
    );
  }
});

// ============================================================================
// Valuations
// ============================================================================
const valuationHandler = async (c: any) => {
  try {
    const body = await c.req.json();
    const validatedData = propertyFormSchema.parse(body);

    // Create the row synchronously so we can return its id.
    const valuation = await storage.createValuation(validatedData);

    // The heavy pipeline (OpenAI vector lookup, market analysis, multiple
    // DB writes) ran fire-and-forget on Railway because the Express process
    // lived forever. In Workers, the runtime kills the isolate as soon as
    // the response is sent, so we have to keep it alive with waitUntil.
    // processValuationPipeline is marked private; we call through the
    // bracket accessor to bypass the TS visibility check.
    c.executionCtx.waitUntil(
      (valuationService as any).processValuationPipeline(
        valuation.id,
        validatedData,
      ),
    );

    return c.json({
      success: true,
      valuationId: valuation.id,
      sessionId: valuation.id,
      message: "Valuation process started",
    });
  } catch (error) {
    console.error("Valuation creation failed:", error);
    return c.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Validation failed",
      },
      400,
    );
  }
};

api.post("/valuations", valuationHandler);
api.post("/start-valuation", valuationHandler);

// Slim valuation history (no breakdown) for the Valuations list view.
// Registered before "/valuations/:id" so "history" isn't parsed as an id.
api.get("/valuations/history", async (c) => {
  try {
    const rows = await db
      .select({
        id: valuations.id,
        address: valuations.address,
        county: valuations.county,
        state: valuations.state,
        landType: valuations.landType,
        acreage: valuations.acreage,
        adjustedValue: valuations.adjustedValue,
        totalValue: valuations.totalValue,
        confidenceScore: valuations.confidenceScore,
        status: valuations.status,
        createdAt: valuations.createdAt,
      })
      .from(valuations)
      .orderBy(desc(valuations.createdAt))
      .limit(200);
    return c.json({ success: true, valuations: rows });
  } catch (error) {
    console.error("Failed to list valuation history:", error);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

api.get("/valuations/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) {
      return c.json({ success: false, message: "Invalid valuation ID" }, 400);
    }
    const valuation = await storage.getValuation(id);
    if (!valuation) {
      return c.json({ success: false, message: "Valuation not found" }, 404);
    }
    return c.json({ success: true, valuation });
  } catch (error) {
    console.error("Failed to get valuation:", error);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

api.get("/valuations", async (c) => {
  try {
    const valuations = await storage.listValuations();
    return c.json({ success: true, valuations });
  } catch (error) {
    console.error("Failed to list valuations:", error);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

// ============================================================================
// CSR2
// ============================================================================
api.post("/csr2/polygon", async (c) => {
  try {
    const { wkt } = await c.req.json();
    if (!wkt || typeof wkt !== "string") {
      return c.json(
        { success: false, message: "Valid WKT geometry is required" },
        400,
      );
    }
    const wktRegex =
      /^(POINT|LINESTRING|POLYGON|MULTIPOINT|MULTILINESTRING|MULTIPOLYGON|GEOMETRYCOLLECTION)\s*\(.+\)$/i;
    if (!wktRegex.test(wkt)) {
      return c.json(
        { success: false, message: "Invalid WKT geometry format" },
        400,
      );
    }
    const stats = await csr2Service.getCsr2PolygonStats(wkt);
    return c.json({ success: true, ...stats });
  } catch (error) {
    console.error("CSR2 polygon stats error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to fetch CSR2 data",
      },
      500,
    );
  }
});

api.post("/csr2/point", async (c) => {
  try {
    const { latitude, longitude, radiusMeters = 500 } = await c.req.json();
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return c.json(
        { success: false, message: "Valid latitude and longitude are required" },
        400,
      );
    }
    const wkt = csr2Service.createCircularPolygon(latitude, longitude, radiusMeters);
    const stats = await csr2Service.getCsr2PolygonStats(wkt);
    return c.json({ success: true, wkt, ...stats });
  } catch (error) {
    console.error("CSR2 point stats error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to fetch CSR2 data",
      },
      500,
    );
  }
});

api.post("/average-csr2", async (c) => {
  try {
    const { polygon } = await c.req.json();
    if (!polygon || !polygon.coordinates) {
      return c.json(
        { success: false, message: "Valid polygon geometry is required" },
        400,
      );
    }
    let wkt = "";
    if (polygon.type === "Polygon") {
      const coords = polygon.coordinates[0]
        .map((p: number[]) => `${p[0]} ${p[1]}`)
        .join(", ");
      wkt = `POLYGON((${coords}))`;
    } else if (polygon.type === "MultiPolygon") {
      const polys = polygon.coordinates
        .map((poly: number[][][]) => {
          const coords = poly[0]
            .map((p: number[]) => `${p[0]} ${p[1]}`)
            .join(", ");
          return `((${coords}))`;
        })
        .join(", ");
      wkt = `MULTIPOLYGON(${polys})`;
    } else {
      return c.json(
        {
          success: false,
          message: "Polygon must be of type Polygon or MultiPolygon",
        },
        400,
      );
    }
    const stats = await csr2Service.getCsr2PolygonStats(wkt);
    return c.json({ success: true, average: stats.mean || 0, ...stats });
  } catch (error) {
    console.error("Average CSR2 calculation error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to calculate average CSR2",
      },
      500,
    );
  }
});

// ============================================================================
// Geocoding
// ============================================================================
api.post("/geocode", async (c) => {
  try {
    const { address } = await c.req.json();
    if (!address || typeof address !== "string") {
      return c.json({ success: false, message: "Address is required" }, 400);
    }
    const coordinates = await csr2Service.geocodeAddress(address);
    if (!coordinates) {
      return c.json(
        {
          success: false,
          message: "Unable to geocode address",
        },
        404,
      );
    }
    return c.json({ success: true, ...coordinates });
  } catch (error) {
    console.error("Geocoding error:", error);
    return c.json(
      { success: false, message: "Failed to geocode address" },
      500,
    );
  }
});

api.post("/geocode/reverse", async (c) => {
  try {
    const { latitude, longitude } = await c.req.json();
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return c.json(
        { success: false, message: "Valid latitude and longitude are required" },
        400,
      );
    }
    const location = await csr2Service.reverseGeocode(latitude, longitude);
    if (!location) {
      return c.json({
        success: true,
        county: null,
        state: null,
        message: "Unable to determine county and state for these coordinates",
      });
    }
    return c.json({
      success: true,
      county: location.county,
      state: location.state,
    });
  } catch (error) {
    console.error("Reverse geocoding error:", error);
    return c.json(
      { success: false, message: "Failed to reverse geocode coordinates" },
      500,
    );
  }
});

// ============================================================================
// Auctions (list, count, individual)
// ============================================================================
api.post("/auctions/validate-counties", async (c) => {
  try {
    const allAuctions = await db.query.auctions.findMany({
      where: sql`latitude IS NOT NULL AND longitude IS NOT NULL`,
    });
    let validated = 0;
    let fixed = 0;
    const mismatches: any[] = [];

    for (const auction of allAuctions) {
      if (!auction.latitude || !auction.longitude) continue;
      try {
        const location = await csr2Service.reverseGeocode(
          auction.latitude,
          auction.longitude,
        );
        if (
          location?.county &&
          auction.county &&
          location.county !== auction.county
        ) {
          mismatches.push({
            id: auction.id,
            title: auction.title,
            storedCounty: auction.county,
            geocodedCounty: location.county,
            coordinates: [auction.latitude, auction.longitude],
          });
          await db
            .update(auctions)
            .set({ county: location.county })
            .where(eq(auctions.id, auction.id));
          fixed++;
        }
        validated++;
      } catch {
        // skip on error
      }
    }

    return c.json({
      success: true,
      validated,
      fixed,
      mismatches: mismatches.length,
      details: mismatches.slice(0, 20),
    });
  } catch (error) {
    console.error("Failed to validate counties:", error);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

api.get("/auctions/needs-review", async (c) => {
  try {
    const needsReview = await db.query.auctions.findMany({
      where: eq(auctions.needsDateReview, true),
      orderBy: [desc(auctions.scrapedAt)],
      limit: 100,
    });
    return c.json({
      success: true,
      count: needsReview.length,
      auctions: needsReview,
    });
  } catch (error) {
    console.error("Failed to get auctions needing review:", error);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

api.post("/auctions/:id/set-date", async (c) => {
  try {
    const id = c.req.param("id");
    const { auctionDate } = await c.req.json();
    if (!auctionDate) {
      return c.json({ success: false, message: "auctionDate is required" }, 400);
    }
    const date = new Date(auctionDate);
    if (isNaN(date.getTime())) {
      return c.json({ success: false, message: "Invalid date format" }, 400);
    }
    await db
      .update(auctions)
      .set({
        auctionDate: date,
        needsDateReview: false,
        dateExtractionMethod: "manual",
        dateExtractionAttempted: new Date(),
      })
      .where(eq(auctions.id, parseInt(id)));
    return c.json({ success: true, message: "Auction date updated successfully" });
  } catch (error) {
    console.error("Failed to set auction date:", error);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

api.get("/auctions/source-stats", async (c) => {
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
    return c.json({ success: true, stats: stats.rows });
  } catch (error) {
    console.error("Failed to get source stats:", error);
    return c.json(
      { success: false, message: "Failed to get source statistics" },
      500,
    );
  }
});

api.get("/auctions/schedule", async (c) => {
  try {
    const settings = await automaticScraperService.getSettings();
    return c.json({ success: true, settings });
  } catch (error) {
    console.error("Failed to get schedule settings:", error);
    return c.json(
      { success: false, message: "Failed to get schedule settings" },
      500,
    );
  }
});

api.post("/auctions/schedule", async (c) => {
  try {
    const { enabled, cadence, scheduleTime } = await c.req.json();
    if (enabled !== undefined && typeof enabled !== "boolean") {
      return c.json({ success: false, message: "Invalid enabled value" }, 400);
    }
    if (
      cadence &&
      !["daily", "every-other-day", "weekly", "manual"].includes(cadence)
    ) {
      return c.json({ success: false, message: "Invalid cadence" }, 400);
    }
    if (scheduleTime && !/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(scheduleTime)) {
      return c.json({ success: false, message: "Invalid time format" }, 400);
    }
    const updates: any = { updatedAt: new Date() };
    if (enabled !== undefined) updates.enabled = enabled;
    if (cadence) updates.cadence = cadence;
    if (scheduleTime) updates.scheduleTime = scheduleTime;
    if (enabled && (cadence || scheduleTime)) {
      const current = await automaticScraperService.getSettings();
      const nextCadence = cadence || current.cadence;
      const nextTime = scheduleTime || current.scheduleTime;
      const now = new Date();
      updates.nextRun = (automaticScraperService as any).calculateNextRun(
        now,
        nextCadence,
        nextTime,
      );
    }
    await automaticScraperService.updateSettings(updates);
    return c.json({ success: true, message: "Schedule updated successfully" });
  } catch (error) {
    console.error("Failed to update schedule:", error);
    return c.json(
      { success: false, message: "Failed to update schedule" },
      500,
    );
  }
});

api.post("/auctions/schedule/recalculate", async (c) => {
  try {
    const nextRun = await automaticScraperService.recalculateNextRun();
    const settings = await automaticScraperService.getSettings();
    return c.json({
      success: true,
      message: "Next run recalculated",
      nextRun,
      settings,
    });
  } catch (error) {
    console.error("Failed to recalculate schedule:", error);
    return c.json(
      { success: false, message: "Failed to recalculate schedule" },
      500,
    );
  }
});

// ============================================================================
// Parcel aggregation
// ============================================================================
api.get("/parcels/aggregated", async (c) => {
  // Reads from the precomputed parcel_aggregated table (~1.5M rows, ownership
  // groups already dissolved). Replaces the legacy live-ArcGIS+turf adjacency
  // pipeline which exceeded the Workers CPU budget on busy bboxes (855
  // parcels → CPU limit).
  try {
    const minLon = c.req.query("minLon");
    const minLat = c.req.query("minLat");
    const maxLon = c.req.query("maxLon");
    const maxLat = c.req.query("maxLat");
    if (!minLon || !minLat || !maxLon || !maxLat) {
      return c.json(
        {
          success: false,
          message: "Bounding box required: minLon, minLat, maxLon, maxLat",
        },
        400,
      );
    }
    const result = await pool.query(
      `
        SELECT
          id,
          normalized_owner,
          county,
          parcel_count,
          total_acres,
          parcel_ids,
          ST_AsGeoJSON(geom) AS geometry_json
        FROM parcel_aggregated
        WHERE ST_Intersects(geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
        LIMIT 5000
      `,
      [
        parseFloat(minLon),
        parseFloat(minLat),
        parseFloat(maxLon),
        parseFloat(maxLat),
      ],
    );

    // Use the same property names the ArcGIS-shaped legacy response used —
    // MapLibre style expressions (['get', 'DEEDHOLDER'] etc.) and several
    // labels/popups in EnhancedMap.tsx read these exact field names.
    const features = result.rows
      .map((row: any) => {
        try {
          return {
            type: "Feature",
            geometry: JSON.parse(row.geometry_json),
            properties: {
              id: row.id,
              DEEDHOLDER: row.normalized_owner,
              COUNTYNAME: row.county,
              PARCEL_COUNT: row.parcel_count,
              TOTAL_ACRES: row.total_acres,
              PARCEL_IDS: row.parcel_ids,
            },
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return c.json({
      success: true,
      count: features.length,
      type: "FeatureCollection",
      features,
    });
  } catch (error) {
    console.error("Parcel aggregation error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to aggregate parcels",
      },
      500,
    );
  }
});

// ============================================================================
// Soil
// ============================================================================
api.get("/soil/mukey/:mukey", async (c) => {
  try {
    const mukey = c.req.param("mukey");
    if (!mukey) {
      return c.json(
        { success: false, message: "Map unit key (mukey) is required" },
        400,
      );
    }
    const soilData = await soilPropertiesService.getSoilDataByMukey(mukey);
    if (!soilData) {
      return c.json(
        { success: false, message: "No soil data found for this map unit key" },
        404,
      );
    }
    return c.json({ success: true, data: soilData });
  } catch (error) {
    console.error("Soil data query error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to fetch soil data",
      },
      500,
    );
  }
});

api.get("/soil/series", async (c) => {
  try {
    const series = await soilPropertiesService.getAllSoilSeries();
    return c.json({ success: true, count: series.length, series });
  } catch (error) {
    console.error("Soil series query error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch soil series",
      },
      500,
    );
  }
});

api.post("/soil/search", async (c) => {
  try {
    const criteria = await c.req.json();
    const results = await soilPropertiesService.searchSoilComponents(criteria);
    return c.json({ success: true, count: results.length, results });
  } catch (error) {
    console.error("Soil search error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to search soil data",
      },
      500,
    );
  }
});

api.get("/mukey/point", async (c) => {
  try {
    const lon = parseFloat(c.req.query("lon") || "");
    const lat = parseFloat(c.req.query("lat") || "");
    if (isNaN(lon) || isNaN(lat)) {
      return c.json(
        { success: false, message: "Valid longitude and latitude are required" },
        400,
      );
    }
    const mukey = await mukeyLookupService.getMukeyForPoint(lon, lat);
    if (!mukey) {
      return c.json(
        { success: false, message: "No soil map unit found for this location" },
        404,
      );
    }
    return c.json({ success: true, mukey });
  } catch (error) {
    console.error("Mukey lookup error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to lookup mukey",
      },
      500,
    );
  }
});

api.post("/mukey/polygon", async (c) => {
  try {
    const { wkt } = await c.req.json();
    if (!wkt || typeof wkt !== "string") {
      return c.json(
        { success: false, message: "Valid WKT geometry is required" },
        400,
      );
    }
    const mukeys = await mukeyLookupService.getMukeysForPolygon(wkt);
    return c.json({ success: true, count: mukeys.length, mukeys });
  } catch (error) {
    console.error("Mukey polygon lookup error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to lookup mukeys for polygon",
      },
      500,
    );
  }
});

// ============================================================================
// Fields
// ============================================================================
api.get("/fields/search", async (c) => {
  try {
    const minLat = c.req.query("minLat");
    const maxLat = c.req.query("maxLat");
    const minLon = c.req.query("minLon");
    const maxLon = c.req.query("maxLon");
    const limit = c.req.query("limit") || "50";
    if (!minLat || !maxLat || !minLon || !maxLon) {
      return c.json(
        {
          success: false,
          message:
            "Bounding box coordinates (minLat, maxLat, minLon, maxLon) are required",
        },
        400,
      );
    }
    const result = await fieldBoundaryService.searchFields(
      parseFloat(minLat),
      parseFloat(maxLat),
      parseFloat(minLon),
      parseFloat(maxLon),
      parseInt(limit),
    );
    return c.json({ success: true, ...result });
  } catch (error) {
    console.error("Field search error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to search field boundaries",
      },
      500,
    );
  }
});

api.get("/fields/:fieldId", async (c) => {
  try {
    const fieldId = c.req.param("fieldId");
    const field = await fieldBoundaryService.getFieldById(fieldId);
    if (!field) {
      return c.json({ success: false, message: "Field not found" }, 404);
    }
    return c.json({ success: true, field });
  } catch (error) {
    console.error("Field lookup error:", error);
    return c.json(
      { success: false, message: "Failed to fetch field data" },
      500,
    );
  }
});

api.post("/fields/nearby", async (c) => {
  try {
    const { latitude, longitude, radiusMeters = 100 } = await c.req.json();
    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return c.json(
        { success: false, message: "Valid latitude and longitude are required" },
        400,
      );
    }
    const fields = await fieldBoundaryService.findFieldsNearPoint(
      latitude,
      longitude,
      radiusMeters,
    );
    return c.json({ success: true, fields, count: fields.length });
  } catch (error) {
    console.error("Nearby fields error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to find nearby fields",
      },
      500,
    );
  }
});

api.get("/fields/:fieldId/details", async (c) => {
  try {
    const fieldId = c.req.param("fieldId");
    const details = await fieldBoundaryService.getFieldDetails(fieldId);
    if (!details) {
      return c.json(
        { success: false, message: "Field details not found" },
        404,
      );
    }
    return c.json({ success: true, ...details });
  } catch (error) {
    console.error("Field details error:", error);
    return c.json(
      { success: false, message: "Failed to fetch field details" },
      500,
    );
  }
});

api.get("/parcels", async (c) => {
  try {
    const bounds = c.req.query("bounds");
    if (!bounds || typeof bounds !== "string") {
      return c.json(
        {
          success: false,
          message:
            "Bounds parameter is required (format: minLon,minLat,maxLon,maxLat)",
        },
        400,
      );
    }
    const [minLon, minLat, maxLon, maxLat] = bounds.split(",").map(Number);
    if ([minLon, minLat, maxLon, maxLat].some(isNaN)) {
      return c.json(
        {
          success: false,
          message: "Invalid bounds format. Expected: minLon,minLat,maxLon,maxLat",
        },
        400,
      );
    }
    return c.json({ type: "FeatureCollection", features: [] });
  } catch (error) {
    console.error("Parcels search error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to search parcels",
      },
      500,
    );
  }
});

// ============================================================================
// Auctions (main list/count + background scraping)
// ============================================================================
api.get("/auctions/all", async (c) => {
  try {
    const allAuctions = await db.query.auctions.findMany({
      orderBy: [desc(auctions.scrapedAt)],
      limit: 500,
    });
    const bySource: Record<string, any[]> = {};
    allAuctions.forEach((auction) => {
      const source = auction.sourceWebsite || "Unknown";
      if (!bySource[source]) bySource[source] = [];
      bySource[source].push(auction);
    });
    return c.json({
      success: true,
      total: allAuctions.length,
      withCoordinates: allAuctions.filter((a) => a.latitude && a.longitude).length,
      withoutCoordinates: allAuctions.filter((a) => !a.latitude || !a.longitude)
        .length,
      sources: Object.keys(bySource).length,
      auctions: allAuctions,
      bySource: Object.fromEntries(
        Object.entries(bySource).map(([k, v]) => [k, v.length]),
      ),
    });
  } catch (error) {
    console.error("Failed to list all auctions:", error);
    return c.json({ success: false, message: "Internal server error" }, 500);
  }
});

api.get("/auctions", async (c) => {
  try {
    const minLat = c.req.query("minLat");
    const maxLat = c.req.query("maxLat");
    const minLon = c.req.query("minLon");
    const maxLon = c.req.query("maxLon");
    const minAcreage = c.req.query("minAcreage");
    const maxAcreage = c.req.query("maxAcreage");
    const minCSR2 = c.req.query("minCSR2");
    const maxCSR2 = c.req.query("maxCSR2");
    const auctionDateRange = c.req.query("auctionDateRange");
    const minValue = c.req.query("minValue");
    const maxValue = c.req.query("maxValue");
    const includeWithoutCoords = c.req.query("includeWithoutCoords");
    const landTypes = c.req.queries("landTypes[]");
    const counties = c.req.queries("counties[]");

    if (!minLat || !maxLat || !minLon || !maxLon) {
      return c.json(
        {
          success: false,
          message:
            "Bounding box coordinates are required (minLat, maxLat, minLon, maxLon)",
        },
        400,
      );
    }

    const conditions: any[] = [eq(auctions.status, "active")];
    // Exclude non-land listings (equipment/personal-property/etc.); keep nulls
    // (un-backfilled rows) visible.
    conditions.push(sql`(${auctions.propertyCategory} IS NULL OR ${auctions.propertyCategory} <> 'non_land')`);
    if (minAcreage)
      conditions.push(gte(auctions.acreage, parseFloat(minAcreage)));
    if (maxAcreage)
      conditions.push(lte(auctions.acreage, parseFloat(maxAcreage)));
    if (auctionDateRange && auctionDateRange !== "all") {
      const daysAhead = parseInt(auctionDateRange);
      const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
      conditions.push(lte(auctions.auctionDate, futureDate));
    }
    // Only upcoming auctions belong on the map. Rows whose date never parsed are
    // kept visible (needsDateReview backfills them); rows with a known past date
    // are not. Without this, expired rows sort first under `auction_date ASC` and
    // consume the whole row limit before a single upcoming auction is reached.
    conditions.push(
      sql`(${auctions.auctionDate} IS NULL OR ${auctions.auctionDate} >= CURRENT_DATE)`,
    );
    // The viewport is filtered in SQL, before the limit. It used to be applied in
    // JS afterwards, which meant the limit truncated the result set before the
    // map's bounds were ever considered — so panning could not recover a row.
    const bbox = sql`(${auctions.latitude} BETWEEN ${parseFloat(minLat)} AND ${parseFloat(maxLat)} AND ${auctions.longitude} BETWEEN ${parseFloat(minLon)} AND ${parseFloat(maxLon)})`;
    conditions.push(
      includeWithoutCoords === "true"
        ? sql`(${auctions.latitude} IS NULL OR ${auctions.longitude} IS NULL OR ${bbox})`
        : bbox,
    );

    const auctionList = await db.query.auctions.findMany({
      where: and(...conditions),
      orderBy: [asc(auctions.auctionDate)],
      limit: 2000,
    });

    let filteredAuctions = auctionList;
    if (minCSR2) {
      filteredAuctions = filteredAuctions.filter(
        (a) => !a.csr2Mean || a.csr2Mean >= parseFloat(minCSR2),
      );
    }
    if (maxCSR2) {
      filteredAuctions = filteredAuctions.filter(
        (a) => !a.csr2Mean || a.csr2Mean <= parseFloat(maxCSR2),
      );
    }
    if (minValue) {
      filteredAuctions = filteredAuctions.filter(
        (a) => !a.estimatedValue || a.estimatedValue >= parseFloat(minValue),
      );
    }
    if (maxValue) {
      filteredAuctions = filteredAuctions.filter(
        (a) => !a.estimatedValue || a.estimatedValue <= parseFloat(maxValue),
      );
    }
    // Viewport filtering now happens in SQL above, before the row limit.
    if (landTypes && landTypes.length > 0) {
      filteredAuctions = filteredAuctions.filter(
        (a) => a.landType && landTypes.includes(a.landType),
      );
    }
    if (counties && counties.length > 0) {
      filteredAuctions = filteredAuctions.filter(
        (a) => a.county && counties.includes(a.county),
      );
    }

    return c.json({
      success: true,
      auctions: filteredAuctions,
      count: filteredAuctions.length,
      totalInDatabase: auctionList.length,
      withoutCoordinates: auctionList.filter((a) => !a.latitude || !a.longitude)
        .length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Auction fetch error:", error);
    return c.json({ success: false, message: "Failed to fetch auctions" }, 500);
  }
});

api.get("/auctions/count", async (c) => {
  try {
    const minAcreage = c.req.query("minAcreage");
    const maxAcreage = c.req.query("maxAcreage");
    const minCSR2 = c.req.query("minCSR2");
    const maxCSR2 = c.req.query("maxCSR2");
    const auctionDateRange = c.req.query("auctionDateRange");
    const minValue = c.req.query("minValue");
    const maxValue = c.req.query("maxValue");
    const landTypes = c.req.queries("landTypes[]");
    const counties = c.req.queries("counties[]");

    const conditions: any[] = [eq(auctions.status, "active")];
    // Exclude non-land listings (equipment/personal-property/etc.); keep nulls
    // (un-backfilled rows) visible.
    conditions.push(sql`(${auctions.propertyCategory} IS NULL OR ${auctions.propertyCategory} <> 'non_land')`);
    if (minAcreage)
      conditions.push(gte(auctions.acreage, parseFloat(minAcreage)));
    if (maxAcreage)
      conditions.push(lte(auctions.acreage, parseFloat(maxAcreage)));
    if (minCSR2) conditions.push(gte(auctions.csr2Mean, parseFloat(minCSR2)));
    if (maxCSR2) conditions.push(lte(auctions.csr2Mean, parseFloat(maxCSR2)));
    if (minValue)
      conditions.push(gte(auctions.estimatedValue, parseFloat(minValue)));
    if (maxValue)
      conditions.push(lte(auctions.estimatedValue, parseFloat(maxValue)));
    if (auctionDateRange && auctionDateRange !== "all") {
      const daysAhead = parseInt(auctionDateRange);
      const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
      conditions.push(lte(auctions.auctionDate, futureDate));
    }

    const auctionList = await db.query.auctions.findMany({
      where: and(...conditions),
    });

    let filtered = auctionList;
    if (landTypes && landTypes.length > 0) {
      filtered = filtered.filter(
        (a) => a.landType && landTypes.includes(a.landType),
      );
    }
    if (counties && counties.length > 0) {
      filtered = filtered.filter(
        (a) => a.county && counties.includes(a.county),
      );
    }
    return c.json({ success: true, count: filtered.length });
  } catch (error) {
    console.error("Auction count error:", error);
    return c.json(
      { success: false, message: "Failed to count auctions", count: 0 },
      500,
    );
  }
});

api.post("/auctions/refresh", async (c) => {
  try {
    // Enqueue rather than scrape inline. Calling scrapeAllSources() here ran the
    // whole 51-source crawl inside one invocation, which exhausted the subrequest
    // budget after one or two sources and then failed silently — so this button
    // reported success while capturing almost nothing. Now it fans the run out
    // across the queue pipeline, where each source and listing gets its own budget.
    const runId = `manual_${Date.now()}`;
    // ?limit=N enqueues only the first N sources — for verifying the pipeline
    // without paying for a full ~1,400-page crawl.
    const limit = parseInt(c.req.query("limit") ?? "", 10);
    const queued = await enqueueScrapeRun(c.env, runId, Number.isFinite(limit) ? limit : undefined);
    return c.json({
      success: true,
      runId,
      sourcesQueued: queued,
      message: `Scrape run ${runId} queued across ${queued} sources. Progress appears in the queue consumers.`,
    });
  } catch (error) {
    console.error("Auction scraping trigger error:", error);
    return c.json({ success: false, message: "Failed to start scraping" }, 500);
  }
});

api.get("/auctions/scrape-progress", async (c) => {
  try {
    const progress = auctionScraperService.getScrapeProgress();
    return c.json({
      success: true,
      isActive: progress.isActive || false,
      currentSource: progress.currentSource || "",
      completedSources: progress.completedSources || 0,
      totalSources: progress.totalSources || 24,
      currentSourceProgress: progress.currentSourceProgress || 0,
    });
  } catch (error) {
    console.error("Scrape progress error:", error);
    return c.json(
      {
        success: false,
        isActive: false,
        currentSource: "",
        completedSources: 0,
        totalSources: 24,
        currentSourceProgress: 0,
        message: "Failed to get scrape progress",
      },
      500,
    );
  }
});

api.post("/auctions/archive-non-farm", async (c) => {
  try {
    const archiverService = new AuctionArchiverService();
    const beforeCount = await db.query.auctions.findMany();
    const totalBefore = beforeCount.length;
    await archiverService.archivePastAuctions();
    const afterCount = await db.query.auctions.findMany();
    const totalAfter = afterCount.length;
    const archived = totalBefore - totalAfter;
    return c.json({
      success: true,
      message: `Successfully archived ${archived} auctions (past dates, sold, and non-farm properties)`,
      archived,
      totalBefore,
      totalAfter,
      remaining: totalAfter,
    });
  } catch (error) {
    console.error("Archive error:", error);
    return c.json(
      {
        success: false,
        message: "Failed to archive auctions",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500,
    );
  }
});

// ============================================================================
// Enrichment
// ============================================================================
api.get("/auctions/enrichment-stats", async (c) => {
  try {
    const { auctionEnrichmentService } = await import(
      "../../../server/services/auctionEnrichment"
    );
    const stats = await auctionEnrichmentService.getEnrichmentStats();
    return c.json({ success: true, stats });
  } catch (error) {
    console.error("Enrichment stats error:", error);
    return c.json(
      { success: false, message: "Failed to get enrichment statistics" },
      500,
    );
  }
});

api.get("/auctions/enrichment-errors", async (c) => {
  try {
    const failedAuctions = await db.query.auctions.findMany({
      where: eq(auctions.enrichmentStatus, "failed"),
      limit: 50,
    });
    return c.json({
      success: true,
      errors: failedAuctions.map((a) => ({
        id: a.id,
        title: a.title,
        error: a.enrichmentError,
        url: a.url,
      })),
    });
  } catch (error) {
    console.error("Enrichment errors error:", error);
    return c.json(
      { success: false, message: "Failed to get enrichment errors" },
      500,
    );
  }
});

api.post("/auctions/enrich-all", async (c) => {
  try {
    c.executionCtx.waitUntil(
      (async () => {
        const { enrichAllPendingAuctions } = await import(
          "../../../server/services/enrichmentQueue"
        );
        try {
          const stats = await enrichAllPendingAuctions(pool);
          console.log("✅ Enrichment complete:", stats);
        } catch (error) {
          console.error("❌ Enrichment failed:", error);
        }
      })(),
    );
    return c.json({ success: true, message: "Enrichment started in background" });
  } catch (error) {
    console.error("Enrich all error:", error);
    return c.json(
      { success: false, message: "Failed to start enrichment" },
      500,
    );
  }
});

api.post("/auctions/retry-failed-enrichments", async (c) => {
  try {
    await db
      .update(auctions)
      .set({ enrichmentStatus: "pending", enrichmentError: null })
      .where(eq(auctions.enrichmentStatus, "failed"));
    c.executionCtx.waitUntil(
      (async () => {
        const { enrichAllPendingAuctions } = await import(
          "../../../server/services/enrichmentQueue"
        );
        try {
          const stats = await enrichAllPendingAuctions(pool);
          console.log("✅ Retry enrichment complete:", stats);
        } catch (error) {
          console.error("❌ Retry enrichment failed:", error);
        }
      })(),
    );
    return c.json({
      success: true,
      message: "Retry enrichment started in background",
    });
  } catch (error) {
    console.error("Retry enrichments error:", error);
    return c.json(
      { success: false, message: "Failed to retry enrichments" },
      500,
    );
  }
});

// ============================================================================
// Blocklist
// ============================================================================
api.get("/auctions/blocklist/all", async (c) => {
  try {
    const blocked = await db.query.auctionBlocklist.findMany({
      orderBy: [desc(auctionBlocklist.addedAt)],
    });
    return c.json({ success: true, blocklist: blocked, count: blocked.length });
  } catch (error) {
    console.error("Blocklist fetch error:", error);
    return c.json(
      { success: false, message: "Failed to fetch blocklist" },
      500,
    );
  }
});

api.post("/auctions/blocklist/add", async (c) => {
  try {
    const { url, reason = "non-farm" } = await c.req.json();
    if (!url) {
      return c.json({ success: false, message: "URL is required" }, 400);
    }
    const existing = await db.query.auctionBlocklist.findFirst({
      where: eq(auctionBlocklist.url, url),
    });
    if (existing) {
      return c.json({
        success: true,
        message: "URL is already in blocklist",
        alreadyBlocked: true,
      });
    }
    await db.insert(auctionBlocklist).values({ url, reason, addedBy: "ui" });
    const auction = await db.query.auctions.findFirst({
      where: eq(auctions.url, url),
    });
    let deletedId: number | null = null;
    if (auction) {
      await db.delete(auctions).where(eq(auctions.url, url));
      deletedId = auction.id;
    }
    return c.json({
      success: true,
      message: "URL added to blocklist",
      deletedAuctionId: deletedId,
    });
  } catch (error) {
    console.error("Add to blocklist error:", error);
    return c.json(
      { success: false, message: "Failed to add to blocklist" },
      500,
    );
  }
});

api.delete("/auctions/blocklist/:id", async (c) => {
  try {
    const id = parseInt(c.req.param("id"));
    if (isNaN(id)) {
      return c.json({ success: false, message: "Invalid blocklist ID" }, 400);
    }
    await db.delete(auctionBlocklist).where(eq(auctionBlocklist.id, id));
    return c.json({ success: true, message: "URL removed from blocklist" });
  } catch (error) {
    console.error("Remove from blocklist error:", error);
    return c.json(
      { success: false, message: "Failed to remove from blocklist" },
      500,
    );
  }
});

// User-facing upcoming-auctions feed: active + dated today-or-later.
// Registered BEFORE "/auctions/:id" so "upcoming" isn't parsed as an id.
api.get("/auctions/upcoming", async (c) => {
  try {
    const list = await db.query.auctions.findMany({
      where: and(
        eq(auctions.status, "active"),
        sql`auction_date::date >= CURRENT_DATE`,
        sql`(${auctions.propertyCategory} IS NULL OR ${auctions.propertyCategory} <> 'non_land')`,
      ),
      orderBy: [asc(auctions.auctionDate)],
      limit: 500,
    });
    // Attach a fast comps-based estimated value per auction (county factors).
    const factors = await comparablesService.getCountyFactors();
    const withEst = list.map((a) => {
      const f = a.county ? factors[a.county.trim().toLowerCase()] : undefined;
      let estValuePerAcre: number | null = null;
      if (f) {
        if (a.csr2Mean && a.csr2Mean > 0 && f.dollarPerCsr2Point) {
          estValuePerAcre = Math.round(a.csr2Mean * f.dollarPerCsr2Point);
        } else if (f.medianPerAcre) {
          estValuePerAcre = f.medianPerAcre;
        }
      }
      const estTotalValue = estValuePerAcre && a.acreage ? Math.round(estValuePerAcre * a.acreage) : null;
      return { ...a, estValuePerAcre, estTotalValue };
    });
    return c.json({ success: true, auctions: withEst });
  } catch (error) {
    console.error("Upcoming auctions feed error:", error);
    return c.json({ success: false, message: "Failed to get upcoming auctions" }, 500);
  }
});

// ============================================================================
// Auction details + valuation
// ============================================================================
api.get("/auctions/:id", async (c) => {
  try {
    const auctionId = parseInt(c.req.param("id"));
    if (isNaN(auctionId)) {
      return c.json({ success: false, message: "Invalid auction ID" }, 400);
    }
    const auction = await db.query.auctions.findFirst({
      where: eq(auctions.id, auctionId),
    });
    if (!auction) {
      return c.json({ success: false, message: "Auction not found" }, 404);
    }
    return c.json({ success: true, auction });
  } catch (error) {
    console.error("Auction details error:", error);
    return c.json(
      { success: false, message: "Failed to fetch auction details" },
      500,
    );
  }
});

api.post("/auctions/:id/valuation", async (c) => {
  try {
    const auctionId = parseInt(c.req.param("id"));
    if (isNaN(auctionId)) {
      return c.json({ success: false, message: "Invalid auction ID" }, 400);
    }
    const valuation = await auctionScraperService.calculateValuation(auctionId);
    return c.json({ success: true, valuation });
  } catch (error) {
    console.error("Auction valuation error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to calculate valuation",
      },
      500,
    );
  }
});

api.post("/auctions/:id/enrich", async (c) => {
  try {
    const auctionId = parseInt(c.req.param("id"));
    if (isNaN(auctionId)) {
      return c.json({ success: false, message: "Invalid auction ID" }, 400);
    }
    const { auctionEnrichmentService } = await import(
      "../../../server/services/auctionEnrichment"
    );
    const result = await auctionEnrichmentService.enrichAuction(auctionId);
    return c.json({ success: true, enrichment: result });
  } catch (error) {
    console.error("Enrich auction error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to enrich auction",
      },
      500,
    );
  }
});

api.post("/auctions/:id/prepare-valuation", async (c) => {
  try {
    const auctionId = parseInt(c.req.param("id"));
    if (isNaN(auctionId)) {
      return c.json({ success: false, message: "Invalid auction ID" }, 400);
    }

    const auction = await db.query.auctions.findFirst({
      where: eq(auctions.id, auctionId),
    });
    if (!auction) {
      return c.json({ success: false, message: "Auction not found" }, 404);
    }

    const extractedInfo = await auctionParcelExtractor.extractParcelInfo(auction);

    if (extractedInfo.csr2Data?.mean && !auction.csr2Mean) {
      // csr2Min/Max are integer columns; the AI sometimes returns decimals
      // like 84.1, so coerce before writing.
      const csr2MinInt =
        extractedInfo.csr2Data.min != null
          ? Math.round(extractedInfo.csr2Data.min)
          : null;
      const csr2MaxInt =
        extractedInfo.csr2Data.max != null
          ? Math.round(extractedInfo.csr2Data.max)
          : null;
      await db
        .update(auctions)
        .set({
          csr2Mean: extractedInfo.csr2Data.mean,
          csr2Min: csr2MinInt,
          csr2Max: csr2MaxInt,
        })
        .where(eq(auctions.id, auctionId));
      auction.csr2Mean = extractedInfo.csr2Data.mean;
      auction.csr2Min = csr2MinInt;
      auction.csr2Max = csr2MaxInt;
    }

    const valuationLandType =
      auctionParcelExtractor.determineValuationLandType(auction, extractedInfo);
    const targetCounty = extractedInfo.actualCounty || auction.county;
    const targetAcreage = extractedInfo.actualAcreage || auction.acreage;

    let matchedParcel: any = null;
    let csr2Data: any = null;
    let soilData: any = null;
    let matchStrategy = "none";
    let matchConfidence = 0;

    // Strategy 1: Legal description + PLSS
    try {
      const { geminiParserService } = await import(
        "../../../server/services/geminiParser"
      );
      const { blmPlssService } = await import(
        "../../../server/services/blmPlss"
      );
      const parsedLegal = await geminiParserService.parseLegalDescription(auction);
      if (parsedLegal.plss && parsedLegal.confidence > 50) {
        const blmResult = await blmPlssService.queryPLSS(parsedLegal.plss);
        if (blmResult && blmResult.geometry) {
          const plssGeomJson = JSON.stringify(blmResult.geometry);
          const legalDescQuery = `
            SELECT *,
              (area_sqm / 4046.86) as acres,
              ST_AsGeoJSON(geom) as geometry_json
            FROM parcels
            WHERE county_name = $1
              AND ST_Intersects(geom, ST_GeomFromGeoJSON($2))
            ORDER BY ST_Area(ST_Intersection(geom, ST_GeomFromGeoJSON($2))) DESC
            LIMIT 5
          `;
          const result = await pool.query(legalDescQuery, [
            targetCounty,
            plssGeomJson,
          ]);
          if (result.rows.length > 0) {
            matchedParcel = result.rows[0];
            matchStrategy = "legal_description_plss";
            matchConfidence = Math.min(parsedLegal.confidence, 95);
          }
        }
      }
    } catch (error) {
      console.log(
        "Strategy 1 failed:",
        error instanceof Error ? error.message : error,
      );
    }

    // Strategy 2: Owner-name matching
    if (!matchedParcel && targetCounty && targetAcreage) {
      try {
        const ownerPatterns = [
          /seller[:\s]+([^,.\n]+)/i,
          /estate of ([^,.\n]+)/i,
          /([A-Z][a-z]+ [A-Z][a-z]+) estate/i,
          /owned by ([^,.\n]+)/i,
        ];
        let auctionOwner = "";
        for (const pattern of ownerPatterns) {
          const match = (
            auction.enrichedDescription ||
            auction.description ||
            ""
          ).match(pattern);
          if (match) {
            auctionOwner = match[1].trim();
            break;
          }
        }
        if (auctionOwner) {
          const ownerQuery = `
            SELECT *,
              similarity(deed_holder_normalized, $1) as name_similarity,
              (area_sqm / 4046.86) as acres
            FROM parcels
            WHERE county_name = $2
              AND (area_sqm / 4046.86) BETWEEN $3 AND $4
            ORDER BY name_similarity DESC, ABS((area_sqm / 4046.86) - $5)
            LIMIT 5
          `;
          const acreageTolerance = targetAcreage * 0.1;
          const result = await pool.query(ownerQuery, [
            auctionOwner.toUpperCase(),
            targetCounty,
            targetAcreage - acreageTolerance,
            targetAcreage + acreageTolerance,
            targetAcreage,
          ]);
          if (result.rows.length > 0 && result.rows[0].name_similarity > 0.3) {
            matchedParcel = result.rows[0];
            matchStrategy = "owner_name_fuzzy";
            matchConfidence = Math.min(
              result.rows[0].name_similarity * 100,
              85,
            );
          }
        }
      } catch (error) {
        console.log(
          "Strategy 2 failed:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    // Strategy 3: Acreage + county
    if (!matchedParcel && targetCounty && targetAcreage) {
      try {
        const acreageQuery = `
          SELECT *, (area_sqm / 4046.86) as acres
          FROM parcels
          WHERE county_name = $1
            AND (area_sqm / 4046.86) BETWEEN $2 AND $3
          ORDER BY ABS((area_sqm / 4046.86) - $4)
          LIMIT 5
        `;
        const tolerance = targetAcreage * 0.08;
        const result = await pool.query(acreageQuery, [
          targetCounty,
          targetAcreage - tolerance,
          targetAcreage + tolerance,
          targetAcreage,
        ]);
        if (result.rows.length > 0) {
          matchedParcel = result.rows[0];
          matchStrategy = "acreage_county";
          matchConfidence =
            60 -
            (Math.abs(matchedParcel.acres - targetAcreage) / targetAcreage) * 20;
        }
      } catch (error) {
        console.log(
          "Strategy 3 failed:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    // Strategy 4: Radius search fallback
    if (!matchedParcel && auction.latitude && auction.longitude) {
      try {
        const nearbyParcels = await findParcelsAtPoint(
          auction.longitude,
          auction.latitude,
          pool,
        );
        if (nearbyParcels && nearbyParcels.length > 0) {
          if (targetAcreage) {
            matchedParcel = nearbyParcels.reduce((best: any, current: any) => {
              const currentDiff = Math.abs((current.acres || 0) - targetAcreage);
              const bestDiff = Math.abs((best.acres || 0) - targetAcreage);
              return currentDiff < bestDiff ? current : best;
            });
          } else {
            matchedParcel = nearbyParcels[0];
          }
          if (matchedParcel.geometry) {
            try {
              const csr2Result = await csr2Service.calculateAverageCSR2(
                matchedParcel.geometry,
              );
              if (csr2Result) csr2Data = csr2Result;
            } catch (error) {
              console.error("Failed to fetch CSR2:", error);
            }
          }
          if (matchedParcel.coordinates) {
            try {
              const [lon, lat] = matchedParcel.coordinates;
              const mukeyResult = await (mukeyLookupService as any).getMukeyAtPoint(
                lon,
                lat,
              );
              if (mukeyResult && mukeyResult.mukey) {
                const soilResult = await (
                  soilPropertiesService as any
                ).getSoilByMukey(mukeyResult.mukey);
                if (soilResult) soilData = soilResult;
              }
            } catch (error) {
              console.error("Failed to fetch soil data:", error);
            }
          }
        }
      } catch (error) {
        console.error("Error querying parcels:", error);
      }
    }

    const preparedData = {
      address: auction.address || extractedInfo.actualLocation || "",
      county: targetCounty || "",
      state: auction.state || "Iowa",
      acreage: targetAcreage || 0,
      landType: valuationLandType,
      extractedInfo: {
        legalDescription: extractedInfo.legalDescription,
        actualLocation: extractedInfo.actualLocation,
        tracts: extractedInfo.numberOfTracts || 1,
        confidence: extractedInfo.confidence,
        reasoning: extractedInfo.reasoning,
      },
      parcelNumber: matchedParcel?.parcel_number,
      ownerName: matchedParcel?.deed_holder,
      fieldWkt: matchedParcel?.geometry_json
        ? JSON.parse(matchedParcel.geometry_json)
        : null,
      coordinates: matchedParcel?.geometry_json
        ? (() => {
            try {
              const geom = JSON.parse(matchedParcel.geometry_json);
              if (
                geom.type === "MultiPolygon" &&
                geom.coordinates?.[0]?.[0]?.[0]
              ) {
                return [
                  geom.coordinates[0][0][0][0],
                  geom.coordinates[0][0][0][1],
                ];
              } else if (
                geom.type === "Polygon" &&
                geom.coordinates?.[0]?.[0]
              ) {
                return [geom.coordinates[0][0][0], geom.coordinates[0][0][1]];
              }
              return null;
            } catch {
              return null;
            }
          })()
        : auction.latitude && auction.longitude
          ? [auction.longitude, auction.latitude]
          : null,
      confidence: Math.round(matchConfidence),
      matchedBy: matchStrategy,
      csr2Mean: auction.csr2Mean || csr2Data?.mean,
      csr2Min: auction.csr2Min || csr2Data?.min,
      csr2Max: auction.csr2Max || csr2Data?.max,
      csr2Count: csr2Data?.count,
      csr2Source: auction.csr2Mean
        ? "listing"
        : csr2Data?.mean
          ? "database"
          : undefined,
      mukey: soilData?.mukey,
      soilData: soilData
        ? {
            series: soilData.soil_series,
            slope: soilData.slope_avg,
            drainage: soilData.drainage_class,
            hydrologicGroup: soilData.hydrologic_group,
            farmlandClass: soilData.farmland_class,
            texture: soilData.texture,
            components: soilData.components,
          }
        : null,
      sourceAuctionId: auctionId,
      sourceAuctionTitle: auction.title,
      auctionDate: auction.auctionDate,
      auctioneer: auction.auctioneer,
      hasParcelMatch: !!matchedParcel,
      hasCSR2: !!csr2Data || !!auction.csr2Mean,
      hasSoilData: !!soilData,
    };

    return c.json({
      success: true,
      data: preparedData,
      matchMetadata: {
        strategy: matchStrategy,
        confidence: Math.round(matchConfidence),
      },
    });
  } catch (error) {
    console.error("Prepare valuation error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to prepare valuation data",
      },
      500,
    );
  }
});

api.post("/auctions/refresh/landwatch", async (c) => {
  try {
    c.executionCtx.waitUntil(
      auctionScraperService
        .scrapeLandWatchPages()
        .then((results) =>
          console.log(
            `✅ LandWatch scraping completed: ${results.length} auctions`,
          ),
        )
        .catch((error) =>
          console.error("❌ LandWatch scraping failed:", error),
        ),
    );
    return c.json({
      success: true,
      message:
        "LandWatch auction scraping started in background. This may take a few minutes.",
    });
  } catch (error) {
    console.error("LandWatch scraping trigger error:", error);
    return c.json(
      { success: false, message: "Failed to start LandWatch scraping" },
      500,
    );
  }
});

api.post("/auctions/add-by-url", async (c) => {
  try {
    const { url, sourceName } = await c.req.json();
    if (!url) {
      return c.json({ success: false, message: "URL is required" }, 400);
    }
    try {
      new URL(url);
    } catch {
      return c.json({ success: false, message: "Invalid URL format" }, 400);
    }
    const result = await auctionScraperService.scrapeSpecificUrl(url, sourceName);
    if (result) {
      return c.json({
        success: true,
        message: "Auction added successfully!",
        auction: result,
      });
    }
    return c.json(
      {
        success: false,
        message:
          "Could not extract auction data from this URL. Please ensure it's a valid auction listing.",
      },
      400,
    );
  } catch (error) {
    console.error("Manual auction addition error:", error);
    return c.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to add auction",
      },
      500,
    );
  }
});

// ============================================================================
// Diagnostics
// ============================================================================
api.get("/auctions/diagnostics/latest", async (c) => {
  try {
    const { scraperDiagnosticsService } = await import(
      "../../../server/services/scraperDiagnostics"
    );
    const stats = scraperDiagnosticsService.getLatestScrapeStats();
    const metrics = scraperDiagnosticsService.calculateCoverageMetrics(stats);
    const lastScrapeTime = stats.length > 0 ? stats[0].timestamp : null;
    return c.json({
      success: true,
      lastScrapeTime,
      stats,
      metrics,
      summary: {
        totalSources: stats.length,
        totalDiscovered: stats.reduce((sum, s) => sum + s.discoveredUrls, 0),
        totalSaved: stats.reduce((sum, s) => sum + s.successfulSaves, 0),
        iowaDiscovered: stats.reduce((sum, s) => sum + s.iowaDiscovered, 0),
        iowaSaved: stats.reduce((sum, s) => sum + s.iowaSaved, 0),
      },
    });
  } catch (error) {
    console.error("Diagnostics latest error:", error);
    return c.json(
      { success: false, message: "Failed to get latest diagnostics" },
      500,
    );
  }
});

api.get("/auctions/diagnostics/history", async (c) => {
  try {
    const days = parseInt(c.req.query("days") || "7");
    const { scraperDiagnosticsService } = await import(
      "../../../server/services/scraperDiagnostics"
    );
    const stats = scraperDiagnosticsService.getHistoricalStats(days);
    return c.json({ success: true, days, stats, count: stats.length });
  } catch (error) {
    console.error("Diagnostics history error:", error);
    return c.json(
      { success: false, message: "Failed to get historical diagnostics" },
      500,
    );
  }
});

api.get("/auctions/diagnostics/coverage", async (c) => {
  try {
    const { scraperDiagnosticsService } = await import(
      "../../../server/services/scraperDiagnostics"
    );
    const stats = scraperDiagnosticsService.getLatestScrapeStats();
    const metrics = scraperDiagnosticsService.calculateCoverageMetrics(stats);
    const sortedMetrics = metrics.sort(
      (a, b) => a.coverage_percentage - b.coverage_percentage,
    );
    return c.json({
      success: true,
      metrics: sortedMetrics,
      summary: {
        averageCoverage:
          metrics.length > 0
            ? Math.round(
                metrics.reduce((sum, m) => sum + m.coverage_percentage, 0) /
                  metrics.length,
              )
            : 0,
        lowCoverageCount: metrics.filter((m) => m.coverage_percentage < 80)
          .length,
        iowaAverageCoverage:
          metrics.length > 0
            ? Math.round(
                metrics.reduce(
                  (sum, m) => sum + m.iowa_coverage_percentage,
                  0,
                ) / metrics.length,
              )
            : 0,
      },
    });
  } catch (error) {
    console.error("Diagnostics coverage error:", error);
    return c.json(
      { success: false, message: "Failed to get coverage metrics" },
      500,
    );
  }
});

api.get("/auctions/diagnostics/missing-iowa", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "100");
    const { scraperDiagnosticsService } = await import(
      "../../../server/services/scraperDiagnostics"
    );
    const missing = scraperDiagnosticsService.getMissingIowaAuctions(limit);
    const bySource: Record<string, any[]> = {};
    missing.forEach((m) => {
      if (!bySource[m.source]) bySource[m.source] = [];
      bySource[m.source].push(m);
    });
    return c.json({
      success: true,
      total: missing.length,
      missing,
      bySource: Object.fromEntries(
        Object.entries(bySource).map(([k, v]) => [k, v.length]),
      ),
    });
  } catch (error) {
    console.error("Diagnostics missing Iowa error:", error);
    return c.json(
      { success: false, message: "Failed to get missing Iowa auctions" },
      500,
    );
  }
});

api.get("/auctions/diagnostics/recent-acquisitions", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "10");
    const recentAuctions = await db.query.auctions.findMany({
      orderBy: [desc(auctions.scrapedAt)],
      limit,
    });
    return c.json({ success: true, auctions: recentAuctions });
  } catch (error) {
    console.error("Recent acquisitions error:", error);
    return c.json(
      { success: false, message: "Failed to get recent acquisitions" },
      500,
    );
  }
});

api.get("/auctions/diagnostics/upcoming", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "15");
    const upcomingAuctions = await db.query.auctions.findMany({
      where: sql`auction_date::date >= CURRENT_DATE`,
      orderBy: [asc(auctions.auctionDate)],
      limit,
    });
    return c.json({ success: true, auctions: upcomingAuctions });
  } catch (error) {
    console.error("Upcoming auctions error:", error);
    return c.json(
      { success: false, message: "Failed to get upcoming auctions" },
      500,
    );
  }
});

api.get("/auctions/investigate", async (c) => {
  try {
    const totalCount = await db
      .select({ count: sql<string>`count(*)` })
      .from(auctions);
    const withCoords = await db
      .select({ count: sql<string>`count(*)` })
      .from(auctions)
      .where(sql`latitude IS NOT NULL AND longitude IS NOT NULL`);
    const withoutCoords = await db
      .select({ count: sql<string>`count(*)` })
      .from(auctions)
      .where(sql`latitude IS NULL OR longitude IS NULL`);
    const noCoordButHasCounty = await db
      .select({
        id: auctions.id,
        county: auctions.county,
        state: auctions.state,
      })
      .from(auctions)
      .where(
        sql`(latitude IS NULL OR longitude IS NULL) AND county IS NOT NULL AND state = 'Iowa'`,
      );
    const canBeFixed = noCoordButHasCounty.filter((a) => {
      const centroid = getCountyCentroid(a.county || "");
      return centroid !== null;
    }).length;
    const bySource = await db
      .select({
        source: auctions.sourceWebsite,
        total: sql<string>`count(*)`,
        withCoords: sql<string>`count(CASE WHEN latitude IS NOT NULL THEN 1 END)`,
      })
      .from(auctions)
      .groupBy(auctions.sourceWebsite);
    return c.json({
      success: true,
      total: parseInt(totalCount[0].count),
      withCoordinates: parseInt(withCoords[0].count),
      withoutCoordinates: parseInt(withoutCoords[0].count),
      canBeFixed,
      potentialTotal: parseInt(withCoords[0].count) + canBeFixed,
      bySource: bySource.map((s) => ({
        source: s.source,
        total: parseInt(s.total),
        withCoords: parseInt(s.withCoords),
        coverage: (
          (parseInt(s.withCoords) / parseInt(s.total)) *
          100
        ).toFixed(1),
      })),
    });
  } catch (error) {
    console.error("Investigation error:", error);
    return c.json(
      { success: false, message: "Failed to investigate auctions" },
      500,
    );
  }
});

api.post("/auctions/update-coordinates", async (c) => {
  try {
    const auctionsToUpdate = await db
      .select({
        id: auctions.id,
        county: auctions.county,
        state: auctions.state,
        rawData: auctions.rawData,
      })
      .from(auctions)
      .where(
        sql`(latitude IS NULL OR longitude IS NULL) AND county IS NOT NULL AND state = 'Iowa'`,
      );

    let updated = 0;
    let failed = 0;
    const updates: any[] = [];

    for (const auction of auctionsToUpdate) {
      const centroid = getCountyCentroid(auction.county || "");
      if (centroid) {
        try {
          await db
            .update(auctions)
            .set({
              latitude: centroid.latitude,
              longitude: centroid.longitude,
              rawData: {
                ...(auction.rawData || {}),
                isCountyLevel: true,
                geocodingMethod: "county-centroid",
                updatedViaAPI: true,
                updatedAt: new Date().toISOString(),
              },
            })
            .where(eq(auctions.id, auction.id));
          updated++;
          updates.push({
            id: auction.id,
            county: auction.county,
            latitude: centroid.latitude,
            longitude: centroid.longitude,
          });
        } catch (error) {
          failed++;
          console.error(`Failed to update auction ${auction.id}:`, error);
        }
      } else {
        failed++;
      }
    }

    return c.json({
      success: true,
      message: `Updated ${updated} auctions with county coordinates`,
      updated,
      failed,
      total: auctionsToUpdate.length,
      updates: updates.slice(0, 10),
    });
  } catch (error) {
    console.error("Update coordinates error:", error);
    return c.json(
      { success: false, message: "Failed to update auction coordinates" },
      500,
    );
  }
});

// ============================================================================
// Parcel tiles + ownership
// ============================================================================
api.get("/parcels/tiles/:z/:x/:y", async (c) => {
  try {
    const z = parseInt(c.req.param("z"));
    const x = parseInt(c.req.param("x"));
    // Hono captures `:y` as e.g. "383.mvt"; strip the extension before parseInt
    const y = parseInt((c.req.param("y") || "").replace(/\.mvt$/, ""));
    if (isNaN(z) || isNaN(x) || isNaN(y)) {
      return c.json({ success: false, message: "Invalid tile coordinates" }, 400);
    }
    if (z < 0 || z > 22) {
      return c.json(
        { success: false, message: "Zoom level must be between 0 and 22" },
        400,
      );
    }
    const tile = await generateParcelTile(z, x, y, pool);
    c.header("Access-Control-Allow-Origin", "*");
    if (!tile || tile.length === 0) {
      return c.body(null, 204);
    }
    c.header("Content-Type", "application/x-protobuf");
    c.header("Cache-Control", "public, max-age=3600");
    return c.body(tile);
  } catch (error) {
    console.error("Tile generation error:", error);
    return c.json({ success: false, message: "Failed to generate tile" }, 500);
  }
});

api.get("/parcels/tiles/hybrid/:z/:x/:y", async (c) => {
  try {
    const z = parseInt(c.req.param("z"));
    const x = parseInt(c.req.param("x"));
    const y = parseInt((c.req.param("y") || "").replace(/\.mvt$/, ""));
    if (isNaN(z) || isNaN(x) || isNaN(y)) {
      return c.json({ success: false, message: "Invalid tile coordinates" }, 400);
    }
    const tile = await generateHybridTile(z, x, y, pool);
    c.header("Access-Control-Allow-Origin", "*");
    if (!tile || tile.length === 0) {
      return c.body(null, 204);
    }
    c.header("Content-Type", "application/x-protobuf");
    c.header("Cache-Control", "public, max-age=3600");
    return c.body(tile);
  } catch (error) {
    console.error("Hybrid tile generation error:", error);
    return c.json(
      { success: false, message: "Failed to generate hybrid tile" },
      500,
    );
  }
});

api.get("/parcels/tiles/stats", async (c) => {
  try {
    const stats = getTileCacheStats();
    return c.json({ success: true, stats });
  } catch (error) {
    console.error("Tile stats error:", error);
    return c.json(
      { success: false, message: "Failed to get tile statistics" },
      500,
    );
  }
});

api.post("/parcels/tiles/clear-cache", async (c) => {
  try {
    clearTileCache();
    return c.json({ success: true, message: "Tile cache cleared" });
  } catch (error) {
    console.error("Cache clear error:", error);
    return c.json({ success: false, message: "Failed to clear cache" }, 500);
  }
});

api.get("/parcels/search", async (c) => {
  try {
    const lat = parseFloat(c.req.query("lat") || "");
    const lng = parseFloat(c.req.query("lng") || "");
    if (isNaN(lat) || isNaN(lng)) {
      return c.json(
        { success: false, message: "Valid latitude and longitude are required" },
        400,
      );
    }
    const results = await findParcelsAtPoint(lng, lat, pool);
    return c.json({ success: true, parcels: results, count: results.length });
  } catch (error) {
    console.error("Parcel search error:", error);
    return c.json(
      { success: false, message: "Failed to search parcels" },
      500,
    );
  }
});

api.get("/parcels/:id", async (c) => {
  try {
    const parcelId = parseInt(c.req.param("id"));
    if (isNaN(parcelId)) {
      return c.json({ success: false, message: "Invalid parcel ID" }, 400);
    }
    const parcel = await db.query.parcels.findFirst({
      where: eq(parcels.id, parcelId),
    });
    if (!parcel) {
      return c.json({ success: false, message: "Parcel not found" }, 404);
    }
    const geomResult = await pool.query(
      "SELECT ST_AsGeoJSON(geom) as geometry FROM parcels WHERE id = $1",
      [parcelId],
    );
    const geometry = geomResult.rows[0]?.geometry
      ? JSON.parse(geomResult.rows[0].geometry)
      : null;
    return c.json({
      success: true,
      parcel: {
        ...parcel,
        geometry,
        acres: parcel.areaSqm ? (parcel.areaSqm / 4046.86).toFixed(2) : null,
      },
    });
  } catch (error) {
    console.error("Parcel fetch error:", error);
    return c.json({ success: false, message: "Failed to fetch parcel" }, 500);
  }
});

api.get("/parcels/owner/:name", async (c) => {
  try {
    const normalizedOwner = decodeURIComponent(c.req.param("name"));
    const stats = await getOwnershipStats(normalizedOwner);
    if (!stats) {
      return c.json(
        { success: false, message: "No parcels found for this owner" },
        404,
      );
    }
    return c.json({ success: true, ...stats });
  } catch (error) {
    console.error("Owner parcels error:", error);
    return c.json(
      { success: false, message: "Failed to fetch owner parcels" },
      500,
    );
  }
});

api.get("/parcels/county/:county", async (c) => {
  try {
    const county = decodeURIComponent(c.req.param("county"));
    const limit = parseInt(c.req.query("limit") || "1000");
    const result = await db
      .select()
      .from(parcels)
      .where(eq(parcels.countyName, county))
      .limit(Math.min(limit, 5000));
    return c.json({ success: true, parcels: result, count: result.length });
  } catch (error) {
    console.error("County parcels error:", error);
    return c.json(
      { success: false, message: "Failed to fetch county parcels" },
      500,
    );
  }
});

api.get("/parcels/ownership/search", async (c) => {
  try {
    const query = c.req.query("q") || "";
    const limit = parseInt(c.req.query("limit") || "50");
    if (!query || query.trim().length === 0) {
      return c.json(
        { success: false, message: "Search query is required" },
        400,
      );
    }
    const results = await searchOwners(query, limit);
    return c.json({ success: true, owners: results, count: results.length });
  } catch (error) {
    console.error("Owner search error:", error);
    return c.json({ success: false, message: "Failed to search owners" }, 500);
  }
});

api.get("/parcels/ownership/similar", async (c) => {
  try {
    const name = c.req.query("name") || "";
    const threshold = parseInt(c.req.query("threshold") || "3");
    if (!name || name.trim().length === 0) {
      return c.json({ success: false, message: "Owner name is required" }, 400);
    }
    const similar = await findSimilarOwners(name, threshold);
    return c.json({
      success: true,
      similarOwners: similar,
      count: similar.length,
    });
  } catch (error) {
    console.error("Similar owners error:", error);
    return c.json(
      { success: false, message: "Failed to find similar owners" },
      500,
    );
  }
});

api.get("/parcels/ownership/top", async (c) => {
  try {
    const limit = parseInt(c.req.query("limit") || "100");
    const topOwners = await getTopLandowners(Math.min(limit, 1000));
    return c.json({ success: true, owners: topOwners, count: topOwners.length });
  } catch (error) {
    console.error("Top landowners error:", error);
    return c.json(
      { success: false, message: "Failed to fetch top landowners" },
      500,
    );
  }
});

api.get("/parcels/bounds", async (c) => {
  try {
    const minLng = parseFloat(c.req.query("minLng") || "");
    const minLat = parseFloat(c.req.query("minLat") || "");
    const maxLng = parseFloat(c.req.query("maxLng") || "");
    const maxLat = parseFloat(c.req.query("maxLat") || "");
    const limit = parseInt(c.req.query("limit") || "1000");
    if (isNaN(minLng) || isNaN(minLat) || isNaN(maxLng) || isNaN(maxLat)) {
      return c.json(
        { success: false, message: "Valid bounding box coordinates are required" },
        400,
      );
    }
    const results = await getParcelsInBounds(
      minLng,
      minLat,
      maxLng,
      maxLat,
      pool,
      limit,
    );
    return c.json({ success: true, parcels: results, count: results.length });
  } catch (error) {
    console.error("Bounds search error:", error);
    return c.json(
      { success: false, message: "Failed to search parcels in bounds" },
      500,
    );
  }
});

// ============================================================================
// Admin: County CSR2 rates
// ============================================================================
api.get("/admin/csr2-rates", async (c) => {
  try {
    const rates = await countyCsr2RateService.getAllRates();
    return c.json({ success: true, rates, count: rates.length });
  } catch (error) {
    console.error("Failed to fetch CSR2 rates:", error);
    return c.json(
      { success: false, message: "Failed to fetch county CSR2 rates" },
      500,
    );
  }
});

api.get("/admin/csr2-rates/:county", async (c) => {
  try {
    const county = c.req.param("county");
    const rate = await countyCsr2RateService.getCountyRate(county);
    return c.json({ success: true, county, rate });
  } catch (error) {
    console.error("Failed to fetch county rate:", error);
    return c.json(
      { success: false, message: "Failed to fetch county rate" },
      500,
    );
  }
});

api.put("/admin/csr2-rates/:county", async (c) => {
  try {
    const county = c.req.param("county");
    const { csr2Price, notes } = await c.req.json();
    if (!csr2Price || typeof csr2Price !== "number" || csr2Price <= 0) {
      return c.json(
        { success: false, message: "Valid CSR2 price is required" },
        400,
      );
    }
    const success = await countyCsr2RateService.updateCountyRate(
      county,
      csr2Price,
      notes,
    );
    if (success) {
      return c.json({
        success: true,
        message: `Updated ${county} County rate to $${csr2Price}/point`,
      });
    }
    return c.json(
      { success: false, message: "Failed to update county rate" },
      500,
    );
  } catch (error) {
    console.error("Failed to update county rate:", error);
    return c.json(
      { success: false, message: "Failed to update county rate" },
      500,
    );
  }
});

api.post("/admin/csr2-rates/bulk-update", async (c) => {
  try {
    const { updates } = await c.req.json();
    if (!Array.isArray(updates) || updates.length === 0) {
      return c.json(
        { success: false, message: "Updates array is required" },
        400,
      );
    }
    const result = await countyCsr2RateService.bulkUpdateRates(updates);
    return c.json({
      success: true,
      message: `Updated ${result.success} counties, ${result.failed} failed`,
      ...result,
    });
  } catch (error) {
    console.error("Failed to bulk update rates:", error);
    return c.json(
      { success: false, message: "Failed to bulk update county rates" },
      500,
    );
  }
});

api.get("/admin/csr2-rates/cache/stats", async (c) => {
  try {
    const stats = countyCsr2RateService.getCacheStats();
    return c.json({ success: true, cache: stats });
  } catch (error) {
    console.error("Failed to get cache stats:", error);
    return c.json(
      { success: false, message: "Failed to get cache statistics" },
      500,
    );
  }
});

api.post("/admin/csr2-rates/cache/clear", async (c) => {
  try {
    countyCsr2RateService.clearCache();
    return c.json({ success: true, message: "Cache cleared successfully" });
  } catch (error) {
    console.error("Failed to clear cache:", error);
    return c.json({ success: false, message: "Failed to clear cache" }, 500);
  }
});

// ============================================================================
// Market Data — aggregations over land_sales_comps (Land Talk Monthly)
// ============================================================================
function parseMarketFilters(c: any): MarketFilters {
  const q = c.req.query.bind(c.req);
  const counties = q("counties");
  const num = (v: string | undefined) => (v != null && v !== "" ? parseFloat(v) : undefined);
  return {
    dateFrom: q("dateFrom") || undefined,
    dateTo: q("dateTo") || undefined,
    counties: counties ? counties.split(",").map((s: string) => s.trim()).filter(Boolean) : undefined,
    landCategory: q("landCategory") || undefined,
    csr2Min: num(q("csr2Min")),
    csr2Max: num(q("csr2Max")),
  };
}

api.get("/market/summary", async (c) => {
  try {
    return c.json({ success: true, summary: await marketDataService.getSummary(parseMarketFilters(c)) });
  } catch (error) {
    console.error("market/summary failed:", error);
    return c.json({ success: false, message: "Failed to load market summary" }, 500);
  }
});

api.get("/market/timeseries", async (c) => {
  try {
    return c.json({ success: true, series: await marketDataService.getTimeseries(parseMarketFilters(c)) });
  } catch (error) {
    console.error("market/timeseries failed:", error);
    return c.json({ success: false, message: "Failed to load market timeseries" }, 500);
  }
});

api.get("/market/sales", async (c) => {
  try {
    const f = parseMarketFilters(c);
    const result = await marketDataService.getRecentSales({
      ...f,
      limit: c.req.query("limit") ? parseInt(c.req.query("limit")!, 10) : undefined,
      offset: c.req.query("offset") ? parseInt(c.req.query("offset")!, 10) : undefined,
      sortBy: c.req.query("sortBy") || undefined,
      sortDir: (c.req.query("sortDir") as "asc" | "desc") || undefined,
    });
    return c.json({ success: true, ...result });
  } catch (error) {
    console.error("market/sales failed:", error);
    return c.json({ success: false, message: "Failed to load sales" }, 500);
  }
});

api.get("/market/by-county", async (c) => {
  try {
    return c.json({ success: true, counties: await marketDataService.getByCounty(parseMarketFilters(c)) });
  } catch (error) {
    console.error("market/by-county failed:", error);
    return c.json({ success: false, message: "Failed to load county stats" }, 500);
  }
});

api.get("/market/scatter", async (c) => {
  try {
    return c.json({ success: true, points: await marketDataService.getScatter(parseMarketFilters(c)) });
  } catch (error) {
    console.error("market/scatter failed:", error);
    return c.json({ success: false, message: "Failed to load scatter" }, 500);
  }
});

api.get("/market/seasonality", async (c) => {
  try {
    return c.json({ success: true, months: await marketDataService.getSeasonality(parseMarketFilters(c)) });
  } catch (error) {
    console.error("market/seasonality failed:", error);
    return c.json({ success: false, message: "Failed to load seasonality" }, 500);
  }
});

api.get("/market/sales-lite", async (c) => {
  try {
    return c.json({ success: true, sales: await marketDataService.getSalesLite(parseMarketFilters(c)) });
  } catch (error) {
    console.error("market/sales-lite failed:", error);
    return c.json({ success: false, message: "Failed to load sales-lite" }, 500);
  }
});
