/**
 * Shared Data Fetchers
 * 
 * Centralized functions for reading system data.
 * Eliminates code duplication across tools.
 * 
 * All tools should import these functions instead of
 * implementing their own data reading logic.
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { readJson, readJsonl } from "./json-utils";
import { PATHS } from "./paths";
import type {
  Agent,
  AgentRegistry,
  Task,
  TaskStore,
  Message,
  UserMessage,
  QualityStore,
  SystemState,
  SessionEvent,
  LeaderState,
  LeaderInfo,
  LeaderHealthStatus,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Default staleness thresholds in milliseconds.
 */
export const STALENESS = {
  /** Agent considered active if heartbeat within this time */
  AGENT_ACTIVE: 2 * 60 * 1000, // 2 minutes
  /** Agent considered stale if no heartbeat for this time */
  AGENT_STALE: 5 * 60 * 1000, // 5 minutes
  /** Agent considered dead if no heartbeat for this time */
  AGENT_DEAD: 10 * 60 * 1000, // 10 minutes
  /** Message considered recent if within this time */
  MESSAGE_RECENT: 24 * 60 * 60 * 1000, // 24 hours
} as const;

// ============================================================================
// Agent Functions
// ============================================================================

/**
 * Get all registered agents from the registry.
 * 
 * @returns Array of all agents (active and inactive)
 */
export function getAllAgents(): Agent[] {
  const registry = readJson<AgentRegistry>(PATHS.agentRegistry, { 
    agents: [], 
    last_updated: "" 
  });
  return registry.agents || [];
}

/**
 * Get only active agents (with recent heartbeat).
 * 
 * @param maxAgeMs - Maximum age of heartbeat in ms (default: 2 minutes)
 * @returns Array of active agents
 */
export function getActiveAgents(maxAgeMs: number = STALENESS.AGENT_ACTIVE): Agent[] {
  const agents = getAllAgents();
  const cutoff = Date.now() - maxAgeMs;
  
  return agents.filter((agent) => {
    const lastHB = new Date(agent.last_heartbeat).getTime();
    return lastHB > cutoff;
  });
}

/**
 * Get agents by status.
 * 
 * @param status - Agent status to filter by
 * @returns Array of agents with matching status
 */
export function getAgentsByStatus(status: Agent["status"]): Agent[] {
  return getActiveAgents().filter((agent) => agent.status === status);
}

/**
 * Get agents by role.
 * 
 * @param role - Role to filter by
 * @returns Array of agents with matching role
 */
export function getAgentsByRole(role: string): Agent[] {
  return getActiveAgents().filter((agent) => agent.assigned_role === role);
}

/**
 * Get a specific agent by ID.
 * 
 * @param agentId - Agent identifier
 * @returns Agent or undefined if not found
 */
export function getAgentById(agentId: string): Agent | undefined {
  return getAllAgents().find((agent) => agent.agent_id === agentId);
}

/**
 * Check if an agent is alive (has recent heartbeat).
 * 
 * @param agentId - Agent identifier
 * @param maxAgeMs - Maximum age of heartbeat in ms
 * @returns True if agent has recent heartbeat
 */
export function isAgentAlive(agentId: string, maxAgeMs: number = STALENESS.AGENT_ACTIVE): boolean {
  const agent = getAgentById(agentId);
  if (!agent) return false;
  
  const lastHB = new Date(agent.last_heartbeat).getTime();
  return Date.now() - lastHB < maxAgeMs;
}

// ============================================================================
// Leader Election Functions
// ============================================================================

/**
 * Default leader state when orchestrator-state.json is missing.
 */
const DEFAULT_LEADER_STATE: LeaderState = {
  leader_id: null,
  leader_epoch: 0,
  last_heartbeat: "",
  ttl_ms: 180000, // 3 minutes default TTL
};

/**
 * Get raw leader state from orchestrator-state.json.
 * 
 * @returns LeaderState object or default if file missing
 */
export function getLeaderState(): LeaderState {
  return readJson<LeaderState>(PATHS.orchestratorState, DEFAULT_LEADER_STATE);
}

/**
 * Get leader info with health status for display.
 * 
 * @returns LeaderInfo with health status and age
 */
