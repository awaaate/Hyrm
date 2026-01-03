#!/usr/bin/env bun
/**
 * OpenCode Session Tracker (Primary Tool)
 * 
 * The main tool for tracking and analyzing OpenCode conversations.
 * Reads from OpenCode's native storage at ~/.local/share/opencode/storage/
 * 
 * NOTE: This supersedes tools/conversation-tracker.ts which is now deprecated.
 * 
 * Commands:
 *   sessions [limit]     - List all sessions with metadata, tool counts, duration
 *   messages <sessionId> - Show all messages for a session
 *   view <sessionId>     - Full conversation view with tool calls formatted nicely
 *   tools <sessionId>    - Show all tool calls with inputs/outputs
 *   search <query> [limit] - Search across sessions (messages, tools, outputs)
 *   export <sessionId>   - Export full conversation as JSON
 *   watch               - Watch for new messages in real-time
 *   stats               - Show statistics about all sessions
 *   sync                - Sync OpenCode sessions to our memory system (memory/opencode-sessions.json)
 *   learn [limit]       - Extract learnings and patterns from recent sessions
 * 
 * Examples:
 *   bun tools/opencode-tracker.ts sessions 20
 *   bun tools/opencode-tracker.ts view ses_xxx
 *   bun tools/opencode-tracker.ts tools ses_xxx
 *   bun tools/opencode-tracker.ts search "error" 30
 *   bun tools/opencode-tracker.ts sync && bun tools/opencode-tracker.ts learn
 */

import { existsSync } from "fs";

// Import shared utilities - use centralized data fetchers
import {
  c,
  readJson as sharedReadJson,
  writeJson,
  truncate as sharedTruncate,
  PATHS as MEMORY_PATHS,
  getMemoryPath,
  // OpenCode data fetchers from shared/data-fetchers.ts
  OPENCODE_STORAGE,
  OPENCODE_PATHS,
  isOpenCodeStorageAvailable,
  getAllOpenCodeSessions,
  getOpenCodeSessionById,
  getOpenCodeMessagesForSession,
  getOpenCodePartsForMessage,
  getOpenCodeToolCalls,
  getOpenCodeSessionStats,
  getOpenCodeToolUsageStats,
  getOpenCodeAggregateTokenStats,
  searchOpenCodeSessions,
  // Re-export types
  type OpenCodeSession,
  type OpenCodeMessage,
  type OpenCodePart,
  type ToolCallInfo,
  type OpenCodeSessionStatsResult,
  type AggregateTokenStats,
} from "./shared";

// ============================================================================
// Local Helper Functions (formatting only - data fetching is in shared/)
// ============================================================================

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

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

