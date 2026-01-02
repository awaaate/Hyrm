import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface QualityDataPoint {
  date: string;
  score: number;
  label?: string;
}

interface QualityTrendChartProps {
  data: QualityDataPoint[];
  height?: number;
}

export function QualityTrendChart({ data, height = 200 }: QualityTrendChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        No quality trend data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={data}
        margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
      >
        <defs>
          <linearGradient id="qualityGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="date"
          stroke="#9ca3af"
          tick={{ fontSize: 11 }}
        />
        <YAxis
          domain={[0, 10]}
          stroke="#9ca3af"
          tick={{ fontSize: 11 }}
          ticks={[0, 2.5, 5, 7.5, 10]}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1f2937",
            border: "1px solid #374151",
            borderRadius: "8px",
          }}
          formatter={(value) => {
            const numValue = typeof value === "number" ? value : 0;
            return [numValue.toFixed(2), "Quality Score"];
          }}
        />
        <Area
          type="monotone"
          dataKey="score"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#qualityGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default QualityTrendChart;
