#!/usr/bin/env bun
/**
 * OpenCode Unified Terminal Dashboard v2.0
 *
 * A comprehensive terminal UI dashboard for the multi-agent system.
 * Combines all monitoring, management, and communication features.
 *
 * Features:
 * - Multiple view modes (dashboard, agents, tasks, messages, conversations, etc.)
 * - Real-time file watching for instant updates
 * - Keyboard navigation and actions
 * - Task claiming and management
 * - User messaging to agents
 * - OpenCode session viewing
 *
 * Usage:
 *   bun terminal-dashboard/index.ts [mode]
 *
 * Modes: dashboard, agents, tasks, messages, user, conversations, quality, logs
 *
 * Keyboard:
 *   1-8     Switch view modes
 *   Tab     Cycle focus between panels
 *   c       Claim selected task
 *   m       Send message to agents
 *   r       Refresh all data
 *   q       Quit
 *   ?/h     Help
 */

import blessed from "blessed";
import contrib from "blessed-contrib";
import { existsSync, watch, writeFileSync, appendFileSync, FSWatcher } from "fs";
import {
  PATHS,
  getState,
  getActiveAgents,
  getAllAgents,
  getTasks,
  getMessages,
  getUserMessages,
  getUnreadUserMessages,
  getQuality,
  getRecentLogs,
  getSessionEvents,
  getOpenCodeSessions,
  getStats,
  formatTimeAgo,
  truncate,
  readJson,
} from "./data";
import { VIEW_MODES, type TaskData } from "./types";

// ============================================================================
// SCREEN SETUP
// ============================================================================

const screen = blessed.screen({
  smartCSR: true,
  title: "OpenCode Terminal Dashboard v2.0",
  cursor: {
    artificial: true,
    shape: "block",
    blink: true,
  },
});

// ============================================================================
// STATE
// ============================================================================

let currentMode = "dashboard";
let focusedPanel = 0;
let watchers: FSWatcher[] = [];
let refreshInterval: NodeJS.Timer | null = null;

// Panel containers for different modes
const panels: Record<string, blessed.Widgets.BlessedElement[]> = {
  dashboard: [],
  agents: [],
  tasks: [],
  messages: [],
  user: [],
  conversations: [],
  quality: [],
  logs: [],
};

// ============================================================================
// UI COMPONENTS
// ============================================================================

// Create grid layout
const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

// Header
const headerBox = grid.set(0, 0, 1, 12, blessed.box, {
  content: "",
  tags: true,
  style: {
    fg: "white",
    bg: "blue",
  },
});

// Main content area - will be populated based on mode
const mainBox = grid.set(1, 0, 10, 12, blessed.box, {
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  vi: true,
  mouse: true,
  border: { type: "line", fg: "cyan" },
  scrollbar: {
    ch: " ",
    track: { bg: "grey" },
    style: { inverse: true },
  },
});

// Status bar
const statusBar = grid.set(11, 0, 1, 12, blessed.box, {
  content: "",
  tags: true,
  style: {
    fg: "white",
    bg: "black",
  },
});

// ============================================================================
// RENDERING FUNCTIONS
// ============================================================================

function updateHeader(): void {
  const stats = getStats();
  const modeInfo = VIEW_MODES.find((m) => m.name === currentMode);
  const time = new Date().toLocaleTimeString();

  const statusColor = stats.status === "orchestrator_active" ? "green" : "yellow";

  headerBox.setContent(
    `{bold}{cyan-fg} OPENCODE DASHBOARD {/cyan-fg}{/bold} ` +
      `{|}[${modeInfo?.key || "?"}] {bold}${modeInfo?.description || currentMode}{/bold} ` +
      `{|}{${statusColor}-fg}${stats.status}{/${statusColor}-fg} ` +
      `{|}{dim}${time}{/dim}`
  );
}

