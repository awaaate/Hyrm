#!/usr/bin/env bun
/**
 * Real-time System Monitor
 * 
 * A comprehensive real-time monitoring CLI with:
 * - File watching for instant updates (no polling delay)
 * - Multiple view modes (dashboard, agents, messages, tasks, logs)
 * - Color-coded status indicators
 * - Keyboard navigation
 * - Auto-scrolling log view
 * 
 * Usage:
 *   bun tools/realtime-monitor.ts [mode]
 * 
 * Modes:
 *   dashboard (default) - Full system overview
 *   agents              - Agent status only
 *   messages            - Agent messages stream
 *   tasks               - Task list
 *   logs                - Real-time log viewer
 *   all                 - All sections in detail
 */

import { existsSync, readFileSync, watch, FSWatcher } from "fs";
import { readJson, readJsonl, c, formatTimeShort, PATHS, truncate, padRight } from "./shared";

// ANSI escape code prefix (for screen control)
const ESC = "\x1b";

// Symbols
const sym = {
  bullet: "●",
  circle: "○",
  check: "✓",
  cross: "✗",
  arrow: "→",
  arrowUp: "↑",
  arrowDown: "↓",
  working: "⚙",
  blocked: "⛔",
  pending: "◌",
  clock: "⏱",
  fire: "🔥",
  star: "★",
  warning: "⚠",
};

// State
let mode = "dashboard";
let lastRender = 0;
let watchers: FSWatcher[] = [];
let termWidth = process.stdout.columns || 80;
let termHeight = process.stdout.rows || 24;

function clearScreen(): void {
  process.stdout.write(`${ESC}[2J${ESC}[H`);
}

function moveCursor(row: number, col: number): void {
  process.stdout.write(`${ESC}[${row};${col}H`);
}

function hideCursor(): void {
  process.stdout.write(`${ESC}[?25l`);
}

function showCursor(): void {
  process.stdout.write(`${ESC}[?25h`);
}

function getStatusColor(status: string): string {
  switch (status) {
    case "active":
    case "completed":
    case "orchestrator_active":
      return c.green;
    case "working":
    case "in_progress":
      return c.yellow;
    case "blocked":
    case "critical":
    case "error":
      return c.red;
    case "idle":
    case "pending":
      return c.cyan;
    default:
      return c.dim;
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case "critical":
      return c.red + c.bright;
    case "high":
      return c.yellow;
    case "medium":
      return c.cyan;
    case "low":
      return c.dim;
    default:
      return c.reset;
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "working":
      return sym.working;
    case "blocked":
      return sym.blocked;
    case "completed":
      return sym.check;
    case "pending":
      return sym.pending;
    case "in_progress":
      return sym.arrow;
    case "active":
      return sym.bullet;
    case "idle":
      return sym.circle;
    default:
      return sym.circle;
  }
}

// Data fetching
interface AgentData {
  agent_id: string;
  session_id?: string;
  assigned_role?: string;
  status: string;
  current_task?: string;
  last_heartbeat: string;
}

interface TaskData {
  id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  created_at?: string;
  assigned_to?: string;
}

interface MessageData {
  id?: string;
  message_id?: string;
  from?: string;
  from_agent?: string;
  type: string;
  timestamp: string;
  payload: any;
}

function getActiveAgents(): AgentData[] {
  const registry = readJson<{ agents: AgentData[] }>(PATHS.agentRegistry, { agents: [] });
  const twoMinutesAgo = Date.now() - 2 * 60 * 1000;

  return (registry.agents || []).filter((agent) => {
    const lastHB = new Date(agent.last_heartbeat).getTime();
    return lastHB > twoMinutesAgo;
  });
}

function getTasks(): TaskData[] {
  const taskStore = readJson<{ tasks: TaskData[] }>(PATHS.tasks, { tasks: [] });
  return taskStore.tasks || [];
}

function getMessages(limit: number = 50, excludeHeartbeats: boolean = true): MessageData[] {
  const messages = readJsonl<MessageData>(PATHS.messageBus);
  let filtered = excludeHeartbeats
    ? messages.filter((m) => m.type !== "heartbeat")
    : messages;
  return filtered.slice(-limit).reverse();
}

function getUserMessages(): any[] {
  return readJsonl<any>(PATHS.userMessages);
}

function getState(): any {
  return readJson<any>(PATHS.state, {});
}

function getQuality(): any {
  return readJson<any>(PATHS.qualityAssessments, { summary: {} });
}

