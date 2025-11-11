import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Menu, Plus, Minus, Locate, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import * as turf from '@turf/turf';
import EnhancedMap from './EnhancedMap';
import LeftSidebar, { type AuctionFilters, type MapOverlays, type MapInfo } from './LeftSidebar';
import MapControls from './MapControls';
import PropertyFormOverlay from './PropertyFormOverlay';
import ValuationPipelineOverlay from './ValuationPipelineOverlay';
import ValuationReportOverlay from './ValuationReportOverlay';
import { Header } from './layout/header';
import { apiRequest } from '@/lib/queryClient';
import type { PropertyForm as PropertyFormData, Valuation, Auction } from '@shared/schema';

export default function MapCentricHome() {
  // Map state
  const [drawModeEnabled, setDrawModeEnabled] = useState(false);
  const [drawnPolygonData, setDrawnPolygonData] = useState<any>(null);
  const [mapRef, setMapRef] = useState<any>(null);
  const [showOwnerLabels, setShowOwnerLabels] = useState(false);
  const [clearPolygons, setClearPolygons] = useState(false);
  const [showAuctionLayer, setShowAuctionLayer] = useState(true);
  
  // Sidebar state
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  
  // Filter state
  const [filters, setFilters] = useState<AuctionFilters>({
    searchLocation: '',
    auctionDateRange: 'all',
    minAcreage: 0,
    maxAcreage: 1000,
    minCSR2: 5,
    maxCSR2: 100,
    minTillablePercent: 0,
    maxTillablePercent: 100,
    propertyTypes: [],
    minValue: null,
    maxValue: null,
    counties: [],
  });
  const [auctionCount, setAuctionCount] = useState(0);
  
  // Map overlays state
  const [mapOverlays, setMapOverlays] = useState<MapOverlays>({
    showAuctions: true,
    showAggregatedParcels: false,
    showSubstations: false,
    showDatacenters: false,
    datacenterStates: {
      iowa: true,
      illinois: false,
      missouri: true,
      nebraska: true,
      wisconsin: true
    },
    showLakes: true,
    lakeTypes: {
      lakes: true,
      reservoirs: true
    },
    showPowerLines: false,
    powerLineVoltages: {
      kv345: true,
      kv161: true,
      kv138: true,
      kv115: true,
      kv69: true
    },
    showTransmissionLines: false,
    transmissionLineStates: {
      kansas: true,
      minnesota: true,
      missouri: true,
      nebraska: true,
      southDakota: true
    },
    transmissionLineVoltages: {
      kv345: true,
      kv230: true,
      kv161: true,
      kv138: true,
      kv115: true,
      kv69: true
    },
    showCityLabels: true,
    showHighways: true
  });

  // Sync auction layer visibility with map overlays
  useEffect(() => {
    setShowAuctionLayer(mapOverlays.showAuctions);
  }, [mapOverlays.showAuctions]);
  
  // Handle URL parameters to focus map on specific auction
  useEffect(() => {
    if (!mapRef) return;
    
    const params = new URLSearchParams(window.location.search);
    const lat = params.get('lat');
    const lng = params.get('lng');
    const zoom = params.get('zoom');
    const auctionId = params.get('auctionId');
    
    if (lat && lng) {
      console.log(`📍 Focusing map on auction ${auctionId || 'unknown'} at ${lat}, ${lng}`);
      
      mapRef.flyTo({
        center: [parseFloat(lng), parseFloat(lat)],
        zoom: zoom ? parseInt(zoom) : 15,
        essential: true,
        duration: 2000
      });
      
      // Clear URL params after focusing (optional, keeps URL clean)
      window.history.replaceState({}, '', '/');
    }
  }, [mapRef]);

  // Map info state (UI controls visibility)
  const [mapInfo, setMapInfo] = useState<MapInfo>({
    showScrapingModule: true,
    showLegend: true,
    showLayerSwitcher: true,
  });

  // Valuation state
  const [showForm, setShowForm] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [currentValuationId, setCurrentValuationId] = useState<number | null>(null);
  const [parcelData, setParcelData] = useState<any>(null);

  const { toast } = useToast();

  // Zoom control handlers
  const handleZoomIn = () => {
    if (mapRef) {
      mapRef.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapRef) {
      mapRef.zoomOut();
    }
  };

  const handleMyLocation = () => {
    if (navigator.geolocation && mapRef) {
      navigator.geolocation.getCurrentPosition((position) => {
        mapRef.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 14,
          duration: 2000,
        });
      });
    }
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  // Fetch valuation data
  const { data: currentValuation } = useQuery<{ success: boolean; valuation: Valuation }>({
    queryKey: [`/api/valuations/${currentValuationId}`],
    enabled: !!currentValuationId,
    refetchInterval: currentValuationId ? 2000 : false,
    refetchIntervalInBackground: true,
  });

  const valuation = currentValuation?.valuation;

  // Auto-open Valuation Report when completed
  useEffect(() => {
    if (valuation?.status === 'completed' && !showReport) {
      setShowReport(true);
      setShowPipeline(false);
    }
  }, [valuation?.status]);

  // Handle polygon drawn
  const handlePolygonDrawn = async (polygon: any) => {
    const area = turf.area(polygon);
    const acres = Math.round((area / 4046.86) * 100) / 100;
    
    const coordinates = polygon.geometry.coordinates[0];
    const wkt = `POLYGON((${coordinates.map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(', ')}))`;
    
    setDrawnPolygonData({
      polygon,
      acres,
      wkt,
      coordinates: coordinates[0]
    });
    
    try {
      const response = await apiRequest('POST', '/api/csr2/polygon', { wkt });
      const csr2Data = await response.json();
      
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

  // Handle parcel click
  const handleParcelClick = (parcel: any) => {
    if (!drawModeEnabled) {
      setParcelData(parcel);
      setShowForm(true);
    }
  };

  // Handle auction click - just shows info panel, does NOT open valuation form
  const handleAuctionClick = (auction: Auction) => {
    // Info panel will be shown by EnhancedMap's selectedAuction state
    // This callback can be used for additional logic if needed
    console.log('Auction info panel opened:', auction.title);
  };

  // Handle starting valuation from auction info panel
  const handleStartAuctionValuation = (auction: Auction) => {
    // Populate form with auction data
    setParcelData({
      ...auction,
      coordinates: auction.latitude && auction.longitude ? [auction.longitude, auction.latitude] : null
    });
    setShowForm(true);
  };

  // Handle valuation created
  const handleValuationCreated = (valuationId: number) => {
    setCurrentValuationId(valuationId);
    setShowForm(false);
    setShowPipeline(true);
  };

  // Handle new valuation
  const handleNewValuation = () => {
    setCurrentValuationId(null);
    setShowForm(false);
    setShowPipeline(false);
    setShowReport(false);
    setSelectedItem(null);
    setSelectedItemType(null);
    setParcelData(null);
    setDrawnPolygonData(null);
    setDrawModeEnabled(false);
    
    toast({
      title: "Ready for New Valuation",
      description: "Click on a parcel or draw a polygon to start"
    });
  };

  // Handle location search
  const handleLocationSearch = async (location: string) => {
    try {
      const response = await apiRequest('POST', '/api/geocode', { address: location });
      const data = await response.json();
      
      if (data.success && mapRef) {
        mapRef.flyTo({
          center: [data.longitude, data.latitude],
          zoom: 15,
          duration: 2000
        });

        toast({
          title: "Location Found",
          description: "Map centered on location"
        });
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      toast({
        title: "Location Not Found",
        description: "Please check the location and try again",
        variant: "destructive"
      });
    }
  };

  // Fetch auction count when filters change
  useEffect(() => {
    const fetchAuctionCount = async () => {
      try {
        const params = new URLSearchParams();
        if (filters.minAcreage) params.append('minAcreage', filters.minAcreage.toString());
        if (filters.maxAcreage) params.append('maxAcreage', filters.maxAcreage.toString());
        if (filters.minCSR2) params.append('minCSR2', filters.minCSR2.toString());
        if (filters.maxCSR2) params.append('maxCSR2', filters.maxCSR2.toString());
        if (filters.auctionDateRange && filters.auctionDateRange !== 'all') {
          params.append('auctionDateRange', filters.auctionDateRange);
        }
        filters.propertyTypes.forEach((type: string) => params.append('landTypes[]', type));
        filters.counties.forEach((county: string) => params.append('counties[]', county));
        if (filters.minValue) params.append('minValue', filters.minValue.toString());
        if (filters.maxValue) params.append('maxValue', filters.maxValue.toString());
        
        const response = await fetch(`https://web-production-51e54.up.railway.app/api/auctions/count?${params}`);
        const data = await response.json();
        if (data.success) {
          setAuctionCount(data.count || 0);
        }
      } catch (error) {
        console.error('Error fetching auction count:', error);
      }
    };
    
    fetchAuctionCount();
  }, [filters]);

  return (
    <>
      <Header />
      <div className="app-grid-layout">
      {/* Left Sidebar - Search & Filters */}
      <LeftSidebar
        isOpen={leftSidebarOpen}
        onClose={() => setLeftSidebarOpen(false)}
        filters={filters}
        onFiltersChange={setFilters}
        onLocationSearch={handleLocationSearch}
        auctionCount={auctionCount}
        mapOverlays={mapOverlays}
        onMapOverlaysChange={setMapOverlays}
        mapInfo={mapInfo}
        onMapInfoChange={setMapInfo}
      />

      {/* Map Container */}
      <div className="relative w-full h-screen overflow-hidden">
        <EnhancedMap
          drawModeEnabled={drawModeEnabled}
          onParcelClick={handleParcelClick}
          onAuctionClick={handleAuctionClick}
          onStartAuctionValuation={handleStartAuctionValuation}
          onPolygonDrawn={handlePolygonDrawn}
          drawnPolygonData={drawnPolygonData}
          onMapReady={(map) => setMapRef(map)}
          showOwnerLabels={showOwnerLabels}
          clearDrawnPolygons={clearPolygons}
          onClearComplete={() => {
            setClearPolygons(false);
            setDrawnPolygonData(null);
          }}
          showAuctionLayer={showAuctionLayer}
          auctionFilters={filters}
          showSubstations={mapOverlays.showSubstations}
          showDatacenters={mapOverlays.showDatacenters}
          datacenterStates={mapOverlays.datacenterStates}
          showLakes={mapOverlays.showLakes}
          lakeTypes={mapOverlays.lakeTypes}
          showPowerLines={mapOverlays.showPowerLines}
          powerLineVoltages={mapOverlays.powerLineVoltages}
          showTransmissionLines={mapOverlays.showTransmissionLines}
          transmissionLineStates={mapOverlays.transmissionLineStates}
          transmissionLineVoltages={mapOverlays.transmissionLineVoltages}
          showCityLabels={mapOverlays.showCityLabels}
          showHighways={mapOverlays.showHighways}
          showAggregatedParcels={mapOverlays.showAggregatedParcels}
          useSelfHostedParcels={mapOverlays.showAggregatedParcels || false} // Toggle controls self-hosted parcels
        />

        {/* Map Controls */}
        <MapControls 
          showLegend={mapInfo.showLegend}
        />

        {/* Mobile Toggle Buttons */}
        <div className="lg:hidden">
          {/* Left Sidebar Toggle */}
          <Button
            onClick={() => setLeftSidebarOpen(true)}
            className="fixed top-4 left-4 z-[998] bg-white hover:bg-slate-50 text-slate-800 shadow-lg"
            size="icon"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        {/* Unified Top-Left Control Panel - Desktop Only */}
        {mapInfo.showScrapingModule && (
        <div className="hidden lg:block absolute top-4 left-4 z-50">
          <div className="bg-white/95 backdrop-blur-sm p-3 rounded-lg shadow-lg flex gap-3">
            {/* Left side - Scraping Controls */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs cursor-pointer px-2">
                <input
                  type="checkbox"
                  checked={drawModeEnabled}
                  onChange={(e) => setDrawModeEnabled(e.target.checked)}
                  className="rounded"
                />
                <span>Draw Polygon</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer px-2">
                <input
                  type="checkbox"
                  checked={showOwnerLabels}
                  onChange={(e) => setShowOwnerLabels(e.target.checked)}
                  className="rounded"
                />
                <span>Owner Names</span>
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer px-2">
                <input
                  type="checkbox"
                  checked={showAuctionLayer}
                  onChange={(e) => setShowAuctionLayer(e.target.checked)}
                  className="rounded"
                />
                <span>Land Auctions</span>
              </label>
              
              <div className="pt-2 border-t border-slate-200 space-y-2 px-2">
                <Button 
                  onClick={async () => {
                    try {
                      const response = await fetch('https://web-production-51e54.up.railway.app/api/auctions/refresh', { method: 'POST' });
                      const data = await response.json();
                      if (data.success) {
                        toast({
                          title: "Auction Scrape Started",
                          description: "Scraping all 15 auction sites. This may take several minutes...",
                        });
                      }
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: "Failed to scrape auctions",
                        variant: "destructive"
                      });
                    }
                  }}
                  size="sm"
                  variant="outline"
                  className="text-blue-600 hover:text-blue-700 border-blue-300 hover:border-blue-400 w-full text-xs"
                >
                  Scrape Auctions
                </Button>
              </div>
            </div>

            {/* Right side - Zoom Controls */}
            <div className="flex flex-col gap-2 border-l border-slate-200 pl-3">
              <Button
                onClick={handleZoomIn}
                size="icon"
                variant="secondary"
                className="w-10 h-10 bg-white hover:bg-slate-50 shadow-sm border border-slate-200"
                title="Zoom In"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleZoomOut}
                size="icon"
                variant="secondary"
                className="w-10 h-10 bg-white hover:bg-slate-50 shadow-sm border border-slate-200"
                title="Zoom Out"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleMyLocation}
                size="icon"
                variant="secondary"
                className="w-10 h-10 bg-white hover:bg-slate-50 shadow-sm border border-slate-200"
                title="My Location"
              >
                <Locate className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleFullscreen}
                size="icon"
                variant="secondary"
                className="w-10 h-10 bg-white hover:bg-slate-50 shadow-sm border border-slate-200"
                title="Fullscreen"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        )}

        {/* Drawn polygon info with Start Valuation button */}
        {drawnPolygonData && (
          <div className="absolute right-4 bottom-32 z-50 bg-white/95 backdrop-blur-sm p-4 rounded-lg shadow-lg max-w-xs">
            <h3 className="font-semibold text-slate-800 mb-2 text-sm">Polygon Data</h3>
            <p className="text-sm text-slate-600">Acres: {drawnPolygonData.acres.toFixed(2)}</p>
            {drawnPolygonData.csr2 && (
              <p className="text-sm text-slate-600 mb-3">CSR2: {drawnPolygonData.csr2.mean?.toFixed(1) || 'N/A'}</p>
            )}
            <Button 
              className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white text-sm"
              onClick={() => setShowForm(true)}
            >
              Start Valuation
            </Button>
          </div>
        )}

        {/* Floating action buttons for pipeline and report */}
        {currentValuationId && !showForm && (
          <div className="fixed bottom-8 right-4 z-50 flex flex-col space-y-2">
            {!showPipeline && (
              <Button 
                onClick={() => setShowPipeline(true)} 
                size="sm"
                className="bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg"
              >
                View Pipeline
              </Button>
            )}
            {valuation?.status === 'completed' && !showReport && (
              <Button 
                onClick={() => setShowReport(true)} 
                size="sm"
                className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white shadow-lg"
              >
                View Report
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Overlays: Valuation Form, Pipeline, Report */}
      {showForm && (
        <PropertyFormOverlay 
          onClose={() => {
            setShowForm(false);
            setParcelData(null);
            setDrawnPolygonData(null);
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
    </div>
    </>
  );
}
