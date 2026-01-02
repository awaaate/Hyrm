#!/usr/bin/env bun
/**
 * OpenCode Conversation Tracker
 * 
 * Tracks and logs all OpenCode conversations by reading from the OpenCode storage.
 * Location: ~/.local/share/opencode/storage/
 * 
 * Commands:
 *   sessions [limit]     - List all sessions with metadata
 *   messages <sessionId> - Show all messages for a session
 *   export <sessionId>   - Export full conversation as JSON
 *   watch               - Watch for new messages in real-time
 *   stats               - Show statistics
 *   sync                - Sync OpenCode sessions to our memory system
 *   learn               - Extract learnings and patterns from recent sessions
 */

import { existsSync, readdirSync, readFileSync, watch } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

// Import shared utilities
import {
  c,
  readJson as sharedReadJson,
  writeJson,
  truncate as sharedTruncate,
  PATHS as MEMORY_PATHS,
  getMemoryPath,
} from "./shared";

// OpenCode storage paths
const OPENCODE_STORAGE = join(homedir(), ".local", "share", "opencode", "storage");
const OC_PATHS = {
  sessions: join(OPENCODE_STORAGE, "session"),
  messages: join(OPENCODE_STORAGE, "message"),
  parts: join(OPENCODE_STORAGE, "part"),
  projects: join(OPENCODE_STORAGE, "project"),
};

// Types
interface OpenCodeSession {
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
  share?: {
    url: string;
  };
}

interface OpenCodeMessage {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  time: {
    created: number;
  };
  summary?: {
    title?: string;
    diffs?: any[];
  };
}

interface OpenCodePart {
  id: string;
  messageID: string;
  sessionID: string;
  type: string; // "text" | "tool" | "tool-invocation" | "tool-result" | "reasoning" | "step-start" etc
  text?: string;
  tool?: string; // Tool name for type="tool"
  toolName?: string;
  callID?: string;
  state?: {
    status: string;
    input?: any;
    output?: any;
  };
  args?: any;
  result?: any;
  time?: {
    created?: number;
  };
}

// Local JSON reader (for OpenCode storage which returns null on missing)
function readJson<T>(path: string): T | null {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  } catch (e) {
    // Silent failure for non-critical reads
  }
  return null;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

// Local formatTimeAgo for numeric timestamps (OpenCode uses milliseconds)
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = Math.floor((now - timestamp) / 1000);

  if (diff < 0) return "future";
  if (diff < 5) return "now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function truncate(str: string, len: number): string {
  return sharedTruncate(str, len);
}