function getRecentLogs(limit: number = 20): any[] {
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

// Render functions
function renderHeader(): void {
  const now = new Date().toLocaleTimeString();
  const title = ` OPENCODE REALTIME MONITOR `;
  const modeLabel = ` ${mode.toUpperCase()} `;

  console.log(
    `${c.bgBlue}${c.white}${c.bright}${title}${c.reset} ` +
    `${c.bgMagenta}${c.white}${modeLabel}${c.reset} ` +
    `${c.dim}${now}${c.reset}`
  );
  console.log();
}

function renderStatusBar(): void {
  const state = getState();
  const agents = getActiveAgents();
  const tasks = getTasks();
  const quality = getQuality();
  const userMsgs = getUserMessages();

  const pendingTasks = tasks.filter((t) => t.status === "pending" || t.status === "in_progress").length;
  const unreadMsgs = userMsgs.filter((m) => !m.read).length;

  const statusColor = getStatusColor(state.status || "unknown");

  console.log(
    `${c.cyan}Session:${c.reset} ${c.bright}${state.session_count || "?"}${c.reset} ` +
    `${c.dim}|${c.reset} ` +
    `${c.cyan}Status:${c.reset} ${statusColor}${state.status || "unknown"}${c.reset} ` +
    `${c.dim}|${c.reset} ` +
    `${c.cyan}Agents:${c.reset} ${c.bright}${agents.length}${c.reset} ` +
    `${c.dim}|${c.reset} ` +
    `${c.cyan}Tasks:${c.reset} ${c.bright}${pendingTasks}${c.reset} ` +
    `${c.dim}|${c.reset} ` +
    `${c.cyan}Quality:${c.reset} ${c.bright}${quality.summary?.average_score?.toFixed(1) || "?"}${c.reset}/10 ` +
    (unreadMsgs > 0 ? `${c.dim}|${c.reset} ${c.yellow}${c.bright}${unreadMsgs} unread${c.reset}` : "")
  );
  console.log();
}

function renderDivider(title?: string): void {
  const lineWidth = termWidth - 4;
  if (title) {
    const titlePart = ` ${title} `;
    const remaining = lineWidth - titlePart.length;
    const left = Math.floor(remaining / 2);
    const right = remaining - left;
    console.log(`${c.dim}${"─".repeat(left)}${c.reset}${c.bright}${titlePart}${c.reset}${c.dim}${"─".repeat(right)}${c.reset}`);
  } else {
    console.log(`${c.dim}${"─".repeat(lineWidth)}${c.reset}`);
  }
}

function renderAgentSection(detailed: boolean = false): void {
  const agents = getActiveAgents();

  renderDivider(`AGENTS (${agents.length})`);

  if (agents.length === 0) {
    console.log(`  ${c.dim}No active agents${c.reset}`);
    console.log();
    return;
  }

  // Group by role
  const byRole: Record<string, AgentData[]> = {};
  for (const agent of agents) {
    const role = agent.assigned_role || "general";
    if (!byRole[role]) byRole[role] = [];
    byRole[role].push(agent);
  }

  for (const [role, roleAgents] of Object.entries(byRole)) {
    const roleColor = role === "orchestrator" ? c.magenta : c.cyan;
    console.log(`${roleColor}${c.bright}${role.toUpperCase()}${c.reset}`);

    for (const agent of roleAgents) {
      const statusColor = getStatusColor(agent.status);
      const icon = getStatusIcon(agent.status);
      const timeAgo = formatTimeShort(agent.last_heartbeat);
      const agentId = truncate(agent.agent_id, 35);

      console.log(
        `  ${statusColor}${icon}${c.reset} ` +
        `${c.bright}${agentId}${c.reset} ` +
        `${statusColor}${agent.status}${c.reset} ` +
        `${c.dim}(${timeAgo})${c.reset}`
      );

      if (agent.current_task && detailed) {
        console.log(`    ${c.dim}${sym.arrow} ${truncate(agent.current_task, 50)}${c.reset}`);
      }
    }
  }
  console.log();
}

function renderTaskSection(detailed: boolean = false, limit: number = 8): void {
  const tasks = getTasks();
  const pending = tasks
    .filter((t) => t.status === "pending" || t.status === "in_progress")
    .sort((a, b) => {
      const statusOrder: Record<string, number> = { in_progress: 0, pending: 1 };
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
      }
      return (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4);
    })
    .slice(0, limit);

  renderDivider(`TASKS (${pending.length} pending)`);

  if (pending.length === 0) {
    console.log(`  ${c.dim}No pending tasks${c.reset}`);
    console.log();
    return;
  }

  for (const task of pending) {
    const priorityColor = getPriorityColor(task.priority);
    const statusColor = getStatusColor(task.status);
    const icon = getStatusIcon(task.status);
    const priorityLabel = `[${task.priority[0].toUpperCase()}]`;

    console.log(
      `  ${priorityColor}${priorityLabel}${c.reset} ` +
      `${statusColor}${icon}${c.reset} ` +
      `${truncate(task.title, 50)}`
    );

    if (detailed && task.description) {
      console.log(`      ${c.dim}${truncate(task.description, 55)}${c.reset}`);
    }
  }
  console.log();
}

