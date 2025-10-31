import { pgTable, text, integer, real, timestamp, boolean, index } from "drizzle-orm/pg-core";

/**
 * SSURGO Legend table - Survey area metadata
 */
export const legend = pgTable("soil_legend", {
  lkey: text("lkey").primaryKey(),
  areatypename: text("areatypename"),
  areasymbol: text("areasymbol").notNull(),
  areaname: text("areaname"),
  mlraoffice: text("mlraoffice"),
  legendsuituse: integer("legendsuituse"),
  legendcertstat: text("legendcertstat"),
}, (table) => ({
  areasymbolIdx: index("soil_legend_areasymbol_idx").on(table.areasymbol),
}));

/**
 * SSURGO Map Unit table - Primary soil mapping unit
 */
export const mapunit = pgTable("soil_mapunit", {
  mukey: text("mukey").primaryKey(),
  lkey: text("lkey").notNull().references(() => legend.lkey),
  musym: text("musym"),
  muname: text("muname"),
  mukind: text("mukind"),
  mustatus: text("mustatus"),
  muacres: real("muacres"),
  farmlndcl: text("farmlndcl"), // Farmland classification
}, (table) => ({
  lkeyIdx: index("soil_mapunit_lkey_idx").on(table.lkey),
  musymIdx: index("soil_mapunit_musym_idx").on(table.musym),
}));

/**
 * SSURGO Component table - Soil components within map units
 */
export const component = pgTable("soil_component", {
  cokey: text("cokey").primaryKey(),
  mukey: text("mukey").notNull().references(() => mapunit.mukey),
  compname: text("compname"),
  comppct_l: integer("comppct_l"), // Low component percentage
  comppct_r: integer("comppct_r"), // Representative component percentage
  comppct_h: integer("comppct_h"), // High component percentage
  compkind: text("compkind"),
  majcompflag: text("majcompflag"), // 'Yes' or 'No'
  
  // Slope data
  slope_l: real("slope_l"),
  slope_r: real("slope_r"),
  slope_h: real("slope_h"),
  slopelenusle_l: integer("slopelenusle_l"),
  slopelenusle_r: integer("slopelenusle_r"),
  slopelenusle_h: integer("slopelenusle_h"),
  
  // Drainage and hydrology
  drainagecl: text("drainagecl"),
  hydgrp: text("hydgrp"), // Hydrologic group
  
  // Taxonomic classification
  taxclname: text("taxclname"),
  taxorder: text("taxorder"),
  taxsuborder: text("taxsuborder"),
  taxgrtgroup: text("taxgrtgroup"),
  taxsubgrp: text("taxsubgrp"),
  taxpartsize: text("taxpartsize"),
  taxtempregime: text("taxtempregime"),
}, (table) => ({
  mukeyIdx: index("soil_component_mukey_idx").on(table.mukey),
  majcompIdx: index("soil_component_majcomp_idx").on(table.majcompflag),
}));

/**
 * SSURGO Horizon table - Soil horizon properties
 */
