import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface SparklineDataPoint {
  value: number;
}

interface QualitySparklineProps {
  data: SparklineDataPoint[];
  width?: number;
  height?: number;
  color?: string;
}

export function QualitySparkline({
  data,
  width = 80,
  height = 30,
  color = "#10b981",
}: QualitySparklineProps) {
  if (data.length === 0) {
    return <div style={{ width, height }} className="bg-muted rounded" />;
  }

  // Determine color based on trend
  const firstValue = data[0]?.value ?? 0;
  const lastValue = data[data.length - 1]?.value ?? 0;
  const trendColor =
    lastValue > firstValue
      ? "#10b981" // emerald - improving
      : lastValue < firstValue
      ? "#ef4444" // red - declining
      : color; // stable

  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`sparklineGradient-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={trendColor} stopOpacity={0.6} />
              <stop offset="95%" stopColor={trendColor} stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={trendColor}
            strokeWidth={1.5}
            fill={`url(#sparklineGradient-${color})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default QualitySparkline;
