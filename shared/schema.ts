import { pgTable, text, serial, integer, real, timestamp, json, jsonb, index, boolean, bigserial, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const valuations = pgTable("valuations", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  county: text("county").notNull(),
  state: text("state").notNull(),
  landType: text("land_type").notNull(),
  acreage: real("acreage").notNull(),
  tillableAcres: real("tillable_acres"),
  additionalDetails: text("additional_details"),
  // Cash rent per acre
  cashRentPerAcre: real("cash_rent_per_acre"),
  capRate: real("cap_rate").default(0.03), // Default 3% cap rate
  // CSR2 and field data
  fieldId: text("field_id"),
  fieldWkt: text("field_wkt"), // Well-Known Text geometry
  csr2Mean: real("csr2_mean"),
  csr2Min: integer("csr2_min"),
  csr2Max: integer("csr2_max"),
  csr2Count: integer("csr2_count"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  // Owner & Parcel Information
  ownerName: text("owner_name"),
  parcelNumber: text("parcel_number"),
  // Soil Data (from local database)
  mukey: text("mukey"), // Map unit key
  soilSeries: text("soil_series"), // e.g., "Clarion"
  soilSlope: real("soil_slope"), // Percentage
  soilDrainage: text("soil_drainage"), // e.g., "Well drained"
  soilHydrologicGroup: text("soil_hydrologic_group"), // e.g., "B"
  soilFarmlandClass: text("soil_farmland_class"), // e.g., "Prime farmland"
  soilTexture: text("soil_texture"), // e.g., "Silt loam"
  soilSandPct: real("soil_sand_pct"),
  soilSiltPct: real("soil_silt_pct"),
  soilClayPct: real("soil_clay_pct"),
  soilPH: real("soil_ph"),
  soilOrganicMatter: real("soil_organic_matter"),
  soilComponents: json("soil_components"), // Full component breakdown
  // Valuation results
  baseValue: real("base_value"),
  adjustedValue: real("adjusted_value"),
  totalValue: real("total_value"),
  confidenceScore: real("confidence_score"),
  marketInsight: text("market_insight"),
  aiReasoning: text("ai_reasoning"),
  breakdown: json("breakdown"),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  createdAt: timestamp("created_at").defaultNow(),
});

export const auctions = pgTable("auctions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url").notNull().unique(),
  sourceWebsite: text("source_website").notNull(),
  
  // Auction details
  auctionDate: timestamp("auction_date"),
  auctionType: text("auction_type"), // "Online", "In-Person", "Hybrid"
  auctioneer: text("auctioneer"),
  
  // Property details
  address: text("address"),
  county: text("county"),
  state: text("state"),
  acreage: real("acreage"),
  landType: text("land_type"), // "Irrigated", "Dryland", "Pasture", "CRP", "Mixed"
  
  // Geographic data
  latitude: real("latitude"),
  longitude: real("longitude"),
  
  // CSR2 & Valuation (populated on-demand when user clicks)
  csr2Mean: real("csr2_mean"),
  csr2Min: integer("csr2_min"),
  csr2Max: integer("csr2_max"),
  estimatedValue: real("estimated_value"), // CSR2-based value per acre
  
  // Metadata
  rawData: json("raw_data"), // Full scraped data
  scrapedAt: timestamp("scraped_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  status: text("status").default("active"), // "active", "sold", "cancelled"
  
  // Date extraction tracking
  needsDateReview: boolean("needs_date_review").default(false),
  dateExtractionAttempted: timestamp("date_extraction_attempted"),
  dateExtractionMethod: text("date_extraction_method"), // "ai", "regex", "manual"

  // Property classification (farmland | recreational | residential | commercial | development | non_land | unknown)
  propertyCategory: text("property_category"),
  classificationConfidence: real("classification_confidence"),
  classificationSource: text("classification_source"), // "keyword" | "ai" | "manual"
  classificationReason: text("classification_reason"),
  
  // AI Enriched standardized fields
  enrichedTitle: text("enriched_title"),
  enrichedDescription: text("enriched_description"),
  enrichedAuctionHouse: text("enriched_auction_house"),
  enrichedAuctionDate: timestamp("enriched_auction_date"),
  enrichedAuctionLocation: text("enriched_auction_location"), // Where auction is held
  enrichedPropertyLocation: text("enriched_property_location"), // Where land is located
  
  // Legal description parsing
  legalDescription: text("legal_description"),
  legalDescriptionParsed: json("legal_description_parsed"), // Township, Range, Section breakdown
  legalDescriptionSource: text("legal_description_source"), // "original", "ai_extracted"
  
  // Comprehensive property details
  soilMentions: text("soil_mentions"), // Soil quality notes from listing
  cropHistory: text("crop_history"), // Mentioned crops or usage
  improvements: json("improvements"), // Buildings, fencing, irrigation, etc.
  utilities: json("utilities"), // Electric, water, gas availability
  roadAccess: text("road_access"), // Type of road access
  drainage: text("drainage"), // Drainage system details
  tillablePercent: real("tillable_percent"),
  crpDetails: text("crp_details"),
  waterRights: text("water_rights"),
  mineralRights: text("mineral_rights"),
  zoningInfo: text("zoning_info"),
  taxInfo: text("tax_info"),
  sellerMotivation: text("seller_motivation"), // Estate, retirement, etc.
  financingOptions: text("financing_options"),
  possession: text("possession"), // When buyer can take possession
  keyHighlights: json("key_highlights"), // Array of key selling points
  
  // Geocoding enhancements
  geocodingMethod: text("geocoding_method"), // "address", "legal_description", "county_centroid", "manual"
  geocodingConfidence: real("geocoding_confidence"), // 0-100 score
  geocodingSource: text("geocoding_source"), // API used
  
  // AI enrichment tracking
  enrichmentStatus: text("enrichment_status").default("pending"), // "pending", "processing", "completed", "failed"
  enrichedAt: timestamp("enriched_at"),
  enrichmentVersion: text("enrichment_version").default("v1"), // Track enrichment algorithm version
  enrichmentError: text("enrichment_error"),

  // Capture attribution — which runtime found this listing. Both the Node
  // process and the Cloudflare queue pipeline upsert the same rows, so without
  // this a parallel run cannot be measured, only guessed at.
  lastCapturedBy: text("last_captured_by"),   // "cloudflare-queue" | "node"
  lastCapturedRun: text("last_captured_run"), // run id
  firstCapturedBy: text("first_captured_by"), // set once, never overwritten

  // Entity resolution (migration 0030). This table is an *observation* table —
  // one row per source-sighting, keyed on `url` — so the canonical sale lives in
  // `auction_events` and each row points at it. NULL means "not yet resolved",
  // which is every row until the resolver has run.
  eventId: integer("event_id"),
  eventMatchScore: real("event_match_score"),
  eventMatchMethod: text("event_match_method"),

  // Blocking-key cache, written by the resolver's fingerprint pass. See
  // server/services/dedupe.ts for how each is derived and why raw county/
  // acreage/date columns cannot be used directly.
  dedupeCountyKeys: text("dedupe_county_keys").array(),
  dedupeState: text("dedupe_state"),
  dedupeAcreage: real("dedupe_acreage"),
  dedupeTrsKeys: text("dedupe_trs_keys").array(),
  dedupeNameTokens: text("dedupe_name_tokens").array(),
  dedupeFingerprintAt: timestamp("dedupe_fingerprint_at", { withTimezone: true })
});

