import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';

interface CSR2DataPoint {
  csr2: number;
  acres: number;
  percentage: number;
  soilName?: string;
}

interface CSR2DistributionProps {
  data: CSR2DataPoint[];
  averageCSR2?: number;
  countyAverage?: number;
  showThresholds?: boolean;
  height?: number;
  className?: string;
}

// CSR2 quality thresholds
const THRESHOLDS = {
  excellent: { value: 82, label: 'Excellent', color: '#2d5016' },
  good: { value: 65, label: 'Good', color: '#d4a03c' },
  fair: { value: 50, label: 'Fair', color: '#c17f24' },
};

// Create gradient stops for the area fill
function getGradientStops() {
  return (
    <>
      <stop offset="0%" stopColor="#8b4513" stopOpacity={0.8} />
      <stop offset="50%" stopColor="#c17f24" stopOpacity={0.8} />
      <stop offset="65%" stopColor="#d4a03c" stopOpacity={0.8} />
      <stop offset="82%" stopColor="#4a7c23" stopOpacity={0.8} />
      <stop offset="100%" stopColor="#2d5016" stopOpacity={0.8} />
    </>
  );
}

// Custom tooltip
function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const quality =
      data.csr2 >= 82 ? 'Excellent' :
      data.csr2 >= 65 ? 'Good' :
      data.csr2 >= 50 ? 'Fair' : 'Poor';

    return (
      <div className="bg-white/95 backdrop-blur-sm border border-warm-200 rounded-lg shadow-terra p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="font-mono text-lg font-bold text-terra-black">
            {data.csr2.toFixed(1)}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-warm-100 text-warm-600">
            {quality}
          </span>
        </div>
        <div className="space-y-1 text-xs">
          <p className="text-warm-500">
            Area: <span className="font-mono font-medium text-terra-black">{data.acres.toFixed(1)} ac</span>
          </p>
          <p className="text-warm-500">
            Coverage: <span className="font-mono font-medium text-terra-black">{data.percentage.toFixed(1)}%</span>
          </p>
          {data.soilName && (
            <p className="text-warm-500">
              Soil: <span className="font-medium text-terra-black">{data.soilName}</span>
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
}

export function CSR2Distribution({
  data,
  averageCSR2,
  countyAverage,
  showThresholds = true,
  height = 200,
  className = '',
}: CSR2DistributionProps) {
  // Sort data by CSR2 value for proper visualization
  const sortedData = [...data].sort((a, b) => a.csr2 - b.csr2);

  // Calculate cumulative percentages for area chart
  let cumulative = 0;
  const chartData = sortedData.map((point) => {
    cumulative += point.percentage;
    return {
      ...point,
      cumulative,
    };
  });

  return (
    <div className={className}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
            <defs>
              <linearGradient id="csr2Gradient" x1="0" y1="0" x2="1" y2="0">
                {getGradientStops()}
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e8e6e1"
              vertical={false}
            />

            <XAxis
              dataKey="csr2"
              tick={{ fontSize: 10, fill: '#78746b' }}
              tickLine={false}
              axisLine={{ stroke: '#d3d0c9' }}
              label={{
                value: 'CSR2 Rating',
                position: 'bottom',
                offset: 0,
                style: { fontSize: 10, fill: '#78746b' },
              }}
            />

            <YAxis
              tick={{ fontSize: 10, fill: '#78746b' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}%`}
              width={35}
            />

            {/* Threshold reference lines */}
            {showThresholds && (
              <>
                <ReferenceLine
                  x={THRESHOLDS.fair.value}
                  stroke={THRESHOLDS.fair.color}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
                <ReferenceLine
                  x={THRESHOLDS.good.value}
                  stroke={THRESHOLDS.good.color}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
                <ReferenceLine
                  x={THRESHOLDS.excellent.value}
                  stroke={THRESHOLDS.excellent.color}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              </>
            )}

            {/* Average line */}
            {averageCSR2 && (
              <ReferenceLine
                x={averageCSR2}
                stroke="#1a1814"
                strokeWidth={2}
                label={{
                  value: `Avg: ${averageCSR2.toFixed(1)}`,
                  position: 'top',
                  fill: '#1a1814',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
            )}

            {/* County average line */}
            {countyAverage && (
              <ReferenceLine
                x={countyAverage}
                stroke="#6366f1"
                strokeWidth={1}
                strokeDasharray="6 3"
                label={{
                  value: `County: ${countyAverage.toFixed(1)}`,
                  position: 'insideTopRight',
                  fill: '#6366f1',
                  fontSize: 9,
                }}
              />
            )}

            <Tooltip content={<CustomTooltip />} />

            <Area
              type="monotone"
              dataKey="percentage"
              stroke="#3d2e1f"
              strokeWidth={2}
              fill="url(#csr2Gradient)"
              fillOpacity={0.6}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      {showThresholds && (
        <div className="flex justify-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-csr-poor" />
            <span className="text-[10px] text-warm-500">&lt;50 Poor</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-csr-fair" />
            <span className="text-[10px] text-warm-500">50-65 Fair</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-csr-good" />
            <span className="text-[10px] text-warm-500">65-82 Good</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-csr-excellent" />
            <span className="text-[10px] text-warm-500">82+ Excellent</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple histogram version
export function CSR2Histogram({
  data,
  height = 80,
  className = '',
}: {
  data: CSR2DataPoint[];
  height?: number;
  className?: string;
}) {
  // Group data into buckets
  const buckets = [
    { range: '0-50', min: 0, max: 50, color: '#8b4513', count: 0, acres: 0 },
    { range: '50-65', min: 50, max: 65, color: '#c17f24', count: 0, acres: 0 },
    { range: '65-82', min: 65, max: 82, color: '#d4a03c', count: 0, acres: 0 },
    { range: '82-100', min: 82, max: 100, color: '#2d5016', count: 0, acres: 0 },
  ];

  data.forEach((point) => {
    const bucket = buckets.find((b) => point.csr2 >= b.min && point.csr2 < b.max);
    if (bucket) {
      bucket.count++;
      bucket.acres += point.acres;
    }
  });

  const maxAcres = Math.max(...buckets.map((b) => b.acres));

  return (
    <div className={className}>
      <div className="flex items-end gap-1" style={{ height }}>
        {buckets.map((bucket) => (
          <div key={bucket.range} className="flex-1 flex flex-col items-center">
            <div
              className="w-full rounded-t transition-all duration-500"
              style={{
                height: `${(bucket.acres / maxAcres) * 100}%`,
                backgroundColor: bucket.color,
                minHeight: bucket.acres > 0 ? 4 : 0,
              }}
            />
            <span className="text-[9px] text-warm-500 mt-1 font-mono">
              {bucket.range}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CSR2Distribution;
