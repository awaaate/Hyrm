/**
 * Agent Coordination Tools
 * 
 * Provides tools for multi-agent coordination:
 * - agent_register: Register in coordination system
 * - agent_status: Get all active agents
 * - agent_send: Send messages to other agents
 * - agent_messages: Read messages from other agents
 * - agent_update_status: Update agent status/task
 * - agent_set_handoff: Control persistence behavior
 */

import { tool } from "@opencode-ai/plugin";
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { MultiAgentCoordinator } from "../../../tools/multi-agent-coordinator";

export interface AgentToolsContext {
  coordinator: MultiAgentCoordinator | null;
  currentSessionId: string | null;
  memoryDir: string;
  log: (level: "INFO" | "WARN" | "ERROR", message: string, data?: any) => void;
  setCoordinator?: (coord: MultiAgentCoordinator) => void;
}

// Session-specific handoff state management
function getHandoffStatePath(sessionId: string | null, memoryDir: string, sessionStatesDir: string): string {
  if (!sessionId) return join(memoryDir, ".handoff-state.json");
  const sessionDir = join(sessionStatesDir, sessionId);
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }
  return join(sessionDir, "handoff-state.json");
}

export function createAgentTools(getContext: () => AgentToolsContext, sessionStatesDir: string) {
  return {
    agent_register: tool({
      description:
        "Register this agent in the multi-agent coordination system. Required for agent-to-agent communication.",
      args: {
        role: tool.schema
          .string()
          .describe(
            "Role of this agent (e.g., 'memory-worker', 'system-optimizer', 'general')"
          )
          .optional(),
      },
      async execute({ role = "general" }) {
        try {
          const ctx = getContext();
          if (!ctx.coordinator) {
            const newCoordinator = new MultiAgentCoordinator(
              ctx.currentSessionId || undefined
            );
            await newCoordinator.register(role);
            newCoordinator.startHeartbeat();
            
            // Update the context with the new coordinator
            if (ctx.setCoordinator) {
              ctx.setCoordinator(newCoordinator);
            }
            
            ctx.log("INFO", `Agent registered with role: ${role}`);

            return JSON.stringify({
              success: true,
              message: `Agent registered as ${role}`,
              agent_id: (newCoordinator as any).agentId,
            });
          }

          // Already registered - re-register with new role if different
          const agents = ctx.coordinator.getActiveAgents();
          const currentAgent = agents.find((a: any) => a.agent_id === (ctx.coordinator as any).agentId);
          if (currentAgent && currentAgent.assigned_role !== role) {
            await ctx.coordinator.register(role);
            ctx.log("INFO", `Agent re-registered with role: ${role}`);
            return JSON.stringify({
              success: true,
              message: `Agent re-registered as ${role}`,
              agent_id: (ctx.coordinator as any).agentId,
            });
          }

          return JSON.stringify({
            success: true,
            message: "Agent already registered",
            agent_id: (ctx.coordinator as any).agentId,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    agent_status: tool({
      description:
        "Get status of all active agents in the coordination system.",
      args: {},
      async execute() {
        try {
          const ctx = getContext();
          if (!ctx.coordinator) {
            return JSON.stringify({
              success: false,
              message: "Agent not registered. Use agent_register first.",
            });
          }

          const agents = ctx.coordinator.getActiveAgents();
          const leaderLease = (ctx.coordinator as any).getCurrentLeaderLease
            ? (ctx.coordinator as any).getCurrentLeaderLease()
            : null;

          return JSON.stringify({
            success: true,
            agent_count: agents.length,
            agents: agents.map((a) => ({
              id: a.agent_id,
              session: a.session_id,
              role: a.assigned_role,
              status: a.status,
              task: a.current_task,
              last_heartbeat: a.last_heartbeat,
            })),
            leader: leaderLease
              ? {
                  agent_id: leaderLease.leader_id,
                  epoch: leaderLease.leader_epoch,
                  last_heartbeat: leaderLease.last_heartbeat,
                  ttl_ms: leaderLease.ttl_ms,
                }
              : null,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    agent_send: tool({
      description:
        "Send message to other agents. Can be broadcast or direct message.",
      args: {
        type: tool.schema
          .enum([
            "broadcast",
            "direct",
            "task_claim",
            "task_complete",
            "task_available",
            "request_help",
          ])
          .describe("Type of message"),
        payload: tool.schema
          .record(tool.schema.any(), tool.schema.any())
          .describe("Message payload (arbitrary JSON)"),
        to_agent: tool.schema
          .string()
          .describe("Target agent ID (optional, for direct messages)")
          .optional(),
      },
      async execute({ type, payload, to_agent }) {
        try {
          const ctx = getContext();
          if (!ctx.coordinator) {
            return JSON.stringify({
              success: false,
              message: "Agent not registered. Use agent_register first.",
            });
          }

          ctx.coordinator.sendMessage({
            type: type as any,
            payload,
            toAgent: to_agent,
          });
          ctx.log("INFO", `Message sent: ${type}`, { to: to_agent || "all" });

          return JSON.stringify({
            success: true,
            message: `Message sent: ${type}`,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    agent_messages: tool({
      description:
        "Read messages sent by other agents. Returns unread messages addressed to this agent or broadcasts.",
      args: {
        mark_read: tool.schema
          .boolean()
          .describe("Mark messages as read after retrieving (default: true)")
          .optional(),
      },
      async execute({ mark_read = true }) {
        try {
          const ctx = getContext();
          if (!ctx.coordinator) {
            return JSON.stringify({
              success: false,
              message: "Agent not registered. Use agent_register first.",
            });
          }

          const messages = ctx.coordinator.readMessages();

          if (mark_read && messages.length > 0) {
            ctx.coordinator.markAsRead(messages.map((m) => m.message_id));
          }

          return JSON.stringify({
            success: true,
            message_count: messages.length,
            messages: messages.map((m) => ({
              id: m.message_id,
              from: m.from_agent,
              type: m.type,
              timestamp: m.timestamp,
              payload: m.payload,
            })),
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    agent_update_status: tool({
      description:
        "Update this agent's status and current task in the registry.",
      args: {
        status: tool.schema
          .enum(["active", "idle", "working", "blocked"])
          .describe("Current agent status"),
        task: tool.schema
          .string()
          .describe("Current task description (optional)")
          .optional(),
      },
      async execute({ status, task }) {
        try {
          const ctx = getContext();
          if (!ctx.coordinator) {
            return JSON.stringify({
              success: false,
              message: "Agent not registered. Use agent_register first.",
            });
          }

          ctx.coordinator.updateStatus(status as any, task);
          return JSON.stringify({
            success: true,
            message: `Status updated: ${status}`,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    agent_set_handoff: tool({
      description:
        "Control whether this agent hands off when session goes idle. Main/orchestrator agents should disable handoff to stay running continuously.",
      args: {
        enabled: tool.schema
          .boolean()
          .describe(
            "If true, agent will handoff on idle. If false, agent stays running (for main/orchestrator agents)."
          ),
      },
      async execute({ enabled }) {
        const ctx = getContext();
        
        // Handle string "false" from OpenCode
        const isEnabled = enabled === true || (enabled as any) === "true";

        // Write to persistent file
        try {
          const handoffPath = getHandoffStatePath(ctx.currentSessionId, ctx.memoryDir, sessionStatesDir);
          writeFileSync(
            handoffPath,
            JSON.stringify(
              {
                handoff_enabled: isEnabled,
                updated_at: new Date().toISOString(),
                session_id: ctx.currentSessionId,
              },
              null,
              2
            )
          );
        } catch (e) {
          console.error("[Memory] Failed to write handoff state:", e);
        }

        ctx.log(
          "INFO",
          `Handoff ${isEnabled ? "enabled" : "disabled"} for this agent (persisted to file)`
        );

        // Update coordinator if registered
        if (ctx.coordinator) {
          ctx.coordinator.updateStatus(
            isEnabled ? "active" : "working",
            isEnabled ? undefined : "Orchestrator mode - no handoff"
          );
        }

        return JSON.stringify({
          success: true,
          handoff_enabled: isEnabled,
          message: isEnabled
            ? "Agent will handoff when idle"
            : "Agent will NOT handoff - running as main/orchestrator (PERSISTENT)",
        });
      },
    }),
  };
}