function renderMessageSection(limit: number = 8): void {
  const messages = getMessages(limit);

  renderDivider(`MESSAGES (last ${limit})`);

  if (messages.length === 0) {
    console.log(`  ${c.dim}No recent messages${c.reset}`);
    console.log();
    return;
  }

  for (const msg of messages.slice(0, limit)) {
    const from = msg.from_agent || msg.from || "unknown";
    const timeAgo = formatTimeShort(msg.timestamp);

    // Type colors
    let typeColor = c.blue;
    if (msg.type === "task_claim") typeColor = c.green;
    if (msg.type === "task_complete") typeColor = c.green + c.bright;
    if (msg.type === "task_available") typeColor = c.yellow;
    if (msg.type === "request_help") typeColor = c.red;
    if (msg.type === "broadcast") typeColor = c.magenta;

    console.log(
      `  ${typeColor}[${msg.type}]${c.reset} ` +
      `${truncate(from, 25)} ` +
      `${c.dim}${timeAgo}${c.reset}`
    );

    // Show payload summary
    const payload = msg.payload;
    if (payload) {
      let summary = "";
      if (payload.status) summary = payload.status;
      else if (payload.title) summary = payload.title;
      else if (payload.message) summary = payload.message;
      else summary = JSON.stringify(payload).slice(0, 40);
      console.log(`    ${c.dim}${truncate(summary, 55)}${c.reset}`);
    }
  }
  console.log();
}

function renderUserMessageSection(): void {
  const messages = getUserMessages();
  const unread = messages.filter((m) => !m.read);

  renderDivider(`USER MESSAGES (${unread.length} unread)`);

  if (messages.length === 0) {
    console.log(`  ${c.dim}No messages. Send with: bun tools/user-message.ts send "msg"${c.reset}`);
    console.log();
    return;
  }

  const recent = messages.slice(-5).reverse();
  for (const msg of recent) {
    const isUnread = !msg.read;
    const icon = isUnread ? `${c.green}${sym.bullet}${c.reset}` : `${c.dim}${sym.circle}${c.reset}`;
    const timeAgo = formatTimeShort(msg.timestamp);
    const urgentTag = msg.priority === "urgent" ? `${c.red}[URGENT]${c.reset} ` : "";

    console.log(
      `  ${icon} ${urgentTag}` +
      `${c.bright}${msg.from}${c.reset} ` +
      `${c.dim}(${timeAgo})${c.reset}`
    );
    console.log(`    ${truncate(msg.message, 55)}`);
  }
  console.log();
}

function renderLogSection(limit: number = 10): void {
  const logs = getRecentLogs(limit);

  renderDivider(`REALTIME LOGS (last ${limit})`);

  if (logs.length === 0) {
    console.log(`  ${c.dim}No recent logs${c.reset}`);
    console.log();
    return;
  }

  for (const log of logs) {
    const levelColor =
      log.level === "ERROR" ? c.red :
      log.level === "WARN" ? c.yellow :
      c.dim;
    const timeAgo = formatTimeShort(log.timestamp);

    console.log(
      `  ${levelColor}[${log.level}]${c.reset} ` +
      `${truncate(log.message, 45)} ` +
      `${c.dim}${timeAgo}${c.reset}`
    );
  }
  console.log();
}

function renderQualitySection(): void {
  const quality = getQuality();
  const summary = quality.summary || {};

  renderDivider("QUALITY");

  const avgScore = summary.average_score?.toFixed(1) || "N/A";
  const trend = summary.trend || "stable";
  const trendColor =
    trend === "improving" ? c.green :
    trend === "declining" ? c.red :
    c.yellow;
  const trendIcon =
    trend === "improving" ? sym.arrowUp :
    trend === "declining" ? sym.arrowDown :
    "→";

  console.log(
    `  ${c.cyan}Average:${c.reset} ${c.bright}${avgScore}/10${c.reset} ` +
    `${c.dim}|${c.reset} ` +
    `${c.cyan}Assessed:${c.reset} ${c.bright}${summary.count || 0}${c.reset} ` +
    `${c.dim}|${c.reset} ` +
    `${c.cyan}Trend:${c.reset} ${trendColor}${trendIcon} ${trend}${c.reset}`
  );

  if (quality.assessments && quality.assessments.length > 0) {
    console.log();
    console.log(`  ${c.dim}Recent:${c.reset}`);
    for (const a of quality.assessments.slice(-3).reverse()) {
      const scoreColor = a.overall_score >= 8 ? c.green : a.overall_score >= 6 ? c.yellow : c.red;
      console.log(
        `    ${scoreColor}${a.overall_score.toFixed(1)}${c.reset}/10 ` +
        `${truncate(a.task_id, 35)}`
      );
    }
  }
  console.log();
}