function updateStatusBar(): void {
  const stats = getStats();

  statusBar.setContent(
    ` {bold}1-8{/bold}:Views | ` +
      `{bold}Tab{/bold}:Focus | ` +
      `{bold}c{/bold}:Claim | ` +
      `{bold}m{/bold}:Message | ` +
      `{bold}r{/bold}:Refresh | ` +
      `{bold}q{/bold}:Quit ` +
      `{|}{cyan-fg}Agents:{/cyan-fg}${stats.agents} ` +
      `{yellow-fg}Tasks:{/yellow-fg}${stats.pendingTasks} ` +
      `{green-fg}Msgs:{/green-fg}${stats.unreadMessages}`
  );
}

function renderDashboard(): void {
  const stats = getStats();
  const agents = getActiveAgents();
  const tasks = getTasks()
    .filter((t) => t.status === "pending" || t.status === "in_progress")
    .slice(0, 5);
  const messages = getMessages(5);
  const userMsgs = getUnreadUserMessages().slice(0, 3);
  const quality = getQuality();

  let content = `
{bold}{cyan-fg}SYSTEM OVERVIEW{/cyan-fg}{/bold}
${"─".repeat(50)}

{bold}Session:{/bold}     ${stats.session}
{bold}Status:{/bold}      {${stats.status === "orchestrator_active" ? "green" : "yellow"}-fg}${stats.status}{/}
{bold}Agents:{/bold}      ${stats.agents} active
{bold}Tasks:{/bold}       ${stats.pendingTasks} pending, ${stats.completedTasks} completed
{bold}Quality:{/bold}     ${stats.avgQuality.toFixed(1)}/10 (${stats.qualityTrend})

{bold}{green-fg}ACTIVE AGENTS{/green-fg}{/bold}
${"─".repeat(50)}
`;

  if (agents.length === 0) {
    content += `{dim}No active agents{/dim}\n`;
  } else {
    for (const agent of agents.slice(0, 5)) {
      const shortId = agent.agent_id.split("-").slice(-1)[0];
      const status = agent.status === "working" ? "{yellow-fg}WORK{/}" : "{green-fg}ACTV{/}";
      content += `  ${status} ${shortId} [${agent.assigned_role || "general"}] ${formatTimeAgo(agent.last_heartbeat)} ago\n`;
      if (agent.current_task) {
        content += `       {dim}${truncate(agent.current_task, 45)}{/dim}\n`;
      }
    }
  }

  content += `
{bold}{yellow-fg}PENDING TASKS{/yellow-fg}{/bold}
${"─".repeat(50)}
`;

  if (tasks.length === 0) {
    content += `{dim}No pending tasks{/dim}\n`;
  } else {
    for (const task of tasks) {
      const pri = task.priority[0].toUpperCase();
      const priColor =
        task.priority === "critical"
          ? "red"
          : task.priority === "high"
          ? "yellow"
          : "cyan";
      const status = task.status === "in_progress" ? "{yellow-fg}WIP{/}" : "{cyan-fg}PEND{/}";
      content += `  {${priColor}-fg}[${pri}]{/} ${status} ${truncate(task.title, 40)}\n`;
    }
  }

  content += `
{bold}{magenta-fg}RECENT MESSAGES{/magenta-fg}{/bold}
${"─".repeat(50)}
`;

  if (messages.length === 0) {
    content += `{dim}No recent messages{/dim}\n`;
  } else {
    for (const msg of messages) {
      const from = (msg.from_agent || msg.from || "unknown").split("-").slice(-1)[0];
      const typeColor =
        msg.type === "task_complete"
          ? "green"
          : msg.type === "task_claim"
          ? "yellow"
          : "blue";
      content += `  {${typeColor}-fg}[${msg.type}]{/} ${from} {dim}${formatTimeAgo(msg.timestamp)}{/dim}\n`;
    }
  }

  if (userMsgs.length > 0) {
    content += `
{bold}{green-fg}UNREAD USER MESSAGES{/green-fg}{/bold}
${"─".repeat(50)}
`;
    for (const msg of userMsgs) {
      content += `  {green-fg}*{/green-fg} ${truncate(msg.message, 50)} {dim}(${formatTimeAgo(msg.timestamp)}){/dim}\n`;
    }
  }

  mainBox.setContent(content);
  mainBox.setLabel(" Dashboard ");
}

