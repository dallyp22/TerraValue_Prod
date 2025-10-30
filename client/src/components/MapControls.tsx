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
      {/* Top Left Controls - Next to Scraping Module */}
      <div className="map-controls-top-left absolute top-4 left-[250px] flex flex-col gap-2 z-[1000]">
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

