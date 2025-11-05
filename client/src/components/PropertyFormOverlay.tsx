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
      
      // CSR2 data variable
      let csr2Data: any = {};
      
      if (polygons.length > 0) {
        toast({
          title: "Analyzing Soil Quality",
          description: `Querying CSR2 data for ${Math.round(parcelData.acres)} acre parcel using area-weighted polygon analysis...`,
          variant: "default",
        });
        
        // OPTIMIZED: Use single polygon query instead of point-by-point (10-40x faster!)
        // Create GeoJSON polygon for the API
        let geoJsonPolygon: any = null;
        
        if (polygons.length > 1) {
          // MultiPolygon for parcels with multiple sections
          geoJsonPolygon = {
            type: 'MultiPolygon',
            coordinates: polygons.map(p => p.geometry.coordinates)
          };
        } else if (polygons.length === 1) {
          // Single polygon
          geoJsonPolygon = polygons[0].geometry;
        }

        // Single API call for entire parcel (3-8 seconds vs 50-200 seconds!)
        const response = await apiRequest('POST', '/api/average-csr2', { 
          polygon: geoJsonPolygon 
        });
        const data = await response.json();
        
        if (data.success) {
          csr2Data = {
            success: true,
            mean: data.average || data.mean,
            min: data.min,
            max: data.max,
            count: data.count
          };
        } else {
          throw new Error('CSR2 polygon query failed');
        }
      } else {
        // No polygon geometry - use single point query as fallback
        const pointWkt = `POINT(${parcelData.coordinates[0]} ${parcelData.coordinates[1]})`;
        const response = await apiRequest('POST', '/api/csr2/polygon', { wkt: pointWkt });
        const data = await response.json();
        
        if (data.success && data.mean) {
          csr2Data = {
            success: true,
            mean: data.mean,
            min: data.min || Math.round(data.mean),
            max: data.max || Math.round(data.mean),
            count: data.count || 1
          };
        } else {
          throw new Error('Unable to calculate CSR2 values');
        }
      }
      
      if (csr2Data.success) {
        // Create WKT from polygon for storage
        let wkt = '';
        if (geoJsonPolygon) {
          if (geoJsonPolygon.type === 'Polygon') {
            const coords = geoJsonPolygon.coordinates[0].map((c: number[]) => `${c[0]} ${c[1]}`).join(', ');
            wkt = `POLYGON((${coords}))`;
          } else if (geoJsonPolygon.type === 'MultiPolygon') {
            const polys = geoJsonPolygon.coordinates.map((poly: number[][][]) => {
              const coords = poly[0].map((c: number[]) => `${c[0]} ${c[1]}`).join(', ');
              return `((${coords}))`;
            }).join(', ');
            wkt = `MULTIPOLYGON(${polys})`;
          }
        } else {
          wkt = `POINT(${parcelData.coordinates[0]} ${parcelData.coordinates[1]})`;
        }

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
      }
    } catch (error) {
      toast({
        title: "Warning",
        description: "Could not fetch soil data for this parcel. Manual entry may be required.",
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