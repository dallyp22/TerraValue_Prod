import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface SoilComponent {
  name: string;
  percentage: number;
  csr2?: number;
  color?: string;
}

interface SoilCompositionProps {
  components: SoilComponent[];
  title?: string;
  showLegend?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// Earth-tone color palette for soil series
const SOIL_COLORS = [
  '#3d2e1f', // terra brown
  '#6b4423', // terra umber
  '#8b4513', // saddle brown
  '#a0522d', // sienna
  '#cd853f', // peru
  '#d2b48c', // tan
  '#deb887', // burlywood
  '#f5deb3', // wheat
  '#2d5016', // field green (for special soils)
  '#4a7c23', // spring green
];

const sizeConfig = {
  sm: { outer: 60, inner: 35, height: 150 },
  md: { outer: 80, inner: 50, height: 200 },
  lg: { outer: 100, inner: 65, height: 260 },
};

// Custom tooltip
function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white/95 backdrop-blur-sm border border-warm-200 rounded-lg shadow-terra p-3">
        <p className="font-medium text-terra-black text-sm">{data.name}</p>
        <div className="mt-1 space-y-1">
          <p className="text-xs text-warm-500">
            Coverage: <span className="font-mono font-medium text-terra-black">{data.percentage.toFixed(1)}%</span>
          </p>
          {data.csr2 !== undefined && (
            <p className="text-xs text-warm-500">
              CSR2: <span className="font-mono font-medium text-terra-black">{data.csr2.toFixed(1)}</span>
            </p>
          )}
        </div>
      </div>
    );
  }
  return null;
}

// Custom legend
function CustomLegend({ payload }: any) {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-xs text-warm-600">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

export function SoilComposition({
  components,
  title,
  showLegend = true,
  size = 'md',
  className = '',
}: SoilCompositionProps) {
  const config = sizeConfig[size];

  // Assign colors if not provided
  const dataWithColors = components.map((comp, index) => ({
    ...comp,
    color: comp.color || SOIL_COLORS[index % SOIL_COLORS.length],
  }));

  // Calculate weighted average CSR2
  const weightedCsr2 = components.reduce((acc, comp) => {
    if (comp.csr2 !== undefined) {
      return acc + (comp.csr2 * comp.percentage / 100);
    }
    return acc;
  }, 0);

  const hasCSR2 = components.some((c) => c.csr2 !== undefined);

  return (
    <div className={className}>
      {title && (
        <h4 className="text-sm font-medium text-terra-black mb-2">{title}</h4>
      )}

      <div style={{ height: config.height }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={dataWithColors}
              cx="50%"
              cy="50%"
              innerRadius={config.inner}
              outerRadius={config.outer}
              paddingAngle={2}
              dataKey="percentage"
              nameKey="name"
              stroke="none"
            >
              {dataWithColors.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            {showLegend && <Legend content={<CustomLegend />} />}
          </PieChart>
        </ResponsiveContainer>

        {/* Center label */}
        {hasCSR2 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[10px] uppercase tracking-wider text-warm-500">Avg CSR2</span>
            <span className="font-mono text-xl font-bold text-terra-black">
              {weightedCsr2.toFixed(1)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// Horizontal stacked bar version for compact spaces
export function SoilCompositionBar({
  components,
  className = '',
}: {
  components: SoilComponent[];
  className?: string;
}) {
  const dataWithColors = components.map((comp, index) => ({
    ...comp,
    color: comp.color || SOIL_COLORS[index % SOIL_COLORS.length],
  }));

  return (
    <div className={className}>
      {/* Stacked bar */}
      <div className="h-4 rounded-full overflow-hidden flex">
        {dataWithColors.map((comp, index) => (
          <div
            key={index}
            className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${comp.percentage}%`,
              backgroundColor: comp.color,
            }}
            title={`${comp.name}: ${comp.percentage.toFixed(1)}%`}
          />
        ))}
      </div>

      {/* Legend below */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {dataWithColors.map((comp, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: comp.color }}
            />
            <span className="text-[10px] text-warm-500">
              {comp.name}
              <span className="font-mono ml-1 text-warm-600">
                {comp.percentage.toFixed(0)}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SoilComposition;
