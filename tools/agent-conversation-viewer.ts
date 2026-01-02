#!/usr/bin/env bun
/**
 * Agent Conversation Viewer
 * 
 * View per-agent conversations including messages, tool calls, and outputs.
 * Integrates with the multi-agent system to show what each agent is doing.
 * 
 * Commands:
 *   agents          - List all agents with activity summary
 *   view <agent_id> - View full conversation for an agent
 *   stream          - Real-time stream of all agent activity
 *   tools <agent_id> - Show tool calls for a specific agent
 *   timeline        - Show chronological activity across all agents
 *   export <agent_id> - Export agent conversation as markdown
 *   help            - Show help
 */

import { existsSync, watch } from "fs";
import {
  // Data fetchers
  getAllAgents,
  getActiveAgents,
  getMessages,
  // JSON utilities
  readJsonl,
  // Colors
  c,
  // String utilities
  truncate,
  // Time utilities
  formatTimeAgo,
  formatTime,
  // Paths
  PATHS,
} from "./shared";
import type { ToolTiming } from "./shared/types";

// Types
interface AgentData {
  agent_id: string;
  session_id?: string;
  assigned_role?: string;
  status: string;
  current_task?: string;
  last_heartbeat: string;
}

interface MessageData {
  id?: string;
  from?: string;
  from_agent?: string;
  to_agent?: string;
  type: string;
  timestamp: string;
  payload: any;
}

// TimingEntry is now imported as ToolTiming from shared/types.ts
type TimingEntry = ToolTiming;

interface LogEntry {
  timestamp: string;
  session?: string;
  level: string;
  message: string;
  data?: any;
}

// Helper functions
function shortId(agentId: string): string {
  const parts = agentId.split("-");
  return parts.length > 2 ? parts.slice(-2).join("-") : agentId;
}

function getMessageTypeColor(type: string): string {
  switch (type) {
    case "broadcast": return c.magenta;
    case "task_claim": return c.yellow;
    case "task_complete":
    case "task_completed": return c.green;
    case "task_available": return c.cyan;
    case "direct": return c.blue;
    case "heartbeat": return c.dim;
    case "request_help": return c.red;
    default: return c.reset;
  }
}

// Get messages for an agent
function getAgentMessages(agentId: string, limit: number = 50): MessageData[] {
  const messages = readJsonl<MessageData>(PATHS.messageBus);
  return messages
    .filter((m) => m.from === agentId || m.from_agent === agentId || m.to_agent === agentId)
    .slice(-limit);
}

// Get tool calls for an agent (by session)
function getAgentToolCalls(agentId: string, limit: number = 50): TimingEntry[] {
  const timing = readJsonl<TimingEntry>(PATHS.toolTiming);
  const agents = getAllAgents();
  const agent = agents.find((a) => a.agent_id === agentId);
  const sessionId = agent?.session_id;
  
  if (!sessionId) return [];
  
  return timing
    .filter((t) => t.session_id === sessionId)
    .slice(-limit);
}

// Get log entries for an agent
function getAgentLogs(agentId: string, limit: number = 30): LogEntry[] {
  const logs = readJsonl<LogEntry>(PATHS.realtimeLog);
  const agents = getAllAgents();
  const agent = agents.find((a) => a.agent_id === agentId);
  const sessionId = agent?.session_id;
  
  return logs
    .filter((l) => l.session === sessionId || l.message?.includes(shortId(agentId)))
    .slice(-limit);
}

// Commands
function showAgents(): void {
  console.log(`\n${c.bright}${c.cyan}REGISTERED AGENTS${c.reset}\n`);

  const agents = getAllAgents();
  const active = getActiveAgents();

  if (agents.length === 0) {
    console.log(`${c.dim}No agents registered${c.reset}\n`);
    return;
  }

  console.log(`${c.dim}Total: ${agents.length} | Active: ${active.length}${c.reset}\n`);

  // Group by role
  const byRole: Record<string, AgentData[]> = {};
  for (const agent of agents) {
    const role = agent.assigned_role || "general";
    if (!byRole[role]) byRole[role] = [];
    byRole[role].push(agent as AgentData);
  }

  for (const [role, roleAgents] of Object.entries(byRole)) {
    const roleColor = role === "orchestrator" ? c.magenta : c.cyan;
    console.log(`${roleColor}${c.bright}${role.toUpperCase()}${c.reset}`);

    for (const agent of roleAgents) {
      const isActive = active.some((a) => a.agent_id === agent.agent_id);
      const statusColor = isActive
        ? agent.status === "working" ? c.yellow : c.green
        : c.dim;
      const statusIcon = isActive ? "●" : "○";
      const timeAgo = formatTimeAgo(agent.last_heartbeat);
      
      const messages = getAgentMessages(agent.agent_id, 100);
      const msgCount = messages.length;
      
      console.log(
        `  ${statusColor}${statusIcon}${c.reset} ` +
        `${c.bright}${shortId(agent.agent_id)}${c.reset} ` +
        `${statusColor}${agent.status}${c.reset} ` +
        `${c.dim}(${timeAgo})${c.reset} ` +
        `${c.cyan}${msgCount} msgs${c.reset}`
      );
      
      if (agent.current_task) {
        console.log(`    ${c.dim}→ ${truncate(agent.current_task, 50)}${c.reset}`);
      }
    }
    console.log();
  }
}

