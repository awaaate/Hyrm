import { useEffect, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  AlertTriangle,
  Bell,
  BellOff,
  Bot,
  CheckCircle2,
  Clock,
  Gauge,
  Lightbulb,
  ListTodo,
  ScrollText,
  Timer,
  TrendingUp,
  Wifi,
  WifiOff,
  Wrench,
  Zap,
} from "lucide-react";

// Connection status type
type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

// Types
interface Agent {
  id: string;
  session: string;
  role: string;
  status: string;
  task?: string;
  last_heartbeat: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed" | "blocked";
  assigned_to?: string;
  created_at: string;
}

interface Stats {
  session_count: number;
  status: string;
  active_tasks: string[];
  recent_achievements: string[];
  last_session: string;
}

interface LogEntry {
  timestamp: string;
  session: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  data?: unknown;
}

interface QualityStats {
  total: number;
  avg_score: string;
  trend: "improving" | "stable" | "declining";
  recent_avg: string;
  older_avg: string;
}

interface SessionSummary {
  session_id: string;
  started_at: string;
  ended_at?: string;
  duration_minutes?: number;
  tool_calls: number;
  status: string;
  achievements: string[];
  learnings: string[];
}

interface SessionAnalytics {
  total_sessions: number;
  total_tool_calls: number;
  avg_duration_minutes: number;
  sessions_today: number;
  sessions_this_week: number;
  recent_sessions: SessionSummary[];
  tool_usage_by_type: Record<string, number>;
  session_activity_by_hour: number[];
}

interface ToolExecution {
  tool: string;
  count: number;
  totalDurationMs: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  errorCount: number;
  errorRate: number;
}

interface AgentProfile {
  agentId: string;
  tasksCompleted: number;
  tasksClaimed: number;
  avgTaskDurationMs: number;
  avgQuality: number;
  efficiency: number;
  firstSeen: string;
  lastSeen: string;
}

interface ErrorPattern {
  pattern: string;
  count: number;
  tools: string[];
  lastOccurred: string;
}

interface Suggestion {
  type: "performance" | "quality" | "reliability";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  action: string;
}

interface PerformanceData {
  lastUpdated: string;
  toolExecutions: ToolExecution[];
  agentProfiles: AgentProfile[];
  errorPatterns: ErrorPattern[];
  suggestions: Suggestion[];
  summary: {
    totalTools: number;
    totalCalls: number;
    totalAgents: number;
    totalTasks: number;
    avgQuality: number;
    errorCount: number;
    suggestionCount: number;
  };
}

// API base URL
const API_BASE = "http://localhost:3847";

// Exponential backoff configuration
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const BACKOFF_MULTIPLIER = 1.5;

// Connection Status Indicator component
function ConnectionStatusIndicator({
  status,
  reconnectAttempt,
}: {
  status: ConnectionStatus;
  reconnectAttempt: number;
}) {
  const statusConfig = {
    connected: {
      icon: Wifi,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500",
      label: "Connected",
      pulseClass: "animate-pulse",
    },
    disconnected: {
      icon: WifiOff,
      color: "text-red-400",
      bgColor: "bg-red-500",
      label: "Disconnected",
      pulseClass: "",
    },
    reconnecting: {
      icon: Wifi,
      color: "text-amber-400",
      bgColor: "bg-amber-500",
      label: `Reconnecting${
        reconnectAttempt > 0 ? ` (${reconnectAttempt})` : "..."
      }`,
      pulseClass: "animate-bounce",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "w-2 h-2 rounded-full transition-colors duration-300",
          config.bgColor,
          config.pulseClass
        )}
      />
      <Icon className={cn("h-4 w-4", config.color)} />
      <span className={cn("text-sm", config.color)}>{config.label}</span>
    </div>
  );
}

// Status Badge component using shadcn Badge
function StatusBadge({ status }: { status: string }) {
  const variant = status as
    | "active"
    | "working"
    | "idle"
    | "pending"
    | "in_progress"
    | "completed"
    | "blocked"
    | "default";
  return (
    <Badge variant={variant} className="capitalize">
      {status.replace("_", " ")}
    </Badge>
  );
}

// Priority Badge component using shadcn Badge
function PriorityBadge({ priority }: { priority: string }) {
  const variant = priority as "critical" | "high" | "medium" | "low";
  return (
    <Badge variant={variant} className="uppercase text-xs">
      {priority}
    </Badge>
  );
}

