#!/usr/bin/env bun
/**
 * Agent Health Monitor
 * 
 * Comprehensive health monitoring system for multi-agent coordination.
 * Features:
 * - Real-time health checks for all registered agents
 * - Performance metrics collection (response times, task completion rates)
 * - Automatic cleanup of stale/dead agents
 * - Health alerts and notifications
 * - Integration with the agent registry and message bus
 * 
 * Usage:
 *   bun tools/agent-health-monitor.ts [command]
 * 
 * Commands:
 *   status    - Show current health status of all agents
 *   check     - Run a single health check
 *   monitor   - Start continuous monitoring
 *   metrics   - Show performance metrics
 *   cleanup   - Remove stale agents
 */

import { appendFileSync } from "fs";
import { readJson, writeJson, c, formatDuration, PATHS, CONFIG, getMemoryPath } from "./shared";
import type { AgentRegistry } from "./shared/types";

// File paths using shared PATHS
const REGISTRY_PATH = PATHS.agentRegistry;
const HEALTH_METRICS_PATH = PATHS.agentHealthMetrics;
const HEALTH_LOG_PATH = getMemoryPath("agent-health.log");

// Health check thresholds - use shared CONFIG values
const THRESHOLDS = {
  STALE_AGENT_MS: CONFIG.AGENT_STALE_THRESHOLD,
  WARNING_AGENT_MS: CONFIG.AGENT_WARNING_THRESHOLD,
  DEAD_AGENT_MS: CONFIG.AGENT_DEAD_THRESHOLD,
  CLEANUP_INTERVAL_MS: CONFIG.CLEANUP_INTERVAL,
  METRICS_WINDOW_MS: CONFIG.METRICS_WINDOW,
};

// Types
interface Agent {
  agent_id: string;
  session_id: string;
  started_at: string;
  last_heartbeat: string;
  status: string;
  assigned_role: string;
  current_task?: string;
  pid?: number;
}

interface HealthStatus {
  agent_id: string;
  status: "healthy" | "warning" | "stale" | "dead";
  last_heartbeat: string;
  age_ms: number;
  role: string;
  current_task?: string;
  issues: string[];
}

interface AgentMetrics {
  agent_id: string;
  total_tasks_claimed: number;
  tasks_completed: number;
  tasks_failed: number;
  avg_task_duration_ms: number;
  uptime_ms: number;
  messages_sent: number;
  last_activity: string;
}

interface HealthMetricsStore {
  last_updated: string;
  checks_performed: number;
  agents_tracked: Record<string, AgentMetrics>;
  alerts: Array<{
    timestamp: string;
    agent_id: string;
    type: string;
    message: string;
  }>;
  cleanup_stats: {
    total_cleanups: number;
    agents_removed: number;
    last_cleanup: string;
  };
}

// Helper functions
function log(level: "INFO" | "WARN" | "ERROR" | "ALERT", message: string, data?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level, message, ...(data && { data }) };
  
  appendFileSync(HEALTH_LOG_PATH, JSON.stringify(logEntry) + "\n");
  
  const colors: Record<string, string> = {
    INFO: c.blue,
    WARN: c.yellow,
    ERROR: c.red,
    ALERT: c.red + c.bright,
  };
  
  console.log(`${colors[level]}[${level}]${c.reset} ${message}`);
}

// Core functions
function getAgents(): Agent[] {
  const registry = readJson<{ agents: Agent[] }>(REGISTRY_PATH, { agents: [] });
  return registry.agents || [];
}

function checkAgentHealth(agent: Agent): HealthStatus {
  const now = Date.now();
  const lastHeartbeat = new Date(agent.last_heartbeat).getTime();
  const age = now - lastHeartbeat;
  const issues: string[] = [];
  
  let status: HealthStatus["status"] = "healthy";
  
  if (age > THRESHOLDS.DEAD_AGENT_MS) {
    status = "dead";
    issues.push(`No heartbeat for ${formatDuration(age)} (exceeds ${formatDuration(THRESHOLDS.DEAD_AGENT_MS)} threshold)`);
  } else if (age > THRESHOLDS.STALE_AGENT_MS) {
    status = "stale";
    issues.push(`Heartbeat stale for ${formatDuration(age)}`);
  } else if (age > THRESHOLDS.WARNING_AGENT_MS) {
    status = "warning";
    issues.push(`Heartbeat delayed by ${formatDuration(age)}`);
  }
  
  // Check for stuck status
  if (agent.status === "working" && age > THRESHOLDS.STALE_AGENT_MS) {
    issues.push("Agent marked as working but not responding");
  }
  
  return {
    agent_id: agent.agent_id,
    status,
    last_heartbeat: agent.last_heartbeat,
    age_ms: age,
    role: agent.assigned_role,
    current_task: agent.current_task,
    issues,
  };
}

