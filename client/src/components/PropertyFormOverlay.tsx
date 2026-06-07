import { PropertyForm } from './property-form';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect, useRef } from 'react';
import * as turf from '@turf/turf';
import type { PropertyForm as PropertyFormData } from '@shared/schema';
import { SoilDataPanel } from './SoilDataPanel';

interface ParcelData {
  owner_name: string;
  address: string;
  acres: number;
  coordinates: [number, number];
  parcel_number: string;
  parcel_class: string;
  county: string;
  geometry?: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  allGeometries?: any[]; // All polygon sections for multi-section parcels
  
  // Valuation land type (for auctions)
  landType?: 'Irrigated' | 'Dryland' | 'Pasture' | 'CRP';
  
  // Auction-specific fields
  sourceAuctionId?: number;
  sourceAuctionTitle?: string;
  auctionDate?: Date | string | null;
  auctioneer?: string;
  extractedInfo?: {
    legalDescription?: string;
    actualLocation?: string;
    tracts?: number;
    confidence?: string;
    reasoning?: string;
  };
  csr2Mean?: number;
  csr2Min?: number;
  csr2Max?: number;
  csr2Source?: 'listing' | 'database';
  mukey?: string;
  soilData?: any;
  hasParcelMatch?: boolean;
  hasCSR2?: boolean;
  hasSoilData?: boolean;
}

interface DrawnPolygonData {
  wkt: string;
  acres: number;
  coordinates: [number, number];
  csr2?: {
    mean?: number;
    min?: number;
    max?: number;
    count?: number;
  };
  polygon?: any;
}

interface PropertyFormOverlayProps {
  onClose: () => void;
  onValuationCreated: (valuationId: number) => void;
  drawnPolygonData?: DrawnPolygonData;
  parcelData?: ParcelData;
}

// Cache for CSR2 data by parcel number to ensure consistency
const csr2Cache = new Map<string, any>();