function renderAgents(): void {
  const agents = getAllAgents();
  const now = Date.now();

  let content = `{bold}{cyan-fg}ALL AGENTS{/cyan-fg}{/bold} (${agents.length} registered)\n${"─".repeat(60)}\n\n`;

  if (agents.length === 0) {
    content += "{dim}No agents registered.{/dim}\n";
  } else {
    // Group by session
    const bySession: Record<string, any[]> = {};
    for (const agent of agents) {
      const session = agent.session_id || "unknown";
      if (!bySession[session]) bySession[session] = [];
      bySession[session].push(agent);
    }

    for (const [session, sessionAgents] of Object.entries(bySession)) {
      const isActive = sessionAgents.some(
        (a) => now - new Date(a.last_heartbeat).getTime() < 2 * 60 * 1000
      );
      const statusColor = isActive ? "green" : "dim";

      content += `{${statusColor}-fg}Session: ${truncate(session, 50)}{/}\n`;

      for (const agent of sessionAgents) {
        const age = now - new Date(agent.last_heartbeat).getTime();
        const isAgentActive = age < 2 * 60 * 1000;
        const color = isAgentActive ? "" : "{dim}";
        const endColor = isAgentActive ? "" : "{/dim}";
        const icon =
          agent.status === "working" ? "{yellow-fg}*{/}" : agent.status === "blocked" ? "{red-fg}!{/}" : "{green-fg}o{/}";

        content += `  ${icon} ${color}${truncate(agent.agent_id, 40)}${endColor}\n`;
        content += `     Role: ${agent.assigned_role || "general"} | Status: ${agent.status} | ${formatTimeAgo(agent.last_heartbeat)} ago\n`;
        if (agent.current_task) {
          content += `     Task: {dim}${truncate(agent.current_task, 50)}{/dim}\n`;
        }
        content += "\n";
      }
    }
  }

  mainBox.setContent(content);
  mainBox.setLabel(" Agents ");
}

function renderTasks(): void {
  const tasks = getTasks();

  // Group by status
  const byStatus: Record<string, TaskData[]> = {
    in_progress: [],
    pending: [],
    blocked: [],
    completed: [],
    cancelled: [],
  };

  for (const task of tasks) {
    if (byStatus[task.status]) {
      byStatus[task.status].push(task);
    }
  }

  // Sort by priority within each group
  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  for (const status of Object.keys(byStatus)) {
    byStatus[status].sort((a, b) => (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4));
  }

  let content = `{bold}{yellow-fg}TASK MANAGEMENT{/yellow-fg}{/bold} (${tasks.length} total)\n${"─".repeat(60)}\n\n`;

  // In Progress
  content += `{bold}{yellow-fg}IN PROGRESS{/yellow-fg}{/bold} (${byStatus.in_progress.length})\n`;
  if (byStatus.in_progress.length === 0) {
    content += "  {dim}None{/dim}\n";
  } else {
    for (const task of byStatus.in_progress.slice(0, 10)) {
      const pri = task.priority[0].toUpperCase();
      const assignee = task.assigned_to ? task.assigned_to.split("-").slice(-1)[0] : "?";
      content += `  {yellow-fg}[${pri}]{/} ${truncate(task.title, 40)} {dim}(${assignee}){/dim}\n`;
      content += `      {dim}ID: ${task.id}{/dim}\n`;
    }
  }

  // Pending
  content += `\n{bold}{cyan-fg}PENDING{/cyan-fg}{/bold} (${byStatus.pending.length})\n`;
  if (byStatus.pending.length === 0) {
    content += "  {dim}None{/dim}\n";
  } else {
    for (const task of byStatus.pending.slice(0, 10)) {
      const pri = task.priority[0].toUpperCase();
      const priColor = task.priority === "critical" ? "red" : task.priority === "high" ? "yellow" : "cyan";
      content += `  {${priColor}-fg}[${pri}]{/} ${truncate(task.title, 40)}\n`;
      content += `      {dim}ID: ${task.id}{/dim}\n`;
    }
  }

  // Blocked
  if (byStatus.blocked.length > 0) {
    content += `\n{bold}{red-fg}BLOCKED{/red-fg}{/bold} (${byStatus.blocked.length})\n`;
    for (const task of byStatus.blocked.slice(0, 5)) {
      content += `  {red-fg}[!]{/} ${truncate(task.title, 40)}\n`;
    }
  }

  // Completed (recent)
  content += `\n{bold}{green-fg}COMPLETED{/green-fg}{/bold} (${byStatus.completed.length} total, showing recent)\n`;
  for (const task of byStatus.completed.slice(-5).reverse()) {
    content += `  {green-fg}[*]{/} ${truncate(task.title, 40)} {dim}${task.completed_at ? formatTimeAgo(task.completed_at) : "?"}{/dim}\n`;
  }

  mainBox.setContent(content);
  mainBox.setLabel(" Tasks ");
}

