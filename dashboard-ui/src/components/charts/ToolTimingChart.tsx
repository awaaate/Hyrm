import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ToolExecution } from "../types";

interface ToolTimingChartProps {
  data: ToolExecution[];
  maxItems?: number;
}

// Color based on average duration
const getBarColor = (avgDuration: number) => {
  if (avgDuration > 10000) return "#ef4444"; // red-500
  if (avgDuration > 5000) return "#f59e0b"; // amber-500
  return "#10b981"; // emerald-500
};

export function ToolTimingChart({ data, maxItems = 10 }: ToolTimingChartProps) {
  const chartData = data.slice(0, maxItems).map((tool) => ({
    name: tool.tool.length > 15 ? tool.tool.slice(0, 15) + "..." : tool.tool,
    fullName: tool.tool,
    duration: Math.round(tool.avgDurationMs),
    calls: tool.count,
    errorRate: tool.errorRate * 100,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-muted-foreground">
        No tool timing data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          type="number"
          stroke="#9ca3af"
          tickFormatter={(v) => (v > 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`)}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke="#9ca3af"
          tick={{ fontSize: 12 }}
          width={80}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1f2937",
            border: "1px solid #374151",
            borderRadius: "8px",
          }}
          formatter={(value, name) => {
            const numValue = typeof value === "number" ? value : 0;
            if (name === "duration") {
              return [
                numValue > 1000 ? `${(numValue / 1000).toFixed(2)}s` : `${numValue}ms`,
                "Avg Duration",
              ];
            }
            return [numValue, String(name)];
          }}
          labelFormatter={(label, payload) => {
            if (payload?.[0]?.payload?.fullName) {
              return payload[0].payload.fullName;
            }
            return String(label);
          }}
        />
        <Bar dataKey="duration" name="duration" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={getBarColor(entry.duration)}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default ToolTimingChart;