function getAllHealthStatuses(): HealthStatus[] {
  const agents = getAgents();
  return agents.map(checkAgentHealth);
}

function getMetricsStore(): HealthMetricsStore {
  return readJson<HealthMetricsStore>(HEALTH_METRICS_PATH, {
    last_updated: new Date().toISOString(),
    checks_performed: 0,
    agents_tracked: {},
    alerts: [],
    cleanup_stats: {
      total_cleanups: 0,
      agents_removed: 0,
      last_cleanup: "",
    },
  });
}

function saveMetricsStore(store: HealthMetricsStore): void {
  store.last_updated = new Date().toISOString();
  writeJson(HEALTH_METRICS_PATH, store);
}

function cleanupStaleAgents(dryRun = false): { removed: Agent[]; remaining: Agent[] } {
  const agents = getAgents();
  const now = Date.now();
  
  const removed: Agent[] = [];
  const remaining: Agent[] = [];
  
  for (const agent of agents) {
    const age = now - new Date(agent.last_heartbeat).getTime();
    if (age > THRESHOLDS.DEAD_AGENT_MS) {
      removed.push(agent);
    } else {
      remaining.push(agent);
    }
  }
  
  if (!dryRun && removed.length > 0) {
    // Update registry
    const registry = readJson<AgentRegistry & { lock_version?: number }>(REGISTRY_PATH, { agents: [], last_updated: new Date().toISOString() });
    registry.agents = remaining;
    registry.last_updated = new Date().toISOString();
    registry.lock_version = (registry.lock_version || 0) + 1;
    writeJson(REGISTRY_PATH, registry);
    
    // Update metrics
    const metrics = getMetricsStore();
    metrics.cleanup_stats.total_cleanups++;
    metrics.cleanup_stats.agents_removed += removed.length;
    metrics.cleanup_stats.last_cleanup = new Date().toISOString();
    
    // Add cleanup alert
    for (const agent of removed) {
      metrics.alerts.push({
        timestamp: new Date().toISOString(),
        agent_id: agent.agent_id,
        type: "cleanup",
        message: `Agent removed due to inactivity (last heartbeat: ${agent.last_heartbeat})`,
      });
    }
    
    // Keep only recent alerts
    metrics.alerts = metrics.alerts.slice(-100);
    saveMetricsStore(metrics);
    
    log("INFO", `Cleaned up ${removed.length} dead agents`);
  }
  
  return { removed, remaining };
}

function recordHealthCheck(): void {
  const metrics = getMetricsStore();
  metrics.checks_performed++;
  
  const statuses = getAllHealthStatuses();
  
  // Record alerts for unhealthy agents
  for (const status of statuses) {
    if (status.status !== "healthy" && status.issues.length > 0) {
      const existingAlert = metrics.alerts.find(
        a => a.agent_id === status.agent_id && 
            new Date(a.timestamp).getTime() > Date.now() - 60000 // Within last minute
      );
      
      if (!existingAlert) {
        metrics.alerts.push({
          timestamp: new Date().toISOString(),
          agent_id: status.agent_id,
          type: status.status,
          message: status.issues.join("; "),
        });
      }
    }
  }
  
  metrics.alerts = metrics.alerts.slice(-100);
  saveMetricsStore(metrics);
}

