/**
 * Data fetching utilities for the terminal dashboard
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type {
  AgentData,
  TaskData,
  MessageData,
  UserMessageData,
  QualityData,
  StateData,
  SessionEvent,
  OpenCodeSession,
} from "./types";

// Paths
const MEMORY_DIR = join(process.cwd(), "..", "memory");
const OPENCODE_DIR = join(process.env.HOME || "/root", ".opencode");

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
  opencodeSessions: join(OPENCODE_DIR, "session"),
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
  return readJson<QualityData>(PATHS.qualityAssessments, {
    assessments: [],
    summary: {},
  });
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

export function getOpenCodeSessions(): OpenCodeSession[] {
  try {
    if (existsSync(PATHS.opencodeSessions)) {
      const files = require("fs").readdirSync(PATHS.opencodeSessions);
      return files
        .filter((f: string) => f.startsWith("ses_"))
        .map((f: string) => {
          try {
            const sessionPath = join(PATHS.opencodeSessions, f);
            const infoPath = join(sessionPath, "info.json");
            if (existsSync(infoPath)) {
              const info = JSON.parse(readFileSync(infoPath, "utf-8"));
              return {
                id: f,
                title: info.title || info.summary?.title || "Untitled",
                started_at: info.created_at || info.started_at,
                status: info.status || "unknown",
                messages: info.message_count || info.messages?.length || 0,
                parent_id: info.parent_id,
              };
            }
            return { id: f, title: "Session", status: "unknown" };
          } catch {
            return { id: f, title: "Session", status: "error" };
          }
        })
        .sort((a: OpenCodeSession, b: OpenCodeSession) => {
          if (!a.started_at || !b.started_at) return 0;
          return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
        })
        .slice(0, 50);
    }
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