function renderMessages(): void {
  const messages = getMessages(50);

  let content = `{bold}{magenta-fg}AGENT MESSAGES{/magenta-fg}{/bold} (excluding heartbeats)\n${"─".repeat(60)}\n\n`;

  if (messages.length === 0) {
    content += "{dim}No messages yet.{/dim}\n";
  } else {
    for (const msg of messages) {
      const from = (msg.from_agent || msg.from || "unknown").split("-").slice(-1)[0];
      const typeColors: Record<string, string> = {
        broadcast: "blue",
        direct: "cyan",
        task_claim: "yellow",
        task_complete: "green",
        task_completed: "green",
        task_available: "yellow",
        request_help: "red",
        session_spawned: "magenta",
      };
      const color = typeColors[msg.type] || "white";

      content += `{${color}-fg}[${msg.type}]{/} {bold}${from}{/bold} {dim}${formatTimeAgo(msg.timestamp)}{/dim}\n`;

      // Show payload summary
      if (msg.payload) {
        let summary = "";
        if (msg.payload.status) summary = msg.payload.status;
        else if (msg.payload.title) summary = msg.payload.title;
        else if (msg.payload.task_id) summary = `Task: ${msg.payload.task_id}`;
        else if (typeof msg.payload === "string") summary = msg.payload;
        else summary = JSON.stringify(msg.payload).slice(0, 50);

        if (summary) {
          content += `  {dim}${truncate(summary, 55)}{/dim}\n`;
        }
      }
      content += "\n";
    }
  }

  mainBox.setContent(content);
  mainBox.setLabel(" Agent Messages ");
}

function renderUserMessages(): void {
  const messages = getUserMessages();
  const unread = messages.filter((m) => !m.read);

  let content = `{bold}{green-fg}USER MESSAGES{/green-fg}{/bold} (${unread.length} unread)\n${"─".repeat(60)}\n\n`;

  if (messages.length === 0) {
    content += "{dim}No user messages. Press 'm' to send one.{/dim}\n";
  } else {
    // Show unread first
    if (unread.length > 0) {
      content += "{bold}UNREAD:{/bold}\n";
      for (const msg of unread.slice(-10).reverse()) {
        content += `  {green-fg}*{/green-fg} {bold}${msg.from}{/bold} {dim}(${formatTimeAgo(msg.timestamp)}){/dim}\n`;
        content += `    ${msg.message}\n`;
        content += `    {dim}ID: ${msg.id}{/dim}\n\n`;
      }
    }

    // Show read messages
    const read = messages.filter((m) => m.read);
    if (read.length > 0) {
      content += "\n{bold}READ:{/bold}\n";
      for (const msg of read.slice(-10).reverse()) {
        content += `  {dim}o ${msg.from} (${formatTimeAgo(msg.timestamp)}){/dim}\n`;
        content += `    {dim}${truncate(msg.message, 50)}{/dim}\n\n`;
      }
    }
  }

  mainBox.setContent(content);
  mainBox.setLabel(" User Messages ");
}

