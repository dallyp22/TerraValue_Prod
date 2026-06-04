import { useState, useRef, useEffect, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
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

/**
 * Runs the full auction-valuation flow (prepare → pre-filled form → pipeline →
 * report) as overlays, in-place, without navigating away. Returns a trigger
 * and the overlay JSX to render. Mirrors MapCentricHome's auction flow.
 */
export function useAuctionValuation() {
  const [parcelData, setParcelData] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [currentValuationId, setCurrentValuationId] = useState<number | null>(null);
  const [showPipeline, setShowPipeline] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
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

  const startValuation = async (auction: ValuableAuction) => {
    setIsPreparing(true);
    try {
      const response = await fetch(`/api/auctions/${auction.id}/prepare-valuation`, { method: "POST" });
      if (!response.ok) throw new Error("Failed to prepare valuation data");
      const result = await response.json();

      if (result.success && result.data) {
        setParcelData({
          owner_name: result.data.ownerName || "Unknown Owner",
          address: result.data.address || auction.address || "",
          acres: result.data.acreage || auction.acreage || 0,
          coordinates: result.data.coordinates || (auction.latitude && auction.longitude ? [auction.longitude, auction.latitude] : null),
          parcel_number: result.data.parcelNumber || `AUCTION-${auction.id}`,
          parcel_class: result.data.landType || "Agricultural",
          county: result.data.county || auction.county || "",
          landType: result.data.landType,
          sourceAuctionId: auction.id,
          sourceAuctionTitle: auction.title,
          auctionDate: auction.auctionDate,
          auctioneer: auction.auctioneer,
          csr2Mean: result.data.csr2Mean,
          csr2Min: result.data.csr2Min,
          csr2Max: result.data.csr2Max,
          extractedInfo: result.data.extractedInfo,
          geometry: result.data.fieldWkt,
          mukey: result.data.mukey,
          soilData: result.data.soilData,
          hasParcelMatch: result.data.hasParcelMatch,
          hasCSR2: result.data.hasCSR2,
          hasSoilData: result.data.hasSoilData,
        });
        setShowForm(true);
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (error) {
      console.error("Failed to prepare auction valuation:", error);
      // Fallback to basic auction data so the user can still value it.
      setParcelData({
        owner_name: "Unknown Owner",
        address: auction.address || "",
        acres: auction.acreage || 0,
        coordinates: auction.latitude && auction.longitude ? [auction.longitude, auction.latitude] : null,
        parcel_number: `AUCTION-${auction.id}`,
        parcel_class: "Agricultural",
        county: auction.county || "",
        landType: "Dryland",
        sourceAuctionId: auction.id,
        sourceAuctionTitle: auction.title,
        csr2Mean: auction.csr2Mean,
        csr2Min: auction.csr2Min,
        csr2Max: auction.csr2Max,
      });
      setShowForm(true);
    } finally {
      setIsPreparing(false);
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

  return { startValuation, isPreparing, overlays };
}
