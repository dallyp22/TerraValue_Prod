import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  FileText,
  Download,
  Database,
  Brain,
  TrendingUp,
  Activity,
  DollarSign,
  Check,
  MapPin,
  User,
  Sprout,
  Wheat,
  ChevronDown,
  ExternalLink,
  Info,
  Printer,
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import type { Valuation, ValuationBreakdown } from '@shared/schema';

// Import our new chart components
import { CSR2Gauge, CSR2Indicator } from '@/components/charts/CSR2Gauge';
import { ValuationComparison } from '@/components/charts/ValuationComparison';
import { SoilComposition, SoilCompositionBar } from '@/components/charts/SoilComposition';
import { MarketTrend, MarketTrendCard } from '@/components/charts/MarketTrend';
import { SoilDataReadOnly } from './SoilDataReadOnly';

interface ValuationReportTerraProps {
  valuation?: Valuation;
  className?: string;
}

// Format currency helper
function formatCurrency(value: number, short = false): string {
  if (short) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

// Valuation method configuration
const METHOD_CONFIG = {
  csr2: {
    label: 'CSR2 Quantitative',
    shortLabel: 'CSR2',
    icon: Activity,
    description: 'Based on soil productivity',
    color: 'field' as const,
  },
  income: {
    label: 'Income Approach',
    shortLabel: 'Income',
    icon: DollarSign,
    description: 'Based on cash rent analysis',
    color: 'gold' as const,
  },
  ai_market: {
    label: 'AI Market-Adjusted',
    shortLabel: 'AI Market',
    icon: Brain,
    description: 'AI adjusted with comparables',
    color: 'insight' as const,
  },
};

export function ValuationReportTerra({ valuation, className = '' }: ValuationReportTerraProps) {
  const isCompleted = valuation?.status === 'completed';
  const breakdown = valuation?.breakdown as ValuationBreakdown | null;
  const reportRef = useRef<HTMLDivElement>(null);

  const [selectedMethod, setSelectedMethod] = useState<'csr2' | 'income' | 'ai_market'>('csr2');
  const [isExporting, setIsExporting] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  // Calculate values for each method
  const valuationMethods = useMemo(() => {
    if (!breakdown || !valuation) return null;

    return {
      csr2: {
        perAcre: breakdown.csr2Value || 0,
        total: (breakdown.csr2Value || 0) * valuation.acreage,
        confidence: 0.85,
        recommended: true,
      },
      income: {
        perAcre: breakdown.incomeCapValue || 0,
        total: (breakdown.incomeCapValue || 0) * valuation.acreage,
        confidence: breakdown.cashRentPerAcre ? 0.9 : 0.6,
      },
      ai_market: {
        perAcre: breakdown.aiAdjustedValue || breakdown.baseValue || 0,
        total: (breakdown.aiAdjustedValue || breakdown.baseValue || 0) * valuation.acreage,
        confidence: 0.75,
      },
    };
  }, [breakdown, valuation]);

  // Calculate tillable/non-tillable breakdown
  const tillableAcres = breakdown?.tillableAcres || (valuation?.acreage || 0) * 0.9;
  const nonTillableAcres = (valuation?.acreage || 0) - tillableAcres;
  const improvements = breakdown?.improvements || 0;

  const getNonTillableMultiplier = (landType?: 'CRP' | 'Timber' | 'Other'): number => {
    switch (landType) {
      case 'CRP': return 0.65;
      case 'Timber': return 0.55;
      case 'Other': return 0.2;
      default: return 0.5;
    }
  };

  const rawPerAcreValue = valuationMethods?.[selectedMethod]?.perAcre || 0;
  const tillablePerAcre = selectedMethod === 'csr2'
    ? Math.round(breakdown?.tillableValuePerAcre || rawPerAcreValue)
    : Math.round(rawPerAcreValue);
  const nonTillableMultiplier = getNonTillableMultiplier(breakdown?.nonTillableType);
  const nonTillablePerAcre = Math.round(tillablePerAcre * nonTillableMultiplier);
  const tillableLandValue = Math.round(tillablePerAcre * tillableAcres);
  const nonTillableLandValue = Math.round(nonTillablePerAcre * nonTillableAcres);
  const totalPropertyValue = Math.round(tillableLandValue + nonTillableLandValue + improvements);

  // PDF Export
  const exportToPDF = async () => {
    if (!reportRef.current || !valuation || isExporting) return;
    setIsExporting(true);

    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#faf6ed',
      });

      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = 210;
      const pdfHeight = 297;
      const margin = 15;
      const contentWidth = pdfWidth - 2 * margin;
      const imgAspectRatio = canvas.width / canvas.height;
      let finalWidth = contentWidth;
      let finalHeight = contentWidth / imgAspectRatio;

      pdf.setFontSize(18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('FarmScope AI Property Valuation Report', margin, margin);

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), pdfWidth - margin - 45, margin);

      const yOffset = margin + 10;
      if (finalHeight < pdfHeight - yOffset - margin) {
        pdf.addImage(imgData, 'PNG', margin, yOffset, finalWidth, finalHeight);
      }

      const filename = `FarmScope AI_${valuation.address?.replace(/[^a-zA-Z0-9]/g, '_') || 'Property'}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(filename);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  // Loading/pending state
  if (!isCompleted || !valuation) {
    return (
      <div className={cn('bg-white rounded-xl border border-warm-200 shadow-terra overflow-hidden', className)}>
        <div className="p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-warm-400" />
          </div>
          <h3 className="text-lg font-semibold text-terra-black mb-2">Report Pending</h3>
          <p className="text-warm-500 max-w-md mx-auto">
            Your comprehensive valuation report will be available once the AI analysis is complete.
          </p>
        </div>
      </div>
    );
  }

  // Prepare data for charts
  const comparisonMethods = valuationMethods ? Object.entries(valuationMethods).map(([key, data]) => ({
    name: METHOD_CONFIG[key as keyof typeof METHOD_CONFIG].label,
    value: data.perAcre,
    confidence: data.confidence,
    recommended: (data as any).recommended,
    icon: key === 'ai_market' ? 'ai' : key === 'csr2' ? 'calculator' : 'market',
  })) : [];

  // Soil composition data (mock based on valuation data)
  const soilComponents = valuation.soilComponents as any[] || [];
  const soilCompositionData = soilComponents.length > 0
    ? soilComponents.map((comp: any) => ({
        name: comp.name || 'Unknown',
        percentage: comp.percentage || 0,
        csr2: comp.csr2,
      }))
    : [
        { name: 'Tillable', percentage: (tillableAcres / valuation.acreage) * 100, csr2: breakdown?.csr2Mean },
        { name: 'Non-Tillable', percentage: (nonTillableAcres / valuation.acreage) * 100 },
      ];

  return (
    <div
      ref={reportRef}
      className={cn(
        'bg-wheat-cream rounded-xl border border-warm-200 shadow-terra overflow-hidden',
        className
      )}
    >
      {/* Header */}
      <div className="relative px-6 py-5 border-b border-warm-200 bg-gradient-to-r from-field/5 via-transparent to-gold/5">
        {/* Contour pattern background */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'url(/patterns/contour-lines.svg)', backgroundSize: '200px' }}
        />

        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-field flex items-center justify-center shadow-terra">
              <FileText className="w-6 h-6 text-wheat-cream" />
            </div>
            <div>
              <h2 className="font-display text-xl text-terra-black">Valuation Report</h2>
              <p className="text-sm text-warm-500">{valuation.address || `${valuation.county} County, ${valuation.state}`}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="btn-terra-ghost px-3 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">Print</span>
            </button>
            <button
              onClick={exportToPDF}
              disabled={isExporting}
              className="btn-terra px-4 py-2 rounded-lg text-sm flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              {isExporting ? 'Exporting...' : 'Export PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* Hero Value Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-terra-elevated p-6"
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Total Value */}
            <div className="lg:col-span-2">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-warm-500 mb-1">
                    Total Property Value
                  </p>
                  <p className="font-mono text-4xl lg:text-5xl font-bold text-terra-black">
                    {formatCurrency(totalPropertyValue)}
                  </p>
                  <p className="text-sm text-warm-500 mt-2">
                    Based on {METHOD_CONFIG[selectedMethod].label} methodology
                  </p>
                </div>
                <CSR2Indicator value={breakdown?.csr2Mean || 0} size="lg" />
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-warm-200">
                <div>
                  <p className="text-xs text-warm-500 mb-1">Total Acres</p>
                  <p className="font-mono text-lg font-semibold text-terra-black">
                    {valuation.acreage.toFixed(1)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-warm-500 mb-1">$/Acre (Blended)</p>
                  <p className="font-mono text-lg font-semibold text-terra-black">
                    {formatCurrency(Math.round(totalPropertyValue / valuation.acreage))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-warm-500 mb-1">Tillable %</p>
                  <p className="font-mono text-lg font-semibold text-terra-black">
                    {((tillableAcres / valuation.acreage) * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>

            {/* CSR2 Gauge */}
            <div className="flex flex-col items-center justify-center">
              <CSR2Gauge
                value={breakdown?.csr2Mean || 0}
                size={160}
                showLabel
              />
              <p className="text-xs text-warm-500 mt-2 text-center">
                Average CSR2 Rating
              </p>
            </div>
          </div>
        </motion.div>

        {/* Valuation Methods Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card-terra p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-field/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-field" />
              </div>
              <div>
                <h3 className="font-semibold text-terra-black">Valuation Approaches</h3>
                <p className="text-xs text-warm-500">Click to select methodology</p>
              </div>
            </div>
          </div>

          {/* Method Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {(['csr2', 'income', 'ai_market'] as const).map((method) => {
              const config = METHOD_CONFIG[method];
              const data = valuationMethods?.[method];
              const isSelected = selectedMethod === method;
              const Icon = config.icon;

              return (
                <motion.button
                  key={method}
                  onClick={() => setSelectedMethod(method)}
                  className={cn(
                    'relative p-4 rounded-xl border-2 text-left transition-all duration-200',
                    isSelected
                      ? 'border-field bg-field/5 shadow-terra'
                      : 'border-warm-200 bg-white hover:border-warm-300 hover:shadow-sm'
                  )}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isSelected && (
                    <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-field flex items-center justify-center">
                      <Check className="w-3 h-3 text-wheat-cream" />
                    </div>
                  )}

                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center mb-3',
                    isSelected ? 'bg-field text-wheat-cream' : 'bg-warm-100 text-warm-600'
                  )}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <p className="font-medium text-terra-black text-sm mb-1">{config.label}</p>
                  <p className="text-xs text-warm-500 mb-3">{config.description}</p>

                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-xl font-bold text-terra-black">
                      {formatCurrency(data?.perAcre || 0)}
                    </span>
                    <span className="text-xs text-warm-500">/acre</span>
                  </div>

                  {/* Confidence bar */}
                  <div className="mt-3">
                    <div className="h-1 bg-warm-100 rounded-full overflow-hidden">
                      <motion.div
                        className={cn(
                          'h-full rounded-full',
                          isSelected ? 'bg-field' : 'bg-warm-300'
                        )}
                        initial={{ width: 0 }}
                        animate={{ width: `${(data?.confidence || 0) * 100}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <p className="text-[10px] text-warm-400 mt-1">
                      {((data?.confidence || 0) * 100).toFixed(0)}% confidence
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Selected Method Summary */}
          <div className="bg-warm-50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-field" />
                <span className="text-sm font-medium text-terra-black">
                  Selected: {METHOD_CONFIG[selectedMethod].label}
                </span>
              </div>
              <span className="font-mono text-lg font-semibold text-field">
                {formatCurrency(tillablePerAcre)}/acre
              </span>
            </div>
          </div>
        </motion.div>

        {/* Two Column Layout for Details */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Land Breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card-terra p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                <Wheat className="w-5 h-5 text-gold" />
              </div>
              <div>
                <h3 className="font-semibold text-terra-black">Land Breakdown</h3>
                <p className="text-xs text-warm-500">Tillable vs non-tillable</p>
              </div>
            </div>

            <SoilCompositionBar components={soilCompositionData} className="mb-6" />

            <div className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-warm-100">
                <div>
                  <p className="text-sm font-medium text-terra-black">Tillable Land</p>
                  <p className="text-xs text-warm-500">{tillableAcres.toFixed(1)} acres</p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-semibold text-terra-black">{formatCurrency(tillableLandValue)}</p>
                  <p className="text-xs text-warm-500">{formatCurrency(tillablePerAcre)}/ac</p>
                </div>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-warm-100">
                <div>
                  <p className="text-sm font-medium text-terra-black">Non-Tillable Land</p>
                  <p className="text-xs text-warm-500">
                    {nonTillableAcres.toFixed(1)} acres
                    {breakdown?.nonTillableType && ` (${breakdown.nonTillableType})`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono font-semibold text-terra-black">{formatCurrency(nonTillableLandValue)}</p>
                  <p className="text-xs text-warm-500">{formatCurrency(nonTillablePerAcre)}/ac</p>
                </div>
              </div>

              {improvements > 0 && (
                <div className="flex justify-between items-center py-2 border-b border-warm-100">
                  <div>
                    <p className="text-sm font-medium text-terra-black">Improvements</p>
                    <p className="text-xs text-warm-500">Buildings & infrastructure</p>
                  </div>
                  <p className="font-mono font-semibold text-terra-black">{formatCurrency(improvements)}</p>
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                <p className="font-semibold text-terra-black">Total Value</p>
                <p className="font-mono text-xl font-bold text-field">{formatCurrency(totalPropertyValue)}</p>
              </div>
            </div>
          </motion.div>

          {/* CSR2 Details */}
          {breakdown?.csr2Mean && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="card-terra p-6"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-csr-excellent/10 flex items-center justify-center">
                  <Database className="w-5 h-5 text-csr-excellent" />
                </div>
                <div>
                  <h3 className="font-semibold text-terra-black">CSR2 Soil Analysis</h3>
                  <p className="text-xs text-warm-500">Corn Suitability Rating 2</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-warm-50 rounded-xl p-4 text-center">
                  <p className="font-mono text-2xl font-bold text-terra-black">
                    {breakdown.csr2Mean.toFixed(1)}
                  </p>
                  <p className="text-xs text-warm-500 uppercase tracking-wider">Average</p>
                </div>
                <div className="bg-warm-50 rounded-xl p-4 text-center">
                  <p className="font-mono text-lg font-semibold text-terra-black">
                    {breakdown.csr2Min} - {breakdown.csr2Max}
                  </p>
                  <p className="text-xs text-warm-500 uppercase tracking-wider">Range</p>
                </div>
              </div>

              {breakdown.csr2DollarPerPoint && (
                <div className="bg-field/5 rounded-xl p-4 border border-field/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-field" />
                      <span className="text-sm font-medium text-terra-black">County Rate</span>
                    </div>
                    <span className="font-mono font-semibold text-field">
                      ${breakdown.csr2DollarPerPoint}/point
                    </span>
                  </div>
                  <p className="text-xs text-warm-500 mt-2">
                    Market rate per CSR2 point in {valuation.county} County
                  </p>
                </div>
              )}

              <div className="mt-4 p-3 bg-warm-50 rounded-lg">
                <p className="text-xs text-warm-600 leading-relaxed">
                  <strong>CSR2</strong> is Iowa State University's standardized soil productivity index
                  (5-100 scale). Rating based on {breakdown.csr2Count} sample points within the parcel.
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Owner/Parcel Info */}
        {(valuation.ownerName || valuation.parcelNumber) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card-terra p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-warm-100 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-warm-600" />
              </div>
              <h3 className="font-semibold text-terra-black">Parcel Information</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {valuation.ownerName && (
                <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-warm-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-warm-500 uppercase tracking-wider">Owner</p>
                    <p className="text-sm font-medium text-terra-black">{valuation.ownerName}</p>
                  </div>
                </div>
              )}
              {valuation.parcelNumber && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-warm-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-warm-500 uppercase tracking-wider">Parcel #</p>
                    <p className="font-mono text-sm font-medium text-terra-black">{valuation.parcelNumber}</p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Market Comps Section */}
        {breakdown?.iowaMarketComps && breakdown.iowaMarketComps.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="card-terra p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-insight/10 flex items-center justify-center">
                <Brain className="w-5 h-5 text-insight" />
              </div>
              <div>
                <h3 className="font-semibold text-terra-black">Market Analysis</h3>
                <p className="text-xs text-warm-500">Recent comparable sales</p>
              </div>
            </div>

            {breakdown.iowaMarketSummary && (
              <div className="bg-insight/5 rounded-xl p-4 mb-6 border border-insight/10">
                <p className="text-sm text-terra-black">{breakdown.iowaMarketSummary}</p>
              </div>
            )}

            <div className="space-y-3">
              {breakdown.iowaMarketComps.slice(0, 5).map((comp: any, index: number) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-3 border-b border-warm-100 last:border-b-0"
                >
                  <div className="flex-1">
                    <p className="font-mono font-semibold text-terra-black">
                      {formatCurrency(comp.price_per_acre)}/ac
                    </p>
                    <p className="text-xs text-warm-500">{comp.date}</p>
                  </div>
                  <div className="flex-1 px-4">
                    <p className="text-sm text-warm-700">{comp.details}</p>
                    {comp.acres && (
                      <p className="text-xs text-warm-500">{comp.acres} acres</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-warm-500">{comp.land_type || valuation.landType}</p>
                    {comp.county && (
                      <p className="text-xs text-warm-400">{comp.county} County</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {breakdown.marketCompsAverage && (
              <div className="mt-4 pt-4 border-t border-warm-200 flex items-center justify-between">
                <span className="text-sm font-medium text-warm-600">Average Comp Price</span>
                <span className="font-mono text-lg font-bold text-terra-black">
                  {formatCurrency(breakdown.marketCompsAverage)}/ac
                </span>
              </div>
            )}
          </motion.div>
        )}

        {/* Suggested Rent */}
        {breakdown?.suggestedRentPerAcre && breakdown?.cornFuturesPrice && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="card-terra-data p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gold/20 flex items-center justify-center">
                <Sprout className="w-5 h-5 text-gold-dark" />
              </div>
              <div>
                <h3 className="font-semibold text-terra-black">Suggested Annual Rent</h3>
                <p className="text-xs text-warm-500">Based on corn futures & soil quality</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-gold/10 to-gold/5 rounded-xl p-6 border border-gold/20">
              <p className="font-mono text-3xl font-bold text-terra-black mb-2">
                ${breakdown.suggestedRentPerAcre}/acre
              </p>
              <p className="text-sm text-warm-600">
                Corn futures ${breakdown.cornFuturesPrice.toFixed(2)}/bu × {breakdown.csr2Mean?.toFixed(1)} CSR2
              </p>
              <p className="text-xs text-warm-500 mt-2">
                Formula: Corn Price × CSR2 = Suggested Annual Rent
              </p>
            </div>
          </motion.div>
        )}

        {/* Soil Data (if available) */}
        {valuation.soilSeries && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
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
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-warm-50 border-t border-warm-200">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-warm-500">
            Generated by FarmScope AI on {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-xs text-warm-400">
            This valuation is an estimate and should not be used as the sole basis for financial decisions.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ValuationReportTerra;
