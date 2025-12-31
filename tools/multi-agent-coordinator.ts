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
import { join } from "path";

const MEMORY_DIR = join(process.cwd(), "memory");
const REGISTRY_PATH = join(MEMORY_DIR, "agent-registry.json");
const MESSAGE_BUS_PATH = join(MEMORY_DIR, "message-bus.jsonl");
const COORDINATION_LOG = join(MEMORY_DIR, "coordination.log");

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

interface Message {
  message_id: string;
  from_agent: string;
  to_agent?: string; // If null, broadcast to all
  timestamp: string;
  type: "broadcast" | "direct" | "task_claim" | "task_complete" | "heartbeat" | "request_help" | "file_lock";
  payload: any;
  read_by?: string[];
}

class MultiAgentCoordinator {
  private agentId: string;
  private sessionId: string;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(sessionId?: string) {
    this.agentId = `agent-${Date.now()}-${Math.random().toString(36).substring(7)}`;
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

        // Remove stale agents (no heartbeat in 5 minutes)
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        registry.agents = registry.agents.filter((agent) => {
          const lastHB = new Date(agent.last_heartbeat).getTime();
          return lastHB > fiveMinutesAgo;
        });

        // Add this agent
        const newAgent: Agent = {
          agent_id: this.agentId,
          session_id: this.sessionId,
          started_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString(),
          status: "active",
          assigned_role: role,
          pid: process.pid,
        };

        registry.agents.push(newAgent);
        registry.last_updated = new Date().toISOString();
        registry.lock_version = expectedVersion + 1;

        // Atomic write with version check
        const success = this.writeRegistryAtomic(registry, expectedVersion);
        
        if (success) {
          this.log("INFO", `Agent registered: ${this.agentId} (role: ${role || "general"})`);
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
   */
  startHeartbeat(intervalMs: number = 30000): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, intervalMs);

    // Send initial heartbeat
    this.sendHeartbeat();
  }

  /**
   * Send heartbeat to update agent status
   */
  private sendHeartbeat(): void {
    const registry = this.readRegistry();
    const agent = registry.agents.find((a) => a.agent_id === this.agentId);
    
    if (agent) {
      agent.last_heartbeat = new Date().toISOString();
      registry.last_updated = new Date().toISOString();
      writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
    }

    // Also send heartbeat message
    this.sendMessage({
      type: "heartbeat",
      payload: { status: agent?.status || "active" },
    });
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
   * Get all active agents
   */
  getActiveAgents(): Agent[] {
    const registry = this.readRegistry();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    
    return registry.agents.filter((agent) => {
      const lastHB = new Date(agent.last_heartbeat).getTime();
      return lastHB > fiveMinutesAgo;
    });
  }

  /**
   * Send message to other agents
   */
  sendMessage(options: {
    type: Message["type"];
    payload: any;
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
   * Broadcast current status to all agents
   */
  broadcastStatus(status: string, details?: any): void {
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
  requestHelp(task: string, details?: any): void {
    this.sendMessage({
      type: "request_help",
      payload: {
        task,
        details,
        requester: this.agentId,
      },
    });
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
      const registry = coordinator.getActiveAgents();
      console.log(`${registry.length} active agents remaining`);
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
  cleanup             - Clean up stale entries

Examples:
  bun run multi-agent-coordinator.ts register memory-worker
  bun run multi-agent-coordinator.ts status
  bun run multi-agent-coordinator.ts send broadcast '{"status":"working"}'
      `);
  }
}

export { MultiAgentCoordinator };
export type { Agent, AgentRegistry, Message };
