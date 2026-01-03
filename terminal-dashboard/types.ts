/**
 * TypeScript type definitions for the terminal dashboard
 */

export interface AgentData {
  agent_id: string;
  session_id?: string;
  assigned_role?: string;
  status: string;
  current_task?: string;
  last_heartbeat: string;
}

export interface TaskData {
  id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  assigned_to?: string;
  claimed_at?: string;
  completed_at?: string;
  notes?: string[];
  tags?: string[];
  depends_on?: string[];
  estimated_hours?: number;
  complexity?: string;
}

export interface MessageData {
  message_id?: string;
  from_agent?: string;
  from?: string;
  type: string;
  timestamp: string;
  payload: any;
  to_agent?: string;
  read_by?: string[];
}

export interface UserMessageData {
  id: string;
  from: string;
  message: string;
  timestamp: string;
  priority: string;
  read: boolean;
  read_by?: string;
}

export interface QualityAssessment {
  task_id: string;
  assessed_at: string;
  assessed_by?: string;
  scores?: {
    completeness: number;
    code_quality: number;
    documentation: number;
    efficiency: number;
    impact: number;
  };
  overall_score: number;
  lessons_learned?: string;
  notes?: string;
}

export interface QualityData {
  assessments: QualityAssessment[];
  summary: {
    average_score?: number;
    total_assessed?: number;
    trend?: string;
    last_updated?: string;
  };
}

export interface StateData {
  session_count: number;
  status: string;
  active_tasks?: string[];
  total_tokens_used?: number;
  recent_achievements?: string[];
  last_session?: string;
  current_session_id?: string;
}

export interface SessionEvent {
  timestamp: string;
  event: string;
  session_id: string;
  data?: Record<string, unknown>;
  // Optional derived fields used by the dashboard
  description?: string;
  duration_ms?: number;
  tool_calls?: number;
  file?: string;
}

export interface OpenCodeSession {
  id: string;
  title?: string;
  started_at?: string;
  status?: string;
  messages?: number;
  parent_id?: string;
  tokens?: SessionTokens;
}

export interface SessionTokens {
  input: number;
  output: number;
  reasoning: number;
  cache_read: number;
  cache_write: number;
  total: number;
}

export interface TokenTrend {
  session_id: string;
  tokens: SessionTokens;
  started_at?: string;
}

export interface ViewMode {
  name: string;
  key: string;
  description: string;
}

export const VIEW_MODES: ViewMode[] = [
  { name: "dashboard", key: "1", description: "System Overview" },
  { name: "agents", key: "2", description: "Active Agents" },
  { name: "tasks", key: "3", description: "Task Management" },
  { name: "messages", key: "4", description: "Agent Messages" },
  { name: "user", key: "5", description: "User Messages" },
  { name: "conversations", key: "6", description: "OpenCode Sessions" },
  { name: "tokens", key: "7", description: "Token Usage" },
  { name: "quality", key: "8", description: "Quality Metrics" },
  { name: "logs", key: "9", description: "Real-time Logs" },
];