// CLI Commands
function showStatus(): void {
  const statuses = getAllHealthStatuses();
  const metrics = getMetricsStore();
  
  console.log(`\n${c.bright}${c.cyan}AGENT HEALTH STATUS${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(80)}${c.reset}`);
  
  if (statuses.length === 0) {
    console.log(`\n${c.dim}No agents registered.${c.reset}\n`);
    return;
  }
  
  // Summary
  const healthy = statuses.filter(s => s.status === "healthy").length;
  const warning = statuses.filter(s => s.status === "warning").length;
  const stale = statuses.filter(s => s.status === "stale").length;
  const dead = statuses.filter(s => s.status === "dead").length;
  
  console.log(`\n${c.bright}Summary:${c.reset}`);
  console.log(
    `  ${c.green}Healthy: ${healthy}${c.reset} | ` +
    `${c.yellow}Warning: ${warning}${c.reset} | ` +
    `${c.red}Stale: ${stale}${c.reset} | ` +
    `${c.red}${c.bright}Dead: ${dead}${c.reset}`
  );
  console.log(`  ${c.dim}Checks performed: ${metrics.checks_performed}${c.reset}`);
  
  // Individual agents
  console.log(`\n${c.bright}Agents:${c.reset}\n`);
  
  for (const status of statuses) {
    const statusColors: Record<string, string> = {
      healthy: c.green,
      warning: c.yellow,
      stale: c.red,
      dead: c.red + c.bright,
    };
    
    const statusIcon: Record<string, string> = {
      healthy: "✓",
      warning: "!",
      stale: "⚠",
      dead: "✗",
    };
    
    const color = statusColors[status.status];
    const icon = statusIcon[status.status];
    
    console.log(
      `${color}${icon} ${status.agent_id.slice(0, 35)}${c.reset} ` +
      `[${status.role}] ` +
      `${color}${status.status.toUpperCase()}${c.reset}`
    );
    console.log(`  ${c.dim}Last heartbeat: ${formatDuration(status.age_ms)} ago${c.reset}`);
    
    if (status.current_task) {
      console.log(`  ${c.dim}Task: ${status.current_task.slice(0, 50)}${c.reset}`);
    }
    
    if (status.issues.length > 0) {
      for (const issue of status.issues) {
        console.log(`  ${c.yellow}→ ${issue}${c.reset}`);
      }
    }
    
    console.log();
  }
  
  // Recent alerts
  const recentAlerts = metrics.alerts.slice(-5).reverse();
  if (recentAlerts.length > 0) {
    console.log(`${c.bright}Recent Alerts:${c.reset}\n`);
    for (const alert of recentAlerts) {
      const timeAgo = formatDuration(Date.now() - new Date(alert.timestamp).getTime());
      console.log(
        `  ${c.yellow}[${alert.type}]${c.reset} ${alert.agent_id.slice(0, 30)} ` +
        `${c.dim}(${timeAgo} ago)${c.reset}`
      );
      console.log(`    ${alert.message}`);
    }
    console.log();
  }
}

function runCheck(): void {
  console.log(`\n${c.cyan}Running health check...${c.reset}\n`);
  
  const statuses = getAllHealthStatuses();
  recordHealthCheck();
  
  let hasIssues = false;
  
  for (const status of statuses) {
    if (status.status !== "healthy") {
      hasIssues = true;
      const color = status.status === "warning" ? c.yellow : c.red;
      console.log(`${color}[${status.status.toUpperCase()}]${c.reset} ${status.agent_id}`);
      for (const issue of status.issues) {
        console.log(`  ${c.dim}→ ${issue}${c.reset}`);
      }
    }
  }
  
  if (!hasIssues) {
    console.log(`${c.green}✓ All ${statuses.length} agents are healthy${c.reset}`);
  }
  
  console.log();
}

function showMetrics(): void {
  const metrics = getMetricsStore();
  
  console.log(`\n${c.bright}${c.blue}HEALTH METRICS${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(80)}${c.reset}\n`);
  
  console.log(`${c.cyan}Checks Performed:${c.reset}  ${metrics.checks_performed}`);
  console.log(`${c.cyan}Last Updated:${c.reset}      ${metrics.last_updated}`);
  
  console.log(`\n${c.bright}Cleanup Stats:${c.reset}`);
  console.log(`  Total cleanups: ${metrics.cleanup_stats.total_cleanups}`);
  console.log(`  Agents removed: ${metrics.cleanup_stats.agents_removed}`);
  console.log(`  Last cleanup: ${metrics.cleanup_stats.last_cleanup || "never"}`);
  
  console.log(`\n${c.bright}Alert Summary:${c.reset}`);
  const alertsByType: Record<string, number> = {};
  for (const alert of metrics.alerts) {
    alertsByType[alert.type] = (alertsByType[alert.type] || 0) + 1;
  }
  
  for (const [type, count] of Object.entries(alertsByType)) {
    const color = type === "dead" || type === "stale" ? c.red : c.yellow;
    console.log(`  ${color}${type}:${c.reset} ${count}`);
  }
  
  console.log();
}

