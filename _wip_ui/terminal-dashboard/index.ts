#!/usr/bin/env bun
/**
 * OpenCode Unified Terminal Dashboard v2.1
 *
 * A comprehensive terminal UI dashboard for the multi-agent system.
 * Combines all monitoring, management, and communication features.
 *
 * Features:
 * - Multiple view modes (dashboard, agents, tasks, messages, conversations, etc.)
 * - Real-time file watching for instant updates
 * - Keyboard navigation and actions
 * - Task management (claim, create, cancel)
 * - User messaging to agents
 * - OpenCode session viewing
 * - Tool usage statistics
 *
 * Usage:
 *   bun terminal-dashboard/index.ts [mode]
 *
 * Modes: dashboard, agents, tasks, messages, user, conversations, tokens, quality, logs
 *
 * Keyboard:
 *   1-9     Switch view modes
 *   Tab     Cycle focus between panels
 *   c       Claim highest priority task
 *   n       Create new task
 *   x       Cancel selected task
 *   m       Send message to agents
 *   r       Refresh all data
 *   t       Show tool statistics
 *   q       Quit
 *   ?/h     Help
 */

import * as blessed from "blessed";
import * as contrib from "blessed-contrib";
import { existsSync, watch, writeFileSync, appendFileSync, FSWatcher } from "fs";
import {
  PATHS,
  getTasks,
  getStats,
  getToolStats,
  truncate,
  createTask,
  cancelTask,
  claimTask as claimTaskFn,
} from "./data";
import { VIEW_MODES } from "./types";
import {
  renderDashboardContent,
  renderAgentsContent,
  renderTasksContent,
  renderMessagesContent,
  renderUserMessagesContent,
  renderConversationsContent,
  renderTokensContent,
  renderQualityContent,
  renderLogsContent,
  renderToolStatsContent,
} from "./renders";

// ============================================================================
// SCREEN SETUP
// ============================================================================

// @ts-ignore - cursor type issues with blessed types
const screen = blessed.screen({
  smartCSR: true,
  title: "OpenCode Terminal Dashboard v2.1",
  cursor: {
    artificial: true,
    shape: "block",
    blink: true,
    color: "white",
  },
});

// ============================================================================
// STATE
// ============================================================================

let currentMode = "dashboard";
let focusedPanel = 0;
let watchers: FSWatcher[] = [];
let refreshInterval: NodeJS.Timeout | null = null;

// Panel containers for different modes
const panels: Record<string, blessed.Widgets.BlessedElement[]> = {
  dashboard: [],
  agents: [],
  tasks: [],
  messages: [],
  user: [],
  conversations: [],
  tokens: [],
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
    ` {bold}1-9{/bold}:Views ` +
      `{bold}c{/bold}:Claim ` +
      `{bold}n{/bold}:New ` +
      `{bold}x{/bold}:Cancel ` +
      `{bold}m{/bold}:Msg ` +
      `{bold}t{/bold}:Tools ` +
      `{bold}r{/bold}:Refresh ` +
      `{bold}q{/bold}:Quit ` +
      `{|}{cyan-fg}A:{/cyan-fg}${stats.agents} ` +
      `{yellow-fg}T:{/yellow-fg}${stats.pendingTasks} ` +
      `{green-fg}M:{/green-fg}${stats.unreadMessages}`
  );
}

function renderDashboard(): void {
  mainBox.setContent(renderDashboardContent());
  mainBox.setLabel(" Dashboard ");
}

function renderAgents(): void {
  mainBox.setContent(renderAgentsContent());
  mainBox.setLabel(" Agents ");
}

function renderTasks(): void {
  mainBox.setContent(renderTasksContent());
  mainBox.setLabel(" Tasks ");
}

function renderMessages(): void {
  mainBox.setContent(renderMessagesContent());
  mainBox.setLabel(" Agent Messages ");
}

function renderUserMessages(): void {
  mainBox.setContent(renderUserMessagesContent());
  mainBox.setLabel(" User Messages ");
}

function renderConversations(): void {
  mainBox.setContent(renderConversationsContent());
  mainBox.setLabel(" Conversations ");
}

function renderTokens(): void {
  mainBox.setContent(renderTokensContent());
  mainBox.setLabel(" Token Usage ");
}

function renderQuality(): void {
  mainBox.setContent(renderQualityContent());
  mainBox.setLabel(" Quality ");
}

function renderLogs(): void {
  mainBox.setContent(renderLogsContent());
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
    case "tokens":
      renderTokens();
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

  if (claimTaskFn(task.id)) {
    statusBar.setContent(` {green-fg}Claimed: ${truncate(task.title, 30)}{/green-fg} `);
  } else {
    statusBar.setContent(` {red-fg}Failed to claim task{/red-fg} `);
  }

  render();
}

