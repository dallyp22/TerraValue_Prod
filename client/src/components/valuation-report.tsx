/**
 * @deprecated This component is maintained for backward compatibility.
 * Prefer using ValuationReportTerra from './ValuationReportTerra' which has:
 * - Enhanced PDF export with multi-page support
 * - Professional header/footer design
 * - Consistent FarmScope AI branding
 * - Better aesthetics and TerraValue design system
 */
import { useState, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Database, Brain, TrendingUp, Activity, DollarSign, Check, MapPin, User, Sprout } from "lucide-react";
import { motion } from "framer-motion";
import type { Valuation, ValuationBreakdown } from "@shared/schema";
import { generatePDF } from '@/lib/pdf-export';
import { SoilDataReadOnly } from "./SoilDataReadOnly";

interface ValuationReportProps {
  valuation?: Valuation;
}

export function ValuationReport({ valuation }: ValuationReportProps) {
  const isCompleted = valuation?.status === "completed";
  const breakdown = valuation?.breakdown as ValuationBreakdown | null;
  const reportRef = useRef<HTMLDivElement>(null);
  
  // Debug: Log valuation data to see what's available
  console.log('📊 Valuation Report - Full valuation data:', valuation);
  console.log('📊 Owner Name:', valuation?.ownerName);
  console.log('📊 Parcel Number:', valuation?.parcelNumber);
  console.log('📊 Soil Series:', valuation?.soilSeries);
  
  // State for selected valuation method
  const [selectedMethod, setSelectedMethod] = useState<"csr2" | "income" | "ai_market">("csr2");
  const [isExporting, setIsExporting] = useState(false);
  
  // Calculate values for each method
  const valuationMethods = useMemo(() => {
    if (!breakdown || !valuation) return null;
    
    return {
      csr2: {
        perAcre: breakdown.csr2Value || 0,
        total: (breakdown.csr2Value || 0) * valuation.acreage,
        label: "CSR2 Quantitative",
        icon: Activity,
        color: "green" as const,
        description: "Based on soil productivity",
        source: (valuation as any).csr2Source // Track if from listing or database
      },
      income: {
        perAcre: breakdown.incomeCapValue || 0,
        total: (breakdown.incomeCapValue || 0) * valuation.acreage,
        label: "Income Approach", 
        icon: DollarSign,
        color: "blue" as const,
        description: "Based on cash rent analysis"
      },
      ai_market: {
        perAcre: breakdown.aiAdjustedValue || breakdown.baseValue || 0,
        total: (breakdown.aiAdjustedValue || breakdown.baseValue || 0) * valuation.acreage,
        label: "AI Market-Adjusted",
        icon: Brain,
        color: "purple" as const, 
        description: "AI Adjusted with Comp. Set"
      }
    };
  }, [breakdown, valuation]);
  
  // Get the selected method's per-acre value for calculations with precision handling
  const rawPerAcreValue = valuationMethods?.[selectedMethod]?.perAcre || 0;
  
  // Calculate precise acre values first
  const tillableAcres = breakdown?.tillableAcres || ((valuation?.acreage || 0) * 0.9);
  const nonTillableAcres = (valuation?.acreage || 0) - tillableAcres;
  const improvements = breakdown?.improvements || 0;
  
  // Calculate per-acre values based on selected method
  let tillablePerAcreDollar, nonTillablePerAcreDollar, blendedPerAcreDollar;
  
  // Get non-tillable multiplier based on land type
  const getNonTillableMultiplier = (landType?: "CRP" | "Timber" | "Other"): number => {
    switch (landType) {
      case "CRP":
        return 0.65; // 65% of base value
      case "Timber":
        return 0.55; // 55% of base value
      case "Other":
        return 0.20; // 20% of base value
      default:
        return 0.50; // Default to 50% of tillable value if no type specified
    }
  };
  
  if (selectedMethod === "csr2") {
    // CSR2 method: Use tillable/non-tillable breakdown from backend
    tillablePerAcreDollar = Math.round(breakdown?.tillableValuePerAcre || rawPerAcreValue);
    // Use multiplier based on non-tillable type (defaults to 50%)
    const nonTillableMultiplier = getNonTillableMultiplier(breakdown?.nonTillableType);
    nonTillablePerAcreDollar = Math.round((breakdown?.tillableValuePerAcre || rawPerAcreValue) * nonTillableMultiplier);
    blendedPerAcreDollar = Math.round(breakdown?.blendedValuePerAcre || rawPerAcreValue);
  } else {
    // Income or AI Market methods: Apply non-tillable discount
    tillablePerAcreDollar = Math.round(rawPerAcreValue);
    // Use multiplier based on non-tillable type (defaults to 50%)
    const nonTillableMultiplier = getNonTillableMultiplier(breakdown?.nonTillableType);
    nonTillablePerAcreDollar = Math.round(rawPerAcreValue * nonTillableMultiplier);
    
    // Calculate blended value
    const tillableValue = tillablePerAcreDollar * tillableAcres;
    const nonTillableValue = nonTillablePerAcreDollar * nonTillableAcres;
    const totalLandValue = tillableValue + nonTillableValue;
    blendedPerAcreDollar = Math.round(totalLandValue / (valuation?.acreage || 1));
  }
  
  // Precise calculations: rounded $/acre × acres, then round final values to nearest dollar
  const tillableLandValue = Math.round(tillablePerAcreDollar * tillableAcres);
  const nonTillableLandValue = Math.round(nonTillablePerAcreDollar * nonTillableAcres);
  const totalPropertyValue = Math.round(tillableLandValue + nonTillableLandValue + improvements);
  
  // PDF Export Function - Programmatic layout for crisp output
  const exportToPDF = async () => {
    if (!valuation || !breakdown || !valuationMethods || isExporting) return;

    setIsExporting(true);

    try {
      await generatePDF({
        valuation,
        breakdown,
        selectedMethod,
        totalValue: totalPropertyValue,
        tillableAcres,
        nonTillableAcres,
        tillablePerAcre: tillablePerAcreDollar,
        nonTillablePerAcre: nonTillablePerAcreDollar,
        tillableValue: tillableLandValue,
        nonTillableValue: nonTillableLandValue,
        improvements,
        valuationMethods: {
          csr2: { perAcre: valuationMethods.csr2.perAcre, confidence: 0.85 },
          income: { perAcre: valuationMethods.income.perAcre, confidence: breakdown.cashRentPerAcre ? 0.9 : 0.6 },
          ai_market: { perAcre: valuationMethods.ai_market.perAcre, confidence: 0.75 },
        },
      });
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('There was an error generating the PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };


  if (!isCompleted || !valuation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center">
                <FileText className="text-gray-400 h-4 w-4" />
              </div>
              <span>Valuation Report</span>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Report Pending</h3>
            <p className="text-gray-600">
              Your comprehensive valuation report will be available once the AI analysis is complete.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-slate-200 bg-white shadow-sm print:shadow-none print:border-0" ref={reportRef}>
      <CardHeader className="pb-6 print:pb-4">
        <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center print:bg-slate-700">
              <FileText className="text-white h-5 w-5" />
            </div>
            <span className="text-xl font-light text-slate-900 print:text-lg print:font-medium">Valuation Report</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-slate-600 border-slate-300 hover:bg-slate-50 print:hidden"
            onClick={exportToPDF}
            disabled={isExporting}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Generating PDF...' : 'Export PDF'}
          </Button>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6 print:space-y-4">
        {/* Three Valuation Approaches Comparison */}
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-slate-600" />
              Valuation Approaches Comparison
            </h3>
            <div className="h-px bg-slate-200"></div>
          </div>
          
          {valuationMethods && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
              {(Object.entries(valuationMethods) as Array<[keyof typeof valuationMethods, typeof valuationMethods[keyof typeof valuationMethods]]>).map(([method, data], index) => {
                const isSelected = selectedMethod === method;
                const IconComponent = data.icon;
                const colorClasses = {
                  green: {
                    bg: "bg-green-100",
                    text: "text-green-600", 
                    border: "border-green-300",
                    selectedBg: "bg-green-50",
                    selectedBorder: "border-green-400"
                  },
                  blue: {
                    bg: "bg-blue-100", 
                    text: "text-blue-600",
                    border: "border-blue-300",
                    selectedBg: "bg-blue-50",
                    selectedBorder: "border-blue-400"
                  },
                  purple: {
                    bg: "bg-purple-100",
                    text: "text-purple-600",
                    border: "border-purple-300", 
                    selectedBg: "bg-purple-50",
                    selectedBorder: "border-purple-400"
                  }
                }[data.color];

                return (
                  <motion.div
                    key={method}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: index * 0.1 }}
                    className={`relative bg-white rounded-2xl p-4 sm:p-6 ring-1 ring-border/15 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer print:cursor-default print:shadow-none print:hover:shadow-none print:hover:translate-y-0 ${
                      isSelected ? `${colorClasses.selectedBg} ring-2 ${colorClasses.selectedBorder}` : 'hover:ring-2 hover:ring-slate-300 print:hover:ring-1'
                    }`}
                    onClick={() => setSelectedMethod(method)}
                  >
                    {isSelected && (
                      <div className="absolute top-3 right-3">
                        <div className={`w-6 h-6 rounded-full ${colorClasses.bg} flex items-center justify-center`}>
                          <Check className={`w-3 h-3 ${colorClasses.text}`} />
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-9 h-9 rounded-full ${colorClasses.bg} flex items-center justify-center`}>
                        <IconComponent className={`w-5 h-5 ${colorClasses.text}`} />
                      </div>
                      <h4 className="text-base font-medium text-slate-900">{data.label}</h4>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="text-center">
                        <div className="text-xl sm:text-2xl font-bold text-slate-900 print:text-lg">
                          ${Math.round(data.perAcre).toLocaleString()}
                          <span className="text-xs sm:text-sm font-medium text-muted-foreground ml-2 print:ml-1 print:text-xs">/acre</span>
                        </div>
                        <div className="text-xs sm:text-sm text-muted-foreground flex items-center justify-center gap-2">
                          <span>{data.description}</span>
                          {method === 'csr2' && data.source === 'listing' && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium">
                              From Listing
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
          
          {/* Show selected method without confidence score */}
          {valuationMethods && (
            <div className="mt-6 p-4 bg-white rounded-xl border border-slate-200">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-slate-700">Selected Method</div>
                <div className="text-sm text-slate-600 print:text-xs">
                  {valuationMethods?.[selectedMethod]?.label}: ${tillablePerAcreDollar.toLocaleString()}<span className="ml-1">/acre</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Parcel Information */}
        {(valuation.ownerName || valuation.parcelNumber) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
            className="bg-slate-50 rounded-2xl p-6 border border-slate-200 print:break-inside-avoid"
          >
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center">
                <MapPin className="h-5 w-5 mr-2 text-slate-600" />
                Parcel Information
              </h3>
              <div className="h-px bg-slate-200"></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {valuation.ownerName && (
                <div className="flex items-start gap-3">
                  <User className="h-4 w-4 text-slate-500 mt-1" />
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Owner</div>
                    <div className="text-sm font-medium text-slate-900">{valuation.ownerName}</div>
                  </div>
                </div>
              )}
              {valuation.parcelNumber && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-slate-500 mt-1" />
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wide">Parcel Number</div>
                    <div className="text-sm font-medium font-mono text-slate-900">{valuation.parcelNumber}</div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Soil Analysis from Local Database */}
        {valuation.soilSeries && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.17 }}
            className="print:break-inside-avoid"
          >
            <SoilDataReadOnly
              ownerName={valuation.ownerName}
              parcelNumber={valuation.parcelNumber}
              mukey={valuation.mukey}
              soilSeries={valuation.soilSeries}
              soilSlope={valuation.soilSlope}
              soilDrainage={valuation.soilDrainage}
              soilHydrologicGroup={valuation.soilHydrologicGroup}
              soilFarmlandClass={valuation.soilFarmlandClass}
              soilTexture={valuation.soilTexture}
              soilSandPct={valuation.soilSandPct}
              soilSiltPct={valuation.soilSiltPct}
              soilClayPct={valuation.soilClayPct}
              soilPH={valuation.soilPH}
              soilOrganicMatter={valuation.soilOrganicMatter}
              soilComponents={valuation.soilComponents as any}
            />
          </motion.div>
        )}

        {/* CSR2 Soil Productivity Analysis */}
        {breakdown?.csr2Mean && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.2 }}
            className="bg-green-50 rounded-2xl p-6 border border-green-200 print:break-inside-avoid"
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center">
                <Database className="h-5 w-5 mr-2 text-green-600" />
                CSR2 Soil Productivity Rating
              </h3>
              <div className="h-px bg-green-200"></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white rounded-xl p-4 text-center ring-1 ring-green-200/50">
                <div className="text-2xl font-bold text-green-900">{breakdown.csr2Mean.toFixed(1)}</div>
                <div className="text-sm font-medium text-green-700">CSR2 RATING</div>
              </div>
              <div className="bg-white rounded-xl p-4 text-center ring-1 ring-green-200/50">
                <div className="text-lg font-semibold text-green-900">Good</div>
                <div className="text-sm font-medium text-green-700">SOIL QUALITY</div>
              </div>
              <div className="bg-white rounded-xl p-4 text-center ring-1 ring-green-200/50">
                <div className="text-lg font-semibold text-green-900">{breakdown.csr2Min} - {breakdown.csr2Max}</div>
                <div className="text-sm font-medium text-green-700">CSR2 RANGE</div>
              </div>
              <div className="bg-white rounded-xl p-4 text-center ring-1 ring-green-200/50">
                <div className="text-lg font-semibold text-green-900">{breakdown.csr2Count}</div>
                <div className="text-sm font-medium text-green-700"># OF COORDINATES</div>
              </div>
            </div>
            
            {/* County-Specific CSR2 Rate */}
            {breakdown?.csr2DollarPerPoint && (
              <div className="mt-4 bg-white rounded-xl p-4 ring-1 ring-green-200/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-slate-700">County Rate ({valuation.county})</span>
                  </div>
                  <div className="text-lg font-bold text-green-900">
                    ${breakdown.csr2DollarPerPoint}<span className="text-sm font-medium text-green-700">/CSR2 point</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  This is the market rate per CSR2 point for {valuation.county}, based on recent land sales in this region.
                </div>
              </div>
            )}
            <div className="mt-4 p-4 bg-white rounded-xl ring-1 ring-green-200/50">
              <p className="text-sm text-slate-600">
                <strong>CSR2 (Corn Suitability Rating 2)</strong> is Iowa State University's standardized index that assigns every mapped 
                soil unit a score from 5 (least productive) to 100 (most productive).
              </p>
              <p className="text-sm text-slate-600 mt-2">
                This rating represents the average of {breakdown.csr2Count} CSR2 samples within the parcel or polygon, 
                taking into account the different soil units present and their productive capabilities for most 
                common Iowa agricultural practices.
              </p>
            </div>
          </motion.div>
        )}

        {/* Tillable vs Non-Tillable Land Analysis - Updated with selected method */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.3 }}
          className="bg-blue-50 rounded-2xl p-6 border border-blue-200 print:break-inside-avoid"
        >
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-blue-600" />
              Tillable vs Non-Tillable Land Analysis
            </h3>
            <div className="h-px bg-blue-200"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-xl p-4 ring-1 ring-blue-200/50">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Land Distribution</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Total Acres</span>
                  <span className="font-medium">{valuation.acreage.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Tillable Acres</span>
                  <span className="font-medium">{tillableAcres.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Non-Tillable Acres</span>
                  <span className="font-medium">{nonTillableAcres.toFixed(2)}</span>
                </div>
                {breakdown?.nonTillableType && (
                  <div className="flex justify-between pt-2 border-t border-slate-200">
                    <span className="text-sm text-slate-600">Non-Tillable Type</span>
                    <span className="font-medium">{breakdown.nonTillableType} ({breakdown.nonTillableMultiplier && Math.round(breakdown.nonTillableMultiplier * 100)}%)</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl p-4 ring-1 ring-blue-200/50">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Valuation per Acre</h4>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Selected Method</span>
                  <span className="font-medium">{valuationMethods?.[selectedMethod]?.label}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Tillable Value</span>
                  <span className="font-medium print:text-sm">${tillablePerAcreDollar.toLocaleString()}<span className="ml-1">/acre</span></span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Non-Tillable Value</span>
                  <span className="font-medium print:text-sm">
                    ${nonTillablePerAcreDollar.toLocaleString()}<span className="ml-1">/acre</span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Blended Average</span>
                  <span className="font-medium print:text-sm">
                    ${blendedPerAcreDollar.toLocaleString()}<span className="ml-1">/acre</span>
                  </span>
                </div>
                {breakdown?.dollarPerCsrTaxAcre && breakdown?.csr2Mean && breakdown.csr2Mean > 0 && (
                  <div className="flex justify-between pt-2 border-t border-blue-100">
                    <span className="text-sm text-slate-600">$ per CSR Tax Acre</span>
                    <span className="font-medium print:text-sm text-blue-700">
                      ${breakdown.dollarPerCsrTaxAcre.toLocaleString()}<span className="ml-1">/CSR point</span>
                    </span>
                  </div>
                )}
              </div>
              {breakdown?.dollarPerCsrTaxAcre && breakdown?.csr2Mean && breakdown.csr2Mean > 0 && (
                <div className="mt-3 pt-3 border-t border-blue-100">
                  <p className="text-xs text-slate-500">
                    <strong>$ per CSR Tax Acre</strong> normalizes price by soil productivity. Calculated as Blended Average (${blendedPerAcreDollar.toLocaleString()}/acre) ÷ CSR2 ({breakdown.csr2Mean.toFixed(1)}) = ${breakdown.dollarPerCsrTaxAcre.toLocaleString()}/CSR point. This metric helps compare land values across properties with different soil quality.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 ring-1 ring-blue-200/50">
            <h4 className="text-sm font-medium text-slate-700 mb-3">Tillable Percentage</h4>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(tillableAcres / (valuation?.acreage || 1)) * 100}%` }}
                    transition={{ duration: 0.8, delay: 0.4 }}
                    className="h-full bg-blue-500 rounded-full"
                  />
                </div>
              </div>
              <span className="text-sm font-medium text-blue-700">
                {((tillableAcres / (valuation?.acreage || 1)) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </motion.div>

        {/* Total Property Value Calculation - Updated with selected method */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.4 }}
          className="bg-slate-50 rounded-2xl p-6 border border-slate-200 print:break-inside-avoid"
        >
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-slate-600" />
              Total Property Value Calculation
            </h3>
            <div className="h-px bg-slate-200"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 text-center ring-1 ring-slate-200/50">
              <div className="text-2xl font-bold text-slate-900">${tillableLandValue.toLocaleString()}</div>
              <div className="text-sm font-medium text-slate-600">Tillable Land Value</div>
            </div>
            <div className="bg-white rounded-xl p-4 text-center ring-1 ring-slate-200/50">
              <div className="text-2xl font-bold text-slate-900">${nonTillableLandValue.toLocaleString()}</div>
              <div className="text-sm font-medium text-slate-600">Non-Tillable Land Value</div>
            </div>
            <div className="bg-white rounded-xl p-4 text-center ring-1 ring-slate-200/50">
              <div className="text-2xl font-bold text-slate-900">${improvements.toLocaleString()}</div>
              <div className="text-sm font-medium text-slate-600">Property Improvements</div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 text-center ring-1 ring-slate-200/50">
            <div className="text-3xl font-bold text-slate-900 mb-2">
              ${totalPropertyValue.toLocaleString()}
            </div>
            <div className="text-slate-600 font-medium">Total Estimated Property Value</div>
            <div className="text-xs text-slate-500 mt-2">
              Based on {valuationMethods?.[selectedMethod]?.label} methodology
            </div>
          </div>
        </motion.div>

        {/* Iowa Market Analysis & Sales Comps */}
        {breakdown?.iowaMarketComps && breakdown.iowaMarketComps.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.5 }}
            className="bg-slate-50 rounded-2xl p-6 border border-slate-200 print:break-inside-avoid"
          >
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-2 flex items-center">
                <Database className="h-5 w-5 mr-2 text-slate-600" />
                Iowa Market Analysis & Sales Comps
              </h3>
              <div className="h-px bg-slate-200"></div>
            </div>

            {/* Market Summary */}
            {breakdown.iowaMarketSummary && (
              <div className="bg-white rounded-xl p-4 mb-4 ring-1 ring-slate-200/50">
                <h4 className="text-sm font-medium text-slate-700 mb-2">Market Summary</h4>
                <p className="text-sm text-slate-600">{breakdown.iowaMarketSummary}</p>
              </div>
            )}

            {/* Sales Comparables */}
            <div className="bg-white rounded-xl p-4 mb-4 ring-1 ring-slate-200/50">
              <h4 className="text-sm font-medium text-slate-700 mb-3">Recent Sales Comparables</h4>
              
              
              {/* Show comparables if available */}
              {breakdown.iowaMarketComps && breakdown.iowaMarketComps.length > 0 && (
                <div className="space-y-3">
                {breakdown.iowaMarketComps.slice(0, 5).map((comp: any, index: number) => (
                  <div key={index} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-b-0">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-900 print:text-xs">
                        ${comp.price_per_acre.toLocaleString()}<span className="ml-1">/acre</span>
                      </div>
                      <div className="text-xs text-slate-500">{comp.date}</div>
                    </div>
                    <div className="flex-2 mx-4">
                      <div className="text-sm text-slate-600">{comp.details}</div>
                      {comp.acres && (
                        <div className="text-xs text-slate-500">{comp.acres} acres</div>
                      )}
                    </div>
                    <div className="flex-1 text-right">
                      <div className="text-xs text-slate-500">{comp.land_type || valuation.landType}</div>
                      {comp.county && (
                        <div className="text-xs text-slate-400">{comp.county} County</div>
                      )}
                    </div>
                  </div>
                ))}
                </div>
              )}
              
              {/* Average Comp Price - Use pre-filtered average if available */}
              {breakdown.iowaMarketComps && breakdown.iowaMarketComps.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-700">
                      Average Comp Price
                    </span>
                    <span className="text-sm font-bold text-slate-900 print:text-xs" data-testid="text-average-comp-price">
                      ${(breakdown.marketCompsAverage || Math.round(breakdown.iowaMarketComps.reduce((sum: number, comp: any) => sum + comp.price_per_acre, 0) / breakdown.iowaMarketComps.length)).toLocaleString()}<span className="ml-1">/acre</span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Market Trends */}
            {breakdown.iowaMarketTrends && breakdown.iowaMarketTrends.factors && breakdown.iowaMarketTrends.factors.length > 0 && (
              <div className="bg-white rounded-xl p-4 ring-1 ring-slate-200/50">
                <h4 className="text-sm font-medium text-slate-700 mb-3">Market Trends & Factors</h4>
                <div className="space-y-2">
                  {breakdown.iowaMarketTrends.factors.map((factor: string, index: number) => (
                    <div key={index} className="flex items-center text-sm text-slate-600">
                      <div className="w-2 h-2 bg-blue-500 rounded-full mr-3"></div>
                      {factor}
                    </div>
                  ))}
                </div>
                
              </div>
            )}

            {/* Suggested Rent per Acre */}
            {breakdown.suggestedRentPerAcre && breakdown.cornFuturesPrice && (
              <div className="bg-white rounded-xl p-4 ring-1 ring-slate-200/50 mt-4">
                <h4 className="text-sm font-medium text-slate-700 mb-3">Suggested Rent per Acre</h4>
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-4 border border-amber-200">
                  <div className="text-2xl font-semibold text-amber-900 print:text-xl">
                    ${breakdown.suggestedRentPerAcre}<span className="ml-1">/acre</span>
                  </div>
                  <div className="text-sm text-amber-700 mt-2 print:text-xs print:leading-relaxed">
                    Based on current corn futures price of ${breakdown.cornFuturesPrice.toFixed(2)}<span className="ml-1">/bushel</span> × {breakdown.csr2Mean || 0} CSR2
                  </div>
                  <div className="text-xs text-amber-600 mt-1 print:leading-relaxed">
                    Formula: Corn Price × CSR2 = Suggested Annual Rent
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}