function runCleanup(): void {
  console.log(`\n${c.cyan}Running cleanup...${c.reset}\n`);
  
  const { removed, remaining } = cleanupStaleAgents(false);
  
  if (removed.length === 0) {
    console.log(`${c.green}✓ No dead agents to clean up${c.reset}`);
  } else {
    console.log(`${c.yellow}Removed ${removed.length} dead agent(s):${c.reset}`);
    for (const agent of removed) {
      console.log(`  ${c.red}✗${c.reset} ${agent.agent_id} (last seen: ${agent.last_heartbeat})`);
    }
  }
  
  console.log(`\n${c.dim}Remaining agents: ${remaining.length}${c.reset}\n`);
}

async function startMonitor(interval = 30000): Promise<void> {
  console.log(`\n${c.bright}${c.cyan}AGENT HEALTH MONITOR${c.reset}`);
  console.log(`${c.dim}Checking every ${interval / 1000}s | Press Ctrl+C to stop${c.reset}\n`);
  
  const check = () => {
    console.clear();
    console.log(`${c.bright}${c.cyan}AGENT HEALTH MONITOR${c.reset} ${c.dim}${new Date().toLocaleTimeString()}${c.reset}\n`);
    
    const statuses = getAllHealthStatuses();
    recordHealthCheck();
    
    // Summary bar
    const healthy = statuses.filter(s => s.status === "healthy").length;
    const warning = statuses.filter(s => s.status === "warning").length;
    const stale = statuses.filter(s => s.status === "stale").length;
    const dead = statuses.filter(s => s.status === "dead").length;
    
    console.log(
      `${c.green}● Healthy: ${healthy}${c.reset}  ` +
      `${c.yellow}● Warning: ${warning}${c.reset}  ` +
      `${c.red}● Stale: ${stale}${c.reset}  ` +
      `${c.red}${c.bright}● Dead: ${dead}${c.reset}`
    );
    
    console.log(`\n${c.dim}${"─".repeat(60)}${c.reset}\n`);
    
    // Agent list
    for (const status of statuses) {
      const statusColors: Record<string, string> = {
        healthy: c.green,
        warning: c.yellow,
        stale: c.red,
        dead: c.red + c.bright,
      };
      
      const color = statusColors[status.status];
      const icon = status.status === "healthy" ? "●" : status.status === "warning" ? "◐" : "○";
      
      console.log(
        `${color}${icon}${c.reset} ${status.agent_id.slice(-30).padEnd(32)} ` +
        `${color}${status.status.padEnd(8)}${c.reset} ` +
        `${c.dim}${formatDuration(status.age_ms).padStart(8)}${c.reset}`
      );
    }
    
    // Auto-cleanup dead agents
    if (dead > 0) {
      console.log(`\n${c.yellow}Auto-cleaning ${dead} dead agent(s)...${c.reset}`);
      cleanupStaleAgents(false);
    }
    
    console.log(`\n${c.dim}Next check in ${interval / 1000}s${c.reset}`);
  };
  
  check();
  setInterval(check, interval);
  
  process.on("SIGINT", () => {
    console.log(`\n${c.dim}Monitor stopped.${c.reset}`);
    process.exit(0);
  });
}

function showHelp(): void {
  console.log(`
${c.bright}${c.cyan}Agent Health Monitor${c.reset}

${c.cyan}Usage:${c.reset}
  bun tools/agent-health-monitor.ts <command>

${c.cyan}Commands:${c.reset}
  ${c.bright}status${c.reset}    Show current health status of all agents
  ${c.bright}check${c.reset}     Run a single health check
  ${c.bright}monitor${c.reset}   Start continuous monitoring (with auto-cleanup)
  ${c.bright}metrics${c.reset}   Show performance metrics
  ${c.bright}cleanup${c.reset}   Remove stale/dead agents
  ${c.bright}help${c.reset}      Show this help

${c.cyan}Thresholds:${c.reset}
  Warning:  ${formatDuration(THRESHOLDS.WARNING_AGENT_MS)}
  Stale:    ${formatDuration(THRESHOLDS.STALE_AGENT_MS)}
  Dead:     ${formatDuration(THRESHOLDS.DEAD_AGENT_MS)}

${c.dim}Logs: ${HEALTH_LOG_PATH}${c.reset}
${c.dim}Metrics: ${HEALTH_METRICS_PATH}${c.reset}
`);
}

// CLI routing
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "status":
    showStatus();
    break;
  case "check":
    runCheck();
    break;
  case "monitor":
    startMonitor(parseInt(args[1]) || 30000);
    break;
  case "metrics":
    showMetrics();
    break;
  case "cleanup":
    runCleanup();
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
