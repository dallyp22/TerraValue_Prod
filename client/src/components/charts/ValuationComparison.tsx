import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  LabelList,
  ReferenceLine,
} from 'recharts';
import { Sparkles, Calculator, TrendingUp } from 'lucide-react';

interface ValuationMethod {
  name: string;
  value: number;
  confidence: number;
  recommended?: boolean;
  icon?: 'ai' | 'calculator' | 'market';
}

interface ValuationComparisonProps {
  methods: ValuationMethod[];
  blendedValue?: number;
  className?: string;
}

const METHOD_COLORS = {
  default: '#2d5016',    // field green
  ai: '#6366f1',         // insight purple
  secondary: '#d4a03c',  // gold
};

const ICONS = {
  ai: Sparkles,
  calculator: Calculator,
  market: TrendingUp,
};

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

export function ValuationComparison({
  methods,
  blendedValue,
  className = '',
}: ValuationComparisonProps) {
  // Find max value for scaling
  const maxValue = Math.max(...methods.map((m) => m.value));

  // Prepare data with percentage for visual scaling
  const data = methods.map((method) => ({
    ...method,
    percentage: (method.value / maxValue) * 100,
    displayValue: formatCurrency(method.value),
  }));

  return (
    <div className={`${className}`}>
      <div className="space-y-4">
        {data.map((method, index) => {
          const IconComponent = method.icon ? ICONS[method.icon] : null;
          const barColor = method.icon === 'ai' ? METHOD_COLORS.ai :
                          method.recommended ? METHOD_COLORS.default :
                          METHOD_COLORS.secondary;

          return (
            <div key={method.name} className="group">
              {/* Method header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {IconComponent && (
                    <div
                      className="w-6 h-6 rounded-md flex items-center justify-center"
                      style={{ backgroundColor: `${barColor}15` }}
                    >
                      <IconComponent className="w-3.5 h-3.5" style={{ color: barColor }} />
                    </div>
                  )}
                  <span className="text-sm font-medium text-terra-black">
                    {method.name}
                  </span>
                  {method.recommended && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 bg-field/10 text-field rounded">
                      Recommended
                    </span>
                  )}
                </div>
                <span className="font-mono text-lg font-semibold text-terra-black">
                  {method.displayValue}
                </span>
              </div>

              {/* Progress bar */}
              <div className="relative">
                <div className="h-8 bg-warm-100 rounded-lg overflow-hidden">
                  <div
                    className="h-full rounded-lg transition-all duration-700 ease-out relative"
                    style={{
                      width: `${method.percentage}%`,
                      backgroundColor: barColor,
                    }}
                  >
                    {/* Confidence indicator overlay */}
                    <div
                      className="absolute inset-y-0 right-0 bg-white/20"
                      style={{ width: `${(1 - method.confidence) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Confidence label */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <span className="text-[10px] font-medium text-warm-500 bg-white/90 px-1.5 py-0.5 rounded">
                    {(method.confidence * 100).toFixed(0)}% conf.
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Blended value summary */}
      {blendedValue && (
        <div className="mt-6 pt-4 border-t border-warm-200">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-warm-500">
                Blended Estimate
              </span>
              <p className="text-[10px] text-warm-400 mt-0.5">
                Weighted by confidence scores
              </p>
            </div>
            <span className="font-mono text-2xl font-bold text-field">
              {formatCurrency(blendedValue)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact version for cards
export function ValuationComparisonMini({
  methods,
  className = '',
}: {
  methods: ValuationMethod[];
  className?: string;
}) {
  const maxValue = Math.max(...methods.map((m) => m.value));

  return (
    <div className={`space-y-2 ${className}`}>
      {methods.map((method) => {
        const percentage = (method.value / maxValue) * 100;
        const barColor = method.icon === 'ai' ? METHOD_COLORS.ai : METHOD_COLORS.default;

        return (
          <div key={method.name} className="flex items-center gap-3">
            <span className="text-xs text-warm-500 w-20 truncate">{method.name}</span>
            <div className="flex-1 h-2 bg-warm-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: barColor,
                  opacity: 0.3 + method.confidence * 0.7,
                }}
              />
            </div>
            <span className="font-mono text-xs font-medium text-terra-black w-16 text-right">
              {formatCurrency(method.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default ValuationComparison;
