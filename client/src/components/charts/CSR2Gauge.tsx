import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface CSR2GaugeProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  showBenchmark?: boolean;
  benchmarkValue?: number;
  benchmarkLabel?: string;
  className?: string;
}

// CSR2 quality thresholds and colors
const CSR2_THRESHOLDS = {
  excellent: { min: 82, color: '#2d5016', label: 'Excellent' },
  good: { min: 65, color: '#d4a03c', label: 'Good' },
  fair: { min: 50, color: '#c17f24', label: 'Fair' },
  poor: { min: 0, color: '#8b4513', label: 'Poor' },
};

function getQualityInfo(value: number) {
  if (value >= CSR2_THRESHOLDS.excellent.min) return CSR2_THRESHOLDS.excellent;
  if (value >= CSR2_THRESHOLDS.good.min) return CSR2_THRESHOLDS.good;
  if (value >= CSR2_THRESHOLDS.fair.min) return CSR2_THRESHOLDS.fair;
  return CSR2_THRESHOLDS.poor;
}

const sizeConfig = {
  sm: { width: 120, height: 80, innerRadius: 35, outerRadius: 50, fontSize: 'text-lg', labelSize: 'text-[10px]' },
  md: { width: 180, height: 110, innerRadius: 55, outerRadius: 75, fontSize: 'text-2xl', labelSize: 'text-xs' },
  lg: { width: 240, height: 140, innerRadius: 75, outerRadius: 100, fontSize: 'text-3xl', labelSize: 'text-sm' },
};

export function CSR2Gauge({
  value,
  size = 'md',
  showBenchmark = false,
  benchmarkValue,
  benchmarkLabel = 'County Avg',
  className = '',
}: CSR2GaugeProps) {
  const quality = getQualityInfo(value);
  const config = sizeConfig[size];

  // Normalize value to 0-100 for the gauge
  const normalizedValue = Math.min(Math.max(value, 0), 100);

  // Data for the gauge - filled portion and empty portion
  const data = [
    { name: 'value', value: normalizedValue },
    { name: 'empty', value: 100 - normalizedValue },
  ];

  // Background gradient segments for the gauge track
  const backgroundData = [
    { name: 'poor', value: 50, color: '#8b4513' },
    { name: 'fair', value: 15, color: '#c17f24' },
    { name: 'good', value: 17, color: '#d4a03c' },
    { name: 'excellent', value: 18, color: '#2d5016' },
  ];

  return (
    <div className={`relative ${className}`} style={{ width: config.width, height: config.height + 40 }}>
      <ResponsiveContainer width="100%" height={config.height}>
        <PieChart>
          {/* Background track showing quality zones */}
          <Pie
            data={backgroundData}
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius={config.innerRadius - 2}
            outerRadius={config.innerRadius}
            dataKey="value"
            stroke="none"
          >
            {backgroundData.map((entry, index) => (
              <Cell key={`bg-${index}`} fill={entry.color} opacity={0.2} />
            ))}
          </Pie>

          {/* Main gauge arc */}
          <Pie
            data={data}
            cx="50%"
            cy="100%"
            startAngle={180}
            endAngle={0}
            innerRadius={config.innerRadius}
            outerRadius={config.outerRadius}
            dataKey="value"
            stroke="none"
            cornerRadius={4}
          >
            <Cell fill={quality.color} />
            <Cell fill="#e8e6e1" />
          </Pie>

          {/* Benchmark indicator */}
          {showBenchmark && benchmarkValue !== undefined && (
            <Pie
              data={[{ value: 1 }]}
              cx="50%"
              cy="100%"
              startAngle={180 - (benchmarkValue / 100) * 180}
              endAngle={180 - (benchmarkValue / 100) * 180 - 2}
              innerRadius={config.innerRadius - 5}
              outerRadius={config.outerRadius + 5}
              dataKey="value"
              stroke="none"
            >
              <Cell fill="#1a1814" />
            </Pie>
          )}
        </PieChart>
      </ResponsiveContainer>

      {/* Center value display */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-end pb-2"
        style={{ paddingBottom: size === 'sm' ? '8px' : '16px' }}
      >
        <span className={`font-mono ${config.fontSize} font-bold`} style={{ color: quality.color }}>
          {value.toFixed(1)}
        </span>
        <span className={`${config.labelSize} font-medium uppercase tracking-wider text-warm-500`}>
          {quality.label}
        </span>
      </div>

      {/* Benchmark label */}
      {showBenchmark && benchmarkValue !== undefined && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center">
          <span className="text-[10px] text-warm-400 bg-warm-100 px-2 py-0.5 rounded-full">
            {benchmarkLabel}: {benchmarkValue.toFixed(1)}
          </span>
        </div>
      )}

      {/* Scale labels */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-between px-2">
        <span className="text-[10px] text-warm-400 font-mono">0</span>
        <span className="text-[10px] text-warm-400 font-mono">100</span>
      </div>
    </div>
  );
}

// Mini inline CSR2 indicator for tables/lists
export function CSR2Indicator({ value, className = '' }: { value: number; className?: string }) {
  const quality = getQualityInfo(value);
  const percentage = Math.min(Math.max(value, 0), 100);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-2 bg-warm-200 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor: quality.color,
          }}
        />
      </div>
      <span className="font-mono text-sm font-medium" style={{ color: quality.color }}>
        {value.toFixed(1)}
      </span>
    </div>
  );
}

export default CSR2Gauge;
