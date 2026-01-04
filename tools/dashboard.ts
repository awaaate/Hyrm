#!/usr/bin/env bun
/**
 * OpenCode Interactive Dashboard v3.0
 * 
 * Terminal UI with timeline view for the multi-agent system.
 * 
 * Usage:
 *   bun tools/dashboard.ts [mode]
 * 
 * Modes: timeline, agents, tasks, sessions, tokens, logs
 * 
 * Keys:
 *   1-6     Switch views
 *   j/k     Navigate
 *   Enter   View session details
 *   n       New task
 *   m       Send message
 *   c       Claim task
 *   :       Command mode
 *   ?       Help
 *   q       Quit
 */

import * as blessed from "blessed";
import * as contrib from "blessed-contrib";
import { existsSync, watch, FSWatcher } from "fs";
import {
  // Data fetchers
  getAllAgents,
  getActiveAgents,
  getAllTasks,
  getMessages,
  getUserMessages,
  getSystemState,
  getAllOpenCodeSessions,
  getOpenCodeMessagesForSession,
  getOpenCodePartsForMessage,
  getOpenCodeSessionStats,
  getOpenCodeAggregateTokenStats,
  getOpenCodeSessionById,
  // Actions
  createTask,
  claimTask,
  sendUserMessage,
  // Utils
  truncate,
  formatTimeAgo,
  PATHS,
  logWarning,
  getErrorMessage,
  type OpenCodeSession,
} from "./shared";

// ============================================================================
// TYPES
// ============================================================================

interface TimelineEvent {
  id: string;
  timestamp: number;
  type: string;
  source: string;
  title: string;
  details?: string;
  color: string;
  icon: string;
}

interface ViewMode {
  name: string;
  key: string;
  label: string;
}

const VIEW_MODES: ViewMode[] = [
  { name: "timeline", key: "1", label: "Timeline" },
  { name: "agents", key: "2", label: "Agents" },
  { name: "tasks", key: "3", label: "Tasks" },
  { name: "sessions", key: "4", label: "Sessions" },
  { name: "tokens", key: "5", label: "Tokens" },
  { name: "logs", key: "6", label: "Logs" },
];

// ============================================================================
// STATE
// ============================================================================

let currentMode = "timeline";
let selectedIndex = 0;
let commandMode = false;
let commandBuffer = "";
let watchers: FSWatcher[] = [];
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let viewingSession: OpenCodeSession | null = null; // For session detail view

// ============================================================================
// SCREEN SETUP
// ============================================================================

const screen = blessed.screen({
  smartCSR: true,
  title: "OpenCode Dashboard",
});

const grid = new contrib.grid({ rows: 12, cols: 12, screen });

const headerBox = grid.set(0, 0, 1, 12, blessed.box, {
  tags: true,
  style: { fg: "white", bg: "blue" },
});

const mainBox = grid.set(1, 0, 9, 12, blessed.box, {
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  vi: true,
  mouse: true,
  border: { type: "line", fg: "cyan" },
  scrollbar: { ch: " ", track: { bg: "black" }, style: { inverse: true } },
  style: { fg: "white", bg: "black" },
});

const detailBox = grid.set(10, 0, 1, 12, blessed.box, {
  tags: true,
  style: { fg: "white", bg: "black" },
  border: { type: "line", fg: "grey" },
});

const statusBar = grid.set(11, 0, 1, 12, blessed.box, {
  tags: true,
  style: { fg: "white", bg: "black" },
});

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Escape curly braces to prevent blessed from interpreting them as style tags.
 * Blessed uses {color-fg} syntax for styling, so raw { } in content causes errors.
 */
function escapeBlessedTags(str: string): string {
  if (!str) return "";
  // Replace { with \{ and } with \} to escape them
  // But blessed doesn't actually support escaping, so we just remove them or replace with alternatives
  return str.replace(/\{/g, "(").replace(/\}/g, ")");
}