export function getLeaderInfo(): LeaderInfo {
  const state = getLeaderState();
  const now = Date.now();
  
  let age_ms = 0;
  let health: LeaderHealthStatus = "unknown";
  
  if (state.leader_id && state.last_heartbeat) {
    const heartbeatTime = new Date(state.last_heartbeat).getTime();
    age_ms = now - heartbeatTime;
    
    // Fresh if heartbeat within TTL, stale if beyond
    if (age_ms < state.ttl_ms) {
      health = "fresh";
    } else {
      health = "stale";
    }
  }
  
  return {
    leader_id: state.leader_id,
    leader_epoch: state.leader_epoch,
    last_heartbeat: state.last_heartbeat,
    ttl_ms: state.ttl_ms,
    health,
    age_ms,
  };
}

/**
 * Check if there is an active leader.
 * 
 * @returns True if leader exists and heartbeat is fresh
 */
export function hasActiveLeader(): boolean {
  const info = getLeaderInfo();
  return info.health === "fresh";
}

/**
 * Check if a specific agent is the leader.
 * 
 * @param agentId - Agent identifier to check
 * @returns True if this agent is the current leader
 */
export function isLeader(agentId: string): boolean {
  const info = getLeaderInfo();
  return info.leader_id === agentId && info.health === "fresh";
}

// ============================================================================
// Task Functions
// ============================================================================

/**
 * Get all tasks from the task store.
 * 
 * @returns Array of all tasks
 */
export function getAllTasks(): Task[] {
  const store = readJson<TaskStore>(PATHS.tasks, { 
    version: "1.0",
    tasks: [], 
    completed_count: 0, 
    last_updated: "" 
  });
  return store.tasks || [];
}

/**
 * Get tasks filtered by status.
 * 
 * @param status - Task status to filter by
 * @returns Array of tasks with matching status
 */
export function getTasksByStatus(status: Task["status"]): Task[] {
  return getAllTasks().filter((task) => task.status === status);
}

/**
 * Get pending tasks sorted by priority.
 * 
 * @returns Array of pending tasks sorted by priority (critical first)
 */
export function getPendingTasks(): Task[] {
  const priorityOrder: Record<string, number> = { 
    critical: 0, 
    high: 1, 
    medium: 2, 
    low: 3 
  };
  
  return getTasksByStatus("pending").sort(
    (a, b) => (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4)
  );
}

/**
 * Get a specific task by ID.
 * 
 * @param taskId - Task identifier
 * @returns Task or undefined if not found
 */
export function getTaskById(taskId: string): Task | undefined {
  return getAllTasks().find((task) => task.id === taskId);
}

/**
 * Get tasks assigned to a specific agent.
 * 
 * @param agentId - Agent identifier
 * @returns Array of tasks assigned to the agent
 */
export function getTasksByAgent(agentId: string): Task[] {
  return getAllTasks().filter((task) => task.assigned_to === agentId);
}

/**
 * Get task statistics.
 * 
 * @returns Object with task counts by status
 */
export function getTaskStats(): Record<Task["status"], number> {
  const tasks = getAllTasks();
  return {
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    cancelled: tasks.filter((t) => t.status === "cancelled").length,
  };
}

// ============================================================================
// Message Functions
// ============================================================================

/**
 * Get messages from the message bus.
 * 
 * @param limit - Maximum number of messages to return
 * @param excludeHeartbeats - Whether to exclude heartbeat messages
 * @returns Array of messages (newest first)
 */
export function getMessages(
  limit: number = 50, 
  excludeHeartbeats: boolean = true
): Message[] {
  const messages = readJsonl<Message>(PATHS.messageBus);
  
  let filtered = excludeHeartbeats
    ? messages.filter((m) => m.type !== "heartbeat")
    : messages;
  
  return filtered.slice(-limit).reverse();
}

/**
 * Get messages from a specific agent.
 * 
 * @param agentId - Agent identifier
 * @param limit - Maximum number of messages to return
 * @returns Array of messages from the agent
 */
export function getMessagesByAgent(agentId: string, limit: number = 50): Message[] {
  return getMessages(limit * 2, true)
    .filter((m) => m.from_agent === agentId)
    .slice(0, limit);
}

/**
 * Get messages of a specific type.
 * 
 * @param type - Message type to filter by
 * @param limit - Maximum number of messages to return
 * @returns Array of messages of the specified type
 */
export function getMessagesByType(type: Message["type"], limit: number = 50): Message[] {
  return getMessages(limit * 2, false)
    .filter((m) => m.type === type)
    .slice(0, limit);
}

