import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as turf from '@turf/turf';
import EnhancedMap from './EnhancedMap';
import PropertyFormOverlay from './PropertyFormOverlay';
import ValuationPipelineOverlay from './ValuationPipelineOverlay';
import ValuationReportOverlay from './ValuationReportOverlay';
import OwnerInfoSidebar from './OwnerInfoSidebar';
import { apiRequest } from '@/lib/queryClient';
import type { PropertyForm as PropertyFormData, Valuation } from '@shared/schema';


export default function MapCentricHome() {
  const [drawModeEnabled, setDrawModeEnabled] = useState(false);
  const [selectedParcel, setSelectedParcel] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [currentValuationId, setCurrentValuationId] = useState<number | null>(null);
  const [drawnPolygonData, setDrawnPolygonData] = useState<any>(null);
  const [address, setAddress] = useState("");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [mapRef, setMapRef] = useState<any>(null);
  const [parcelData, setParcelData] = useState<any>(null); // For Option 1
  const [showOwnerLabels, setShowOwnerLabels] = useState(false);
  const [clearPolygons, setClearPolygons] = useState(false);
  const [currentMapStyle, setCurrentMapStyle] = useState<'custom' | 'satellite' | 'street'>('satellite');
  const [showOwnershipHeatmap, setShowOwnershipHeatmap] = useState(false);
  const { toast } = useToast();

  // Fetch valuation data with React Query
  const { data: currentValuation } = useQuery<{ success: boolean; valuation: Valuation }>({
    queryKey: [`/api/valuations/${currentValuationId}`],
    enabled: !!currentValuationId,
    refetchInterval: currentValuationId ? 2000 : false,
    refetchIntervalInBackground: true,
  });

  const valuation = currentValuation?.valuation;

  // Auto-open Valuation Report when valuation is completed
  useEffect(() => {
    if (valuation?.status === 'completed' && !showReport) {
      setShowReport(true);
      setShowPipeline(false); // Close pipeline when report opens
    }
  }, [valuation?.status]); // Remove showReport from dependency to prevent interference

  const handlePolygonDrawn = async (polygon: any) => {
    // Calculate area with Turf.js
    const area = turf.area(polygon);
    const acres = Math.round((area / 4046.86) * 100) / 100; // Convert to acres with 2 decimal precision
    

    
    // Extract coordinates for CSR2 analysis
    const coordinates = polygon.geometry.coordinates[0];
    const wkt = `POLYGON((${coordinates.map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(', ')}))`;
    
    setDrawnPolygonData({
      polygon,
      acres,
      wkt,
      coordinates: coordinates[0] // Center point
    });
    
    // Trigger CSR2 analysis and reverse geocoding
    try {
      // Get CSR2 data
      const response = await apiRequest('POST', '/api/csr2/polygon', { wkt });
      const csr2Data = await response.json();
      
      // Reverse geocode the center point
      const reverseResponse = await apiRequest('POST', '/api/geocode/reverse', {
        latitude: coordinates[0][1],
        longitude: coordinates[0][0]
      });
      const locationData = await reverseResponse.json();
      
      setDrawnPolygonData((prev: any) => ({ 
        ...prev, 
        csr2: csr2Data,
        county: locationData.county || '',
        state: locationData.state || 'Iowa'
      }));
    } catch (error) {
      console.error('Error fetching CSR2 or location data:', error);
    }
  };

  const handleValuationCreated = (valuationId: number) => {
    setCurrentValuationId(valuationId);
    setShowForm(false);
    setShowPipeline(true);
  };

  const handleNewValuation = () => {
    // Reset all valuation-related state
    setCurrentValuationId(null);
    setShowForm(false);
    setShowPipeline(false);
    setShowReport(false);
    setSelectedParcel(null);
    setParcelData(null);
    setDrawnPolygonData(null);
    setDrawModeEnabled(false);
    
    toast({
      title: "Ready for New Valuation",
      description: "Click on a parcel or draw a polygon to start"
    });
  };

  const handleAddressSearch = async () => {
    if (!address.trim()) return;

    setIsGeocoding(true);
    
    try {
      const response = await apiRequest('POST', '/api/geocode', { address: address.trim() });
      const data = await response.json();
      
      if (data.success && mapRef) {
        mapRef.flyTo({
          center: [data.longitude, data.latitude],
          zoom: 15,
          duration: 2000
        });

        toast({
          title: "Location Found",
          description: "Map centered on address"
        });
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      toast({
        title: "Address Not Found",
        description: "Please check the address and try again",
        variant: "destructive"
      });
    } finally {
      setIsGeocoding(false);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* Map as full-screen base */}
      <EnhancedMap
        drawModeEnabled={drawModeEnabled}
        onParcelClick={(parcel) => {
          // Only set selected parcel if not in draw mode
          if (!drawModeEnabled) {
            setSelectedParcel(parcel);
          }
        }}
        onPolygonDrawn={handlePolygonDrawn}
        drawnPolygonData={drawnPolygonData}
        onMapReady={(map) => setMapRef(map)}
        showOwnerLabels={showOwnerLabels}
        showOwnershipHeatmap={showOwnershipHeatmap}
        clearDrawnPolygons={clearPolygons}
        onClearComplete={() => {
          setClearPolygons(false);
          setDrawnPolygonData(null);
        }}
      />

      {/* Top-left Find Location module - aligned with zoom controls */}
      <div className="absolute top-4 left-[10px] z-50 w-[calc(100vw-200px)] sm:w-72">
        <Card className="bg-white/95 backdrop-blur-sm shadow-lg">
          <CardHeader className="pb-2 pt-3 px-3 sm:px-6 sm:pb-3 sm:pt-4">
            <CardTitle className="text-sm sm:text-base flex items-center space-x-2">
              <MapPin className="h-4 w-4 text-emerald-600" />
              <span>Find Location</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 px-3 sm:px-6 sm:pb-4">
            <div className="flex space-x-2">
              <Input
                placeholder="City, State"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddressSearch()}
                className="flex-1 text-sm"
              />
              <Button 
                onClick={handleAddressSearch}
                disabled={isGeocoding || !address.trim()}
                size="icon"
                className="bg-emerald-600 hover:bg-emerald-700 min-w-[2.5rem]"
              >
                {isGeocoding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            {/* Hidden toggle view button to reduce module height */}
            <p className="text-xs text-slate-600 text-left hidden sm:block mt-2">
              Input City, County or Address to pull CSR2 Data
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Top-right controls - mobile optimized with compact layout */}  
      <div className="absolute top-4 right-4 z-50">
        <div className="bg-white/95 backdrop-blur-sm p-1.5 sm:p-2 rounded-lg shadow-lg">
          <div className="flex flex-col space-y-1.5">
            <div className="flex items-center space-x-2">
              <Switch
                checked={drawModeEnabled}
                onCheckedChange={setDrawModeEnabled}
                className="data-[state=checked]:bg-emerald-600 scale-75 sm:scale-100"
              />
              <span className="text-[10px] sm:text-xs font-medium text-slate-700 whitespace-nowrap">Draw Polygon</span>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                checked={showOwnerLabels}
                onCheckedChange={setShowOwnerLabels}
                className="data-[state=checked]:bg-blue-600 scale-75 sm:scale-100"
              />
              <span className="text-[10px] sm:text-xs font-medium text-slate-700 whitespace-nowrap">Owner Names</span>
            </div>
            {/* Hidden Ownership Map toggle - not needed for users */}
            {drawnPolygonData && (
              <div className="pt-1.5 border-t border-slate-200">
                <Button 
                  onClick={() => setClearPolygons(true)}
                  size="sm"
                  variant="outline"
                  className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 w-full text-xs"
                >
                  Clear Map
                </Button>
              </div>
            )}
            {currentValuationId && (
              <div className="pt-1.5 border-t border-slate-200">
                <Button 
                  onClick={handleNewValuation}
                  size="sm"
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white w-full text-xs"
                >
                  New Valuation
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drawn polygon info with Start Valuation button - mobile optimized positioning */}
      {drawnPolygonData && (
        <div className={`absolute right-4 z-50 bg-white/95 backdrop-blur-sm p-3 rounded-lg shadow-lg transition-all duration-300 animate-fade-in ${
          currentValuationId ? 'top-56 sm:top-72' : 'top-44 sm:top-52'
        } ${!currentValuationId && !drawnPolygonData ? '' : 'max-w-[calc(100vw-6rem)]'}`}>
          <h3 className="font-semibold text-slate-800 mb-2 text-sm sm:text-base">Polygon Data</h3>
          <p className="text-xs sm:text-sm text-slate-600">Acres: {drawnPolygonData.acres.toFixed(2)}</p>
          {drawnPolygonData.csr2 && (
            <p className="text-xs sm:text-sm text-slate-600 mb-3">CSR2: {drawnPolygonData.csr2.mean?.toFixed(1) || 'N/A'}</p>
          )}
          <Button 
            className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-xs sm:text-sm"
            onClick={() => setShowForm(true)}
          >
            Start Valuation
          </Button>
        </div>
      )}

      {/* Overlays: Floating panels/modals on top of map */}
      {showForm && (
        <PropertyFormOverlay 
          onClose={() => {
            setShowForm(false);
            setParcelData(null); // Clear parcel data
            setDrawnPolygonData(null); // Clear polygon data
          }}
          onValuationCreated={handleValuationCreated}
          drawnPolygonData={drawnPolygonData}
          parcelData={parcelData}
        />
      )}
      {showPipeline && valuation && (
        <ValuationPipelineOverlay 
          data={valuation} 
          onClose={() => setShowPipeline(false)} 
        />
      )}
      {showReport && valuation && (
        <ValuationReportOverlay 
          data={valuation} 
          onClose={() => setShowReport(false)} 
        />
      )}

      {/* Sidebar for owner info - only show when a parcel is clicked and not drawing */}
      {selectedParcel && !drawModeEnabled && (
        <OwnerInfoSidebar 
          parcel={selectedParcel} 
          onClose={() => setSelectedParcel(null)} 
          onStartValuation={(parcel) => {
            // Use original parcel data without recalculation
            setParcelData(parcel);
            setShowForm(true);
            setSelectedParcel(null);
          }}
        />
      )}

      {/* Floating action buttons for pipeline and report - mobile optimized */}
      {currentValuationId && !showForm && (
        <div className="fixed bottom-20 sm:bottom-8 right-4 z-50 flex flex-col space-y-2">
          {!showPipeline && (
            <Button 
              onClick={() => setShowPipeline(true)} 
              size="sm"
              className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white rounded-lg shadow-lg whitespace-nowrap text-xs sm:text-sm px-3 sm:px-4 py-2"
            >
              View Pipeline
            </Button>
          )}
          {valuation?.status === 'completed' && !showReport && (
            <Button 
              onClick={() => setShowReport(true)} 
              size="sm"
              className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-lg shadow-lg whitespace-nowrap text-xs sm:text-sm px-3 sm:px-4 py-2"
            >
              View Report
            </Button>
          )}
        </div>
      )}
      
    </div>
  );
}