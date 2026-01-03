/**
 * Data fetching utilities for the terminal dashboard
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  type AgentData,
  type TaskData,
  type MessageData,
  type UserMessageData,
  type QualityData,
  type StateData,
  type SessionEvent,
  type OpenCodeSession,
  type SessionTokens,
  type TokenTrend,
} from "./types";

// Paths - use __dirname to get the correct path relative to this file
const WORKSPACE_DIR = join(__dirname, "..");
const MEMORY_DIR = join(WORKSPACE_DIR, "memory");
// OpenCode stores sessions in ~/.local/share/opencode/storage/
const OPENCODE_STORAGE = join(process.env.HOME || "/root", ".local", "share", "opencode", "storage");

export const PATHS = {
  state: join(MEMORY_DIR, "state.json"),
  agentRegistry: join(MEMORY_DIR, "agent-registry.json"),
  tasks: join(MEMORY_DIR, "tasks.json"),
  messageBus: join(MEMORY_DIR, "message-bus.jsonl"),
  userMessages: join(MEMORY_DIR, "user-messages.jsonl"),
  qualityAssessments: join(MEMORY_DIR, "quality-assessments.json"),
  realtimeLog: join(MEMORY_DIR, "realtime.log"),
  sessions: join(MEMORY_DIR, "sessions.jsonl"),
  toolTiming: join(MEMORY_DIR, "tool-timing.jsonl"),
  knowledge: join(MEMORY_DIR, "knowledge-base.json"),
  // OpenCode session storage
  opencodeSessions: join(OPENCODE_STORAGE, "session"),
  opencodeMessages: join(OPENCODE_STORAGE, "message"),
  opencodeParts: join(OPENCODE_STORAGE, "part"),
};

// Helper functions
export function readJson<T>(path: string, defaultValue: T): T {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  } catch {}
  return defaultValue;
}

export function readJsonl<T>(path: string): T[] {
  try {
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      return content
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((item): item is T => item !== null);
    }
  } catch {}
  return [];
}

export function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;

  if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

export function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 1) + "...";
}

// Data fetchers
export function getState(): StateData {
  return readJson<StateData>(PATHS.state, {
    session_count: 0,
    status: "unknown",
  });
}

export function getActiveAgents(): AgentData[] {
  const registry = readJson<{ agents: AgentData[] }>(PATHS.agentRegistry, {
    agents: [],
  });
  const twoMinutesAgo = Date.now() - 2 * 60 * 1000;

  return (registry.agents || []).filter((agent) => {
    const lastHB = new Date(agent.last_heartbeat).getTime();
    return lastHB > twoMinutesAgo;
  });
}

export function getAllAgents(): AgentData[] {
  const registry = readJson<{ agents: AgentData[] }>(PATHS.agentRegistry, {
    agents: [],
  });
  return registry.agents || [];
}

export function getTasks(): TaskData[] {
  const taskStore = readJson<{ tasks: TaskData[] }>(PATHS.tasks, { tasks: [] });
  return taskStore.tasks || [];
}

export function getTasksByStatus(status: string): TaskData[] {
  const tasks = getTasks();
  if (status === "all") return tasks;
  return tasks.filter((t) => t.status === status);
}

export function getMessages(
  limit: number = 50,
  excludeHeartbeats: boolean = true
): MessageData[] {
  const messages = readJsonl<MessageData>(PATHS.messageBus);
  let filtered = excludeHeartbeats
    ? messages.filter((m) => m.type !== "heartbeat")
    : messages;
  return filtered.slice(-limit).reverse();
}

export function getUserMessages(): UserMessageData[] {
  return readJsonl<UserMessageData>(PATHS.userMessages);
}

export function getUnreadUserMessages(): UserMessageData[] {
  return getUserMessages().filter((m) => !m.read);
}

export function getQuality(): QualityData {
  // Read the raw file to handle both old and new formats
  const raw = readJson<{
    assessments?: QualityData["assessments"];
    summary?: QualityData["summary"];
    aggregate_stats?: {
      total_assessed?: number;
      avg_overall_score?: number;
    };
    last_updated?: string;
  }>(PATHS.qualityAssessments, { assessments: [] });
  
  // Normalize: prefer summary if present, otherwise convert aggregate_stats
  const summary: QualityData["summary"] = raw.summary || {
    average_score: raw.aggregate_stats?.avg_overall_score,
    count: raw.aggregate_stats?.total_assessed,
    trend: "stable",
  };
  
  return {
    assessments: raw.assessments || [],
    summary,
  };
}

export function getRecentLogs(limit: number = 50): any[] {
  try {
    if (existsSync(PATHS.realtimeLog)) {
      const content = readFileSync(PATHS.realtimeLog, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      return lines
        .slice(-limit)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return { message: line, level: "INFO", timestamp: new Date().toISOString() };
          }
        })
        .reverse();
    }
  } catch {}
  return [];
}

export function getSessionEvents(limit: number = 100): SessionEvent[] {
  return readJsonl<SessionEvent>(PATHS.sessions).slice(-limit).reverse();
}

export function getToolTiming(limit: number = 100): any[] {
  return readJsonl<any>(PATHS.toolTiming).slice(-limit).reverse();
}

// Token extraction from OpenCode messages (must be defined before getOpenCodeSessions)
function extractSessionTokens(sessionId: string): SessionTokens {
  const tokens: SessionTokens = {
    input: 0,
    output: 0,
    reasoning: 0,
    cache_read: 0,
    cache_write: 0,
    total: 0,
  };

  try {
    const messageDir = join(PATHS.opencodeMessages, sessionId);
    if (!existsSync(messageDir)) return tokens;

    const messageFiles = require("fs").readdirSync(messageDir);
    for (const msgFile of messageFiles) {
      if (!msgFile.endsWith(".json")) continue;
      
      try {
        const msgPath = join(messageDir, msgFile);
        const msgData = JSON.parse(readFileSync(msgPath, "utf-8"));
        
        if (msgData.tokens) {
          tokens.input += msgData.tokens.input || 0;
          tokens.output += msgData.tokens.output || 0;
          tokens.reasoning += msgData.tokens.reasoning || 0;
          if (msgData.tokens.cache) {
            tokens.cache_read += msgData.tokens.cache.read || 0;
            tokens.cache_write += msgData.tokens.cache.write || 0;
          }
        }
      } catch {}
    }
    
    tokens.total = tokens.input + tokens.output + tokens.reasoning;
  } catch {}

  return tokens;
}

export function getOpenCodeSessions(): OpenCodeSession[] {
  try {
    if (!existsSync(PATHS.opencodeSessions)) return [];
    
    const sessions: OpenCodeSession[] = [];
    const projectDirs = require("fs").readdirSync(PATHS.opencodeSessions);
    
    // Sessions are stored as: session/{projectId}/{sessionId}.json
    for (const projectDir of projectDirs) {
      const projectPath = join(PATHS.opencodeSessions, projectDir);
      try {
        const stat = require("fs").statSync(projectPath);
        if (!stat.isDirectory()) continue;
        
        // Read all session files in this project
        const sessionFiles = require("fs").readdirSync(projectPath);
        for (const sessionFile of sessionFiles) {
          if (!sessionFile.endsWith(".json")) continue;
          
          try {
            const sessionPath = join(projectPath, sessionFile);
            const sessionData = JSON.parse(readFileSync(sessionPath, "utf-8"));
            
            // Count messages for this session
            const messageDir = join(PATHS.opencodeMessages, sessionData.id || sessionFile.replace(".json", ""));
            let messageCount = 0;
            if (existsSync(messageDir)) {
              messageCount = require("fs").readdirSync(messageDir).filter((f: string) => f.endsWith(".json")).length;
            }
            
            const sessionId = sessionData.id || sessionFile.replace(".json", "");
            sessions.push({
              id: sessionId,
              title: sessionData.title || "Untitled",
              started_at: sessionData.time?.created ? new Date(sessionData.time.created).toISOString() : undefined,
              status: sessionData.time?.archived ? "archived" : "active",
              messages: messageCount,
              parent_id: sessionData.parentID,
              tokens: extractSessionTokens(sessionId),
            });
          } catch {}
        }
      } catch {}
    }
    
    // Sort by started_at descending
    return sessions
      .sort((a, b) => {
        if (!a.started_at || !b.started_at) return 0;
        return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
      })
      .slice(0, 50);
  } catch {}
  return [];
}

// Statistics
export function getStats() {
  const state = getState();
  const agents = getActiveAgents();
  const tasks = getTasks();
  const quality = getQuality();
  const userMsgs = getUserMessages();

  const pendingTasks = tasks.filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  ).length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const unreadMsgs = userMsgs.filter((m) => !m.read).length;

  return {
    session: state.session_count,
    status: state.status,
    agents: agents.length,
    pendingTasks,
    completedTasks,
    totalTasks: tasks.length,
    unreadMessages: unreadMsgs,
    avgQuality: quality.summary?.average_score || 0,
    qualityTrend: quality.summary?.trend || "stable",
  };
}

// Tool statistics
export function getToolStats(): { tool: string; count: number; avgDuration: number }[] {
  const timing = getToolTiming(1000);
  const stats: Record<string, { count: number; totalDuration: number }> = {};

  for (const entry of timing) {
    if (!stats[entry.tool]) {
      stats[entry.tool] = { count: 0, totalDuration: 0 };
    }
    stats[entry.tool].count++;
    stats[entry.tool].totalDuration += entry.duration_ms || 0;
  }

  return Object.entries(stats)
    .map(([tool, data]) => ({
      tool,
      count: data.count,
      avgDuration: Math.round(data.totalDuration / data.count),
    }))
    .sort((a, b) => b.count - a.count);
}

// Get task by ID
export function getTaskById(taskId: string): TaskData | undefined {
  const tasks = getTasks();
  return tasks.find((t) => t.id === taskId);
}

// Public wrapper for token extraction
export function getSessionTokens(sessionId: string): SessionTokens {
  return extractSessionTokens(sessionId);
}

// Get token trends across sessions
export function getTokenTrends(limit: number = 20): TokenTrend[] {
  const sessions = getOpenCodeSessions().slice(0, limit);
  return sessions.map(session => ({
    session_id: session.id,
    tokens: getSessionTokens(session.id),
    started_at: session.started_at,
  }));
}

// Get total token usage across all recent sessions
export function getTotalTokenUsage(): { today: SessionTokens; total: SessionTokens } {
  const sessions = getOpenCodeSessions();
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  
  const today: SessionTokens = {
    input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0, total: 0
  };
  const total: SessionTokens = {
    input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0, total: 0
  };

  for (const session of sessions) {
    const tokens = getSessionTokens(session.id);
    const startTime = session.started_at ? new Date(session.started_at).getTime() : 0;
    
    // Accumulate totals
    total.input += tokens.input;
    total.output += tokens.output;
    total.reasoning += tokens.reasoning;
    total.cache_read += tokens.cache_read;
    total.cache_write += tokens.cache_write;
    total.total += tokens.total;
    
    // Accumulate today's totals
    if (startTime > oneDayAgo) {
      today.input += tokens.input;
      today.output += tokens.output;
      today.reasoning += tokens.reasoning;
      today.cache_read += tokens.cache_read;
      today.cache_write += tokens.cache_write;
      today.total += tokens.total;
    }
  }

  return { today, total };
}

// Create a new task
export function createTask(title: string, priority: string = "medium"): TaskData | null {
  try {
    const taskStore = readJson<{ tasks: TaskData[] }>(PATHS.tasks, { tasks: [] });
    const newTask: TaskData = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      priority,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    taskStore.tasks.push(newTask);
    require("fs").writeFileSync(PATHS.tasks, JSON.stringify(taskStore, null, 2));
    return newTask;
  } catch {
    return null;
  }
}

// Cancel a task
export function cancelTask(taskId: string): boolean {
  try {
    const taskStore = readJson<{ tasks: TaskData[] }>(PATHS.tasks, { tasks: [] });
    const idx = taskStore.tasks.findIndex((t) => t.id === taskId);
    if (idx >= 0) {
      taskStore.tasks[idx].status = "cancelled";
      taskStore.tasks[idx].updated_at = new Date().toISOString();
      require("fs").writeFileSync(PATHS.tasks, JSON.stringify(taskStore, null, 2));
      return true;
    }
  } catch {}
  return false;
}

// Claim a task
export function claimTask(taskId: string, assignee: string = "terminal-user"): boolean {
  try {
    const taskStore = readJson<{ tasks: TaskData[] }>(PATHS.tasks, { tasks: [] });
    const idx = taskStore.tasks.findIndex((t) => t.id === taskId);
    if (idx >= 0 && taskStore.tasks[idx].status === "pending") {
      taskStore.tasks[idx].status = "in_progress";
      taskStore.tasks[idx].assigned_to = assignee;
      taskStore.tasks[idx].claimed_at = new Date().toISOString();
      taskStore.tasks[idx].updated_at = new Date().toISOString();
      require("fs").writeFileSync(PATHS.tasks, JSON.stringify(taskStore, null, 2));
      return true;
    }
  } catch {}
  return false;
}
