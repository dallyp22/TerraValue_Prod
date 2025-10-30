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
      let samplePoints: [number, number][] = [];
      
      if (polygons.length > 0) {
        // Determine number of sample points based on acreage
        const acres = parcelData.acres || 160;
        let gridSize: number;
        if (acres < 40) {
          gridSize = 3; // 3x3 = 9 points
        } else if (acres < 160) {
          gridSize = 4; // 4x4 = 16 points
        } else {
          gridSize = 5; // 5x5 = 25 points
        }
        
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
            
            // Check if point is inside any of the polygons
            const isInside = polygons.some(polygon => turf.booleanPointInPolygon(point, polygon));
            if (isInside) {
              samplePoints.push([lng, lat]);
            }
          }
        }
        
        // If we have very few points, add the center point and corners
        if (samplePoints.length < 3) {
          // Add center point
          const centerLng = (minLng + maxLng) / 2;
          const centerLat = (minLat + maxLat) / 2;
          const centerPoint = turf.point([centerLng, centerLat]);
          if (polygons.some(p => turf.booleanPointInPolygon(centerPoint, p))) {
            samplePoints.push([centerLng, centerLat]);
          }
          
          // Add clicked point as fallback
          if (parcelData.coordinates) {
            samplePoints.push(parcelData.coordinates);
          }
        }
      } else {
        // Fallback: Use clicked point and surrounding points
        const centerLat = parcelData.coordinates[1];
        const centerLon = parcelData.coordinates[0];
        const acres = parcelData.acres || 160;
        
        // Calculate approximate spread based on acreage
        // 1 acre ≈ 63.6m x 63.6m, so for N acres, approximate as square
        const sideLength = Math.sqrt(acres * 4046.86); // in meters
        const degreeSpread = sideLength / 111000; // rough conversion to degrees
        
        // Create a 3x3 grid around the center
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            const lng = centerLon + (i * degreeSpread / 3);
            const lat = centerLat + (j * degreeSpread / 3);
            samplePoints.push([lng, lat]);
          }
        }
      }
      
      // Query CSR2 for each sample point
      const csr2Values: number[] = [];
      
      if (samplePoints.length > 0) {
        toast({
          title: "Analyzing Soil Quality",
          description: `Sampling ${samplePoints.length} points across the ${Math.round(parcelData.acres)} acre parcel for comprehensive CSR2 analysis.`,
          variant: "default",
        });
        
        // Query each point
        for (const point of samplePoints) {
          try {
            const pointWkt = `POINT(${point[0]} ${point[1]})`;
            const response = await apiRequest('POST', '/api/csr2/polygon', { wkt: pointWkt });
            const data = await response.json();
            
            if (data.success && data.mean) {
              csr2Values.push(data.mean);
            }
          } catch (error) {
            // Skip failed points silently
          }
        }
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
      } else {
        throw new Error('Unable to calculate CSR2 values');
      }
      
      if (csr2Data.success) {
        // Use original parcel acres to maintain data accuracy
        const resultData = {
          wkt: `MULTIPOINT(${samplePoints.map(p => `${p[0]} ${p[1]}`).join(', ')})`,
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