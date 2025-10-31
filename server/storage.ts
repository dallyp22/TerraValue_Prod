import { valuations, type Valuation, type InsertValuation } from "@shared/schema";
import { db, pool } from "./db.js";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  createValuation(valuation: Omit<InsertValuation, "status">): Promise<Valuation>;
  getValuation(id: number): Promise<Valuation | undefined>;
  updateValuation(id: number, updates: Partial<Valuation>): Promise<Valuation | undefined>;
  listValuations(): Promise<Valuation[]>;
}

export class MemStorage implements IStorage {
  private valuations: Map<number, Valuation>;
  private currentId: number;

  constructor() {
    this.valuations = new Map();
    this.currentId = 1;
  }

  async createValuation(insertValuation: Omit<InsertValuation, "status">): Promise<Valuation> {
    const id = this.currentId++;
    const valuation: Valuation = {
      id,
      address: insertValuation.address ?? '',
      county: insertValuation.county,
      state: insertValuation.state,
      landType: insertValuation.landType,
      acreage: insertValuation.acreage,
      tillableAcres: insertValuation.tillableAcres || null,
      cashRentPerAcre: insertValuation.cashRentPerAcre || null,
      capRate: insertValuation.capRate || 0.03,
      additionalDetails: insertValuation.additionalDetails || null,
      // CSR2 and field data
      fieldId: insertValuation.fieldId || null,
      fieldWkt: insertValuation.fieldWkt || null,
      csr2Mean: insertValuation.csr2Mean || null,
      csr2Min: insertValuation.csr2Min || null,
      csr2Max: insertValuation.csr2Max || null,
      csr2Count: insertValuation.csr2Count || null,
      latitude: insertValuation.latitude || null,
      longitude: insertValuation.longitude || null,
      // Owner & Parcel Information
      ownerName: insertValuation.ownerName || null,
      parcelNumber: insertValuation.parcelNumber || null,
      // Soil Data
      mukey: insertValuation.mukey || null,
      soilSeries: insertValuation.soilSeries || null,
      soilSlope: insertValuation.soilSlope || null,
      soilDrainage: insertValuation.soilDrainage || null,
      soilHydrologicGroup: insertValuation.soilHydrologicGroup || null,
      soilFarmlandClass: insertValuation.soilFarmlandClass || null,
      soilTexture: insertValuation.soilTexture || null,
      soilSandPct: insertValuation.soilSandPct || null,
      soilSiltPct: insertValuation.soilSiltPct || null,
      soilClayPct: insertValuation.soilClayPct || null,
      soilPH: insertValuation.soilPH || null,
      soilOrganicMatter: insertValuation.soilOrganicMatter || null,
      soilComponents: insertValuation.soilComponents || null,
      // Valuation results
      status: "pending",
      baseValue: null,
      adjustedValue: null,
      totalValue: null,
      confidenceScore: null,
      marketInsight: null,
      aiReasoning: null,
      breakdown: null,
      createdAt: new Date()
    };
    this.valuations.set(id, valuation);
    return valuation;
  }

  async getValuation(id: number): Promise<Valuation | undefined> {
    return this.valuations.get(id);
  }

  async updateValuation(id: number, updates: Partial<Valuation>): Promise<Valuation | undefined> {
    const existing = this.valuations.get(id);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.valuations.set(id, updated);
      return updated;
    }
    return undefined;
  }

  async listValuations(): Promise<Valuation[]> {
    return Array.from(this.valuations.values()).sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }
}

// PostgreSQL Storage Implementation
export class PostgreSQLStorage implements IStorage {
  async createValuation(insertValuation: Omit<InsertValuation, "status">): Promise<Valuation> {
    try {
      const [valuation] = await db.insert(valuations).values({
        address: insertValuation.address ?? '',  // Use nullish coalescing for proper default
        county: insertValuation.county,
        state: insertValuation.state,
        landType: insertValuation.landType,
        acreage: insertValuation.acreage,
        tillableAcres: insertValuation.tillableAcres || null,
        additionalDetails: insertValuation.additionalDetails || null,
        cashRentPerAcre: insertValuation.cashRentPerAcre || null,
        capRate: insertValuation.capRate || 0.03,
        fieldId: insertValuation.fieldId || null,
        fieldWkt: insertValuation.fieldWkt || null,
        csr2Mean: insertValuation.csr2Mean || null,
        csr2Min: insertValuation.csr2Min || null,
        csr2Max: insertValuation.csr2Max || null,
        csr2Count: insertValuation.csr2Count || null,
        latitude: insertValuation.latitude || null,
        longitude: insertValuation.longitude || null,
        // Owner & Parcel Information
        ownerName: insertValuation.ownerName || null,
        parcelNumber: insertValuation.parcelNumber || null,
        // Soil Data
        mukey: insertValuation.mukey || null,
        soilSeries: insertValuation.soilSeries || null,
        soilSlope: insertValuation.soilSlope || null,
        soilDrainage: insertValuation.soilDrainage || null,
        soilHydrologicGroup: insertValuation.soilHydrologicGroup || null,
        soilFarmlandClass: insertValuation.soilFarmlandClass || null,
        soilTexture: insertValuation.soilTexture || null,
        soilSandPct: insertValuation.soilSandPct || null,
        soilSiltPct: insertValuation.soilSiltPct || null,
        soilClayPct: insertValuation.soilClayPct || null,
        soilPH: insertValuation.soilPH || null,
        soilOrganicMatter: insertValuation.soilOrganicMatter || null,
        soilComponents: insertValuation.soilComponents || null,
        status: "pending",
        baseValue: null,
        adjustedValue: null,
        totalValue: null,
        confidenceScore: null,
        marketInsight: null,
        aiReasoning: null,
        breakdown: null
      }).returning();
      return valuation;
    } catch (error) {
      console.error("Failed to create valuation:", error);
      throw new Error("Failed to create valuation in database");
    }
  }

  async getValuation(id: number): Promise<Valuation | undefined> {
    try {
      const [valuation] = await db.select().from(valuations).where(eq(valuations.id, id)).limit(1);
      return valuation;
    } catch (error) {
      console.error("Failed to get valuation:", error);
      throw new Error(`Failed to retrieve valuation with id ${id}`);
    }
  }

  async updateValuation(id: number, updates: Partial<Valuation>): Promise<Valuation | undefined> {
    try {
      // Remove id from updates to prevent trying to update primary key
      const { id: _, ...safeUpdates } = updates;
      const [updated] = await db.update(valuations)
        .set(safeUpdates)
        .where(eq(valuations.id, id))
        .returning();
      return updated;
    } catch (error) {
      console.error("Failed to update valuation:", error);
      throw new Error(`Failed to update valuation with id ${id}`);
    }
  }

  async listValuations(): Promise<Valuation[]> {
    try {
      const results = await db.select().from(valuations).orderBy(desc(valuations.createdAt));
      return results;
    } catch (error) {
      console.error("Failed to list valuations:", error);
      throw new Error("Failed to retrieve valuations from database");
    }
  }
}

// Use PostgreSQL storage in production, MemStorage for testing
export const storage = process.env.NODE_ENV === 'test' ? new MemStorage() : new PostgreSQLStorage();