function formatJsonCompact(obj: unknown, maxLen: number = 200): string {
  if (obj === null || obj === undefined) return c.dim + "null" + c.reset;
  if (typeof obj === "string") return truncate(obj.replace(/\n/g, "\\n"), maxLen);
  try {
    const str = JSON.stringify(obj, null, 2);
    if (str.length > maxLen) {
      return str.slice(0, maxLen) + c.dim + "..." + c.reset;
    }
    return str;
  } catch {
    return String(obj);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTokens(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function formatCost(cost: number): string {
  if (cost === 0) return "$0.00";
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
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
  const messages = getOpenCodeMessagesForSession(session.id);
  const toolUsage: Record<string, number> = {};
  const keyTopics: string[] = [];
  const userQueries: string[] = [];
  
  for (const msg of messages) {
    // Collect user queries (first part of user messages)
    if (msg.role === "user") {
      const parts = getOpenCodePartsForMessage(msg.id);
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
      
      const parts = getOpenCodePartsForMessage(msg.id);
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
async function cmdSessions(limit: number = 20, verbose: boolean = false) {
  console.log(`${c.bold}${c.cyan}OpenCode Sessions${c.reset}\n`);

  const sessions = getAllOpenCodeSessions(limit);

  if (sessions.length === 0) {
    console.log(`${c.dim}No sessions found in ${OPENCODE_PATHS.sessions}${c.reset}`);
    return;
  }

  console.log(`${c.dim}Found ${sessions.length} sessions (showing up to ${limit})${c.reset}\n`);

  for (const session of sessions) {
    const timeAgo = formatTimeAgo(session.time.updated);
    const isRecent = Date.now() - session.time.updated < 3600000; // Last hour
    
    // Get enhanced stats using shared data fetchers
    const stats = getOpenCodeSessionStats(session.id);

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
    
    // Show tool count, duration, and tokens
    const tokenInfo = stats.tokens.total > 0 
      ? `  ${c.cyan}Tokens:${c.reset} ${formatTokens(stats.tokens.total)} (${formatTokens(stats.tokens.input)}in/${formatTokens(stats.tokens.output)}out)`
      : "";
    const costInfo = stats.cost > 0 ? ` ${c.dim}${formatCost(stats.cost)}${c.reset}` : "";
    
    console.log(
      `  ${c.cyan}Tools:${c.reset} ${stats.toolCount} calls  ` +
      `${c.cyan}Duration:${c.reset} ${formatDuration(stats.duration)}` +
      tokenInfo + costInfo
    );
    
    if (session.summary?.files) {
      console.log(
        `  ${c.cyan}Files:${c.reset} ${session.summary.files} ` +
        `${c.green}+${session.summary.additions || 0}${c.reset} ` +
        `${c.red}-${session.summary.deletions || 0}${c.reset}`
      );
    }
    
    // NEW: Show topics summary
    if (stats.topics.length > 0) {
      console.log(
        `  ${c.cyan}Topics:${c.reset} ${c.dim}${stats.topics.join(", ")}${c.reset}`
      );
    }
    
    if (session.share?.url) {
      console.log(`  ${c.cyan}Share:${c.reset} ${session.share.url}`);
    }
    console.log();
  }
  
  console.log(`${c.dim}Tip: Use 'view <session_id>' for full conversation, 'tools <session_id>' for tool calls${c.reset}`);
}

async function cmdMessages(sessionId: string) {
  console.log(`${c.bold}${c.cyan}Messages for Session: ${sessionId}${c.reset}\n`);

  const messages = getOpenCodeMessagesForSession(sessionId);

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
    const parts = getOpenCodePartsForMessage(msg.id);
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

// NEW: Full conversation view with all details
async function cmdView(sessionId: string) {
  console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}${c.cyan}  FULL CONVERSATION VIEW: ${sessionId}${c.reset}`);
  console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}\n`);

  // Find session info
  const allSessions = getAllOpenCodeSessions();
  const session = allSessions.find(s => s.id === sessionId);
  
  if (session) {
    console.log(`${c.bold}Session Info:${c.reset}`);
    console.log(`  ${c.cyan}Title:${c.reset} ${session.title}`);
    console.log(`  ${c.cyan}Directory:${c.reset} ${session.directory}`);
    console.log(`  ${c.cyan}Created:${c.reset} ${formatTime(session.time.created)}`);
    console.log(`  ${c.cyan}Updated:${c.reset} ${formatTime(session.time.updated)}`);
    if (session.summary?.files) {
      console.log(`  ${c.cyan}Files:${c.reset} ${session.summary.files} ${c.green}+${session.summary.additions || 0}${c.reset} ${c.red}-${session.summary.deletions || 0}${c.reset}`);
    }
    console.log();
  }

  const messages = getOpenCodeMessagesForSession(sessionId);

  if (messages.length === 0) {
    console.log(`${c.dim}No messages found for session ${sessionId}${c.reset}`);
    return;
  }

  console.log(`${c.dim}Total: ${messages.length} messages${c.reset}\n`);
  console.log(`${c.dim}───────────────────────────────────────────────────────────────${c.reset}\n`);

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const roleColor = msg.role === "user" ? c.blue : c.green;
    const roleBg = msg.role === "user" ? c.bgBlue : c.bgGreen;
    const roleIcon = msg.role === "user" ? "USER" : "ASSISTANT";
    
    // Message header
    console.log(`${roleBg}${c.white}${c.bold} ${roleIcon} ${c.reset} ${c.dim}[${i + 1}/${messages.length}] ${formatTime(msg.time.created)}${c.reset}`);
    
    if (msg.summary?.title) {
      console.log(`${c.dim}Summary: ${msg.summary.title}${c.reset}`);
    }
    console.log();

    // Get all parts for this message
    const parts = getOpenCodePartsForMessage(msg.id);
    
    for (const part of parts) {
      const toolName = part.tool || part.toolName;
      
      switch (part.type) {
        case "text":
          if (part.text) {
            // Format text with proper line wrapping
            const lines = part.text.split("\n");
            for (const line of lines) {
              if (line.trim()) {
                console.log(`  ${roleColor}│${c.reset} ${line}`);
              } else {
                console.log(`  ${roleColor}│${c.reset}`);
              }
            }
          }
          break;
          
        case "tool":
        case "tool-invocation":
          if (toolName) {
            console.log(`  ${c.yellow}┌─ 🔧 TOOL: ${c.bold}${toolName}${c.reset}`);
            
            // Show input/args
            const input = part.args || part.state?.input;
            if (input) {
              console.log(`  ${c.yellow}│${c.reset} ${c.cyan}Input:${c.reset}`);
              const inputStr = formatJsonCompact(input, 500);
              for (const line of inputStr.split("\n").slice(0, 10)) {
                console.log(`  ${c.yellow}│${c.reset}   ${c.dim}${line}${c.reset}`);
              }
            }
            
            // Show state if available
            if (part.state?.status) {
              const statusColor = part.state.status === "completed" ? c.green : 
                                  part.state.status === "error" ? c.red : c.yellow;
              console.log(`  ${c.yellow}│${c.reset} ${c.cyan}Status:${c.reset} ${statusColor}${part.state.status}${c.reset}`);
            }
          }
          break;
          
        case "tool-result":
          const output = part.result || part.state?.output;
          if (output !== undefined) {
            console.log(`  ${c.green}│${c.reset} ${c.cyan}Output:${c.reset}`);
            const outputStr = formatJsonCompact(output, 500);
            for (const line of outputStr.split("\n").slice(0, 15)) {
              console.log(`  ${c.green}│${c.reset}   ${c.dim}${line}${c.reset}`);
            }
            console.log(`  ${c.green}└───────────────────────${c.reset}`);
          }
          break;
          
        case "reasoning":
          if (part.text) {
            console.log(`  ${c.magenta}💭 Reasoning:${c.reset}`);
            const reasonLines = part.text.split("\n").slice(0, 5);
            for (const line of reasonLines) {
              console.log(`  ${c.magenta}│${c.reset} ${c.dim}${truncate(line, 100)}${c.reset}`);
            }
          }
          break;
          
        case "step-start":
          console.log(`  ${c.dim}── Step Start ──${c.reset}`);
          break;
          
        default:
          // Show other part types in dim
          if (part.text) {
            console.log(`  ${c.dim}[${part.type}] ${truncate(part.text, 80)}${c.reset}`);
          }
      }
    }
    
    console.log();
    console.log(`${c.dim}───────────────────────────────────────────────────────────────${c.reset}\n`);
  }
  
  // Summary at the end
  const stats = getOpenCodeSessionStats(sessionId);
  console.log(`${c.bold}Summary:${c.reset}`);
  console.log(`  ${c.cyan}Messages:${c.reset} ${messages.length}`);
  console.log(`  ${c.cyan}Tool Calls:${c.reset} ${stats.toolCount}`);
  console.log(`  ${c.cyan}Duration:${c.reset} ${formatDuration(stats.duration)}`);
  if (stats.topics.length > 0) {
    console.log(`  ${c.cyan}Topics:${c.reset} ${stats.topics.join(", ")}`);
  }
  
  // Token summary
  if (stats.tokens.total > 0) {
    console.log(`\n${c.bold}Token Usage:${c.reset}`);
    console.log(`  ${c.cyan}Total:${c.reset} ${formatTokens(stats.tokens.total)}`);
    console.log(`  ${c.cyan}Input:${c.reset} ${formatTokens(stats.tokens.input)} | ${c.cyan}Output:${c.reset} ${formatTokens(stats.tokens.output)}`);
    if (stats.tokens.reasoning > 0) {
      console.log(`  ${c.cyan}Reasoning:${c.reset} ${formatTokens(stats.tokens.reasoning)}`);
    }
    console.log(`  ${c.cyan}Cache:${c.reset} ${formatTokens(stats.tokens.cacheRead)} read / ${formatTokens(stats.tokens.cacheWrite)} write`);
    if (stats.cost > 0) {
      console.log(`  ${c.cyan}Cost:${c.reset} ${formatCost(stats.cost)}`);
    }
  }
}

// NEW: Show all tool calls for a session
async function cmdTools(sessionId: string) {
  console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}${c.cyan}  TOOL CALLS: ${sessionId}${c.reset}`);
  console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}\n`);

  const toolCalls = getOpenCodeToolCalls(sessionId);

  if (toolCalls.length === 0) {
    console.log(`${c.dim}No tool calls found for session ${sessionId}${c.reset}`);
    return;
  }

  console.log(`${c.dim}Total: ${toolCalls.length} tool calls${c.reset}\n`);

  // Group tools by name for summary
  const toolSummary: Record<string, { count: number; totalDuration: number }> = {};
  
  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i];
    
    // Update summary
    if (!toolSummary[tc.tool]) {
      toolSummary[tc.tool] = { count: 0, totalDuration: 0 };
    }
    toolSummary[tc.tool].count++;
    if (tc.duration) {
      toolSummary[tc.tool].totalDuration += tc.duration;
    }
    
    // Status color
    const statusColor = tc.status === "completed" ? c.green :
                        tc.status === "error" ? c.red : c.yellow;
    const statusIcon = tc.status === "completed" ? "✓" :
                       tc.status === "error" ? "✗" : "⋯";
    
    console.log(`${c.bold}[${i + 1}]${c.reset} ${c.yellow}${tc.tool}${c.reset} ${statusColor}${statusIcon}${c.reset}`);
    
    if (tc.duration) {
      console.log(`    ${c.cyan}Duration:${c.reset} ${formatDuration(tc.duration)}`);
    }
    if (tc.timestamp) {
      console.log(`    ${c.cyan}Time:${c.reset} ${formatTime(tc.timestamp)}`);
    }
    
    // Show input
    console.log(`    ${c.cyan}Input:${c.reset}`);
    const inputStr = formatJsonCompact(tc.input, 300);
    for (const line of inputStr.split("\n").slice(0, 8)) {
      console.log(`      ${c.dim}${line}${c.reset}`);
    }
    
    // Show output
    if (tc.output !== null) {
      console.log(`    ${c.cyan}Output:${c.reset}`);
      const outputStr = formatJsonCompact(tc.output, 300);
      const outputLines = outputStr.split("\n").slice(0, 8);
      for (const line of outputLines) {
        const isError = line.toLowerCase().includes("error");
        console.log(`      ${isError ? c.red : c.dim}${line}${c.reset}`);
      }
    }
    
    console.log();
  }
  
  // Print summary
  console.log(`${c.dim}───────────────────────────────────────────────────────────────${c.reset}`);
  console.log(`${c.bold}Tool Summary:${c.reset}`);
  
  const sortedTools = Object.entries(toolSummary)
    .sort((a, b) => b[1].count - a[1].count);
  
  for (const [tool, data] of sortedTools) {
    const avgDuration = data.totalDuration > 0 ? formatDuration(data.totalDuration / data.count) : "-";
    const bar = "█".repeat(Math.min(20, data.count));
    console.log(`  ${c.cyan}${tool.padEnd(25)}${c.reset} ${bar} ${data.count}x ${c.dim}(avg: ${avgDuration})${c.reset}`);
  }
}

