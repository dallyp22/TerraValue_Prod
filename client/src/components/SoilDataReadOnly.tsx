import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Sprout, Mountain, Droplets, TrendingUp } from "lucide-react";

interface SoilDataReadOnlyProps {
  ownerName?: string | null;
  parcelNumber?: string | null;
  mukey?: string | null;
  soilSeries?: string | null;
  soilSlope?: number | null;
  soilDrainage?: string | null;
  soilHydrologicGroup?: string | null;
  soilFarmlandClass?: string | null;
  soilTexture?: string | null;
  soilSandPct?: number | null;
  soilSiltPct?: number | null;
  soilClayPct?: number | null;
  soilPH?: number | null;
  soilOrganicMatter?: number | null;
  soilComponents?: any[] | null;
}

export function SoilDataReadOnly(props: SoilDataReadOnlyProps) {
  if (!props.soilSeries && !props.mukey) {
    return null; // No soil data available
  }

  const getSlopeClass = (slope: number | null) => {
    if (!slope) return "";
    if (slope < 2) return "Nearly level";
    if (slope < 6) return "Gently sloping";
    if (slope < 12) return "Strongly sloping";
    if (slope < 18) return "Moderately steep";
    return "Steep";
  };

  const getSlopeColor = (slope: number | null) => {
    if (!slope) return "text-gray-600";
    if (slope < 2) return "text-green-700";
    if (slope < 6) return "text-yellow-700";
    if (slope < 12) return "text-orange-700";
    return "text-red-700";
  };

  const getDrainageColor = (drainage: string | null) => {
    if (!drainage) return "text-gray-600";
    const d = drainage.toLowerCase();
    if (d.includes('well drained')) return "text-green-700";
    if (d.includes('moderately well')) return "text-lime-700";
    if (d.includes('somewhat poorly')) return "text-blue-600";
    if (d.includes('poorly drained')) return "text-blue-700";
    if (d.includes('very poorly')) return "text-blue-900";
    return "text-gray-700";
  };

  const getpHDescription = (ph: number | null) => {
    if (!ph) return "";
    if (ph < 6.0) return "Acidic";
    if (ph < 7.3) return "Slightly acidic to neutral";
    if (ph < 7.8) return "Slightly alkaline";
    return "Alkaline";
  };

  const getOMQuality = (om: number | null) => {
    if (!om) return "";
    if (om < 2) return "Low";
    if (om < 4) return "Moderate";
    if (om < 6) return "High";
    return "Very High";
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sprout className="h-5 w-5 text-green-600" />
          Soil Analysis
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Soil Composition */}
        {props.soilComponents && props.soilComponents.length > 0 ? (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Soil Composition
            </h4>
            {props.soilComponents.map((comp: any, idx: number) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <span className="font-semibold">{comp.soilSeries}</span>
                  <span className="text-sm text-muted-foreground">{comp.percentage}%</span>
                </div>
                {comp.percentage && (
                  <Progress 
                    value={comp.percentage} 
                    className="h-2"
                    indicatorClassName={idx === 0 ? "bg-green-600" : idx === 1 ? "bg-green-500" : "bg-green-400"}
                  />
                )}
                <div className="flex gap-4 text-xs text-muted-foreground">
                  {comp.drainage && (
                    <span className={getDrainageColor(comp.drainage)}>{comp.drainage}</span>
                  )}
                  {comp.slope !== null && (
                    <span className={getSlopeColor(comp.slope)}>Slope {comp.slope}%</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : props.soilSeries ? (
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Primary Soil
            </h4>
            <p className="font-semibold text-lg">{props.soilSeries}</p>
          </div>
        ) : null}

        {(props.soilSlope !== null || props.soilDrainage || props.soilHydrologicGroup || props.soilFarmlandClass) && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Mountain className="h-4 w-4" />
                Physical Characteristics
              </h4>
              
              {props.soilSlope !== null && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Slope</span>
                  <div className="flex items-center gap-2">
                    <span className={`font-medium ${getSlopeColor(props.soilSlope)}`}>
                      {props.soilSlope}%
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({getSlopeClass(props.soilSlope)})
                    </span>
                  </div>
                </div>
              )}

              {props.soilDrainage && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Drainage</span>
                  <span className={`text-sm font-medium ${getDrainageColor(props.soilDrainage)}`}>
                    {props.soilDrainage}
                  </span>
                </div>
              )}

              {props.soilHydrologicGroup && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Hydrologic Group</span>
                  <span className="text-sm font-medium">{props.soilHydrologicGroup}</span>
                </div>
              )}

              {props.soilFarmlandClass && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Farmland Class</span>
                  <Badge variant={props.soilFarmlandClass.includes('Prime') ? 'default' : 'secondary'}>
                    {props.soilFarmlandClass}
                  </Badge>
                </div>
              )}
            </div>
          </>
        )}

        {(props.soilSandPct !== null || props.soilPH !== null || props.soilOrganicMatter !== null) && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Surface Horizon
              </h4>

              {props.soilSandPct !== null && props.soilSiltPct !== null && props.soilClayPct !== null && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Sand</span>
                      <span className="font-medium">{props.soilSandPct.toFixed(1)}%</span>
                    </div>
                    <Progress value={props.soilSandPct} className="h-1.5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Silt</span>
                      <span className="font-medium">{props.soilSiltPct.toFixed(1)}%</span>
                    </div>
                    <Progress value={props.soilSiltPct} className="h-1.5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Clay</span>
                      <span className="font-medium">{props.soilClayPct.toFixed(1)}%</span>
                    </div>
                    <Progress value={props.soilClayPct} className="h-1.5" />
                  </div>
                </div>
              )}

              {props.soilPH !== null && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">pH Level</span>
                  <div className="text-right">
                    <span className="text-sm font-medium">{props.soilPH.toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      ({getpHDescription(props.soilPH)})
                    </span>
                  </div>
                </div>
              )}

              {props.soilOrganicMatter !== null && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Organic Matter</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{props.soilOrganicMatter.toFixed(1)}%</span>
                    {getOMQuality(props.soilOrganicMatter) && (
                      <Badge variant="outline" className="text-xs">
                        {getOMQuality(props.soilOrganicMatter)}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <div className="pt-2 border-t">
          <p className="text-xs text-center text-muted-foreground">
            USDA SSURGO Database
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

