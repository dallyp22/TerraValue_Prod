import { pgTable, text, serial, integer, real, timestamp, json } from "drizzle-orm/pg-core";
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
  status: text("status").default("active") // "active", "sold", "cancelled"
});

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
