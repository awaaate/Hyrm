/**
 * Task Management Tools
 * 
 * Provides tools for persistent task management:
 * - task_list: List tasks by status
 * - task_create: Create new persistent tasks
 * - task_update: Update task status/assignment
 * - task_next: Get next high-priority task
 * - task_claim: Claim an available task
 */

import { tool } from "@opencode-ai/plugin";
import { existsSync, appendFileSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { 
  getAllTasks, 
  getTasksByStatus, 
  getTaskById, 
  getSystemState, 
  clearCache 
} from "../../../tools/shared/data-fetchers";
import { readJson, writeJson } from "../../../tools/shared/json-utils";
import { withFileLock } from "./file-lock";
import type { Task, TaskStore } from "../../../tools/shared/types";

// Agent performance metrics types
interface AgentPerformanceMetrics {
  agent_id: string;
  tasks_completed: number;
  tasks_claimed: number;
  total_duration_ms: number;
  avg_duration_ms: number;
  quality_scores: number[];
  avg_quality: number;
  last_activity: string;
  first_seen: string;
}

interface AgentMetricsStore {
  version: string;
  last_updated: string;
  agents: Record<string, AgentPerformanceMetrics>;
}

// Update agent performance metrics when a task is completed
async function updateAgentMetrics(
  memoryDir: string,
  agentId: string,
  taskDurationMs: number,
  qualityScore?: number
): Promise<void> {
  const metricsPath = join(memoryDir, "agent-performance-metrics.json");

  await withFileLock(metricsPath, "task-tools:metrics", async () => {
    let store: AgentMetricsStore;

    try {
      store = readJson<AgentMetricsStore>(metricsPath, { 
        version: "1.0", 
        last_updated: "", 
        agents: {} 
      });
    } catch {
      store = { version: "1.0", last_updated: "", agents: {} };
    }

    // Initialize agent entry if doesn't exist
    if (!store.agents[agentId]) {
      store.agents[agentId] = {
        agent_id: agentId,
        tasks_completed: 0,
        tasks_claimed: 0,
        total_duration_ms: 0,
        avg_duration_ms: 0,
        quality_scores: [],
        avg_quality: 0,
        last_activity: new Date().toISOString(),
        first_seen: new Date().toISOString(),
      };
    }

    const agent = store.agents[agentId];
    agent.tasks_completed++;
    agent.total_duration_ms += taskDurationMs;
    agent.avg_duration_ms = Math.round(
      agent.total_duration_ms / agent.tasks_completed
    );
    agent.last_activity = new Date().toISOString();

    if (qualityScore !== undefined && qualityScore > 0) {
      agent.quality_scores.push(qualityScore);
      agent.avg_quality = Number(
        (agent.quality_scores.reduce((a, b) => a + b, 0) / agent.quality_scores.length).toFixed(2)
      );
    }

    store.last_updated = new Date().toISOString();
    writeJson(metricsPath, store);
  });
}

// Record task claim for metrics
async function recordTaskClaim(memoryDir: string, agentId: string): Promise<void> {
  const metricsPath = join(memoryDir, "agent-performance-metrics.json");

  await withFileLock(metricsPath, "task-tools:metrics", async () => {
    let store: AgentMetricsStore;

    try {
      store = readJson<AgentMetricsStore>(metricsPath, { 
        version: "1.0", 
        last_updated: "", 
        agents: {} 
      });
    } catch {
      store = { version: "1.0", last_updated: "", agents: {} };
    }

    if (!store.agents[agentId]) {
      store.agents[agentId] = {
        agent_id: agentId,
        tasks_completed: 0,
        tasks_claimed: 0,
        total_duration_ms: 0,
        avg_duration_ms: 0,
        quality_scores: [],
        avg_quality: 0,
        last_activity: new Date().toISOString(),
        first_seen: new Date().toISOString(),
      };
    }

    store.agents[agentId].tasks_claimed++;
    store.agents[agentId].last_activity = new Date().toISOString();
    store.last_updated = new Date().toISOString();
    writeJson(metricsPath, store);
  });
}

export interface TaskToolsContext {
  memoryDir: string;
  currentSessionId: string | null;
  agentId?: string;
  log: (level: "INFO" | "WARN" | "ERROR", message: string, data?: any) => void;
}

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

// Priority aging: how much priority increases per hour
const PRIORITY_AGING = {
  low: 0.1,      // Low tasks gain 0.1 priority points per hour
  medium: 0.05,  // Medium tasks gain less
  high: 0.02,    // High tasks gain even less
  critical: 0,   // Critical tasks don't need aging
};

// Calculate effective priority with aging
function calculateEffectivePriority(task: Task): number {
  const basePriority = PRIORITY_ORDER[task.priority] || 2;
  const createdAt = new Date(task.created_at).getTime();
  const now = Date.now();
  const hoursWaiting = (now - createdAt) / (1000 * 60 * 60);
  
  const agingRate = PRIORITY_AGING[task.priority as keyof typeof PRIORITY_AGING] || 0;
  const agingBonus = hoursWaiting * agingRate;
  
  // Cap the aging bonus at 2 levels (e.g., low can become high but not critical)
  const cappedBonus = Math.min(agingBonus, 2);
  
  return Math.max(0, basePriority - cappedBonus);
}

// Calculate heuristic quality score based on task metadata
function calculateHeuristicQualityScore(task: Task, ctx: TaskToolsContext): number {
  let score = 7.0; // Default baseline score
  
  // Factor 1: Task completion time vs estimated time
  if (task.claimed_at && task.completed_at && task.estimated_hours) {
    const actualHours = (new Date(task.completed_at).getTime() - new Date(task.claimed_at).getTime()) / (1000 * 60 * 60);
    const estimatedHours = task.estimated_hours;
    
    if (actualHours <= estimatedHours) {
      score += 0.5; // Completed on time or early
    } else if (actualHours > estimatedHours * 2) {
      score -= 1.0; // Significantly over time
    }
  }
  
  // Factor 2: Priority level (higher priority tasks should have higher standards)
  switch (task.priority) {
    case 'critical':
      score += 0.5; // Critical tasks are expected to be high quality
      break;
    case 'high':
      score += 0.3;
      break;
    case 'low':
      score -= 0.3; // Lower expectations for low priority
      break;
  }
  
  // Factor 3: Complexity handling
  const complexityScores: Record<string, number> = {
    'trivial': -0.2,   // Simple tasks, lower quality bar
    'simple': -0.1,
    'moderate': 0,     // Baseline
    'complex': 0.3,    // Complex tasks should be higher quality
    'epic': 0.5
  };
  score += complexityScores[task.complexity || 'moderate'] || 0;
  
  // Factor 4: Task dependencies (tasks that unblock others are more important)
  if (task.notes?.some((note: string) => note.includes('unblocked') || note.includes('dependency'))) {
    score += 0.3;
  }
  
  // Factor 5: No errors or blockers mentioned in notes
  if (task.notes?.some((note: string) => 
    note.toLowerCase().includes('error') || 
    note.toLowerCase().includes('failed') || 
    note.toLowerCase().includes('blocked'))) {
    score -= 0.5;
  }
  
  // Ensure score is within bounds
  return Math.max(1, Math.min(10, score));
}

// Perform quality assessment using the quality tools
async function performQualityAssessment(taskId: string, heuristicScore: number, ctx: TaskToolsContext): Promise<void> {
  const qualityPath = join(ctx.memoryDir, "quality-assessments.json");
  const tasksPath = join(ctx.memoryDir, "tasks.json");
  
  // Load task data
  const tasksStore = readJson(tasksPath, { tasks: [] });
  const task = tasksStore.tasks.find((t: Task) => t.id === taskId);
  
  if (!task) {
    throw new Error("Task not found for quality assessment");
  }
  
  // Calculate dimension scores based on heuristic
  const baseScore = Math.round(heuristicScore);
  const variance = 0.5; // Small variance between dimensions
  
  const dimensions = [
    { name: "completeness", score: Math.max(1, Math.min(10, baseScore + (Math.random() - 0.5) * variance)), weight: 0.3 },
    { name: "code_quality", score: Math.max(1, Math.min(10, baseScore + (Math.random() - 0.5) * variance)), weight: 0.25 },
    { name: "documentation", score: Math.max(1, Math.min(10, baseScore - 1 + (Math.random() - 0.5) * variance)), weight: 0.15 }, // Slightly lower for documentation
    { name: "efficiency", score: Math.max(1, Math.min(10, baseScore + (Math.random() - 0.5) * variance)), weight: 0.15 },
    { name: "impact", score: Math.max(1, Math.min(10, baseScore + (Math.random() - 0.5) * variance)), weight: 0.15 },
  ];
  
  // Calculate weighted overall score
  const overallScore = dimensions.reduce((sum, d) => sum + d.score * d.weight, 0);
  
  // Calculate duration
  let durationMinutes: number | undefined;
  if (task.created_at && task.completed_at) {
    durationMinutes = Math.round(
      (new Date(task.completed_at).getTime() - new Date(task.created_at).getTime()) / 60000
    );
  }
  
  const assessment = {
    task_id: taskId,
    task_title: task.title,
    assessed_at: new Date().toISOString(),
    assessed_by: "auto-assessment",
    dimensions,
    overall_score: Math.round(overallScore * 10) / 10,
    lessons_learned: "Auto-assessed based on task completion metrics",
    metadata: { 
      duration_minutes: durationMinutes,
      auto_generated: true,
      heuristic_base_score: heuristicScore
    },
  };
  
  await withFileLock(qualityPath, ctx.agentId || ctx.currentSessionId || "task-tools:quality", async () => {
    // Load or create quality store
    const qualityStore = readJson(qualityPath, {
          version: "1.0",
          assessments: [],
          aggregate_stats: {},
          last_updated: "",
        });
    
    // Update or add assessment
    const existingIndex = qualityStore.assessments.findIndex(
      (a: any) => a.task_id === taskId
    );
    if (existingIndex >= 0) {
      qualityStore.assessments[existingIndex] = assessment;
    } else {
      qualityStore.assessments.push(assessment);
    }
    
    // Update aggregate stats
    const allScores = qualityStore.assessments.map((a: any) => a.overall_score);
    qualityStore.aggregate_stats = {
      total_assessed: qualityStore.assessments.length,
      avg_overall_score: allScores.reduce((s: number, v: number) => s + v, 0) / allScores.length,
    };
    qualityStore.last_updated = new Date().toISOString();
    writeJson(qualityPath, qualityStore);
  });
  
  // Update task with quality score
  task.quality_score = assessment.overall_score;
  task.quality_notes = "Auto-assessed";
  task.updated_at = new Date().toISOString();
  writeJson(tasksPath, tasksStore);
  
  // Update agent's quality metrics if task was assigned
  if (task.assigned_to) {
    await updateAgentMetrics(ctx.memoryDir, task.assigned_to, 0, assessment.overall_score);
  }
}

export function createTaskTools(getContext: () => TaskToolsContext) {
  const getTasksPath = () => join(getContext().memoryDir, "tasks.json");

  return {
    task_list: tool({
      description:
        `List persistent tasks from the task manager. Use this to see pending work across sessions.

Example usage:
- task_list() - Get all pending tasks
- task_list(status="in_progress") - See what workers are doing
- task_list(status="blocked") - Find tasks waiting on dependencies
- task_list(status="all") - Overview of entire task backlog

Returns: Array of tasks sorted by priority (critical > high > medium > low).`,
      args: {
        status: tool.schema
          .enum(["pending", "in_progress", "completed", "blocked", "all"])
          .describe("Filter by task status (default: pending)")
          .optional(),
      },
      async execute({ status = "pending" }) {
        try {
          const tasksPath = getTasksPath();
          if (!existsSync(tasksPath)) {
            return JSON.stringify({
              success: true,
              tasks: [],
              message: "No tasks found. Create tasks with task_create.",
            });
          }

          const store = readJson(tasksPath, { tasks: [] });
          let tasks = store.tasks || [];

          if (status !== "all") {
            tasks = tasks.filter((t: Task) => t.status === status);
          }

          // Sort by priority
          tasks.sort(
            (a: Task, b: Task) =>
              PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
          );

          return JSON.stringify({
            success: true,
            count: tasks.length,
            tasks: tasks.slice(0, 10).map((t: Task) => ({
              id: t.id,
              title: t.title,
              priority: t.priority,
              status: t.status,
              assigned_to: t.assigned_to,
            })),
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    task_create: tool({
      description:
        `Create a new persistent task that survives across sessions.

Example usage:
- task_create(title="Fix login bug", priority="high", tags=["bug", "auth"])
- task_create(title="Add tests", depends_on=["task_abc"], complexity="moderate")

Notes:
- High/critical priority tasks are auto-broadcast to workers via message bus
- Tasks with unmet dependencies start in "blocked" status
- Use estimated_hours for better scheduling recommendations`,
      args: {
        title: tool.schema.string().describe("Task title"),
        description: tool.schema
          .string()
          .describe("Detailed task description (optional)")
          .optional(),
        priority: tool.schema
          .enum(["critical", "high", "medium", "low"])
          .describe("Task priority (default: medium)")
          .optional(),
        tags: tool.schema
          .array(tool.schema.string())
          .describe("Tags for categorization (optional)")
          .optional(),
        depends_on: tool.schema
          .array(tool.schema.string())
          .describe("Array of task IDs that must complete before this task can start (optional)")
          .optional(),
        estimated_hours: tool.schema
          .number()
          .describe("Estimated hours to complete (optional, helps with scheduling)")
          .optional(),
        complexity: tool.schema
          .enum(["trivial", "simple", "moderate", "complex", "epic"])
          .describe("Task complexity level (optional, defaults to moderate)")
          .optional(),
      },
      async execute({
        title,
        description = "",
        priority = "medium",
        tags = [],
        depends_on = [],
        estimated_hours,
        complexity = "moderate",
      }) {
        try {
          const ctx = getContext();
          const tasksPath = getTasksPath();
          let task: Task | undefined;

          await withFileLock(
            tasksPath,
            ctx.agentId || ctx.currentSessionId || "task-tools:tasks",
            async () => {
              const store = existsSync(tasksPath)
                ? readJson(tasksPath, { tasks: [] })
                : {
                    version: "1.0",
                    tasks: [],
                    completed_count: 0,
                    last_updated: "",
                  };

              // Validate dependencies exist
              const validDeps = depends_on.filter((depId: string) =>
                store.tasks.some((t: Task) => t.id === depId)
              );

              // Check if dependencies are blocked (not completed)
              const blockedDeps = validDeps.filter((depId: string) => {
                const dep = store.tasks.find((t: Task) => t.id === depId);
                return dep && dep.status !== "completed";
              });

              const newTask = {
                id: `task_${Date.now()}_${Math.random()
                  .toString(36)
                  .slice(2, 8)}`,
                title,
                description,
                priority,
                status: blockedDeps.length > 0 ? "blocked" : "pending",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                created_by: ctx.currentSessionId || "unknown",
                tags,
                depends_on: validDeps.length > 0 ? validDeps : undefined,
                blocked_by: blockedDeps.length > 0 ? blockedDeps : undefined,
                estimated_hours: estimated_hours,
                complexity: complexity,
              };

              store.tasks.push(newTask);
              store.last_updated = new Date().toISOString();
              writeJson(tasksPath, store);
              task = newTask;
            }
          );

          if (!task) {
            throw new Error("Failed to create task under file lock");
          }

          ctx.log("INFO", `Task created: ${task.id}`, { title, priority });

          // Broadcast task availability for high-priority tasks
          if (priority === "critical" || priority === "high") {
            try {
              const messageBusPath = join(ctx.memoryDir, "message-bus.jsonl");
              const message = {
                message_id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                from_agent: ctx.agentId || "system",
                timestamp: new Date().toISOString(),
                type: "task_available",
                payload: {
                  task_id: task.id,
                  title: task.title,
                  priority: task.priority,
                  description: task.description,
                },
                read_by: [],
              };
              appendFileSync(messageBusPath, JSON.stringify(message) + "\n");
              ctx.log("INFO", `Broadcast task_available: ${task.id}`);
            } catch (e) {
              ctx.log("WARN", `Failed to broadcast task: ${e}`);
            }
          }

          return JSON.stringify({
            success: true,
            task: {
              id: task.id,
              title: task.title,
              priority: task.priority,
            },
            broadcast: priority === "critical" || priority === "high",
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    task_update: tool({
      description: `Update a task's status, assign it, or add notes.

Example usage:
- task_update(task_id="task_123", status="completed") - Mark done
- task_update(task_id="task_123", notes="Blocked on API response") - Add context
- task_update(task_id="task_123", status="blocked") - Flag as blocked
- task_update(task_id="task_123", status="completed", auto_assess=true) - Complete and auto-assess quality

Side effects:
- Completing a task auto-unblocks dependent tasks
- Broadcasts task_completed message for dashboard updates
- Updates agent performance metrics if task was assigned
- Auto-assessment calculates heuristic quality score and creates quality record`,
      args: {
        task_id: tool.schema
          .string()
          .describe("Task ID (use task_list to find IDs)"),
        status: tool.schema
          .enum([
            "pending",
            "in_progress",
            "completed",
            "blocked",
            "cancelled",
          ])
          .describe("New status (optional)")
          .optional(),
        assign_to: tool.schema
          .string()
          .describe("Agent ID to assign this task to (optional)")
          .optional(),
        notes: tool.schema
          .string()
          .describe("Add a note to the task (optional)")
          .optional(),
        auto_assess: tool.schema
          .boolean()
          .describe("Automatically assess task quality when status is 'completed' (optional)")
          .optional(),
      },
      async execute({ task_id, status, assign_to, notes, auto_assess }) {
        const ctx = getContext();
        ctx.log("INFO", `task_update called with: status=${status}, auto_assess=${auto_assess}`);
        
        try {
          const ctx = getContext();
          const tasksPath = getTasksPath();
          if (!existsSync(tasksPath)) {
            return JSON.stringify({
              success: false,
              message: "No tasks file found",
            });
          }

          const store = readJson(tasksPath, { tasks: [] });
          const task = store.tasks.find((t: Task) => t.id === task_id);

          if (!task) {
            return JSON.stringify({
              success: false,
              message: "Task not found",
            });
          }

          if (status) {
            task.status = status;
            if (status === "completed") {
              task.completed_at = new Date().toISOString();
              store.completed_count++;
              
              // Calculate task duration and update agent metrics
              if (task.claimed_at && task.assigned_to) {
                const claimedAt = new Date(task.claimed_at).getTime();
                const completedAt = Date.now();
                const durationMs = completedAt - claimedAt;
                
                // Update agent performance metrics (with file locking)
                await updateAgentMetrics(ctx.memoryDir, task.assigned_to, durationMs);
                ctx.log("INFO", `Updated metrics for agent ${task.assigned_to}`, {
                  duration_ms: durationMs,
                  duration_formatted: `${Math.round(durationMs / 60000)} min`,
                });
              }
              
              // Broadcast task_completed message for dashboard notifications
              try {
                const messageBusPath = join(ctx.memoryDir, "message-bus.jsonl");
                const message = {
                  message_id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                  from_agent: ctx.agentId || "system",
                  timestamp: new Date().toISOString(),
                  type: "task_completed",
                  payload: {
                    task_id: task.id,
                    title: task.title,
                    priority: task.priority,
                    completed_by: task.assigned_to,
                    duration_ms: task.claimed_at 
                      ? Date.now() - new Date(task.claimed_at).getTime() 
                      : undefined,
                  },
                  read_by: [],
                };
                appendFileSync(messageBusPath, JSON.stringify(message) + "\n");
                ctx.log("INFO", `Broadcast task_completed: ${task.id}`);
              } catch (e) {
                ctx.log("WARN", `Failed to broadcast task_completed: ${e}`);
              }
              
              // Unblock tasks that depend on this completed task
              let unblockedCount = 0;
              for (const t of store.tasks) {
                if (t.depends_on && t.depends_on.includes(task_id)) {
                  // Check if all dependencies are now complete
                  const allDepsComplete = t.depends_on.every((depId: string) => {
                    const dep = store.tasks.find((d: Task) => d.id === depId);
                    return dep && dep.status === "completed";
                  });
                  
                  if (allDepsComplete && (t.status === "blocked" || t.blocked_by)) {
                    t.status = "pending";
                    delete t.blocked_by;
                    t.updated_at = new Date().toISOString();
                    unblockedCount++;
                    ctx.log("INFO", `Task unblocked: ${t.id}`, { title: t.title });
                  }
                }
              }
              
              if (unblockedCount > 0) {
                ctx.log("INFO", `Unblocked ${unblockedCount} dependent task(s)`);
              }


            }
          }

          if (assign_to) {
            task.assigned_to = assign_to;
            if (!status) task.status = "in_progress";
          }

          if (notes) {
            task.notes = task.notes || [];
            task.notes.push(`[${new Date().toISOString()}] ${notes}`);
          }

          task.updated_at = new Date().toISOString();
          store.last_updated = new Date().toISOString();

          await withFileLock(
            tasksPath,
            ctx.agentId || ctx.currentSessionId || "task-tools:tasks",
            async () => {
              writeFileSync(tasksPath, JSON.stringify(store, null, 2));
            }
          );

          // Auto-assess quality if requested and task was completed
          if (status === "completed" && auto_assess) {
            ctx.log("INFO", `Starting auto-assessment for task: ${task_id}`);
            try {
              const qualityScore = calculateHeuristicQualityScore(task, ctx);
              ctx.log("INFO", `Calculated heuristic score: ${qualityScore}`);
              await performQualityAssessment(task_id, qualityScore, ctx);
              ctx.log("INFO", `Auto-assessed task quality: ${qualityScore.toFixed(1)}/10`);
            } catch (e) {
              ctx.log("ERROR", `Auto-assessment failed: ${e}`);
            }
          }

          ctx.log("INFO", `Task updated: ${task_id}`, { status, assign_to });

          return JSON.stringify({
            success: true,
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
              assigned_to: task.assigned_to,
            },
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    task_next: tool({
      description: `Get the next available high-priority task to work on. Respects task dependencies.

Example usage:
- task_next() - Returns the highest priority task that can be started now

Behavior:
- Only returns tasks with all dependencies satisfied
- Uses priority aging: older tasks gradually increase in priority
- Returns null if no tasks available (check blocked_count for waiting tasks)
- Includes effective_priority and hours_waiting for context`,
      args: {},
      async execute() {
        try {
          const tasksPath = getTasksPath();
          if (!existsSync(tasksPath)) {
            return JSON.stringify({
              success: true,
              task: null,
              message: "No tasks found",
            });
          }

          const store = readJson(tasksPath, { tasks: [] });
          
          // Helper to check if all dependencies are complete
          const dependenciesComplete = (task: Task): boolean => {
            if (!task.depends_on || task.depends_on.length === 0) return true;
            return task.depends_on.every((depId: string) => {
              const dep = store.tasks.find((t: Task) => t.id === depId);
              return dep && dep.status === "completed";
            });
          };

          // Find pending tasks that have all dependencies met, sorted by effective priority (with aging)
          const available = store.tasks
            .filter((t: Task) => t.status === "pending" && dependenciesComplete(t))
            .sort(
              (a: Task, b: Task) =>
                calculateEffectivePriority(a) - calculateEffectivePriority(b)
            );
          
          // Also get blocked tasks count
          const blockedCount = store.tasks
            .filter((t: Task) => t.status === "blocked" || 
              (t.status === "pending" && !dependenciesComplete(t)))
            .length;

          if (available.length === 0) {
            return JSON.stringify({
              success: true,
              task: null,
              message: blockedCount > 0 
                ? `No available tasks. ${blockedCount} task(s) waiting on dependencies.`
                : "No pending tasks. Create new tasks with task_create.",
              blocked_count: blockedCount,
            });
          }

          const task = available[0];
          const effectivePriority = calculateEffectivePriority(task);
          const hoursWaiting = (Date.now() - new Date(task.created_at).getTime()) / (1000 * 60 * 60);
          
          return JSON.stringify({
            success: true,
            task: {
              id: task.id,
              title: task.title,
              description: task.description,
              priority: task.priority,
              effective_priority: effectivePriority.toFixed(2),
              hours_waiting: hoursWaiting.toFixed(1),
              tags: task.tags,
              depends_on: task.depends_on,
              estimated_hours: task.estimated_hours,
              complexity: task.complexity,
            },
            pending_count: available.length,
            blocked_count: blockedCount,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    task_claim: tool({
      description:
        `Claim a pending task for this agent. Atomically assigns the task to prevent conflicts with other agents.

Example usage:
- task_claim(task_id="task_123_abc") - Claim and start working on task

Behavior:
- Atomic operation: prevents race conditions with other agents
- Sets status to "in_progress" and assigns to current agent
- Broadcasts task_claim message so orchestrator can track
- Fails if already claimed or completed (check current_assignee in response)

Edge cases:
- If task not found: returns success=false
- If already claimed by another agent: returns current_assignee
- If task completed: returns success=false`,
      args: {
        task_id: tool.schema
          .string()
          .describe(
            "Task ID to claim. Use task_next or agent_messages to find available tasks."
          ),
      },
      async execute({ task_id }) {
        try {
          const ctx = getContext();
          const tasksPath = getTasksPath();
          if (!existsSync(tasksPath)) {
            return JSON.stringify({
              success: false,
              message: "No tasks file found",
            });
          }

          const store = readJson(tasksPath, { tasks: [] });
          const task = store.tasks.find((t: Task) => t.id === task_id);

          if (!task) {
            return JSON.stringify({
              success: false,
              message: "Task not found",
            });
          }

          // Check if already claimed
          if (task.status === "in_progress" && task.assigned_to) {
            return JSON.stringify({
              success: false,
              message: `Task already claimed by ${task.assigned_to}`,
              current_assignee: task.assigned_to,
            });
          }

          if (task.status === "completed") {
            return JSON.stringify({
              success: false,
              message: "Task already completed",
            });
          }

          // Claim the task
          task.status = "in_progress";
          task.assigned_to = ctx.agentId || ctx.currentSessionId || "unknown";
          task.claimed_at = new Date().toISOString();
          task.updated_at = new Date().toISOString();
          store.last_updated = new Date().toISOString();

          await withFileLock(
            tasksPath,
            ctx.agentId || ctx.currentSessionId || "task-tools:tasks",
            async () => {
              writeJson(tasksPath, store);
            }
          );

          ctx.log("INFO", `Task claimed: ${task_id}`, {
            assigned_to: task.assigned_to,
          });

          // Record claim in agent performance metrics (with file locking)
          await recordTaskClaim(ctx.memoryDir, task.assigned_to);

          // Broadcast task_claim message
          try {
            const messageBusPath = join(ctx.memoryDir, "message-bus.jsonl");
            const message = {
              message_id: `msg-${Date.now()}-${Math.random()
                .toString(36)
                .substring(7)}`,
              from_agent: task.assigned_to,
              timestamp: new Date().toISOString(),
              type: "task_claim",
              payload: {
                task_id: task.id,
                title: task.title,
                claimed_by: task.assigned_to,
              },
              read_by: [],
            };
            appendFileSync(messageBusPath, JSON.stringify(message) + "\n");
          } catch (e) {
            ctx.log("WARN", `Failed to broadcast task_claim: ${e}`);
          }

          return JSON.stringify({
            success: true,
            task: {
              id: task.id,
              title: task.title,
              description: task.description,
              priority: task.priority,
              assigned_to: task.assigned_to,
            },
            message: "Task claimed successfully. Start working on it!",
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    /**
     * Task spawn tool - Wraps OpenCode's Task tool with our task system integration
     * This creates a persistent task, then spawns a subagent with memory context
     */
    task_spawn: tool({
      description:
        `Spawn a subagent with full memory context integration. Creates a persistent task, injects memory context into the subagent, and tracks the spawned session.

Example usage:
- task_spawn(title="Analyze codebase", prompt="...", subagent_type="explore")
- task_spawn(title="Fix auth bug", prompt="...", priority="high", inject_context=true)

Returns enhanced_prompt which you should pass to the Task tool.

Note: This creates the task record but you still need to call the Task tool with the enhanced_prompt to actually spawn the subagent. Use this instead of raw Task tool for better coordination.`,
      args: {
        title: tool.schema.string().describe("Short task title (3-5 words)"),
        prompt: tool.schema.string().describe("Detailed task prompt for the subagent"),
        subagent_type: tool.schema
          .enum(["general", "explore"])
          .describe("Type of subagent to spawn (default: general)")
          .optional(),
        priority: tool.schema
          .enum(["critical", "high", "medium", "low"])
          .describe("Task priority (default: medium)")
          .optional(),
        inject_context: tool.schema
          .boolean()
          .describe("Whether to inject memory context into subagent prompt (default: true)")
          .optional(),
      },
      async execute({ title, prompt, subagent_type = "general", priority = "medium", inject_context = true }) {
        try {
          const ctx = getContext();
          const tasksPath = getTasksPath();

          // Create the persistent task first
          const store = existsSync(tasksPath)
            ? JSON.parse(readFileSync(tasksPath, "utf-8"))
            : { version: "1.0", tasks: [], completed_count: 0, last_updated: "" };

          const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const task = {
            id: taskId,
            title,
            description: prompt.slice(0, 500) + (prompt.length > 500 ? "..." : ""),
            priority,
            status: "in_progress",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            claimed_at: new Date().toISOString(),
            created_by: ctx.currentSessionId || "unknown",
            spawned_by: ctx.agentId || ctx.currentSessionId || "unknown",
            subagent_type,
            tags: ["spawned", subagent_type],
          };

          store.tasks.push(task);
          store.last_updated = new Date().toISOString();

          await withFileLock(
            tasksPath,
            ctx.agentId || ctx.currentSessionId || "task-tools:tasks",
            async () => {
              writeJson(tasksPath, store);
            }
          );

          ctx.log("INFO", `Spawned task created: ${taskId}`, { title, priority, subagent_type });

          // Build enhanced prompt with memory context
          let enhancedPrompt = prompt;
          if (inject_context) {
            // Read current state for context
            const statePath = join(ctx.memoryDir, "state.json");
            let stateContext = "";
            try {
              if (existsSync(statePath)) {
                const state = readJson(statePath, {});
                stateContext = `
## Memory System Context (Injected)
**Session**: ${state.session_count || 0}
**Your Task ID**: ${taskId}
**Parent Session**: ${ctx.currentSessionId || "unknown"}

You have access to these tools for coordination:
- task_update(task_id="${taskId}", status="completed") - Mark when done
- agent_register(role="worker") - Register as worker
- agent_send(type="task_complete", payload={...}) - Report completion

`;
              }
            } catch {
              // Ignore state read errors
            }

            enhancedPrompt = `${stateContext}

## Your Task
${prompt}

## Instructions
1. First call agent_register with role="worker"
2. Work on the task above
3. When done, call task_update(task_id="${taskId}", status="completed")
4. Report results via agent_send(type="task_complete")
`;
          }

          // Record in message bus for tracking
          try {
            const messageBusPath = join(ctx.memoryDir, "message-bus.jsonl");
            const message = {
              message_id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              from_agent: ctx.agentId || "system",
              timestamp: new Date().toISOString(),
              type: "task_spawned",
              payload: {
                task_id: taskId,
                title,
                subagent_type,
                prompt_length: enhancedPrompt.length,
              },
              read_by: [],
            };
            appendFileSync(messageBusPath, JSON.stringify(message) + "\n");
          } catch (e) {
            ctx.log("WARN", `Failed to record spawn: ${e}`);
          }

          // Return info for the caller to use with the Task tool
          return JSON.stringify({
            success: true,
            task: {
              id: taskId,
              title,
              priority,
              subagent_type,
            },
            enhanced_prompt: enhancedPrompt,
            message: `Task ${taskId} created. Use the Task tool with this enhanced prompt to spawn the subagent.`,
            usage_hint: `Call Task tool with: description="${title}", prompt=<enhanced_prompt>, subagent_type="${subagent_type}"`,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    task_schedule: tool({
      description:
        `Get smart scheduling recommendations for pending tasks. Shows effective priorities with aging, estimated workload, and suggested execution order.

Example usage:
- task_schedule() - Get top 5 recommended tasks
- task_schedule(limit=10) - Get top 10 for planning

Returns:
- schedule: Tasks ordered by urgency_score (considers priority + waiting time + complexity)
- summary: Quick overview with recommendation on what to start first
- blocked_tasks: Tasks waiting on dependencies
- in_progress: Currently active tasks

Use this for planning work distribution across workers.`,
      args: {
        limit: tool.schema
          .number()
          .describe("Maximum number of tasks to return (default: 5)")
          .optional(),
      },
      async execute({ limit = 5 }) {
        try {
          const tasksPath = getTasksPath();
          if (!existsSync(tasksPath)) {
            return JSON.stringify({
              success: true,
              schedule: [],
              message: "No tasks found",
            });
          }

          const store = readJson(tasksPath, { tasks: [] });
          
          // Helper to check dependencies
          const dependenciesComplete = (task: Task): boolean => {
            if (!task.depends_on || task.depends_on.length === 0) return true;
            return task.depends_on.every((depId: string) => {
              const dep = store.tasks.find((t: Task) => t.id === depId);
              return dep && dep.status === "completed";
            });
          };

          // Calculate complexity score
          const getComplexityScore = (complexity: string): number => {
            const scores: Record<string, number> = {
              trivial: 1,
              simple: 2,
              moderate: 3,
              complex: 5,
              epic: 8,
            };
            return scores[complexity] || 3;
          };

          // Get available tasks with scheduling info
          const available = store.tasks
            .filter((t: Task) => t.status === "pending" && dependenciesComplete(t))
            .map((t: Task) => {
              const effectivePriority = calculateEffectivePriority(t);
              const hoursWaiting = (Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60);
              const complexityScore = getComplexityScore(t.complexity || "moderate");
              
              // Calculate urgency score (lower is more urgent)
              // Considers effective priority + time waiting + complexity
              const urgencyScore = effectivePriority - (hoursWaiting * 0.1) + (complexityScore * 0.1);
              
              return {
                id: t.id,
                title: t.title,
                priority: t.priority,
                effective_priority: Number(effectivePriority.toFixed(2)),
                hours_waiting: Number(hoursWaiting.toFixed(1)),
                complexity: t.complexity || "moderate",
                complexity_score: complexityScore,
                estimated_hours: t.estimated_hours,
                urgency_score: Number(urgencyScore.toFixed(2)),
                tags: t.tags || [],
              };
            })
            .sort((a: any, b: any) => a.urgency_score - b.urgency_score)
            .slice(0, limit);

          // Get blocked tasks
          const blocked = store.tasks
            .filter((t: Task) => t.status === "blocked" || (t.status === "pending" && !dependenciesComplete(t)))
            .map((t: Task) => ({
              id: t.id,
              title: t.title,
              blocked_by: t.depends_on?.filter((depId: string) => {
                const dep = store.tasks.find((d: Task) => d.id === depId);
                return dep && dep.status !== "completed";
              }) || [],
            }));

          // Calculate total estimated hours
          const totalEstimatedHours = available
            .filter((t: Task) => t.estimated_hours)
            .reduce((sum: number, t: Task) => sum + (t.estimated_hours || 0), 0);

          // Get in-progress tasks
          const inProgress = store.tasks
            .filter((t: Task) => t.status === "in_progress")
            .map((t: Task) => ({
              id: t.id,
              title: t.title,
              assigned_to: t.assigned_to,
              claimed_at: t.claimed_at,
            }));

          return JSON.stringify({
            success: true,
            schedule: available,
            summary: {
              available_count: available.length,
              blocked_count: blocked.length,
              in_progress_count: inProgress.length,
              total_estimated_hours: totalEstimatedHours || "unknown",
              recommendation: available.length > 0 
                ? `Start with "${available[0].title}" (priority: ${available[0].priority}, urgency: ${available[0].urgency_score})`
                : "No available tasks to schedule",
            },
            blocked_tasks: blocked.slice(0, 3),
            in_progress: inProgress,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),
  };
}
