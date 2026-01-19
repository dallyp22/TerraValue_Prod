import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface DataPoint {
  date: string;
  value: number;
  label?: string;
}

interface MarketTrendProps {
  data: DataPoint[];
  height?: number;
  showAxis?: boolean;
  showTooltip?: boolean;
  showArea?: boolean;
  showTrendIndicator?: boolean;
  color?: 'auto' | 'green' | 'gold' | 'neutral';
  className?: string;
}

function formatCurrency(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

function calculateTrend(data: DataPoint[]): { percentage: number; direction: 'up' | 'down' | 'neutral' } {
  if (data.length < 2) return { percentage: 0, direction: 'neutral' };

  const firstValue = data[0].value;
  const lastValue = data[data.length - 1].value;
  const percentage = ((lastValue - firstValue) / firstValue) * 100;

  if (percentage > 1) return { percentage, direction: 'up' };
  if (percentage < -1) return { percentage, direction: 'down' };
  return { percentage, direction: 'neutral' };
}

const COLORS = {
  up: { stroke: '#2d5016', fill: '#2d5016', bg: 'bg-field/10', text: 'text-field' },
  down: { stroke: '#dc2626', fill: '#dc2626', bg: 'bg-red-50', text: 'text-red-600' },
  neutral: { stroke: '#d4a03c', fill: '#d4a03c', bg: 'bg-gold/10', text: 'text-gold' },
  green: { stroke: '#2d5016', fill: '#2d5016', bg: 'bg-field/10', text: 'text-field' },
  gold: { stroke: '#d4a03c', fill: '#d4a03c', bg: 'bg-gold/10', text: 'text-gold' },
};

// Custom tooltip
function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-sm border border-warm-200 rounded-lg shadow-terra px-3 py-2">
        <p className="text-[10px] text-warm-500 mb-0.5">{label}</p>
        <p className="font-mono text-sm font-semibold text-terra-black">
          {formatCurrency(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
}

export function MarketTrend({
  data,
  height = 60,
  showAxis = false,
  showTooltip = true,
  showArea = true,
  showTrendIndicator = true,
  color = 'auto',
  className = '',
}: MarketTrendProps) {
  const trend = calculateTrend(data);
  const colorScheme = color === 'auto' ? COLORS[trend.direction] : COLORS[color];

  const TrendIcon = trend.direction === 'up' ? TrendingUp :
                    trend.direction === 'down' ? TrendingDown : Minus;

  return (
    <div className={`${className}`}>
      <div className="flex items-center gap-3">
        {/* Sparkline */}
        <div className="flex-1" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            {showArea ? (
              <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                {showAxis && (
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: '#a8a49b' }}
                    tickLine={false}
                    axisLine={false}
                  />
                )}
                <defs>
                  <linearGradient id={`gradient-${trend.direction}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colorScheme.fill} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={colorScheme.fill} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                {showTooltip && <Tooltip content={<CustomTooltip />} />}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={colorScheme.stroke}
                  strokeWidth={2}
                  fill={`url(#gradient-${trend.direction})`}
                  dot={false}
                  activeDot={{ r: 3, fill: colorScheme.stroke }}
                />
              </AreaChart>
            ) : (
              <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                {showTooltip && <Tooltip content={<CustomTooltip />} />}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={colorScheme.stroke}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, fill: colorScheme.stroke }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Trend indicator */}
        {showTrendIndicator && (
          <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${colorScheme.bg}`}>
            <TrendIcon className={`w-3.5 h-3.5 ${colorScheme.text}`} />
            <span className={`text-xs font-semibold font-mono ${colorScheme.text}`}>
              {trend.direction !== 'neutral' && (trend.percentage > 0 ? '+' : '')}
              {trend.percentage.toFixed(1)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Larger market trend with more detail
export function MarketTrendCard({
  data,
  title = 'Price Trend',
  period = '5 Years',
  currentValue,
  className = '',
}: {
  data: DataPoint[];
  title?: string;
  period?: string;
  currentValue?: number;
  className?: string;
}) {
  const trend = calculateTrend(data);
  const colorScheme = COLORS[trend.direction];
  const TrendIcon = trend.direction === 'up' ? TrendingUp :
                    trend.direction === 'down' ? TrendingDown : Minus;

  const minValue = Math.min(...data.map((d) => d.value));
  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <div className={`bg-white rounded-xl border border-warm-200 shadow-terra p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-sm font-medium text-terra-black">{title}</h4>
          <p className="text-[10px] text-warm-400 uppercase tracking-wider">{period}</p>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${colorScheme.bg}`}>
          <TrendIcon className={`w-3.5 h-3.5 ${colorScheme.text}`} />
          <span className={`text-xs font-semibold font-mono ${colorScheme.text}`}>
            {trend.direction !== 'neutral' && (trend.percentage > 0 ? '+' : '')}
            {trend.percentage.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Current value */}
      {currentValue && (
        <div className="mb-3">
          <span className="font-mono text-2xl font-bold text-terra-black">
            {formatCurrency(currentValue)}
          </span>
          <span className="text-xs text-warm-500 ml-1">/acre</span>
        </div>
      )}

      {/* Chart */}
      <div style={{ height: 100 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colorScheme.fill} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colorScheme.fill} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <YAxis domain={[minValue * 0.95, maxValue * 1.05]} hide />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={colorScheme.stroke}
              strokeWidth={2}
              fill="url(#trendGradient)"
              dot={false}
              activeDot={{ r: 4, fill: colorScheme.stroke }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Min/Max labels */}
      <div className="flex justify-between mt-2">
        <span className="text-[10px] text-warm-400">
          Low: <span className="font-mono text-warm-600">{formatCurrency(minValue)}</span>
        </span>
        <span className="text-[10px] text-warm-400">
          High: <span className="font-mono text-warm-600">{formatCurrency(maxValue)}</span>
        </span>
      </div>
    </div>
  );
}

export default MarketTrend;