// ============================================================================
// DATA BUILDING
// ============================================================================

function buildTimeline(limit: number = 100): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Agent messages
  for (const msg of getMessages(30, true)) {
    let details = "";
    if (msg.payload) {
      details = typeof msg.payload === "string" ? msg.payload : JSON.stringify(msg.payload).slice(0, 80);
    }
    events.push({
      id: `msg_${msg.timestamp}`,
      timestamp: new Date(msg.timestamp).getTime(),
      type: "message",
      source: msg.from_agent || msg.from || "?",
      title: `[${msg.type}] ${msg.from_agent || msg.from || "?"}`,
      details,
      color: msg.type.includes("task") ? "yellow" : "cyan",
      icon: "M",
    });
  }

  // User messages
  for (const msg of getUserMessages(20)) {
    events.push({
      id: msg.id,
      timestamp: new Date(msg.timestamp).getTime(),
      type: "user_message",
      source: msg.from,
      title: `[USER] ${msg.from}`,
      details: msg.message,
      color: msg.read ? "white" : "green",
      icon: msg.priority === "urgent" ? "!" : "U",
    });
  }

  // OpenCode sessions and recent tool calls
  try {
    for (const session of getAllOpenCodeSessions(15)) {
      events.push({
        id: session.id,
        timestamp: session.time.created,
        type: "session",
        source: "opencode",
        title: `[SESSION] ${truncate(session.title, 35)}`,
        details: session.directory,
        color: "magenta",
        icon: "S",
      });

      // Recent tool calls from this session
      const msgs = getOpenCodeMessagesForSession(session.id).slice(-3);
      for (const msg of msgs) {
        for (const part of getOpenCodePartsForMessage(msg.id)) {
          if (part.type === "tool" || part.type === "tool-invocation") {
            events.push({
              id: part.id,
              timestamp: msg.time.created,
              type: "tool",
              source: session.id.slice(-12),
              title: `[TOOL] ${part.tool || part.toolName || "?"}`,
              details: truncate(JSON.stringify(part.args || {}), 60),
              color: "yellow",
              icon: "W",
            });
          }
        }
      }
    }
  } catch (error) {
    logWarning("Failed to load OpenCode sessions for timeline", { error: getErrorMessage(error) });
  }

  // Tasks
  for (const task of getAllTasks().slice(0, 15)) {
    const ts = task.updated_at || task.created_at;
    if (ts) {
      events.push({
        id: task.id,
        timestamp: new Date(ts).getTime(),
        type: "task",
        source: task.assigned_to || "-",
        title: `[TASK:${task.status.toUpperCase()}] ${truncate(task.title, 30)}`,
        color: task.status === "completed" ? "green" : task.status === "in_progress" ? "yellow" : "cyan",
        icon: task.priority === "critical" ? "!" : "T",
      });
    }
  }

  return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

function formatTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}



// ============================================================================
// RENDERING
// ============================================================================

