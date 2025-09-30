import { X, MapPin, Home, Trees } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import * as turf from '@turf/turf';

interface OwnerInfoSidebarProps {
  parcel: any;
  onClose: () => void;
  onStartValuation: (parcel: any) => void;
}

// Use the actual polygon acres calculated from real geometry in EnhancedMap
const getParcelAcres = (parcel: any): number => {
  // The parcel.acres already contains the correct value calculated from real polygon geometry
  // in EnhancedMap.tsx handleParcelClick function using turf.area()
  return parcel?.acres || 0;
};

export default function OwnerInfoSidebar({ parcel, onClose, onStartValuation }: OwnerInfoSidebarProps) {
  const actualAcres = getParcelAcres(parcel);
  return (
    <div className="fixed inset-y-0 right-0 z-50 w-[85vw] sm:w-80 bg-white shadow-2xl transition-all duration-300 animate-slide-in-right">
      <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-200">
        <h2 className="text-base sm:text-lg font-semibold text-slate-800">Parcel Information</h2>
        <Button 
          onClick={onClose} 
          variant="ghost" 
          size="icon"
          className="rounded-full hover:bg-slate-100 touch-target"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      
      <div className="p-4 sm:p-6 space-y-4 overflow-y-auto h-[calc(100%-5rem)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Home className="h-4 w-4 text-emerald-600" />
              Owner Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm text-slate-500">Name</p>
              <p className="font-medium">{parcel?.owner_name || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Parcel Number</p>
              <p className="font-medium">{parcel?.parcel_number || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Parcel Class</p>
              <p className="font-medium">{parcel?.parcel_class || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">County</p>
              <p className="font-medium">{parcel?.county || 'N/A'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Trees className="h-4 w-4 text-emerald-600" />
              Land Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-sm text-slate-500">Acres</p>
              <p className="font-medium">{actualAcres.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Coordinates</p>
              <p className="font-medium text-xs">
                {parcel?.coordinates ? 
                  `${parcel.coordinates[1].toFixed(6)}, ${parcel.coordinates[0].toFixed(6)}` : 
                  'N/A'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <Button 
              variant="outline" 
              className="w-full h-11 text-sm font-medium"
              onClick={() => {
                // Optionally implement zoom to parcel functionality
                console.log('Zoom to parcel:', parcel);
              }}
            >
              Zoom to Parcel
            </Button>
            <Button 
              className="w-full h-11 text-sm font-medium bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white"
              onClick={() => onStartValuation(parcel)}
            >
              Start Valuation
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}