/**
 * Canonical sale event — one row per physical auction, however many listings
 * advertise it.
 *
 * Sits *above* `auctions` rather than replacing it: `auctions` keeps its name,
 * its columns and its `url` unique key, so the map, the tile route, the archiver
 * and the Heistand overlay all keep working untouched while the pipeline gains
 * an entity layer underneath them.
 *
 * `review_status = 'needs_review'` is load-bearing. A wrong merge removes an
 * auction from the map, which is worse than showing a duplicate pin, so the
 * resolver parks anything it is not sure about here instead of guessing.
 */
export const auctionEvents = pgTable("auction_events", {
  id: serial("id").primaryKey(),

  // Deliberately not an FK: archiving an observation must never cascade into
  // deleting the sale event it represents.
  primaryAuctionId: integer("primary_auction_id"),

  title: text("title"),
  county: text("county"),                        // display form, e.g. "Shelby and Crawford"
  countyKeys: text("county_keys").array(),       // normalised set, e.g. {crawford,shelby}
  state: text("state"),                          // 2-letter, normalised
  acreage: real("acreage"),
  auctionDate: timestamp("auction_date", { withTimezone: true }),
  auctioneer: text("auctioneer"),
  landType: text("land_type"),
  latitude: real("latitude"),
  longitude: real("longitude"),

  memberCount: integer("member_count").notNull().default(1),

  // "singleton" | "url" | "trs" | "acreage+county" | "name+county" | ...
  // "singleton" is the majority case and must not be read as a confident merge.
  matchMethod: text("match_method").notNull().default("singleton"),
  // Weakest accepted edge in the cluster — a cluster is only as good as that.
  matchConfidence: real("match_confidence"),
  // "auto" | "needs_review" | "confirmed" | "rejected"
  reviewStatus: text("review_status").notNull().default("auto"),
  matcherVersion: text("matcher_version").notNull().default("v1"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  reviewIdx: index("auction_events_review_idx").on(table.reviewStatus, table.updatedAt),
  dateIdx: index("auction_events_date_idx").on(table.auctionDate)
}));