function renderConversations(): void {
  const sessions = getOpenCodeSessions();
  const events = getSessionEvents(20);

  let content = `{bold}{blue-fg}OPENCODE SESSIONS{/blue-fg}{/bold}\n${"─".repeat(60)}\n\n`;

  if (sessions.length === 0) {
    content += "{dim}No OpenCode sessions found.{/dim}\n";
    content += "{dim}Sessions are stored in ~/.opencode/session/{/dim}\n";
  } else {
    for (const session of sessions.slice(0, 20)) {
      const status = session.status === "active" ? "{green-fg}ACTIVE{/}" : "{dim}done{/dim}";
      const parent = session.parent_id ? ` {dim}(child of ${session.parent_id.slice(0, 10)}){/dim}` : "";

      content += `${status} {bold}${truncate(session.title || "Untitled", 40)}{/bold}${parent}\n`;
      content += `    ID: ${session.id}\n`;
      if (session.started_at) {
        content += `    Started: ${formatTimeAgo(session.started_at)} ago | Messages: ${session.messages || 0}\n`;
      }
      content += "\n";
    }
  }

  // Recent session events
  if (events.length > 0) {
    content += `\n{bold}{cyan-fg}RECENT SESSION EVENTS{/cyan-fg}{/bold}\n${"─".repeat(40)}\n`;
    for (const event of events.slice(0, 10)) {
      const typeColor =
        event.type === "session_start"
          ? "green"
          : event.type === "session_end"
          ? "yellow"
          : event.type === "session_spawned"
          ? "magenta"
          : "dim";
      content += `{${typeColor}-fg}[${event.type}]{/} ${formatTimeAgo(event.timestamp)}\n`;
      if (event.description) {
        content += `  {dim}${truncate(event.description, 50)}{/dim}\n`;
      }
    }
  }

  mainBox.setContent(content);
  mainBox.setLabel(" Conversations ");
}

function renderQuality(): void {
  const quality = getQuality();
  const assessments = quality.assessments || [];
  const summary = quality.summary || {};

  let content = `{bold}{blue-fg}QUALITY METRICS{/blue-fg}{/bold}\n${"─".repeat(60)}\n\n`;

  // Summary
  const avgScore = summary.average_score || 0;
  const scoreColor = avgScore >= 8 ? "green" : avgScore >= 6 ? "yellow" : "red";
  const trendIcon = summary.trend === "improving" ? "{green-fg}+{/}" : summary.trend === "declining" ? "{red-fg}-{/}" : "{yellow-fg}={/}";

  const barLen = 20;
  const filled = Math.round((avgScore / 10) * barLen);
  const bar = "{" + scoreColor + "-fg}" + "=".repeat(filled) + "{/}" + "{dim}" + "-".repeat(barLen - filled) + "{/dim}";

  content += `{bold}Average Score:{/bold} {${scoreColor}-fg}${avgScore.toFixed(1)}{/}/10 ${trendIcon}\n`;
  content += `[${bar}]\n`;
  content += `{bold}Tasks Assessed:{/bold} ${summary.count || 0}\n\n`;

  // Recent assessments
  content += `{bold}RECENT ASSESSMENTS:{/bold}\n${"─".repeat(40)}\n`;

  if (assessments.length === 0) {
    content += "{dim}No assessments yet.{/dim}\n";
  } else {
    for (const assessment of assessments.slice(-10).reverse()) {
      const score = assessment.overall || 0;
      const color = score >= 8 ? "green" : score >= 6 ? "yellow" : "red";
      content += `{${color}-fg}${score.toFixed(1)}{/}/10 Task: ${truncate(assessment.task_id, 30)} {dim}${formatTimeAgo(assessment.assessed_at)}{/dim}\n`;
      if (assessment.lessons_learned) {
        content += `  {dim}${truncate(assessment.lessons_learned, 50)}{/dim}\n`;
      }
    }
  }

  mainBox.setContent(content);
  mainBox.setLabel(" Quality ");
}