// NEW: Search across sessions
async function cmdSearch(query: string, limit: number = 20) {
  console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}${c.cyan}  SEARCH: "${query}"${c.reset}`);
  console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}\n`);

  const sessions = getAllOpenCodeSessions();
  const queryLower = query.toLowerCase();
  
  interface SearchResult {
    sessionId: string;
    sessionTitle: string;
    type: "message" | "tool" | "output" | "title";
    content: string;
    timestamp: number;
    messageId?: string;
  }
  
  const results: SearchResult[] = [];
  
  for (const session of sessions) {
    // Search in session title
    if (session.title.toLowerCase().includes(queryLower)) {
      results.push({
        sessionId: session.id,
        sessionTitle: session.title,
        type: "title",
        content: session.title,
        timestamp: session.time.updated,
      });
    }
    
    const messages = getOpenCodeMessagesForSession(session.id);
    
    for (const msg of messages) {
      const parts = getOpenCodePartsForMessage(msg.id);
      
      for (const part of parts) {
        const toolName = part.tool || part.toolName;
        
        // Search in text content
        if (part.type === "text" && part.text?.toLowerCase().includes(queryLower)) {
          results.push({
            sessionId: session.id,
            sessionTitle: session.title,
            type: "message",
            content: part.text,
            timestamp: msg.time.created,
            messageId: msg.id,
          });
        }
        
        // Search in tool names
        if (toolName?.toLowerCase().includes(queryLower)) {
          results.push({
            sessionId: session.id,
            sessionTitle: session.title,
            type: "tool",
            content: toolName,
            timestamp: msg.time.created,
            messageId: msg.id,
          });
        }
        
        // Search in tool inputs/outputs
        const input = part.args || part.state?.input;
        const output = part.result || part.state?.output;
        
        if (input) {
          const inputStr = JSON.stringify(input).toLowerCase();
          if (inputStr.includes(queryLower)) {
            results.push({
              sessionId: session.id,
              sessionTitle: session.title,
              type: "tool",
              content: `${toolName || "tool"} input: ${truncate(JSON.stringify(input), 100)}`,
              timestamp: msg.time.created,
              messageId: msg.id,
            });
          }
        }
        
        if (output) {
          const outputStr = JSON.stringify(output).toLowerCase();
          if (outputStr.includes(queryLower)) {
            results.push({
              sessionId: session.id,
              sessionTitle: session.title,
              type: "output",
              content: `${toolName || "tool"} output: ${truncate(JSON.stringify(output), 100)}`,
              timestamp: msg.time.created,
              messageId: msg.id,
            });
          }
        }
      }
    }
    
    // Early exit if we have enough results
    if (results.length >= limit * 2) break;
  }
  
  // Sort by timestamp (most recent first) and limit
  results.sort((a, b) => b.timestamp - a.timestamp);
  const limitedResults = results.slice(0, limit);
  
  if (limitedResults.length === 0) {
    console.log(`${c.dim}No results found for "${query}"${c.reset}`);
    return;
  }
  
  console.log(`${c.dim}Found ${results.length} matches (showing ${limitedResults.length})${c.reset}\n`);
  
  for (const result of limitedResults) {
    const typeColor = result.type === "message" ? c.blue :
                      result.type === "tool" ? c.yellow :
                      result.type === "output" ? c.green : c.cyan;
    const typeIcon = result.type === "message" ? "💬" :
                     result.type === "tool" ? "🔧" :
                     result.type === "output" ? "📤" : "📋";
    
    console.log(`${typeIcon} ${typeColor}[${result.type.toUpperCase()}]${c.reset} ${c.dim}${formatTimeAgo(result.timestamp)}${c.reset}`);
    console.log(`   ${c.cyan}Session:${c.reset} ${truncate(result.sessionTitle, 50)}`);
    console.log(`   ${c.cyan}ID:${c.reset} ${c.dim}${result.sessionId}${c.reset}`);
    
    // Highlight the query in content
    const contentPreview = truncate(result.content.replace(/\n/g, " "), 120);
    const highlightedContent = contentPreview.replace(
      new RegExp(`(${query})`, "gi"),
      `${c.bgYellow}${c.black}$1${c.reset}`
    );
    console.log(`   ${highlightedContent}`);
    console.log();
  }
  
  // Show session summary
  const sessionIds = [...new Set(limitedResults.map(r => r.sessionId))];
  console.log(`${c.dim}───────────────────────────────────────────────────────────────${c.reset}`);
  console.log(`${c.bold}Sessions with matches:${c.reset} ${sessionIds.length}`);
  for (const sid of sessionIds.slice(0, 5)) {
    const session = sessions.find(s => s.id === sid);
    console.log(`  ${c.dim}•${c.reset} ${sid.slice(0, 20)}... - ${truncate(session?.title || "", 40)}`);
  }
  
  console.log(`\n${c.dim}Tip: Use 'view <session_id>' to see full conversation${c.reset}`);
}