/**
 * Every scored pair, whatever the verdict — including the ones we refused to
 * merge and why.
 *
 * Two jobs: it makes the thresholds tunable against real outcomes rather than
 * intuition, and it is the un-merge path — a bad cluster is fixed by deleting
 * one edge and re-clustering the component, not by hand-editing rows.
 */
export const auctionMatchAudit = pgTable("auction_match_audit", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  // Ordered (lower id first) so a pair has exactly one row.
  auctionAId: integer("auction_a_id").notNull(),
  auctionBId: integer("auction_b_id").notNull(),
  score: real("score").notNull(),
  disposition: text("disposition").notNull(),   // "merge" | "review" | "distinct"
  blockKey: text("block_key"),                  // which blocking key produced the pair
  features: jsonb("features"),                  // per-signal contributions
  holdReason: text("hold_reason"),              // why a high scorer was still not merged
  decidedBy: text("decided_by").notNull().default("rules_v1"),
  matcherVersion: text("matcher_version").notNull().default("v1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  dispositionIdx: index("auction_match_audit_disposition_idx").on(table.disposition, table.score),
  aIdx: index("auction_match_audit_a_idx").on(table.auctionAId),
  bIdx: index("auction_match_audit_b_idx").on(table.auctionBId),
  pairUnique: unique("auction_match_audit_auction_a_id_auction_b_id_matcher_versi_key")
    .on(table.auctionAId, table.auctionBId, table.matcherVersion)
}));

export type AuctionEvent = typeof auctionEvents.$inferSelect;
export type InsertAuctionEvent = typeof auctionEvents.$inferInsert;
export type AuctionMatchAudit = typeof auctionMatchAudit.$inferSelect;
export type InsertAuctionMatchAudit = typeof auctionMatchAudit.$inferInsert;

/**
 * Per-(run, source) scrape telemetry.
 *
 * The pre-existing scraperDiagnostics writes a local JSONL file and disables
 * itself when there is no filesystem, so the Cloudflare runtime recorded
 * nothing at all — which is why a scrape capturing 0.8% of its target looked
 * healthy on every dashboard. This lives in the database so both runtimes
 * report, and so "which source went quiet this week" is a query.
 */
export const scrapeSourceRuns = pgTable("scrape_source_runs", {
  id: serial("id").primaryKey(),
  runId: text("run_id").notNull(),
  runtime: text("runtime").notNull(), // "cloudflare-queue" | "node"
  sourceName: text("source_name").notNull(),
  discovered: integer("discovered").notNull().default(0),
  queued: integer("queued").notNull().default(0),
  dropped: integer("dropped").notNull().default(0),
  saved: integer("saved").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  /** Discovered URLs not re-fetched because we already hold a fresh copy.
   *  Cost avoided — deliberately NOT folded into `dropped`, which means
   *  coverage lost to the per-source cap. */
  skippedFresh: integer("skipped_fresh").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
});

export type ScrapeSourceRun = typeof scrapeSourceRuns.$inferSelect;
export type InsertScrapeSourceRun = typeof scrapeSourceRuns.$inferInsert;

