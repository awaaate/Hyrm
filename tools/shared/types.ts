/**
 * Shared TypeScript Types and Interfaces
 * 
 * Centralized type definitions used across all tools
 * in the multi-agent system.
 */

// ============================================================================
// Task Types
// ============================================================================

/**
 * Task priority levels in order of urgency.
 */
export type TaskPriority = "critical" | "high" | "medium" | "low";

/**
 * Task status values.
 */
export type TaskStatus = "pending" | "in_progress" | "blocked" | "completed" | "cancelled";

/**
 * Task complexity levels for estimation.
 */
export type TaskComplexity = "trivial" | "simple" | "moderate" | "complex" | "epic";

/**
 * Persistent task definition.
 */
export interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  complexity?: TaskComplexity;
  created_at: string;
  updated_at: string;
  created_by: string;
  assigned_to?: string;
  completed_at?: string;
  dependencies?: string[];
  tags?: string[];
  parent_task?: string;
  subtasks?: string[];
  notes?: string[];
  quality_score?: number;
  quality_notes?: string;
  estimated_hours?: number;
}

/**
 * Task store containing all tasks and metadata.
 */
export interface TaskStore {
  version: string;
  tasks: Task[];
  completed_count: number;
  last_updated: string;
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Agent status values.
 */
export type AgentStatus = "active" | "idle" | "working" | "blocked";

/**
 * Registered agent in the system.
 */
export interface Agent {
  agent_id: string;
  session_id: string;
  started_at: string;
  last_heartbeat: string;
  status: AgentStatus;
  assigned_role: string;
  current_task?: string;
  handoff_enabled: boolean;
  pid?: number;
}

/**
 * Agent registry containing all registered agents.
 */
export interface AgentRegistry {
  agents: Agent[];
  last_updated: string;
}

/**
 * Agent health status for monitoring.
 */
export type HealthStatus = "healthy" | "warning" | "stale" | "dead";

/**
 * Agent health check result.
 */
export interface AgentHealthCheck {
  agent_id: string;
  status: HealthStatus;
  last_heartbeat: string;
  age_ms: number;
  role: string;
  current_task?: string;
  issues: string[];
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Agent-to-agent message types.
 */
export type MessageType =
  | "broadcast"
  | "direct"
  | "task_claim"
  | "task_complete"
  | "task_available"
  | "request_help"
  | "heartbeat"
  | "file_lock";

/**
 * Message in the message bus.
 */
export interface Message {
  id: string;
  timestamp: string;
  from_agent: string;
  to_agent?: string;
  type: MessageType;
  payload: Record<string, unknown>;
  read?: boolean;
}

/**
 * User message to agents.
 * Note: Actual JSONL structure uses `message` field, not `content`
 */
export interface UserMessage {
  id: string;
  timestamp: string;
  message: string;
  read: boolean;
  priority?: "critical" | "high" | "normal" | "low";
  from?: string;
  tags?: string[];
  processed_by?: string;
  read_at?: string;
  read_by?: string;
  response?: string;
}

// ============================================================================
// Quality Types
// ============================================================================

/**
 * Quality assessment for a completed task.
 */
export interface QualityAssessment {
  task_id: string;
  assessed_at: string;
  assessed_by: string;
  scores: {
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

/**
 * Quality assessment store.
 */
export interface QualityStore {
  assessments: QualityAssessment[];
  summary: {
    average_score: number;
    trend: "improving" | "stable" | "declining";
    total_assessed: number;
    last_updated: string;
  };
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * Session lifecycle event types.
 */
export type SessionEventType =
  | "session.created"
  | "session.idle"
  | "session.error"
  | "session.end";

/**
 * Session lifecycle event.
 */
export interface SessionEvent {
  timestamp: string;
  event: SessionEventType;
  session_id: string;
  data?: Record<string, unknown>;
}

/**
 * Session knowledge extracted from a session.
 */
export interface SessionKnowledge {
  session_id: string;
  timestamp: number;
  messages: number;
  decisions: string[];
  discoveries: string[];
  code_created: string[];
  problems_solved: string[];
  key_insights: string[];
  techniques: string[];
  solutions: string[];
}

// ============================================================================
// Tool Timing Types
// ============================================================================

/**
 * Tool execution timing entry.
 * Matches the actual structure in tool-timing.jsonl
 */
export interface ToolTiming {
  timestamp: string;
  tool: string;
  duration_ms: number;
  success: boolean;
  error?: string;
  session_id?: string;
  agent_id?: string;
  category?: string;
  // Extended fields from tool-timing.jsonl
  call_id?: string;
  start_time?: number;
  end_time?: number;
  input_size?: number;
  output_size?: number;
}

/**
 * Tool timing summary for analytics.
 */
export interface ToolTimingSummary {
  tool: string;
  count: number;
  avg_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
  success_rate: number;
  error_rate: number;
}

// ============================================================================
// State Types
// ============================================================================

/**
 * System state stored in state.json.
 */
export interface SystemState {
  session_count: number;
  status: string;
  current_session?: string;
  last_updated: string;
  achievements: Achievement[];
  active_tasks: string[];
  total_tokens: number;
}

/**
 * Achievement record.
 */
export interface Achievement {
  session: number;
  description: string;
  score?: number;
  timestamp?: string;
}

// ============================================================================
// Checkpoint Types
// ============================================================================

/**
 * File modification record for checkpoints.
 */
export interface FileModification {
  path: string;
  action: "created" | "modified" | "deleted";
}

/**
 * Checkpoint for work recovery.
 */
export interface Checkpoint {
  session_id: string;
  task_id?: string;
  task_title?: string;
  progress_description: string;
  progress_percentage?: number;
  files_modified: FileModification[];
  next_steps: string[];
  blockers?: string[];
  can_resume: boolean;
  resume_instructions?: string;
  timestamp: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * System message configuration.
 */
export interface SystemMessageConfig {
  enabled: boolean;
  components: {
    memory_context: boolean;
    agent_context: boolean;
    task_context: boolean;
    custom_prefix: string;
  };
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Generic key-value record.
 */
export type JsonRecord = Record<string, unknown>;

/**
 * Result type for operations that can fail.
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Async result type.
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;
