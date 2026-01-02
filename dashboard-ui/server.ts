#!/usr/bin/env bun
/**
 * Dashboard API Server
 * 
 * Provides REST API endpoints and WebSocket for real-time updates.
 * Watches memory files and broadcasts changes to connected clients.
 * 
 * Run with: bun dashboard-ui/server.ts
 */

import { watch } from "fs";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PORT = 3847;
const MEMORY_DIR = join(process.cwd(), "memory");

// File paths
const PATHS = {
  state: join(MEMORY_DIR, "state.json"),
  tasks: join(MEMORY_DIR, "tasks.json"),
  agents: join(MEMORY_DIR, "agent-registry.json"),
  logs: join(MEMORY_DIR, "realtime.log"),
  quality: join(MEMORY_DIR, "quality-assessments.json"),
  messageBus: join(MEMORY_DIR, "message-bus.jsonl"),
  analytics: join(MEMORY_DIR, ".analytics-cache.json"),
  sessions: join(MEMORY_DIR, "session-summaries.json"),
  profilerCache: join(MEMORY_DIR, ".profiler-cache.json"),
  performanceMetrics: join(MEMORY_DIR, "agent-performance-metrics.json"),
  sessionsLog: join(MEMORY_DIR, "sessions.jsonl"),
  userMessages: join(MEMORY_DIR, "user-messages.jsonl"),
};

const OPENCODE_STORAGE = join(require("os").homedir(), ".local", "share", "opencode", "storage");
const OPENCODE_SESSIONS_DIR = join(OPENCODE_STORAGE, "session");
const OPENCODE_MESSAGES_DIR = join(OPENCODE_STORAGE, "message");

// Claude API pricing (per 1M tokens) - Claude 3.5 Sonnet pricing as of 2024
// Note: Cache reads are 90% cheaper than regular input tokens
const PRICING = {
  input: 3.00,        // $3.00 per 1M input tokens
  output: 15.00,      // $15.00 per 1M output tokens  
  cacheRead: 0.30,    // $0.30 per 1M cache read tokens (90% discount)
  cacheWrite: 3.75,   // $3.75 per 1M cache write tokens
};

// Calculate cost from tokens
function calculateCost(tokens: { input: number; output: number; cache: { read: number; write: number } }): {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  totalCost: number;
  cacheSavings: number;
} {
  const inputCost = (tokens.input / 1_000_000) * PRICING.input;
  const outputCost = (tokens.output / 1_000_000) * PRICING.output;
  const cacheReadCost = (tokens.cache.read / 1_000_000) * PRICING.cacheRead;
  const cacheWriteCost = (tokens.cache.write / 1_000_000) * PRICING.cacheWrite;
  
  // Cache savings = what we would have paid if cache reads were regular input tokens
  const cacheSavings = (tokens.cache.read / 1_000_000) * (PRICING.input - PRICING.cacheRead);
  
  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheWriteCost,
    totalCost: inputCost + outputCost + cacheReadCost + cacheWriteCost,
    cacheSavings,
  };
}

// OpenCode session and message types
interface OpenCodeMessage {
  id: string;
  sessionID: string;
  role: "user" | "assistant" | "system";
  time: {
    created: number;
    completed?: number;
  };
  summary?: {
    title?: string;
  };
  modelID?: string;
  tokens?: {
    input: number;
    output: number;
    reasoning: number;
    cache?: {
      read: number;
      write: number;
    };
  };
  finish?: string;
}

interface OpenCodeSession {
  id: string;
  projectID?: string;
  time?: {
    created: number;
    updated?: number;
  };
}

// Store connected WebSocket clients
const clients = new Set<any>();

// Track last message-bus line for new message detection
let lastMessageBusLine = 0;

// Track last quality assessment count for new assessment detection
let lastQualityCount = 0;

// Read JSON file safely
function readJsonFile(path: string): any {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  } catch (e) {
    console.error(`Error reading ${path}:`, e);
  }
  return null;
}

