#!/usr/bin/env bun
/**
 * Terminal Dashboard
 * 
 * Rich terminal UI dashboard using blessed/blessed-contrib for the multi-agent system.
 * 
 * Features:
 * - Agent status grid with real-time updates
 * - Task queue with progress indicators
 * - Message stream with filtering
 * - Quality metrics display
 * - Keyboard navigation for actions
 * - File watching for instant updates
 * 
 * Usage:
 *   bun tools/terminal-dashboard.ts
 * 
 * Keyboard:
 *   Tab         - Cycle focus between panels
 *   Enter       - Perform action on focused item
 *   c           - Claim selected task
 *   m           - Send message
 *   r           - Refresh all data
 *   q           - Quit
 */

import blessed from "blessed";
import contrib from "blessed-contrib";
import { existsSync, readFileSync, watch, FSWatcher } from "fs";
import { readJson, readJsonl } from './shared/json-utils';
import { formatTimeAgo } from './shared/time-utils';
import { truncate } from './shared/string-utils';
import { PATHS } from './shared/paths';

// Data types
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
  from?: string;
  type: string;
  timestamp: string;
  payload: any;
}

// Data fetching
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

function getState(): any {
  return readJson<any>(PATHS.state, {});
}

function getQuality(): any {
  return readJson<any>(PATHS.qualityAssessments, { summary: {}, assessments: [] });
}

function getUserMessages(): any[] {
  return readJsonl<any>(PATHS.userMessages);
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

// Create screen
const screen = blessed.screen({
  smartCSR: true,
  title: "OpenCode Terminal Dashboard",
  cursor: {
    artificial: true,
    shape: "block",
    blink: true,
  },
});

// Create grid layout
const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

// Header box
const headerBox = grid.set(0, 0, 1, 12, blessed.box, {
  content: "{bold}{cyan-fg} OPENCODE TERMINAL DASHBOARD {/cyan-fg}{/bold}",
  tags: true,
  style: {
    fg: "white",
    bg: "blue",
    border: { fg: "blue" },
  },
});

// Agent status table
const agentTable = grid.set(1, 0, 4, 6, contrib.table, {
  keys: true,
  fg: "white",
  selectedFg: "black",
  selectedBg: "green",
  interactive: true,
  label: " Agents ",
  border: { type: "line", fg: "cyan" },
  columnSpacing: 1,
  columnWidth: [20, 12, 8, 8],
  style: {
    border: { fg: "cyan" },
  },
});

// Task list
const taskTable = grid.set(1, 6, 4, 6, contrib.table, {
  keys: true,
  fg: "white",
  selectedFg: "black",
  selectedBg: "yellow",
  interactive: true,
  label: " Tasks (pending) ",
  border: { type: "line", fg: "yellow" },
  columnSpacing: 1,
  columnWidth: [3, 32, 6, 10],
  style: {
    border: { fg: "yellow" },
  },
});

// Message log
const messageLog = grid.set(5, 0, 4, 8, contrib.log, {
  fg: "green",
  selectedFg: "green",
  label: " Messages ",
  border: { type: "line", fg: "green" },
  tags: true,
  bufferLength: 100,
  style: {
    border: { fg: "green" },
  },
});

// Quality stats box (replaced donut to avoid canvas width issues)
const qualityBox = grid.set(5, 8, 2, 4, blessed.box, {
  label: " Quality ",
  tags: true,
  border: { type: "line", fg: "magenta" },
  style: {
    fg: "white",
    border: { fg: "magenta" },
  },
});

// Task status box (replaced bar chart to avoid canvas width issues)
const taskStatusBox = grid.set(7, 8, 2, 4, blessed.box, {
  label: " Task Status ",
  tags: true,
  border: { type: "line", fg: "yellow" },
  style: {
    fg: "white",
    border: { fg: "yellow" },
  },
});

// System stats box (replaced LCD to avoid canvas rendering issues)
const systemBox = grid.set(9, 0, 2, 4, blessed.box, {
  label: " Session # ",
  tags: true,
  border: { type: "line", fg: "green" },
  style: {
    fg: "green",
    border: { fg: "green" },
  },
});

// User messages box
const userMsgBox = grid.set(9, 4, 2, 4, blessed.list, {
  label: " User Messages ",
  border: { type: "line", fg: "magenta" },
  style: {
    fg: "white",
    border: { fg: "magenta" },
    selected: { bg: "magenta", fg: "black" },
  },
  keys: true,
  vi: true,
  tags: true,
});

// Activity box (replaced gauge to avoid canvas issues)
const activityBox = grid.set(9, 8, 2, 4, blessed.box, {
  label: " Activity ",
  tags: true,
  border: { type: "line", fg: "cyan" },
  style: {
    fg: "cyan",
    border: { fg: "cyan" },
  },
});

// Help/status bar
const helpBar = grid.set(11, 0, 1, 12, blessed.box, {
  content: " {bold}Tab{/bold}:Focus | {bold}c{/bold}:Claim Task | {bold}m{/bold}:Message | {bold}r{/bold}:Refresh | {bold}q{/bold}:Quit | {bold}h{/bold}:Help ",
  tags: true,
  style: {
    fg: "white",
    bg: "black",
  },
});

// State
let focusedPanel = 0;
const panels = [agentTable, taskTable, userMsgBox];
let watchers: FSWatcher[] = [];
let selectedTaskId: string | null = null;

// Update functions
function updateHeader(): void {
  const state = getState();
  const agents = getActiveAgents();
  const now = new Date().toLocaleTimeString();
  
  const statusColor = state.status === "orchestrator_active" ? "green" : "yellow";
  
  headerBox.setContent(
    `{bold}{cyan-fg} OPENCODE TERMINAL DASHBOARD {/cyan-fg}{/bold} ` +
    `{|}{${statusColor}-fg}${state.status || "unknown"}{/${statusColor}-fg} ` +
    `{|}{white-fg}Agents: {bold}${agents.length}{/bold}{/white-fg} ` +
    `{|}{dim}${now}{/dim}`
  );
}

function updateAgentTable(): void {
  const agents = getActiveAgents();
  
  const data: string[][] = agents.map((agent) => {
    const shortId = agent.agent_id.split("-").slice(-1)[0];
    const role = agent.assigned_role || "worker";
    const status = agent.status;
    const time = formatTimeAgo(agent.last_heartbeat);
    return [shortId, role, status, time];
  });
  
  agentTable.setData({
    headers: ["ID", "Role", "Status", "Last"],
    data: data.length > 0 ? data : [["No agents", "-", "-", "-"]],
  });
  
  agentTable.setLabel(` Agents (${agents.length}) `);
}

function updateTaskTable(): void {
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
    });
  
  const data: string[][] = pending.map((task) => {
    const pri = task.priority[0].toUpperCase();
    const title = truncate(task.title, 35);
    const status = task.status === "in_progress" ? "ACTIVE" : "PEND";
    const assignee = task.assigned_to ? task.assigned_to.split("-").slice(-1)[0] : "-";
    return [pri, title, status, assignee];
  });
  
  taskTable.setData({
    headers: ["P", "Title", "Status", "Assignee"],
    data: data.length > 0 ? data : [["", "No pending tasks", "-", "-"]],
  });
  
  taskTable.setLabel(` Tasks (${pending.length} pending) `);
}

