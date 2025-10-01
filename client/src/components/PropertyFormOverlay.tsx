import { PropertyForm } from './property-form';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import * as turf from '@turf/turf';
import type { PropertyForm as PropertyFormData } from '@shared/schema';

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
      let wkt: string = '';
      let mergedPolygon: any;
      
      // First priority: Merge all geometries if multiple sections exist
      if (parcelData.allGeometries && parcelData.allGeometries.length > 1) {
        // Multiple sections detected - merge them all together
        const polygons = parcelData.allGeometries.map((geom: any) => {
          if (geom.type === 'Polygon' && geom.coordinates) {
            return turf.polygon(geom.coordinates);
          }
          return null;
        }).filter(p => p !== null);
        
        if (polygons.length > 1) {
          // Merge all polygons into a single multi-polygon or union
          mergedPolygon = polygons[0];
          for (let i = 1; i < polygons.length; i++) {
            const union = turf.union(mergedPolygon, polygons[i]);
            if (union) mergedPolygon = union;
          }
          
          // Convert merged polygon to WKT
          if (mergedPolygon && mergedPolygon.geometry) {
            const geom = mergedPolygon.geometry;
            if (geom.type === 'Polygon') {
              const coords = geom.coordinates[0];
              wkt = `POLYGON((${coords.map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(', ')}))`;
            } else if (geom.type === 'MultiPolygon') {
              // Handle MultiPolygon result from union
              const polygonWkts = geom.coordinates.map((polygon: number[][][]) => {
                const coords = polygon[0];
                return `(${coords.map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(', ')})`;
              });
              wkt = `MULTIPOLYGON(${polygonWkts.join(', ')})`;
            }
          }
          
          toast({
            title: "Analyzing Complete Parcel",
            description: `Merging ${polygons.length} sections of the ${Math.round(parcelData.acres)} acre parcel for comprehensive CSR2 analysis.`,
            variant: "default",
          });
        } else if (polygons.length === 1) {
          // Single polygon from allGeometries
          mergedPolygon = polygons[0];
          const coords = mergedPolygon.geometry.coordinates[0];
          wkt = `POLYGON((${coords.map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(', ')}))`;
        }
      } else if (parcelData.geometry && parcelData.geometry.type === 'Polygon' && parcelData.geometry.coordinates) {
        // Single geometry available
        const coords = parcelData.geometry.coordinates[0];
        wkt = `POLYGON((${coords.map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(', ')}))`;
        
        // Note for large parcels that may have multiple sections
        if (parcelData.acres > 100 && !parcelData.allGeometries) {
          toast({
            title: "Partial Parcel Analysis",
            description: `CSR2 analysis for one section of this ${Math.round(parcelData.acres)} acre parcel. Complete parcel may have additional sections.`,
            variant: "default",
          });
        }
      } else {
        // Fallback: Create buffer based on parcel acreage
        // This is less accurate but ensures we get some CSR2 data
        const centerLat = parcelData.coordinates[1];
        const centerLon = parcelData.coordinates[0];
        const acres = parcelData.acres || 160; // Default to 160 acres if not provided
        
        // Calculate approximate radius for the given acres
        // 1 acre = 4046.86 m²
        const areaInMeters = acres * 4046.86;
        const radius = Math.sqrt(areaInMeters / Math.PI);
        
        // Create a circular polygon
        const center = turf.point([centerLon, centerLat]);
        const buffered = turf.buffer(center, radius, { units: 'meters' });
        if (!buffered || !buffered.geometry) throw new Error('Failed to create buffer');
        const polygon = turf.polygon(buffered.geometry.coordinates as number[][][]);
        
        // Convert to WKT
        const coords = polygon.geometry.coordinates[0];
        wkt = `POLYGON((${coords.map(coord => `${coord[0]} ${coord[1]}`).join(', ')}))`;
        
        // Notify user that we're using an approximation
        toast({
          title: "Using Approximate Boundaries",
          description: "Exact parcel boundaries unavailable. CSR2 values are estimated based on parcel location and acreage.",
          variant: "default",
        });
      }
      
      // Only proceed if we have a valid WKT
      if (!wkt) {
        throw new Error('Unable to determine parcel boundaries');
      }
      
      // Get CSR2 data
      const csr2Response = await apiRequest('POST', '/api/csr2/polygon', { wkt });
      const csr2Data = await csr2Response.json();
      
      if (csr2Data.success) {
        // Use original parcel acres to maintain data accuracy
        const resultData = {
          wkt,
          csr2: csr2Data,
          acres: parcelData.acres, // Use original parcel acres
          originalAcres: parcelData.acres // Keep consistent
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
        longitude: parcelData.coordinates[0]
      };
    }
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
        <div className="p-4 sm:p-6 overflow-y-auto h-[calc(100%-4rem)] sm:h-[calc(100%-5rem)]">
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