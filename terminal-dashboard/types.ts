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
  completeness: number;
  code_quality: number;
  documentation: number;
  efficiency: number;
  impact: number;
  overall: number;
  lessons_learned?: string;
}

export interface QualityData {
  assessments: QualityAssessment[];
  summary: {
    average_score?: number;
    count?: number;
    trend?: string;
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
  type: string;
  timestamp: string;
  session_id?: string;
  parent_session?: string;
  child_session?: string;
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
  { name: "quality", key: "7", description: "Quality Metrics" },
  { name: "logs", key: "8", description: "Real-time Logs" },
];