function showAgentConversation(agentId: string): void {
  const agents = getAllAgents();
  const agent = agents.find(
    (a) => a.agent_id === agentId || 
           a.agent_id.includes(agentId) ||
           shortId(a.agent_id).includes(agentId)
  );

  if (!agent) {
    console.log(`${c.red}Agent not found: ${agentId}${c.reset}`);
    console.log(`${c.dim}Use 'agents' command to see available agents${c.reset}\n`);
    return;
  }

  const fullId = agent.agent_id;
  console.log(`\n${c.bright}${c.cyan}AGENT CONVERSATION: ${shortId(fullId)}${c.reset}\n`);
  console.log(`${c.dim}Full ID: ${fullId}${c.reset}`);
  console.log(`${c.dim}Role: ${agent.assigned_role || "general"} | Status: ${agent.status}${c.reset}`);
  console.log(`${c.dim}Session: ${agent.session_id || "unknown"}${c.reset}\n`);

  const messages = getAgentMessages(fullId, 30);
  const tools = getAgentToolCalls(fullId, 20);
  const logs = getAgentLogs(fullId, 10);

  interface Activity {
    type: "message" | "tool" | "log";
    timestamp: string;
    data: any;
  }

  const activities: Activity[] = [
    ...messages.map((m) => ({ type: "message" as const, timestamp: m.timestamp, data: m })),
    ...tools.map((t) => ({ type: "tool" as const, timestamp: t.timestamp, data: t })),
    ...logs.map((l) => ({ type: "log" as const, timestamp: l.timestamp, data: l })),
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (activities.length === 0) {
    console.log(`${c.dim}No activity found for this agent${c.reset}\n`);
    return;
  }

  console.log(`${c.dim}Showing ${activities.length} activities:${c.reset}\n`);

  for (const activity of activities.slice(-40)) {
    const time = formatTime(activity.timestamp);
    
    if (activity.type === "message") {
      const msg = activity.data as MessageData;
      const typeColor = getMessageTypeColor(msg.type);
      const from = msg.from || msg.from_agent || "unknown";
      const direction = from === fullId ? "→" : "←";
      
      console.log(
        `${c.dim}${time}${c.reset} ` +
        `${typeColor}[${msg.type}]${c.reset} ` +
        `${direction} `
      );
      
      if (msg.payload) {
        let summary = "";
        if (msg.payload.status) summary = msg.payload.status;
        else if (msg.payload.title) summary = msg.payload.title;
        else if (msg.payload.message) summary = msg.payload.message;
        else summary = JSON.stringify(msg.payload).slice(0, 60);
        
        console.log(`  ${c.dim}${truncate(summary, 60)}${c.reset}`);
      }
    } else if (activity.type === "tool") {
      const tool = activity.data as TimingEntry;
      const successColor = tool.success ? c.green : c.red;
      const successIcon = tool.success ? "✓" : "✗";
      
      console.log(
        `${c.dim}${time}${c.reset} ` +
        `${c.yellow}[TOOL]${c.reset} ` +
        `${tool.tool} ` +
        `${successColor}${successIcon}${c.reset} ` +
        `${c.dim}${tool.duration_ms}ms${c.reset}`
      );
    } else if (activity.type === "log") {
      const log = activity.data as LogEntry;
      const levelColor = log.level === "ERROR" ? c.red : log.level === "WARN" ? c.yellow : c.dim;
      
      console.log(
        `${c.dim}${time}${c.reset} ` +
        `${levelColor}[${log.level}]${c.reset} ` +
        `${truncate(log.message, 50)}`
      );
    }
  }
  console.log();
}

function showAgentTools(agentId: string): void {
  const agents = getAllAgents();
  const agent = agents.find(
    (a) => a.agent_id === agentId || 
           a.agent_id.includes(agentId) ||
           shortId(a.agent_id).includes(agentId)
  );

  if (!agent) {
    console.log(`${c.red}Agent not found: ${agentId}${c.reset}\n`);
    return;
  }

  const fullId = agent.agent_id;
  console.log(`\n${c.bright}${c.cyan}TOOL CALLS FOR: ${shortId(fullId)}${c.reset}\n`);

  const tools = getAgentToolCalls(fullId, 50);

  if (tools.length === 0) {
    console.log(`${c.dim}No tool calls found for this agent${c.reset}\n`);
    return;
  }

  // Group by tool
  const byTool: Record<string, TimingEntry[]> = {};
  for (const t of tools) {
    if (!byTool[t.tool]) byTool[t.tool] = [];
    byTool[t.tool].push(t);
  }

  console.log(`${"Tool".padEnd(25)} ${"Calls".padStart(6)} ${"Avg(ms)".padStart(8)} ${"Success".padStart(8)}`);
  console.log(`${"-".repeat(25)} ${"-".repeat(6)} ${"-".repeat(8)} ${"-".repeat(8)}`);

  for (const [tool, entries] of Object.entries(byTool).sort((a, b) => b[1].length - a[1].length)) {
    const calls = entries.length;
    const avgMs = entries.reduce((s, e) => s + e.duration_ms, 0) / calls;
    const success = entries.filter((e) => e.success).length;
    const successRate = ((success / calls) * 100).toFixed(0);
    const successColor = success === calls ? c.green : c.yellow;

    console.log(
      `${tool.padEnd(25)} ` +
      `${calls.toString().padStart(6)} ` +
      `${avgMs.toFixed(0).padStart(8)} ` +
      `${successColor}${successRate.padStart(7)}%${c.reset}`
    );
  }
  console.log();
}

function streamAllAgents(): void {
  console.log(`\n${c.bright}${c.cyan}REAL-TIME AGENT ACTIVITY STREAM${c.reset}`);
  console.log(`${c.dim}Press Ctrl+C to stop${c.reset}\n`);

  const seenMessages = new Set<string>();
  const messages = readJsonl<MessageData>(PATHS.messageBus);
  messages.forEach((m) => seenMessages.add(m.id || `${m.from || m.from_agent}-${m.timestamp}`));

  console.log(`${c.dim}Loaded ${seenMessages.size} existing messages, watching for new...${c.reset}\n`);

  const checkForNew = () => {
    const newMessages = readJsonl<MessageData>(PATHS.messageBus);
    
    for (const msg of newMessages) {
      const msgId = msg.id || `${msg.from || msg.from_agent}-${msg.timestamp}`;
      if (!seenMessages.has(msgId)) {
        seenMessages.add(msgId);
        
        if (msg.type === "heartbeat") continue;
        
        const time = formatTime(msg.timestamp);
        const from = shortId(msg.from || msg.from_agent || "unknown");
        const typeColor = getMessageTypeColor(msg.type);
        
        console.log(
          `${c.dim}${time}${c.reset} ` +
          `${c.cyan}${from}${c.reset} ` +
          `${typeColor}[${msg.type}]${c.reset}`
        );
        
        if (msg.payload) {
          let summary = "";
          if (msg.payload.status) summary = msg.payload.status;
          else if (msg.payload.title) summary = msg.payload.title;
          else if (msg.payload.achievements) summary = `${msg.payload.achievements.length} achievements`;
          
          if (summary) {
            console.log(`  ${c.dim}${truncate(summary, 60)}${c.reset}`);
          }
        }
      }
    }
  };

  checkForNew();

  if (existsSync(PATHS.messageBus)) {
    watch(PATHS.messageBus, () => checkForNew());
  }

  setInterval(checkForNew, 2000);

  process.on("SIGINT", () => {
    console.log(`\n${c.dim}Stream stopped${c.reset}`);
    process.exit(0);
  });
}

function showTimeline(): void {
  console.log(`\n${c.bright}${c.cyan}AGENT ACTIVITY TIMELINE${c.reset}\n`);

  const messages = getMessages(50, true) as MessageData[];

  if (messages.length === 0) {
    console.log(`${c.dim}No activity found${c.reset}\n`);
    return;
  }

  console.log(`${c.dim}Last ${messages.length} activities:${c.reset}\n`);

  // Reverse to show oldest first
  for (const msg of [...messages].reverse()) {
    const time = formatTime(msg.timestamp);
    const timeAgo = formatTimeAgo(msg.timestamp);
    const from = shortId(msg.from || msg.from_agent || "unknown");
    const typeColor = getMessageTypeColor(msg.type);

    console.log(
      `${c.dim}${time} (${timeAgo})${c.reset} ` +
      `${c.cyan}${from.padEnd(15)}${c.reset} ` +
      `${typeColor}${msg.type.padEnd(15)}${c.reset}`
    );

    if (msg.payload) {
      let summary = "";
      if (msg.payload.status) summary = msg.payload.status;
      else if (msg.payload.title) summary = msg.payload.title;
      else if (msg.payload.summary) summary = JSON.stringify(msg.payload.summary).slice(0, 50);
      
      if (summary) {
        console.log(`  ${c.dim}${truncate(summary, 55)}${c.reset}`);
      }
    }
  }
  console.log();
}

function exportAgentConversation(agentId: string): void {
  const agents = getAllAgents();
  const agent = agents.find(
    (a) => a.agent_id === agentId || 
           a.agent_id.includes(agentId) ||
           shortId(a.agent_id).includes(agentId)
  );

  if (!agent) {
    console.log(`${c.red}Agent not found: ${agentId}${c.reset}\n`);
    return;
  }

  const fullId = agent.agent_id;
  const messages = getAgentMessages(fullId, 100);
  const tools = getAgentToolCalls(fullId, 100);

  let md = `# Agent Conversation Export

## Agent Info
- **ID**: ${fullId}
- **Role**: ${agent.assigned_role || "general"}
- **Status**: ${agent.status}
- **Session**: ${agent.session_id || "unknown"}
- **Last Heartbeat**: ${agent.last_heartbeat}
- **Exported**: ${new Date().toISOString()}

---

## Messages (${messages.length})

`;

  for (const msg of messages) {
    md += `### ${msg.type} - ${msg.timestamp}\n\n`;
    md += `**From**: ${msg.from || msg.from_agent || "unknown"}\n\n`;
    if (msg.payload) {
      md += "```json\n" + JSON.stringify(msg.payload, null, 2) + "\n```\n\n";
    }
    md += "---\n\n";
  }

  md += `## Tool Calls (${tools.length})

| Time | Tool | Duration | Success |
|------|------|----------|---------|
`;

  for (const t of tools) {
    md += `| ${t.timestamp} | ${t.tool} | ${t.duration_ms}ms | ${t.success ? "✓" : "✗"} |\n`;
  }

  console.log(md);
}

function showHelp(): void {
  console.log(`
${c.bright}Agent Conversation Viewer${c.reset}

View per-agent conversations and activity in the multi-agent system.

${c.cyan}Commands:${c.reset}
  ${c.bright}agents${c.reset}              List all agents with activity summary
  ${c.bright}view${c.reset} <agent_id>     View full conversation for an agent
  ${c.bright}tools${c.reset} <agent_id>    Show tool calls for a specific agent
  ${c.bright}stream${c.reset}              Real-time stream of all agent activity
  ${c.bright}timeline${c.reset}            Chronological activity across all agents
  ${c.bright}export${c.reset} <agent_id>   Export agent conversation as markdown
  ${c.bright}help${c.reset}                Show this help

${c.cyan}Examples:${c.reset}
  bun tools/agent-conversation-viewer.ts agents
  bun tools/agent-conversation-viewer.ts view p10btt
  bun tools/agent-conversation-viewer.ts tools p10btt
  bun tools/agent-conversation-viewer.ts stream
  bun tools/agent-conversation-viewer.ts timeline
`);
}

// Main
const args = process.argv.slice(2);
const command = args[0] || "agents";

switch (command) {
  case "agents":
  case "list":
    showAgents();
    break;

  case "view":
  case "show":
  case "conversation":
    if (!args[1]) {
      console.log(`${c.red}Usage: agent-conversation-viewer view <agent_id>${c.reset}`);
      console.log(`${c.dim}Use 'agents' to see available agent IDs${c.reset}\n`);
      process.exit(1);
    }
    showAgentConversation(args[1]);
    break;

  case "tools":
    if (!args[1]) {
      console.log(`${c.red}Usage: agent-conversation-viewer tools <agent_id>${c.reset}`);
      process.exit(1);
    }
    showAgentTools(args[1]);
    break;

  case "stream":
  case "watch":
    streamAllAgents();
    break;

  case "timeline":
  case "history":
    showTimeline();
    break;

  case "export":
    if (!args[1]) {
      console.log(`${c.red}Usage: agent-conversation-viewer export <agent_id>${c.reset}`);
      process.exit(1);
    }
    exportAgentConversation(args[1]);
    break;

  case "help":
  case "--help":
  case "-h":
    showHelp();
    break;

  default:
    console.log(`${c.red}Unknown command: ${command}${c.reset}`);
    showHelp();
    process.exit(1);
}
