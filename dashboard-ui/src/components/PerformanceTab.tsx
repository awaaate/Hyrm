import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  Gauge,
  Lightbulb,
  LineChart,
  Timer,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { StatCard } from "./StatCard";
import type { PerformanceData } from "./types";
import { ToolTimingChart, AgentActivityChart, QualityTrendChart } from "./charts";

// Performance Panel
export function PerformanceTab({ data }: { data: PerformanceData | null }) {
  if (!data) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Gauge className="h-8 w-8 mr-2 opacity-50 animate-pulse" />
        <span>Loading performance data...</span>
      </div>
    );
  }

  const { toolExecutions, agentProfiles, errorPatterns, suggestions, summary } =
    data;

  // Calculate max values for charts
  const maxToolCalls = Math.max(...toolExecutions.map((t) => t.count), 1);
  const maxDuration = Math.max(
    ...toolExecutions.map((t) => t.avgDurationMs),
    1
  );

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <StatCard
          label="Total Tools"
          value={summary.totalTools}
          icon={Wrench}
        />
        <StatCard
          label="Total Calls"
          value={summary.totalCalls.toLocaleString()}
          icon={Activity}
        />
        <StatCard
          label="Active Agents"
          value={summary.totalAgents}
          icon={Bot}
        />
        <StatCard
          label="Tasks Done"
          value={summary.totalTasks}
          icon={CheckCircle2}
          trend="up"
        />
        <StatCard
          label="Avg Quality"
          value={summary.avgQuality.toFixed(1)}
          icon={TrendingUp}
          trend={
            summary.avgQuality >= 7.5
              ? "up"
              : summary.avgQuality < 6
              ? "down"
              : "stable"
          }
        />
        <StatCard
          label="Errors"
          value={summary.errorCount}
          icon={AlertTriangle}
          trend={summary.errorCount > 5 ? "down" : undefined}
        />
        <StatCard
          label="Suggestions"
          value={summary.suggestionCount}
          icon={Lightbulb}
        />
      </div>

      {/* Recharts Visualizations */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Tool Timing Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Tool Execution Times
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ToolTimingChart data={toolExecutions} maxItems={10} />
            <div className="flex gap-4 text-xs text-muted-foreground mt-4 justify-center">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-emerald-500 rounded" />
                <span>Fast (&lt;5s)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-amber-500 rounded" />
                <span>Medium (5-10s)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-500 rounded" />
                <span>Slow (&gt;10s)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Agent Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-5 w-5" />
              Agent Performance Metrics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AgentActivityChart data={agentProfiles} height={300} />
          </CardContent>
        </Card>
      </div>

      {/* Quality Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Quality Score History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <QualityTrendChart
            data={agentProfiles.slice(-15).map((agent, i) => ({
              date: `Task ${i + 1}`,
              score: agent.avgQuality,
            }))}
            height={200}
          />
        </CardContent>
      </Card>

      {/* Tool Execution Details Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Tool Execution Details (Top 15)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {toolExecutions.length === 0 ? (
            <p className="text-muted-foreground">
              No tool execution data available
            </p>
          ) : (
            <div className="space-y-3">
              {toolExecutions.slice(0, 15).map((tool, i) => (
                <div key={tool.tool} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span
                      className="font-mono font-medium truncate max-w-[200px]"
                      title={tool.tool}
                    >
                      {i + 1}. {tool.tool}
                    </span>
                    <div className="flex items-center gap-4 text-muted-foreground">
                      <span>{tool.count} calls</span>
                      <span
                        className={cn(
                          "w-20 text-right",
                          tool.avgDurationMs > 5000 && "text-amber-400",
                          tool.avgDurationMs > 10000 && "text-red-400"
                        )}
                      >
                        {tool.avgDurationMs > 1000
                          ? `${(tool.avgDurationMs / 1000).toFixed(1)}s`
                          : `${Math.round(tool.avgDurationMs)}ms`}
                      </span>
                      {tool.errorRate > 0 && (
                        <span className="text-red-400 text-xs">
                          {(tool.errorRate * 100).toFixed(0)}% err
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 h-4">
                    {/* Calls bar */}
                    <div className="flex-1 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-300"
                        style={{
                          width: `${(tool.count / maxToolCalls) * 100}%`,
                        }}
                        title={`${tool.count} calls`}
                      />
                    </div>
                    {/* Duration bar */}
                    <div className="flex-1 bg-muted rounded overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all duration-300",
                          tool.avgDurationMs > 10000
                            ? "bg-red-500"
                            : tool.avgDurationMs > 5000
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        )}
                        style={{
                          width: `${(tool.avgDurationMs / maxDuration) * 100}%`,
                        }}
                        title={`${tool.avgDurationMs.toFixed(0)}ms avg`}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex gap-4 text-xs text-muted-foreground mt-4">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-gradient-to-r from-primary to-purple-500 rounded" />
                  <span>Call Count</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-emerald-500 rounded" />
                  <span>Fast (&lt;5s)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-amber-500 rounded" />
                  <span>Medium (5-10s)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-red-500 rounded" />
                  <span>Slow (&gt;10s)</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent Efficiency Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agent Efficiency Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agentProfiles.length === 0 ? (
            <p className="text-muted-foreground">
              No agent performance data available
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Tasks</TableHead>
                  <TableHead className="text-right">Quality</TableHead>
                  <TableHead className="text-right">Efficiency</TableHead>
                  <TableHead className="text-right">Avg Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentProfiles.slice(0, 10).map((agent, i) => (
                  <TableRow key={agent.agentId}>
                    <TableCell>
                      <span
                        className={cn(
                          "font-bold",
                          i === 0 && "text-amber-400",
                          i === 1 && "text-slate-300",
                          i === 2 && "text-amber-600"
                        )}
                      >
                        #{i + 1}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {agent.agentId.slice(6, 24)}...
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold">
                        {agent.tasksCompleted}
                      </span>
                      {agent.tasksClaimed > agent.tasksCompleted && (
                        <span className="text-muted-foreground text-xs">
                          /{agent.tasksClaimed}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "font-semibold",
                          agent.avgQuality >= 8 && "text-emerald-400",
                          agent.avgQuality >= 6 &&
                            agent.avgQuality < 8 &&
                            "text-amber-400",
                          agent.avgQuality < 6 && "text-red-400"
                        )}
                      >
                        {agent.avgQuality.toFixed(1)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Progress
                          value={agent.efficiency}
                          className="w-16 h-2"
                        />
                        <span className="text-xs text-muted-foreground w-8">
                          {agent.efficiency}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {agent.avgTaskDurationMs > 60000
                        ? `${(agent.avgTaskDurationMs / 60000).toFixed(1)}m`
                        : agent.avgTaskDurationMs > 1000
                        ? `${(agent.avgTaskDurationMs / 1000).toFixed(1)}s`
                        : `${Math.round(agent.avgTaskDurationMs)}ms`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Error Patterns */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              Error Patterns
            </CardTitle>
          </CardHeader>
          <CardContent>
            {errorPatterns.length === 0 ? (
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <span>No error patterns detected</span>
              </div>
            ) : (
              <div className="space-y-3">
                {errorPatterns.slice(0, 5).map((error, i) => (
                  <Card key={i} className="border-l-4 border-l-red-500">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-red-400">
                          {error.pattern}
                        </span>
                        <Badge variant="destructive">{error.count}x</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {error.tools.slice(0, 3).map((tool) => (
                          <Badge
                            key={tool}
                            variant="secondary"
                            className="text-xs"
                          >
                            {tool}
                          </Badge>
                        ))}
                        {error.tools.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{error.tools.length - 3}
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Optimization Suggestions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-400" />
              Optimization Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {suggestions.length === 0 ? (
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <span>System performing optimally</span>
              </div>
            ) : (
              <div className="space-y-3">
                {suggestions.slice(0, 5).map((suggestion, i) => (
                  <Card
                    key={i}
                    className={cn(
                      "border-l-4",
                      suggestion.severity === "high" && "border-l-red-500",
                      suggestion.severity === "medium" && "border-l-amber-500",
                      suggestion.severity === "low" && "border-l-blue-500"
                    )}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={
                            suggestion.type === "performance"
                              ? "default"
                              : suggestion.type === "quality"
                              ? "secondary"
                              : "outline"
                          }
                          className="text-xs"
                        >
                          {suggestion.type}
                        </Badge>
                        <span className="font-medium">{suggestion.title}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {suggestion.description}
                      </p>
                      <p className="text-sm text-primary">
                        Suggestion: {suggestion.action}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Last Updated */}
      <p className="text-xs text-muted-foreground text-right">
        Last updated: {new Date(data.lastUpdated).toLocaleString()}
      </p>
    </div>
  );
}

export default PerformanceTab;