function showNewTaskPrompt(): void {
  const prompt = blessed.prompt({
    parent: screen,
    top: "center",
    left: "center",
    width: 60,
    height: 8,
    border: { type: "line", fg: "yellow" },
    label: " Create New Task ",
    style: {
      fg: "white",
      bg: "black",
      border: { fg: "yellow" },
    },
  });

  prompt.input("Task title:", "", (err, title) => {
    if (title && title.trim()) {
      // Ask for priority
      const priorityPrompt = blessed.list({
        parent: screen,
        top: "center",
        left: "center",
        width: 30,
        height: 10,
        border: { type: "line", fg: "yellow" },
        label: " Priority ",
        items: ["critical", "high", "medium", "low"],
        keys: true,
        vi: true,
        style: {
          fg: "white",
          bg: "black",
          border: { fg: "yellow" },
          selected: { bg: "yellow", fg: "black" },
        },
      });

      priorityPrompt.on("select", (item: any) => {
        const priority = item.content;
        const task = createTask(title.trim(), priority);
        if (task) {
          statusBar.setContent(` {green-fg}Created: ${truncate(title, 30)} [${priority}]{/green-fg} `);
        } else {
          statusBar.setContent(` {red-fg}Failed to create task{/red-fg} `);
        }
        priorityPrompt.destroy();
        render();
      });

      priorityPrompt.key(["escape", "q"], () => {
        priorityPrompt.destroy();
        screen.render();
      });

      priorityPrompt.focus();
      screen.render();
    }
    prompt.destroy();
    screen.render();
  });

  screen.render();
}

function showCancelTaskPrompt(): void {
  const tasks = getTasks().filter((t) => t.status === "pending" || t.status === "in_progress");

  if (tasks.length === 0) {
    statusBar.setContent(` {yellow-fg}No tasks to cancel{/yellow-fg} `);
    screen.render();
    return;
  }

  const taskList = blessed.list({
    parent: screen,
    top: "center",
    left: "center",
    width: 70,
    height: 15,
    border: { type: "line", fg: "red" },
    label: " Select Task to Cancel ",
    items: tasks.map((t) => `[${t.priority[0].toUpperCase()}] ${truncate(t.title, 50)} (${t.status})`),
    keys: true,
    vi: true,
    style: {
      fg: "white",
      bg: "black",
      border: { fg: "red" },
      selected: { bg: "red", fg: "white" },
    },
  });

  taskList.on("select", (item: any, index: number) => {
    const task = tasks[index];
    if (cancelTask(task.id)) {
      statusBar.setContent(` {yellow-fg}Cancelled: ${truncate(task.title, 30)}{/yellow-fg} `);
    } else {
      statusBar.setContent(` {red-fg}Failed to cancel task{/red-fg} `);
    }
    taskList.destroy();
    render();
  });

  taskList.key(["escape", "q"], () => {
    taskList.destroy();
    screen.render();
  });

  taskList.focus();
  screen.render();
}

function showToolStats(): void {
  const stats = getToolStats();

  let content = `{bold}TOOL USAGE STATISTICS{/bold}\n${"─".repeat(50)}\n\n`;
  content += `{cyan-fg}Tool                     Count   Avg Duration{/cyan-fg}\n`;
  content += `${"─".repeat(50)}\n`;

  for (const stat of stats.slice(0, 20)) {
    const tool = stat.tool.padEnd(24);
    const count = String(stat.count).padStart(5);
    const duration = `${stat.avgDuration}ms`.padStart(12);
    content += `${tool}${count}${duration}\n`;
  }

  content += `\n{dim}Showing top 20 tools by usage count{/dim}`;
  content += `\n\n{dim}Press any key to close{/dim}`;

  const statsBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 60,
    height: 30,
    border: { type: "line", fg: "cyan" },
    label: " Tool Statistics ",
    content,
    tags: true,
    scrollable: true,
    keys: true,
    vi: true,
    style: {
      fg: "white",
      bg: "black",
      border: { fg: "cyan" },
    },
  });

  statsBox.key(["escape", "q", "enter", "space"], () => {
    statsBox.destroy();
    screen.render();
  });

  statsBox.focus();
  screen.render();
}

function showHelp(): void {
  const helpBox = blessed.box({
    parent: screen,
    top: "center",
    left: "center",
    width: 65,
    height: 30,
    border: { type: "line", fg: "cyan" },
    label: " Help ",
    content: `
{bold}OpenCode Terminal Dashboard v2.1{/bold}

{cyan-fg}VIEW MODES:{/cyan-fg}
  1   Dashboard     System overview
  2   Agents        Active agents list
  3   Tasks         Task management
  4   Messages      Agent messages
  5   User          User messages to agents
  6   Conversations OpenCode sessions
  7   Tokens        Token usage analytics
  8   Quality       Quality metrics
  9   Logs          Real-time logs

{cyan-fg}ACTIONS:{/cyan-fg}
  Tab     Cycle focus
  c       Claim highest priority pending task
  n       Create new task
  x       Cancel/select task to cancel
  m       Send message to agents
  t       Show tool usage statistics
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
  if (refreshInterval) clearInterval(refreshInterval as NodeJS.Timeout);
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

screen.key(["n"], () => {
  showNewTaskPrompt();
});

screen.key(["x"], () => {
  showCancelTaskPrompt();
});

screen.key(["t"], () => {
  showToolStats();
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
