/**
 * OpenCode Memory System Plugin
 *
 * Auto-injects memory context into every session
 * Tracks session lifecycle and maintains persistent memory
 * Runs boot sequence on session start
 * Provides real-time logging to persistent log file
 * Enables multi-agent coordination
 */

import type { Plugin } from "@opencode-ai/plugin";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
} from "fs";
import { join } from "path";
import { MultiAgentCoordinator } from "../../tools/multi-agent-coordinator";

export const MemoryPlugin: Plugin = async (ctx) => {
  const memoryDir = join(ctx.directory, "memory");
  const statePath = join(memoryDir, "state.json");
  const sessionsPath = join(memoryDir, "sessions.jsonl");
  const metricsPath = join(memoryDir, "metrics.json");
  const logPath = join(memoryDir, "realtime.log");

  // Only activate if memory system is present
  if (!existsSync(memoryDir)) {
    console.log("[Memory] Memory system not found, plugin inactive");
    return {};
  }

  let currentSessionStart: Date | null = null;
  let currentSessionId: string | null = null;
  let tokenCount = 0;
  let toolCallCount = 0;
  let sessionBootRan = false;
  let coordinator: MultiAgentCoordinator | null = null;

  // Real-time logger helper
  const log = (
    level: "INFO" | "WARN" | "ERROR",
    message: string,
    data?: any
  ) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      session: currentSessionId,
      level,
      message,
      ...(data && { data }),
    };

    // Write to file
    appendFileSync(logPath, JSON.stringify(logEntry) + "\n");

    // Also console log
    const emoji = level === "ERROR" ? "❌" : level === "WARN" ? "⚠️" : "ℹ️";
    console.log(
      `${emoji} [Memory] ${message}`,
      data ? JSON.stringify(data) : ""
    );
  };

  // Load memory context once at plugin initialization
  const loadMemoryContext = () => {
    try {
      if (!existsSync(statePath)) return null;
      const state = JSON.parse(readFileSync(statePath, "utf-8"));

      // Get active agents count
      let agentInfo = "";
      if (coordinator) {
        try {
          const agents = coordinator.getActiveAgents();
          agentInfo = `\n**🤖 Multi-Agent Mode**: ${agents.length} agent(s) active`;
        } catch (error) {
          // Silently ignore
        }
      }

      return `## Memory System Context

**Session**: ${state.session_count || 0}
**Status**: ${state.status || "unknown"}
**Active Tasks**: ${state.active_tasks?.join(", ") || "none"}
**Total Tokens**: ${state.total_tokens_used?.toLocaleString() || 0}${agentInfo}

**Recent Achievements**:
${
  state.recent_achievements
    ?.slice(0, 3)
    .map((a: string) => `- ${a}`)
    .join("\n") || "- None"
}

💡 **Memory Tools**: memory_status, memory_search, memory_update
💡 **Agent Tools**: agent_status, agent_send, agent_messages, agent_update_status
⚠️  **Multi-Agent Mode Active**: Check agent_status() to see other agents working in parallel`;
    } catch (error) {
      console.error("[Memory] Failed to load context:", error);
      return null;
    }
  };

  return {
    // CUSTOM MEMORY TOOLS - Native memory query capabilities
    tool: {
      agent_register: {
        description:
          "Register this agent in the multi-agent coordination system. Required for agent-to-agent communication.",
        parameters: {
          type: "object",
          properties: {
            role: {
              type: "string",
              description:
                "Role of this agent (e.g., 'memory-worker', 'system-optimizer', 'general')",
            },
          },
        },
        execute: async ({ role = "general" }) => {
          try {
            if (!coordinator) {
              coordinator = new MultiAgentCoordinator(
                currentSessionId || undefined
              );
              await coordinator.register(role);
              coordinator.startHeartbeat();
              log("INFO", `Agent registered with role: ${role}`);

              return {
                success: true,
                message: `Agent registered as ${role}`,
                agent_id: (coordinator as any).agentId,
              };
            }

            return {
              success: false,
              message: "Agent already registered",
            };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      },

      agent_status: {
        description:
          "Get status of all active agents in the coordination system.",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: async () => {
          try {
            if (!coordinator) {
              return {
                success: false,
                message: "Agent not registered. Use agent_register first.",
              };
            }

            const agents = coordinator.getActiveAgents();
            return {
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
            };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      },

      agent_send: {
        description:
          "Send message to other agents. Can be broadcast or direct message.",
        parameters: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "broadcast",
                "direct",
                "task_claim",
                "task_complete",
                "request_help",
              ],
              description: "Type of message",
            },
            payload: {
              type: "object",
              description: "Message payload (arbitrary JSON)",
            },
            to_agent: {
              type: "string",
              description: "Target agent ID (optional, for direct messages)",
            },
          },
          required: ["type", "payload"],
        },
        execute: async ({ type, payload, to_agent }) => {
          try {
            if (!coordinator) {
              return {
                success: false,
                message: "Agent not registered. Use agent_register first.",
              };
            }

            coordinator.sendMessage({
              type: type as any,
              payload,
              toAgent: to_agent,
            });
            log("INFO", `Message sent: ${type}`, { to: to_agent || "all" });

            return {
              success: true,
              message: `Message sent: ${type}`,
            };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      },

      agent_messages: {
        description:
          "Read messages sent by other agents. Returns unread messages addressed to this agent or broadcasts.",
        parameters: {
          type: "object",
          properties: {
            mark_read: {
              type: "boolean",
              description:
                "Mark messages as read after retrieving (default: true)",
            },
          },
        },
        execute: async ({ mark_read = true }) => {
          try {
            if (!coordinator) {
              return {
                success: false,
                message: "Agent not registered. Use agent_register first.",
              };
            }

            const messages = coordinator.readMessages();

            if (mark_read && messages.length > 0) {
              coordinator.markAsRead(messages.map((m) => m.message_id));
            }

            return {
              success: true,
              message_count: messages.length,
              messages: messages.map((m) => ({
                id: m.message_id,
                from: m.from_agent,
                type: m.type,
                timestamp: m.timestamp,
                payload: m.payload,
              })),
            };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      },

      agent_update_status: {
        description:
          "Update this agent's status and current task in the registry.",
        parameters: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["active", "idle", "working", "blocked"],
              description: "Current agent status",
            },
            task: {
              type: "string",
              description: "Current task description (optional)",
            },
          },
          required: ["status"],
        },
        execute: async ({ status, task }) => {
          try {
            if (!coordinator) {
              return {
                success: false,
                message: "Agent not registered. Use agent_register first.",
              };
            }

            coordinator.updateStatus(status as any, task);
            return {
              success: true,
              message: `Status updated: ${status}`,
            };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      },

      memory_status: {
        description:
          "Get current memory system status, active tasks, and recent achievements. Use this instead of manually reading state.json.",
        parameters: {
          type: "object",
          properties: {
            include_metrics: {
              type: "boolean",
              description:
                "Include detailed metrics (token usage, session count, etc.)",
            },
          },
        },
        execute: async ({ include_metrics = true }) => {
          try {
            const state = existsSync(statePath)
              ? JSON.parse(readFileSync(statePath, "utf-8"))
              : { session_count: 0, status: "unknown", active_tasks: [] };

            const metrics =
              include_metrics && existsSync(metricsPath)
                ? JSON.parse(readFileSync(metricsPath, "utf-8"))
                : null;

            return {
              success: true,
              data: {
                session: state.session_count,
                status: state.status,
                active_tasks: state.active_tasks || [],
                recent_achievements:
                  state.recent_achievements?.slice(0, 5) || [],
                current_objective: state.current_objective,
                ...(metrics
                  ? {
                      total_sessions: metrics.total_sessions,
                      total_tool_calls: metrics.total_tool_calls,
                      total_tokens: state.total_tokens_used,
                    }
                  : {}),
              },
            };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      },

      memory_search: {
        description:
          "Search memory for specific information (working memory, knowledge base, session history). Use this instead of manually reading multiple files.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query (keywords or phrase)",
            },
            scope: {
              type: "string",
              enum: ["working", "knowledge", "sessions", "all"],
              description:
                "Scope of search: working (recent context), knowledge (extracted insights), sessions (history), or all",
            },
          },
          required: ["query"],
        },
        execute: async ({ query, scope = "all" }) => {
          try {
            const results: any = { query, matches: [] };
            const searchLower = query.toLowerCase();

            // Search working memory
            if (scope === "working" || scope === "all") {
              const workingPath = join(memoryDir, "working.md");
              if (existsSync(workingPath)) {
                const content = readFileSync(workingPath, "utf-8");
                const lines = content.split("\n");
                const matches = lines
                  .map((line, idx) => ({ line: idx + 1, content: line }))
                  .filter((l) => l.content.toLowerCase().includes(searchLower))
                  .slice(0, 10);

                if (matches.length > 0) {
                  results.matches.push({
                    source: "working.md",
                    matches: matches.map(
                      (m) => `Line ${m.line}: ${m.content.trim()}`
                    ),
                  });
                }
              }
            }

            // Search knowledge base
            if (scope === "knowledge" || scope === "all") {
              const kbPath = join(memoryDir, "knowledge-base.json");
              if (existsSync(kbPath)) {
                const kb = JSON.parse(readFileSync(kbPath, "utf-8"));
                const relevant = kb
                  .filter((entry: any) => {
                    const text = JSON.stringify(entry).toLowerCase();
                    return text.includes(searchLower);
                  })
                  .slice(0, 5);

                if (relevant.length > 0) {
                  results.matches.push({
                    source: "knowledge-base.json",
                    entries: relevant.map((e: any) => ({
                      session: e.session_id?.slice(-10),
                      insights: e.key_insights,
                      decisions: e.decisions,
                      problems_solved: e.problems_solved,
                    })),
                  });
                }
              }
            }

            return {
              success: true,
              data: results,
            };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      },

      memory_update: {
        description:
          "Update memory system state (add task, update status, record achievement). Use this instead of manually editing state.json.",
        parameters: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: [
                "add_task",
                "complete_task",
                "update_status",
                "add_achievement",
              ],
              description: "Type of update to perform",
            },
            data: {
              type: "string",
              description:
                "Data for the update (task description, new status, achievement text)",
            },
          },
          required: ["action", "data"],
        },
        execute: async ({ action, data }) => {
          try {
            const state = existsSync(statePath)
              ? JSON.parse(readFileSync(statePath, "utf-8"))
              : { session_count: 0, active_tasks: [], recent_achievements: [] };

            switch (action) {
              case "add_task":
                if (!state.active_tasks) state.active_tasks = [];
                if (!state.active_tasks.includes(data)) {
                  state.active_tasks.push(data);
                }
                break;

              case "complete_task":
                if (state.active_tasks) {
                  state.active_tasks = state.active_tasks.filter(
                    (t: string) => t !== data
                  );
                }
                break;

              case "update_status":
                state.status = data;
                break;

              case "add_achievement":
                if (!state.recent_achievements) state.recent_achievements = [];
                const achievement = `Session ${state.session_count}: ${data}`;
                state.recent_achievements.unshift(achievement);
                state.recent_achievements = state.recent_achievements.slice(
                  0,
                  5
                );
                break;
            }

            state.last_updated = new Date().toISOString();
            writeFileSync(statePath, JSON.stringify(state, null, 2));

            return {
              success: true,
              message: `Updated: ${action}`,
              new_state: {
                status: state.status,
                active_tasks: state.active_tasks,
                recent_achievements: state.recent_achievements?.slice(0, 3),
              },
            };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        },
      },
    },

    // AUTO-INJECT memory context into system prompt for EVERY message
    "experimental.chat.system.transform": async (input, output) => {
      try {
        const memoryContext = loadMemoryContext();
        if (memoryContext) {
          output.system.push(memoryContext);
          console.log("[Memory] Context injected into system prompt");
        }
      } catch (error) {
        console.error("[Memory] Context injection error:", error);
      }
    },

    // CHAT MESSAGE HOOK - Detect memory-related queries and intents
    "chat.message": async ({ role, content }) => {
      try {
        if (role !== "user") return;

        const contentLower = content.toLowerCase();

        // Detect status/progress queries
        if (
          contentLower.match(
            /status|progress|where.*we|what.*doing|current.*state/
          )
        ) {
          console.log(
            "[Memory] 💡 Detected status query - suggest memory_status tool"
          );
        }

        // Detect memory/history queries
        if (
          contentLower.match(/remember|past|previous|before|history|last.*time/)
        ) {
          console.log(
            "[Memory] 💡 Detected history query - suggest memory_search tool"
          );
        }

        // Detect task management
        if (contentLower.match(/add.*task|complete.*task|finish|done with/)) {
          console.log(
            "[Memory] 💡 Detected task update - suggest memory_update tool"
          );
        }

        // Detect handoff/continuation intent
        if (contentLower.match(/continue|keep going|next|move on|done here/)) {
          console.log(
            "[Memory] 💡 Detected continuation intent - prepare for handoff"
          );
        }
      } catch (error) {
        console.error("[Memory] Chat message hook error:", error);
      }
    },

    event: async ({ event }) => {
      try {
        // Track session lifecycle
        if (event.type === "session.created" && !sessionBootRan) {
          currentSessionStart = new Date();
          currentSessionId = event.properties.info.id;
          sessionBootRan = true;

          log("INFO", `Session started: ${currentSessionId}`);
          log("INFO", "Running boot sequence...");

          // Update state.json - increment session count, update timestamp
          let sessionCount = 0;
          try {
            const state = existsSync(statePath)
              ? JSON.parse(readFileSync(statePath, "utf-8"))
              : { session_count: 0, total_tokens_used: 0 };

            state.session_count = (state.session_count || 0) + 1;
            state.last_session = currentSessionStart.toISOString();
            state.current_session_id = currentSessionId;
            sessionCount = state.session_count;

            writeFileSync(statePath, JSON.stringify(state, null, 2));
            log("INFO", `Session ${state.session_count} initialized`, {
              session_count: state.session_count,
            });
          } catch (error) {
            log("ERROR", "Failed to update state", { error: String(error) });
          }

          // Extract knowledge from OpenCode session history (async, don't block)
          log("INFO", "Starting knowledge extraction (background)");
          ctx.$`bun x ${join(
            ctx.directory,
            "tools/knowledge-extractor.ts"
          )} extract`
            .quiet()
            .then(() => log("INFO", "Knowledge extraction completed"))
            .catch((e) =>
              log("WARN", "Knowledge extraction failed", { error: String(e) })
            );

          // Sync cross-conversation state (async, don't block)
          log("INFO", "Starting sync engine (background)");
          ctx.$`npx tsx ${join(ctx.directory, "tools/sync-engine.ts")} pull`
            .quiet()
            .then(() => log("INFO", "Sync engine completed"))
            .catch((e) =>
              log("WARN", "Sync engine failed", { error: String(e) })
            );

          log("INFO", "Boot sequence complete");

          // Auto-register agent in multi-agent coordinator
          try {
            coordinator = new MultiAgentCoordinator(currentSessionId);
            await coordinator.register("general");
            coordinator.startHeartbeat();
            log("INFO", "Multi-agent coordinator initialized");

            // Broadcast that a new agent is online
            coordinator.broadcastStatus("Agent online and ready", {
              session_id: currentSessionId,
              session_count: sessionCount,
            });
          } catch (error) {
            log("WARN", "Multi-agent coordinator init failed", {
              error: String(error),
            });
          }

          // Log session to sessions.jsonl
          const sessionLog = JSON.stringify({
            type: "session_start",
            timestamp: currentSessionStart.toISOString(),
            session_id: event.properties.info.id,
          });
          await ctx.$`echo ${sessionLog} >> ${sessionsPath}`.quiet();
        }

        if (event.type === "session.idle") {
          log("INFO", `Session idle: ${event.properties.sessionID}`);

          // Unregister from multi-agent coordinator
          if (coordinator) {
            try {
              await coordinator.unregister();
              log("INFO", "Agent unregistered from coordinator");
            } catch (error) {
              log("WARN", "Failed to unregister agent", {
                error: String(error),
              });
            }
          }

          // Update state.json with current metrics
          if (currentSessionStart) {
            const sessionDuration = Date.now() - currentSessionStart.getTime();
            log(
              "INFO",
              `Session ended after ${Math.round(sessionDuration / 1000)}s`,
              {
                duration_ms: sessionDuration,
                tool_calls: toolCallCount,
              }
            );

            const sessionEnd = JSON.stringify({
              type: "session_end",
              timestamp: new Date().toISOString(),
              session_id: event.properties.sessionID,
              duration_ms: sessionDuration,
              tool_calls: toolCallCount,
            });
            await ctx.$`echo ${sessionEnd} >> ${sessionsPath}`.quiet();

            // Update metrics
            const metricsData = existsSync(metricsPath)
              ? JSON.parse(await ctx.$`cat ${metricsPath}`.text())
              : { total_sessions: 0, total_tool_calls: 0, total_tokens: 0 };

            metricsData.total_sessions = (metricsData.total_sessions || 0) + 1;
            metricsData.total_tool_calls =
              (metricsData.total_tool_calls || 0) + toolCallCount;
            metricsData.last_session = new Date().toISOString();

            await ctx.$`echo ${JSON.stringify(
              metricsData,
              null,
              2
            )} > ${metricsPath}`.quiet();

            // AUTO-UPDATE working.md with session summary for next agent
            log("INFO", "Updating working.md for next session...");
            const workingPath = join(memoryDir, "working.md");

            try {
              const state = existsSync(statePath)
                ? JSON.parse(readFileSync(statePath, "utf-8"))
                : {};

              // Read current working.md
              let workingContent = existsSync(workingPath)
                ? readFileSync(workingPath, "utf-8")
                : "";

              // Remove previous AUTO-STOP entry for same session (prevent duplicates)
              const sessionMarker = `## Session ${
                state.session_count || "N/A"
              } - AUTO-STOP`;
              const lines = workingContent.split("\n");
              let inAutoStopSection = false;
              const filteredLines = [];

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Detect start of AUTO-STOP section for current session
                if (line.startsWith(sessionMarker)) {
                  inAutoStopSection = true;
                  continue; // Skip this line
                }

                // Detect end of AUTO-STOP section (next ## or ---)
                if (
                  inAutoStopSection &&
                  (line.startsWith("## ") || line.trim() === "---")
                ) {
                  inAutoStopSection = false;
                  if (line.trim() === "---") continue; // Skip separator
                }

                // Keep lines that are not in AUTO-STOP section
                if (!inAutoStopSection) {
                  filteredLines.push(line);
                }
              }

              // Create new session summary with rich handoff information
              const sessionSummary = `
## Session ${state.session_count || "N/A"} - AUTO-STOP (${
                new Date().toISOString().split("T")[0]
              })

**Status**: Session ended
**Duration**: ${Math.round(sessionDuration / 1000 / 60)} minutes
**Tool Calls**: ${toolCallCount}
**Session ID**: ${event.properties.sessionID}

**What Happened**: Session idle detected - agent stopped working

**🔴 CRITICAL: YOU ARE A NEW AGENT - READ THIS FIRST**

You are a fresh instance of the AI. The previous agent is gone. You have:
- ✅ Auto-injected memory context (150 tokens in system prompt)
- ✅ Real-time logging enabled (check memory/realtime.log)
- ✅ Session lifecycle tracking via OpenCode hooks
- ✅ Custom memory tools: memory_status(), memory_search(), memory_update()

**Next Agent MUST**:
1. **DO NOT** manually read state.json - use memory_status() tool instead
2. Read working.md (this file) to understand what previous agent did
3. Check active_tasks in state.json via memory_status()
4. Continue with priority tasks OR ask user for direction
5. Update this section when work is complete
6. Check realtime.log for detailed activity history

**Available Infrastructure**:
- Plugin: .opencode/plugin/index.ts (auto-boot, context injection, logging)
- Log file: memory/realtime.log (real-time structured logging)
- State: memory/state.json (session counter, tasks, achievements)
- Knowledge: memory/knowledge-base.json (extracted insights)

---

`;

              // Append to filtered content
              const newContent = filteredLines.join("\n") + sessionSummary;
              writeFileSync(workingPath, newContent);
              log(
                "INFO",
                "Session summary updated in working.md (no duplicates)"
              );
            } catch (error) {
              log("ERROR", "Failed to update working.md", {
                error: String(error),
              });
            }
          }
        }

        if (event.type === "session.error") {
          log("ERROR", "Session error", { error: event.properties.error });

          const errorLog = JSON.stringify({
            type: "session_error",
            timestamp: new Date().toISOString(),
            error: event.properties.error,
          });
          await ctx.$`echo ${errorLog} >> ${sessionsPath}`.quiet();
        }

        // Track file edits for knowledge extraction (only memory files to reduce noise)
        if (
          event.type === "file.edited" &&
          event.properties.file?.includes("/memory/")
        ) {
          log("INFO", `File edited: ${event.properties.file}`);

          const fileLog = JSON.stringify({
            type: "file_edit",
            timestamp: new Date().toISOString(),
            file: event.properties.file,
          });
          await ctx.$`echo ${fileLog} >> ${sessionsPath}`.quiet();
        }

        // Track context compaction
        if (event.type === "session.compacted") {
          log("INFO", `Session compacted: ${event.properties.sessionID}`);

          const compactionLog = JSON.stringify({
            type: "compaction",
            timestamp: new Date().toISOString(),
            session_id: event.properties.sessionID,
          });
          await ctx.$`echo ${compactionLog} >> ${sessionsPath}`.quiet();
        }

        // Track all major events in log
        if (
          ["session.status", "session.deleted", "session.updated"].includes(
            event.type
          )
        ) {
          log("INFO", `Event: ${event.type}`, { properties: event.properties });
        }
      } catch (error) {
        // Fail silently to not disrupt session
        log("ERROR", "Plugin error", { error: String(error) });
      }
    },

    "tool.execute.after": async (input, output) => {
      try {
        // Count tool calls for metrics
        toolCallCount++;

        // Log all tool calls to realtime.log
        log("INFO", `Tool executed: ${input.tool}`, {
          tool: input.tool,
          call_id: input.callID,
          output_length: output.output?.length || 0,
        });

        // Track memory-related tool usage with extra detail
        if (
          input.tool === "read" &&
          input.args?.filePath?.includes("memory/")
        ) {
          log("INFO", `Memory file read: ${input.args.filePath}`);
        }

        if (
          input.tool === "write" &&
          input.args?.filePath?.includes("memory/")
        ) {
          log("INFO", `Memory file updated: ${input.args.filePath}`);
        }

        if (
          input.tool === "edit" &&
          input.args?.filePath?.includes("memory/")
        ) {
          log("INFO", `Memory file edited: ${input.args.filePath}`);
        }
      } catch (error) {
        log("ERROR", "Tool tracking error", { error: String(error) });
      }
    },

    // Update state on session updates
    config: async (config) => {
      log("INFO", "Plugin loaded - monitoring session events", {
        agent: config.agent,
        log_file: logPath,
      });
      log("INFO", "=== NEW PLUGIN INSTANCE ===");
    },
  };
};

export default MemoryPlugin;
