import { Plus, Minus, Locate, Maximize2, Layers } from 'lucide-react';
import { Button } from './ui/button';
import { useState } from 'react';

interface MapControlsProps {
  mapRef: any;
  onLayerChange?: (layer: 'satellite' | 'street' | 'soil') => void;
  currentLayer?: 'satellite' | 'street' | 'soil';
  showLegend?: boolean;
  showLayerSwitcher?: boolean;
}

export default function MapControls({ mapRef, onLayerChange, currentLayer = 'satellite', showLegend = true, showLayerSwitcher = true }: MapControlsProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

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
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <>
      {/* Top Right Controls */}
      <div className="map-controls-top-right absolute top-20 right-4 flex flex-col gap-2 z-[1000]">
        <Button
          onClick={handleZoomIn}
          size="icon"
          variant="secondary"
          className="map-control-btn w-10 h-10 bg-white hover:bg-slate-50 shadow-lg border border-slate-200"
          title="Zoom In"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          onClick={handleZoomOut}
          size="icon"
          variant="secondary"
          className="map-control-btn w-10 h-10 bg-white hover:bg-slate-50 shadow-lg border border-slate-200"
          title="Zoom Out"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Button
          onClick={handleMyLocation}
          size="icon"
          variant="secondary"
          className="map-control-btn w-10 h-10 bg-white hover:bg-slate-50 shadow-lg border border-slate-200"
          title="My Location"
        >
          <Locate className="h-4 w-4" />
        </Button>
        <Button
          onClick={handleFullscreen}
          size="icon"
          variant="secondary"
          className="map-control-btn w-10 h-10 bg-white hover:bg-slate-50 shadow-lg border border-slate-200"
          title="Fullscreen"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Bottom Right - Layer Switcher */}
      {showLayerSwitcher && (
        <div className="map-controls-bottom-right absolute bottom-20 right-4 z-[1000]">
          <div className="layer-switcher flex gap-2 bg-white p-2 rounded-lg shadow-lg border border-slate-200">
          <button
            onClick={() => onLayerChange?.('satellite')}
            className={`layer-option w-20 h-20 rounded-md overflow-hidden border-2 transition-all ${
              currentLayer === 'satellite' ? 'border-blue-600 ring-2 ring-blue-200' : 'border-transparent hover:border-slate-300'
            }`}
            title="Satellite View"
          >
            <div className="w-full h-full bg-gradient-to-br from-blue-900 via-green-800 to-green-900 flex items-center justify-center">
              <Layers className="h-6 w-6 text-white/70" />
            </div>
            <div className="text-[10px] text-center py-0.5 bg-white/90 absolute bottom-0 left-0 right-0">Satellite</div>
          </button>
          <button
            onClick={() => onLayerChange?.('street')}
            className={`layer-option w-20 h-20 rounded-md overflow-hidden border-2 transition-all ${
              currentLayer === 'street' ? 'border-blue-600 ring-2 ring-blue-200' : 'border-transparent hover:border-slate-300'
            }`}
            title="Street View"
          >
            <div className="w-full h-full bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 flex items-center justify-center">
              <Layers className="h-6 w-6 text-slate-600/70" />
            </div>
            <div className="text-[10px] text-center py-0.5 bg-white/90 absolute bottom-0 left-0 right-0">Street</div>
          </button>
        </div>
      </div>
      )}

      {/* Bottom Left - Legend */}
      {showLegend && (
        <div className="map-legend absolute bottom-4 left-4 z-[1000] bg-white p-4 rounded-lg shadow-lg border border-slate-200 max-w-xs">
        <h4 className="text-xs font-semibold mb-3 text-slate-800">Legend</h4>
        <div className="space-y-2">
          <div className="legend-item flex items-center gap-2 text-xs text-slate-700">
            <span className="legend-marker w-3 h-3 rounded-full bg-red-500 flex-shrink-0"></span>
            <span>Auction Soon (7 days)</span>
          </div>
          <div className="legend-item flex items-center gap-2 text-xs text-slate-700">
            <span className="legend-marker w-3 h-3 rounded-full bg-orange-500 flex-shrink-0"></span>
            <span>Auction Upcoming (30 days)</span>
          </div>
          <div className="legend-item flex items-center gap-2 text-xs text-slate-700">
            <span className="legend-marker w-3 h-3 rounded-full bg-green-500 flex-shrink-0"></span>
            <span>Recently Listed</span>
          </div>
          <div className="legend-item flex items-center gap-2 text-xs text-slate-700">
            <span className="legend-marker w-3 h-3 rounded border-2 border-green-500 flex-shrink-0"></span>
            <span>Parcel Boundaries</span>
          </div>
        </div>
      </div>
      )}
    </>
  );
}

