#!/usr/bin/env bun
/**
 * Unified CLI - Single Entry Point for All Tools
 * 
 * The main CLI for interacting with the multi-agent system.
 * Delegates to specialized tools for complex operations.
 * 
 * Usage:
 *   bun tools/cli.ts [command] [args]
 * 
 * Quick Commands:
 *   status              System overview
 *   agents              List agents
 *   tasks               List tasks
 *   messages            Agent messages
 *   monitor             Live dashboard
 *   interactive         Interactive mode
 * 
 * See 'bun tools/cli.ts help' for all commands
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";
import {
  c,
  readJson,
  readJsonl,
  truncate,
  formatTimeShort,
  PATHS,
  MEMORY_DIR,
  SESSIONS_DIR,
  PRIORITY_ORDER,
  STATUS_ORDER,
  // Actions from shared
  createTask as sharedCreateTask,
  claimTask as sharedClaimTask,
  completeTask as sharedCompleteTask,
  sendUserMessage as sharedSendUserMessage,
} from "./shared";
import type { 
  ToolTiming, 
  Agent, 
  AgentRegistry, 
  Task, 
  TaskStore, 
  SystemState, 
  Message, 
  UserMessage, 
  QualityStore 
} from "./shared/types";

function box(title: string, content: string): string {
  const lines = content.split("\n");
  const width = Math.max(title.length + 4, ...lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, "").length + 2));
  const border = "─".repeat(width);
  
  return `┌${border}┐
│ ${c.bright}${title}${c.reset}${" ".repeat(width - title.length - 1)}│
├${border}┤
${lines.map(l => {
  const clean = l.replace(/\x1b\[[0-9;]*m/g, "");
  return `│ ${l}${" ".repeat(width - clean.length - 1)}│`;
}).join("\n")}
└${border}┘`;
}

// Commands
function showStatus(): void {
  const state = readJson<SystemState>(PATHS.state, {} as SystemState);
  const registry = readJson<AgentRegistry>(PATHS.agentRegistry, { agents: [], last_updated: "" });
  const tasks = readJson<TaskStore>(PATHS.tasks, { tasks: [], version: "", completed_count: 0, last_updated: "" });
  const quality = readJson<QualityStore>(PATHS.qualityAssessments, { assessments: [], summary: { average_score: 0, trend: "stable", total_assessed: 0, last_updated: "" } });
  const userMsgs = readJsonl<UserMessage>(PATHS.userMessages);
  
  // Active agents (heartbeat within 2 min)
  const now = Date.now();
  const activeAgents = registry.agents?.filter((a: Agent) => 
    now - new Date(a.last_heartbeat).getTime() < 2 * 60 * 1000
  ) || [];
  
  const pendingTasks = tasks.tasks?.filter((t: Task) => 
    t.status === "pending" || t.status === "in_progress"
  ).length || 0;
  
  const unreadMsgs = userMsgs.filter((m: UserMessage) => !m.read).length;

  console.log(`
${c.bgBlue}${c.white}${c.bright}  OPENCODE SYSTEM STATUS  ${c.reset}

${c.cyan}SESSION${c.reset}     ${c.bright}${state.session_count || 0}${c.reset}
${c.cyan}STATUS${c.reset}      ${state.status === "orchestrator_active" ? c.green : c.yellow}${state.status || "unknown"}${c.reset}
${c.cyan}AGENTS${c.reset}      ${c.bright}${activeAgents.length}${c.reset} active
${c.cyan}TASKS${c.reset}       ${c.bright}${pendingTasks}${c.reset} pending
${c.cyan}MESSAGES${c.reset}    ${unreadMsgs > 0 ? c.yellow + c.bright : c.dim}${unreadMsgs}${c.reset} unread from users
${c.cyan}QUALITY${c.reset}     ${c.bright}${quality.summary?.average_score?.toFixed(1) || "N/A"}${c.reset}/10 avg (${quality.summary?.trend || "stable"})

${c.dim}Last updated: ${new Date().toLocaleTimeString()}${c.reset}
`);
}

function showAgents(): void {
  const registry = readJson<AgentRegistry>(PATHS.agentRegistry, { agents: [], last_updated: "" });
  const now = Date.now();
  
  console.log(`\n${c.bright}${c.cyan}ACTIVE AGENTS${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(80)}${c.reset}`);
  
  if (!registry.agents || registry.agents.length === 0) {
    console.log(`${c.dim}No agents registered.${c.reset}\n`);
    return;
  }
  
  // Group by session
  const bySession: Record<string, Agent[]> = {};
  for (const agent of registry.agents) {
    const session = agent.session_id || "unknown";
    if (!bySession[session]) bySession[session] = [];
    bySession[session].push(agent);
  }
  
  for (const [session, agents] of Object.entries(bySession)) {
    const isActive = agents.some(a => now - new Date(a.last_heartbeat).getTime() < 2 * 60 * 1000);
    const statusColor = isActive ? c.green : c.dim;
    
    console.log(`\n${statusColor}● Session: ${truncate(session, 40)}${c.reset}`);
    
    for (const agent of agents) {
      const age = now - new Date(agent.last_heartbeat).getTime();
      const isAgentActive = age < 2 * 60 * 1000;
      const color = isAgentActive ? c.reset : c.dim;
      const statusIcon = agent.status === "working" ? "⚙" : agent.status === "blocked" ? "⛔" : "◦";
      
      console.log(
        `  ${color}${statusIcon} ${truncate(agent.agent_id, 35)} ` +
        `[${agent.assigned_role || "general"}] ` +
        `${agent.status} ` +
        `(${formatTimeShort(agent.last_heartbeat)} ago)${c.reset}`
      );
      
      if (agent.current_task) {
        console.log(`    ${c.dim}→ ${truncate(agent.current_task, 50)}${c.reset}`);
      }
    }
  }
  
  console.log();
}

function showTasks(filter?: string): void {
  const tasks = readJson<TaskStore>(PATHS.tasks, { tasks: [], version: "", completed_count: 0, last_updated: "" });
  
  let filtered = tasks.tasks || [];
  if (filter && filter !== "all") {
    filtered = filtered.filter((t: Task) => t.status === filter);
  }
  
  // Sort by priority then status
  filtered.sort((a: Task, b: Task) => {
    if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    }
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });
  
  console.log(`\n${c.bright}${c.yellow}TASKS${c.reset} ${c.dim}(${filtered.length} ${filter || "total"})${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(80)}${c.reset}\n`);
  
  if (filtered.length === 0) {
    console.log(`${c.dim}No tasks found.${c.reset}\n`);
    return;
  }
  
  for (const task of filtered) {
    const priorityColors: Record<string, string> = {
      critical: c.red + c.bright,
      high: c.yellow,
      medium: c.cyan,
      low: c.dim,
    };
    const statusColors: Record<string, string> = {
      pending: c.cyan,
      in_progress: c.yellow,
      completed: c.green,
      blocked: c.red,
      cancelled: c.dim,
    };
    
    const pColor = priorityColors[task.priority] || c.reset;
    const sColor = statusColors[task.status] || c.reset;
    
    console.log(
      `${pColor}[${task.priority.toUpperCase()[0]}]${c.reset} ` +
      `${sColor}${task.status}${c.reset} ` +
      `${c.bright}${task.title}${c.reset}`
    );
    console.log(`    ${c.dim}ID: ${task.id}${c.reset}`);
    if (task.description) {
      console.log(`    ${c.dim}${truncate(task.description, 60)}${c.reset}`);
    }
    console.log();
  }
}

function showMessages(count: number = 20): void {
  const messages = readJsonl<Message>(PATHS.messageBus);
  const nonHeartbeat = messages.filter((m: Message) => m.type !== "heartbeat");
  const recent = nonHeartbeat.slice(-count).reverse();
  
  console.log(`\n${c.bright}${c.magenta}AGENT MESSAGES${c.reset} ${c.dim}(last ${count}, excluding heartbeats)${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(80)}${c.reset}\n`);
  
  if (recent.length === 0) {
    console.log(`${c.dim}No messages.${c.reset}\n`);
    return;
  }
  
  for (const msg of recent) {
    const from = msg.from_agent || msg.from || "unknown";
    const typeColors: Record<string, string> = {
      broadcast: c.blue,
      direct: c.cyan,
      task_claim: c.green,
      task_complete: c.green,
      task_available: c.yellow,
      request_help: c.red,
    };
    
    const tColor = typeColors[msg.type] || c.reset;
    
    console.log(
      `${tColor}[${msg.type}]${c.reset} ` +
      `${c.bright}${truncate(from, 30)}${c.reset} ` +
      `${c.dim}${formatTimeShort(msg.timestamp)} ago${c.reset}`
    );
    
    const payload = JSON.stringify(msg.payload);
    console.log(`  ${c.dim}${truncate(payload, 70)}${c.reset}\n`);
  }
}

function showUserMessages(): void {
  const messages = readJsonl<UserMessage>(PATHS.userMessages);
  const unread = messages.filter((m: UserMessage) => !m.read);
  
  console.log(`\n${c.bright}${c.green}USER MESSAGES${c.reset} ${c.dim}(${unread.length} unread)${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(80)}${c.reset}\n`);
  
  if (messages.length === 0) {
    console.log(`${c.dim}No user messages. Send one with:${c.reset}`);
    console.log(`${c.cyan}  bun tools/cli.ts send "Your message"${c.reset}\n`);
    return;
  }
  
  const recent = messages.slice(-10).reverse();
  
  for (const msg of recent) {
    const isUnread = !msg.read;
    const icon = isUnread ? c.green + "●" : c.dim + "○";
    const urgentTag = msg.priority === "urgent" ? `${c.red}[URGENT]${c.reset} ` : "";
    
    console.log(
      `${icon}${c.reset} ${urgentTag}` +
      `${c.bright}${msg.from}${c.reset} ` +
      `${c.dim}(${formatTimeShort(msg.timestamp)} ago)${c.reset}`
    );
    console.log(`  ${msg.message}`);
    console.log(`  ${c.dim}ID: ${msg.id}${c.reset}`);
    
    if (msg.read) {
      console.log(`  ${c.dim}Read by: ${msg.read_by}${c.reset}`);
    }
    console.log();
  }
}

function sendUserMessage(message: string, urgent: boolean = false): void {
  const msg = sharedSendUserMessage(message, { priority: urgent ? "urgent" : "normal" });
  console.log(`\n${c.green}✓ Message sent!${c.reset}`);
  console.log(`${c.dim}ID: ${msg.id}${c.reset}\n`);
}

function showQuality(): void {
  const quality = readJson<QualityStore>(PATHS.qualityAssessments, { assessments: [], summary: { average_score: 0, trend: "stable", total_assessed: 0, last_updated: "" } });
  
  console.log(`\n${c.bright}${c.blue}QUALITY METRICS${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(80)}${c.reset}\n`);
  
  const summary = quality.summary || {};
  
  console.log(`${c.cyan}Average Score:${c.reset}  ${c.bright}${summary.average_score?.toFixed(1) || "N/A"}${c.reset}/10`);
  console.log(`${c.cyan}Tasks Assessed:${c.reset} ${c.bright}${summary.total_assessed || 0}${c.reset}`);
  
  const trendColor = summary.trend === "improving" ? c.green : 
                     summary.trend === "declining" ? c.red : c.yellow;
  console.log(`${c.cyan}Trend:${c.reset}          ${trendColor}${summary.trend || "stable"}${c.reset}`);
  
  if (quality.assessments && quality.assessments.length > 0) {
    console.log(`\n${c.bright}Recent Assessments:${c.reset}\n`);
    
    for (const a of quality.assessments.slice(-5).reverse()) {
      const scoreColor = a.overall_score >= 8 ? c.green : a.overall_score >= 6 ? c.yellow : c.red;
      console.log(
        `  ${scoreColor}${a.overall_score.toFixed(1)}${c.reset}/10 ` +
        `${c.bright}${truncate(a.task_id, 40)}${c.reset}`
      );
      if (a.lessons_learned) {
        console.log(`    ${c.dim}→ ${truncate(a.lessons_learned, 60)}${c.reset}`);
      }
    }
  }
  
  console.log();
}

function pruneMessages(olderThanHours: number = 24): void {
  const messages = readJsonl<Message>(PATHS.messageBus);
  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
  
  const kept = messages.filter((m: Message) => {
    // Keep non-heartbeat messages
    if (m.type !== "heartbeat") return true;
    // Keep recent heartbeats
    return new Date(m.timestamp).getTime() > cutoff;
  });
  
  const removed = messages.length - kept.length;
  
  const content = kept.map((m: Message) => JSON.stringify(m)).join("\n") + "\n";
  writeFileSync(PATHS.messageBus, content);
  
  console.log(`\n${c.green}✓ Pruned ${removed} old heartbeat messages${c.reset}`);
  console.log(`${c.dim}Kept ${kept.length} messages${c.reset}\n`);
}

// startMonitor removed - now using tools/dashboard.ts

// Task management functions - use shared actions
function createTask(title: string, priority: string = "medium", description?: string): void {
  const task = sharedCreateTask(title, priority as any, description);
  console.log(`\n${c.green}✓ Task created!${c.reset}`);
  console.log(`${c.cyan}ID:${c.reset} ${task.id}`);
  console.log(`${c.cyan}Title:${c.reset} ${title}`);
  console.log(`${c.cyan}Priority:${c.reset} ${priority}\n`);
}

function claimTask(taskId: string): void {
  const tasks = readJson<TaskStore>(PATHS.tasks, { tasks: [], version: "", completed_count: 0, last_updated: "" });
  const task = tasks.tasks.find((t: Task) => t.id === taskId);
  
  if (!task) {
    console.log(`${c.red}Error: Task not found: ${taskId}${c.reset}`);
    process.exit(1);
  }
  
  if (task.status === "in_progress") {
    console.log(`${c.yellow}Warning: Task already in progress${c.reset}`);
    console.log(`${c.dim}Assigned to: ${task.assigned_to || "unknown"}${c.reset}`);
  }
  
  if (sharedClaimTask(taskId, `cli_${Date.now()}`)) {
    console.log(`\n${c.green}✓ Task claimed!${c.reset}`);
    console.log(`${c.cyan}Title:${c.reset} ${task.title}`);
    console.log(`${c.cyan}Status:${c.reset} in_progress\n`);
  } else {
    console.log(`${c.red}Error: Could not claim task${c.reset}`);
  }
}

function completeTask(taskId: string, notes?: string): void {
  const tasks = readJson<TaskStore>(PATHS.tasks, { tasks: [], version: "", completed_count: 0, last_updated: "" });
  const task = tasks.tasks.find((t: Task) => t.id === taskId);
  
  if (!task) {
    console.log(`${c.red}Error: Task not found: ${taskId}${c.reset}`);
    process.exit(1);
  }
  
  if (sharedCompleteTask(taskId, notes)) {
    console.log(`\n${c.green}✓ Task completed!${c.reset}`);
    console.log(`${c.cyan}Title:${c.reset} ${task.title}\n`);
  } else {
    console.log(`${c.red}Error: Could not complete task${c.reset}`);
  }
}

function showConversations(): void {
  // Delegate to opencode-tracker
  import("child_process").then(({ spawn }) => {
    const child = spawn("bun", ["tools/opencode-tracker.ts", "sessions", "10"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    child.on("exit", (code) => process.exit(code || 0));
  });
}

function startInteractive(): void {
  const readline = require("readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const showPrompt = () => {
    process.stdout.write(`\n${c.cyan}opencode>${c.reset} `);
  };

  const showInteractiveHelp = () => {
    console.log(`
${c.bright}Interactive Commands:${c.reset}
  ${c.cyan}status${c.reset}           - Show system status
  ${c.cyan}agents${c.reset}           - List agents
  ${c.cyan}tasks${c.reset}            - List pending tasks
  ${c.cyan}messages${c.reset} [n]     - Show recent messages
  ${c.cyan}send <msg>${c.reset}       - Send message to agents
  ${c.cyan}create <title>${c.reset}   - Create a new task
  ${c.cyan}claim <id>${c.reset}       - Claim a task
  ${c.cyan}complete <id>${c.reset}    - Complete a task
  ${c.cyan}refresh${c.reset}          - Refresh display
  ${c.cyan}clear${c.reset}            - Clear screen
  ${c.cyan}help${c.reset}             - Show this help
  ${c.cyan}exit${c.reset}             - Exit interactive mode
`);
  };

  console.clear();
  console.log(`${c.bgBlue}${c.white}${c.bright}  OPENCODE INTERACTIVE MODE  ${c.reset}`);
  console.log(`${c.dim}Type 'help' for commands${c.reset}`);
  showStatus();
  showPrompt();

  rl.on("line", (line: string) => {
    const parts = line.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case "status":
        showStatus();
        break;
      case "agents":
        showAgents();
        break;
      case "tasks":
        showTasks(args[0] || "pending");
        break;
      case "messages":
        showMessages(parseInt(args[0]) || 10);
        break;
      case "send":
        if (args.length > 0) {
          sendUserMessage(args.join(" "));
        } else {
          console.log(`${c.red}Usage: send <message>${c.reset}`);
        }
        break;
      case "create":
        if (args.length > 0) {
          createTask(args.join(" "), "medium");
        } else {
          console.log(`${c.red}Usage: create <title>${c.reset}`);
        }
        break;
      case "claim":
        if (args[0]) {
          claimTask(args[0]);
        } else {
          console.log(`${c.red}Usage: claim <task_id>${c.reset}`);
        }
        break;
      case "complete":
        if (args[0]) {
          completeTask(args[0], args.slice(1).join(" "));
        } else {
          console.log(`${c.red}Usage: complete <task_id> [notes]${c.reset}`);
        }
        break;
      case "refresh":
        console.clear();
        showStatus();
        break;
      case "clear":
        console.clear();
        break;
      case "help":
        showInteractiveHelp();
        break;
      case "exit":
      case "quit":
      case "q":
        console.log(`${c.dim}Goodbye!${c.reset}`);
        process.exit(0);
        break;
      case "":
        break;
      default:
        console.log(`${c.red}Unknown command: ${cmd}${c.reset}`);
        console.log(`${c.dim}Type 'help' for available commands${c.reset}`);
    }

    showPrompt();
  });

  rl.on("close", () => {
    console.log(`\n${c.dim}Goodbye!${c.reset}`);
    process.exit(0);
  });
}

// Tool Timing functions - uses ToolTiming from shared/types.ts

function readTimingData(): ToolTiming[] {
  return readJsonl<ToolTiming>(PATHS.toolTiming);
}

function showToolTiming(subCmd: string): void {
  const entries = readTimingData();
  
  if (entries.length === 0) {
    console.log(`\n${c.dim}No timing data available yet. Tool executions will be tracked automatically.${c.reset}\n`);
    return;
  }
  
  switch (subCmd) {
    case "summary":
    case "default":
      showTimingSummary(entries);
      break;
    case "tools":
      showToolBreakdown(entries);
      break;
    case "recent":
      showRecentExecutions(entries);
      break;
    case "slow":
      showSlowestTools(entries);
      break;
    case "categories":
      showCategoryBreakdown(entries);
      break;
    case "export":
      exportTimingData(entries);
      break;
    case "help":
      console.log(`
${c.bright}Tool Timing Commands:${c.reset}

  ${c.cyan}timing${c.reset}               Show timing summary (default)
  ${c.cyan}timing summary${c.reset}       Overall statistics
  ${c.cyan}timing tools${c.reset}         Per-tool breakdown
  ${c.cyan}timing recent${c.reset}        Last 20 tool executions
  ${c.cyan}timing slow${c.reset}          Top 10 slowest executions
  ${c.cyan}timing categories${c.reset}    Group by tool category
  ${c.cyan}timing export${c.reset}        Export timing data as JSON
`);
      break;
    default:
      console.log(`${c.red}Unknown timing command: ${subCmd}${c.reset}`);
      console.log(`Use: timing help`);
  }
}

// Type alias for backward compatibility within this file
type TimingEntry = ToolTiming;

function showTimingSummary(entries: TimingEntry[]): void {
  console.log(`\n${c.bright}${c.cyan}TOOL TIMING SUMMARY${c.reset}\n`);
  
  const totalCalls = entries.length;
  const successfulCalls = entries.filter(e => e.success).length;
  const totalDuration = entries.reduce((sum, e) => sum + e.duration_ms, 0);
  const avgDuration = totalDuration / totalCalls;
  const totalInputSize = entries.reduce((sum, e) => sum + e.input_size, 0);
  const totalOutputSize = entries.reduce((sum, e) => sum + e.output_size, 0);
  
  // Get unique tools and sessions
  const uniqueTools = new Set(entries.map(e => e.tool)).size;
  const uniqueSessions = new Set(entries.map(e => e.session_id).filter(Boolean)).size;
  
  // Time range
  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];
  
  console.log(`${c.dim}Statistics:${c.reset}`);
  console.log(`  Total Calls:     ${c.bright}${totalCalls.toLocaleString()}${c.reset}`);
  console.log(`  Successful:      ${c.green}${successfulCalls}${c.reset} (${((successfulCalls/totalCalls)*100).toFixed(1)}%)`);
  console.log(`  Unique Tools:    ${c.cyan}${uniqueTools}${c.reset}`);
  console.log(`  Sessions:        ${uniqueSessions}`);
  console.log();
  console.log(`${c.dim}Timing:${c.reset}`);
  console.log(`  Total Duration:  ${c.yellow}${(totalDuration/1000).toFixed(2)}s${c.reset}`);
  console.log(`  Avg Duration:    ${avgDuration.toFixed(0)}ms`);
  console.log(`  Min Duration:    ${Math.min(...entries.map(e => e.duration_ms))}ms`);
  console.log(`  Max Duration:    ${Math.max(...entries.map(e => e.duration_ms))}ms`);
  console.log();
  console.log(`${c.dim}Data Transfer:${c.reset}`);
  console.log(`  Total Input:     ${(totalInputSize/1024).toFixed(1)}KB`);
  console.log(`  Total Output:    ${(totalOutputSize/1024).toFixed(1)}KB`);
  console.log(`  Avg Input:       ${(totalInputSize/totalCalls).toFixed(0)} bytes`);
  console.log(`  Avg Output:      ${(totalOutputSize/totalCalls).toFixed(0)} bytes`);
  console.log();
  console.log(`${c.dim}Time Range:${c.reset}`);
  console.log(`  From: ${firstEntry?.timestamp || 'N/A'}`);
  console.log(`  To:   ${lastEntry?.timestamp || 'N/A'}`);
  console.log();
}

function showToolBreakdown(entries: TimingEntry[]): void {
  console.log(`\n${c.bright}${c.cyan}TOOL EXECUTION BREAKDOWN${c.reset}\n`);
  
  // Group by tool
  const byTool = new Map<string, TimingEntry[]>();
  for (const e of entries) {
    const list = byTool.get(e.tool) || [];
    list.push(e);
    byTool.set(e.tool, list);
  }
  
  // Sort by total calls
  const sorted = [...byTool.entries()].sort((a, b) => b[1].length - a[1].length);
  
  console.log(`${"Tool".padEnd(25)} ${"Calls".padStart(6)} ${"Avg(ms)".padStart(8)} ${"Total(s)".padStart(9)} ${"Success".padStart(8)}`);
  console.log(`${"-".repeat(25)} ${"-".repeat(6)} ${"-".repeat(8)} ${"-".repeat(9)} ${"-".repeat(8)}`);
  
  for (const [tool, toolEntries] of sorted.slice(0, 20)) {
    const calls = toolEntries.length;
    const avgMs = toolEntries.reduce((s, e) => s + e.duration_ms, 0) / calls;
    const totalS = toolEntries.reduce((s, e) => s + e.duration_ms, 0) / 1000;
    const success = toolEntries.filter(e => e.success).length;
    const successRate = ((success/calls)*100).toFixed(0);
    
    const successColor = success === calls ? c.green : success > calls/2 ? c.yellow : c.red;
    
    console.log(
      `${tool.padEnd(25)} ` +
      `${calls.toString().padStart(6)} ` +
      `${avgMs.toFixed(0).padStart(8)} ` +
      `${totalS.toFixed(2).padStart(9)} ` +
      `${successColor}${successRate.padStart(7)}%${c.reset}`
    );
  }
  console.log();
}

function showRecentExecutions(entries: TimingEntry[]): void {
  console.log(`\n${c.bright}${c.cyan}RECENT TOOL EXECUTIONS${c.reset}\n`);
  
  const recent = entries.slice(-20).reverse();
  
  for (const e of recent) {
    const status = e.success ? `${c.green}OK${c.reset}` : `${c.red}ERR${c.reset}`;
    const time = new Date(e.timestamp).toLocaleTimeString();
    const durationColor = e.duration_ms > 1000 ? c.yellow : e.duration_ms > 5000 ? c.red : "";
    
    console.log(
      `${c.dim}${time}${c.reset} ` +
      `${e.tool.padEnd(20)} ` +
      `${durationColor}${e.duration_ms.toString().padStart(5)}ms${c.reset} ` +
      `${status} ` +
      `${c.dim}in:${e.input_size} out:${e.output_size}${c.reset}`
    );
  }
  console.log();
}

function showSlowestTools(entries: TimingEntry[]): void {
  console.log(`\n${c.bright}${c.cyan}SLOWEST TOOL EXECUTIONS${c.reset}\n`);
  
  const sorted = [...entries].sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 10);
  
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    const time = new Date(e.timestamp).toLocaleTimeString();
    const status = e.success ? `${c.green}OK${c.reset}` : `${c.red}ERR${c.reset}`;
    
    console.log(
      `${c.yellow}${(i+1).toString().padStart(2)}.${c.reset} ` +
      `${c.red}${(e.duration_ms/1000).toFixed(2)}s${c.reset} ` +
      `${e.tool.padEnd(20)} ` +
      `${status} ` +
      `${c.dim}${time}${c.reset}`
    );
  }
  console.log();
}

function showCategoryBreakdown(entries: TimingEntry[]): void {
  console.log(`\n${c.bright}${c.cyan}TOOL CATEGORY BREAKDOWN${c.reset}\n`);
  
  // Group by category
  const byCategory = new Map<string, TimingEntry[]>();
  for (const e of entries) {
    const cat = e.category || "other";
    const list = byCategory.get(cat) || [];
    list.push(e);
    byCategory.set(cat, list);
  }
  
  // Sort by total calls
  const sorted = [...byCategory.entries()].sort((a, b) => b[1].length - a[1].length);
  
  console.log(`${"Category".padEnd(15)} ${"Calls".padStart(6)} ${"Avg(ms)".padStart(8)} ${"Total(s)".padStart(9)} ${"% of Total".padStart(11)}`);
  console.log(`${"-".repeat(15)} ${"-".repeat(6)} ${"-".repeat(8)} ${"-".repeat(9)} ${"-".repeat(11)}`);
  
  const totalCalls = entries.length;
  
  for (const [category, catEntries] of sorted) {
    const calls = catEntries.length;
    const avgMs = catEntries.reduce((s, e) => s + e.duration_ms, 0) / calls;
    const totalS = catEntries.reduce((s, e) => s + e.duration_ms, 0) / 1000;
    const percent = ((calls/totalCalls)*100).toFixed(1);
    
    console.log(
      `${category.padEnd(15)} ` +
      `${calls.toString().padStart(6)} ` +
      `${avgMs.toFixed(0).padStart(8)} ` +
      `${totalS.toFixed(2).padStart(9)} ` +
      `${percent.padStart(10)}%`
    );
  }
  console.log();
}

function exportTimingData(entries: TimingEntry[]): void {
  const exportPath = join(MEMORY_DIR, `timing-export-${Date.now()}.json`);
  
  const exportData = {
    exported_at: new Date().toISOString(),
    total_entries: entries.length,
    entries: entries,
  };
  
  writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
  console.log(`\n${c.green}Exported ${entries.length} timing entries to:${c.reset}`);
  console.log(`${exportPath}\n`);
}

// Recovery functions
function showRecovery(): void {
  console.log(`\n${c.bright}${c.cyan}RECOVERABLE SESSIONS${c.reset}\n`);
  
  if (!existsSync(SESSIONS_DIR)) {
    console.log(`${c.dim}No sessions directory found${c.reset}`);
    return;
  }
  
  const { readdirSync, statSync } = require("fs");
  interface SessionInfo {
    sessionId: string;
    checkpoint: Record<string, unknown> | null;
    handoff: Record<string, unknown> | null;
  }
  
  const sessions: SessionInfo[] = readdirSync(SESSIONS_DIR)
    .filter((f: string) => {
      const path = join(SESSIONS_DIR, f);
      return statSync(path).isDirectory();
    })
    .map((sessionId: string): SessionInfo => {
      const checkpointPath = join(SESSIONS_DIR, sessionId, "checkpoint.json");
      const handoffPath = join(SESSIONS_DIR, sessionId, "handoff-state.json");
      
      let checkpoint: Record<string, unknown> | null = null;
      let handoff: Record<string, unknown> | null = null;
      
      if (existsSync(checkpointPath)) {
        try {
          checkpoint = JSON.parse(readFileSync(checkpointPath, "utf-8"));
        } catch {}
      }
      
      if (existsSync(handoffPath)) {
        try {
          handoff = JSON.parse(readFileSync(handoffPath, "utf-8"));
        } catch {}
      }
      
      return { sessionId, checkpoint, handoff };
    })
    .filter((s: SessionInfo) => s.checkpoint || s.handoff)
    .sort((a: SessionInfo, b: SessionInfo) => {
      const aCheckpoint = a.checkpoint as Record<string, unknown> | null;
      const bCheckpoint = b.checkpoint as Record<string, unknown> | null;
      const aHandoff = a.handoff as Record<string, unknown> | null;
      const bHandoff = b.handoff as Record<string, unknown> | null;
      const aTime = (aCheckpoint?.created_at as string) || (aHandoff?.updated_at as string) || "";
      const bTime = (bCheckpoint?.created_at as string) || (bHandoff?.updated_at as string) || "";
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    })
    .slice(0, 10);
  
  if (sessions.length === 0) {
    console.log(`${c.dim}No recoverable sessions found${c.reset}`);
    return;
  }
  
  const recoverable = sessions.filter((s: SessionInfo) => {
    const cp = s.checkpoint as Record<string, unknown> | null;
    const recovery = cp?.recovery as Record<string, unknown> | undefined;
    return recovery?.can_resume;
  });
  
  console.log(`${c.dim}Found ${sessions.length} session(s), ${recoverable.length} recoverable${c.reset}\n`);
  
  for (const s of sessions) {
    const canResume = s.checkpoint?.recovery?.can_resume;
    const status = canResume ? `${c.green}RESUMABLE${c.reset}` : `${c.dim}archived${c.reset}`;
    const task = s.checkpoint?.current_task?.title || "No active task";
    const time = s.checkpoint?.created_at || s.handoff?.updated_at;
    const timeAgo = time ? formatTimeShort(time) : "?";
    const progress = s.checkpoint?.current_task?.progress_percentage;
    
    console.log(`${c.bright}${s.sessionId}${c.reset} [${status}]`);
    console.log(`  Task: ${truncate(task, 50)}`);
    if (progress) {
      console.log(`  Progress: ${progress}%`);
    }
    console.log(`  Time: ${timeAgo} ago`);
    console.log();
  }
  
  if (recoverable.length > 0) {
    console.log(`${c.cyan}To recover:${c.reset} bun tools/cli.ts recover ${recoverable[0].sessionId}`);
  }
}

function recoverSession(sessionId?: string): void {
  if (!existsSync(SESSIONS_DIR)) {
    console.log(`${c.red}No sessions directory found${c.reset}`);
    return;
  }
  
  const { readdirSync, statSync } = require("fs");
  
  interface RecoverableSession {
    sessionId: string;
    checkpoint: Record<string, unknown>;
    created_at: string;
    can_resume: boolean;
  }
  
  // Find session to recover
  let targetSessionId = sessionId;
  if (!targetSessionId) {
    // Find most recent recoverable session
    const sessions: RecoverableSession[] = readdirSync(SESSIONS_DIR)
      .filter((f: string) => {
        const checkpointPath = join(SESSIONS_DIR, f, "checkpoint.json");
        return existsSync(checkpointPath);
      })
      .map((f: string): RecoverableSession => {
        const checkpoint = JSON.parse(
          readFileSync(join(SESSIONS_DIR, f, "checkpoint.json"), "utf-8")
        ) as Record<string, unknown>;
        const recovery = checkpoint.recovery as Record<string, unknown> | undefined;
        return {
          sessionId: f,
          checkpoint,
          created_at: (checkpoint.created_at as string) || "",
          can_resume: !!(recovery?.can_resume),
        };
      })
      .filter((s: RecoverableSession) => s.can_resume)
      .sort((a: RecoverableSession, b: RecoverableSession) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    
    if (sessions.length === 0) {
      console.log(`${c.yellow}No recoverable sessions found${c.reset}`);
      return;
    }
    
    targetSessionId = sessions[0].sessionId;
  }
  
  const checkpointPath = join(SESSIONS_DIR, targetSessionId, "checkpoint.json");
  
  if (!existsSync(checkpointPath)) {
    console.log(`${c.red}No checkpoint found for session ${targetSessionId}${c.reset}`);
    return;
  }
  
  try {
    const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf-8"));
    
    console.log(`\n${c.bgGreen}${c.white}${c.bright}  CHECKPOINT LOADED  ${c.reset}\n`);
    
    console.log(`${c.cyan}Session:${c.reset} ${checkpoint.session_id}`);
    console.log(`${c.cyan}Agent:${c.reset} ${checkpoint.agent_id}`);
    console.log(`${c.cyan}Created:${c.reset} ${formatTimeShort(checkpoint.created_at)} ago`);
    console.log();
    
    if (checkpoint.current_task) {
      console.log(`${c.bright}Current Task:${c.reset}`);
      console.log(`  ID: ${checkpoint.current_task.task_id}`);
      console.log(`  Title: ${checkpoint.current_task.title}`);
      if (checkpoint.current_task.progress_percentage) {
        console.log(`  Progress: ${checkpoint.current_task.progress_percentage}%`);
      }
      if (checkpoint.current_task.progress_description) {
        console.log(`  Status: ${checkpoint.current_task.progress_description}`);
      }
      console.log();
    }
    
    console.log(`${c.bright}Context:${c.reset}`);
    console.log(`  What was happening: ${checkpoint.context.what_was_happening}`);
    console.log();
    console.log(`${c.bright}Next Steps:${c.reset}`);
    for (const step of checkpoint.context.next_steps || []) {
      console.log(`  ${c.green}→${c.reset} ${step}`);
    }
    
    if (checkpoint.context.blockers?.length > 0) {
      console.log();
      console.log(`${c.bright}${c.yellow}Blockers:${c.reset}`);
      for (const blocker of checkpoint.context.blockers) {
        console.log(`  ${c.red}!${c.reset} ${blocker}`);
      }
    }
    
    if (checkpoint.files_modified?.length > 0) {
      console.log();
      console.log(`${c.bright}Files Modified:${c.reset}`);
      for (const file of checkpoint.files_modified) {
        const actionColor = file.action === "created" ? c.green : 
                           file.action === "deleted" ? c.red : c.yellow;
        console.log(`  ${actionColor}${file.action}${c.reset} ${file.path}`);
      }
    }
    
    console.log();
    if (checkpoint.recovery?.resume_instructions) {
      console.log(`${c.bright}Resume Instructions:${c.reset}`);
      console.log(`  ${checkpoint.recovery.resume_instructions}`);
    }
    
  } catch (error) {
    console.log(`${c.red}Error loading checkpoint: ${error}${c.reset}`);
  }
}

function showHelp(): void {
  console.log(`
${c.bgBlue}${c.white}${c.bright}  UNIFIED CLI  ${c.reset}

${c.cyan}Usage:${c.reset}
  bun tools/cli.ts <command> [args]

${c.cyan}View Commands:${c.reset}
  ${c.bright}status${c.reset}              System status overview
  ${c.bright}agents${c.reset}              List registered agents
  ${c.bright}tasks${c.reset} [filter]      List tasks (pending, completed, all)
  ${c.bright}messages${c.reset} [n]        Agent messages (default: 20)
  ${c.bright}user-messages${c.reset}       User messages
  ${c.bright}quality${c.reset}             Quality metrics
  ${c.bright}health${c.reset}              Agent health status

${c.cyan}OpenCode Sessions:${c.reset}
  ${c.bright}oc${c.reset} sessions [n]     List OpenCode sessions
  ${c.bright}oc${c.reset} view <id>        View full conversation
  ${c.bright}oc${c.reset} tools <id>       Show tool calls for session
  ${c.bright}oc${c.reset} search <query>   Search across sessions
  ${c.bright}oc${c.reset} stats            Session statistics
  ${c.bright}oc${c.reset} tree             Session parent-child tree

${c.cyan}Task Management:${c.reset}
  ${c.bright}task-create${c.reset} <title> Create a new task
  ${c.bright}task-claim${c.reset} <id>     Claim a task
  ${c.bright}task-complete${c.reset} <id>  Complete a task
  ${c.bright}send${c.reset} <message>      Send message to agents

${c.cyan}Live Monitoring:${c.reset}
  ${c.bright}watch${c.reset} [mode]        Real-time monitor with file watching
                      Modes: dashboard, agents, messages, tasks, logs
  ${c.bright}monitor${c.reset} [ms]        Polling dashboard (interval in ms)
  ${c.bright}interactive${c.reset}         Interactive command mode

${c.cyan}Memory & Analysis:${c.reset}
  ${c.bright}memory${c.reset} [cmd]        Working memory (status, archive, search, health, prune)
  ${c.bright}timing${c.reset} [cmd]        Tool timing (summary, tools, recent, slow)
  ${c.bright}perf${c.reset} [cmd]          Performance profiler
  ${c.bright}report${c.reset} [cmd]        Daily reports

${c.cyan}Other:${c.reset}
  ${c.bright}git${c.reset} [cmd]           Git integration
  ${c.bright}critique${c.reset} [cmd]      Code critique agent
  ${c.bright}recovery${c.reset}            Show recoverable sessions
  ${c.bright}prune${c.reset} [hours]       Prune old messages

${c.cyan}Examples:${c.reset}
  bun tools/cli.ts status
  bun tools/cli.ts oc sessions 20
  bun tools/cli.ts oc view ses_abc123
  bun tools/cli.ts watch messages
  bun tools/cli.ts memory health

${c.dim}System files: ${MEMORY_DIR}${c.reset}
`);
}

// CLI routing
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "status":
    showStatus();
    break;
    
  case "agents":
    showAgents();
    break;
    
  case "tasks":
    showTasks(args[1]);
    break;
    
  case "task-create":
  case "create-task":
    const taskTitle = args.slice(1).filter(a => !a.startsWith("--")).join(" ");
    const taskPriority = args.includes("--priority") 
      ? args[args.indexOf("--priority") + 1] || "medium"
      : args.includes("--high") ? "high" 
      : args.includes("--low") ? "low"
      : args.includes("--critical") ? "critical"
      : "medium";
    if (!taskTitle) {
      console.log(`${c.red}Error: Task title required${c.reset}`);
      console.log(`Usage: bun tools/cli.ts task-create "Task title" --priority high`);
      process.exit(1);
    }
    createTask(taskTitle, taskPriority);
    break;
    
  case "task-claim":
  case "claim-task":
    if (!args[1]) {
      console.log(`${c.red}Error: Task ID required${c.reset}`);
      console.log(`Usage: bun tools/cli.ts task-claim <task_id>`);
      // Show pending tasks
      console.log(`\n${c.dim}Pending tasks:${c.reset}`);
      const pendingTasks = readJson<TaskStore>(PATHS.tasks, { tasks: [], version: "", completed_count: 0, last_updated: "" }).tasks
        .filter((t: Task) => t.status === "pending")
        .slice(0, 5);
      for (const t of pendingTasks) {
        console.log(`  ${t.id} - ${truncate(t.title, 40)}`);
      }
      process.exit(1);
    }
    claimTask(args[1]);
    break;
    
  case "task-complete":
  case "complete-task":
    if (!args[1]) {
      console.log(`${c.red}Error: Task ID required${c.reset}`);
      console.log(`Usage: bun tools/cli.ts task-complete <task_id> [notes]`);
      process.exit(1);
    }

    completeTask(args[1], args.slice(2).join(" "));
    break;
    
  case "messages":
    showMessages(parseInt(args[1]) || 20);
    break;
    
  case "user-messages":
    showUserMessages();
    break;
    
  case "send":
    const message = args.slice(1).filter(a => !a.startsWith("--")).join(" ");
    const urgent = args.includes("--urgent");
    if (!message) {
      console.log(`${c.red}Error: Message required${c.reset}`);
      console.log(`Usage: bun tools/cli.ts send "Your message"`);
      process.exit(1);
    }
    sendUserMessage(message, urgent);
    break;
    
  case "monitor":
  case "dashboard":
  case "dash":
    // Use the new interactive dashboard
    import("child_process").then(({ spawn }) => {
      const dashArgs = args.slice(1);
      const child = spawn("bun", ["tools/dashboard.ts", ...dashArgs], {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      child.on("exit", (code) => process.exit(code || 0));
    });
    break;
    
  case "interactive":
  case "i":
    startInteractive();
    break;
    
  case "quality":
    showQuality();
    break;
    
  case "conversations":
  case "conv":
    showConversations();
    break;
    
  case "prune":
    pruneMessages(parseInt(args[1]) || 24);
    break;
    
  case "health":
    // Delegate to health monitor
    import("child_process").then(({ spawn }) => {
      const child = spawn("bun", ["tools/agent-health-monitor.ts", "status"], {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      child.on("exit", (code) => process.exit(code || 0));
    });
    break;
    
  case "bus":
  case "message-bus":
    // Delegate to message bus manager
    import("child_process").then(({ spawn }) => {
      const busArgs = args.slice(1).length > 0 ? args.slice(1) : ["status"];
      const child = spawn("bun", ["tools/message-bus-manager.ts", ...busArgs], {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      child.on("exit", (code) => process.exit(code || 0));
    });
    break;
    
  case "memory":
  case "working":
    // Delegate to working memory manager
    import("child_process").then(({ spawn }) => {
      const memArgs = args.slice(1).length > 0 ? args.slice(1) : ["status"];
      const child = spawn("bun", ["tools/working-memory-manager.ts", ...memArgs], {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      child.on("exit", (code) => process.exit(code || 0));
    });
    break;
    
  case "git":
    // Delegate to git integration
    import("child_process").then(({ spawn }) => {
      const gitArgs = args.slice(1).length > 0 ? args.slice(1) : ["status"];
      const child = spawn("bun", ["tools/git-integration.ts", ...gitArgs], {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      child.on("exit", (code) => process.exit(code || 0));
    });
    break;
    
  case "profile":
  case "perf":
  case "profiler":
  case "performance":
    // Delegate to performance profiler
    import("child_process").then(({ spawn }) => {
      const perfArgs = args.slice(1).length > 0 ? args.slice(1) : ["profile"];
      const child = spawn("bun", ["tools/agent-performance-profiler.ts", ...perfArgs], {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      child.on("exit", (code) => process.exit(code || 0));
    });
    break;
    
  case "recovery":
  case "checkpoints":
    showRecovery();
    break;
    
  case "recover":
  case "resume":
    recoverSession(args[1]);
    break;
    
  case "timing":
  case "tool-timing":
    showToolTiming(args[1] || "summary");
    break;
    
  case "report":
  case "reports":
  case "daily-report":
    // Delegate to daily report generator
    import("child_process").then(({ spawn }) => {
      const reportArgs = args.slice(1).length > 0 ? args.slice(1) : ["summary"];
      const child = spawn("bun", ["tools/daily-report-generator.ts", ...reportArgs], {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      child.on("exit", (code) => process.exit(code || 0));
    });
    break;
    
  case "conv":
  case "conversations":
  case "agent-conv":
    // Delegate to agent conversation viewer
    import("child_process").then(({ spawn }) => {
      const convArgs = args.slice(1).length > 0 ? args.slice(1) : ["agents"];
      const child = spawn("bun", ["tools/agent-conversation-viewer.ts", ...convArgs], {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      child.on("exit", (code) => process.exit(code || 0));
    });
    break;
    
  case "critique":
  case "review":
  case "cr":
    // Delegate to critique agent
    import("child_process").then(({ spawn }) => {
      const critiqueArgs = args.slice(1).length > 0 ? args.slice(1) : ["help"];
      const child = spawn("bun", ["tools/critique-agent.ts", ...critiqueArgs], {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      child.on("exit", (code) => process.exit(code || 0));
    });
    break;
    
  case "opencode":
  case "oc":
  case "tracker":
    // Delegate to opencode-tracker for OpenCode session management
    import("child_process").then(({ spawn }) => {
      const ocArgs = args.slice(1).length > 0 ? args.slice(1) : ["sessions"];
      const child = spawn("bun", ["tools/opencode-tracker.ts", ...ocArgs], {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      child.on("exit", (code) => process.exit(code || 0));
    });
    break;
    
  case "watch":
  case "realtime":
  case "live":
    // Delegate to realtime-monitor for live file watching dashboard
    import("child_process").then(({ spawn }) => {
      const watchArgs = args.slice(1).length > 0 ? args.slice(1) : ["dashboard"];
      const child = spawn("bun", ["tools/realtime-monitor.ts", ...watchArgs], {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      child.on("exit", (code) => process.exit(code || 0));
    });
    break;
    
  case "help":
  case "--help":
  case "-h":
  case undefined:
    showHelp();
    break;
    
  default:
    console.log(`${c.red}Unknown command: ${command}${c.reset}`);
    showHelp();
    process.exit(1);
}
