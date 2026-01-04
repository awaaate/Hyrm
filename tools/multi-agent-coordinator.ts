#!/usr/bin/env bun
/**
 * Multi-Agent Coordination System
 * 
 * Enables multiple OpenCode agents to work together by:
 * - Tracking active agents in a registry
 * - Providing message bus for inter-agent communication
 * - Handling file lock conflicts
 * - Coordinating task distribution
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { PATHS, MEMORY_DIR, getMemoryPath } from "./shared";

// Use centralized paths from shared/paths.ts
const REGISTRY_PATH = PATHS.agentRegistry;
const MESSAGE_BUS_PATH = PATHS.messageBus;
const COORDINATION_LOG = PATHS.coordinationLog;
const ORCHESTRATOR_STATE_PATH = PATHS.orchestratorState || getMemoryPath("orchestrator-state.json");

// Leader lease configuration (for orchestrator election)
const ORCHESTRATOR_LEASE_TTL_MS = 3 * 60 * 1000; // 3 minutes

// Stale agent detection configuration
const STALE_AGENT_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes - more aggressive than before

interface OrchestratorLease {
  leader_id: string;
  leader_epoch: number;
  last_heartbeat: string;
  ttl_ms: number;
}

interface Agent {
  agent_id: string;
  session_id: string;
  started_at: string;
  last_heartbeat: string;
  status: "active" | "idle" | "working" | "blocked";
  current_task?: string;
  assigned_role?: string;
  pid?: number;
}

interface AgentRegistry {
  version: string;
  agents: Agent[];
  last_updated: string | null;
  lock_version: number;
}

// Payload types for different message types
interface BroadcastPayload {
  status: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

interface HeartbeatPayload {
  status: Agent["status"];
}

interface TaskClaimPayload {
  task_id: string;
  claimed_by: string;
  claimed_at: string;
}

interface TaskCompletePayload {
  task_id: string;
  completed_by: string;
  completed_at: string;
  result?: Record<string, unknown>;
}

interface RequestHelpPayload {
  task: string;
  details?: Record<string, unknown>;
  requester: string;
}

interface TaskAvailablePayload {
  task_id: string;
  title: string;
  priority?: string;
}

interface FileLockPayload {
  file_path: string;
  action: "lock" | "unlock";
}

interface DirectPayload {
  message: string;
  data?: Record<string, unknown>;
}

type MessagePayload = 
  | BroadcastPayload 
  | HeartbeatPayload 
  | TaskClaimPayload 
  | TaskCompletePayload 
  | RequestHelpPayload 
  | TaskAvailablePayload 
  | FileLockPayload 
  | DirectPayload
  | Record<string, unknown>;

interface Message {
  message_id: string;
  from_agent: string;
  to_agent?: string; // If null, broadcast to all
  timestamp: string;
  type: "broadcast" | "direct" | "task_claim" | "task_complete" | "heartbeat" | "request_help" | "file_lock" | "task_available";
  payload: MessagePayload;
  read_by?: string[];
}

class MultiAgentCoordinator {
  private agentId: string;
  private sessionId: string;
  private heartbeatInterval?: NodeJS.Timeout;
  private heartbeatCount: number = 0;
  private isLeader: boolean = false;
  private leaderEpoch: number | null = null;

  constructor(sessionId?: string) {
    // Use session-based agent ID to avoid duplicates from parallel plugin instances
    // If sessionId is provided, derive agentId from it for consistency
    // Otherwise fall back to timestamp-based ID
    if (sessionId) {
      // Extract a consistent hash from sessionId to create deterministic agentId
      const hash = sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(-8);
      this.agentId = `agent-${hash}`;
    } else {
      this.agentId = `agent-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    }
    this.sessionId = sessionId || `session-${Date.now()}`;
  }

  /**
   * Register this agent in the registry with optimistic locking
   */
  async register(role?: string): Promise<boolean> {
    const maxRetries = 5;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const registry = this.readRegistry();
        const expectedVersion = registry.lock_version;

        // Remove stale agents (no heartbeat in 2 minutes - more aggressive)
        const staleThreshold = Date.now() - STALE_AGENT_THRESHOLD_MS;
        const staleAgents = registry.agents.filter((agent) => {
          const lastHB = new Date(agent.last_heartbeat).getTime();
          return lastHB <= staleThreshold;
        });
        
        if (staleAgents.length > 0) {
          this.log("INFO", `Cleaning up ${staleAgents.length} stale agent(s): ${staleAgents.map(a => a.agent_id).join(", ")}`);
        }
        
        registry.agents = registry.agents.filter((agent) => {
          const lastHB = new Date(agent.last_heartbeat).getTime();
          return lastHB > staleThreshold;
        });

        // Check if this agent already exists (update vs add)
        const existingIndex = registry.agents.findIndex(
          (a) => a.agent_id === this.agentId
        );

        const now = new Date().toISOString();
        
        if (existingIndex >= 0) {
          // Update existing agent's role and heartbeat
          registry.agents[existingIndex].assigned_role = role;
          registry.agents[existingIndex].last_heartbeat = now;
          registry.agents[existingIndex].status = "active";
        } else {
          // Add new agent
          const newAgent: Agent = {
            agent_id: this.agentId,
            session_id: this.sessionId,
            started_at: now,
            last_heartbeat: now,
            status: "active",
            assigned_role: role,
            pid: process.pid,
          };
          registry.agents.push(newAgent);
        }
        registry.last_updated = new Date().toISOString();
        registry.lock_version = expectedVersion + 1;

        // Atomic write with version check
        const success = this.writeRegistryAtomic(registry, expectedVersion);
        
        if (success) {
          this.log("INFO", `Agent registered: ${this.agentId} (role: ${role || "general"})`);

          if (role === "orchestrator") {
            // Initialize leader election for orchestrator agents
            this.initializeLeaderElection();
          }

          return true;
        }

        // Version mismatch, retry
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
      } catch (error) {
        this.log("ERROR", `Registration attempt ${attempt + 1} failed: ${error}`);
      }
    }

    this.log("ERROR", "Failed to register agent after max retries");
    return false;
  }

  /**
   * Unregister this agent from the registry
   */
  async unregister(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    const registry = this.readRegistry();
    registry.agents = registry.agents.filter(
      (agent) => agent.agent_id !== this.agentId
    );
    registry.last_updated = new Date().toISOString();
    registry.lock_version++;

    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
    this.log("INFO", `Agent unregistered: ${this.agentId}`);
  }

  /**
   * Start heartbeat to keep agent alive in registry
   * Reduced frequency to avoid message bus spam
   */
  startHeartbeat(intervalMs: number = 60000): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, intervalMs);

    // Send initial heartbeat
    this.sendHeartbeat();
  }

  /**
   * Send heartbeat to update agent status
   * Only updates registry - message bus heartbeats are reduced to every 5th call
   * Orchestrator leaders also run periodic cleanup on every heartbeat
   */
  private sendHeartbeat(): void {
    this.heartbeatCount++;
    const registry = this.readRegistry();
    const agent = registry.agents.find((a) => a.agent_id === this.agentId);
    
    if (agent) {
      agent.last_heartbeat = new Date().toISOString();
      registry.last_updated = new Date().toISOString();
      writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));

      // If this coordinator is the orchestrator leader, refresh the lease heartbeat as well
      this.refreshLeaderLease();
      
      // Orchestrator leaders perform periodic cleanup on every heartbeat
      if (this.isLeader) {
        const cleanedUp = this.cleanupStaleAgents();
        if (cleanedUp > 0) {
          this.log("INFO", `Orchestrator heartbeat: cleaned up ${cleanedUp} stale agents`);
        }
      }
    }

    // Only send message bus heartbeat every 5th call (every 5 minutes with 60s interval)
    // This reduces message bus spam while still allowing coordination visibility
    if (this.heartbeatCount % 5 === 1) {
      this.sendMessage({
        type: "heartbeat",
        payload: { status: agent?.status || "active" },
      });
    }
  }

  /**
   * Update agent status
   */
  updateStatus(status: Agent["status"], currentTask?: string): void {
    const registry = this.readRegistry();
    const agent = registry.agents.find((a) => a.agent_id === this.agentId);
    
    if (agent) {
      agent.status = status;
      agent.current_task = currentTask;
      agent.last_heartbeat = new Date().toISOString();
      registry.last_updated = new Date().toISOString();
      registry.lock_version++;
      
      writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
      this.log("INFO", `Status updated: ${status}${currentTask ? ` - ${currentTask}` : ""}`);
    }
  }

  /**
   * Get all active agents (filters out stale agents automatically)
   */
  getActiveAgents(): Agent[] {
    const registry = this.readRegistry();
    const staleThreshold = Date.now() - STALE_AGENT_THRESHOLD_MS;
    
    return registry.agents.filter((agent) => {
      const lastHB = new Date(agent.last_heartbeat).getTime();
      return lastHB > staleThreshold;
    });
  }

  /**
   * Clean up stale agents from the registry and release their orphaned tasks
   * Returns the number of agents cleaned up
   */
  cleanupStaleAgents(): number {
    const registry = this.readRegistry();
    const staleThreshold = Date.now() - STALE_AGENT_THRESHOLD_MS;
    const originalCount = registry.agents.length;
    
    const staleAgents = registry.agents.filter((agent) => {
      const lastHB = new Date(agent.last_heartbeat).getTime();
      return lastHB <= staleThreshold;
    });
    
    if (staleAgents.length === 0) {
      return 0;
    }
    
    // Release orphaned tasks assigned to stale agents
    const staleAgentIds = staleAgents.map(a => a.agent_id);
    const releasedTasksCount = this.releaseOrphanedTasks(staleAgentIds);
    
    registry.agents = registry.agents.filter((agent) => {
      const lastHB = new Date(agent.last_heartbeat).getTime();
      return lastHB > staleThreshold;
    });
    
    registry.last_updated = new Date().toISOString();
    registry.lock_version++;
    
    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
    
    this.log("INFO", `Cleaned up ${staleAgents.length} stale agent(s): ${staleAgents.map(a => a.agent_id).join(", ")}`);
    if (releasedTasksCount > 0) {
      this.log("INFO", `Released ${releasedTasksCount} orphaned task(s) from stale agents`);
    }
    
    return staleAgents.length;
  }

  /**
   * Release tasks that are assigned to stale agents
   * Returns the number of tasks released
   */
  private releaseOrphanedTasks(staleAgentIds: string[]): number {
    const tasksPath = getMemoryPath("tasks.json");
    
    if (!existsSync(tasksPath)) {
      return 0;
    }
    
    try {
      const tasksContent = readFileSync(tasksPath, "utf-8");
      const tasksStore = JSON.parse(tasksContent);
      
      if (!tasksStore.tasks || !Array.isArray(tasksStore.tasks)) {
        return 0;
      }
      
      let releasedCount = 0;
      const releasedTaskIds: string[] = [];
      
      // Find and release orphaned tasks
      for (const task of tasksStore.tasks) {
        if (
          task.status === "in_progress" && 
          task.assigned_to && 
          staleAgentIds.includes(task.assigned_to)
        ) {
          // Save the stale agent ID before clearing it
          const staleAgentId = task.assigned_to;
          
          // Release the task
          task.status = "pending";
          task.assigned_to = undefined;
          task.claimed_at = undefined;
          task.updated_at = new Date().toISOString();
          
          // Add note about the release
          if (!task.notes) {
            task.notes = [];
          }
          task.notes.push(
            `[${new Date().toISOString()}] Released from stale agent ${staleAgentId} by cleanup`
          );
          
          releasedCount++;
          releasedTaskIds.push(task.id);
          
          this.log("INFO", `Released orphaned task ${task.id} (${task.title}) from stale agent ${staleAgentId}`);
        }
      }
      
      if (releasedCount > 0) {
        // Write updated tasks back to file
        tasksStore.last_updated = new Date().toISOString();
        writeFileSync(tasksPath, JSON.stringify(tasksStore, null, 2));
        
        // Broadcast task_available messages for released tasks
        for (const taskId of releasedTaskIds) {
          const task = tasksStore.tasks.find((t: any) => t.id === taskId);
          if (task) {
            try {
              this.sendMessage({
                type: "task_available",
                payload: {
                  task_id: task.id,
                  title: task.title,
                  priority: task.priority,
                },
              });
            } catch (e) {
              this.log("WARN", `Failed to broadcast task_available for released task ${taskId}: ${e}`);
            }
          }
        }
      }
      
      return releasedCount;
    } catch (error) {
      this.log("ERROR", `Failed to release orphaned tasks: ${error}`);
      return 0;
    }
  }

  /**
   * Get health status of all agents with detailed metrics
   */
  getAgentHealthStatus(): { healthy: Agent[]; stale: Agent[]; unhealthy: Agent[] } {
    const registry = this.readRegistry();
    const now = Date.now();
    const staleThreshold = now - STALE_AGENT_THRESHOLD_MS;
    const unhealthyThreshold = now - (STALE_AGENT_THRESHOLD_MS / 2); // 1 minute for "unhealthy" warning
    
    const healthy: Agent[] = [];
    const stale: Agent[] = [];
    const unhealthy: Agent[] = [];
    
    for (const agent of registry.agents) {
      const lastHB = new Date(agent.last_heartbeat).getTime();
      
      if (lastHB <= staleThreshold) {
        stale.push(agent);
      } else if (lastHB <= unhealthyThreshold) {
        unhealthy.push(agent);
      } else {
        healthy.push(agent);
      }
    }
    
    return { healthy, stale, unhealthy };
  }

  /**
   * Send message to other agents
   */
  sendMessage(options: {
    type: Message["type"];
    payload: MessagePayload;
    toAgent?: string;
  }): void {
    const message: Message = {
      message_id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      from_agent: this.agentId,
      to_agent: options.toAgent,
      timestamp: new Date().toISOString(),
      type: options.type,
      payload: options.payload,
      read_by: [],
    };

    const messageLine = JSON.stringify(message) + "\n";
    
    if (existsSync(MESSAGE_BUS_PATH)) {
      const content = readFileSync(MESSAGE_BUS_PATH, "utf-8");
      writeFileSync(MESSAGE_BUS_PATH, content + messageLine);
    } else {
      writeFileSync(MESSAGE_BUS_PATH, messageLine);
    }

    this.log("INFO", `Message sent: ${options.type} ${options.toAgent ? `to ${options.toAgent}` : "(broadcast)"}`);
  }

  /**
   * Read messages addressed to this agent (or broadcasts)
   */
  readMessages(since?: Date): Message[] {
    if (!existsSync(MESSAGE_BUS_PATH)) {
      return [];
    }

    const content = readFileSync(MESSAGE_BUS_PATH, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const messages: Message[] = [];

    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as Message;
        
        // Filter by timestamp if provided
        if (since && new Date(msg.timestamp) < since) {
          continue;
        }

        // Check if message is for this agent
        if (
          msg.from_agent !== this.agentId && // Not from self
          (!msg.to_agent || msg.to_agent === this.agentId) && // To me or broadcast
          (!msg.read_by || !msg.read_by.includes(this.agentId)) // Not already read
        ) {
          messages.push(msg);
        }
      } catch (error) {
        this.log("WARN", `Failed to parse message: ${line}`);
      }
    }

    return messages;
  }

  /**
   * Mark messages as read
   */
  markAsRead(messageIds: string[]): void {
    if (!existsSync(MESSAGE_BUS_PATH)) return;

    const content = readFileSync(MESSAGE_BUS_PATH, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const updatedLines: string[] = [];

    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as Message;
        
        if (messageIds.includes(msg.message_id)) {
          if (!msg.read_by) msg.read_by = [];
          if (!msg.read_by.includes(this.agentId)) {
            msg.read_by.push(this.agentId);
          }
        }
        
        updatedLines.push(JSON.stringify(msg));
      } catch (error) {
        updatedLines.push(line);
      }
    }

    writeFileSync(MESSAGE_BUS_PATH, updatedLines.join("\n") + "\n");
  }

  /**
   * Request file lock to prevent conflicts
   */
  requestFileLock(filePath: string, timeoutMs: number = 10000): boolean {
    const lockFile = `${filePath}.lock`;
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (!existsSync(lockFile)) {
        // Create lock
        writeFileSync(
          lockFile,
          JSON.stringify({
            agent_id: this.agentId,
            locked_at: new Date().toISOString(),
            pid: process.pid,
          })
        );

        this.log("INFO", `File locked: ${filePath}`);
        return true;
      }

      // Check if lock is stale (older than 2 minutes)
      try {
        const lockData = JSON.parse(readFileSync(lockFile, "utf-8"));
        const lockedAt = new Date(lockData.locked_at).getTime();
        
        if (Date.now() - lockedAt > 2 * 60 * 1000) {
          this.log("WARN", `Removing stale lock on ${filePath}`);
          // Remove stale lock
          require("fs").unlinkSync(lockFile);
          continue;
        }
      } catch (error) {
        // Invalid lock file, remove it
        require("fs").unlinkSync(lockFile);
        continue;
      }

      // Wait before retry
      Bun.sleepSync(100);
    }

    this.log("ERROR", `Failed to acquire lock on ${filePath}`);
    return false;
  }

  /**
   * Release file lock
   */
  releaseFileLock(filePath: string): void {
    const lockFile = `${filePath}.lock`;
    
    if (existsSync(lockFile)) {
      try {
        const lockData = JSON.parse(readFileSync(lockFile, "utf-8"));
        
        // Only release if we own the lock
        if (lockData.agent_id === this.agentId) {
          require("fs").unlinkSync(lockFile);
          this.log("INFO", `File unlocked: ${filePath}`);
        }
      } catch (error) {
        this.log("WARN", `Failed to release lock on ${filePath}: ${error}`);
      }
    }
  }

  /**
   * Read the current orchestrator leader lease without acquiring a lock.
   * Callers should hold the ORCHESTRATOR_STATE_PATH lock before calling.
   */
  private readLeaderLeaseUnsafe(): OrchestratorLease | null {
    if (!existsSync(ORCHESTRATOR_STATE_PATH)) {
      return null;
    }

    try {
      const raw = readFileSync(ORCHESTRATOR_STATE_PATH, "utf-8");
      const data = JSON.parse(raw) as OrchestratorLease;

      if (!data.leader_id || typeof data.leader_epoch !== "number" || !data.last_heartbeat) {
        return null;
      }

      // Default ttl_ms if missing or invalid
      if (typeof data.ttl_ms !== "number" || data.ttl_ms <= 0) {
        data.ttl_ms = ORCHESTRATOR_LEASE_TTL_MS;
      }

      return data;
    } catch (error) {
      this.log("WARN", `Failed to read orchestrator lease: ${error}`);
      return null;
    }
  }

  /**
   * Persist a new orchestrator leader lease.
   * Callers should hold the ORCHESTRATOR_STATE_PATH lock before calling.
   */
  private writeLeaderLeaseUnsafe(lease: OrchestratorLease): void {
    writeFileSync(ORCHESTRATOR_STATE_PATH, JSON.stringify(lease, null, 2));
  }

  /**
   * Determine whether a lease has expired based on its ttl_ms.
   */
  private isLeaseExpired(lease: OrchestratorLease, nowMs: number = Date.now()): boolean {
    const last = new Date(lease.last_heartbeat).getTime();
    const ttl = lease.ttl_ms > 0 ? lease.ttl_ms : ORCHESTRATOR_LEASE_TTL_MS;
    if (!last) return true;
    return nowMs - last > ttl;
  }

  /**
   * Initialize leader election for orchestrator agents.
   * Called during register() when role === "orchestrator".
   */
  private initializeLeaderElection(): void {
    try {
      const locked = this.requestFileLock(ORCHESTRATOR_STATE_PATH);
      if (!locked) {
        this.log("ERROR", "Failed to acquire lock for orchestrator-state.json during leader election");
        this.isLeader = false;
        this.leaderEpoch = null;
        return;
      }

      try {
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const current = this.readLeaderLeaseUnsafe();

        if (!current) {
          // No existing lease -> become leader with epoch 1
          const newLease: OrchestratorLease = {
            leader_id: this.agentId,
            leader_epoch: 1,
            last_heartbeat: nowIso,
            ttl_ms: ORCHESTRATOR_LEASE_TTL_MS,
          };
          this.writeLeaderLeaseUnsafe(newLease);
          this.isLeader = true;
          this.leaderEpoch = newLease.leader_epoch;
          this.log("INFO", `Acquired new orchestrator leader lease (epoch ${newLease.leader_epoch})`);
          return;
        }

        if (this.isLeaseExpired(current, nowMs)) {
          // Existing lease is stale -> take over with incremented epoch
          const nextEpoch = (current.leader_epoch || 0) + 1;
          const newLease: OrchestratorLease = {
            leader_id: this.agentId,
            leader_epoch: nextEpoch,
            last_heartbeat: nowIso,
            ttl_ms: current.ttl_ms > 0 ? current.ttl_ms : ORCHESTRATOR_LEASE_TTL_MS,
          };
          this.writeLeaderLeaseUnsafe(newLease);
          this.isLeader = true;
          this.leaderEpoch = newLease.leader_epoch;
          this.log(
            "WARN",
            `Took over orchestrator leader lease from stale leader ${current.leader_id} (epoch ${newLease.leader_epoch})`
          );
          return;
        }

        if (current.leader_id === this.agentId) {
          // We are already the recorded leader -> refresh heartbeat in lease
          const refreshed: OrchestratorLease = {
            ...current,
            last_heartbeat: nowIso,
          };
          this.writeLeaderLeaseUnsafe(refreshed);
          this.isLeader = true;
          this.leaderEpoch = refreshed.leader_epoch;
          this.log("INFO", `Confirmed as current orchestrator leader (epoch ${refreshed.leader_epoch})`);
          return;
        }

        // Another healthy leader exists; this agent should NOT act as orchestrator
        this.isLeader = false;
        this.leaderEpoch = null;
        this.log(
          "WARN",
          `Detected existing healthy orchestrator leader ${current.leader_id} (epoch ${current.leader_epoch}). ` +
          `This agent (${this.agentId}) should self-demote and NOT act as orchestrator. ` +
          `Use isOrchestratorLeader() to check before spawning workers or respawning.`
        );
      } finally {
        this.releaseFileLock(ORCHESTRATOR_STATE_PATH);
      }
    } catch (error) {
      this.log("ERROR", `Leader election initialization failed: ${error}`);
      this.isLeader = false;
      this.leaderEpoch = null;
    }
  }

  /**
   * Refresh the leader lease if this coordinator is the current leader.
   * Called from sendHeartbeat().
   */
  private refreshLeaderLease(): void {
    if (!this.isLeader || this.leaderEpoch == null) {
      return;
    }

    try {
      const locked = this.requestFileLock(ORCHESTRATOR_STATE_PATH);
      if (!locked) {
        this.log("WARN", "Failed to acquire lock for orchestrator-state.json during lease refresh");
        return;
      }

      try {
        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const current = this.readLeaderLeaseUnsafe();

        if (!current) {
          // Lease file missing - recreate with current epoch
          const recreated: OrchestratorLease = {
            leader_id: this.agentId,
            leader_epoch: this.leaderEpoch,
            last_heartbeat: nowIso,
            ttl_ms: ORCHESTRATOR_LEASE_TTL_MS,
          };
          this.writeLeaderLeaseUnsafe(recreated);
          this.log("WARN", "Recreated missing orchestrator leader lease");
          return;
        }

        if (current.leader_id !== this.agentId || current.leader_epoch !== this.leaderEpoch) {
          // Another leader has taken over; demote self
          this.isLeader = false;
          this.leaderEpoch = null;
          this.log(
            "WARN",
            `Lost orchestrator leadership to ${current.leader_id} (epoch ${current.leader_epoch}); demoting self.`
          );
          return;
        }

        // Still leader -> refresh heartbeat
        const refreshed: OrchestratorLease = {
          ...current,
          last_heartbeat: nowIso,
        };
        this.writeLeaderLeaseUnsafe(refreshed);
      } finally {
        this.releaseFileLock(ORCHESTRATOR_STATE_PATH);
      }
    } catch (error) {
      this.log("WARN", `Failed to refresh orchestrator leader lease: ${error}`);
    }
  }

  /**
   * Check if this coordinator is currently the orchestrator leader.
   */
  public isOrchestratorLeader(): boolean {
    return this.isLeader && this.leaderEpoch != null;
  }

  /**
   * Get the current leader epoch (for fencing token use).
   */
  public getLeaderEpoch(): number | null {
    return this.leaderEpoch;
  }

  /**
   * Get this coordinator's agent ID.
   */
  public getAgentId(): string {
    return this.agentId;
  }

  /**
   * Public helper to inspect current leader lease.
   */
  public getCurrentLeaderLease(): OrchestratorLease | null {
    try {
      const locked = this.requestFileLock(ORCHESTRATOR_STATE_PATH);
      if (!locked) {
        this.log("WARN", "Failed to acquire lock for orchestrator-state.json while reading leader lease");
        return null;
      }

      try {
        return this.readLeaderLeaseUnsafe();
      } finally {
        this.releaseFileLock(ORCHESTRATOR_STATE_PATH);
      }
    } catch (error) {
      this.log("WARN", `Failed to read current leader lease: ${error}`);
      return null;
    }
  }

  /**
   * Release the leader lease before spawning a new orchestrator.
   * This allows the new orchestrator to immediately take over leadership
   * instead of waiting for the TTL to expire.
   * 
   * Should be called by the current leader before respawning.
   */
  public releaseLeaderLease(): boolean {
    if (!this.isLeader) {
      this.log("WARN", "releaseLeaderLease called but this agent is not the leader");
      return false;
    }

    try {
      const locked = this.requestFileLock(ORCHESTRATOR_STATE_PATH);
      if (!locked) {
        this.log("ERROR", "Failed to acquire lock for orchestrator-state.json during lease release");
        return false;
      }

      try {
        const current = this.readLeaderLeaseUnsafe();
        
        // Only release if we are still the recorded leader
        if (current && current.leader_id === this.agentId) {
          // Set heartbeat to epoch 0 (far past) so the lease appears expired immediately
          const releasedLease: OrchestratorLease = {
            leader_id: current.leader_id,
            leader_epoch: current.leader_epoch,
            last_heartbeat: new Date(0).toISOString(), // 1970-01-01 - instant expiry
            ttl_ms: current.ttl_ms,
          };
          this.writeLeaderLeaseUnsafe(releasedLease);
          this.isLeader = false;
          this.leaderEpoch = null;
          this.log("INFO", `Released orchestrator leader lease (epoch ${current.leader_epoch}) - new agent can take over immediately`);
          return true;
        } else {
          this.log("WARN", `Cannot release lease: current leader is ${current?.leader_id}, not us (${this.agentId})`);
          return false;
        }
      } finally {
        this.releaseFileLock(ORCHESTRATOR_STATE_PATH);
      }
    } catch (error) {
      this.log("ERROR", `Failed to release leader lease: ${error}`);
      return false;
    }
  }

  /**
   * Broadcast current status to all agents
   */
  broadcastStatus(status: string, details?: Record<string, unknown>): void {
    this.sendMessage({
      type: "broadcast",
      payload: {
        status,
        details,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Request help from other agents
   */
  requestHelp(task: string, details?: Record<string, unknown>): void {
    this.sendMessage({
      type: "request_help",
      payload: {
        task,
        details,
        requester: this.agentId,
      },
    });
  }

  /**
   * Claim a task from the task manager
   */
  claimTask(taskId: string): void {
    this.sendMessage({
      type: "task_claim",
      payload: {
        task_id: taskId,
        claimed_by: this.agentId,
        claimed_at: new Date().toISOString(),
      },
    });
    
    this.updateStatus("working", `Working on task: ${taskId}`);
  }

  /**
   * Report task completion
   */
  completeTask(taskId: string, result?: Record<string, unknown>): void {
    this.sendMessage({
      type: "task_complete",
      payload: {
        task_id: taskId,
        completed_by: this.agentId,
        completed_at: new Date().toISOString(),
        result,
      },
    });
    
    this.updateStatus("active");
  }

  /**
   * Get agents by role
   */
  getAgentsByRole(role: string): Agent[] {
    return this.getActiveAgents().filter(a => a.assigned_role === role);
  }

  /**
   * Get idle agents available for work
   */
  getIdleAgents(): Agent[] {
    return this.getActiveAgents().filter(a => 
      a.status === "active" || a.status === "idle"
    );
  }

  /**
   * Check if a task is already claimed
   */
  isTaskClaimed(taskId: string): boolean {
    const messages = this.readMessages();
    return messages.some(m => 
      m.type === "task_claim" && 
      (m.payload as TaskClaimPayload).task_id === taskId
    );
  }

  // Helper methods
  private readRegistry(): AgentRegistry {
    if (!existsSync(REGISTRY_PATH)) {
      return {
        version: "1.0.0",
        agents: [],
        last_updated: null,
        lock_version: 0,
      };
    }

    return JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  }

  private writeRegistryAtomic(registry: AgentRegistry, expectedVersion: number): boolean {
    // Read current version
    const current = this.readRegistry();
    
    if (current.lock_version !== expectedVersion) {
      return false; // Version mismatch, someone else updated
    }

    writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
    return true;
  }

  private log(level: "INFO" | "WARN" | "ERROR", message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} [${level}] [${this.agentId}] ${message}\n`;
    
    if (existsSync(COORDINATION_LOG)) {
      const content = readFileSync(COORDINATION_LOG, "utf-8");
      writeFileSync(COORDINATION_LOG, content + logEntry);
    } else {
      writeFileSync(COORDINATION_LOG, logEntry);
    }

    console.log(`[MultiAgent] ${logEntry.trim()}`);
  }
}

// CLI Interface
if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];
  const coordinator = new MultiAgentCoordinator();

  switch (command) {
    case "register":
      const role = args[1] || "general";
      await coordinator.register(role);
      coordinator.startHeartbeat();
      console.log(`Agent registered with role: ${role}`);
      console.log("Press Ctrl+C to unregister and exit");
      
      // Keep alive
      process.on("SIGINT", async () => {
        await coordinator.unregister();
        process.exit(0);
      });
      break;

    case "status":
      const agents = coordinator.getActiveAgents();
      console.log(`\nActive Agents: ${agents.length}\n`);
      agents.forEach((agent) => {
        console.log(`Agent: ${agent.agent_id}`);
        console.log(`  Session: ${agent.session_id}`);
        console.log(`  Status: ${agent.status}`);
        console.log(`  Role: ${agent.assigned_role || "general"}`);
        console.log(`  Task: ${agent.current_task || "none"}`);
        console.log(`  Last Heartbeat: ${agent.last_heartbeat}`);
        console.log(`  PID: ${agent.pid}`);
        console.log();
      });
      break;

    case "messages":
      const messages = coordinator.readMessages();
      console.log(`\nUnread Messages: ${messages.length}\n`);
      messages.forEach((msg) => {
        console.log(`From: ${msg.from_agent}`);
        console.log(`Type: ${msg.type}`);
        console.log(`Time: ${msg.timestamp}`);
        console.log(`Payload:`, msg.payload);
        console.log();
      });
      break;

    case "send":
      const type = args[1] as Message["type"];
      const payload = args[2] ? JSON.parse(args[2]) : {};
      coordinator.sendMessage({ type, payload });
      console.log(`Message sent: ${type}`);
      break;

    case "cleanup":
      // Clean up stale locks and agents
      console.log("Cleaning up stale entries...");
      const cleanedCount = coordinator.cleanupStaleAgents();
      const registryCleanup = coordinator.getActiveAgents();
      console.log(`Cleaned up ${cleanedCount} stale agents, ${registryCleanup.length} active agents remaining`);
      break;

    case "health":
      // Show health status of all agents
      const health = coordinator.getAgentHealthStatus();
      console.log("\n=== Agent Health Status ===\n");
      
      console.log(`Healthy (${health.healthy.length}):`);
      health.healthy.forEach(a => {
        const ago = Math.round((Date.now() - new Date(a.last_heartbeat).getTime()) / 1000);
        console.log(`  - ${a.agent_id} (${a.assigned_role || 'general'}) - ${ago}s ago`);
      });
      
      if (health.unhealthy.length > 0) {
        console.log(`\nUnhealthy - no heartbeat >1min (${health.unhealthy.length}):`);
        health.unhealthy.forEach(a => {
          const ago = Math.round((Date.now() - new Date(a.last_heartbeat).getTime()) / 1000);
          console.log(`  - ${a.agent_id} (${a.assigned_role || 'general'}) - ${ago}s ago`);
        });
      }
      
      if (health.stale.length > 0) {
        console.log(`\nStale - will be cleaned up (${health.stale.length}):`);
        health.stale.forEach(a => {
          const ago = Math.round((Date.now() - new Date(a.last_heartbeat).getTime()) / 1000);
          console.log(`  - ${a.agent_id} (${a.assigned_role || 'general'}) - ${ago}s ago`);
        });
      }
      console.log();
      break;

    case "prune-messages":
      // Remove old heartbeat messages to reduce file size
      console.log("Pruning old messages from message bus...");
      if (existsSync(MESSAGE_BUS_PATH)) {
        const content = readFileSync(MESSAGE_BUS_PATH, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        const now = Date.now();
        const maxAge = parseInt(args[1] || "3600000", 10); // Default: 1 hour
        
        let kept = 0;
        let removed = 0;
        const filteredLines: string[] = [];
        
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            const msgTime = new Date(msg.timestamp).getTime();
            const age = now - msgTime;
            
            // Keep non-heartbeat messages or recent heartbeats
            if (msg.type !== "heartbeat" || age < maxAge) {
              filteredLines.push(line);
              kept++;
            } else {
              removed++;
            }
          } catch {
            // Keep malformed lines
            filteredLines.push(line);
            kept++;
          }
        }
        
        writeFileSync(MESSAGE_BUS_PATH, filteredLines.join("\n") + "\n");
        console.log(`Pruned ${removed} old heartbeat messages, kept ${kept} messages.`);
      } else {
        console.log("No message bus file found.");
      }
      break;

    default:
      console.log(`
Multi-Agent Coordinator CLI

Usage:
  bun run multi-agent-coordinator.ts <command> [args]

Commands:
  register [role]     - Register this agent with optional role
  status              - Show all active agents
  messages            - Show unread messages
  send <type> <json>  - Send message to other agents
  cleanup             - Clean up stale entries (>2min no heartbeat)
  health              - Show health status of all agents
  prune-messages [ms] - Remove old heartbeat messages (default: 1 hour)

Examples:
  bun run multi-agent-coordinator.ts register memory-worker
  bun run multi-agent-coordinator.ts status
  bun run multi-agent-coordinator.ts send broadcast '{"status":"working"}'
      `);
  }
}

export { MultiAgentCoordinator };
export type { 
  Agent, 
  AgentRegistry, 
  Message, 
  MessagePayload,
  BroadcastPayload,
  HeartbeatPayload,
  TaskClaimPayload,
  TaskCompletePayload,
  RequestHelpPayload,
  TaskAvailablePayload,
  FileLockPayload,
  DirectPayload,
};