export default function PropertyFormOverlay({ onClose, onValuationCreated, drawnPolygonData, parcelData }: PropertyFormOverlayProps) {
  const { toast } = useToast();
  const [isLoadingCSR2, setIsLoadingCSR2] = useState(false);
  const [parcelCSR2Data, setParcelCSR2Data] = useState<any>(null);
  const [mukey, setMukey] = useState<string | null>(null);
  const [soilData, setSoilData] = useState<any>(null);
  const [cornPrice, setCornPrice] = useState<number | null>(null);
  const [calculatedCashRent, setCalculatedCashRent] = useState<number | null>(null);

  // Tracks the parcel currently being looked at, so in-flight CSR2 fetches
  // for a previous parcel don't overwrite state when the user clicks rapidly.
  const activeParcelRef = useRef<any>(null);

  // Fetch mukey and soil data when parcel is selected
  useEffect(() => {
    const fetchSoilData = async () => {
      if (!parcelData || !parcelData.coordinates) {
        setMukey(null);
        setSoilData(null);
        return;
      }

      // If soil data is already provided (from auction preparation), use it
      if (parcelData.mukey && parcelData.soilData) {
        console.log('✅ Using pre-fetched soil data from auction preparation');
        setMukey(parcelData.mukey);
        setSoilData(parcelData.soilData);
        return;
      }

      const [lon, lat] = parcelData.coordinates;
      console.log(`🔍 Fetching mukey for parcel at: lon=${lon}, lat=${lat}`);

      try {
        // Get mukey
        const mukeyResponse = await fetch(`/api/mukey/point?lon=${lon}&lat=${lat}`);
        if (mukeyResponse.ok) {
          const mukeyData = await mukeyResponse.json();
          console.log('✅ Mukey response:', mukeyData);
          const fetchedMukey = mukeyData.mukey || null;
          setMukey(fetchedMukey);

          // If we have a mukey, fetch soil data
          if (fetchedMukey) {
            const soilResponse = await fetch(`/api/soil/mukey/${fetchedMukey}`);
            if (soilResponse.ok) {
              const soilResponseData = await soilResponse.json();
              console.log('✅ Soil data fetched for valuation:', soilResponseData);
              setSoilData(soilResponseData.data || null);
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch mukey/soil data:', error);
        setMukey(null);
        setSoilData(null);
      }
    };

    fetchSoilData();
  }, [parcelData]);



  // Fetch CSR2 data for parcel — refire on every new parcel.
  // The earlier `!parcelCSR2Data` guard meant rapid clicks (form already
  // open) inherited the previous parcel's CSR2 — or none, if the first
  // fetch failed.
  useEffect(() => {
    // Reset stale CSR2 from the previous parcel and mark the new one active.
    activeParcelRef.current = parcelData;
    setParcelCSR2Data(null);
    setIsLoadingCSR2(false);

    if (!parcelData) return;

    // Pre-supplied (e.g., from auction prepare-valuation flow)
    if (parcelData.csr2Mean !== undefined) {
      console.log('✅ Using pre-fetched CSR2 data from auction preparation');
      setParcelCSR2Data({
        mean: parcelData.csr2Mean,
        min: parcelData.csr2Min,
        max: parcelData.csr2Max,
      });
      return;
    }

    fetchParcelCSR2Data();
  }, [parcelData]);

  // Fetch corn price for cash rent calculation
  useEffect(() => {
    const fetchCornPrice = async () => {
      try {
        const response = await fetch('/api/corn-price');
        const data = await response.json();
        if (data.success && data.price) {
          setCornPrice(data.price);
          console.log(`🌽 Corn futures price: $${data.price}/bushel`);
        }
      } catch (error) {
        console.error('Failed to fetch corn price:', error);
      }
    };
    fetchCornPrice();
  }, []);

  // Calculate cash rent when we have both CSR2 and corn price
  useEffect(() => {
    const csr2Mean = parcelCSR2Data?.csr2?.mean || parcelCSR2Data?.mean || parcelData?.csr2Mean || drawnPolygonData?.csr2?.mean;
    
    if (csr2Mean && cornPrice) {
      const cashRent = Math.round(csr2Mean * cornPrice * 100) / 100;
      setCalculatedCashRent(cashRent);
      console.log(`💰 Calculated cash rent: $${cornPrice}/bu × ${csr2Mean} CSR2 = $${cashRent}/acre`);
    }
  }, [parcelCSR2Data, parcelData?.csr2Mean, drawnPolygonData?.csr2?.mean, cornPrice]);

  const fetchParcelCSR2Data = async () => {
    if (!parcelData) return;
    // Capture the parcel we're fetching FOR so we can ignore stale results
    // if the user clicks another parcel before this resolves.
    const targetParcel = parcelData;

    // Check cache first (only apply the cached result if still on this parcel)
    const cacheKey = targetParcel.parcel_number;
    if (cacheKey && csr2Cache.has(cacheKey)) {
      const cachedData = csr2Cache.get(cacheKey);
      if (activeParcelRef.current === targetParcel) {
        setParcelCSR2Data(cachedData);
      }
      return;
    }

    setIsLoadingCSR2(true);
    try {
      // Collect all polygon geometries (either from allGeometries or single geometry)
      // Flatten any geometry (Polygon or MultiPolygon) into individual turf
      // polygons. Aggregated parcels from MVT tiles come through as
      // MultiPolygon, and the previous code silently dropped them — leaving
      // us with one sample point at the clicked coord, which often missed.
      const toPolygons = (geom: any): any[] => {
        if (!geom || !geom.coordinates) return [];
        if (geom.type === 'Polygon') return [turf.polygon(geom.coordinates)];
        if (geom.type === 'MultiPolygon') {
          return geom.coordinates.map((rings: number[][][]) =>
            turf.polygon(rings),
          );
        }
        return [];
      };

      let polygons: any[] = [];
      if (parcelData.allGeometries && parcelData.allGeometries.length > 0) {
        polygons = parcelData.allGeometries.flatMap(toPolygons);
      } else if (parcelData.geometry) {
        polygons = toPolygons(parcelData.geometry);
      }
      
      // Send the actual field polygon to the server, which computes an
      // AREA-WEIGHTED CSR2 by densely sampling points clipped to the polygon
      // (server: getCsr2PolygonStats). This replaces the old client-side 3x3
      // grid + unweighted average, which sampled too sparsely and (for the
      // bounding box) off-field — under-reporting CSR2.
      let samplePoints: [number, number][] = [];

      if (polygons.length > 0) {
        // Build a MULTIPOLYGON WKT from the parcel's ring(s).
        const ringToWkt = (coords: number[][]) =>
          '((' + coords.map(c => `${c[0]} ${c[1]}`).join(', ') + '))';
        const fieldWkt =
          'MULTIPOLYGON(' +
          polygons
            .map(p => p.geometry?.coordinates?.[0])
            .filter((r): r is number[][] => Array.isArray(r) && r.length >= 3)
            .map(ringToWkt)
            .join(', ') +
          ')';

        let csr2Data: any = {};
        try {
          const response = await apiRequest('POST', '/api/csr2/polygon', { wkt: fieldWkt });
          const data = await response.json();
          if (data.success && data.mean != null) {
            csr2Data = {
              success: true,
              mean: Math.round(data.mean * 10) / 10,
              min: Math.round(data.min),
              max: Math.round(data.max),
              count: data.count,
            };
          }
        } catch (error) {
          console.error('Area-weighted CSR2 request failed:', error);
        }

        if (csr2Data.mean != null) {
          const resultData = {
            wkt: fieldWkt,
            csr2: csr2Data,
            acres: parcelData.acres,
            originalAcres: parcelData.acres,
          };
          if (targetParcel.parcel_number) csr2Cache.set(targetParcel.parcel_number, resultData);
          if (activeParcelRef.current === targetParcel) setParcelCSR2Data(resultData);
          return;
        }
        // If the polygon request failed, fall through to the point-sample path.

        // Polygon area-weighted request failed — fall back to the clicked point.
        if (parcelData.coordinates) samplePoints.push(parcelData.coordinates);
      } else {
        // Fallback: Use clicked point only (fastest!)
        samplePoints.push(parcelData.coordinates);
      }
      
      // PARALLELIZED QUERIES: Query all points at once (10-20x faster!)
      const csr2Values: number[] = [];
      
      if (samplePoints.length > 0) {
        // Query ALL points in parallel (not one-by-one!)
        const promises = samplePoints.map(async point => {
          try {
            const pointWkt = `POINT(${point[0]} ${point[1]})`;
            const response = await apiRequest('POST', '/api/csr2/polygon', { wkt: pointWkt });
            const data = await response.json();
            return data.success && data.mean ? data.mean : null;
          } catch (error) {
            return null; // Skip failed points
          }
        });
        
        // Wait for all queries to complete at once
        const results = await Promise.all(promises);
        csr2Values.push(...results.filter((v): v is number => v !== null));
      }
      
      // Calculate average CSR2
      let csr2Data: any = {};
      if (csr2Values.length > 0) {
        const mean = csr2Values.reduce((sum, val) => sum + val, 0) / csr2Values.length;
        const min = Math.min(...csr2Values);
        const max = Math.max(...csr2Values);
        
        csr2Data = {
          success: true,
          mean: Math.round(mean * 10) / 10,
          min: Math.round(min),
          max: Math.round(max),
          count: csr2Values.length
        };
        
        // Create WKT from points
        const wkt = `MULTIPOINT(${samplePoints.map(p => `${p[0]} ${p[1]}`).join(', ')})`;

        const resultData = {
          wkt,
          csr2: csr2Data,
          acres: parcelData.acres,
          originalAcres: parcelData.acres
        };
        
        // Cache the result by parcel number
        if (targetParcel.parcel_number) {
          csr2Cache.set(targetParcel.parcel_number, resultData);
        }

        // Only commit to state if the user is still looking at this parcel.
        if (activeParcelRef.current === targetParcel) {
          setParcelCSR2Data(resultData);
        }
      } else {
        throw new Error('Unable to calculate CSR2 values');
      }
    } catch (error) {
      console.error('CSR2 fetch error:', error);
    } finally {
      if (activeParcelRef.current === targetParcel) {
        setIsLoadingCSR2(false);
      }
    }
  };

  // Start valuation mutation
  const startValuationMutation = useMutation({
    mutationFn: async (data: PropertyFormData) => {
      const response = await apiRequest("POST", "/api/valuations", data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/valuations"] });
      onValuationCreated(data.valuationId);
    },
    onError: (error) => {
      console.error('Valuation error:', error);
    },
  });

  const handlePropertySubmit = (data: PropertyFormData) => {
    console.log('📝 Form submission - parcelData:', parcelData);
    console.log('📝 Form submission - soilData:', soilData);
    console.log('📝 Form submission - mukey:', mukey);
    
    // Merge drawn polygon data if available (Option 2)
    if (drawnPolygonData) {
      data = {
        ...data,
        fieldWkt: drawnPolygonData.wkt,
        acreage: drawnPolygonData.acres,
        csr2Mean: drawnPolygonData.csr2?.mean,
        csr2Min: drawnPolygonData.csr2?.min,
        csr2Max: drawnPolygonData.csr2?.max,
        csr2Count: drawnPolygonData.csr2?.count,
        latitude: drawnPolygonData.coordinates[1],
        longitude: drawnPolygonData.coordinates[0]
      };
    } 
    // Merge parcel data if available (Option 1)
    else if (parcelData) {
      // Use CSR2 from parcelCSR2Data if available, otherwise use CSR2 from parcelData (auction)
      const csr2Mean = parcelCSR2Data?.csr2?.mean || parcelData.csr2Mean;
      const csr2Min = parcelCSR2Data?.csr2?.min || parcelData.csr2Min;
      const csr2Max = parcelCSR2Data?.csr2?.max || parcelData.csr2Max;
      const csr2Count = parcelCSR2Data?.csr2?.count;
      
      data = {
        ...data,
        fieldWkt: parcelCSR2Data?.wkt,
        acreage: parcelData.acres, // Always use original parcel acres
        // Include CSR2 data if available from either source
        ...(csr2Mean ? {
          csr2Mean: csr2Mean,
          csr2Min: csr2Min,
          csr2Max: csr2Max,
          csr2Count: csr2Count,
        } : {}),
        latitude: parcelData.coordinates[1],
        longitude: parcelData.coordinates[0],
        // Add owner & parcel info
        ownerName: parcelData.owner_name,
        parcelNumber: parcelData.parcel_number,
        // Add soil data
        mukey: mukey,
        soilSeries: soilData?.soilSeries,
        soilSlope: soilData?.slope,
        soilDrainage: soilData?.drainage,
        soilHydrologicGroup: soilData?.hydrologicGroup,
        soilFarmlandClass: soilData?.farmlandClass,
        soilTexture: soilData?.texture ? 
          `${soilData.texture.sand?.toFixed(0)}% sand, ${soilData.texture.silt?.toFixed(0)}% silt, ${soilData.texture.clay?.toFixed(0)}% clay` : null,
        soilSandPct: soilData?.texture?.sand,
        soilSiltPct: soilData?.texture?.silt,
        soilClayPct: soilData?.texture?.clay,
        soilPH: soilData?.texture?.ph,
        soilOrganicMatter: soilData?.texture?.organicMatter,
        soilComponents: soilData?.components
      };
    }
    
    console.log('📤 Submitting valuation with data:', data);
    startValuationMutation.mutate(data);
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div 
        className="absolute inset-2 sm:inset-auto sm:top-10 sm:right-4 sm:w-full sm:max-w-2xl sm:h-[calc(100vh-5rem)] bg-white rounded-xl shadow-2xl overflow-hidden transition-all duration-300 animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-slate-800">
              {parcelData ? "Parcel Valuation" : drawnPolygonData ? "Custom Area Valuation" : "Property Valuation Form"}
            </h2>
            {parcelData?.sourceAuctionId && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-1 bg-emerald-100 text-emerald-700 rounded-md font-medium">
                  From Auction
                </span>
                {parcelData.extractedInfo?.confidence && (
                  <span className={`text-xs px-2 py-1 rounded-md font-medium ${
                    parcelData.extractedInfo.confidence === 'high' 
                      ? 'bg-green-100 text-green-700' 
                      : parcelData.extractedInfo.confidence === 'medium'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {parcelData.extractedInfo.confidence} confidence
                  </span>
                )}
                {parcelData.hasParcelMatch && (
                  <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-md font-medium">
                    Parcel Matched
                  </span>
                )}
              </div>
            )}
          </div>
          <Button 
            onClick={onClose} 
            variant="ghost" 
            size="icon"
            className="rounded-full hover:bg-slate-100 touch-target"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto h-[calc(100%-4rem)] sm:h-[calc(100%-5rem)] space-y-6">
          {/* Soil Data Panel - Shows Iowa soil properties */}
          {mukey && parcelData && (
            <div className="mb-6">
              <SoilDataPanel
                mukey={mukey}
                parcelInfo={{
                  ownerName: parcelData.owner_name,
                  parcelNumber: parcelData.parcel_number,
                  county: parcelData.county,
                  acres: parcelData.acres,
                }}
                csr2={{
                  mean:
                    parcelCSR2Data?.csr2?.mean ??
                    parcelCSR2Data?.mean ??
                    parcelData?.csr2Mean,
                  min:
                    parcelCSR2Data?.csr2?.min ??
                    parcelCSR2Data?.min ??
                    parcelData?.csr2Min,
                  max:
                    parcelCSR2Data?.csr2?.max ??
                    parcelCSR2Data?.max ??
                    parcelData?.csr2Max,
                  count: parcelCSR2Data?.csr2?.count,
                }}
                isLoadingCsr2={isLoadingCSR2}
              />
            </div>
          )}
          
          <PropertyForm 
            onSubmit={handlePropertySubmit}
            isLoading={startValuationMutation.isPending || isLoadingCSR2}
            initialData={drawnPolygonData ? {
              // Option 2: Drawn polygon data takes priority
              address: 'Custom Polygon Area', // Default address for drawn polygons
              acreage: drawnPolygonData.acres || 0,
              latitude: drawnPolygonData.coordinates[1],
              longitude: drawnPolygonData.coordinates[0],
              county: 'Harrison', // Default county for drawn polygons
              state: 'Iowa', // Default state for drawn polygons
              landType: 'Dryland' as const, // Default to Dryland for drawn polygons
              csr2Mean: drawnPolygonData.csr2?.mean,
              csr2Min: drawnPolygonData.csr2?.min,
              csr2Max: drawnPolygonData.csr2?.max,
              csr2Count: drawnPolygonData.csr2?.count,
              // Prefill cash rent with CSR2 × corn price
              ...(calculatedCashRent ? { cashRentPerAcre: calculatedCashRent } : {}),
            } : parcelData ? {
              // Option 1: Parcel data
              address: parcelData.address || parcelData.owner_name || '',
              county: parcelData.county || '',
              state: 'Iowa',
              landType: parcelData.landType || 'Dryland' as const, // Use AI-determined land type or default to Dryland
              acreage: parcelData.acres || 0,
              // Only include CSR2 values if they exist and are not null
              ...(parcelCSR2Data?.csr2?.mean || parcelData.csr2Mean ? {
                csr2Mean: parcelCSR2Data?.csr2?.mean || parcelData.csr2Mean,
                csr2Min: parcelCSR2Data?.csr2?.min || parcelData.csr2Min,
                csr2Max: parcelCSR2Data?.csr2?.max || parcelData.csr2Max,
                csr2Count: parcelCSR2Data?.csr2?.count,
                csr2Source: parcelData.csr2Source || (parcelCSR2Data?.csr2?.mean ? 'database' : 'listing'),
              } : {}),
              // Prefill cash rent with CSR2 × corn price
              ...(calculatedCashRent ? { cashRentPerAcre: calculatedCashRent } : {}),
            } : undefined}
            hideLocationFields={!!drawnPolygonData || !!parcelData} // Hide location fields for both Option 1 and Option 2
            isParcelBased={!!parcelData && !drawnPolygonData} // Flag for parcel-based valuation (only when no polygon is drawn)
            csr2LoadingMessage={isLoadingCSR2 ? "Analyzing soil productivity data..." : undefined}
            calculatedCashRent={calculatedCashRent || undefined}
          />
        </div>
      </div>
    </div>
  );
}