function render(): void {
  const agents = getActiveAgents();
  const tasks = getAllTasks().filter(t => t.status === "pending" || t.status === "in_progress");
  const unread = getUserMessages(100, true).length;
  const time = new Date().toLocaleTimeString();

  // Build visual tabs
  let tabs = "";
  for (const m of VIEW_MODES) {
    if (m.name === currentMode) {
      tabs += `{inverse} ${m.key}:${m.label} {/inverse} `;
    } else {
      tabs += `{white-fg}${m.key}:${m.label}{/white-fg} `;
    }
  }

  // Header with tabs
  headerBox.setContent(
    ` {bold}{cyan-fg}OPENCODE{/cyan-fg}{/bold} ${tabs}` +
    `{|}{green-fg}A:${agents.length}{/green-fg} {yellow-fg}T:${tasks.length}{/yellow-fg} {cyan-fg}M:${unread}{/cyan-fg} ` +
    `{white-fg}${time}{/white-fg}`
  );

  // Status bar
  if (commandMode) {
    statusBar.setContent(` :${commandBuffer}_`);
  } else if (viewingSession) {
    statusBar.setContent(
      ` {bold}ESC{/bold}:Back {bold}j/k{/bold}:Scroll {bold}q{/bold}:Quit`
    );
  } else {
    statusBar.setContent(
      ` {bold}1-6{/bold}:View {bold}n{/bold}:New {bold}m{/bold}:Msg {bold}c{/bold}:Claim {bold}:{/bold}:Cmd {bold}?{/bold}:Help {bold}q{/bold}:Quit`
    );
  }

  // Main content - check for session detail view first
  if (viewingSession) {
    renderSessionDetail();
  } else {
    switch (currentMode) {
      case "timeline": renderTimeline(); break;
      case "agents": renderAgents(); break;
      case "tasks": renderTasks(); break;
      case "sessions": renderSessions(); break;
      case "tokens": renderTokens(); break;
      case "logs": renderLogs(); break;
      default: renderTimeline();
    }
  }

  screen.render();
}

function renderTimeline(): void {
  const events = buildTimeline(80);
  let content = `{bold}{cyan-fg}ACTIVITY TIMELINE{/cyan-fg}{/bold} {white-fg}(${events.length} events){/white-fg}\n{white-fg}${"─".repeat(65)}{/white-fg}\n\n`;

  if (events.length === 0) {
    content += "{white-fg}No activity yet.{/white-fg}\n";
  } else {
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      const sel = i === selectedIndex ? "{inverse}" : "";
      const end = i === selectedIndex ? "{/inverse}" : "";
      const ago = formatTimeAgo(new Date(e.timestamp).toISOString());
      
      const safeTitle = escapeBlessedTags(e.title);
      content += `${sel}{${e.color}-fg}${e.icon}{/${e.color}-fg} {white-fg}${ago.padEnd(5)}{/white-fg} ${safeTitle}${end}\n`;
      if (e.details) content += `      {white-fg}${truncate(escapeBlessedTags(e.details), 80)}{/white-fg}\n`;
    }
  }

  mainBox.setContent(content);
  mainBox.setLabel(" Timeline ");

  // Detail for selected
  const selected = events[selectedIndex];
  if (selected) {
    const safeTitle = escapeBlessedTags(selected.title);
    const safeSource = escapeBlessedTags(selected.source);
    detailBox.setContent(` {bold}${selected.type}{/bold}: ${safeTitle} {|}{white-fg}${safeSource}{/white-fg}`);
  }
}

function renderAgents(): void {
  const agents = getAllAgents();
  const now = Date.now();
  let content = `{bold}{green-fg}AGENTS{/green-fg}{/bold} {white-fg}(${agents.length}){/white-fg}\n{white-fg}${"─".repeat(65)}{/white-fg}\n\n`;

  if (agents.length === 0) {
    content += "{white-fg}No agents registered.{/white-fg}\n";
  } else {
    // Group by session
    const bySession: Record<string, typeof agents> = {};
    for (const a of agents) {
      const s = a.session_id || "unknown";
      (bySession[s] ||= []).push(a);
    }

    let idx = 0;
    for (const [session, list] of Object.entries(bySession)) {
      const active = list.some(a => now - new Date(a.last_heartbeat).getTime() < 120000);
      const col = active ? "green" : "white";
      content += `{${col}-fg}Session: ${truncate(session, 45)}{/${col}-fg}\n`;

      for (const a of list) {
        const sel = idx === selectedIndex ? "{inverse}" : "";
        const end = idx === selectedIndex ? "{/inverse}" : "";
        const isActive = now - new Date(a.last_heartbeat).getTime() < 120000;
        const icon = a.status === "working" ? "{yellow-fg}*{/yellow-fg}" : isActive ? "{green-fg}o{/green-fg}" : "{white-fg}o{/white-fg}";

        content += `${sel}  ${icon} ${escapeBlessedTags(a.agent_id)} [${a.assigned_role || "general"}] ${a.status}${end}\n`;
        if (a.current_task) content += `      {white-fg}${escapeBlessedTags(a.current_task)}{/white-fg}\n`;
        idx++;
      }
      content += "\n";
    }
  }

  mainBox.setContent(content);
  mainBox.setLabel(" Agents ");
}

