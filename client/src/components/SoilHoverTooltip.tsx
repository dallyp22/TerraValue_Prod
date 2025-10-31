import { Card } from "@/components/ui/card";
import { Sprout, Mountain, Droplets } from "lucide-react";

interface SoilHoverTooltipProps {
  soilSeries?: string;
  slope?: number | null;
  drainage?: string | null;
  farmlandClass?: string | null;
}

export function SoilHoverTooltip({
  soilSeries,
  slope,
  drainage,
  farmlandClass
}: SoilHoverTooltipProps) {
  if (!soilSeries) {
    return null;
  }

  return (
    <Card className="p-3 shadow-lg max-w-xs">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sprout className="h-4 w-4 text-green-600" />
          <span className="font-semibold text-sm">{soilSeries}</span>
        </div>
        
        {slope !== null && slope !== undefined && (
          <div className="flex items-center gap-2 text-xs">
            <Mountain className="h-3 w-3 text-gray-600" />
            <span>Slope: {slope}%</span>
          </div>
        )}
        
        {drainage && (
          <div className="flex items-center gap-2 text-xs">
            <Droplets className="h-3 w-3 text-blue-600" />
            <span>{drainage}</span>
          </div>
        )}
        
        {farmlandClass && (
          <div className="text-xs text-muted-foreground">
            {farmlandClass}
          </div>
        )}
        
        <div className="text-xs text-muted-foreground pt-1 border-t">
          Click for detailed soil analysis
        </div>
      </div>
    </Card>
  );
}