async function cmdExport(sessionId: string) {
  console.log(`${c.bold}${c.cyan}Exporting Session: ${sessionId}${c.reset}\n`);

  // Find the session
  const allSessions = getAllOpenCodeSessions();
  const session = allSessions.find((s) => s.id === sessionId);

  if (!session) {
    console.log(`${c.red}Session not found: ${sessionId}${c.reset}`);
    return;
  }

  const messages = getOpenCodeMessagesForSession(sessionId);
  const conversation = {
    session,
    messages: messages.map((msg) => ({
      ...msg,
      parts: getOpenCodePartsForMessage(msg.id),
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
  const sessions = getAllOpenCodeSessions();
  for (const session of sessions) {
    const messages = getOpenCodeMessagesForSession(session.id);
    for (const msg of messages) {
      seenMessages.add(msg.id);
    }
  }

  console.log(`${c.dim}Loaded ${seenMessages.size} existing messages${c.reset}\n`);

  // Watch the messages directory
  if (!existsSync(OPENCODE_PATHS.messages)) {
    console.log(`${c.red}Messages directory not found: ${OPENCODE_PATHS.messages}${c.reset}`);
    return;
  }

  // Poll for changes (file watching is unreliable across filesystems)
  const checkForNew = () => {
    const sessions = getAllOpenCodeSessions();
    for (const session of sessions) {
      const messages = getOpenCodeMessagesForSession(session.id);
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
          const parts = getOpenCodePartsForMessage(msg.id);
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

  const sessions = getAllOpenCodeSessions();
  
  let totalMessages = 0;
  let totalParts = 0;
  let totalToolCalls = 0;
  const toolUsage: Record<string, number> = {};
  const sessionsByDay: Record<string, number> = {};

  for (const session of sessions) {
    const messages = getOpenCodeMessagesForSession(session.id);
    totalMessages += messages.length;

    for (const msg of messages) {
      const parts = getOpenCodePartsForMessage(msg.id);
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

  // Token statistics
  console.log(`\n${c.bold}Token Usage:${c.reset}`);
  const tokenStats = getOpenCodeAggregateTokenStats(sessions.length);
  
  console.log(`  ${c.cyan}Total Tokens:${c.reset} ${formatTokens(tokenStats.tokens.total)}`);
  console.log(`    ${c.dim}Input:${c.reset}     ${formatTokens(tokenStats.tokens.input)}`);
  console.log(`    ${c.dim}Output:${c.reset}    ${formatTokens(tokenStats.tokens.output)}`);
  if (tokenStats.tokens.reasoning > 0) {
    console.log(`    ${c.dim}Reasoning:${c.reset} ${formatTokens(tokenStats.tokens.reasoning)}`);
  }
  console.log(`    ${c.dim}Cache R:${c.reset}   ${formatTokens(tokenStats.tokens.cacheRead)}`);
  console.log(`    ${c.dim}Cache W:${c.reset}   ${formatTokens(tokenStats.tokens.cacheWrite)}`);
  
  console.log(`  ${c.cyan}Total Cost:${c.reset} ${formatCost(tokenStats.cost)}`);
  console.log(`  ${c.cyan}Sessions w/tokens:${c.reset} ${tokenStats.sessionsWithTokens}/${tokenStats.totalSessions}`);
  
  console.log(`  ${c.cyan}Avg per Session:${c.reset}`);
  console.log(`    ${c.dim}Total:${c.reset}  ${formatTokens(tokenStats.averagePerSession.total)}`);
  console.log(`    ${c.dim}Input:${c.reset}  ${formatTokens(tokenStats.averagePerSession.input)}`);
  console.log(`    ${c.dim}Output:${c.reset} ${formatTokens(tokenStats.averagePerSession.output)}`);

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

  const sessions = getAllOpenCodeSessions();
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
  
  const sessions = getAllOpenCodeSessions();
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
    const messages = getOpenCodeMessagesForSession(session.id);
    
    for (const msg of messages) {
      const parts = getOpenCodePartsForMessage(msg.id);
      
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
    const existing = sharedReadJson<LearningInsight[]>(knowledgePath, []);
    
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

/**
 * Show detailed token usage for sessions
 */
async function cmdTokens(sessionIdOrLimit?: string) {
  // If arg is a session ID, show tokens for that session
  if (sessionIdOrLimit && sessionIdOrLimit.startsWith("ses_")) {
    const sessionId = sessionIdOrLimit;
    console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}`);
    console.log(`${c.bold}${c.cyan}  TOKEN USAGE: ${sessionId}${c.reset}`);
    console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}\n`);
    
    const session = getOpenCodeSessionById(sessionId);
    if (!session) {
      console.log(`${c.red}Session not found: ${sessionId}${c.reset}`);
      return;
    }
    
    console.log(`${c.cyan}Title:${c.reset} ${session.title}`);
    console.log(`${c.cyan}Updated:${c.reset} ${formatTimeAgo(session.time.updated)}\n`);
    
    const stats = getOpenCodeSessionStats(sessionId);
    
    // Token breakdown table
    console.log(`${c.bold}Token Breakdown:${c.reset}`);
    console.log(`  ┌─────────────────┬────────────┬──────────┐`);
    console.log(`  │ ${c.bold}Type${c.reset}            │ ${c.bold}Tokens${c.reset}     │ ${c.bold}%${c.reset}        │`);
    console.log(`  ├─────────────────┼────────────┼──────────┤`);
    
    const total = stats.tokens.total || 1; // Avoid division by zero
    const pct = (n: number) => ((n / total) * 100).toFixed(1).padStart(6) + "%";
    
    console.log(`  │ ${c.cyan}Input${c.reset}           │ ${formatTokens(stats.tokens.input).padStart(10)} │ ${pct(stats.tokens.input)} │`);
    console.log(`  │ ${c.cyan}Output${c.reset}          │ ${formatTokens(stats.tokens.output).padStart(10)} │ ${pct(stats.tokens.output)} │`);
    if (stats.tokens.reasoning > 0) {
      console.log(`  │ ${c.cyan}Reasoning${c.reset}       │ ${formatTokens(stats.tokens.reasoning).padStart(10)} │ ${pct(stats.tokens.reasoning)} │`);
    }
    console.log(`  ├─────────────────┼────────────┼──────────┤`);
    console.log(`  │ ${c.bold}Total${c.reset}           │ ${formatTokens(stats.tokens.total).padStart(10)} │  100.0% │`);
    console.log(`  └─────────────────┴────────────┴──────────┘`);
    
    console.log(`\n${c.bold}Cache Usage:${c.reset}`);
    console.log(`  ${c.cyan}Cache Read:${c.reset}  ${formatTokens(stats.tokens.cacheRead)}`);
    console.log(`  ${c.cyan}Cache Write:${c.reset} ${formatTokens(stats.tokens.cacheWrite)}`);
    
    const cacheHitRate = stats.tokens.input > 0 
      ? ((stats.tokens.cacheRead / (stats.tokens.input + stats.tokens.cacheRead)) * 100).toFixed(1)
      : "0.0";
    console.log(`  ${c.cyan}Cache Hit Rate:${c.reset} ${cacheHitRate}%`);
    
    if (stats.cost > 0) {
      console.log(`\n${c.bold}Cost:${c.reset} ${formatCost(stats.cost)}`);
    }
    
    return;
  }
  
  // Otherwise show aggregate tokens for recent sessions
  const limit = parseInt(sessionIdOrLimit || "20") || 20;
  
  console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}`);
  console.log(`${c.bold}${c.cyan}  TOKEN USAGE SUMMARY (Last ${limit} Sessions)${c.reset}`);
  console.log(`${c.bold}${c.cyan}═══════════════════════════════════════════════════════════════${c.reset}\n`);
  
  const sessions = getAllOpenCodeSessions(limit);
  const aggregateStats = getOpenCodeAggregateTokenStats(limit);
  
  // Aggregate stats
  console.log(`${c.bold}Aggregate Statistics:${c.reset}`);
  console.log(`  ${c.cyan}Total Tokens:${c.reset} ${formatTokens(aggregateStats.tokens.total)}`);
  console.log(`    Input:     ${formatTokens(aggregateStats.tokens.input)}`);
  console.log(`    Output:    ${formatTokens(aggregateStats.tokens.output)}`);
  if (aggregateStats.tokens.reasoning > 0) {
    console.log(`    Reasoning: ${formatTokens(aggregateStats.tokens.reasoning)}`);
  }
  console.log(`  ${c.cyan}Cache Usage:${c.reset}`);
  console.log(`    Read:      ${formatTokens(aggregateStats.tokens.cacheRead)}`);
  console.log(`    Write:     ${formatTokens(aggregateStats.tokens.cacheWrite)}`);
  console.log(`  ${c.cyan}Total Cost:${c.reset} ${formatCost(aggregateStats.cost)}`);
  console.log(`  ${c.cyan}Sessions:${c.reset} ${aggregateStats.sessionsWithTokens}/${aggregateStats.totalSessions} have token data`);
  console.log(`  ${c.cyan}Avg/Session:${c.reset} ${formatTokens(aggregateStats.averagePerSession.total)}`);
  
  // Per-session breakdown
  console.log(`\n${c.bold}Per-Session Breakdown:${c.reset}\n`);
  
  // Header
  console.log(
    `  ${c.dim}${"Session".padEnd(20)}${c.reset} ` +
    `${c.dim}${"Title".padEnd(25)}${c.reset} ` +
    `${c.dim}${"Tokens".padStart(10)}${c.reset} ` +
    `${c.dim}${"In".padStart(8)}${c.reset} ` +
    `${c.dim}${"Out".padStart(8)}${c.reset} ` +
    `${c.dim}${"Cost".padStart(8)}${c.reset}`
  );
  console.log(`  ${c.dim}${"─".repeat(85)}${c.reset}`);
  
  for (const session of sessions) {
    const stats = getOpenCodeSessionStats(session.id);
    
    if (stats.tokens.total === 0) continue; // Skip sessions without token data
    
    const shortId = session.id.slice(-15);
    const title = truncate(session.title, 23);
    
    console.log(
      `  ${c.cyan}${shortId.padEnd(20)}${c.reset} ` +
      `${title.padEnd(25)} ` +
      `${formatTokens(stats.tokens.total).padStart(10)} ` +
      `${formatTokens(stats.tokens.input).padStart(8)} ` +
      `${formatTokens(stats.tokens.output).padStart(8)} ` +
      `${formatCost(stats.cost).padStart(8)}`
    );
  }
  
  console.log(`\n${c.dim}Tip: Use 'tokens <sessionId>' for detailed session breakdown${c.reset}`);
}

/**
 * Show session tree - parent-child relationships
 * Visualizes which orchestrator spawned which workers
 */
async function cmdTree(limit: number = 50) {
  console.log(`\n${c.bold}${c.blue}SESSION TREE${c.reset}\n`);
  
  const sessions = getAllOpenCodeSessions().slice(0, limit);
  
  // Build parent-child map
  const children: Record<string, string[]> = {};
  const sessionMap: Record<string, OpenCodeSession> = {};
  const rootSessions: OpenCodeSession[] = [];
  
  for (const session of sessions) {
    sessionMap[session.id] = session;
    
    if (session.parentID) {
      if (!children[session.parentID]) {
        children[session.parentID] = [];
      }
      children[session.parentID].push(session.id);
    } else {
      rootSessions.push(session);
    }
  }
  
  // Helper to format session line
  const formatSession = (session: OpenCodeSession, indent: string, isLast: boolean): string => {
    const connector = isLast ? "└── " : "├── ";
    const stats = getOpenCodeSessionStats(session.id);
    const duration = stats.duration > 0 ? `${Math.round(stats.duration / 60)}m` : "?";
    const toolCount = stats.toolCount > 0 ? `${stats.toolCount} tools` : "";
    
    const time = new Date(session.time.created);
    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;
    
    // Determine session type based on title
    let icon = "📄";
    const titleLower = (session.title || "").toLowerCase();
    if (titleLower.includes("orchestrator") || titleLower.includes("main")) {
      icon = "🎯";
    } else if (titleLower.includes("worker") || titleLower.includes("subagent")) {
      icon = "⚙️";
    } else if (titleLower.includes("explore")) {
      icon = "🔍";
    } else if (titleLower.includes("code") || titleLower.includes("build")) {
      icon = "💻";
    } else if (titleLower.includes("memory")) {
      icon = "🧠";
    }
    
    const title = truncate(session.title || "(no title)", 40);
    const meta = [timeStr, duration, toolCount].filter(Boolean).join(", ");
    
    return `${indent}${connector}${icon} ${c.cyan}${session.id.slice(-12)}${c.reset} ${title} ${c.dim}(${meta})${c.reset}`;
  };
  
  // Recursive tree printer
  const printTree = (sessionId: string, indent: string = "", isLast: boolean = true) => {
    const session = sessionMap[sessionId];
    if (!session) return;
    
    console.log(formatSession(session, indent, isLast));
    
    const childIds = children[sessionId] || [];
    const nextIndent = indent + (isLast ? "    " : "│   ");
    
    childIds.forEach((childId, i) => {
      printTree(childId, nextIndent, i === childIds.length - 1);
    });
  };
  
  // Count relationships
  const sessionsWithParent = sessions.filter(s => s.parentID).length;
  const sessionsWithChildren = Object.keys(children).length;
  
  console.log(`${c.dim}Found ${sessions.length} sessions, ${sessionsWithParent} with parents, ${sessionsWithChildren} with children${c.reset}\n`);
  
  // Print root sessions and their trees
  let treeCount = 0;
  for (const root of rootSessions) {
    // Only show trees that have children, or standalone sessions
    const hasChildren = children[root.id] && children[root.id].length > 0;
    
    if (hasChildren) {
      console.log(`${c.bold}Session Tree #${++treeCount}${c.reset}`);
      printTree(root.id);
      console.log("");
    }
  }
  
  // Show orphan sessions (have parentID but parent not in our list)
  const orphans = sessions.filter(s => s.parentID && !sessionMap[s.parentID]);
  if (orphans.length > 0) {
    console.log(`\n${c.yellow}Orphan Sessions${c.reset} (parent not in recent list):`);
    for (const orphan of orphans.slice(0, 10)) {
      const stats = getOpenCodeSessionStats(orphan.id);
      console.log(`  ${c.dim}↳${c.reset} ${c.cyan}${orphan.id.slice(-12)}${c.reset} ${truncate(orphan.title || "(no title)", 35)} (parent: ${orphan.parentID?.slice(-12)})`);
    }
  }
  
  // Show standalone sessions without children
  const standalones = rootSessions.filter(s => !children[s.id] || children[s.id].length === 0);
  if (standalones.length > 0 && standalones.length < 20) {
    console.log(`\n${c.dim}Standalone Sessions (no parent/children):${c.reset}`);
    for (const s of standalones.slice(0, 10)) {
      const stats = getOpenCodeSessionStats(s.id);
      const time = new Date(s.time.created);
      const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;
      console.log(`  📄 ${c.cyan}${s.id.slice(-12)}${c.reset} ${truncate(s.title || "(no title)", 40)} ${c.dim}(${timeStr}, ${stats.toolCount} tools)${c.reset}`);
    }
    if (standalones.length > 10) {
      console.log(`  ${c.dim}... and ${standalones.length - 10} more${c.reset}`);
    }
  }
  
  console.log(`\n${c.dim}Tip: Use 'view <sessionId>' to see full conversation${c.reset}`);
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
        const recent = getAllOpenCodeSessions().slice(0, 5);
        for (const s of recent) {
          console.log(`  ${s.id} - ${truncate(s.title, 40)}`);
        }
        process.exit(1);
      }
      await cmdMessages(args[1]);
      break;

    case "view":
      if (!args[1]) {
        console.log(`${c.red}Usage: bun tools/opencode-tracker.ts view <sessionId>${c.reset}`);
        console.log(`\n${c.dim}Recent sessions:${c.reset}`);
        const recentView = getAllOpenCodeSessions().slice(0, 5);
        for (const s of recentView) {
          console.log(`  ${s.id} - ${truncate(s.title, 40)}`);
        }
        process.exit(1);
      }
      await cmdView(args[1]);
      break;

    case "tools":
      if (!args[1]) {
        console.log(`${c.red}Usage: bun tools/opencode-tracker.ts tools <sessionId>${c.reset}`);
        console.log(`\n${c.dim}Recent sessions:${c.reset}`);
        const recentTools = getAllOpenCodeSessions().slice(0, 5);
        for (const s of recentTools) {
          const stats = getOpenCodeSessionStats(s.id);
          console.log(`  ${s.id} - ${truncate(s.title, 30)} (${stats.toolCount} tools)`);
        }
        process.exit(1);
      }
      await cmdTools(args[1]);
      break;

    case "search":
      if (!args[1]) {
        console.log(`${c.red}Usage: bun tools/opencode-tracker.ts search <query> [limit]${c.reset}`);
        console.log(`\n${c.cyan}Examples:${c.reset}`);
        console.log(`  bun tools/opencode-tracker.ts search "error"`);
        console.log(`  bun tools/opencode-tracker.ts search "task_create" 50`);
        console.log(`  bun tools/opencode-tracker.ts search "memory" 10`);
        process.exit(1);
      }
      await cmdSearch(args[1], parseInt(args[2]) || 20);
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

    case "tree":
      await cmdTree(parseInt(args[1]) || 50);
      break;

    case "tokens":
      await cmdTokens(args[1]);
      break;

    case "help":
    case "--help":
    case "-h":
      console.log(`
${c.bold}OpenCode Conversation Tracker${c.reset}

Track and log all OpenCode conversations with full traceability.

${c.cyan}Commands:${c.reset}
  ${c.bold}View & Inspect:${c.reset}
  sessions [limit]     List all sessions with metadata, tool counts, tokens
  messages <sessionId> Show all messages for a session (compact)
  view <sessionId>     Full conversation view with all parts and tool I/O
  tools <sessionId>    Show all tool calls with inputs/outputs
  tokens [limit|id]    Show token usage (aggregate or per-session)
  search <query>       Search across sessions (messages, tools, outputs)

  ${c.bold}Export & Sync:${c.reset}
  export <sessionId>   Export full conversation as JSON
  sync                 Sync OpenCode sessions to memory system

  ${c.bold}Analysis:${c.reset}
  stats                Show statistics across all sessions (incl. tokens)
  learn [days]         Extract learnings from recent sessions (default: 7 days)
  tree [limit]         Show parent-child session relationships (default: 50)

  ${c.bold}Real-time:${c.reset}
  watch                Watch for new messages in real-time

${c.cyan}Examples:${c.reset}
  ${c.dim}# List recent sessions with tool counts and tokens${c.reset}
  bun tools/opencode-tracker.ts sessions

  ${c.dim}# View full conversation with all tool calls${c.reset}
  bun tools/opencode-tracker.ts view ses_xxx

  ${c.dim}# See all tool calls for a session${c.reset}
  bun tools/opencode-tracker.ts tools ses_xxx

  ${c.dim}# Show token usage summary for recent sessions${c.reset}
  bun tools/opencode-tracker.ts tokens

  ${c.dim}# Show detailed token breakdown for a session${c.reset}
  bun tools/opencode-tracker.ts tokens ses_xxx

  ${c.dim}# Search for error messages${c.reset}
  bun tools/opencode-tracker.ts search "error"

  ${c.dim}# Search for specific tool usage${c.reset}
  bun tools/opencode-tracker.ts search "task_create" 30
`);
      break;

    default:
      console.log(`${c.red}Unknown command: ${command}${c.reset}`);
      console.log(`${c.dim}Run with --help for usage information${c.reset}`);
      process.exit(1);
  }
}

main().catch(console.error);