// Scraper Schedule Settings - Configure automatic scraping
export const scraperSettings = pgTable("scraper_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").default(false),
  cadence: text("cadence").default("daily"), // "daily", "every-other-day", "weekly", "manual"
  scheduleTime: text("schedule_time").default("00:00"), // HH:MM format (e.g., "00:00" for midnight)
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  updatedAt: timestamp("updated_at").defaultNow()
});

// Auction Blocklist - URLs that should never be scraped
export const auctionBlocklist = pgTable("auction_blocklist", {
  id: serial("id").primaryKey(),
  url: text("url").notNull().unique(),
  reason: text("reason").notNull(), // "non-farm", "spam", "duplicate", etc.
  addedAt: timestamp("added_at").defaultNow(),
  addedBy: text("added_by").default("manual")
});

// Archived Auctions - Past auctions moved from active table
export const archivedAuctions = pgTable("archived_auctions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  sourceWebsite: text("source_website").notNull(),
  
  // Auction details
  auctionDate: timestamp("auction_date"),
  auctionType: text("auction_type"),
  auctioneer: text("auctioneer"),
  
  // Property details
  address: text("address"),
  county: text("county"),
  state: text("state"),
  acreage: real("acreage"),
  landType: text("land_type"),
  
  // Geographic data
  latitude: real("latitude"),
  longitude: real("longitude"),
  
  // CSR2 & Valuation
  csr2Mean: real("csr2_mean"),
  csr2Min: integer("csr2_min"),
  csr2Max: integer("csr2_max"),
  estimatedValue: real("estimated_value"),
  
  // Metadata
  rawData: json("raw_data"),
  scrapedAt: timestamp("scraped_at"),
  updatedAt: timestamp("updated_at"),
  status: text("status"),
  
  // Archive metadata
  archivedAt: timestamp("archived_at").defaultNow(),
  archivedReason: text("archived_reason"), // e.g., "past_auction_date"
  originalId: integer("original_id") // Original ID from auctions table
});

// Iowa Parcels - Property ownership data with PostGIS geometries
export const parcels = pgTable("parcels", {
  id: serial("id").primaryKey(),
  countyName: text("county_name"),
  stateParcelId: text("state_parcel_id"),
  parcelNumber: text("parcel_number"),
  parcelClass: text("parcel_class"),
  deedHolder: text("deed_holder"),
  deedHolderNormalized: text("deed_holder_normalized"), // For fuzzy matching
  areaSqm: real("area_sqm"), // From Shape__Area
  lengthM: real("length_m"), // From Shape__Length
  // Note: geom column added via raw SQL as PostGIS MULTIPOLYGON
  // Will be added during migration: AddGeometryColumn('parcels', 'geom', 4326, 'MULTIPOLYGON', 2)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  parcelNumberIdx: index("parcels_parcel_number_idx").on(table.parcelNumber),
  deedHolderIdx: index("parcels_deed_holder_idx").on(table.deedHolder),
  deedHolderNormalizedIdx: index("parcels_deed_holder_normalized_idx").on(table.deedHolderNormalized),
  countyNameIdx: index("parcels_county_name_idx").on(table.countyName),
  // Spatial index on geom will be added via raw SQL: CREATE INDEX parcels_geom_idx ON parcels USING GIST(geom)
}));

// Parcel Ownership Groups - Aggregated parcels by owner (ALL parcels, even non-adjacent)
export const parcelOwnershipGroups = pgTable("parcel_ownership_groups", {
  id: serial("id").primaryKey(),
  normalizedOwner: text("normalized_owner").notNull().unique(),
  parcelCount: integer("parcel_count").notNull().default(0),
  totalAcres: real("total_acres").notNull().default(0),
  parcelIds: json("parcel_ids").$type<number[]>(), // Array of parcel IDs
  // Note: combined_geom column added via raw SQL as PostGIS MULTIPOLYGON
  // Will be added during migration: AddGeometryColumn('parcel_ownership_groups', 'combined_geom', 4326, 'MULTIPOLYGON', 2)
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => ({
  normalizedOwnerIdx: index("ownership_groups_normalized_owner_idx").on(table.normalizedOwner),
  // Spatial index on combined_geom will be added via raw SQL
}));

// Parcel Aggregated - ONLY adjacent/touching parcels combined by owner (like Harrison County)
export const parcelAggregated = pgTable("parcel_aggregated", {
  id: serial("id").primaryKey(),
  normalizedOwner: text("normalized_owner").notNull(),
  county: text("county").notNull(),
  parcelIds: json("parcel_ids").$type<number[]>(), // Array of adjacent parcel IDs in this cluster
  parcelCount: integer("parcel_count").notNull(),
  totalAcres: real("total_acres").notNull(),
  // Note: geom column added via raw SQL as PostGIS MULTIPOLYGON
  // Will be added during migration: AddGeometryColumn('parcel_aggregated', 'geom', 4326, 'MULTIPOLYGON', 2)
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ownerCountyIdx: index("aggregated_owner_county_idx").on(table.normalizedOwner, table.county),
  countyIdx: index("aggregated_county_idx").on(table.county),
  ownerIdx: index("aggregated_owner_idx").on(table.normalizedOwner),
  // Spatial index: CREATE INDEX parcel_aggregated_geom_idx ON parcel_aggregated USING GIST(geom)
}));