function renderFooter(): void {
  renderDivider();
  console.log(
    `${c.dim}` +
    `[d]ashboard [a]gents [m]essages [t]asks [l]ogs [q]uality [Ctrl+C] exit` +
    `${c.reset}`
  );
}

// Main render function based on mode
function render(): void {
  const now = Date.now();
  // Debounce renders (max 5 per second)
  if (now - lastRender < 200) return;
  lastRender = now;

  // Update terminal size
  termWidth = process.stdout.columns || 80;
  termHeight = process.stdout.rows || 24;

  clearScreen();
  hideCursor();
  renderHeader();
  renderStatusBar();

  switch (mode) {
    case "dashboard":
      renderAgentSection(false);
      renderTaskSection(false, 5);
      renderMessageSection(5);
      break;

    case "agents":
      renderAgentSection(true);
      break;

    case "messages":
      renderMessageSection(15);
      break;

    case "tasks":
      renderTaskSection(true, 15);
      break;

    case "logs":
      renderLogSection(15);
      break;

    case "quality":
      renderQualitySection();
      break;

    case "all":
      renderAgentSection(true);
      renderTaskSection(true, 5);
      renderUserMessageSection();
      renderMessageSection(5);
      renderQualitySection();
      renderLogSection(5);
      break;
  }

  renderFooter();
}

// File watching for real-time updates
function startWatching(): void {
  const filesToWatch = [
    PATHS.state,
    PATHS.agentRegistry,
    PATHS.messageBus,
    PATHS.tasks,
    PATHS.qualityAssessments,
    PATHS.userMessages,
    PATHS.realtimeLog,
  ];

  for (const file of filesToWatch) {
    if (existsSync(file)) {
      try {
        const watcher = watch(file, () => {
          render();
        });
        watchers.push(watcher);
      } catch (e) {
        // Ignore watch errors
      }
    }
  }
}

function stopWatching(): void {
  for (const watcher of watchers) {
    watcher.close();
  }
  watchers = [];
}

// Keyboard input handling
function setupKeyboardInput(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    process.stdin.on("data", (key: string) => {
      // Ctrl+C
      if (key === "\u0003") {
        cleanup();
        process.exit(0);
      }

      // Mode switching
      switch (key.toLowerCase()) {
        case "d":
          mode = "dashboard";
          render();
          break;
        case "a":
          mode = "agents";
          render();
          break;
        case "m":
          mode = "messages";
          render();
          break;
        case "t":
          mode = "tasks";
          render();
          break;
        case "l":
          mode = "logs";
          render();
          break;
        case "q":
          mode = "quality";
          render();
          break;
        case "r":
          // Force refresh
          render();
          break;
      }
    });
  }
}

function cleanup(): void {
  showCursor();
  stopWatching();
  clearScreen();
  console.log(`${c.dim}Monitor stopped.${c.reset}`);
}

// Main
function main(): void {
  // Parse args
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
${c.bright}OpenCode Real-time Monitor${c.reset}

${c.cyan}Usage:${c.reset}
  bun tools/realtime-monitor.ts [mode]

${c.cyan}Modes:${c.reset}
  dashboard   Full system overview (default)
  agents      Agent status details
  messages    Agent message stream
  tasks       Task list
  logs        Real-time log viewer
  quality     Quality metrics
  all         All sections in detail

${c.cyan}Keyboard:${c.reset}
  d           Switch to dashboard
  a           Switch to agents
  m           Switch to messages
  t           Switch to tasks
  l           Switch to logs
  q           Switch to quality
  r           Force refresh
  Ctrl+C      Exit

${c.cyan}Examples:${c.reset}
  bun tools/realtime-monitor.ts
  bun tools/realtime-monitor.ts agents
  bun tools/realtime-monitor.ts messages
`);
    process.exit(0);
  }

  // Set initial mode
  if (args[0] && ["dashboard", "agents", "messages", "tasks", "logs", "quality", "all"].includes(args[0])) {
    mode = args[0];
  }

  // Handle exit
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  // Start
  setupKeyboardInput();
  startWatching();
  render();

  // Fallback polling (in case file watching doesn't work)
  setInterval(render, 2000);
}

main();