function renderTasks(): void {
  const tasks = getAllTasks();
  const byStatus: Record<string, typeof tasks> = { in_progress: [], pending: [], completed: [] };
  for (const t of tasks) byStatus[t.status]?.push(t);

  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  for (const s of Object.keys(byStatus)) byStatus[s].sort((a, b) => (order[a.priority] || 4) - (order[b.priority] || 4));

  let content = `{bold}{yellow-fg}TASKS{/yellow-fg}{/bold} {white-fg}(${tasks.length}){/white-fg}\n{white-fg}${"─".repeat(65)}{/white-fg}\n\n`;
  let idx = 0;

  content += `{bold}{yellow-fg}IN PROGRESS{/yellow-fg}{/bold} (${byStatus.in_progress.length})\n`;
  for (const t of byStatus.in_progress.slice(0, 10)) {
    const sel = idx === selectedIndex ? "{inverse}" : "";
    const end = idx === selectedIndex ? "{/inverse}" : "";
    const pc = t.priority === "critical" ? "red" : t.priority === "high" ? "yellow" : "cyan";
    content += `${sel}  {${pc}-fg}[${t.priority[0].toUpperCase()}]{/${pc}-fg} ${escapeBlessedTags(t.title)}${end}\n`;
    idx++;
  }

  content += `\n{bold}{cyan-fg}PENDING{/cyan-fg}{/bold} (${byStatus.pending.length})\n`;
  for (const t of byStatus.pending.slice(0, 10)) {
    const sel = idx === selectedIndex ? "{inverse}" : "";
    const end = idx === selectedIndex ? "{/inverse}" : "";
    const pc = t.priority === "critical" ? "red" : t.priority === "high" ? "yellow" : "cyan";
    content += `${sel}  {${pc}-fg}[${t.priority[0].toUpperCase()}]{/${pc}-fg} ${escapeBlessedTags(t.title)}${end}\n`;
    idx++;
  }

  content += `\n{bold}{green-fg}COMPLETED{/green-fg}{/bold} (${byStatus.completed.length})\n`;
  for (const t of byStatus.completed.slice(-5).reverse()) {
    content += `  {green-fg}[*]{/green-fg} ${escapeBlessedTags(t.title)} {white-fg}${t.completed_at ? formatTimeAgo(t.completed_at) : ""}{/white-fg}\n`;
  }

  mainBox.setContent(content);
  mainBox.setLabel(" Tasks [n:New c:Claim] ");
}

function renderSessions(): void {
  let content = `{bold}{magenta-fg}OPENCODE SESSIONS{/magenta-fg}{/bold} {white-fg}(Enter to view){/white-fg}\n{white-fg}${"─".repeat(65)}{/white-fg}\n\n`;

  try {
    const sessions = getAllOpenCodeSessions(25);
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const sel = i === selectedIndex ? "{inverse}" : "";
      const end = i === selectedIndex ? "{/inverse}" : "";
      const stats = getOpenCodeSessionStats(s.id);
      const ago = formatTimeAgo(new Date(s.time.updated).toISOString());
      const recent = Date.now() - s.time.updated < 3600000;
      const col = recent ? "green" : "white";

      content += `${sel}{${col}-fg}*{/${col}-fg} {bold}${escapeBlessedTags(s.title || "Untitled")}{/bold}${end}\n`;
      content += `    {white-fg}${s.id.slice(-12)} | ${ago} | T:${stats.toolCount} | ${formatTokens(stats.tokens.total)}{/white-fg}\n`;
    }
  } catch (e) {
    content += `{red-fg}Error: ${e}{/red-fg}\n`;
  }

  mainBox.setContent(content);
  mainBox.setLabel(" Sessions [Enter:View] ");
}