// Read last N lines of a file
function readLastLines(path: string, n: number = 100): string[] {
  try {
    if (!existsSync(path)) return [];
    const content = readFileSync(path, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    return lines.slice(-n);
  } catch {
    return [];
  }
}

// Parse log entries
function parseLogEntries(lines: string[]): any[] {
  return lines
    .map((line) => {
      try {
        // Format: [timestamp] LEVEL | session | message | data
        const match = line.match(/^\[([^\]]+)\]\s+(\w+)\s+\|\s+([^|]+)\s+\|\s+([^|]+)(?:\s+\|\s+(.+))?$/);
        if (match) {
          return {
            timestamp: match[1],
            level: match[2],
            session: match[3].trim(),
            message: match[4].trim(),
            data: match[5] ? JSON.parse(match[5]) : undefined,
          };
        }
        // Try JSON format
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

// Get stats data
function getStats(): any {
  const state = readJsonFile(PATHS.state);
  return {
    session_count: state?.current_session || 0,
    status: state?.status || "unknown",
    active_tasks: state?.active_tasks || [],
    recent_achievements: state?.achievements?.slice(-5) || [],
    last_session: state?.last_session || "",
  };
}

// Get agents data
function getAgents(): any {
  const registry = readJsonFile(PATHS.agents);
  const agents = registry?.agents || [];
  
  // Filter out stale agents (no heartbeat in 2 minutes)
  const now = Date.now();
  const activeAgents = agents.filter((a: any) => {
    const lastBeat = new Date(a.last_heartbeat).getTime();
    return now - lastBeat < 120000; // 2 minutes
  });
  
  return { agents: activeAgents };
}

// Get tasks data
function getTasks(): any {
  const store = readJsonFile(PATHS.tasks);
  return { tasks: store?.tasks || [] };
}

// Get quality data
function getQuality(): any {
  const assessments = readJsonFile(PATHS.quality);
  if (!assessments?.assessments?.length) {
    return {
      stats: { total: 0, avg_score: "N/A", trend: "stable", recent_avg: "N/A", older_avg: "N/A" },
      lessons: [],
    };
  }

  const all = assessments.assessments;
  const avgScore = (all.reduce((s: number, a: any) => s + (a.overall_score || 0), 0) / all.length).toFixed(1);
  
  const recent = all.slice(-5);
  const older = all.slice(0, -5);
  const recentAvg = recent.length ? (recent.reduce((s: number, a: any) => s + a.overall_score, 0) / recent.length).toFixed(1) : "N/A";
  const olderAvg = older.length ? (older.reduce((s: number, a: any) => s + a.overall_score, 0) / older.length).toFixed(1) : recentAvg;
  
  const trend = recentAvg > olderAvg ? "improving" : recentAvg < olderAvg ? "declining" : "stable";

  return {
    stats: {
      total: all.length,
      avg_score: avgScore,
      trend,
      recent_avg: recentAvg,
      older_avg: olderAvg,
    },
    lessons: all.slice(-5).map((a: any) => ({
      task: a.task_title,
      lesson: a.lessons_learned,
    })).filter((l: any) => l.lesson),
  };
}

// Get analytics data
function getAnalytics(): any {
  const cache = readJsonFile(PATHS.analytics);
  if (!cache) {
    return {
      total_sessions: 0,
      total_tool_calls: 0,
      avg_duration_minutes: 0,
      sessions_today: 0,
      sessions_this_week: 0,
      recent_sessions: [],
      tool_usage_by_type: {},
      session_activity_by_hour: new Array(24).fill(0),
    };
  }

  // Build analytics from cache data
  const analyses = cache.sessionAnalyses || [];
  const toolUsage: Record<string, number> = {};
  const activityByHour = new Array(24).fill(0);
  
  for (const a of analyses) {
    // Tool usage
    for (const [tool, count] of Object.entries(a.toolUsage || {})) {
      toolUsage[tool] = (toolUsage[tool] || 0) + (count as number);
    }
    // Activity by hour (based on session creation)
    // This would need more data - using placeholder
  }

  return {
    total_sessions: cache.sessionsAnalyzed || 0,
    total_tool_calls: Object.values(toolUsage).reduce((a: number, b: any) => a + b, 0),
    avg_duration_minutes: Math.round((cache.totalDuration || 0) / 60000 / Math.max(1, cache.sessionsAnalyzed || 1)),
    sessions_today: 0, // Would need date tracking
    sessions_this_week: cache.sessionsAnalyzed || 0,
    recent_sessions: analyses.slice(0, 10).map((a: any) => ({
      session_id: a.sessionId,
      started_at: new Date().toISOString(), // Placeholder
      tool_calls: Object.values(a.toolUsage || {}).reduce((sum: number, c: any) => sum + c, 0),
      status: a.success ? "completed" : "error",
      achievements: a.learnings?.slice(0, 2) || [],
      learnings: a.learnings || [],
    })),
    tool_usage_by_type: toolUsage,
    session_activity_by_hour: activityByHour,
  };
}

// Get logs data
function getLogs(): any {
  const lines = readLastLines(PATHS.logs, 100);
  return { entries: parseLogEntries(lines) };
}

// Get performance data (from agent-performance-profiler)
function getPerformance(): any {
  // Try to read cached profiler data first
  const cache = readJsonFile(PATHS.profilerCache);
  if (cache && cache.lastUpdated) {
    return {
      lastUpdated: cache.lastUpdated,
      toolExecutions: Object.values(cache.toolExecutions || {}).sort((a: any, b: any) => b.count - a.count),
      agentProfiles: Object.values(cache.agentProfiles || {}).sort((a: any, b: any) => b.tasksCompleted - a.tasksCompleted),
      errorPatterns: cache.errorPatterns || [],
      suggestions: cache.suggestions || [],
      summary: {
        totalTools: Object.keys(cache.toolExecutions || {}).length,
        totalCalls: Object.values(cache.toolExecutions || {}).reduce((sum: number, t: any) => sum + t.count, 0),
        totalAgents: Object.keys(cache.agentProfiles || {}).length,
        totalTasks: Object.values(cache.agentProfiles || {}).reduce((sum: number, a: any) => sum + a.tasksCompleted, 0),
        avgQuality: Object.values(cache.agentProfiles || {})
          .filter((a: any) => a.avgQuality > 0)
          .reduce((sum: number, a: any, _, arr) => sum + a.avgQuality / arr.length, 0),
        errorCount: (cache.errorPatterns || []).reduce((sum: number, e: any) => sum + e.count, 0),
        suggestionCount: (cache.suggestions || []).length,
      }
    };
  }

  // Fallback: Generate basic metrics from available data
  return generateBasicPerformanceMetrics();
}

// Generate basic performance metrics from raw data when cache is not available
function generateBasicPerformanceMetrics(): any {
  const tools: Record<string, any> = {};
  const agents: Record<string, any> = {};
  
  // Try to get tool data from OpenCode parts
  const partsDir = join(OPENCODE_STORAGE, "part");
  if (existsSync(partsDir)) {
    try {
      const partFiles = require("fs").readdirSync(partsDir).filter((f: string) => f.endsWith(".json"));
      
      for (const file of partFiles.slice(-200)) {
        try {
          const part = JSON.parse(readFileSync(join(partsDir, file), "utf-8"));
          
          if (part.type === "tool-invocation" && part.toolName) {
            const toolName = part.toolName;
            
            if (!tools[toolName]) {
              tools[toolName] = {
                tool: toolName,
                count: 0,
                totalDurationMs: 0,
                avgDurationMs: 0,
                minDurationMs: Infinity,
                maxDurationMs: 0,
                errorCount: 0,
                errorRate: 0,
              };
            }
            
            tools[toolName].count++;
            
            if (part.time?.created && part.time?.completed) {
              const duration = part.time.completed - part.time.created;
              tools[toolName].totalDurationMs += duration;
              tools[toolName].minDurationMs = Math.min(tools[toolName].minDurationMs, duration);
              tools[toolName].maxDurationMs = Math.max(tools[toolName].maxDurationMs, duration);
            }
            
            if (part.state?.status === "error" || part.result?.error) {
              tools[toolName].errorCount++;
            }
          }
        } catch {}
      }
    } catch {}
  }
  
  // Calculate averages
  for (const tool of Object.values(tools)) {
    (tool as any).avgDurationMs = (tool as any).count > 0 ? (tool as any).totalDurationMs / (tool as any).count : 0;
    (tool as any).errorRate = (tool as any).count > 0 ? (tool as any).errorCount / (tool as any).count : 0;
    if ((tool as any).minDurationMs === Infinity) (tool as any).minDurationMs = 0;
  }

  // Get agent performance from metrics file
  const perfMetrics = readJsonFile(PATHS.performanceMetrics);
  for (const [agentId, data] of Object.entries(perfMetrics?.agents || {})) {
    const agent = data as any;
    const completionRate = agent.tasks_claimed > 0 ? agent.tasks_completed / agent.tasks_claimed : 0;
    const qualityWeight = (agent.avg_quality || 5) / 10;
    
    agents[agentId] = {
      agentId,
      tasksCompleted: agent.tasks_completed || 0,
      tasksClaimed: agent.tasks_claimed || 0,
      avgTaskDurationMs: agent.avg_duration_ms || 0,
      avgQuality: agent.avg_quality || 0,
      efficiency: Math.round(completionRate * qualityWeight * 100),
      firstSeen: agent.first_seen || "",
      lastSeen: agent.last_activity || "",
    };
  }
  
  return {
    lastUpdated: new Date().toISOString(),
    toolExecutions: Object.values(tools).sort((a: any, b: any) => b.count - a.count),
    agentProfiles: Object.values(agents).sort((a: any, b: any) => b.tasksCompleted - a.tasksCompleted),
    errorPatterns: [],
    suggestions: [],
    summary: {
      totalTools: Object.keys(tools).length,
      totalCalls: Object.values(tools).reduce((sum: number, t: any) => sum + t.count, 0),
      totalAgents: Object.keys(agents).length,
      totalTasks: Object.values(agents).reduce((sum: number, a: any) => sum + a.tasksCompleted, 0),
      avgQuality: Object.values(agents)
        .filter((a: any) => a.avgQuality > 0)
        .reduce((sum: number, a: any, _, arr) => sum + a.avgQuality / arr.length, 0),
      errorCount: 0,
      suggestionCount: 0,
    }
  };
}

// Get list of OpenCode sessions
function getOpenCodeSessions(): { sessions: any[] } {
  try {
    if (!existsSync(OPENCODE_MESSAGES_DIR)) {
      return { sessions: [] };
    }
    
    const sessionDirs = require("fs").readdirSync(OPENCODE_MESSAGES_DIR)
      .filter((dir: string) => dir.startsWith("ses_"));
    
    const sessions = [];
    
    for (const sessionId of sessionDirs) {
      const sessionMsgDir = join(OPENCODE_MESSAGES_DIR, sessionId);
      const msgFiles = require("fs").readdirSync(sessionMsgDir)
        .filter((f: string) => f.endsWith(".json"));
      
      if (msgFiles.length === 0) continue;
      
      // Get first and last message for time range
      const sortedFiles = msgFiles.sort();
      let firstMsgTime = 0;
      let lastMsgTime = 0;
      let totalTokens = { input: 0, output: 0, cache: { read: 0, write: 0 } };
      let messageCount = msgFiles.length;
      let userMessages = 0;
      let assistantMessages = 0;
      
      // Read first message for start time
      try {
        const firstMsg = JSON.parse(readFileSync(join(sessionMsgDir, sortedFiles[0]), "utf-8"));
        firstMsgTime = firstMsg.time?.created || 0;
      } catch {}
      
      // Read last message for end time
      try {
        const lastMsg = JSON.parse(readFileSync(join(sessionMsgDir, sortedFiles[sortedFiles.length - 1]), "utf-8"));
        lastMsgTime = lastMsg.time?.created || 0;
      } catch {}
      
      // Sample messages to get role counts and tokens (read every Nth message for performance)
      const sampleRate = Math.max(1, Math.floor(msgFiles.length / 10));
      for (let i = 0; i < msgFiles.length; i += sampleRate) {
        try {
          const msg = JSON.parse(readFileSync(join(sessionMsgDir, msgFiles[i]), "utf-8"));
          if (msg.role === "user") userMessages++;
          if (msg.role === "assistant") assistantMessages++;
          if (msg.tokens) {
            totalTokens.input += msg.tokens.input || 0;
            totalTokens.output += msg.tokens.output || 0;
            if (msg.tokens.cache) {
              totalTokens.cache.read += msg.tokens.cache.read || 0;
              totalTokens.cache.write += msg.tokens.cache.write || 0;
            }
          }
        } catch {}
      }
      
      // Scale up sampled counts
      if (sampleRate > 1) {
        userMessages = Math.round(userMessages * sampleRate);
        assistantMessages = Math.round(assistantMessages * sampleRate);
        totalTokens.input = Math.round(totalTokens.input * sampleRate);
        totalTokens.output = Math.round(totalTokens.output * sampleRate);
        totalTokens.cache.read = Math.round(totalTokens.cache.read * sampleRate);
        totalTokens.cache.write = Math.round(totalTokens.cache.write * sampleRate);
      }
      
      // Calculate cost for this session
      const cost = calculateCost(totalTokens);
      
      sessions.push({
        id: sessionId,
        messageCount,
        userMessages,
        assistantMessages,
        startTime: firstMsgTime,
        endTime: lastMsgTime,
        durationMs: lastMsgTime - firstMsgTime,
        tokens: totalTokens,
        cost: {
          inputCost: cost.inputCost,
          outputCost: cost.outputCost,
          cacheReadCost: cost.cacheReadCost,
          totalCost: cost.totalCost,
          cacheSavings: cost.cacheSavings,
        },
      });
    }
    
    // Sort by most recent first
    sessions.sort((a, b) => b.startTime - a.startTime);
    
    return { sessions: sessions.slice(0, 50) }; // Return last 50 sessions
  } catch (e) {
    console.error("Error getting OpenCode sessions:", e);
    return { sessions: [] };
  }
}

// Get messages for a specific OpenCode session
function getOpenCodeSessionMessages(sessionId: string): { messages: any[] } {
  try {
    const sessionMsgDir = join(OPENCODE_MESSAGES_DIR, sessionId);
    
    if (!existsSync(sessionMsgDir)) {
      return { messages: [] };
    }
    
    const msgFiles = require("fs").readdirSync(sessionMsgDir)
      .filter((f: string) => f.endsWith(".json"))
      .sort();
    
    const messages = [];
    
    for (const file of msgFiles) {
      try {
        const msg = JSON.parse(readFileSync(join(sessionMsgDir, file), "utf-8"));
        messages.push({
          id: msg.id,
          role: msg.role,
          createdAt: msg.time?.created,
          completedAt: msg.time?.completed,
          summary: msg.summary?.title || null,
          model: msg.modelID || null,
          tokens: msg.tokens || null,
          finish: msg.finish || null,
        });
      } catch {}
    }
    
    return { messages };
  } catch (e) {
    console.error("Error getting session messages:", e);
    return { messages: [] };
  }
}

// Get user messages
function getUserMessages(): { messages: any[], unread_count: number } {
  try {
    if (!existsSync(PATHS.userMessages)) return { messages: [], unread_count: 0 };
    const content = readFileSync(PATHS.userMessages, "utf-8");
    const messages = content.split("\n").filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    const unread = messages.filter(m => !m.read).length;
    return { messages: messages.reverse(), unread_count: unread };
  } catch {
    return { messages: [], unread_count: 0 };
  }
}

// Get message bus messages
function getMessageBus(): { messages: any[] } {
  try {
    if (!existsSync(PATHS.messageBus)) return { messages: [] };
    const content = readFileSync(PATHS.messageBus, "utf-8");
    const messages = content.split("\n").filter(Boolean).slice(-100).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    return { messages: messages.reverse() };
  } catch {
    return { messages: [] };
  }
}

// Get recent events from message bus (last 50)
function getRecentEvents(): any {
  try {
    if (!existsSync(PATHS.messageBus)) return { events: [] };
    
    const content = readFileSync(PATHS.messageBus, "utf-8");
    const lines = content.split("\n").filter(Boolean).slice(-50);
    
    const events = [];
    for (const line of lines) {
      try {
        const msg = JSON.parse(line);
        if (STREAMABLE_EVENT_TYPES.has(msg.type)) {
          const categorized = categorizeEvent(msg);
          if (categorized) {
            events.push(categorized);
          }
        }
      } catch {}
    }
    
    return { events: events.reverse() }; // Most recent first
  } catch (e) {
    console.error("Error getting events:", e);
    return { events: [] };
  }
}

// Broadcast to all connected clients
function broadcast(type: string, data: any) {
  const message = JSON.stringify({ type, data });
  for (const client of clients) {
    try {
      client.send(message);
    } catch (e) {
      clients.delete(client);
    }
  }
}

// Event types we care about streaming to the dashboard
const STREAMABLE_EVENT_TYPES = new Set([
  // Task events
  "task_completed",
  "task_claim",
  "task_available",
  // Agent events  
  "broadcast",
  "heartbeat",
  // Direct messages (for debugging/monitoring)
  "direct",
  // Help requests
  "request_help",
]);

// Parse and categorize a message bus event
function categorizeEvent(msg: any): { eventType: string; data: any } | null {
  const type = msg.type;
  
  // Task events
  if (type === "task_completed" || type === "task_complete") {
    return {
      eventType: "task_completed",
      data: {
        task_id: msg.payload?.task_id,
        title: msg.payload?.title,
        result: msg.payload?.result || "success",
        completed_by: msg.payload?.completed_by || msg.from_agent,
        summary: msg.payload?.summary,
        timestamp: msg.timestamp,
      },
    };
  }
  
  if (type === "task_claim") {
    return {
      eventType: "task_claimed",
      data: {
        task_id: msg.payload?.task_id,
        title: msg.payload?.title,
        claimed_by: msg.payload?.claimed_by || msg.from_agent,
        timestamp: msg.timestamp,
      },
    };
  }
  
  if (type === "task_available") {
    return {
      eventType: "task_available",
      data: {
        task_id: msg.payload?.task_id,
        title: msg.payload?.title,
        priority: msg.payload?.priority,
        description: msg.payload?.description,
        timestamp: msg.timestamp,
      },
    };
  }
  
  // Agent events - broadcasts indicate status changes or achievements
  if (type === "broadcast") {
    const payload = msg.payload || {};
    
    // Check if this is an "agent online" broadcast (registration)
    if (payload.status?.includes("Agent online")) {
      return {
        eventType: "agent_registered",
        data: {
          agent_id: msg.from_agent,
          session_id: payload.details?.session_id,
          session_count: payload.details?.session_count,
          timestamp: msg.timestamp,
        },
      };
    }
    
    // General status update broadcast
    return {
      eventType: "agent_broadcast",
      data: {
        agent_id: msg.from_agent,
        status: payload.status,
        achievements: payload.achievements,
        pending_tasks: payload.pending_tasks,
        quality: payload.quality,
        timestamp: msg.timestamp,
      },
    };
  }
  
  // Heartbeat events
  if (type === "heartbeat") {
    return {
      eventType: "agent_heartbeat",
      data: {
        agent_id: msg.from_agent,
        status: msg.payload?.status || "active",
        timestamp: msg.timestamp,
      },
    };
  }
  
  // Request help events
  if (type === "request_help") {
    return {
      eventType: "help_requested",
      data: {
        agent_id: msg.from_agent,
        topic: msg.payload?.topic,
        context: msg.payload?.context,
        timestamp: msg.timestamp,
      },
    };
  }
  
  return null;
}

// Check for new messages of all types
function checkForNewMessages() {
  try {
    if (!existsSync(PATHS.messageBus)) return;
    
    const content = readFileSync(PATHS.messageBus, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    
    // Process only new lines
    if (lines.length > lastMessageBusLine) {
      const newLines = lines.slice(lastMessageBusLine);
      lastMessageBusLine = lines.length;
      
      for (const line of newLines) {
        try {
          const msg = JSON.parse(line);
          
          // Categorize and broadcast if it's a streamable event
          if (STREAMABLE_EVENT_TYPES.has(msg.type)) {
            const categorized = categorizeEvent(msg);
            if (categorized) {
              broadcast(categorized.eventType, categorized.data);
            }
          }
        } catch {}
      }
    }
  } catch (e) {
    console.error("Error checking messages:", e);
  }
}

// Set up file watchers
function setupWatchers() {
  const debounce = (fn: () => void, delay: number) => {
    let timeout: ReturnType<typeof setTimeout>;
    return () => {
      clearTimeout(timeout);
      timeout = setTimeout(fn, delay);
    };
  };

  // Watch state file
  if (existsSync(PATHS.state)) {
    watch(PATHS.state, debounce(() => broadcast("stats", getStats()), 100));
  }

  // Watch agents file
  if (existsSync(PATHS.agents)) {
    watch(PATHS.agents, debounce(() => broadcast("agents", getAgents()), 100));
  }

  // Watch tasks file
  if (existsSync(PATHS.tasks)) {
    watch(PATHS.tasks, debounce(() => broadcast("tasks", getTasks()), 100));
  }

  // Watch quality file and broadcast new assessments
  if (existsSync(PATHS.quality)) {
    watch(PATHS.quality, debounce(() => {
      const quality = getQuality();
      broadcast("quality", quality);
      
      // Check for new quality assessments
      checkForNewQualityAssessments();
    }, 100));
  }

  // Watch logs file
  if (existsSync(PATHS.logs)) {
    watch(PATHS.logs, debounce(() => broadcast("logs", getLogs()), 100));
  }

  // Watch message bus for task_completed events
  if (existsSync(PATHS.messageBus)) {
    watch(PATHS.messageBus, debounce(checkForNewMessages, 100));
  }

  // Watch user messages
  if (existsSync(PATHS.userMessages)) {
    watch(PATHS.userMessages, debounce(() => broadcast("user_messages", getUserMessages()), 100));
  }

  // Initial message bus line count
  try {
    if (existsSync(PATHS.messageBus)) {
      lastMessageBusLine = readFileSync(PATHS.messageBus, "utf-8").split("\n").filter(Boolean).length;
    }
  } catch {}
  
  // Initial quality assessment count
  try {
    const assessments = readJsonFile(PATHS.quality);
    lastQualityCount = assessments?.assessments?.length || 0;
  } catch {}
  
  // Watch profiler cache for performance updates
  if (existsSync(PATHS.profilerCache)) {
    watch(PATHS.profilerCache, debounce(() => broadcast("performance", getPerformance()), 500));
  }
  
  // Watch performance metrics file
  if (existsSync(PATHS.performanceMetrics)) {
    watch(PATHS.performanceMetrics, debounce(() => broadcast("performance", getPerformance()), 500));
  }
}

// Check for new quality assessments
function checkForNewQualityAssessments() {
  try {
    const assessments = readJsonFile(PATHS.quality);
    const currentCount = assessments?.assessments?.length || 0;
    
    if (currentCount > lastQualityCount) {
      // Get the new assessments
      const newAssessments = assessments.assessments.slice(lastQualityCount);
      lastQualityCount = currentCount;
      
      for (const assessment of newAssessments) {
        broadcast("quality_assessed", {
          task_id: assessment.task_id,
          task_title: assessment.task_title,
          overall_score: assessment.overall_score,
          scores: {
            completeness: assessment.completeness,
            code_quality: assessment.code_quality,
            documentation: assessment.documentation,
            efficiency: assessment.efficiency,
            impact: assessment.impact,
          },
          lessons_learned: assessment.lessons_learned,
          assessed_at: assessment.assessed_at,
        });
      }
    }
  } catch (e) {
    console.error("Error checking quality assessments:", e);
  }
}

// Start server
const server = Bun.serve({
  port: PORT,
  
  async fetch(req, server) {
    const url = new URL(req.url);
    
    // Handle WebSocket upgrade
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return undefined;
    }
    
    // CORS headers
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };
    
    if (req.method === "OPTIONS") {
      return new Response(null, { headers });
    }
    
    // POST /api/user-messages - Send message to agents
    if (req.method === "POST" && url.pathname === "/api/user-messages") {
      try {
        const body = await req.json();
        if (!body.message) {
          return new Response(JSON.stringify({ error: "Message is required" }), { status: 400, headers });
        }
        const msg = {
          id: `umsg_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
          from: "dashboard",
          message: body.message,
          timestamp: new Date().toISOString(),
          read: false,
          priority: body.priority || "normal",
          tags: body.tags || []
        };
        const { appendFileSync } = await import("fs");
        appendFileSync(PATHS.userMessages, JSON.stringify(msg) + "\n");
        broadcast("user_message_sent", { message: msg });
        return new Response(JSON.stringify({ success: true, message: msg }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Failed to send message" }), { status: 500, headers });
      }
    }

    // POST /api/tasks - Create new task
    if (req.method === "POST" && url.pathname === "/api/tasks") {
      try {
        const body = await req.json();
        if (!body.title) {
          return new Response(JSON.stringify({ error: "Title is required" }), { status: 400, headers });
        }
        const store = readJsonFile(PATHS.tasks) || { tasks: [], completed_count: 0 };
        const task = {
          id: `task_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
          title: body.title,
          description: body.description || "",
          priority: body.priority || "medium",
          status: "pending",
          tags: body.tags || [],
          complexity: body.complexity,
          estimated_hours: body.estimated_hours,
          created_at: new Date().toISOString(),
          created_by: "dashboard",
          notes: []
        };
        store.tasks.push(task);
        const { writeFileSync } = await import("fs");
        writeFileSync(PATHS.tasks, JSON.stringify(store, null, 2));
        broadcast("tasks", getTasks());
        if (task.priority === "critical" || task.priority === "high") {
          broadcast("task_available", { task_id: task.id, title: task.title, priority: task.priority });
        }
        return new Response(JSON.stringify({ success: true, task }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Failed to create task" }), { status: 500, headers });
      }
    }

    // PATCH /api/tasks/:id - Update task
    if (req.method === "PATCH" && url.pathname.startsWith("/api/tasks/")) {
      try {
        const taskId = url.pathname.replace("/api/tasks/", "");
        const body = await req.json();
        const store = readJsonFile(PATHS.tasks) || { tasks: [], completed_count: 0 };
        const taskIndex = store.tasks.findIndex((t: any) => t.id === taskId);
        if (taskIndex === -1) {
          return new Response(JSON.stringify({ error: "Task not found" }), { status: 404, headers });
        }
        const task = store.tasks[taskIndex];
        if (body.status) {
          const oldStatus = task.status;
          task.status = body.status;
          if (body.status === "completed" && oldStatus !== "completed") {
            store.completed_count = (store.completed_count || 0) + 1;
            task.completed_at = new Date().toISOString();
            broadcast("task_completed", { task_id: task.id, title: task.title });
          }
        }
        if (body.notes) {
          task.notes = task.notes || [];
          task.notes.push({ text: body.notes, timestamp: new Date().toISOString() });
        }
        if (body.assigned_to !== undefined) {
          task.assigned_to = body.assigned_to;
        }
        task.updated_at = new Date().toISOString();
        const { writeFileSync } = await import("fs");
        writeFileSync(PATHS.tasks, JSON.stringify(store, null, 2));
        broadcast("tasks", getTasks());
        return new Response(JSON.stringify({ success: true, task }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Failed to update task" }), { status: 500, headers });
      }
    }

    // DELETE /api/tasks/:id - Cancel task
    if (req.method === "DELETE" && url.pathname.startsWith("/api/tasks/")) {
      try {
        const taskId = url.pathname.replace("/api/tasks/", "");
        const store = readJsonFile(PATHS.tasks) || { tasks: [], completed_count: 0 };
        const taskIndex = store.tasks.findIndex((t: any) => t.id === taskId);
        if (taskIndex === -1) {
          return new Response(JSON.stringify({ error: "Task not found" }), { status: 404, headers });
        }
        store.tasks[taskIndex].status = "cancelled";
        store.tasks[taskIndex].cancelled_at = new Date().toISOString();
        store.tasks[taskIndex].notes = store.tasks[taskIndex].notes || [];
        store.tasks[taskIndex].notes.push({ text: "Cancelled from dashboard", timestamp: new Date().toISOString() });
        const { writeFileSync } = await import("fs");
        writeFileSync(PATHS.tasks, JSON.stringify(store, null, 2));
        broadcast("tasks", getTasks());
        return new Response(JSON.stringify({ success: true, task_id: taskId }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Failed to cancel task" }), { status: 500, headers });
      }
    }

    // POST /api/user-messages/:id/mark-read
    if (req.method === "POST" && url.pathname.match(/^\/api\/user-messages\/[^/]+\/mark-read$/)) {
      try {
        const messageId = url.pathname.replace("/api/user-messages/", "").replace("/mark-read", "");
        if (!existsSync(PATHS.userMessages)) {
          return new Response(JSON.stringify({ error: "No messages found" }), { status: 404, headers });
        }
        const content = readFileSync(PATHS.userMessages, "utf-8");
        const lines = content.split("\n").filter(Boolean);
        const updatedLines = lines.map(line => {
          try {
            const msg = JSON.parse(line);
            if (msg.id === messageId) {
              msg.read = true;
              msg.read_at = new Date().toISOString();
              msg.read_by = "dashboard";
            }
            return JSON.stringify(msg);
          } catch {
            return line;
          }
        });
        const { writeFileSync } = await import("fs");
        writeFileSync(PATHS.userMessages, updatedLines.join("\n") + "\n");
        broadcast("user_messages", getUserMessages());
        return new Response(JSON.stringify({ success: true }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Failed to mark as read" }), { status: 500, headers });
      }
    }

    // API routes
    switch (url.pathname) {
      case "/api/stats":
        return new Response(JSON.stringify(getStats()), { headers });
      case "/api/agents":
        return new Response(JSON.stringify(getAgents()), { headers });
      case "/api/tasks":
        return new Response(JSON.stringify(getTasks()), { headers });
      case "/api/logs":
        return new Response(JSON.stringify(getLogs()), { headers });
      case "/api/quality":
        return new Response(JSON.stringify(getQuality()), { headers });
      case "/api/analytics":
        return new Response(JSON.stringify(getAnalytics()), { headers });
      case "/api/events":
        return new Response(JSON.stringify(getRecentEvents()), { headers });
      case "/api/performance":
        return new Response(JSON.stringify(getPerformance()), { headers });
      case "/api/opencode/sessions":
        return new Response(JSON.stringify(getOpenCodeSessions()), { headers });
      case "/api/user-messages":
        return new Response(JSON.stringify(getUserMessages()), { headers });
      case "/api/messages":
        return new Response(JSON.stringify(getMessageBus()), { headers });
      default:
        // Handle dynamic routes for session messages
        if (url.pathname.startsWith("/api/opencode/sessions/") && url.pathname.endsWith("/messages")) {
          const sessionId = url.pathname.replace("/api/opencode/sessions/", "").replace("/messages", "");
          return new Response(JSON.stringify(getOpenCodeSessionMessages(sessionId)), { headers });
        }
        return new Response(JSON.stringify({ error: "Not found" }), { 
          status: 404, 
          headers 
        });
    }
  },
  
  websocket: {
    open(ws) {
      clients.add(ws);
      console.log(`Client connected (${clients.size} total)`);
      
      // Send initial data
      ws.send(JSON.stringify({ type: "stats", data: getStats() }));
      ws.send(JSON.stringify({ type: "agents", data: getAgents() }));
      ws.send(JSON.stringify({ type: "tasks", data: getTasks() }));
      ws.send(JSON.stringify({ type: "logs", data: getLogs() }));
      ws.send(JSON.stringify({ type: "quality", data: getQuality() }));
      ws.send(JSON.stringify({ type: "analytics", data: getAnalytics() }));
      ws.send(JSON.stringify({ type: "performance", data: getPerformance() }));
      ws.send(JSON.stringify({ type: "user_messages", data: getUserMessages() }));
      ws.send(JSON.stringify({ type: "agent_messages", data: getMessageBus() }));
    },
    
    message(ws, message) {
      // Handle ping/pong or other messages if needed
    },
    
    close(ws) {
      clients.delete(ws);
      console.log(`Client disconnected (${clients.size} total)`);
    },
  },
});

// Set up file watchers
setupWatchers();

console.log(`
Dashboard API Server running on http://localhost:${PORT}

REST Endpoints:
  GET /api/stats       - System stats
  GET /api/agents      - Active agents
  GET /api/tasks       - Task list
  GET /api/logs        - Recent logs
  GET /api/quality     - Quality assessments
  GET /api/analytics   - Session analytics
  GET /api/performance - Performance metrics (tool times, agent efficiency, errors)
  GET /api/opencode/sessions               - List OpenCode sessions
  GET /api/opencode/sessions/:id/messages  - Get messages for a session

WebSocket Events (WS /ws):
  File-based updates:
    stats            - System state changes
    agents           - Agent registry changes
    tasks            - Task list changes
    logs             - New log entries
    quality          - Quality stats updates
    analytics        - Analytics updates
    performance      - Performance metrics updates

  Message bus events:
    task_completed   - Task marked complete
    task_claimed     - Task claimed by agent
    task_available   - New high-priority task available
    agent_registered - New agent came online
    agent_broadcast  - Agent status/achievement update
    agent_heartbeat  - Agent heartbeat signal
    help_requested   - Agent requested help

  Quality events:
    quality_assessed - New quality assessment added
`);
