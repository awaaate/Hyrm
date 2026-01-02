import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { AgentProfile } from "../types";

interface AgentActivityChartProps {
  data: AgentProfile[];
  height?: number;
}

export function AgentActivityChart({ data, height = 200 }: AgentActivityChartProps) {
  // Transform agent profiles into activity data
  // Group by date and show task completion metrics
  const chartData = data
    .sort((a, b) => new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime())
    .slice(-10)
    .map((agent, index) => ({
      agent: `Agent ${index + 1}`,
      tasksCompleted: agent.tasksCompleted,
      quality: agent.avgQuality,
      efficiency: agent.efficiency,
    }));

  if (chartData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        No agent activity data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={chartData}
        margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="agent"
          stroke="#9ca3af"
          tick={{ fontSize: 10 }}
        />
        <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1f2937",
            border: "1px solid #374151",
            borderRadius: "8px",
          }}
        />
        <Line
          type="monotone"
          dataKey="quality"
          name="Quality"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ fill: "#10b981", strokeWidth: 0, r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="efficiency"
          name="Efficiency %"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={{ fill: "#8b5cf6", strokeWidth: 0, r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default AgentActivityChart;