function renderSessionDetail(): void {
  if (!viewingSession) return;

  const sessionTitle = escapeBlessedTags(viewingSession.title || viewingSession.id || "Unknown Session");
  const sessionDir = escapeBlessedTags(viewingSession.directory || "Unknown");
  
  const stats = getOpenCodeSessionStats(viewingSession.id);
  let content = `{bold}{magenta-fg}SESSION: ${sessionTitle}{/magenta-fg}{/bold}\n`;
  content += `{white-fg}${"─".repeat(65)}{/white-fg}\n`;
  content += `{white-fg}ID: ${viewingSession.id} | Dir: ${sessionDir}{/white-fg}\n`;
  content += `{white-fg}Tokens: ${formatTokens(stats.tokens.total)} (in:${formatTokens(stats.tokens.input)} out:${formatTokens(stats.tokens.output)}){/white-fg}\n\n`;

  const messages = getOpenCodeMessagesForSession(viewingSession.id);
  let toolCount = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isUser = msg.role === "user";
    const roleColor = isUser ? "blue" : "green";
    const roleIcon = isUser ? "USER" : "ASSISTANT";
    const timeAgo = formatTimeAgo(new Date(msg.time.created).toISOString());

    // Message header with color
    content += `{${roleColor}-fg}{bold}[${ roleIcon}]{/bold}{/${roleColor}-fg} {white-fg}[${i + 1}/${messages.length}] ${timeAgo}{/white-fg}\n`;

    // Get parts for this message
    const parts = getOpenCodePartsForMessage(msg.id);
    for (const part of parts) {
      if (part.type === "text" && part.text) {
        // Truncate long text content and escape curly braces
        const rawText = part.text.length > 500 ? part.text.slice(0, 500) + "..." : part.text;
        const text = escapeBlessedTags(rawText);
        const lines = text.split("\n").slice(0, 10);
        for (const line of lines) {
          content += `    ${line}\n`;
        }
        if (rawText.split("\n").length > 10) {
          content += `    {white-fg}... (${rawText.split("\n").length - 10} more lines){/white-fg}\n`;
        }
      } else if (part.type === "tool" || part.type === "tool-invocation") {
        toolCount++;
        const toolName = escapeBlessedTags(String(part.tool || part.toolName || "unknown"));
        const status = part.state?.status || "completed";
        const statusColor = status === "completed" ? "green" : status === "error" ? "red" : "yellow";

        content += `    {yellow-fg}[TOOL]{/yellow-fg} ${toolName} {${statusColor}-fg}(${status}){/${statusColor}-fg}\n`;
        
        // Show args (truncated) - get from part.args or part.state.input
        const args = part.args || part.state?.input;
        if (args) {
          const rawArgsStr = typeof args === "string" ? args : JSON.stringify(args);
          const argsStr = escapeBlessedTags(rawArgsStr);
          content += `      {white-fg}> ${argsStr.slice(0, 200)}${argsStr.length > 200 ? "..." : ""}{/white-fg}\n`;
        }
        
        // Show output (truncated) - get from part.result or part.state.output
        const output = part.result || part.state?.output;
        if (output !== undefined && output !== null) {
          const rawOutStr = typeof output === "string" ? output : JSON.stringify(output);
          const outStr = escapeBlessedTags(rawOutStr);
          content += `      {white-fg}< ${outStr.slice(0, 200)}${outStr.length > 200 ? "..." : ""}{/white-fg}\n`;
        }
      }
    }
    content += "\n";
  }

  // Summary
  content += `{white-fg}${"─".repeat(65)}{/white-fg}\n`;
  content += `{bold}Summary:{/bold} Messages: ${messages.length} | Tools: ${toolCount} | Tokens: ${formatTokens(stats.tokens.total)}\n`;

  mainBox.setContent(content);
  // Sanitize label to avoid blessed parsing issues with special characters
  const labelText = truncate(String(viewingSession.title || viewingSession.id || "Unknown"), 30)
    .replace(/[{}]/g, ""); // Remove curly braces that could be interpreted as tags
  mainBox.setLabel(` Session: ${labelText} [ESC:Back] `);
  detailBox.setContent(` {magenta-fg}Viewing session{/magenta-fg} | {bold}ESC{/bold} to go back | {bold}j/k{/bold} to scroll`);
}