export const chorizon = pgTable("soil_chorizon", {
  chkey: text("chkey").primaryKey(),
  cokey: text("cokey").notNull().references(() => component.cokey),
  hzname: text("hzname"),
  desgnmaster: text("desgnmaster"),
  
  // Depth data (cm)
  hzdept_l: integer("hzdept_l"), // Top depth - low
  hzdept_r: integer("hzdept_r"), // Top depth - representative
  hzdept_h: integer("hzdept_h"), // Top depth - high
  hzdepb_l: integer("hzdepb_l"), // Bottom depth - low
  hzdepb_r: integer("hzdepb_r"), // Bottom depth - representative
  hzdepb_h: integer("hzdepb_h"), // Bottom depth - high
  
  // Texture percentages
  sandtotal_l: real("sandtotal_l"),
  sandtotal_r: real("sandtotal_r"),
  sandtotal_h: real("sandtotal_h"),
  silttotal_l: real("silttotal_l"),
  silttotal_r: real("silttotal_r"),
  silttotal_h: real("silttotal_h"),
  claytotal_l: real("claytotal_l"),
  claytotal_r: real("claytotal_r"),
  claytotal_h: real("claytotal_h"),
  
  // Chemical properties
  om_l: real("om_l"), // Organic matter
  om_r: real("om_r"),
  om_h: real("om_h"),
  ph1to1h2o_l: real("ph1to1h2o_l"), // pH
  ph1to1h2o_r: real("ph1to1h2o_r"),
  ph1to1h2o_h: real("ph1to1h2o_h"),
  
  // Physical properties
  ksat_l: real("ksat_l"), // Saturated hydraulic conductivity
  ksat_r: real("ksat_r"),
  ksat_h: real("ksat_h"),
}, (table) => ({
  cokeyIdx: index("soil_chorizon_cokey_idx").on(table.cokey),
  depthIdx: index("soil_chorizon_depth_idx").on(table.hzdept_r),
}));

/**
 * CSR2 Ratings table - Iowa Corn Suitability Rating
 */
export const csr2Ratings = pgTable("soil_csr2_ratings", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  mukey: text("mukey").notNull().references(() => mapunit.mukey),
  cokey: text("cokey").notNull().references(() => component.cokey),
  csr2Value: real("csr2_value").notNull(), // 0-100 rating
  componentPercent: integer("component_percent"), // Weight for averaging
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => ({
  mukeyIdx: index("soil_csr2_mukey_idx").on(table.mukey),
  cokeyIdx: index("soil_csr2_cokey_idx").on(table.cokey),
  valueIdx: index("soil_csr2_value_idx").on(table.csr2Value),
}));

/**
 * Map Unit Spatial table - PostGIS geometries for spatial queries
 * Note: This will be populated via raw SQL since Drizzle doesn't fully support PostGIS geometry types yet
 */
export const mapunitSpatial = pgTable("soil_mapunit_spatial", {
  mukey: text("mukey").primaryKey().references(() => mapunit.mukey),
  // geom and centroid will be added via raw SQL as PostGIS geometry columns
  bbox: text("bbox"), // Bounding box as "minLon,minLat,maxLon,maxLat"
  acres: real("acres"),
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => ({
  mukeyIdx: index("soil_spatial_mukey_idx").on(table.mukey),
}));

/**
 * Data sync status table - Track when data was last updated
 */
export const syncStatus = pgTable("soil_sync_status", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  areasymbol: text("areasymbol").notNull().unique(),
  tableName: text("table_name").notNull(),
  recordCount: integer("record_count").default(0),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  status: text("status").notNull().default("pending"), // pending, syncing, completed, failed
  errorMessage: text("error_message"),
}, (table) => ({
  areasymbolIdx: index("soil_sync_areasymbol_idx").on(table.areasymbol),
  statusIdx: index("soil_sync_status_idx").on(table.status),
}));

// Type exports for TypeScript
export type Legend = typeof legend.$inferSelect;
export type InsertLegend = typeof legend.$inferInsert;
export type MapUnit = typeof mapunit.$inferSelect;
export type InsertMapUnit = typeof mapunit.$inferInsert;
export type Component = typeof component.$inferSelect;
export type InsertComponent = typeof component.$inferInsert;
export type CHorizon = typeof chorizon.$inferSelect;
export type InsertCHorizon = typeof chorizon.$inferInsert;
export type CSR2Rating = typeof csr2Ratings.$inferSelect;
export type InsertCSR2Rating = typeof csr2Ratings.$inferInsert;
export type MapUnitSpatial = typeof mapunitSpatial.$inferSelect;
export type InsertMapUnitSpatial = typeof mapunitSpatial.$inferInsert;
export type SyncStatus = typeof syncStatus.$inferSelect;
export type InsertSyncStatus = typeof syncStatus.$inferInsert;

