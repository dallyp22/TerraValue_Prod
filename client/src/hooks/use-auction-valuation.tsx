import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Valuation } from "@shared/schema";

const PropertyFormOverlay = lazy(() => import("@/components/PropertyFormOverlay"));
const ValuationPipelineOverlay = lazy(() => import("@/components/ValuationPipelineOverlay"));
const ValuationReportOverlay = lazy(() => import("@/components/ValuationReportOverlay"));

export interface ValuableAuction {
  id: number;
  title: string;
  address?: string | null;
  acreage?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  county?: string | null;
  auctionDate?: string | null;
  auctioneer?: string | null;
  csr2Mean?: number | null;
  csr2Min?: number | null;
  csr2Max?: number | null;
}

const VALUATION_LAND_TYPES = ["Irrigated", "Dryland", "Pasture", "CRP"] as const;

/**
 * Runs the auction-valuation flow in-place as overlays. Clicking "Value this
 * auction" prepares the data and creates the valuation directly (pipeline →
 * report), with no intermediate form. The pre-filled form only appears as a
 * fallback when the prepared data is missing required fields (county/acreage)
 * or the direct valuation request fails.
 */
export function useAuctionValuation() {
  const [parcelData, setParcelData] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [currentValuationId, setCurrentValuationId] = useState<number | null>(null);
  const [showPipeline, setShowPipeline] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [preparingId, setPreparingId] = useState<number | null>(null);
  const hasAutoOpenedReport = useRef(false);

  const { data: currentValuation } = useQuery<{ success: boolean; valuation: Valuation }>({
    queryKey: [`/api/valuations/${currentValuationId}`],
    enabled: !!currentValuationId,
    refetchInterval: (query) => {
      if (!currentValuationId) return false;
      const status = query.state.data?.valuation?.status;
      if (status === "completed" || status === "failed") return false;
      return 2000;
    },
    refetchIntervalInBackground: false,
  });
  const valuation = currentValuation?.valuation;

  useEffect(() => {
    if (valuation?.status === "completed" && !showReport && !hasAutoOpenedReport.current) {
      setShowReport(true);
      setShowPipeline(false);
      hasAutoOpenedReport.current = true;
    }
  }, [valuation?.status, showReport]);

  const handleValuationCreated = (valuationId: number) => {
    setCurrentValuationId(valuationId);
    setShowForm(false);
    setShowPipeline(true);
    hasAutoOpenedReport.current = false;
  };

  // Fallback path: open the pre-filled form so the user can supply whatever
  // the prepared data is missing. `prepared` is the prepare-valuation payload
  // when available.
  const openPrefilledForm = (auction: ValuableAuction, prepared?: any) => {
    setParcelData({
      owner_name: prepared?.ownerName || "Unknown Owner",
      address: prepared?.address || auction.address || "",
      acres: prepared?.acreage || auction.acreage || 0,
      coordinates: prepared?.coordinates || (auction.latitude && auction.longitude ? [auction.longitude, auction.latitude] : null),
      parcel_number: prepared?.parcelNumber || `AUCTION-${auction.id}`,
      parcel_class: prepared?.landType || "Agricultural",
      county: prepared?.county || auction.county || "",
      landType: prepared?.landType || "Dryland",
      sourceAuctionId: auction.id,
      sourceAuctionTitle: auction.title,
      auctionDate: auction.auctionDate,
      auctioneer: auction.auctioneer,
      csr2Mean: prepared?.csr2Mean ?? auction.csr2Mean,
      csr2Min: prepared?.csr2Min ?? auction.csr2Min,
      csr2Max: prepared?.csr2Max ?? auction.csr2Max,
      ...(prepared ? {
        extractedInfo: prepared.extractedInfo,
        geometry: prepared.fieldWkt,
        mukey: prepared.mukey,
        soilData: prepared.soilData,
        hasParcelMatch: prepared.hasParcelMatch,
        hasCSR2: prepared.hasCSR2,
        hasSoilData: prepared.hasSoilData,
      } : {}),
    });
    setShowForm(true);
  };

  const startValuation = async (auction: ValuableAuction) => {
    if (preparingId !== null) return;
    setPreparingId(auction.id);
    let prepared: any = null;
    try {
      const [prepareResponse, cornResponse] = await Promise.all([
        fetch(`/api/auctions/${auction.id}/prepare-valuation`, { method: "POST" }),
        fetch("/api/corn-price").catch(() => null),
      ]);
      if (!prepareResponse.ok) throw new Error("Failed to prepare valuation data");
      const result = await prepareResponse.json();
      if (!result.success || !result.data) throw new Error("Invalid response from server");
      prepared = result.data;

      let cornPrice: number | null = null;
      if (cornResponse?.ok) {
        try {
          const corn = await cornResponse.json();
          if (corn?.success && corn.price) cornPrice = corn.price;
        } catch { /* cash-rent prefill is optional */ }
      }

      const county = prepared.county || auction.county || "";
      const acreage = prepared.acreage || auction.acreage || 0;
      const coordinates = prepared.coordinates
        || (auction.latitude && auction.longitude ? [auction.longitude, auction.latitude] : null);

      // The valuation request requires county + acreage; without them, let
      // the user fill in the gaps.
      if (!county || acreage < 0.1) {
        openPrefilledForm(auction, prepared);
        return;
      }

      const csr2Mean = prepared.csr2Mean ?? auction.csr2Mean ?? undefined;
      const texture = prepared.soilData?.texture;
      const payload = {
        address: prepared.address || auction.address || "",
        county,
        state: prepared.state || "Iowa",
        landType: (VALUATION_LAND_TYPES as readonly string[]).includes(prepared.landType)
          ? prepared.landType
          : "Dryland",
        acreage,
        includeImprovements: false,
        capRate: 0.03,
        csr2Mean,
        csr2Min: prepared.csr2Min ?? auction.csr2Min ?? undefined,
        csr2Max: prepared.csr2Max ?? auction.csr2Max ?? undefined,
        csr2Count: prepared.csr2Count ?? undefined,
        cashRentPerAcre: csr2Mean && cornPrice
          ? Math.round(csr2Mean * cornPrice * 100) / 100
          : undefined,
        latitude: coordinates ? coordinates[1] : undefined,
        longitude: coordinates ? coordinates[0] : undefined,
        ownerName: prepared.ownerName || "Unknown Owner",
        parcelNumber: prepared.parcelNumber || `AUCTION-${auction.id}`,
        mukey: prepared.mukey ?? undefined,
        soilSeries: prepared.soilData?.series ?? undefined,
        soilSlope: prepared.soilData?.slope ?? undefined,
        soilDrainage: prepared.soilData?.drainage ?? undefined,
        soilHydrologicGroup: prepared.soilData?.hydrologicGroup ?? undefined,
        soilFarmlandClass: prepared.soilData?.farmlandClass ?? undefined,
        soilTexture: texture
          ? `${texture.sand?.toFixed(0)}% sand, ${texture.silt?.toFixed(0)}% silt, ${texture.clay?.toFixed(0)}% clay`
          : undefined,
        soilSandPct: texture?.sand ?? undefined,
        soilSiltPct: texture?.silt ?? undefined,
        soilClayPct: texture?.clay ?? undefined,
        soilPH: texture?.ph ?? undefined,
        soilOrganicMatter: texture?.organicMatter ?? undefined,
        soilComponents: prepared.soilData?.components ?? undefined,
      };

      const createResponse = await apiRequest("POST", "/api/valuations", payload);
      const created = await createResponse.json();
      if (!created.success || !created.valuationId) {
        throw new Error(created.message || "Failed to start valuation");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/valuations"] });
      handleValuationCreated(created.valuationId);
    } catch (error) {
      console.error("Failed to start auction valuation:", error);
      // Fall back to the form so the user can still value it.
      openPrefilledForm(auction, prepared);
    } finally {
      setPreparingId(null);
    }
  };

  const overlays = (
    <Suspense fallback={null}>
      {showForm && (
        <PropertyFormOverlay
          onClose={() => { setShowForm(false); setParcelData(null); }}
          onValuationCreated={handleValuationCreated}
          drawnPolygonData={undefined}
          parcelData={parcelData}
        />
      )}
      {currentValuationId && showPipeline && valuation && (
        <ValuationPipelineOverlay data={valuation} onClose={() => setShowPipeline(false)} />
      )}
      {showReport && valuation && (
        <ValuationReportOverlay data={valuation} onClose={() => setShowReport(false)} />
      )}
    </Suspense>
  );

  return { startValuation, preparingId, overlays };
}