function renderTokens(): void {
  let content = `{bold}{yellow-fg}TOKEN USAGE{/yellow-fg}{/bold}\n{white-fg}${"─".repeat(65)}{/white-fg}\n\n`;

  try {
    const stats = getOpenCodeAggregateTokenStats(50);
    content += `{bold}AGGREGATE{/bold}\n`;
    content += `  Total:      {cyan-fg}${formatTokens(stats.tokens.total)}{/cyan-fg}\n`;
    content += `  Input:      ${formatTokens(stats.tokens.input)}\n`;
    content += `  Output:     ${formatTokens(stats.tokens.output)}\n`;
    content += `  Cache Read: {green-fg}${formatTokens(stats.tokens.cacheRead)}{/green-fg}\n`;
    content += `  Avg/Sess:   ${formatTokens(stats.averagePerSession.total)}\n\n`;

    content += `{bold}BY SESSION{/bold}\n`;
    content += `{white-fg}${"Session".padEnd(18)} ${"Total".padStart(8)} ${"In".padStart(7)} ${"Out".padStart(7)}{/white-fg}\n`;

    for (const s of getAllOpenCodeSessions(12)) {
      const st = getOpenCodeSessionStats(s.id);
      if (st.tokens.total > 0) {
        content += `${truncate(s.title, 16).padEnd(18)} {cyan-fg}${formatTokens(st.tokens.total).padStart(8)}{/cyan-fg} `;
        content += `${formatTokens(st.tokens.input).padStart(7)} ${formatTokens(st.tokens.output).padStart(7)}\n`;
      }
    }
  } catch (e) {
    content += `{red-fg}Error: ${e}{/red-fg}\n`;
  }

  mainBox.setContent(content);
  mainBox.setLabel(" Tokens ");
}

function renderLogs(): void {
  let content = `{bold}{cyan-fg}LOGS{/cyan-fg}{/bold}\n{white-fg}${"─".repeat(65)}{/white-fg}\n\n`;

  try {
    if (existsSync(PATHS.realtimeLog)) {
      const lines = require("fs").readFileSync(PATHS.realtimeLog, "utf-8").trim().split("\n").slice(-50).reverse();
      for (const line of lines) {
        try {
          const log = JSON.parse(line);
          const lc = log.level === "ERROR" ? "red" : log.level === "WARN" ? "yellow" : "white";
          content += `{${lc}-fg}[${log.level || "INFO"}]{/${lc}-fg} {white-fg}${new Date(log.timestamp).toLocaleTimeString()}{/white-fg} ${log.message || ""}\n`;
        } catch {
          // Malformed JSON line, display as raw text
          content += `{white-fg}${line}{/white-fg}\n`;
        }
      }
    } else {
      content += "{white-fg}No logs yet.{/white-fg}\n";
    }
  } catch (error) {
    logWarning("Failed to read log file", { error: getErrorMessage(error) });
    content += "{red-fg}Error reading logs{/red-fg}\n";
  }

  mainBox.setContent(content);
  mainBox.setLabel(" Logs ");
}

// ============================================================================
// ACTIONS
// ============================================================================

