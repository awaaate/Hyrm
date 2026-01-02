import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface TaskCompletionDataPoint {
  date: string;
  completed: number;
  created: number;
}

interface TaskCompletionChartProps {
  data: TaskCompletionDataPoint[];
  height?: number;
}

export function TaskCompletionChart({ data, height = 250 }: TaskCompletionChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground"
        style={{ height }}
      >
        No task completion data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="date"
          stroke="#9ca3af"
          tick={{ fontSize: 11 }}
        />
        <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1f2937",
            border: "1px solid #374151",
            borderRadius: "8px",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          iconType="line"
        />
        <Line
          type="monotone"
          dataKey="completed"
          name="Completed"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ fill: "#10b981", strokeWidth: 0, r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="created"
          name="Created"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={{ fill: "#8b5cf6", strokeWidth: 0, r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default TaskCompletionChart;