/**
 * Get user messages (from user-messages.jsonl).
 * 
 * @param limit - Maximum number of messages to return
 * @param unreadOnly - Whether to return only unread messages
 * @returns Array of user messages
 */
export function getUserMessages(limit?: number, unreadOnly: boolean = false): UserMessage[] {
  let messages = readJsonl<UserMessage>(PATHS.userMessages);
  
  if (unreadOnly) {
    messages = messages.filter((m) => !m.read);
  }
  
  if (limit) {
    messages = messages.slice(-limit);
  }
  
  return messages;
}

// ============================================================================
// Quality Functions
// ============================================================================

/**
 * Get quality assessments store.
 * 
 * @returns Quality store with assessments and summary
 */
export function getQualityStore(): QualityStore {
  // Read the raw file to handle both old and new formats
  const raw = readJson<{
    assessments?: QualityStore["assessments"];
    summary?: QualityStore["summary"];
    aggregate_stats?: {
      total_assessed?: number;
      avg_overall_score?: number;
    };
    last_updated?: string;
  }>(PATHS.qualityAssessments, { assessments: [] });
  
  // Normalize: prefer summary if present, otherwise convert aggregate_stats
  const summary: QualityStore["summary"] = raw.summary || {
    average_score: raw.aggregate_stats?.avg_overall_score ?? 0,
    trend: "stable",
    total_assessed: raw.aggregate_stats?.total_assessed ?? 0,
    last_updated: raw.last_updated || "",
  };
  
  return {
    assessments: raw.assessments || [],
    summary,
  };
}

/**
 * Get average quality score.
 * 
 * @returns Average quality score (0-10)
 */
export function getAverageQualityScore(): number {
  const store = getQualityStore();
  return store.summary?.average_score ?? 0;
}

/**
 * Get quality assessment for a specific task.
 * 
 * @param taskId - Task identifier
 * @returns Quality assessment or undefined
 */
export function getQualityForTask(taskId: string) {
  const store = getQualityStore();
  return store.assessments.find((a) => a.task_id === taskId);
}

// ============================================================================
// State Functions
// ============================================================================

/**
 * Get system state.
 * 
 * @returns System state object
 */
export function getSystemState(): SystemState {
  return readJson<SystemState>(PATHS.state, {
    session_count: 0,
    status: "unknown",
    last_updated: "",
    achievements: [],
    active_tasks: [],
    total_tokens: 0,
  });
}

/**
 * Get session count.
 * 
 * @returns Number of sessions completed
 */
export function getSessionCount(): number {
  return getSystemState().session_count;
}

/**
 * Get system status.
 * 
 * @returns Current system status string
 */
export function getSystemStatus(): string {
  return getSystemState().status;
}

// ============================================================================
// Session Functions
// ============================================================================

/**
 * Get session events from sessions.jsonl.
 * 
 * @param limit - Maximum number of events to return
 * @returns Array of session events
 */
export function getSessionEvents(limit?: number): SessionEvent[] {
  const events = readJsonl<SessionEvent>(PATHS.sessions);
  return limit ? events.slice(-limit) : events;
}

/**
 * Get events for a specific session.
 * 
 * @param sessionId - Session identifier
 * @returns Array of events for that session
 */
export function getEventsForSession(sessionId: string): SessionEvent[] {
  return getSessionEvents().filter((e) => e.session_id === sessionId);
}

// ============================================================================
// Aggregated Queries
// ============================================================================

/**
 * Get a complete system overview.
 * Useful for dashboards and status displays.
 * 
 * @returns Object with all key system metrics
 */
export function getSystemOverview() {
  const agents = getActiveAgents();
  const tasks = getAllTasks();
  const state = getSystemState();
  const quality = getQualityStore();
  
  return {
    agents: {
      total: agents.length,
      working: agents.filter((a) => a.status === "working").length,
      idle: agents.filter((a) => a.status === "idle" || a.status === "active").length,
      blocked: agents.filter((a) => a.status === "blocked").length,
    },
    tasks: {
      total: tasks.length,
      pending: tasks.filter((t) => t.status === "pending").length,
      in_progress: tasks.filter((t) => t.status === "in_progress").length,
      completed: tasks.filter((t) => t.status === "completed").length,
    },
    quality: {
      average: quality.summary?.average_score ?? 0,
      trend: quality.summary?.trend ?? "stable",
      total_assessed: quality.summary?.total_assessed ?? 0,
    },
    sessions: {
      count: state.session_count,
      current: state.current_session,
      status: state.status,
    },
  };
}

