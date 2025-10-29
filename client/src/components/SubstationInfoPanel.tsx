import { X, Zap, Building2, MapPin } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';

interface SubstationInfo {
  name?: string;
  operator?: string;
  voltage?: string;
  'addr:city'?: string;
  'addr:street'?: string;
  'addr:housenumber'?: string;
  'addr:postcode'?: string;
  'addr:state'?: string;
  substation?: string;
  [key: string]: any;
}

interface SubstationInfoPanelProps {
  substation: SubstationInfo | null;
  onClose: () => void;
}

export function SubstationInfoPanel({ substation, onClose }: SubstationInfoPanelProps) {
  if (!substation) return null;

  const formatVoltage = (voltage?: string) => {
    if (!voltage) return 'N/A';
    const voltages = voltage.split(';').map(v => {
      const kv = parseInt(v) / 1000;
      return `${kv} kV`;
    });
    return voltages.join(', ');
  };

  const getAddress = () => {
    const parts = [];
    if (substation['addr:housenumber']) parts.push(substation['addr:housenumber']);
    if (substation['addr:street']) parts.push(substation['addr:street']);
    if (substation['addr:city']) parts.push(substation['addr:city']);
    if (substation['addr:state']) parts.push(substation['addr:state']);
    if (substation['addr:postcode']) parts.push(substation['addr:postcode']);
    return parts.length > 0 ? parts.join(', ') : 'Address not available';
  };

  return (
    <Card className="absolute top-4 right-4 w-96 bg-white shadow-xl z-50 max-h-[80vh] overflow-y-auto">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Zap className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-lg text-slate-800">
                {substation.name || 'Power Substation'}
              </h3>
              <p className="text-xs text-slate-500">
                {substation.substation ? substation.substation.charAt(0).toUpperCase() + substation.substation.slice(1) : 'Substation'}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Details */}
        <div className="space-y-4">
          {/* Operator */}
          {substation.operator && (
            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 text-slate-400 mt-1" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Operator</p>
                <p className="text-sm font-medium text-slate-700">{substation.operator}</p>
              </div>
            </div>
          )}

          {/* Voltage */}
          {substation.voltage && (
            <div className="flex items-start gap-3">
              <Zap className="h-4 w-4 text-slate-400 mt-1" />
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wide">Voltage</p>
                <p className="text-sm font-medium text-slate-700">{formatVoltage(substation.voltage)}</p>
              </div>
            </div>
          )}

          {/* Address */}
          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-slate-400 mt-1" />
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Location</p>
              <p className="text-sm font-medium text-slate-700">{getAddress()}</p>
            </div>
          </div>

          {/* Additional Properties */}
          {substation.barrier && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Additional Info</p>
              <div className="flex gap-2 flex-wrap">
                <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">
                  {substation.barrier}
                </span>
                {substation.type && (
                  <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded">
                    {substation.type}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