function renderLogs(): void {
  const logs = getRecentLogs(100);

  let content = `{bold}{cyan-fg}REAL-TIME LOGS{/cyan-fg}{/bold}\n${"─".repeat(60)}\n\n`;

  if (logs.length === 0) {
    content += "{dim}No logs yet.{/dim}\n";
  } else {
    for (const log of logs) {
      const levelColor = log.level === "ERROR" ? "red" : log.level === "WARN" ? "yellow" : "dim";
      const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "";
      content += `{${levelColor}-fg}[${log.level || "INFO"}]{/} {dim}${time}{/dim} ${log.message || ""}\n`;
      if (log.data && typeof log.data === "object") {
        content += `  {dim}${truncate(JSON.stringify(log.data), 60)}{/dim}\n`;
      }
    }
  }

  mainBox.setContent(content);
  mainBox.setLabel(" Logs ");
}

function render(): void {
  updateHeader();
  updateStatusBar();

  switch (currentMode) {
    case "dashboard":
      renderDashboard();
      break;
    case "agents":
      renderAgents();
      break;
    case "tasks":
      renderTasks();
      break;
    case "messages":
      renderMessages();
      break;
    case "user":
      renderUserMessages();
      break;
    case "conversations":
      renderConversations();
      break;
    case "quality":
      renderQuality();
      break;
    case "logs":
      renderLogs();
      break;
    default:
      renderDashboard();
  }

  screen.render();
}

// ============================================================================
// ACTIONS
// ============================================================================

function showMessagePrompt(): void {
  const prompt = blessed.prompt({
    parent: screen,
    top: "center",
    left: "center",
    width: 60,
    height: 8,
    border: { type: "line", fg: "cyan" },
    label: " Send Message to Agents ",
    style: {
      fg: "white",
      bg: "black",
      border: { fg: "cyan" },
    },
  });

  prompt.input("Enter message:", "", (err, value) => {
    if (value && value.trim()) {
      const msg = {
        id: `umsg-${Date.now()}`,
        from: "terminal-user",
        message: value.trim(),
        timestamp: new Date().toISOString(),
        priority: "normal",
        read: false,
      };

      try {
        appendFileSync(PATHS.userMessages, JSON.stringify(msg) + "\n");
        statusBar.setContent(` {green-fg}Message sent!{/green-fg} `);
      } catch (e) {
        statusBar.setContent(` {red-fg}Failed to send message{/red-fg} `);
      }
      render();
    }
    prompt.destroy();
    screen.render();
  });

  screen.render();
}

function claimTask(): void {
  const tasks = getTasks().filter((t) => t.status === "pending");

  if (tasks.length === 0) {
    statusBar.setContent(` {yellow-fg}No pending tasks to claim{/yellow-fg} `);
    screen.render();
    return;
  }

  // Claim the highest priority pending task
  const task = tasks.sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.priority] || 4) - (order[b.priority] || 4);
  })[0];

  try {
    const taskStore = readJson<{ tasks: TaskData[] }>(PATHS.tasks, { tasks: [] });
    const idx = taskStore.tasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) {
      taskStore.tasks[idx].status = "in_progress";
      taskStore.tasks[idx].assigned_to = "terminal-user";
      taskStore.tasks[idx].claimed_at = new Date().toISOString();
      writeFileSync(PATHS.tasks, JSON.stringify(taskStore, null, 2));
      statusBar.setContent(` {green-fg}Claimed: ${truncate(task.title, 30)}{/green-fg} `);
    }
  } catch (e) {
    statusBar.setContent(` {red-fg}Failed to claim task{/red-fg} `);
  }

  render();
}