// ============================================================================
// OpenCode Native Storage Functions
// ============================================================================

/**
 * OpenCode storage paths.
 * Located at ~/.local/share/opencode/storage/
 */
export const OPENCODE_STORAGE = join(homedir(), ".local", "share", "opencode", "storage");

export const OPENCODE_PATHS = {
  sessions: join(OPENCODE_STORAGE, "session"),
  messages: join(OPENCODE_STORAGE, "message"),
  parts: join(OPENCODE_STORAGE, "part"),
  projects: join(OPENCODE_STORAGE, "project"),
} as const;

/**
 * OpenCode session type.
 */
export interface OpenCodeSession {
  id: string;
  version: string;
  projectID: string;
  directory: string;
  title: string;
  parentID?: string;
  time: {
    created: number;
    updated: number;
    compacting?: number;
    archived?: number;
  };
  summary?: {
    additions?: number;
    deletions?: number;
    files?: number;
  };
  share?: { url: string };
}

/**
 * OpenCode message type.
 */
export interface OpenCodeMessage {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  time: { created: number };
  summary?: { title?: string; diffs?: any[] };
}

/**
 * OpenCode token usage info (from step-finish parts).
 */
export interface OpenCodeTokens {
  input: number;
  output: number;
  reasoning: number;
  cache: {
    read: number;
    write: number;
  };
}

/**
 * OpenCode part type (text, tool call, etc).
 */
export interface OpenCodePart {
  id: string;
  messageID: string;
  sessionID: string;
  type: string;
  text?: string;
  tool?: string;
  toolName?: string;
  callID?: string;
  state?: { status: string; input?: any; output?: any };
  args?: any;
  result?: any;
  time?: { created?: number; completed?: number };
  // Token info (present on step-finish parts)
  tokens?: OpenCodeTokens;
  cost?: number;
  reason?: string;
}

/**
 * Tool call info extracted from parts.
 */
export interface ToolCallInfo {
  tool: string;
  messageId: string;
  callId?: string;
  input: any;
  output: any;
  status: string;
  duration?: number;
  timestamp?: number;
}

/**
 * Read JSON file from OpenCode storage (returns null on missing/error).
 */
function readOpenCodeJson<T>(path: string): T | null {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  } catch {}
  return null;
}

/**
 * Check if OpenCode storage exists.
 */
export function isOpenCodeStorageAvailable(): boolean {
  return existsSync(OPENCODE_STORAGE);
}

/**
 * Get all project IDs from OpenCode.
 */
