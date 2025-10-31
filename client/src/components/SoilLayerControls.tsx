import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Mountain, Droplets, Sprout, Home } from "lucide-react";

export type SoilLayerType = 'slope' | 'drainage' | 'farmland' | 'soilSeries' | 'hydrologicGroup';

interface SoilLayerControlsProps {
  activeLayers: Set<SoilLayerType>;
  onToggleLayer: (layer: SoilLayerType) => void;
  opacity: number;
  onOpacityChange: (opacity: number) => void;
}

export function SoilLayerControls({
  activeLayers,
  onToggleLayer,
  opacity,
  onOpacityChange
}: SoilLayerControlsProps) {
  
  const layers: Array<{
    id: SoilLayerType;
    label: string;
    icon: React.ReactNode;
    description: string;
  }> = [
    {
      id: 'slope',
      label: 'Slope Gradient',
      icon: <Mountain className="h-4 w-4" />,
      description: 'Color-coded by slope percentage'
    },
    {
      id: 'drainage',
      label: 'Drainage Class',
      icon: <Droplets className="h-4 w-4" />,
      description: 'Well drained to poorly drained'
    },
    {
      id: 'farmland',
      label: 'Farmland Classification',
      icon: <Home className="h-4 w-4" />,
      description: 'Prime farmland highlighting'
    },
    {
      id: 'soilSeries',
      label: 'Soil Series',
      icon: <Sprout className="h-4 w-4" />,
      description: 'Soil type boundaries'
    },
  ];

  const hasActiveLayers = activeLayers.size > 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base">Soil Data Layers</CardTitle>
        <CardDescription className="text-xs">
          Toggle soil property overlays
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Layer Toggles */}
        <div className="space-y-3">
          {layers.map((layer) => (
            <div key={layer.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1">
                <div className="text-muted-foreground">{layer.icon}</div>
                <div className="flex-1">
                  <Label htmlFor={layer.id} className="text-sm cursor-pointer">
                    {layer.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {layer.description}
                  </p>
                </div>
              </div>
              <Switch
                id={layer.id}
                checked={activeLayers.has(layer.id)}
                onCheckedChange={() => onToggleLayer(layer.id)}
              />
            </div>
          ))}
        </div>

        {/* Opacity Control */}
        {hasActiveLayers && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="opacity" className="text-sm">
                  Layer Opacity
                </Label>
                <span className="text-xs text-muted-foreground">
                  {Math.round(opacity * 100)}%
                </span>
              </div>
              <Slider
                id="opacity"
                min={0}
                max={100}
                step={5}
                value={[opacity * 100]}
                onValueChange={([value]) => onOpacityChange(value / 100)}
                className="w-full"
              />
            </div>
          </>
        )}

        {/* Color Legends */}
        {activeLayers.has('slope') && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Slope Legend</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-500"></div>
                  <span>0-2% (Level)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-yellow-500"></div>
                  <span>2-6% (Gentle)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-orange-500"></div>
                  <span>6-12% (Moderate)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-red-500"></div>
                  <span>12%+ (Steep)</span>
                </div>
              </div>
            </div>
          </>
        )}

        {activeLayers.has('drainage') && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Drainage Legend</p>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-500"></div>
                  <span>Well drained</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-lime-500"></div>
                  <span>Moderately well drained</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-400"></div>
                  <span>Somewhat poorly drained</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-600"></div>
                  <span>Poorly drained</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-blue-900"></div>
                  <span>Very poorly drained</span>
                </div>
              </div>
            </div>
          </>
        )}

        {activeLayers.has('farmland') && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Farmland Legend</p>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-600"></div>
                  <span>Prime farmland</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-yellow-500"></div>
                  <span>Statewide importance</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-gray-400"></div>
                  <span>Other</span>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

