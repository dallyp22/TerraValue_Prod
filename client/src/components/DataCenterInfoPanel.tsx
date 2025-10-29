import { X, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DataCenterInfoPanelProps {
  datacenter: any; // GeoJSON properties
  onClose: () => void;
}

export function DataCenterInfoPanel({ datacenter, onClose }: DataCenterInfoPanelProps) {
  const getDisplayName = (properties: any) => {
    if (properties.name) return properties.name;
    if (properties.operator) return `${properties.operator} Data Center`;
    if (properties.telecom === 'data_center') return 'Data Center';
    return 'Unnamed Data Center';
  };

  const getOperatorInfo = (properties: any) => {
    if (properties.operator && properties['operator:wikidata']) {
      return {
        name: properties.operator,
        wikidata: properties['operator:wikidata']
      };
    }
    return null;
  };

  const formatAddress = (properties: any) => {
    const parts = [];
    if (properties['addr:housenumber']) parts.push(properties['addr:housenumber']);
    if (properties['addr:street']) parts.push(properties['addr:street']);
    if (properties['addr:city']) parts.push(properties['addr:city']);
    if (properties['addr:state']) parts.push(properties['addr:state']);
    if (properties['addr:postcode']) parts.push(properties['addr:postcode']);

    return parts.length > 0 ? parts.join(', ') : null;
  };

  const properties = datacenter;

  return (
    <Card className="absolute top-4 right-4 z-10 w-80 shadow-lg bg-white">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          <Server className="h-5 w-5 text-blue-500" />
          {getDisplayName(properties)}
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {getOperatorInfo(properties) && (
          <div>
            <span className="font-medium text-slate-700">Operator:</span>{' '}
            <span className="text-slate-600">{getOperatorInfo(properties)?.name}</span>
          </div>
        )}

        {formatAddress(properties) && (
          <div>
            <span className="font-medium text-slate-700">Address:</span>{' '}
            <span className="text-slate-600">{formatAddress(properties)}</span>
          </div>
        )}

        {properties.website && (
          <div>
            <span className="font-medium text-slate-700">Website:</span>{' '}
            <a
              href={properties.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Visit Website
            </a>
          </div>
        )}

        {properties.ref && (
          <div>
            <span className="font-medium text-slate-700">Reference:</span>{' '}
            <span className="text-slate-600">{properties.ref}</span>
          </div>
        )}

        {properties.telecom && (
          <div>
            <span className="font-medium text-slate-700">Type:</span>{' '}
            <span className="text-slate-600 capitalize">
              {properties.telecom.replace('_', ' ')}
            </span>
          </div>
        )}

        {properties.building && properties.building !== 'yes' && (
          <div>
            <span className="font-medium text-slate-700">Building Type:</span>{' '}
            <span className="text-slate-600 capitalize">
              {properties.building.replace('_', ' ')}
            </span>
          </div>
        )}

        {properties.note && (
          <div>
            <span className="font-medium text-slate-700">Note:</span>{' '}
            <span className="text-slate-600">{properties.note}</span>
          </div>
        )}

        <div className="text-xs text-slate-500 mt-3 pt-2 border-t border-slate-200">
          Data from OpenStreetMap
        </div>
      </CardContent>
    </Card>
  );
}