// Get all projects
function getProjects(): string[] {
  if (!existsSync(OC_PATHS.projects)) return [];
  return readdirSync(OC_PATHS.projects)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

// Get all sessions for a project
function getSessionsForProject(projectId: string): OpenCodeSession[] {
  const projectDir = join(OC_PATHS.sessions, projectId);
  if (!existsSync(projectDir)) return [];

  return readdirSync(projectDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<OpenCodeSession>(join(projectDir, f)))
    .filter((s): s is OpenCodeSession => s !== null)
    .sort((a, b) => b.time.updated - a.time.updated);
}

// Get all sessions across all projects
function getAllSessions(): OpenCodeSession[] {
  const projects = getProjects();
  const allSessions: OpenCodeSession[] = [];

  for (const projectId of projects) {
    allSessions.push(...getSessionsForProject(projectId));
  }

  // Also check for sessions in direct directories
  if (existsSync(OC_PATHS.sessions)) {
    const dirs = readdirSync(OC_PATHS.sessions);
    for (const dir of dirs) {
      const dirPath = join(OC_PATHS.sessions, dir);
      try {
        const stat = require("fs").statSync(dirPath);
        if (stat.isDirectory()) {
          const sessions = getSessionsForProject(dir);
          // Avoid duplicates
          for (const session of sessions) {
            if (!allSessions.find((s) => s.id === session.id)) {
              allSessions.push(session);
            }
          }
        }
      } catch {}
    }
  }

  return allSessions.sort((a, b) => b.time.updated - a.time.updated);
}

// Get messages for a session
function getMessagesForSession(sessionId: string): OpenCodeMessage[] {
  const messageDir = join(OC_PATHS.messages, sessionId);
  if (!existsSync(messageDir)) return [];

  return readdirSync(messageDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<OpenCodeMessage>(join(messageDir, f)))
    .filter((m): m is OpenCodeMessage => m !== null)
    .sort((a, b) => a.time.created - b.time.created);
}

// Get parts for a message
function getPartsForMessage(messageId: string): OpenCodePart[] {
  const partDir = join(OC_PATHS.parts, messageId);
  if (!existsSync(partDir)) return [];

  return readdirSync(partDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<OpenCodePart>(join(partDir, f)))
    .filter((p): p is OpenCodePart => p !== null)
    .sort((a, b) => (a.id || "").localeCompare(b.id || ""));
}

// Interface for synced session data
interface SyncedSession {
  id: string;
  title: string;
  directory: string;
  created: number;
  updated: number;
  message_count: number;
  file_changes?: {
    files: number;
    additions: number;
    deletions: number;
  };
  tools_used: Record<string, number>;
  key_topics: string[];
  user_queries: string[];
}

interface SyncCache {
  synced_at: string;
  last_session_id: string;
  synced_session_ids: string[];
}

interface SessionsData {
  synced_at: string;
  total_sessions: number;
  sessions: SyncedSession[];
}

// Get detailed session data for sync
function getDetailedSessionData(session: OpenCodeSession, maxMessages: number = 10): SyncedSession {
  const messages = getMessagesForSession(session.id);
  const toolUsage: Record<string, number> = {};
  const keyTopics: string[] = [];
  const userQueries: string[] = [];
  
  for (const msg of messages) {
    // Collect user queries (first part of user messages)
    if (msg.role === "user") {
      const parts = getPartsForMessage(msg.id);
      const textPart = parts.find(p => p.type === "text" && p.text);
      if (textPart?.text) {
        const query = truncate(textPart.text.replace(/\n/g, " ").trim(), 100);
        if (query.length > 10) {
          userQueries.push(query);
        }
      }
    }
    
    // Collect tool usage and summaries
    if (msg.role === "assistant") {
      if (msg.summary?.title) {
        keyTopics.push(msg.summary.title);
      }
      
      const parts = getPartsForMessage(msg.id);
      for (const part of parts) {
        const toolName = part.tool || part.toolName;
        if ((part.type === "tool-invocation" || part.type === "tool") && toolName) {
          toolUsage[toolName] = (toolUsage[toolName] || 0) + 1;
        }
      }
    }
  }
  
  return {
    id: session.id,
    title: session.title,
    directory: session.directory,
    created: session.time.created,
    updated: session.time.updated,
    message_count: messages.length,
    file_changes: session.summary?.files ? {
      files: session.summary.files,
      additions: session.summary.additions || 0,
      deletions: session.summary.deletions || 0,
    } : undefined,
    tools_used: toolUsage,
    key_topics: [...new Set(keyTopics)].slice(0, 10), // Dedupe and limit
    user_queries: userQueries.slice(0, 5), // Keep first 5 user queries
  };
}

// Commands
async function cmdSessions(limit: number = 20) {
  console.log(`${c.bold}${c.cyan}OpenCode Sessions${c.reset}\n`);

  const sessions = getAllSessions().slice(0, limit);

  if (sessions.length === 0) {
    console.log(`${c.dim}No sessions found in ${OC_PATHS.sessions}${c.reset}`);
    return;
  }

  console.log(`${c.dim}Found ${sessions.length} sessions (showing up to ${limit})${c.reset}\n`);

  for (const session of sessions) {
    const timeAgo = formatTimeAgo(session.time.updated);
    const isRecent = Date.now() - session.time.updated < 3600000; // Last hour

    console.log(
      `${isRecent ? c.green : c.dim}●${c.reset} ` +
      `${c.bold}${session.id}${c.reset}`
    );
    console.log(
      `  ${c.cyan}Title:${c.reset} ${truncate(session.title, 60)}`
    );
    console.log(
      `  ${c.cyan}Dir:${c.reset} ${c.dim}${session.directory}${c.reset}`
    );
    console.log(
      `  ${c.cyan}Updated:${c.reset} ${timeAgo} ${c.dim}(${formatTime(session.time.updated)})${c.reset}`
    );
    if (session.summary?.files) {
      console.log(
        `  ${c.cyan}Files:${c.reset} ${session.summary.files} ` +
        `${c.green}+${session.summary.additions || 0}${c.reset} ` +
        `${c.red}-${session.summary.deletions || 0}${c.reset}`
      );
    }
    if (session.share?.url) {
      console.log(`  ${c.cyan}Share:${c.reset} ${session.share.url}`);
    }
    console.log();
  }
}

async function cmdMessages(sessionId: string) {
  console.log(`${c.bold}${c.cyan}Messages for Session: ${sessionId}${c.reset}\n`);

  const messages = getMessagesForSession(sessionId);

  if (messages.length === 0) {
    console.log(`${c.dim}No messages found for session ${sessionId}${c.reset}`);
    return;
  }

  console.log(`${c.dim}Found ${messages.length} messages${c.reset}\n`);

  for (const msg of messages) {
    const roleColor = msg.role === "user" ? c.blue : c.green;
    const roleIcon = msg.role === "user" ? "👤" : "🤖";
    
    console.log(
      `${roleIcon} ${roleColor}${c.bold}${msg.role.toUpperCase()}${c.reset} ` +
      `${c.dim}${formatTime(msg.time.created)}${c.reset}`
    );

    if (msg.summary?.title) {
      console.log(`   ${c.cyan}Summary:${c.reset} ${msg.summary.title}`);
    }

    // Get parts for this message
    const parts = getPartsForMessage(msg.id);
    for (const part of parts.slice(0, 3)) { // Show first 3 parts
      if (part.type === "text" && part.text) {
        const text = truncate(part.text.replace(/\n/g, " "), 80);
        console.log(`   ${c.dim}${text}${c.reset}`);
      } else if (part.type === "tool-invocation" && part.toolName) {
        console.log(`   ${c.yellow}🔧 ${part.toolName}${c.reset}`);
      }
    }
    if (parts.length > 3) {
      console.log(`   ${c.dim}... and ${parts.length - 3} more parts${c.reset}`);
    }
    console.log();
  }
}

async function cmdExport(sessionId: string) {
  console.log(`${c.bold}${c.cyan}Exporting Session: ${sessionId}${c.reset}\n`);

  // Find the session
  const allSessions = getAllSessions();
  const session = allSessions.find((s) => s.id === sessionId);

  if (!session) {
    console.log(`${c.red}Session not found: ${sessionId}${c.reset}`);
    return;
  }

  const messages = getMessagesForSession(sessionId);
  const conversation = {
    session,
    messages: messages.map((msg) => ({
      ...msg,
      parts: getPartsForMessage(msg.id),
    })),
    exported_at: new Date().toISOString(),
  };

  const outputPath = `session_${sessionId}_export.json`;
  await Bun.write(outputPath, JSON.stringify(conversation, null, 2));
  
  console.log(`${c.green}✓ Exported to ${outputPath}${c.reset}`);
  console.log(`  ${c.dim}Session:${c.reset} ${session.title}`);
  console.log(`  ${c.dim}Messages:${c.reset} ${messages.length}`);
  console.log(`  ${c.dim}Total parts:${c.reset} ${conversation.messages.reduce((a, m) => a + m.parts.length, 0)}`);
}

async function cmdWatch() {
  console.log(`${c.bold}${c.cyan}Watching for new messages...${c.reset}\n`);
  console.log(`${c.dim}Press Ctrl+C to stop${c.reset}\n`);

  // Track seen messages
  const seenMessages = new Set<string>();

  // Initial scan
  const sessions = getAllSessions();
  for (const session of sessions) {
    const messages = getMessagesForSession(session.id);
    for (const msg of messages) {
      seenMessages.add(msg.id);
    }
  }

  console.log(`${c.dim}Loaded ${seenMessages.size} existing messages${c.reset}\n`);

  // Watch the messages directory
  if (!existsSync(OC_PATHS.messages)) {
    console.log(`${c.red}Messages directory not found: ${OC_PATHS.messages}${c.reset}`);
    return;
  }

  // Poll for changes (file watching is unreliable across filesystems)
  const checkForNew = () => {
    const sessions = getAllSessions();
    for (const session of sessions) {
      const messages = getMessagesForSession(session.id);
      for (const msg of messages) {
        if (!seenMessages.has(msg.id)) {
          seenMessages.add(msg.id);
          
          const roleColor = msg.role === "user" ? c.blue : c.green;
          const roleIcon = msg.role === "user" ? "👤" : "🤖";
          
          console.log(
            `${c.yellow}NEW${c.reset} ` +
            `${roleIcon} ${roleColor}${msg.role}${c.reset} ` +
            `in ${c.cyan}${truncate(session.title, 30)}${c.reset} ` +
            `${c.dim}(${session.id})${c.reset}`
          );

          if (msg.summary?.title) {
            console.log(`    ${msg.summary.title}`);
          }

          // Get first text part
          const parts = getPartsForMessage(msg.id);
          const textPart = parts.find((p) => p.type === "text" && p.text);
          if (textPart?.text) {
            console.log(`    ${c.dim}${truncate(textPart.text.replace(/\n/g, " "), 70)}${c.reset}`);
          }
          console.log();
        }
      }
    }
  };

  // Check every 2 seconds
  setInterval(checkForNew, 2000);

  // Keep running
  process.on("SIGINT", () => {
    console.log(`\n${c.dim}Stopped watching.${c.reset}`);
    process.exit(0);
  });

  // Prevent exit
  await new Promise(() => {});
}

async function cmdStats() {
  console.log(`${c.bold}${c.cyan}OpenCode Statistics${c.reset}\n`);

  const sessions = getAllSessions();
  
  let totalMessages = 0;
  let totalParts = 0;
  let totalToolCalls = 0;
  const toolUsage: Record<string, number> = {};
  const sessionsByDay: Record<string, number> = {};

  for (const session of sessions) {
    const messages = getMessagesForSession(session.id);
    totalMessages += messages.length;

    for (const msg of messages) {
      const parts = getPartsForMessage(msg.id);
      totalParts += parts.length;

      for (const part of parts) {
        // Handle both old (toolName) and new (tool) field names
        const toolName = part.tool || part.toolName;
        if ((part.type === "tool-invocation" || part.type === "tool") && toolName) {
          totalToolCalls++;
          toolUsage[toolName] = (toolUsage[toolName] || 0) + 1;
        }
      }
    }

    // Track sessions by day
    const day = new Date(session.time.created).toLocaleDateString();
    sessionsByDay[day] = (sessionsByDay[day] || 0) + 1;
  }

  console.log(`${c.cyan}Sessions:${c.reset} ${sessions.length}`);
  console.log(`${c.cyan}Messages:${c.reset} ${totalMessages}`);
  console.log(`${c.cyan}Parts:${c.reset} ${totalParts}`);
  console.log(`${c.cyan}Tool Calls:${c.reset} ${totalToolCalls}`);

  console.log(`\n${c.bold}Top Tools:${c.reset}`);
  const sortedTools = Object.entries(toolUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  for (const [tool, count] of sortedTools) {
    const bar = "█".repeat(Math.min(20, Math.ceil(count / sortedTools[0][1] * 20)));
    console.log(`  ${c.cyan}${tool.padEnd(25)}${c.reset} ${bar} ${count}`);
  }

  console.log(`\n${c.bold}Recent Activity (by day):${c.reset}`);
  const recentDays = Object.entries(sessionsByDay)
    .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
    .slice(0, 7);
  
  for (const [day, count] of recentDays) {
    const bar = "█".repeat(Math.min(20, count * 2));
    console.log(`  ${c.dim}${day.padEnd(12)}${c.reset} ${bar} ${count} sessions`);
  }
}

async function cmdSync() {
  console.log(`${c.bold}${c.cyan}Syncing OpenCode sessions to memory system...${c.reset}\n`);

  const sessions = getAllSessions();
  const outputPath = getMemoryPath("opencode-sessions.json");
  const cachePath = getMemoryPath(".sync-cache.json");
  
  // Load existing cache to track which sessions were already synced
  const cache = sharedReadJson<SyncCache>(cachePath, {
    synced_at: "",
    last_session_id: "",
    synced_session_ids: [],
  });
  
  const syncedIds = new Set(cache.synced_session_ids);
  const newSessions: OpenCodeSession[] = [];
  const recentSessions: OpenCodeSession[] = [];
  
  // Identify new sessions and recent sessions (last 24h)
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const session of sessions) {
    if (!syncedIds.has(session.id)) {
      newSessions.push(session);
    }
    if (session.time.updated > oneDayAgo) {
      recentSessions.push(session);
    }
  }
  
  console.log(`${c.dim}Found ${sessions.length} total sessions${c.reset}`);
  console.log(`${c.dim}New sessions: ${newSessions.length}, Recent (24h): ${recentSessions.length}${c.reset}\n`);
  
  // Process sessions to sync (new + recent for updates)
  const sessionsToProcess = [...new Set([...newSessions, ...recentSessions])];
  const processedSessions: SyncedSession[] = [];
  
  let processed = 0;
  for (const session of sessionsToProcess.slice(0, 50)) { // Limit to 50 sessions per sync
    const detailed = getDetailedSessionData(session);
    processedSessions.push(detailed);
    syncedIds.add(session.id);
    processed++;
    
    if (processed % 10 === 0) {
      process.stdout.write(`\r${c.dim}Processed ${processed}/${sessionsToProcess.length} sessions...${c.reset}`);
    }
  }
  
  if (processed > 0) {
    console.log(`\r${c.dim}Processed ${processed} sessions${c.reset}                    `);
  }
  
  // Load existing sessions data and merge
  const existingData = sharedReadJson<SessionsData>(outputPath, {
    synced_at: "",
    total_sessions: 0,
    sessions: [],
  });
  
  // Merge sessions (update existing, add new)
  const sessionMap = new Map<string, SyncedSession>();
  for (const s of existingData.sessions) {
    sessionMap.set(s.id, s);
  }
  for (const s of processedSessions) {
    sessionMap.set(s.id, s);
  }
  
  // Sort by updated time
  const allSyncedSessions = Array.from(sessionMap.values())
    .sort((a, b) => b.updated - a.updated);
  
  // Write updated sessions data
  const sessionsData: SessionsData = {
    synced_at: new Date().toISOString(),
    total_sessions: allSyncedSessions.length,
    sessions: allSyncedSessions,
  };
  
  writeJson(outputPath, sessionsData);
  
  // Update cache
  const newCache: SyncCache = {
    synced_at: new Date().toISOString(),
    last_session_id: sessions[0]?.id || "",
    synced_session_ids: Array.from(syncedIds),
  };
  writeJson(cachePath, newCache);
  
  console.log(`\n${c.green}✓ Synced ${processed} sessions to memory/opencode-sessions.json${c.reset}`);
  console.log(`${c.dim}Total sessions in database: ${allSyncedSessions.length}${c.reset}`);
  
  // Show top tools from new sessions
  if (processedSessions.length > 0) {
    const toolCounts: Record<string, number> = {};
    for (const s of processedSessions) {
      for (const [tool, count] of Object.entries(s.tools_used)) {
        toolCounts[tool] = (toolCounts[tool] || 0) + count;
      }
    }
    
    const topTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    if (topTools.length > 0) {
      console.log(`\n${c.cyan}Top tools in synced sessions:${c.reset}`);
      for (const [tool, count] of topTools) {
        console.log(`  ${c.dim}•${c.reset} ${tool}: ${count}`);
      }
    }
  }
}

interface LearningInsight {
  type: "pattern" | "issue" | "technique" | "discovery";
  title: string;
  description: string;
  frequency?: number;
  sessions: string[];
  extracted_at: string;
}

async function cmdLearn(days: number = 7) {
  console.log(`${c.bold}${c.cyan}Extracting learnings from recent sessions...${c.reset}\n`);
  
  const sessions = getAllSessions();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const recentSessions = sessions.filter(s => s.time.updated > cutoff);
  
  console.log(`${c.dim}Analyzing ${recentSessions.length} sessions from the last ${days} days${c.reset}\n`);
  
  // Collect patterns
  const toolUsage: Record<string, { count: number; sessions: Set<string> }> = {};
  const topicsFound: Record<string, { count: number; sessions: Set<string> }> = {};
  const filePatterns: Record<string, number> = {};
  const errorPatterns: string[] = [];
  const discoveries: LearningInsight[] = [];
  
  for (const session of recentSessions.slice(0, 30)) {
    const messages = getMessagesForSession(session.id);
    
    for (const msg of messages) {
      const parts = getPartsForMessage(msg.id);
      
      for (const part of parts) {
        // Track tool usage
        const toolName = part.tool || part.toolName;
        if ((part.type === "tool-invocation" || part.type === "tool") && toolName) {
          if (!toolUsage[toolName]) {
            toolUsage[toolName] = { count: 0, sessions: new Set() };
          }
          toolUsage[toolName].count++;
          toolUsage[toolName].sessions.add(session.id);
        }
        
        // Look for errors in tool results
        if (part.type === "tool-result" && part.result) {
          const resultStr = typeof part.result === "string" ? part.result : JSON.stringify(part.result);
          if (resultStr.toLowerCase().includes("error") || resultStr.toLowerCase().includes("failed")) {
            errorPatterns.push(truncate(resultStr, 100));
          }
        }
        
        // Extract text patterns for discoveries
        if (part.type === "text" && part.text && msg.role === "assistant") {
          // Look for explicit discoveries/learnings
          const text = part.text;
          
          // Pattern: "I discovered/learned/found that..."
          const discoveryMatches = text.match(/(?:discovered|learned|found|realized|noticed)\s+that\s+([^.!?]+[.!?])/gi);
          if (discoveryMatches) {
            for (const match of discoveryMatches.slice(0, 3)) {
              discoveries.push({
                type: "discovery",
                title: truncate(match, 80),
                description: match,
                sessions: [session.id],
                extracted_at: new Date().toISOString(),
              });
            }
          }
          
          // Pattern: "The issue was/problem was..."
          const issueMatches = text.match(/(?:the issue|the problem|the bug|fixed by)\s+(?:was|is)\s+([^.!?]+[.!?])/gi);
          if (issueMatches) {
            for (const match of issueMatches.slice(0, 2)) {
              discoveries.push({
                type: "issue",
                title: truncate(match, 80),
                description: match,
                sessions: [session.id],
                extracted_at: new Date().toISOString(),
              });
            }
          }
        }
      }
      
      // Track topics from summaries
      if (msg.summary?.title) {
        const topic = msg.summary.title.toLowerCase();
        if (!topicsFound[topic]) {
          topicsFound[topic] = { count: 0, sessions: new Set() };
        }
        topicsFound[topic].count++;
        topicsFound[topic].sessions.add(session.id);
      }
    }
    
    // Track file change patterns
    if (session.summary?.files) {
      const dir = session.directory.split("/").pop() || "unknown";
      filePatterns[dir] = (filePatterns[dir] || 0) + session.summary.files;
    }
  }
  
  // Generate insights
  const insights: LearningInsight[] = [...discoveries];
  
  // Tool usage patterns
  const sortedTools = Object.entries(toolUsage)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10);
  
  if (sortedTools.length > 0) {
    console.log(`${c.bold}Tool Usage Patterns:${c.reset}`);
    for (const [tool, data] of sortedTools) {
      const bar = "█".repeat(Math.min(20, Math.ceil(data.count / sortedTools[0][1].count * 20)));
      console.log(`  ${c.cyan}${tool.padEnd(25)}${c.reset} ${bar} ${data.count} (${data.sessions.size} sessions)`);
    }
    
    // Add most used tool as insight
    insights.push({
      type: "pattern",
      title: `Most used tool: ${sortedTools[0][0]}`,
      description: `${sortedTools[0][0]} was used ${sortedTools[0][1].count} times across ${sortedTools[0][1].sessions.size} sessions`,
      frequency: sortedTools[0][1].count,
      sessions: Array.from(sortedTools[0][1].sessions),
      extracted_at: new Date().toISOString(),
    });
  }
  
  // Common topics
  const sortedTopics = Object.entries(topicsFound)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);
  
  if (sortedTopics.length > 0) {
    console.log(`\n${c.bold}Common Topics:${c.reset}`);
    for (const [topic, data] of sortedTopics) {
      console.log(`  ${c.dim}•${c.reset} ${truncate(topic, 60)} (${data.count}x)`);
    }
  }
  
  // Error summary
  if (errorPatterns.length > 0) {
    console.log(`\n${c.bold}${c.yellow}Errors encountered:${c.reset} ${errorPatterns.length}`);
    const uniqueErrors = [...new Set(errorPatterns)].slice(0, 3);
    for (const err of uniqueErrors) {
      console.log(`  ${c.red}•${c.reset} ${truncate(err, 70)}`);
    }
  }
  
  // Discoveries
  if (discoveries.length > 0) {
    console.log(`\n${c.bold}${c.green}Discoveries:${c.reset}`);
    for (const d of discoveries.slice(0, 5)) {
      console.log(`  ${c.green}•${c.reset} ${d.title}`);
    }
  }
  
  // Save insights to knowledge base
  if (insights.length > 0) {
    const knowledgePath = MEMORY_PATHS.knowledgeBase;
    const existing = sharedReadJson<any[]>(knowledgePath, []);
    
    // Add new insights (avoid exact duplicates)
    const existingTitles = new Set(existing.map(e => e.title || e.session_id));
    const newInsights = insights.filter(i => !existingTitles.has(i.title));
    
    if (newInsights.length > 0) {
      const updated = [...existing, ...newInsights];
      writeJson(knowledgePath, updated);
      console.log(`\n${c.green}✓ Added ${newInsights.length} new insights to knowledge-base.json${c.reset}`);
    } else {
      console.log(`\n${c.dim}No new unique insights to add${c.reset}`);
    }
  }
  
  console.log(`\n${c.dim}Analysis complete. Run 'sync' to save detailed session data.${c.reset}`);
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "sessions";

  // Check if OpenCode storage exists
  if (!existsSync(OPENCODE_STORAGE)) {
    console.log(`${c.red}OpenCode storage not found at: ${OPENCODE_STORAGE}${c.reset}`);
    console.log(`${c.dim}Make sure OpenCode is installed and has been used at least once.${c.reset}`);
    process.exit(1);
  }

  switch (command) {
    case "sessions":
      await cmdSessions(parseInt(args[1]) || 20);
      break;

    case "messages":
      if (!args[1]) {
        console.log(`${c.red}Usage: bun tools/opencode-tracker.ts messages <sessionId>${c.reset}`);
        // Show recent sessions to help
        console.log(`\n${c.dim}Recent sessions:${c.reset}`);
        const recent = getAllSessions().slice(0, 5);
        for (const s of recent) {
          console.log(`  ${s.id} - ${truncate(s.title, 40)}`);
        }
        process.exit(1);
      }
      await cmdMessages(args[1]);
      break;

    case "export":
      if (!args[1]) {
        console.log(`${c.red}Usage: bun tools/opencode-tracker.ts export <sessionId>${c.reset}`);
        process.exit(1);
      }
      await cmdExport(args[1]);
      break;

    case "watch":
      await cmdWatch();
      break;

    case "stats":
      await cmdStats();
      break;

    case "sync":
      await cmdSync();
      break;

    case "learn":
      const learningDays = parseInt(args[1]) || 7;
      await cmdLearn(learningDays);
      break;

    case "help":
    case "--help":
    case "-h":
      console.log(`
${c.bold}OpenCode Conversation Tracker${c.reset}

Track and log all OpenCode conversations.

${c.cyan}Commands:${c.reset}
  sessions [limit]     List all sessions with metadata
  messages <sessionId> Show all messages for a session
  export <sessionId>   Export full conversation as JSON
  watch               Watch for new messages in real-time
  stats               Show statistics
  sync                Sync OpenCode sessions to memory system
  learn [days]        Extract learnings from recent sessions (default: 7 days)

${c.cyan}Examples:${c.reset}
  bun tools/opencode-tracker.ts sessions
  bun tools/opencode-tracker.ts messages ses_xxx
  bun tools/opencode-tracker.ts watch
  bun tools/opencode-tracker.ts stats
  bun tools/opencode-tracker.ts sync
  bun tools/opencode-tracker.ts learn 14
`);
      break;

    default:
      console.log(`${c.red}Unknown command: ${command}${c.reset}`);
      console.log(`${c.dim}Run with --help for usage information${c.reset}`);
      process.exit(1);
  }
}

main().catch(console.error);
