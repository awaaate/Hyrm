// Connection status type
export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

// Types
export interface Agent {
  id: string;
  session: string;
  role: string;
  status: string;
  task?: string;
  last_heartbeat: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed" | "blocked";
  assigned_to?: string;
  created_at: string;
}

export interface Stats {
  session_count: number;
  status: string;
  active_tasks: string[];
  recent_achievements: string[];
  last_session: string;
}

export interface LogEntry {
  timestamp: string;
  session: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
  data?: unknown;
}

export interface QualityStats {
  total: number;
  avg_score: string;
  trend: "improving" | "stable" | "declining";
  recent_avg: string;
  older_avg: string;
}

export interface SessionSummary {
  session_id: string;
  started_at: string;
  ended_at?: string;
  duration_minutes?: number;
  tool_calls: number;
  status: string;
  achievements: string[];
  learnings: string[];
}

export interface SessionAnalytics {
  total_sessions: number;
  total_tool_calls: number;
  avg_duration_minutes: number;
  sessions_today: number;
  sessions_this_week: number;
  recent_sessions: SessionSummary[];
  tool_usage_by_type: Record<string, number>;
  session_activity_by_hour: number[];
}

export interface ToolExecution {
  tool: string;
  count: number;
  totalDurationMs: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  errorCount: number;
  errorRate: number;
}

export interface AgentProfile {
  agentId: string;
  tasksCompleted: number;
  tasksClaimed: number;
  avgTaskDurationMs: number;
  avgQuality: number;
  efficiency: number;
  firstSeen: string;
  lastSeen: string;
}

export interface ErrorPattern {
  pattern: string;
  count: number;
  tools: string[];
  lastOccurred: string;
}

export interface Suggestion {
  type: "performance" | "quality" | "reliability";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  action: string;
}

export interface PerformanceData {
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