function showHelp(): void {
  const helpBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 65,
    height: 25,
    border: { type: "line", fg: "cyan" },
    label: " Help ",
    content: `
{bold}OpenCode Terminal Dashboard v2.0{/bold}

{cyan-fg}VIEW MODES:{/cyan-fg}
  1   Dashboard     System overview
  2   Agents        Active agents list
  3   Tasks         Task management
  4   Messages      Agent messages
  5   User          User messages to agents
  6   Conversations OpenCode sessions
  7   Quality       Quality metrics
  8   Logs          Real-time logs

{cyan-fg}ACTIONS:{/cyan-fg}
  Tab     Cycle focus
  c       Claim highest priority pending task
  m       Send message to agents
  r       Refresh all data
  
{cyan-fg}NAVIGATION:{/cyan-fg}
  Up/Down   Scroll content
  PgUp/PgDn Page scroll
  Home/End  Jump to start/end

{cyan-fg}SYSTEM:{/cyan-fg}
  q / Ctrl+C   Quit
  h / ?        Show this help

{dim}Press any key to close{/dim}
`,
    tags: true,
    style: {
      fg: "white",
      bg: "black",
      border: { fg: "cyan" },
    },
  });

  helpBox.key(["escape", "q", "enter", "space", "h", "?"], () => {
    helpBox.destroy();
    screen.render();
  });

  helpBox.focus();
  screen.render();
}

// ============================================================================
// FILE WATCHING
// ============================================================================

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

  let updateTimeout: NodeJS.Timeout | null = null;

  for (const file of filesToWatch) {
    if (existsSync(file)) {
      try {
        const watcher = watch(file, () => {
          if (updateTimeout) clearTimeout(updateTimeout);
          updateTimeout = setTimeout(render, 100);
        });
        watchers.push(watcher);
      } catch {}
    }
  }
}

function stopWatching(): void {
  for (const watcher of watchers) {
    watcher.close();
  }
  watchers = [];
}

// ============================================================================
// KEY BINDINGS
// ============================================================================

screen.key(["q", "C-c"], () => {
  stopWatching();
  if (refreshInterval) clearInterval(refreshInterval);
  process.exit(0);
});

screen.key(["r"], () => {
  statusBar.setContent(" {cyan-fg}Refreshing...{/cyan-fg} ");
  screen.render();
  render();
});

screen.key(["m"], () => {
  showMessagePrompt();
});

screen.key(["c"], () => {
  claimTask();
});

screen.key(["h", "?"], () => {
  showHelp();
});

// View mode switching
for (const mode of VIEW_MODES) {
  screen.key([mode.key], () => {
    currentMode = mode.name;
    render();
  });
}

// Scrolling
screen.key(["up", "k"], () => {
  mainBox.scroll(-1);
  screen.render();
});

screen.key(["down", "j"], () => {
  mainBox.scroll(1);
  screen.render();
});

screen.key(["pageup"], () => {
  mainBox.scroll(-10);
  screen.render();
});

screen.key(["pagedown"], () => {
  mainBox.scroll(10);
  screen.render();
});

screen.key(["home"], () => {
  mainBox.setScrollPerc(0);
  screen.render();
});

screen.key(["end"], () => {
  mainBox.setScrollPerc(100);
  screen.render();
});

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  // Parse command line args
  const args = process.argv.slice(2);
  if (args[0] && VIEW_MODES.find((m) => m.name === args[0])) {
    currentMode = args[0];
  }

  // Initial render
  render();

  // Start file watching
  startWatching();

  // Periodic refresh as backup
  refreshInterval = setInterval(render, 5000);

  screen.render();
}

main();
