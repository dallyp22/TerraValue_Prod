import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSoilData } from "@/hooks/use-soil-data";
import { Droplets, TrendingUp, Sprout, Mountain, AlertCircle, ChevronDown, Info, MapPin, User } from "lucide-react";
import { useState } from "react";

interface SoilDataPanelProps {
  mukey: string | null;
  parcelInfo?: {
    ownerName?: string;
    parcelNumber?: string;
    county?: string;
    acres?: number;
  };
}

export function SoilDataPanel({ mukey, parcelInfo }: SoilDataPanelProps) {
  const { data: response, isLoading, error } = useSoilData(mukey);
  const soilData = response?.data;
  const [surfaceHorizonExpanded, setSurfaceHorizonExpanded] = useState(false);

  if (!mukey) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sprout className="h-5 w-5" />
            Soil Analysis
          </CardTitle>
          <CardDescription>
            Click on a parcel to view soil properties
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sprout className="h-5 w-5" />
            Soil Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
    );
  }

  if (error || !soilData) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sprout className="h-5 w-5" />
            Soil Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Soil data not available for this location. This may be outside of Iowa or the database hasn't been configured.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Helper functions for UI
  const getSlopeClass = (slope: number | null) => {
    if (!slope) return "Unknown";
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

  const getSlopeBadgeColor = (slope: number | null) => {
    if (!slope) return "secondary";
    if (slope < 2) return "default";
    if (slope < 6) return "secondary";
    if (slope < 12) return "destructive";
    return "destructive";
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

  const getTextureClass = (sand: number | null, silt: number | null, clay: number | null) => {
    if (!sand || !silt || !clay) return "Unknown";
    
    if (clay >= 40) return "Clay";
    if (clay >= 27 && sand < 20) return "Silty clay";
    if (clay >= 27 && sand < 45) return "Clay loam";
    if (silt >= 50 && clay >= 12 && clay < 27) return "Silt loam";
    if (silt >= 80) return "Silt";
    if (clay >= 7 && clay < 20 && sand < 52) return "Loam";
    if (sand >= 70) return "Sand";
    if (sand >= 50) return "Sandy loam";
    return "Loam";
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

  const getComponentBarColor = (index: number) => {
    if (index === 0) return "bg-green-600";
    if (index === 1) return "bg-green-500";
    return "bg-green-400";
  };

  return (
    <TooltipProvider>
      <Card className="w-full shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl flex items-center gap-2">
            <Sprout className="h-6 w-6 text-green-600" />
            Soil Analysis
          </CardTitle>
          <CardDescription className="text-xs uppercase tracking-wide">
            USDA SSURGO Soil Data
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Section 1: Parcel Context */}
          {parcelInfo && (
            <>
              <div className="space-y-2 pb-4">
                {parcelInfo.parcelNumber && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-muted-foreground">
                      Parcel #{parcelInfo.parcelNumber}
                    </span>
                  </div>
                )}
                {parcelInfo.ownerName && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{parcelInfo.ownerName}</span>
                  </div>
                )}
                {parcelInfo.county && parcelInfo.acres && (
                  <div className="text-sm text-muted-foreground">
                    {parcelInfo.county} • {parcelInfo.acres.toFixed(2)} acres
                  </div>
                )}
              </div>
              <Separator />
            </>
          )}

          {/* Section 2: Soil Composition with Progress Bars */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Sprout className="h-4 w-4" />
              Soil Composition
            </h3>
            
            {soilData.components && soilData.components.length > 0 ? (
              <div className="space-y-4">
                {soilData.components.map((comp, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex justify-between items-baseline">
                      <span className="font-semibold text-base">{comp.soilSeries}</span>
                      <span className="text-sm font-medium text-muted-foreground">
                        {comp.percentage}%
                      </span>
                    </div>
                    
                    {/* Progress Bar */}
                    {comp.percentage && (
                      <Progress 
                        value={comp.percentage} 
                        className="h-2"
                        indicatorClassName={getComponentBarColor(idx)}
                      />
                    )}
                    
                    {/* Component Details */}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      {comp.drainage && (
                        <span className={getDrainageColor(comp.drainage)}>
                          {comp.drainage}
                        </span>
                      )}
                      {comp.slope !== null && (
                        <span className={getSlopeColor(comp.slope)}>
                          Slope {comp.slope}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No component data available</p>
            )}
          </div>

          <Separator />

          {/* Section 3: Physical Characteristics */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
              <Mountain className="h-4 w-4" />
              Physical Characteristics
            </h3>
            
            <div className="space-y-3">
              {/* Slope */}
              {soilData.slope !== null ? (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Slope</span>
                  <div className="flex items-center gap-2">
                    <Badge variant={getSlopeBadgeColor(soilData.slope)} className="font-mono">
                      {soilData.slope}%
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      ({getSlopeClass(soilData.slope)})
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Drainage */}
              {soilData.drainage && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Drainage</span>
                  <span className={`text-sm font-medium ${getDrainageColor(soilData.drainage)}`}>
                    {soilData.drainage}
                  </span>
                </div>
              )}

              {/* Hydrologic Group with Tooltip */}
              {soilData.hydrologicGroup && (
                <div className="flex justify-between items-center">
                  <Tooltip>
                    <TooltipTrigger className="flex items-center gap-1 text-sm text-muted-foreground cursor-help">
                      Hydrologic Group
                      <Info className="h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">Indicates runoff potential and drainage rate. Group A has lowest runoff, D has highest.</p>
                    </TooltipContent>
                  </Tooltip>
                  <span className="text-sm font-medium">{soilData.hydrologicGroup}</span>
                </div>
              )}

              {/* Farmland Classification */}
              {soilData.farmlandClass && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Farmland Class</span>
                  <Badge variant={soilData.farmlandClass.includes('Prime') ? 'default' : 'secondary'}>
                    {soilData.farmlandClass}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Section 4: Surface Horizon (Collapsible) */}
          {soilData.texture && (
            <>
              <Separator />
              <Collapsible
                open={surfaceHorizonExpanded}
                onOpenChange={setSurfaceHorizonExpanded}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 -mx-2 px-2 py-2 rounded transition-colors">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Surface Horizon (0-8")
                  </h3>
                  <ChevronDown className={`h-4 w-4 transition-transform ${surfaceHorizonExpanded ? 'rotate-180' : ''}`} />
                </CollapsibleTrigger>
                
                <CollapsibleContent className="pt-4 space-y-4">
                  {soilData.texture.sand !== null && soilData.texture.silt !== null && soilData.texture.clay !== null ? (
                    <>
                      <div>
                        <p className="text-sm font-semibold mb-3">
                          {getTextureClass(soilData.texture.sand, soilData.texture.silt, soilData.texture.clay)}
                        </p>
                        
                        {/* Texture Breakdown with Mini Bars */}
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Sand</span>
                              <span className="font-medium">{soilData.texture.sand.toFixed(1)}%</span>
                            </div>
                            <Progress value={soilData.texture.sand} className="h-1.5" />
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Silt</span>
                              <span className="font-medium">{soilData.texture.silt.toFixed(1)}%</span>
                            </div>
                            <Progress value={soilData.texture.silt} className="h-1.5" />
                          </div>
                          
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">Clay</span>
                              <span className="font-medium">{soilData.texture.clay.toFixed(1)}%</span>
                            </div>
                            <Progress value={soilData.texture.clay} className="h-1.5" />
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Texture data not available</p>
                  )}
                  
                  {/* pH with Tooltip */}
                  {soilData.texture.ph !== null && (
                    <div className="flex justify-between items-center pt-2">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 text-sm text-muted-foreground cursor-help">
                          pH Level
                          <Info className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">Soil acidity/alkalinity. Most crops prefer pH 6.0-7.5.</p>
                        </TooltipContent>
                      </Tooltip>
                      <div className="text-right">
                        <span className="text-sm font-medium">{soilData.texture.ph.toFixed(1)}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({getpHDescription(soilData.texture.ph)})
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Organic Matter with Quality Badge */}
                  {soilData.texture.organicMatter !== null && (
                    <div className="flex justify-between items-center">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 text-sm text-muted-foreground cursor-help">
                          Organic Matter
                          <Info className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">Indicates soil fertility and health. Higher is better for crop production.</p>
                        </TooltipContent>
                      </Tooltip>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{soilData.texture.organicMatter.toFixed(1)}%</span>
                        {getOMQuality(soilData.texture.organicMatter) && (
                          <Badge variant="outline" className="text-xs">
                            {getOMQuality(soilData.texture.organicMatter)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </>
          )}

          {/* Data Source Footer */}
          <div className="pt-4 border-t">
            <p className="text-xs text-center text-muted-foreground">
              USDA SSURGO Database
            </p>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

