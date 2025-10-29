import { X, Droplet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface LakeInfoPanelProps {
  lake: any; // GeoJSON properties
  onClose: () => void;
}

export function LakeInfoPanel({ lake, onClose }: LakeInfoPanelProps) {
  const getDisplayName = (properties: any) => {
    if (properties.name) return properties.name;
    if (properties['NHD:FTYPE']) return properties['NHD:FTYPE'];
    if (properties.water === 'reservoir') return 'Reservoir';
    if (properties.water === 'lake') return 'Lake';
    return 'Water Body';
  };

  const getWaterType = (properties: any) => {
    if (properties.water === 'reservoir') return 'Reservoir';
    if (properties.water === 'lake') return 'Lake';
    return 'Water Body';
  };

  const properties = lake;

  return (
    <Card className="absolute top-4 right-4 z-10 w-80 shadow-lg bg-white">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Droplet className="h-5 w-5 text-blue-500" />
          {getDisplayName(properties)}
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div>
          <span className="font-medium text-slate-700">Type:</span>{' '}
          <span className="text-slate-600 capitalize">{getWaterType(properties)}</span>
        </div>

        {properties['gnis:feature_id'] && (
          <div>
            <span className="font-medium text-slate-700">GNIS ID:</span>{' '}
            <span className="text-slate-600">{properties['gnis:feature_id']}</span>
          </div>
        )}

        {properties['NHD:ComID'] && (
          <div>
            <span className="font-medium text-slate-700">NHD ComID:</span>{' '}
            <span className="text-slate-600">{properties['NHD:ComID']}</span>
          </div>
        )}

        {properties['NHD:FTYPE'] && (
          <div>
            <span className="font-medium text-slate-700">Feature Type:</span>{' '}
            <span className="text-slate-600">{properties['NHD:FTYPE']}</span>
          </div>
        )}

        {properties['NHD:RESOLUTION'] && (
          <div>
            <span className="font-medium text-slate-700">Resolution:</span>{' '}
            <span className="text-slate-600">{properties['NHD:RESOLUTION']}</span>
          </div>
        )}

        {properties.natural && (
          <div>
            <span className="font-medium text-slate-700">Natural Feature:</span>{' '}
            <span className="text-slate-600 capitalize">{properties.natural}</span>
          </div>
        )}

        <div className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-200">
          Data from OpenStreetMap / National Hydrography Dataset
        </div>
      </CardContent>
    </Card>
  );
}