// County CSR2 Rates - Price per CSR2 point by Iowa county
export const countyCsr2Rates = pgTable("county_csr2_rates", {
  id: serial("id").primaryKey(),
  county: text("county").notNull().unique(),
  region: text("region").notNull(), // Northwest, Northeast, West Central, etc.
  csr2Price: integer("csr2_price").notNull(), // Dollar amount per CSR2 point
  effectiveDate: timestamp("effective_date").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  notes: text("notes"), // Admin notes about rate changes
}, (table) => ({
  countyIdx: index("county_csr2_rates_county_idx").on(table.county),
  regionIdx: index("county_csr2_rates_region_idx").on(table.region),
}));

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertValuationSchema = createInsertSchema(valuations).omit({
  id: true,
  createdAt: true,
}).extend({
  address: z.string().optional(), // Made optional for polygon-drawn valuations
  county: z.string().min(1, "County is required"),
  state: z.string().min(1, "State is required"),
  landType: z.enum(["Irrigated", "Dryland", "Pasture", "CRP"]),
  acreage: z.number().min(0.1, "Acreage must be greater than 0"),
  tillableAcres: z.number().min(0, "Tillable acres must be non-negative").optional(),
  additionalDetails: z.string().optional(),
});

export const propertyImprovementSchema = z.object({
  type: z.enum(["Building", "Barn", "Silo", "Well", "Irrigation System", "Fencing", "Road Access", "Other"]),
  description: z.string().min(1, "Description is required"),
  valuationMethod: z.enum(["ai", "manual"]),
  manualValue: z.number().optional(),
  condition: z.enum(["Excellent", "Good", "Fair", "Poor"]).optional(),
});