function updateMessageLog(): void {
  const messages = getMessages(30, true);
  
  messageLog.setItems([]);
  
  for (const msg of messages.slice(0, 20)) {
    const from = (msg.from || "unknown").split("-").slice(-1)[0];
    const time = formatTimeAgo(msg.timestamp);
    
    let typeColor = "blue";
    if (msg.type === "task_claim") typeColor = "green";
    if (msg.type === "task_complete" || msg.type === "task_completed") typeColor = "green";
    if (msg.type === "task_available") typeColor = "yellow";
    if (msg.type === "broadcast") typeColor = "magenta";
    if (msg.type === "request_help") typeColor = "red";
    
    let summary = "";
    if (msg.payload) {
      if (msg.payload.status) summary = truncate(msg.payload.status, 40);
      else if (msg.payload.title) summary = truncate(msg.payload.title, 40);
      else if (typeof msg.payload === "string") summary = truncate(msg.payload, 40);
    }
    
    messageLog.log(`{${typeColor}-fg}[${msg.type}]{/${typeColor}-fg} ${from} {dim}(${time}){/dim}`);
    if (summary) {
      messageLog.log(`  {dim}${summary}{/dim}`);
    }
  }
}

function updateQualityBox(): void {
  const quality = getQuality();
  const summary = quality.summary || {};
  const avgScore = summary.average_score || 0;
  const count = summary.count || 0;
  const trend = summary.trend || "stable";
  
  const scoreColor = avgScore >= 8 ? "green" : avgScore >= 6 ? "yellow" : "red";
  const trendIcon = trend === "improving" ? "↑" : trend === "declining" ? "↓" : "→";
  
  // Create text-based display
  const barLen = 10;
  const filled = Math.round((avgScore / 10) * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  
  qualityBox.setContent(
    `{center}{bold}${avgScore.toFixed(1)}/10{/bold}{/center}\n` +
    `{center}{${scoreColor}-fg}${bar}{/${scoreColor}-fg}{/center}\n` +
    `{center}{dim}${count} assessed ${trendIcon}{/dim}{/center}`
  );
}

function updateTaskStatusBox(): void {
  const tasks = getTasks();
  
  const pending = tasks.filter((t) => t.status === "pending").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress").length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  
  // Create text-based bar representation
  const maxBar = 8;
  const pendingBar = "█".repeat(Math.min(pending, maxBar));
  const inProgressBar = "█".repeat(Math.min(inProgress, maxBar));
  const completedBar = "█".repeat(Math.min(completed, maxBar));
  
  taskStatusBox.setContent(
    `{cyan-fg}Pend:{/cyan-fg} ${pending} ${pendingBar}\n` +
    `{yellow-fg}Work:{/yellow-fg} ${inProgress} ${inProgressBar}\n` +
    `{green-fg}Done:{/green-fg} ${completed} ${completedBar}`
  );
}

function updateSystemBox(): void {
  const state = getState();
  const sessionNum = state.session_count || 0;
  
  // Create a large text display for session number
  systemBox.setContent(
    `{center}{bold}{green-fg}Session{/green-fg}{/bold}{/center}\n` +
    `{center}{bold}${sessionNum}{/bold}{/center}`
  );
}

function updateUserMessages(): void {
  const messages = getUserMessages();
  const recent = messages.slice(-10).reverse();
  
  userMsgBox.clearItems();
  
  for (const msg of recent) {
    const isUnread = !msg.read;
    const icon = isUnread ? "{green-fg}*{/green-fg}" : " ";
    const text = truncate(msg.message || "", 30);
    userMsgBox.addItem(`${icon} ${text}`);
  }
  
  const unreadCount = messages.filter((m) => !m.read).length;
  userMsgBox.setLabel(` User Messages (${unreadCount} unread) `);
}

function updateActivityBox(): void {
  // Show activity as percentage of messages in last hour
  const messages = readJsonl<MessageData>(PATHS.messageBus);
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  
  let recentCount = 0;
  for (const msg of messages) {
    const msgTime = new Date(msg.timestamp).getTime();
    if (msgTime > oneHourAgo) {
      recentCount++;
    }
  }
  
  // Normalize to percentage (assume 100 messages = 100% activity)
  const percentage = Math.min(100, Math.round(recentCount));
  
  // Create text-based progress bar
  const barLen = 12;
  const filled = Math.round((percentage / 100) * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  const color = percentage >= 50 ? "green" : percentage >= 20 ? "yellow" : "red";
  
  activityBox.setContent(
    `{center}{bold}${percentage}%{/bold}{/center}\n` +
    `{center}{${color}-fg}${bar}{/${color}-fg}{/center}\n` +
    `{center}{dim}${recentCount} msgs/hr{/dim}{/center}`
  );
}

function updateAll(): void {
  updateHeader();
  updateAgentTable();
  updateTaskTable();
  updateMessageLog();
  updateQualityBox();
  updateTaskStatusBox();
  updateSystemBox();
  updateUserMessages();
  updateActivityBox();
  screen.render();
}

// Focus management
function cycleFocus(): void {
  // Reset previous panel border
  if (panels[focusedPanel].style && panels[focusedPanel].style.border) {
    panels[focusedPanel].style.border.fg = "white";
  }
  focusedPanel = (focusedPanel + 1) % panels.length;
  // Highlight new panel border
  if (panels[focusedPanel].style && panels[focusedPanel].style.border) {
    panels[focusedPanel].style.border.fg = "green";
  }
  panels[focusedPanel].focus();
  screen.render();
}

// Actions
async function claimSelectedTask(): Promise<void> {
  const tasks = getTasks();
  const pending = tasks.filter((t) => t.status === "pending");
  
  if (pending.length === 0) {
    helpBar.setContent(" {red-fg}No pending tasks to claim{/red-fg} ");
    screen.render();
    return;
  }
  
  // Get selected row from task table
  // @ts-ignore - blessed-contrib types are incomplete
  const selectedRow = taskTable.rows?.selected || 0;
  const task = pending[selectedRow];
  
  if (task) {
    helpBar.setContent(` {yellow-fg}Claiming task: ${truncate(task.title, 40)}...{/yellow-fg} `);
    screen.render();
    
    // Update task file directly
    try {
      const taskStore = readJson<{ tasks: TaskData[] }>(PATHS.tasks, { tasks: [] });
      const idx = taskStore.tasks.findIndex((t) => t.id === task.id);
      if (idx >= 0) {
        taskStore.tasks[idx].status = "in_progress";
        taskStore.tasks[idx].assigned_to = "terminal-user";
        require("fs").writeFileSync(PATHS.tasks, JSON.stringify(taskStore, null, 2));
        helpBar.setContent(` {green-fg}Task claimed: ${truncate(task.title, 40)}{/green-fg} `);
      }
    } catch (e) {
      helpBar.setContent(` {red-fg}Failed to claim task{/red-fg} `);
    }
    
    updateTaskTable();
    screen.render();
  }
}

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
      // Write to user messages file
      const msg = {
        id: `umsg-${Date.now()}`,
        from: "terminal-user",
        message: value.trim(),
        timestamp: new Date().toISOString(),
        priority: "normal",
        read: false,
      };
      
      try {
        require("fs").appendFileSync(
          PATHS.userMessages,
          JSON.stringify(msg) + "\n"
        );
        helpBar.setContent(` {green-fg}Message sent: ${truncate(value, 40)}{/green-fg} `);
      } catch (e) {
        helpBar.setContent(` {red-fg}Failed to send message{/red-fg} `);
      }
      
      updateUserMessages();
    }
    prompt.destroy();
    screen.render();
  });
  
  screen.render();
}