function showNewTaskPrompt(): void {
  const prompt = blessed.prompt({
    parent: screen,
    top: "center",
    left: "center",
    width: 55,
    height: 8,
    border: { type: "line", fg: "yellow" },
    label: " New Task ",
    style: { fg: "white", bg: "black" },
  });

  prompt.input("Title:", "", (_, title) => {
    if (title?.trim()) {
      const list = blessed.list({
        parent: screen,
        top: "center",
        left: "center",
        width: 25,
        height: 8,
        border: { type: "line", fg: "yellow" },
        label: " Priority ",
        items: ["critical", "high", "medium", "low"],
        keys: true,
        vi: true,
        style: { selected: { bg: "yellow", fg: "black" } },
      });

      list.on("select", (item: any) => {
        const task = createTask(title.trim(), item.content);
        detailBox.setContent(` {green-fg}Created: ${truncate(task.title, 40)} [${task.priority}]{/green-fg}`);
        list.destroy();
        render();
      });

      list.key(["escape", "q"], () => { list.destroy(); screen.render(); });
      list.focus();
      screen.render();
    }
    prompt.destroy();
  });

  screen.render();
}

function showMessagePrompt(): void {
  const prompt = blessed.prompt({
    parent: screen,
    top: "center",
    left: "center",
    width: 55,
    height: 8,
    border: { type: "line", fg: "cyan" },
    label: " Send Message ",
    style: { fg: "white", bg: "black" },
  });

  prompt.input("Message:", "", (_, msg) => {
    if (msg?.trim()) {
      sendUserMessage(msg.trim());
      detailBox.setContent(` {green-fg}Message sent!{/green-fg}`);
      render();
    }
    prompt.destroy();
  });

  screen.render();
}

function claimTopTask(): void {
  const pending = getAllTasks().filter(t => t.status === "pending");
  if (pending.length === 0) {
    detailBox.setContent(` {yellow-fg}No pending tasks{/yellow-fg}`);
    screen.render();
    return;
  }

  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  pending.sort((a, b) => (order[a.priority] || 4) - (order[b.priority] || 4));

  if (claimTask(pending[0].id, "dashboard-user")) {
    detailBox.setContent(` {green-fg}Claimed: ${truncate(pending[0].title, 40)}{/green-fg}`);
  } else {
    detailBox.setContent(` {red-fg}Failed to claim{/red-fg}`);
  }
  render();
}

function executeCommand(cmd: string): void {
  const [c, ...args] = cmd.trim().split(/\s+/);
  switch (c) {
    case "q": case "quit": cleanup(); process.exit(0);
    case "n": case "new": showNewTaskPrompt(); break;
    case "m": case "msg": showMessagePrompt(); break;
    case "c": case "claim": claimTopTask(); break;
    case "r": case "refresh": render(); break;
    case "h": case "help": showHelp(); break;
    default:
      if (VIEW_MODES.find(v => v.name === c)) {
        currentMode = c;
        selectedIndex = 0;
        render();
      } else {
        detailBox.setContent(` {red-fg}Unknown: ${c}{/red-fg}`);
      }
  }
  commandMode = false;
  commandBuffer = "";
  screen.render();
}

function showHelp(): void {
  const box = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 50,
    height: 22,
    border: { type: "line", fg: "cyan" },
    label: " Help ",
    tags: true,
    content: `
{bold}OpenCode Dashboard{/bold}

{cyan-fg}VIEWS{/cyan-fg}
  1 Timeline   4 Sessions
  2 Agents     5 Tokens  
  3 Tasks      6 Logs

{cyan-fg}NAVIGATION{/cyan-fg}
  j/k    Up/Down
  Tab    Next view
  Enter  Select

{cyan-fg}ACTIONS{/cyan-fg}
  n  New task
  m  Send message
  c  Claim top task
  r  Refresh
  :  Command mode
  q  Quit

{white-fg}Press any key to close{/white-fg}
`,
    style: { fg: "white", bg: "black" },
  });

  box.key(["escape", "q", "enter", "space", "?"], () => { box.destroy(); screen.render(); });
  box.focus();
  screen.render();
}

// ============================================================================
// FILE WATCHING
// ============================================================================