export const propertyFormSchema = z.object({
  address: z.string().optional(), // Made optional for polygon-drawn valuations
  county: z.string().min(1, "County is required"),
  state: z.string().min(1, "State is required"),
  landType: z.enum(["Irrigated", "Dryland", "Pasture", "CRP"]),
  acreage: z.number().min(0.1, "Acreage must be greater than 0"),
  tillableAcres: z.number().min(0, "Tillable acres must be non-negative").optional(),
  additionalDetails: z.string().optional(),
  includeImprovements: z.boolean().default(false),
  improvements: z.array(propertyImprovementSchema).optional(),
  // Cash rent analysis
  cashRentPerAcre: z.number().min(0, "Cash rent must be non-negative").max(1000, "Cash rent seems unusually high").optional(),
  capRate: z.number().min(0.01, "Cap rate must be at least 1%").max(0.20, "Cap rate seems unusually high").default(0.03).optional(),
  // CSR2 and spatial data (optional, populated by map interaction)
  fieldId: z.string().optional(),
  fieldWkt: z.string().optional(),
  csr2Mean: z.number().optional(),
  csr2Min: z.number().optional(),
  csr2Max: z.number().optional(),
  csr2Count: z.number().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  // Non-tillable land type for valuation adjustments
  nonTillableType: z.enum(["CRP", "Timber", "Other"]).optional(),
  // Owner & Parcel Information (populated by parcel selection)
  ownerName: z.string().optional(),
  parcelNumber: z.string().optional(),
  // Soil Data (populated from local database)
  mukey: z.string().optional(),
  soilSeries: z.string().optional(),
  soilSlope: z.number().optional(),
  soilDrainage: z.string().optional(),
  soilHydrologicGroup: z.string().optional(),
  soilFarmlandClass: z.string().optional(),
  soilTexture: z.string().optional(),
  soilSandPct: z.number().optional(),
  soilSiltPct: z.number().optional(),
  soilClayPct: z.number().optional(),
  soilPH: z.number().optional(),
  soilOrganicMatter: z.number().optional(),
  soilComponents: z.any().optional(), // JSON array
}).refine((data) => {
  // Validate that tillable acres doesn't exceed total acres
  if (data.tillableAcres && data.tillableAcres > data.acreage) {
    return false;
  }
  return true;
}, {
  message: "Tillable acres cannot exceed total acres",
  path: ["tillableAcres"],
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertValuation = z.infer<typeof insertValuationSchema>;
export type Valuation = typeof valuations.$inferSelect;
export type PropertyForm = z.infer<typeof propertyFormSchema>;
export type PropertyImprovement = z.infer<typeof propertyImprovementSchema>;
export type Auction = typeof auctions.$inferSelect;
export type InsertAuction = typeof auctions.$inferInsert;
export type ScraperSettings = typeof scraperSettings.$inferSelect;
export type InsertScraperSettings = typeof scraperSettings.$inferInsert;
export type AuctionBlocklist = typeof auctionBlocklist.$inferSelect;
export type InsertAuctionBlocklist = typeof auctionBlocklist.$inferInsert;
export type ArchivedAuction = typeof archivedAuctions.$inferSelect;
export type InsertArchivedAuction = typeof archivedAuctions.$inferInsert;
export type Parcel = typeof parcels.$inferSelect;
export type InsertParcel = typeof parcels.$inferInsert;
export type ParcelOwnershipGroup = typeof parcelOwnershipGroups.$inferSelect;
export type InsertParcelOwnershipGroup = typeof parcelOwnershipGroups.$inferInsert;
export type ParcelAggregated = typeof parcelAggregated.$inferSelect;
export type InsertParcelAggregated = typeof parcelAggregated.$inferInsert;
export type CountyCsr2Rate = typeof countyCsr2Rates.$inferSelect;
export type InsertCountyCsr2Rate = typeof countyCsr2Rates.$inferInsert;

export interface ValuationBreakdown {
  baseValue: number;
  aiAdjustedValue?: number;
  improvements: number;
  marketAdjustment: number;
  finalValue: number;
  // Valuation method selection
  selectedMethod?: "csr2" | "income" | "ai_market";
  // Income capitalization analysis
  incomeCapValue?: number;
  cashRentSource?: "user_input" | "county_average" | "estimated";
  actualCashRent?: number;
  capRate?: number;
  // CSR2 quantitative valuation
  csr2Value?: number;
  csr2DollarPerPoint?: number;
  countyAverageCSR2?: number;
  csr2Mean?: number;
  csr2Min?: number;
  csr2Max?: number;
  csr2Count?: number;
  // Tillable vs Non-Tillable breakdown
  tillableAcres?: number;
  tillableValuePerAcre?: number;
  nonTillableValuePerAcre?: number;
  nonTillableType?: "CRP" | "Timber" | "Other";
  nonTillableMultiplier?: number;
  blendedValuePerAcre?: number;
  dollarPerCsrTaxAcre?: number;
  improvementDetails?: {
    type: string;
    description: string;
    value: number;
    method: "ai" | "manual";
  }[];
  // Iowa market analysis data
  iowaMarketComps?: {
    date: string;
    price_per_acre: number;
    details: string;
    acres?: number;
    land_type?: string;
  }[];
  iowaMarketSummary?: string;
  iowaMarketTrends?: {
    yoy_change?: number;
    factors: string[];
  };
  // Suggested rent calculation
  suggestedRentPerAcre?: number;
  cornFuturesPrice?: number;
  // Market comparables filtering
  marketCompsUsed?: {
    date: string;
    price_per_acre: number;
    details: string;
    acres?: number;
    land_type?: string;
    county?: string;
  }[];
  marketCompsExcludedCount?: number;
  marketCompsThresholdUsed?: number;
  marketCompsAverage?: number;
  marketCompsAllFiltered?: boolean;
  marketCompsNote?: string;
  // Comparable-sales engine (CSR2-matched comps that drove the value)
  valuationMethod?: "comps" | "ai";
  comparableSales?: {
    county: string;
    saleDate: string | null;
    soldAcres: number | null;
    pricePerAcre: number;
    tillableCsr2: number;
    dollarPerTillableCsr2: number | null;
    landType: string | null;
    similarity: number;
    impliedValuePerAcre: number;
  }[];
  compsValuePerAcre?: number;
  compsValueLow?: number;
  compsValueHigh?: number;
  compsDollarPerCsr2Point?: number;
  compsConfidence?: number;
  compsCount?: number;
  compsScope?: "county" | "regional";
}

export interface ValuationResponse {
  id: number;
  status: string;
  baseValue?: number;
  adjustedValue?: number;
  totalValue?: number;
  confidenceScore?: number;
  marketInsight?: string;
  aiReasoning?: string;
  breakdown?: ValuationBreakdown;
}

// ============================================================================
// Land Talk Monthly — Iowa Appraisal land-sales comps
// Replaces the OpenAI vector store as the source of Iowa market comparables.
// `land_talk_pdfs` tracks which monthly newsletters we've ingested;
// `land_sales_comps` holds the structured sale rows parsed from each PDF.
// ============================================================================

export const landTalkPdfs = pgTable("land_talk_pdfs", {
  id: serial("id").primaryKey(),
  url: text("url").notNull().unique(),     // squarespace CDN PDF URL (per-file UUID path)
  title: text("title"),                    // link text, e.g. "April 2026 Land Talk Monthly"
  month: text("month"),                    // normalized YYYY-MM, e.g. "2026-04"
  status: text("status").notNull().default("pending"), // pending | parsed | failed | skipped
  salesCount: integer("sales_count").default(0),
  error: text("error"),
  scrapedAt: timestamp("scraped_at"),
  ingestedAt: timestamp("ingested_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const landSalesComps = pgTable("land_sales_comps", {
  id: serial("id").primaryKey(),

  // Core sale facts (from the "Iowa Land Auction Results" table)
  saleDate: timestamp("sale_date"),
  county: text("county").notNull(),
  landTypeRaw: text("land_type_raw"),        // verbatim, e.g. "Tillable-Expired CRP"
  landCategory: text("land_category"),       // normalized primary, e.g. "tillable" | "pasture" | "crp" | "recreational" | "development" | "woods" | "mixed"
  soldAcres: real("sold_acres"),

  // Price — pricePerAcre is null when not a clean numeric sale
  pricePerAcre: real("price_per_acre"),
  saleStatus: text("sale_status").notNull().default("sold"), // sold | undisclosed | no_sale | undetermined
  totalPrice: real("total_price"),           // soldAcres * pricePerAcre when both known

  // Soil / tillable productivity
  tillableCsr2: real("tillable_csr2"),
  tillableAcres: real("tillable_acres"),
  dollarPerTillableCsr2: real("dollar_per_tillable_csr2"), // reported only when tillable >= 80%; else null

  // Provenance
  saleMonth: text("sale_month"),             // YYYY-MM of the source newsletter
  sourcePdfUrl: text("source_pdf_url").notNull(),
  sourceName: text("source_name").notNull().default("Iowa Appraisal — Land Talk Monthly"),
  extractionConfidence: real("extraction_confidence"), // 0-1, from the parser

  // Idempotency: stable hash of (sourcePdfUrl + saleDate + county + soldAcres + raw price)
  rowHash: text("row_hash").notNull().unique(),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  countyDateIdx: index("land_sales_comps_county_date_idx").on(table.county, table.saleDate),
  categoryIdx: index("land_sales_comps_category_idx").on(table.landCategory),
  monthIdx: index("land_sales_comps_month_idx").on(table.saleMonth),
}));

export const insertLandTalkPdfSchema = createInsertSchema(landTalkPdfs);
export const insertLandSalesCompSchema = createInsertSchema(landSalesComps);
export type LandTalkPdf = typeof landTalkPdfs.$inferSelect;
export type InsertLandTalkPdf = typeof landTalkPdfs.$inferInsert;
export type LandSalesComp = typeof landSalesComps.$inferSelect;
export type InsertLandSalesComp = typeof landSalesComps.$inferInsert;
