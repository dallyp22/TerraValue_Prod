import { PropertyForm } from './property-form';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
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

  // Fetch mukey and soil data when parcel is selected
  useEffect(() => {
    const fetchSoilData = async () => {
      if (!parcelData || !parcelData.coordinates) {
        setMukey(null);
        setSoilData(null);
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



  // Fetch CSR2 data for parcel if needed
  useEffect(() => {
    if (parcelData && !parcelCSR2Data) {
      fetchParcelCSR2Data();
    }
  }, [parcelData]);

  const fetchParcelCSR2Data = async () => {
    if (!parcelData) return;
    
    // Check cache first
    const cacheKey = parcelData.parcel_number;
    if (cacheKey && csr2Cache.has(cacheKey)) {
      const cachedData = csr2Cache.get(cacheKey);
      setParcelCSR2Data(cachedData);
      return;
    }
    
    setIsLoadingCSR2(true);
    try {
      // Collect all polygon geometries (either from allGeometries or single geometry)
      let polygons: any[] = [];
      
      if (parcelData.allGeometries && parcelData.allGeometries.length > 0) {
        // Use all sections if available
        polygons = parcelData.allGeometries.map((geom: any) => {
          if (geom.type === 'Polygon' && geom.coordinates) {
            return turf.polygon(geom.coordinates);
          }
          return null;
        }).filter(p => p !== null);
      } else if (parcelData.geometry && parcelData.geometry.type === 'Polygon' && parcelData.geometry.coordinates) {
        // Single geometry available
        polygons = [turf.polygon(parcelData.geometry.coordinates)];
      }
      
      // Generate sample points within the parcel boundaries
      // Using FEWER points (9 max) for faster queries
      let samplePoints: [number, number][] = [];
      
      if (polygons.length > 0) {
        // Use 3x3 grid (9 points) for ALL parcels - much faster
        const gridSize = 3; // Always use 3x3 for speed
        
        // Create a bounding box for all polygons
        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;
        
        polygons.forEach(polygon => {
          const bbox = turf.bbox(polygon);
          minLng = Math.min(minLng, bbox[0]);
          minLat = Math.min(minLat, bbox[1]);
          maxLng = Math.max(maxLng, bbox[2]);
          maxLat = Math.max(maxLat, bbox[3]);
        });
        
        // Generate grid points within bounding box
        const lngStep = (maxLng - minLng) / (gridSize + 1);
        const latStep = (maxLat - minLat) / (gridSize + 1);
        
        for (let i = 1; i <= gridSize; i++) {
          for (let j = 1; j <= gridSize; j++) {
            const lng = minLng + (lngStep * i);
            const lat = minLat + (latStep * j);
            const point = turf.point([lng, lat]);
            
            // Only add points inside polygons
            const isInside = polygons.some(polygon => turf.booleanPointInPolygon(point, polygon));
            if (isInside) {
              samplePoints.push([lng, lat]);
            }
          }
        }
        
        // Always include center point
        const centerLng = (minLng + maxLng) / 2;
        const centerLat = (minLat + maxLat) / 2;
        const centerPoint = turf.point([centerLng, centerLat]);
        if (polygons.some(p => turf.booleanPointInPolygon(centerPoint, p))) {
          samplePoints.push([centerLng, centerLat]);
        }
      } else {
        // Fallback: Use clicked point only (fastest!)
        samplePoints.push(parcelData.coordinates);
      }
      
      // PARALLELIZED QUERIES: Query all points at once (10-20x faster!)
      const csr2Values: number[] = [];
      
      if (samplePoints.length > 0) {
        toast({
          title: "Analyzing Soil Quality",
          description: `Querying ${samplePoints.length} points across parcel (parallelized for speed)...`,
          variant: "default",
        });
        
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
        if (parcelData.parcel_number) {
          csr2Cache.set(parcelData.parcel_number, resultData);
        }
        
        setParcelCSR2Data(resultData);
        
        toast({
          title: "CSR2 Analysis Complete",
          description: `Average CSR2: ${csr2Data.mean.toFixed(1)} (Range: ${csr2Data.min}-${csr2Data.max})`,
          variant: "default",
        });
      } else {
        throw new Error('Unable to calculate CSR2 values');
      }
    } catch (error) {
      console.error('CSR2 fetch error:', error);
      toast({
        title: "Warning",
        description: "Could not fetch CSR2 data for this parcel. You can still proceed with manual entry.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingCSR2(false);
    }
  };

  // Start valuation mutation
  const startValuationMutation = useMutation({
    mutationFn: async (data: PropertyFormData) => {
      const response = await apiRequest("POST", "/api/valuations", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Valuation Started",
        description: "AI analysis pipeline has been initiated for your property.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/valuations"] });
      onValuationCreated(data.valuationId);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start valuation process",
        variant: "destructive",
      });
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
    else if (parcelData && parcelCSR2Data) {
      data = {
        ...data,
        fieldWkt: parcelCSR2Data.wkt,
        acreage: parcelData.acres, // Always use original parcel acres
        csr2Mean: parcelCSR2Data.csr2?.mean,
        csr2Min: parcelCSR2Data.csr2?.min,
        csr2Max: parcelCSR2Data.csr2?.max,
        csr2Count: parcelCSR2Data.csr2?.count,
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
          <h2 className="text-lg sm:text-xl font-semibold text-slate-800">
            {parcelData ? "Parcel Valuation" : drawnPolygonData ? "Custom Area Valuation" : "Property Valuation Form"}
          </h2>
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
                  acres: parcelData.acres
                }}
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
              csr2Mean: drawnPolygonData.csr2?.mean,
              csr2Min: drawnPolygonData.csr2?.min,
              csr2Max: drawnPolygonData.csr2?.max,
              csr2Count: drawnPolygonData.csr2?.count,
            } : parcelData ? {
              // Option 1: Parcel data
              address: parcelData.owner_name || '',
              county: parcelData.county || '',
              state: 'Iowa',
              acreage: parcelData.acres || 0,
              csr2Mean: parcelCSR2Data?.csr2?.mean,
              csr2Min: parcelCSR2Data?.csr2?.min,
              csr2Max: parcelCSR2Data?.csr2?.max,
              csr2Count: parcelCSR2Data?.csr2?.count,
            } : undefined}
            hideLocationFields={!!drawnPolygonData || !!parcelData} // Hide location fields for both Option 1 and Option 2
            isParcelBased={!!parcelData && !drawnPolygonData} // Flag for parcel-based valuation (only when no polygon is drawn)
            csr2LoadingMessage={isLoadingCSR2 ? "Analyzing soil productivity data..." : undefined}
          />
        </div>
      </div>
    </div>
  );
}