export function getOpenCodeProjects(): string[] {
  if (!existsSync(OPENCODE_PATHS.projects)) return [];
  return readdirSync(OPENCODE_PATHS.projects)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

/**
 * Get sessions for a specific project.
 */
export function getOpenCodeSessionsForProject(projectId: string): OpenCodeSession[] {
  const projectDir = join(OPENCODE_PATHS.sessions, projectId);
  if (!existsSync(projectDir)) return [];

  return readdirSync(projectDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readOpenCodeJson<OpenCodeSession>(join(projectDir, f)))
    .filter((s): s is OpenCodeSession => s !== null)
    .sort((a, b) => b.time.updated - a.time.updated);
}

/**
 * Get all OpenCode sessions across all projects.
 */
export function getAllOpenCodeSessions(limit?: number): OpenCodeSession[] {
  const projects = getOpenCodeProjects();
  const allSessions: OpenCodeSession[] = [];

  for (const projectId of projects) {
    allSessions.push(...getOpenCodeSessionsForProject(projectId));
  }

  // Also check direct directories under sessions/
  if (existsSync(OPENCODE_PATHS.sessions)) {
    try {
      const dirs = readdirSync(OPENCODE_PATHS.sessions);
      for (const dir of dirs) {
        const dirPath = join(OPENCODE_PATHS.sessions, dir);
        try {
          const stat = require("fs").statSync(dirPath);
          if (stat.isDirectory()) {
            const sessions = getOpenCodeSessionsForProject(dir);
            for (const session of sessions) {
              if (!allSessions.find((s) => s.id === session.id)) {
                allSessions.push(session);
              }
            }
          }
        } catch {}
      }
    } catch {}
  }

  const sorted = allSessions.sort((a, b) => b.time.updated - a.time.updated);
  return limit ? sorted.slice(0, limit) : sorted;
}

/**
 * Get a specific OpenCode session by ID.
 */
export function getOpenCodeSessionById(sessionId: string): OpenCodeSession | undefined {
  return getAllOpenCodeSessions().find((s) => s.id === sessionId);
}

/**
 * Get messages for an OpenCode session.
 */
export function getOpenCodeMessagesForSession(sessionId: string): OpenCodeMessage[] {
  const messageDir = join(OPENCODE_PATHS.messages, sessionId);
  if (!existsSync(messageDir)) return [];

  return readdirSync(messageDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readOpenCodeJson<OpenCodeMessage>(join(messageDir, f)))
    .filter((m): m is OpenCodeMessage => m !== null)
    .sort((a, b) => a.time.created - b.time.created);
}

/**
 * Get parts for an OpenCode message.
 */
export function getOpenCodePartsForMessage(messageId: string): OpenCodePart[] {
  const partDir = join(OPENCODE_PATHS.parts, messageId);
  if (!existsSync(partDir)) return [];

  return readdirSync(partDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readOpenCodeJson<OpenCodePart>(join(partDir, f)))
    .filter((p): p is OpenCodePart => p !== null)
    .sort((a, b) => (a.id || "").localeCompare(b.id || ""));
}

/**
 * Get tool calls for an OpenCode session.
 */
export function getOpenCodeToolCalls(sessionId: string): ToolCallInfo[] {
  const messages = getOpenCodeMessagesForSession(sessionId);
  const toolCalls: ToolCallInfo[] = [];
  const pendingCalls: Map<string, ToolCallInfo> = new Map();

  for (const msg of messages) {
    const parts = getOpenCodePartsForMessage(msg.id);
    
    for (const part of parts) {
      const toolName = part.tool || part.toolName;
      const callId = part.callID || part.id;
      
      if ((part.type === "tool-invocation" || part.type === "tool") && toolName) {
        const toolCall: ToolCallInfo = {
          tool: toolName,
          messageId: msg.id,
          callId,
          input: part.args || part.state?.input || {},
          output: null,
          status: part.state?.status || "running",
          timestamp: part.time?.created || msg.time.created,
        };
        
        if (callId) pendingCalls.set(callId, toolCall);
        toolCalls.push(toolCall);
      }
      
      if (part.type === "tool-result" && callId) {
        const pending = pendingCalls.get(callId);
        if (pending) {
          pending.output = part.result || part.state?.output;
          pending.status = "completed";
          if (part.time?.created && pending.timestamp) {
            pending.duration = part.time.created - pending.timestamp;
          }
        }
      }
    }
  }

  return toolCalls;
}

/**
 * Session statistics including token usage.
 */
export interface OpenCodeSessionStatsResult {
  toolCount: number;
  duration: number;
  messageCount: number;
  topics: string[];
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
}

/**
 * Get session statistics (tool count, duration, topics, tokens).
 */
export function getOpenCodeSessionStats(sessionId: string): OpenCodeSessionStatsResult {
  const messages = getOpenCodeMessagesForSession(sessionId);
  let toolCount = 0;
  const topics: string[] = [];
  let firstTime = Infinity;
  let lastTime = 0;
  
  // Token tracking
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let totalCost = 0;

  for (const msg of messages) {
    if (msg.time.created < firstTime) firstTime = msg.time.created;
    if (msg.time.created > lastTime) lastTime = msg.time.created;
    
    if (msg.summary?.title) topics.push(msg.summary.title);
    
    const parts = getOpenCodePartsForMessage(msg.id);
    for (const part of parts) {
      const toolName = part.tool || part.toolName;
      if ((part.type === "tool-invocation" || part.type === "tool") && toolName) {
        toolCount++;
      }
      
      // Collect token info from step-finish parts
      if (part.type === "step-finish" && part.tokens) {
        inputTokens += part.tokens.input || 0;
        outputTokens += part.tokens.output || 0;
        reasoningTokens += part.tokens.reasoning || 0;
        cacheRead += part.tokens.cache?.read || 0;
        cacheWrite += part.tokens.cache?.write || 0;
        totalCost += part.cost || 0;
      }
    }
  }

  return {
    toolCount,
    duration: lastTime > firstTime ? lastTime - firstTime : 0,
    messageCount: messages.length,
    topics: [...new Set(topics)].slice(0, 5),
    tokens: {
      input: inputTokens,
      output: outputTokens,
      reasoning: reasoningTokens,
      cacheRead,
      cacheWrite,
      total: inputTokens + outputTokens + reasoningTokens,
    },
    cost: totalCost,
  };
}

/**
 * Get OpenCode tool usage statistics across sessions.
 */
export function getOpenCodeToolUsageStats(limit: number = 50): Record<string, number> {
  const sessions = getAllOpenCodeSessions(limit);
  const toolUsage: Record<string, number> = {};

  for (const session of sessions) {
    const messages = getOpenCodeMessagesForSession(session.id);
    for (const msg of messages) {
      const parts = getOpenCodePartsForMessage(msg.id);
      for (const part of parts) {
        const toolName = part.tool || part.toolName;
        if ((part.type === "tool-invocation" || part.type === "tool") && toolName) {
          toolUsage[toolName] = (toolUsage[toolName] || 0) + 1;
        }
      }
    }
  }

  return toolUsage;
}

/**
 * Aggregate token statistics across multiple sessions.
 */
export interface AggregateTokenStats {
  totalSessions: number;
  sessionsWithTokens: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
  cost: number;
  averagePerSession: {
    input: number;
    output: number;
    total: number;
  };
}

/**
 * Get aggregate token usage across sessions.
 */
export function getOpenCodeAggregateTokenStats(limit: number = 100): AggregateTokenStats {
  const sessions = getAllOpenCodeSessions(limit);
  
  let totalInput = 0;
  let totalOutput = 0;
  let totalReasoning = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalCost = 0;
  let sessionsWithTokens = 0;
  
  for (const session of sessions) {
    const stats = getOpenCodeSessionStats(session.id);
    if (stats.tokens.total > 0) {
      sessionsWithTokens++;
      totalInput += stats.tokens.input;
      totalOutput += stats.tokens.output;
      totalReasoning += stats.tokens.reasoning;
      totalCacheRead += stats.tokens.cacheRead;
      totalCacheWrite += stats.tokens.cacheWrite;
      totalCost += stats.cost;
    }
  }
  
  const total = totalInput + totalOutput + totalReasoning;
  
  return {
    totalSessions: sessions.length,
    sessionsWithTokens,
    tokens: {
      input: totalInput,
      output: totalOutput,
      reasoning: totalReasoning,
      cacheRead: totalCacheRead,
      cacheWrite: totalCacheWrite,
      total,
    },
    cost: totalCost,
    averagePerSession: {
      input: sessionsWithTokens > 0 ? Math.round(totalInput / sessionsWithTokens) : 0,
      output: sessionsWithTokens > 0 ? Math.round(totalOutput / sessionsWithTokens) : 0,
      total: sessionsWithTokens > 0 ? Math.round(total / sessionsWithTokens) : 0,
    },
  };
}

/**
 * Search across OpenCode sessions for a query.
 */
export function searchOpenCodeSessions(
  query: string,
  limit: number = 20
): Array<{
  sessionId: string;
  sessionTitle: string;
  type: "message" | "tool" | "title";
  content: string;
  timestamp: number;
}> {
  const sessions = getAllOpenCodeSessions(100);
  const queryLower = query.toLowerCase();
  const results: Array<{
    sessionId: string;
    sessionTitle: string;
    type: "message" | "tool" | "title";
    content: string;
    timestamp: number;
  }> = [];
  
  for (const session of sessions) {
    if (session.title.toLowerCase().includes(queryLower)) {
      results.push({
        sessionId: session.id,
        sessionTitle: session.title,
        type: "title",
        content: session.title,
        timestamp: session.time.updated,
      });
    }
    
    if (results.length >= limit * 2) break;
    
    const messages = getOpenCodeMessagesForSession(session.id);
    for (const msg of messages) {
      const parts = getOpenCodePartsForMessage(msg.id);
      
      for (const part of parts) {
        const toolName = part.tool || part.toolName;
        
        if (part.type === "text" && part.text?.toLowerCase().includes(queryLower)) {
          results.push({
            sessionId: session.id,
            sessionTitle: session.title,
            type: "message",
            content: part.text.slice(0, 200),
            timestamp: msg.time.created,
          });
        }
        
        if (toolName?.toLowerCase().includes(queryLower)) {
          results.push({
            sessionId: session.id,
            sessionTitle: session.title,
            type: "tool",
            content: toolName,
            timestamp: msg.time.created,
          });
        }
      }
      
      if (results.length >= limit * 2) break;
    }
  }
  
  return results.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}
