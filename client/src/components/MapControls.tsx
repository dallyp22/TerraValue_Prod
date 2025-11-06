interface MapControlsProps {
  showLegend?: boolean;
}

export default function MapControls({ showLegend = true }: MapControlsProps) {

  return (
    <>
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
          <div className="legend-item flex items-center gap-2 text-xs text-slate-700 pt-2 border-t border-slate-200 mt-2">
            <span className="legend-marker w-4 h-0.5 bg-orange-500 flex-shrink-0"></span>
            <span>Power & Transmission Lines</span>
          </div>
          <div className="legend-item flex items-center gap-2 text-xs text-slate-500 ml-6">
            <span className="text-[10px]">Darker = Higher Voltage</span>
          </div>
        </div>
      </div>
      )}
    </>
  );
}

