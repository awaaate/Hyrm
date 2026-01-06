/**
 * Heartbeat Service Utilities
 * 
 * Provides functions to:
 * - Verify heartbeat service health
 * - Check if orchestrator-state.json is being updated
 * - Track success rate across sessions
 * - Calculate lease age and TTL
 */

import { readJson, writeJson } from "./json-utils.ts";
import { PATHS, getMemoryPath, LOGS_DIR } from "./paths.ts";
import { existsSync, readFileSync } from "fs";
import { spawnSync } from "child_process";
import { join } from "path";

export interface HeartbeatStats {
  service_running: boolean;
  service_pid: string | null;
  last_update: string;
  last_update_age_ms: number;
  leader_id: string;
  leader_epoch: number;
  lease_ttl_ms: number;
  lease_age_ms: number;
  lease_healthy: boolean;
  update_frequency_hz: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
}

export interface HeartbeatHistory {
  session_start: string;
  updates: Array<{
    timestamp: string;
    agent_id: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Check if heartbeat service process is running
 */
export function isHeartbeatServiceRunning(): boolean {
  const pidFile = getMemoryPath(".heartbeat-service.pid");
  if (!existsSync(pidFile)) return false;
  
  try {
    const pidContent = readFileSync(pidFile, "utf-8").trim();
    const pid = parseInt(pidContent);
    if (isNaN(pid)) return false;
    
    // Try to check if process exists using kill -0
    const result = spawnSync("kill", ["-0", pid.toString()], {
      stdio: "pipe",
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Get the PID of the running heartbeat service
 */
export function getHeartbeatServicePid(): string | null {
  const pidFile = getMemoryPath(".heartbeat-service.pid");
  if (!existsSync(pidFile)) return null;
  
  try {
    return readFileSync(pidFile, "utf-8").trim();
  } catch {
    return null;
  }
}

/**
 * Get orchestrator state (leader lease info)
 */
export function getOrchestratorState(): any {
  try {
    return readJson(PATHS.orchestratorState, null);
  } catch {
    return null;
  }
}

/**
 * Calculate age of last heartbeat in milliseconds
 */
export function getLeaseAge(): number {
  const state = getOrchestratorState();
  if (!state || !state.last_heartbeat) return -1;
  
  const lastHeartbeat = new Date(state.last_heartbeat).getTime();
  const now = Date.now();
  return now - lastHeartbeat;
}

/**
 * Check if leader lease is healthy (age < TTL)
 */
export function isLeaseHealthy(): boolean {
  const state = getOrchestratorState();
  if (!state) return false;
  
  const age = getLeaseAge();
  return age >= 0 && age < state.ttl_ms;
}

/**
 * Get comprehensive heartbeat status
 */
export function getHeartbeatStatus(): HeartbeatStats {
  const state = getOrchestratorState();
  const leaseAge = getLeaseAge();
  
  return {
    service_running: isHeartbeatServiceRunning(),
    service_pid: getHeartbeatServicePid(),
    last_update: state?.last_heartbeat || "NEVER",
    last_update_age_ms: leaseAge >= 0 ? leaseAge : -1,
    leader_id: state?.leader_id || "UNKNOWN",
    leader_epoch: state?.leader_epoch || -1,
    lease_ttl_ms: state?.ttl_ms || 0,
    lease_age_ms: leaseAge,
    lease_healthy: isLeaseHealthy(),
    update_frequency_hz: 1.0 / 60.0, // Expected: once per 60 seconds
    success_count: 0, // Populated from logs
    failure_count: 0, // Populated from logs
    success_rate: 0,  // Calculated from success/failure counts
  };
}

/**
 * Analyze heartbeat service logs to count successes/failures
 */
export function analyzeHeartbeatLogs(): { success: number; failure: number; error_types: Record<string, number> } {
  const result = {
    success: 0,
    failure: 0,
    error_types: {} as Record<string, number>,
  };

  try {
    const logPath = join(LOGS_DIR, "heartbeat-service.log");
    if (!existsSync(logPath)) return result;

    const content = readFileSync(logPath, "utf-8");
    const lines = content.split("\n");

    for (const line of lines) {
      if (line.includes("[INFO]") && line.includes("complete")) {
        result.success++;
      } else if (line.includes("[WARN]") || line.includes("[ERROR]")) {
        result.failure++;
        // Extract error type
        const match = line.match(/\[(WARN|ERROR)\]\s*(.+?)(\s|$)/);
        if (match) {
          const errorType = match[2];
          result.error_types[errorType] = (result.error_types[errorType] || 0) + 1;
        }
      }
    }
  } catch {
    // Silently fail if logs not available
  }

  return result;
}

/**
 * Record a heartbeat update in the history file
 */
export function recordHeartbeatUpdate(
  agentId: string,
  success: boolean,
  error?: string
): void {
  const historyFile = getMemoryPath("heartbeat-history.json");
  let history: HeartbeatHistory = {
    session_start: new Date().toISOString(),
    updates: [],
  };

  try {
    const existing = readJson<HeartbeatHistory>(historyFile, history);
    if (existing && Array.isArray(existing.updates)) {
      history = existing;
    }
  } catch {
    // Start fresh if file doesn't exist
  }

  // Keep only last 1000 updates to avoid unbounded growth
  if (history.updates.length > 1000) {
    history.updates = history.updates.slice(-500);
  }

  history.updates.push({
    timestamp: new Date().toISOString(),
    agent_id: agentId,
    success,
    error,
  });

  try {
    writeJson(historyFile, history);
  } catch {
    // Silently fail - history recording should never break heartbeat
  }
}

/**
 * Get summary of heartbeat health
 */
export function getHeartbeatHealthSummary(): string {
  const status = getHeartbeatStatus();
  const logs = analyzeHeartbeatLogs();
  
  const parts: string[] = [];
  
  // Service status
  if (status.service_running) {
    parts.push(`✓ Service running (PID: ${status.service_pid})`);
  } else {
    parts.push(`✗ Service NOT RUNNING`);
  }
  
  // Lease status
  if (status.lease_healthy) {
    parts.push(`✓ Lease healthy (age: ${status.last_update_age_ms}ms < ${status.lease_ttl_ms}ms)`);
  } else {
    parts.push(`✗ Lease UNHEALTHY (age: ${status.last_update_age_ms}ms >= ${status.lease_ttl_ms}ms)`);
  }
  
  // Last update
  parts.push(`Last update: ${status.last_update}`);
  if (status.last_update_age_ms >= 0) {
    parts.push(`Update age: ${Math.round(status.last_update_age_ms / 1000)}s ago`);
  }
  
  // Success rate
  const total = logs.success + logs.failure;
  if (total > 0) {
    const rate = Math.round((logs.success / total) * 100);
    parts.push(`Success rate: ${rate}% (${logs.success}/${total})`);
  }
  
  return parts.join(" | ");
}
