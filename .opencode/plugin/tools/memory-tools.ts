/**
 * Memory System Tools
 * 
 * Provides tools for memory management:
 * - memory_status: Get current system state
 * - memory_search: Search memory stores
 * - memory_update: Update memory state
 */

import { tool } from "@opencode-ai/plugin";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { readJson, writeJson } from "../../../tools/shared/json-utils";
import { withFileLock } from "./file-lock";

export interface MemoryToolsContext {
  memoryDir: string;
  statePath: string;
  metricsPath: string;
}

export function createMemoryTools(getContext: () => MemoryToolsContext) {
  return {
    memory_status: tool({
      description:
        `Get current memory system status, active tasks, and recent achievements. Use this instead of manually reading state.json.

Example usage:
- memory_status() - Full status with metrics
- memory_status(include_metrics=false) - Quick status check

Returns:
- session: Current session number
- status: System status message
- active_tasks: List of in-progress work
- recent_achievements: Last 5 accomplishments
- total_tokens (if metrics enabled): Token usage across sessions

Use this at session start to understand context.`,
      args: {
        include_metrics: tool.schema
          .boolean()
          .describe(
            "Include detailed metrics (token usage, session count, etc.)"
          )
          .optional(),
      },
      async execute({ include_metrics = true }) {
        try {
          const ctx = getContext();
          const state = existsSync(ctx.statePath)
              ? readJson(ctx.statePath, {})
            : { session_count: 0, status: "unknown", active_tasks: [] };

          const metrics =
            include_metrics && existsSync(ctx.metricsPath)
              ? readJson(ctx.metricsPath, {})
              : null;

          return JSON.stringify({
            success: true,
            data: {
              session: state.session_count,
              status: state.status,
              active_tasks: state.active_tasks || [],
              recent_achievements: state.recent_achievements?.slice(0, 5) || [],
              current_objective: state.current_objective,
              ...(metrics
                ? {
                    total_sessions: metrics.total_sessions,
                    total_tool_calls: metrics.total_tool_calls,
                    total_tokens: state.total_tokens_used,
                  }
                : {}),
            },
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    memory_search: tool({
      description:
        `Search memory for specific information (working memory, knowledge base, session history). Use this instead of manually reading multiple files.

Example usage:
- memory_search(query="authentication") - Search all memory sources
- memory_search(query="bug fix", scope="knowledge") - Search only knowledge base
- memory_search(query="error handling", scope="working") - Search recent context

Scopes:
- working: Recent context in working.md (most relevant for current work)
- knowledge: Extracted insights from past sessions
- sessions: Historical session records
- all: Search everywhere (default)

Returns matched lines/entries with source attribution.`,
      args: {
        query: tool.schema
          .string()
          .describe("Search query (keywords or phrase to find)"),
        scope: tool.schema
          .enum(["working", "knowledge", "sessions", "all"])
          .describe(
            "Scope of search: working (recent context), knowledge (extracted insights), sessions (history), or all"
          )
          .optional(),
      },
      async execute({ query, scope = "all" }) {
        try {
          const ctx = getContext();
          const results: any = { query, matches: [] };
          const searchLower = query.toLowerCase();

          // Search working memory
          if (scope === "working" || scope === "all") {
            const workingPath = join(ctx.memoryDir, "working.md");
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
            const kbPath = join(ctx.memoryDir, "knowledge-base.json");
            if (existsSync(kbPath)) {
              const kb = readJson(kbPath, { learnings: [] });
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

          return JSON.stringify({
            success: true,
            data: results,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    memory_update: tool({
      description:
        `Update memory system state (add task, update status, record achievement). Use this instead of manually editing state.json.

Example usage:
- memory_update(action="add_task", data="Implement user auth")
- memory_update(action="complete_task", data="Implement user auth")
- memory_update(action="update_status", data="Working on auth system refactor")
- memory_update(action="add_achievement", data="Reduced API latency by 50%")

Notes:
- Achievements auto-prefixed with session number
- Only last 5 achievements kept (FIFO)
- Status visible to other agents via memory_status()`,
      args: {
        action: tool.schema
          .enum([
            "add_task",
            "complete_task",
            "update_status",
            "add_achievement",
          ])
          .describe("Type of update to perform"),
        data: tool.schema
          .string()
          .describe(
            "Data for the update (task description, new status, achievement text)"
          ),
      },
      async execute({ action, data }) {
        try {
          const ctx = getContext();
          let updatedState: any = null;

          await withFileLock(ctx.statePath, "memory-tools", async () => {
            const state = existsSync(ctx.statePath)
            ? readJson(ctx.statePath, {})
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
                state.recent_achievements = state.recent_achievements.slice(0, 5);
                break;
            }

            state.last_updated = new Date().toISOString();
            writeJson(ctx.statePath, state);
            updatedState = state;
          });

          const state = updatedState || {
            session_count: 0,
            status: "unknown",
            active_tasks: [],
            recent_achievements: [],
          };

          return JSON.stringify({
            success: true,
            message: `Updated: ${action}`,
            new_state: {
              status: state.status,
              active_tasks: state.active_tasks,
              recent_achievements: state.recent_achievements?.slice(0, 3),
            },
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),
  };
}
