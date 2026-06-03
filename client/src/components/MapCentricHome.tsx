import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Menu, Plus, Minus, Locate, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as turf from '@turf/turf';
import EnhancedMap from './EnhancedMap';
import LeftSidebar, { type AuctionFilters, type MapOverlays, type MapInfo } from './LeftSidebar';
import { useHiddenAuctions } from '@/hooks/use-hidden-auctions';
import { HiddenAuctionsDialog } from './HiddenAuctionsDialog';
import { usePortfolio } from '@/hooks/use-portfolio';
import type { PinCategory } from '@/types/portfolio';

type PortfolioAddMode = 'none' | 'pin' | 'select' | 'draw';
import MapControls from './MapControls';
import { Header } from './layout/header';
import { apiRequest } from '@/lib/queryClient';
import type { PropertyForm as PropertyFormData, Valuation, Auction } from '@shared/schema';

// Lazy load overlay components for code splitting
const PropertyFormOverlay = lazy(() => import('./PropertyFormOverlay'));
const ValuationPipelineOverlay = lazy(() => import('./ValuationPipelineOverlay'));
const ValuationReportOverlay = lazy(() => import('./ValuationReportOverlay'));

export default function MapCentricHome() {
  // Map state
  const [drawModeEnabled, setDrawModeEnabled] = useState(false);
  const [drawnPolygonData, setDrawnPolygonData] = useState<any>(null);
  const [mapRef, setMapRef] = useState<any>(null);
  const [showOwnerLabels, setShowOwnerLabels] = useState(false);
  const [clearPolygons, setClearPolygons] = useState(false);
  const [showAuctionLayer, setShowAuctionLayer] = useState(true);
  
  // Hidden auctions
  const { hiddenAuctions, hiddenCount, unhideAuction, unhideAll } = useHiddenAuctions();
  const [hiddenDialogOpen, setHiddenDialogOpen] = useState(false);

  // Portfolio pins
  const { pins, addPin, addParcel, addDrawnPolygon, updatePin, deletePin, pinsGeoJSON, pinsByCategory } = usePortfolio();
  const [portfolioAddMode, setPortfolioAddMode] = useState<PortfolioAddMode>('none');
  const [selectedPinCategory, setSelectedPinCategory] = useState<PinCategory>('interested');
  const pinDropMode = portfolioAddMode === 'pin';
  const portfolioSelectMode = portfolioAddMode === 'select';
  const portfolioDrawMode = portfolioAddMode === 'draw';

  // Sidebar state
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false);
  
  // Filter state
  const [filters, setFilters] = useState<AuctionFilters>({
    searchLocation: '',
    auctionDateRange: '90', // Default to next 90 days
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
    parcelDisplayMode: 'off',
    showSubstations: false,
    showDatacenters: false,
    datacenterStates: {
      iowa: true,
      illinois: false,
      missouri: true,
      nebraska: true,
      wisconsin: true
    },
    showLakes: false, // Disabled by default - lazy loads 11MB when enabled
    lakeTypes: {
      lakes: true,
      reservoirs: true
    },
    showTransmissionLines: false,
    transmissionLineStates: {
      iowa: true,
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
    showHighways: true,
    showStreetLabels: true,
    showPortfolioPins: true
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
    showLegend: false,
    showLayerSwitcher: true,
  });

  // Valuation state
  const [showForm, setShowForm] = useState(false);
  const [showPipeline, setShowPipeline] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [currentValuationId, setCurrentValuationId] = useState<number | null>(null);
  const [parcelData, setParcelData] = useState<any>(null);
  const [isPreparingAuctionValuation, setIsPreparingAuctionValuation] = useState(false);
  const hasAutoOpenedReport = useRef(false); // Track if we've auto-opened the report for this valuation

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
    refetchInterval: (query) => {
      // Only poll while a valuation is actively processing. Once it's
      // completed/failed, stop — otherwise a left-open tab hammers the API
      // (and keeps Neon awake) every 2s indefinitely.
      if (!currentValuationId) return false;
      const status = query.state.data?.valuation?.status;
      if (status === "completed" || status === "failed") return false;
      return 2000;
    },
    refetchIntervalInBackground: false,
  });

  const valuation = currentValuation?.valuation;

  // Auto-open Valuation Report when completed (only once per valuation)
  useEffect(() => {
    if (valuation?.status === 'completed' && !showReport && !hasAutoOpenedReport.current) {
      console.log('✅ Valuation completed! Opening report...');
      setShowReport(true);
      setShowPipeline(false);
      hasAutoOpenedReport.current = true; // Mark that we've auto-opened
    }
  }, [valuation?.status, showReport]);

  // Handle polygon drawn
  const handlePolygonDrawn = async (polygon: any) => {
    const area = turf.area(polygon);
    const acres = Math.round((area / 4046.86) * 100) / 100;

    const coordinates = polygon.geometry.coordinates[0];

    // Portfolio draw mode: save polygon to portfolio and clear draw
    if (portfolioAddMode === 'draw') {
      addDrawnPolygon({
        geometry: polygon.geometry as GeoJSON.Polygon,
        acres,
      }, selectedPinCategory);
      // Signal to clear MapboxDraw
      setClearPolygons(true);
      return;
    }

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
    // Portfolio select mode: save parcel to portfolio
    if (portfolioAddMode === 'select' && parcel.geometry) {
      addParcel({
        lng: parcel.coordinates?.[0] || 0,
        lat: parcel.coordinates?.[1] || 0,
        geometry: parcel.geometry as GeoJSON.Polygon,
        acres: parcel.acres || 0,
        parcelNumber: parcel.parcel_number || 'N/A',
        county: parcel.county || 'N/A',
        ownerName: parcel.owner_name || 'Unknown',
      }, selectedPinCategory);
      return;
    }
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
  const handleStartAuctionValuation = async (auction: Auction) => {
    setIsPreparingAuctionValuation(true);
    try {
      console.log('🎯 Preparing valuation from auction:', auction.title);

      // Call the prepare-valuation endpoint
      const response = await fetch(
        `/api/auctions/${auction.id}/prepare-valuation`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to prepare valuation data');
      }

      const result = await response.json();

      if (result.success && result.data) {
        console.log('✅ Valuation data prepared:', result.data);
        
        // Transform the prepared data to match ParcelData structure
        const enrichedParcelData = {
          // Basic info
          owner_name: result.data.ownerName || 'Unknown Owner',
          address: result.data.address || auction.address || '',
          acres: result.data.acreage || auction.acreage || 0,
          coordinates: result.data.coordinates || (auction.latitude && auction.longitude ? [auction.longitude, auction.latitude] : null),
          parcel_number: result.data.parcelNumber || `AUCTION-${auction.id}`,
          parcel_class: result.data.landType || 'Agricultural',
          county: result.data.county || auction.county || '',
          
          // Store the valuation land type for the form
          landType: result.data.landType, // This is the mapped valuation type (Irrigated, Dryland, Pasture, CRP)
          
          // Auction-specific metadata
          sourceAuctionId: auction.id,
          sourceAuctionTitle: auction.title,
          auctionDate: auction.auctionDate,
          auctioneer: auction.auctioneer,
          
          // CSR2 data
          csr2Mean: result.data.csr2Mean,
          csr2Min: result.data.csr2Min,
          csr2Max: result.data.csr2Max,
          
          // Extracted info
          extractedInfo: result.data.extractedInfo,
          
          // Geometry if matched
          geometry: result.data.fieldWkt,
          
          // Soil data
          mukey: result.data.mukey,
          soilData: result.data.soilData,
          
          // Flags
          hasParcelMatch: result.data.hasParcelMatch,
          hasCSR2: result.data.hasCSR2,
          hasSoilData: result.data.hasSoilData
        };

        setParcelData(enrichedParcelData);
        setShowForm(true);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('❌ Failed to prepare auction valuation:', error);
      
      // Fallback to basic auction data
      setParcelData({
        owner_name: 'Unknown Owner',
        address: auction.address || '',
        acres: auction.acreage || 0,
        coordinates: auction.latitude && auction.longitude ? [auction.longitude, auction.latitude] : null,
        parcel_number: `AUCTION-${auction.id}`,
        parcel_class: 'Agricultural',
        county: auction.county || '',
        landType: 'Dryland', // Default fallback
        sourceAuctionId: auction.id,
        sourceAuctionTitle: auction.title,
        csr2Mean: auction.csr2Mean,
        csr2Min: auction.csr2Min,
        csr2Max: auction.csr2Max
      });
      setShowForm(true);
    } finally {
      setIsPreparingAuctionValuation(false);
    }
  };

  // Handle valuation created
  const handleValuationCreated = (valuationId: number) => {
    setCurrentValuationId(valuationId);
    setShowForm(false);
    setShowPipeline(true);
    hasAutoOpenedReport.current = false; // Reset auto-open flag for new valuation
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
    hasAutoOpenedReport.current = false; // Reset auto-open flag
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
      }
    } catch (error) {
      console.error('Geocoding error:', error);
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
        
        const response = await fetch(`/api/auctions/count?${params}`);
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
        hiddenCount={hiddenCount}
        onManageHidden={() => setHiddenDialogOpen(true)}
        onUnhideAll={unhideAll}
        pinsByCategory={pinsByCategory}
        onFlyToPin={(lng, lat) => {
          if (mapRef) {
            mapRef.flyTo({ center: [lng, lat], zoom: 15, duration: 1500 });
          }
        }}
        onDeletePin={deletePin}
        drawModeEnabled={drawModeEnabled}
        onDrawModeChange={setDrawModeEnabled}
        portfolioAddMode={portfolioAddMode}
        onPortfolioAddModeChange={setPortfolioAddMode}
        selectedPinCategory={selectedPinCategory}
        onSelectedPinCategoryChange={setSelectedPinCategory}
        showOwnerLabels={showOwnerLabels}
        onShowOwnerLabelsChange={setShowOwnerLabels}
        onAggregatedZoom={() => {
          // Aggregated parcels only render past zoom ~10.
          if (mapRef && mapRef.getZoom() < 11) {
            mapRef.easeTo({ zoom: 11, duration: 500 });
          }
        }}
      />

      {/* Map Container */}
      <div className="relative w-full h-screen">
        <EnhancedMap
          drawModeEnabled={drawModeEnabled}
          onParcelClick={handleParcelClick}
          onAuctionClick={handleAuctionClick}
          onStartAuctionValuation={handleStartAuctionValuation}
          isPreparingAuctionValuation={isPreparingAuctionValuation}
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
          showTransmissionLines={mapOverlays.showTransmissionLines}
          transmissionLineStates={mapOverlays.transmissionLineStates}
          transmissionLineVoltages={mapOverlays.transmissionLineVoltages}
          showCityLabels={mapOverlays.showCityLabels}
          showHighways={mapOverlays.showHighways}
          showStreetLabels={mapOverlays.showStreetLabels}
          showPortfolioPins={mapOverlays.showPortfolioPins}
          pinsGeoJSON={pinsGeoJSON}
          pinDropMode={pinDropMode}
          selectedPinCategory={selectedPinCategory}
          onPinPlaced={(lng, lat) => addPin(lng, lat, selectedPinCategory)}
          onPinUpdate={updatePin}
          onPinDelete={deletePin}
          pins={pins}
          portfolioSelectMode={portfolioSelectMode}
          portfolioDrawMode={portfolioDrawMode}
          parcelDisplayMode={mapOverlays.parcelDisplayMode}
        />

        {/* Map Controls */}
        <MapControls 
          showLegend={mapInfo.showLegend}
        />

        {/* Mobile Toggle Buttons - ALWAYS SHOW for debugging */}
        <Button
          onClick={() => {
            console.log('Hamburger clicked!');
            setLeftSidebarOpen(true);
          }}
          onTouchEnd={(e) => {
            console.log('Hamburger touched!');
            e.preventDefault();
            e.stopPropagation();
            setLeftSidebarOpen(true);
          }}
          className="fixed top-4 left-4 z-50 bg-field hover:bg-field-spring text-wheat-cream shadow-terra-lg touch-target lg:hidden transition-colors duration-200"
          size="icon"
          style={{
            touchAction: 'manipulation',
            minWidth: '48px',
            minHeight: '48px',
            WebkitTapHighlightColor: 'rgba(212, 160, 60, 0.3)'
          }}
        >
          <Menu className="h-6 w-6" />
        </Button>

        {/* Zoom / Navigation Controls - Desktop Only */}
        {mapInfo.showScrapingModule && (
        <div className="hidden lg:block absolute top-4 left-4 z-50">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl" style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            {/* Zoom Controls */}
            <div className="flex flex-col gap-2 p-3">
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

      {/* Overlays: Valuation Form, Pipeline, Report (lazy loaded) */}
      <Suspense fallback={null}>
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
      </Suspense>

      <Suspense fallback={null}>
        {showPipeline && valuation && (
          <ValuationPipelineOverlay
            data={valuation}
            onClose={() => setShowPipeline(false)}
          />
        )}
      </Suspense>

      <Suspense fallback={null}>
        {showReport && valuation && (
          <ValuationReportOverlay
            data={valuation}
            onClose={() => setShowReport(false)}
          />
        )}
      </Suspense>

      <HiddenAuctionsDialog
        open={hiddenDialogOpen}
        onOpenChange={setHiddenDialogOpen}
        hiddenAuctions={hiddenAuctions}
        onUnhide={unhideAuction}
        onUnhideAll={() => {
          unhideAll();
          setHiddenDialogOpen(false);
        }}
      />
    </div>
    </>
  );
}