function startWatching(): void {
  const files = [PATHS.agentRegistry, PATHS.tasks, PATHS.messageBus, PATHS.userMessages, PATHS.realtimeLog];
  let timeout: ReturnType<typeof setTimeout> | null = null;

  for (const f of files) {
    if (existsSync(f)) {
      try {
        watchers.push(watch(f, () => {
          if (timeout) clearTimeout(timeout);
          timeout = setTimeout(render, 100);
        }));
      } catch (error) {
        logWarning("Failed to watch file for changes", { file: f, error: getErrorMessage(error) });
      }
    }
  }
}

function cleanup(): void {
  watchers.forEach(w => w.close());
  if (refreshTimer) clearInterval(refreshTimer);
}

// ============================================================================
// KEY BINDINGS
// ============================================================================

screen.key(["q", "C-c"], () => { if (!commandMode) { cleanup(); process.exit(0); } });
screen.key(["r"], () => { if (!commandMode) render(); });
screen.key(["n"], () => { if (!commandMode) showNewTaskPrompt(); });
screen.key(["m"], () => { if (!commandMode) showMessagePrompt(); });
screen.key(["c"], () => { if (!commandMode) claimTopTask(); });
screen.key(["?", "h"], () => { if (!commandMode) showHelp(); });
screen.key([":"], () => { if (!commandMode) { commandMode = true; commandBuffer = ""; render(); } });

screen.key(["j", "down"], () => { if (!commandMode) { selectedIndex++; render(); } });
screen.key(["k", "up"], () => { if (!commandMode) { selectedIndex = Math.max(0, selectedIndex - 1); render(); } });

// Enter to view session details
screen.key(["enter"], () => {
  if (commandMode) return;
  if (viewingSession) return; // Already viewing
  
  if (currentMode === "sessions") {
    const sessions = getAllOpenCodeSessions(25);
    if (sessions[selectedIndex]) {
      viewingSession = sessions[selectedIndex];
      render();
    }
  }
});

// Escape to go back from session detail
screen.key(["escape"], () => {
  if (commandMode) {
    commandMode = false;
    commandBuffer = "";
    render();
    return;
  }
  if (viewingSession) {
    viewingSession = null;
    mainBox.scrollTo(0);
    render();
  }
});

screen.key(["tab"], () => {
  if (!commandMode && !viewingSession) {
    const i = VIEW_MODES.findIndex(m => m.name === currentMode);
    currentMode = VIEW_MODES[(i + 1) % VIEW_MODES.length].name;
    selectedIndex = 0;
    mainBox.scrollTo(0);
    render();
  }
});

screen.key(["S-tab"], () => {
  if (!commandMode && !viewingSession) {
    const i = VIEW_MODES.findIndex(m => m.name === currentMode);
    currentMode = VIEW_MODES[(i - 1 + VIEW_MODES.length) % VIEW_MODES.length].name;
    selectedIndex = 0;
    mainBox.scrollTo(0);
    render();
  }
});

for (const mode of VIEW_MODES) {
  screen.key([mode.key], () => {
    if (!commandMode) {
      currentMode = mode.name;
      selectedIndex = 0;
      mainBox.scrollTo(0);
      render();
    }
  });
}

screen.on("keypress", (ch: string, key: any) => {
  if (commandMode) {
    if (key.name === "return") executeCommand(commandBuffer);
    else if (key.name === "escape") { commandMode = false; commandBuffer = ""; render(); }
    else if (key.name === "backspace") { commandBuffer = commandBuffer.slice(0, -1); render(); }
    else if (ch && !key.ctrl && !key.meta) { commandBuffer += ch; render(); }
  }
});

// ============================================================================
// MAIN
// ============================================================================

const arg = process.argv[2];
if (arg && VIEW_MODES.find(m => m.name === arg)) currentMode = arg;

render();
startWatching();
refreshTimer = setInterval(render, 5000);
screen.render();