// Stat Card component
function StatCard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string | number;
  icon?: React.ElementType;
  trend?: "up" | "down" | "stable";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          {Icon && (
            <div
              className={cn(
                "p-2 rounded-lg",
                trend === "up" && "bg-emerald-500/20 text-emerald-400",
                trend === "down" && "bg-red-500/20 text-red-400",
                !trend && "bg-primary/20 text-primary"
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Agents Panel
function AgentsPanel({ agents }: { agents: Agent[] }) {
  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Bot className="h-8 w-8 mr-2 opacity-50" />
        <span>No active agents</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {agents.map((agent) => (
        <Card key={agent.id} className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold capitalize">{agent.role}</span>
              <StatusBadge status={agent.status} />
            </div>
            <p className="font-mono text-xs text-muted-foreground mb-1">
              {agent.id?.slice(0, 24)}...
            </p>
            {agent.task && (
              <p className="text-sm text-muted-foreground">{agent.task}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Last seen: {new Date(agent.last_heartbeat).toLocaleTimeString()}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Tasks Table
function TasksTable({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <ListTodo className="h-8 w-8 mr-2 opacity-50" />
        <span>No tasks</span>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Priority</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Assigned</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell>
              <PriorityBadge priority={task.priority} />
            </TableCell>
            <TableCell>
              <div>
                <p className="font-medium">{task.title}</p>
                {task.description && (
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {task.description}
                  </p>
                )}
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge status={task.status} />
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {task.assigned_to ? `${task.assigned_to.slice(0, 12)}...` : "-"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Tasks Cards (for overview)
function TasksCards({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return <p className="text-muted-foreground">No tasks</p>;
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => (
        <Card key={task.id}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <PriorityBadge priority={task.priority} />
              <StatusBadge status={task.status} />
            </div>
            <p className="font-medium">{task.title}</p>
            {task.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {task.description}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Logs Panel
function LogsPanel({ logs }: { logs: LogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <ScrollText className="h-8 w-8 mr-2 opacity-50" />
        <span>No log entries</span>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-96 overflow-y-auto font-mono text-sm">
      {logs.map((log, i) => (
        <div key={i} className="flex gap-3 py-1 border-b border-border/50">
          <span className="text-muted-foreground w-20 shrink-0">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <span
            className={cn(
              "w-12 shrink-0 font-semibold",
              log.level === "INFO" && "text-blue-400",
              log.level === "WARN" && "text-amber-400",
              log.level === "ERROR" && "text-red-400"
            )}
          >
            {log.level}
          </span>
          <span className="text-muted-foreground flex-1">{log.message}</span>
        </div>
      ))}
    </div>
  );
}

// Quality Panel
function QualityPanel({
  stats,
  lessons,
}: {
  stats: QualityStats;
  lessons: Array<{ task: string; lesson: string }>;
}) {
  const trendInfo = {
    improving: {
      icon: TrendingUp,
      color: "text-emerald-400",
      label: "Improving",
    },
    stable: { icon: Activity, color: "text-slate-400", label: "Stable" },
    declining: {
      icon: TrendingUp,
      color: "text-red-400 rotate-180",
      label: "Declining",
    },
  };

  const trend = trendInfo[stats.trend];
  const TrendIcon = trend.icon;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">{stats.avg_score}</p>
            <p className="text-sm text-muted-foreground">Avg Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{stats.total}</p>
            <p className="text-sm text-muted-foreground">Assessed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center flex flex-col items-center">
            <div className="flex items-center gap-2">
              <TrendIcon className={cn("h-6 w-6", trend.color)} />
              <span className={cn("text-xl font-bold", trend.color)}>
                {trend.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">Trend</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm mb-1">Recent Avg</p>
            <p className="text-2xl font-bold text-emerald-400">
              {stats.recent_avg}
            </p>
            <Progress
              value={parseFloat(stats.recent_avg) * 10}
              className="h-2 mt-2"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm mb-1">Older Avg</p>
            <p className="text-2xl font-bold text-slate-400">
              {stats.older_avg}
            </p>
            <Progress
              value={parseFloat(stats.older_avg) * 10}
              className="h-2 mt-2"
            />
          </CardContent>
        </Card>
      </div>

      {lessons.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3">Recent Lessons</h4>
          <div className="space-y-2">
            {lessons.slice(0, 3).map((l, i) => (
              <Card key={i}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-1">{l.task}</p>
                  <p className="text-sm">{l.lesson}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Performance Panel
function PerformancePanel({ data }: { data: PerformanceData | null }) {
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

      {/* Tool Execution Times */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5" />
            Tool Execution Times (Top 15)
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

// Session Analytics Panel
function SessionAnalyticsPanel({
  analytics,
}: {
  analytics: SessionAnalytics | null;
}) {
  if (!analytics) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Activity className="h-8 w-8 mr-2 opacity-50 animate-pulse" />
        <span>Loading session analytics...</span>
      </div>
    );
  }

  const maxActivity = Math.max(...analytics.session_activity_by_hour, 1);

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Total Sessions"
          value={analytics.total_sessions}
          icon={Zap}
        />
        <StatCard
          label="Tool Calls"
          value={analytics.total_tool_calls.toLocaleString()}
          icon={Activity}
        />
        <StatCard
          label="Avg Duration"
          value={`${analytics.avg_duration_minutes.toFixed(0)}m`}
          icon={Clock}
        />
        <StatCard
          label="Today"
          value={analytics.sessions_today}
          icon={CheckCircle2}
          trend="up"
        />
        <StatCard
          label="This Week"
          value={analytics.sessions_this_week}
          icon={TrendingUp}
        />
      </div>

      {/* Activity chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity by Hour</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-24">
            {analytics.session_activity_by_hour.map((count, hour) => (
              <div
                key={hour}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <div
                  className="w-full bg-gradient-to-t from-primary to-purple-500 rounded-t transition-all duration-300"
                  style={{
                    height: `${(count / maxActivity) * 100}%`,
                    minHeight: count > 0 ? "4px" : "2px",
                  }}
                  title={`${hour}:00 - ${count} sessions`}
                />
                <span className="text-[10px] text-muted-foreground">
                  {hour}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tool usage */}
      {analytics.tool_usage_by_type &&
        Object.keys(analytics.tool_usage_by_type).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Tools</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(analytics.tool_usage_by_type)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 9)
                  .map(([tool, count]) => (
                    <div
                      key={tool}
                      className="flex justify-between items-center p-2 bg-muted rounded"
                    >
                      <span className="font-mono text-xs text-muted-foreground truncate">
                        {tool}
                      </span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

      {/* Recent sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analytics.recent_sessions.slice(0, 5).map((session, i) => (
              <Card key={i} className="border-l-4 border-l-primary">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold">
                      Session {session.session_id}
                    </span>
                    <StatusBadge status={session.status} />
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(session.started_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground mb-2">
                    <span>{session.tool_calls} tool calls</span>
                    {session.duration_minutes && (
                      <span>{session.duration_minutes.toFixed(0)} min</span>
                    )}
                  </div>
                  {session.achievements.length > 0 && (
                    <div className="space-y-1">
                      {session.achievements.slice(0, 2).map((a, j) => (
                        <p
                          key={j}
                          className="text-sm pl-2 border-l-2 border-emerald-500"
                        >
                          {a}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Notification helper
function showTaskCompletedNotification(taskTitle: string) {
  // Check if notifications are supported and permitted
  if (!("Notification" in window)) {
    console.log("Notifications not supported");
    return;
  }

  if (Notification.permission === "granted") {
    new Notification("Task Completed", {
      body: taskTitle,
      icon: "/vite.svg",
      tag: "task-completed",
    });
    // Also play a sound
    playNotificationSound();
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        new Notification("Task Completed", {
          body: taskTitle,
          icon: "/vite.svg",
          tag: "task-completed",
        });
        playNotificationSound();
      }
    });
  }
}

// Play notification sound
function playNotificationSound() {
  try {
    // Create a simple beep using Web Audio API
    const audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // Hz
    oscillator.type = "sine";
    gainNode.gain.value = 0.3;

    oscillator.start();

    // Fade out
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.3
    );
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    console.log("Could not play notification sound:", e);
  }
}

// Main App
function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [quality, setQuality] = useState<{
    stats: QualityStats;
    lessons: { task: string; lesson: string }[];
  } | null>(null);
  const [analytics, setAnalytics] = useState<SessionAnalytics | null>(null);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Refs for reconnection logic
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        setNotificationsEnabled(true);
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((permission) => {
          setNotificationsEnabled(permission === "granted");
        });
      }
    }
  }, []);

  // WebSocket connection with exponential backoff
  const connect = useCallback(() => {
    // Don't try to connect if already connected or connecting
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    setConnectionStatus("reconnecting");

    const ws = new WebSocket(`ws://localhost:3847/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setConnectionStatus("connected");
      setError(null);
      setReconnectAttempt(0);
      // Reset backoff delay on successful connection
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "stats":
            setStats(data.data);
            break;
          case "agents":
            setAgents(data.data.agents || []);
            break;
          case "tasks":
            setTasks(data.data.tasks || []);
            break;
          case "logs":
            setLogs(data.data.entries || []);
            break;
          case "quality":
            setQuality({
              stats: data.data.stats,
              lessons: data.data.lessons || [],
            });
            break;
          case "analytics":
            setAnalytics(data.data);
            break;
          case "performance":
            setPerformance(data.data);
            break;
          case "task_completed":
            // Show notification when a task is completed
            showTaskCompletedNotification(
              data.data.title || "A task was completed"
            );
            break;
        }
      } catch (e) {
        console.error("Error parsing WebSocket message:", e);
      }
    };

    ws.onclose = (event) => {
      console.log("WebSocket disconnected", event.code, event.reason);
      wsRef.current = null;
      setConnectionStatus("disconnected");

      // Schedule reconnection with exponential backoff
      const delay = reconnectDelayRef.current;
      setReconnectAttempt((prev) => prev + 1);

      console.log(
        `Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempt + 1})`
      );

      reconnectTimeoutRef.current = setTimeout(() => {
        setConnectionStatus("reconnecting");
        // Increase delay for next attempt (with cap)
        reconnectDelayRef.current = Math.min(
          delay * BACKOFF_MULTIPLIER,
          MAX_RECONNECT_DELAY
        );
        connect();
      }, delay);
    };

    ws.onerror = (e) => {
      console.error("WebSocket error:", e);
      setError("Connection error. Is the dashboard server running?");
    };
  }, [reconnectAttempt]);

  // Initial connection and cleanup
  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect]);

  // Fallback to HTTP polling if WebSocket fails
  useEffect(() => {
    if (connectionStatus === "connected") return;

    const fetchData = async () => {
      try {
        const [
          statsRes,
          agentsRes,
          tasksRes,
          logsRes,
          qualityRes,
          analyticsRes,
          performanceRes,
        ] = await Promise.all([
          fetch(`${API_BASE}/api/stats`),
          fetch(`${API_BASE}/api/agents`),
          fetch(`${API_BASE}/api/tasks`),
          fetch(`${API_BASE}/api/logs`),
          fetch(`${API_BASE}/api/quality`),
          fetch(`${API_BASE}/api/analytics`),
          fetch(`${API_BASE}/api/performance`),
        ]);

        if (statsRes.ok) setStats(await statsRes.json());
        if (agentsRes.ok) {
          const data = await agentsRes.json();
          setAgents(data.agents || []);
        }
        if (tasksRes.ok) {
          const data = await tasksRes.json();
          setTasks(data.tasks || []);
        }
        if (logsRes.ok) {
          const data = await logsRes.json();
          setLogs(data.entries || []);
        }
        if (qualityRes.ok) {
          const data = await qualityRes.json();
          setQuality({ stats: data.stats, lessons: data.lessons || [] });
        }
        if (analyticsRes.ok) {
          setAnalytics(await analyticsRes.json());
        }
        if (performanceRes.ok) {
          setPerformance(await performanceRes.json());
        }
        setError(null);
      } catch (e) {
        console.error("Fetch error:", e);
        setError("Cannot connect to dashboard server");
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [connectionStatus]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
            Multi-Agent Memory System
          </h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (
                  "Notification" in window &&
                  Notification.permission !== "granted"
                ) {
                  Notification.requestPermission().then((permission) => {
                    setNotificationsEnabled(permission === "granted");
                  });
                }
              }}
              className={cn(
                "flex items-center gap-1 text-sm px-2 py-1 rounded transition-colors",
                notificationsEnabled
                  ? "text-emerald-400 hover:bg-emerald-500/10"
                  : "text-muted-foreground hover:bg-muted"
              )}
              title={
                notificationsEnabled
                  ? "Notifications enabled"
                  : "Click to enable notifications"
              }
            >
              {notificationsEnabled ? (
                <Bell className="h-4 w-4" />
              ) : (
                <BellOff className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {notificationsEnabled ? "Alerts On" : "Alerts Off"}
              </span>
            </button>
            <ConnectionStatusIndicator
              status={connectionStatus}
              reconnectAttempt={reconnectAttempt}
            />
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="border-b border-red-500/50 bg-red-500/10 text-red-400 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="quality">Quality</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    System Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-3xl font-bold">
                          {stats.session_count}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Sessions
                        </p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <StatusBadge status={stats.status} />
                        <p className="text-sm text-muted-foreground mt-2">
                          Status
                        </p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-3xl font-bold">{agents.length}</p>
                        <p className="text-sm text-muted-foreground">Agents</p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-3xl font-bold">
                          {tasks.filter((t) => t.status === "pending").length}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Pending Tasks
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Loading...</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    Recent Achievements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats?.recent_achievements?.length ? (
                    <div className="space-y-2">
                      {stats.recent_achievements.slice(0, 5).map((a, i) => (
                        <div
                          key={i}
                          className="pl-3 border-l-2 border-emerald-500 py-1"
                        >
                          <p className="text-sm">{a}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No achievements yet</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    Active Agents ({agents.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AgentsPanel agents={agents.slice(0, 3)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ListTodo className="h-5 w-5" />
                    Top Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TasksCards
                    tasks={tasks
                      .filter((t) => t.status !== "completed")
                      .slice(0, 3)}
                  />
                </CardContent>
              </Card>

              {/* Performance Quick Stats */}
              {performance && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Gauge className="h-5 w-5" />
                      Performance Snapshot
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-2xl font-bold">
                          {performance.summary.totalCalls.toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Tool Calls
                        </p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-2xl font-bold">
                          {performance.summary.totalTools}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Tools Used
                        </p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p
                          className={cn(
                            "text-2xl font-bold",
                            performance.summary.avgQuality >= 7.5 &&
                              "text-emerald-400",
                            performance.summary.avgQuality < 7.5 &&
                              performance.summary.avgQuality >= 6 &&
                              "text-amber-400",
                            performance.summary.avgQuality < 6 && "text-red-400"
                          )}
                        >
                          {performance.summary.avgQuality.toFixed(1)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Avg Quality
                        </p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p
                          className={cn(
                            "text-2xl font-bold",
                            performance.summary.errorCount === 0 &&
                              "text-emerald-400",
                            performance.summary.errorCount > 0 &&
                              performance.summary.errorCount <= 3 &&
                              "text-amber-400",
                            performance.summary.errorCount > 3 && "text-red-400"
                          )}
                        >
                          {performance.summary.errorCount}
                        </p>
                        <p className="text-sm text-muted-foreground">Errors</p>
                      </div>
                    </div>
                    {performance.toolExecutions.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-muted-foreground mb-2">
                          Top 3 Tools by Usage
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {performance.toolExecutions
                            .slice(0, 3)
                            .map((tool, i) => (
                              <Badge
                                key={tool.tool}
                                variant={i === 0 ? "default" : "secondary"}
                              >
                                {tool.tool}: {tool.count}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="agents">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Active Agents ({agents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AgentsPanel agents={agents} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListTodo className="h-5 w-5" />
                  Tasks ({tasks.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TasksTable tasks={tasks} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="performance">
            <PerformancePanel data={performance} />
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ScrollText className="h-5 w-5" />
                  Realtime Logs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <LogsPanel logs={logs} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quality">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Quality Assessment
                </CardTitle>
              </CardHeader>
              <CardContent>
                {quality ? (
                  <QualityPanel
                    stats={quality.stats}
                    lessons={quality.lessons}
                  />
                ) : (
                  <p className="text-muted-foreground">
                    Loading quality data...
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <SessionAnalyticsPanel analytics={analytics} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card/50 mt-auto">
        <div className="container mx-auto px-4 py-3 flex justify-between text-xs text-muted-foreground">
          <span>Multi-Agent Memory System v1.0</span>
          <span>Last update: {new Date().toLocaleTimeString()}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