function showHelp(): void {
  const helpBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 60,
    height: 20,
    border: { type: "line", fg: "cyan" },
    label: " Help ",
    content: `
{bold}OpenCode Terminal Dashboard{/bold}

{cyan-fg}Navigation:{/cyan-fg}
  Tab         Cycle focus between panels
  Up/Down     Navigate within focused panel
  Enter       Select/activate item

{cyan-fg}Actions:{/cyan-fg}
  c           Claim selected task
  m           Send message to agents
  r           Refresh all data
  
{cyan-fg}Panels:{/cyan-fg}
  1           Focus Agents panel
  2           Focus Tasks panel
  3           Focus User Messages panel

{cyan-fg}System:{/cyan-fg}
  q / Ctrl+C  Quit dashboard
  h           Show this help

{dim}Press any key to close{/dim}
`,
    tags: true,
    style: {
      fg: "white",
      bg: "black",
      border: { fg: "cyan" },
    },
  });
  
  helpBox.key(["escape", "q", "enter", "space"], () => {
    helpBox.destroy();
    screen.render();
  });
  
  helpBox.focus();
  screen.render();
}

// File watching
function startWatching(): void {
  const filesToWatch = [
    PATHS.state,
    PATHS.agentRegistry,
    PATHS.messageBus,
    PATHS.tasks,
    PATHS.qualityAssessments,
    PATHS.userMessages,
  ];
  
  let updateTimeout: NodeJS.Timeout | null = null;
  
  for (const file of filesToWatch) {
    if (existsSync(file)) {
      try {
        const watcher = watch(file, () => {
          // Debounce updates
          if (updateTimeout) clearTimeout(updateTimeout);
          updateTimeout = setTimeout(updateAll, 100);
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

// Key bindings
screen.key(["q", "C-c"], () => {
  stopWatching();
  process.exit(0);
});

screen.key(["tab"], () => {
  cycleFocus();
});

screen.key(["c"], () => {
  claimSelectedTask();
});

screen.key(["m"], () => {
  showMessagePrompt();
});

screen.key(["r"], () => {
  helpBar.setContent(" {cyan-fg}Refreshing...{/cyan-fg} ");
  screen.render();
  updateAll();
  helpBar.setContent(" {green-fg}Refreshed!{/green-fg} ");
});

screen.key(["h", "?"], () => {
  showHelp();
});

screen.key(["1"], () => {
  focusedPanel = 0;
  panels[focusedPanel].focus();
  panels.forEach((p, i) => {
    if (p.style && p.style.border) {
      p.style.border.fg = i === focusedPanel ? "green" : "white";
    }
  });
  screen.render();
});

screen.key(["2"], () => {
  focusedPanel = 1;
  panels[focusedPanel].focus();
  panels.forEach((p, i) => {
    if (p.style && p.style.border) {
      p.style.border.fg = i === focusedPanel ? "green" : "white";
    }
  });
  screen.render();
});

screen.key(["3"], () => {
  focusedPanel = 2;
  panels[focusedPanel].focus();
  panels.forEach((p, i) => {
    if (p.style && p.style.border) {
      p.style.border.fg = i === focusedPanel ? "green" : "white";
    }
  });
  screen.render();
});

// Main
function main(): void {
  // Initial render
  updateAll();
  
  // Start file watching
  startWatching();
  
  // Focus first panel with proper null checks
  panels[focusedPanel].focus();
  if (panels[focusedPanel].style && panels[focusedPanel].style.border) {
    panels[focusedPanel].style.border.fg = "green";
  }
  
  // Periodic refresh as backup (every 5 seconds)
  setInterval(() => {
    updateAll();
  }, 5000);
  
  screen.render();
}

main();
