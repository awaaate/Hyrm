/**
 * Rendering functions for the terminal dashboard
 * 
 * These functions render the content for each view mode.
 */

import {
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
  getTotalTokenUsage,
  getTokenTrends,
} from "./data";
import { VIEW_MODES, type TaskData } from "./types";

export function renderDashboardContent(): string {
  const stats = getStats();
  const agents = getActiveAgents();
  const tasks = getTasks()
    .filter((t) => t.status === "pending" || t.status === "in_progress")
    .slice(0, 5);
  const messages = getMessages(5);
  const userMsgs = getUnreadUserMessages().slice(0, 3);

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

  return content;
}

export function renderAgentsContent(): string {
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

  return content;
}

export function renderTasksContent(): string {
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

  return content;
}

export function renderMessagesContent(): string {
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

  return content;
}

export function renderUserMessagesContent(): string {
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

  return content;
}

export function renderConversationsContent(): string {
  const sessions = getOpenCodeSessions();
  const events = getSessionEvents(20);
  const tokenUsage = getTotalTokenUsage();

  let content = `{bold}{blue-fg}OPENCODE SESSIONS{/blue-fg}{/bold}\n${"─".repeat(60)}\n\n`;

  // Token usage summary at top
  content += `{bold}{yellow-fg}TOKEN USAGE{/yellow-fg}{/bold}\n`;
  content += `Today:  {cyan-fg}${formatTokenCount(tokenUsage.today.total)}{/} tokens (in: ${formatTokenCount(tokenUsage.today.input)}, out: ${formatTokenCount(tokenUsage.today.output)})\n`;
  content += `Total:  {cyan-fg}${formatTokenCount(tokenUsage.total.total)}{/} tokens (cached: ${formatTokenCount(tokenUsage.total.cache_read)})\n\n`;

  content += `{bold}RECENT SESSIONS{/bold}\n${"─".repeat(50)}\n`;

  if (sessions.length === 0) {
    content += "{dim}No OpenCode sessions found.{/dim}\n";
    content += "{dim}Sessions are stored in ~/.local/share/opencode/storage/session/{/dim}\n";
  } else {
    for (const session of sessions.slice(0, 15)) {
      const status = session.status === "active" ? "{green-fg}ACTIVE{/}" : "{dim}done{/dim}";
      const parent = session.parent_id ? ` {dim}(child){/dim}` : "";
      const tokenInfo = session.tokens ? `{cyan-fg}${formatTokenCount(session.tokens.total)}{/}` : "{dim}0{/dim}";

      content += `${status} {bold}${truncate(session.title || "Untitled", 35)}{/bold}${parent}\n`;
      content += `    ${session.started_at ? formatTimeAgo(session.started_at) + " ago" : "?"} | Msgs: ${session.messages || 0} | Tokens: ${tokenInfo}\n`;
      content += "\n";
    }
  }

  // Recent session events
  if (events.length > 0) {
    content += `\n{bold}{cyan-fg}RECENT SESSION EVENTS{/cyan-fg}{/bold}\n${"─".repeat(40)}\n`;
    for (const event of events.slice(0, 8)) {
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

  return content;
}

// Format token count for display (e.g., 1234567 -> "1.23M")
function formatTokenCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(2)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

export function renderTokensContent(): string {
  const tokenUsage = getTotalTokenUsage();
  const trends = getTokenTrends(15);

  let content = `{bold}{yellow-fg}TOKEN USAGE ANALYTICS{/yellow-fg}{/bold}\n${"─".repeat(60)}\n\n`;

  // Summary stats
  content += `{bold}TODAY'S USAGE{/bold}\n`;
  content += `  Total:     {cyan-fg}${formatTokenCount(tokenUsage.today.total)}{/} tokens\n`;
  content += `  Input:     ${formatTokenCount(tokenUsage.today.input)}\n`;
  content += `  Output:    ${formatTokenCount(tokenUsage.today.output)}\n`;
  content += `  Reasoning: ${formatTokenCount(tokenUsage.today.reasoning)}\n`;
  content += `  Cache Read:  {green-fg}${formatTokenCount(tokenUsage.today.cache_read)}{/} {dim}(saved){/dim}\n`;
  content += `  Cache Write: ${formatTokenCount(tokenUsage.today.cache_write)}\n\n`;

  content += `{bold}ALL TIME USAGE{/bold}\n`;
  content += `  Total:     {cyan-fg}${formatTokenCount(tokenUsage.total.total)}{/} tokens\n`;
  content += `  Input:     ${formatTokenCount(tokenUsage.total.input)}\n`;
  content += `  Output:    ${formatTokenCount(tokenUsage.total.output)}\n`;
  content += `  Reasoning: ${formatTokenCount(tokenUsage.total.reasoning)}\n`;
  content += `  Cache Read:  {green-fg}${formatTokenCount(tokenUsage.total.cache_read)}{/} {dim}(saved){/dim}\n`;
  content += `  Cache Write: ${formatTokenCount(tokenUsage.total.cache_write)}\n\n`;

  // Token breakdown by session
  content += `{bold}TOKEN USAGE BY SESSION{/bold}\n${"─".repeat(50)}\n`;
  content += `{dim}Session                           In      Out     Total{/dim}\n`;
  
  for (const trend of trends) {
    const shortId = trend.session_id.slice(0, 25);
    const input = formatTokenCount(trend.tokens.input).padStart(7);
    const output = formatTokenCount(trend.tokens.output).padStart(7);
    const total = formatTokenCount(trend.tokens.total).padStart(8);
    const time = trend.started_at ? formatTimeAgo(trend.started_at) : "?";
    
    content += `${shortId.padEnd(30)} ${input} ${output} {cyan-fg}${total}{/} {dim}${time}{/dim}\n`;
  }

  // Cache efficiency
  if (tokenUsage.total.total > 0) {
    const cacheRatio = tokenUsage.total.cache_read / (tokenUsage.total.input + tokenUsage.total.cache_read) * 100;
    content += `\n{bold}CACHE EFFICIENCY{/bold}\n`;
    const barLen = 30;
    const filled = Math.round((cacheRatio / 100) * barLen);
    const bar = "{green-fg}" + "=".repeat(filled) + "{/}" + "{dim}" + "-".repeat(barLen - filled) + "{/dim}";
    content += `  [${bar}] {green-fg}${cacheRatio.toFixed(1)}%{/} of input from cache\n`;
    content += `  {dim}Cache hits save API costs and reduce latency{/dim}\n`;
  }

  return content;
}

export function renderQualityContent(): string {
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

  return content;
}

export function renderLogsContent(): string {
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

  return content;
}

export function renderToolStatsContent(): string {
  const { getToolStats } = require("./data");
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

  return content;
}
