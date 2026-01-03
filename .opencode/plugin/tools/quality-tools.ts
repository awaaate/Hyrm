/**
 * Quality Assessment Tools
 * 
 * Provides tools for task quality tracking:
 * - quality_assess: Assess completed task quality
 * - quality_report: Get quality statistics and trends
 */

import { tool } from "@opencode-ai/plugin";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";
import { readJson, writeJson } from "../../../tools/shared/json-utils";

// Update agent quality metrics
function updateAgentQualityMetrics(memoryDir: string, agentId: string, qualityScore: number): void {
  const metricsPath = join(memoryDir, "agent-performance-metrics.json");
  try {
    const store = existsSync(metricsPath)
      ? readJson(metricsPath, {})
      : { version: "1.0", last_updated: "", agents: {} };

    if (store.agents[agentId]) {
      const agent = store.agents[agentId];
      agent.quality_scores = agent.quality_scores || [];
      agent.quality_scores.push(qualityScore);
      agent.avg_quality = Number(
        (agent.quality_scores.reduce((a: number, b: number) => a + b, 0) / agent.quality_scores.length).toFixed(2)
      );
      agent.last_activity = new Date().toISOString();
      store.last_updated = new Date().toISOString();
      writeFileSync(metricsPath, JSON.stringify(store, null, 2));
    }
  } catch {
    // Silently fail - metrics are not critical
  }
}

export interface QualityToolsContext {
  memoryDir: string;
  currentSessionId: string | null;
  log: (level: "INFO" | "WARN" | "ERROR", message: string, data?: any) => void;
}

export function createQualityTools(getContext: () => QualityToolsContext) {
  const getTasksPath = () => join(getContext().memoryDir, "tasks.json");
  const getQualityPath = () => join(getContext().memoryDir, "quality-assessments.json");

  return {
    quality_assess: tool({
      description:
        `Assess a completed task's quality across multiple dimensions (completeness, code quality, documentation, efficiency, impact).

Example usage:
- quality_assess(task_id="task_123", completeness=9, code_quality=8, impact=7)
- quality_assess(task_id="task_123", lessons_learned="Always validate input before processing")

Scoring guide (1-10):
- 9-10: Exceptional - exceeds expectations
- 7-8: Good - meets all requirements
- 5-6: Acceptable - meets minimum requirements  
- 3-4: Below expectations - needs improvement
- 1-2: Unacceptable - major issues

Default scores are 7 if not provided. Weights: completeness(30%), code_quality(25%), documentation(15%), efficiency(15%), impact(15%).

The overall score is saved to the task and agent metrics for trend tracking.`,
      args: {
        task_id: tool.schema
          .string()
          .describe("ID of the completed task to assess (must be status=completed)"),
        completeness: tool.schema
          .number()
          .describe("Score 1-10: Did the task achieve its stated goal? (default: 7)")
          .optional(),
        code_quality: tool.schema
          .number()
          .describe("Score 1-10: Is the code clean, tested, maintainable? (default: 7)")
          .optional(),
        documentation: tool.schema
          .number()
          .describe("Score 1-10: Was work properly documented? (default: 6)")
          .optional(),
        efficiency: tool.schema
          .number()
          .describe("Score 1-10: Token usage, time efficiency (default: 7)")
          .optional(),
        impact: tool.schema
          .number()
          .describe("Score 1-10: Did this improve the system significantly? (default: 7)")
          .optional(),
        lessons_learned: tool.schema
          .string()
          .describe("Key lesson from this task for knowledge base")
          .optional(),
      },
      async execute({
        task_id,
        completeness,
        code_quality,
        documentation,
        efficiency,
        impact,
        lessons_learned,
      }) {
        try {
          const ctx = getContext();
          const tasksPath = getTasksPath();
          const qualityPath = getQualityPath();

          if (!existsSync(tasksPath)) {
            return JSON.stringify({
              success: false,
              message: "No tasks file found",
            });
          }

          const tasksStore = readJson(tasksPath, { tasks: [] });
          const task = tasksStore.tasks.find((t: any) => t.id === task_id);

          if (!task) {
            return JSON.stringify({
              success: false,
              message: "Task not found",
            });
          }

          if (task.status !== "completed") {
            return JSON.stringify({
              success: false,
              message: `Task is not completed (status: ${task.status})`,
            });
          }

          // Build quality dimensions
          const dimensions = [
            { name: "completeness", score: completeness ?? 7, weight: 0.3 },
            { name: "code_quality", score: code_quality ?? 7, weight: 0.25 },
            { name: "documentation", score: documentation ?? 6, weight: 0.15 },
            { name: "efficiency", score: efficiency ?? 7, weight: 0.15 },
            { name: "impact", score: impact ?? 7, weight: 0.15 },
          ];

          // Calculate weighted overall score
          const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
          const overallScore =
            dimensions.reduce((sum, d) => sum + d.score * d.weight, 0) /
            totalWeight;

          // Calculate duration
          let durationMinutes: number | undefined;
          if (task.created_at && task.completed_at) {
            durationMinutes = Math.round(
              (new Date(task.completed_at).getTime() -
                new Date(task.created_at).getTime()) /
                60000
            );
          }

          const assessment = {
            task_id,
            task_title: task.title,
            assessed_at: new Date().toISOString(),
            assessed_by: ctx.currentSessionId || "orchestrator",
            dimensions,
            overall_score: Math.round(overallScore * 10) / 10,
            lessons_learned,
            metadata: { duration_minutes: durationMinutes },
          };

          // Load or create quality store
          const qualityStore = existsSync(qualityPath)
            ? readJson(qualityPath, {})
            : {
                version: "1.0",
                assessments: [],
                aggregate_stats: {},
                last_updated: "",
              };

          // Update or add assessment
          const existingIndex = qualityStore.assessments.findIndex(
            (a: any) => a.task_id === task_id
          );
          if (existingIndex >= 0) {
            qualityStore.assessments[existingIndex] = assessment;
          } else {
            qualityStore.assessments.push(assessment);
          }

          // Update aggregate stats
          const allScores = qualityStore.assessments.map(
            (a: any) => a.overall_score
          );
          qualityStore.aggregate_stats = {
            total_assessed: qualityStore.assessments.length,
            avg_overall_score:
              allScores.reduce((s: number, v: number) => s + v, 0) /
              allScores.length,
          };
          qualityStore.last_updated = new Date().toISOString();
          writeJson(qualityPath, qualityStore);

          // Update task with quality score
          task.quality_score = assessment.overall_score;
          task.quality_notes = lessons_learned;
          task.updated_at = new Date().toISOString();
          writeJson(tasksPath, tasksStore);

          ctx.log("INFO", `Quality assessed: ${task_id}`, {
            score: assessment.overall_score,
          });

          // Update agent's quality metrics if task was assigned
          if (task.assigned_to) {
            updateAgentQualityMetrics(ctx.memoryDir, task.assigned_to, assessment.overall_score);
            ctx.log("INFO", `Updated quality metrics for agent ${task.assigned_to}`);
          }

          return JSON.stringify({
            success: true,
            assessment: {
              task_title: assessment.task_title,
              overall_score: assessment.overall_score,
              dimensions: dimensions.map((d) => ({
                name: d.name,
                score: d.score,
              })),
              lessons_learned: assessment.lessons_learned,
            },
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    quality_report: tool({
      description:
        `Get quality assessment statistics and trends for all assessed tasks.

Example usage:
- quality_report() - Get full quality metrics and trend analysis

Returns:
- stats: total_assessed, avg_overall_score, trend (improving/stable/declining)
- recent_lessons: Last 5 lessons learned for context
- unassessed_count: Number of completed tasks needing assessment

Use this to:
- Track quality trends over time
- Identify areas needing improvement
- Find unassessed tasks that need review`,
      args: {},
      async execute() {
        try {
          const ctx = getContext();
          const qualityPath = getQualityPath();
          const tasksPath = getTasksPath();

          if (!existsSync(qualityPath)) {
            return JSON.stringify({
              success: true,
              message:
                "No assessments yet. Use quality_assess to assess completed tasks.",
              stats: { total_assessed: 0, avg_overall_score: 0 },
            });
          }

          const store = readJson(qualityPath, {});
          const assessments = store.assessments || [];

          // Calculate trends (recent vs older)
          const sorted = [...assessments].sort(
            (a: any, b: any) =>
              new Date(b.assessed_at).getTime() -
              new Date(a.assessed_at).getTime()
          );
          const half = Math.floor(sorted.length / 2);
          const recent = sorted.slice(0, Math.max(1, half));
          const older = sorted.slice(half);

          const recentAvg =
            recent.reduce((s: number, a: any) => s + a.overall_score, 0) /
              recent.length || 0;
          const olderAvg =
            older.length > 0
              ? older.reduce((s: number, a: any) => s + a.overall_score, 0) /
                older.length
              : recentAvg;

          let trend = "stable";
          if (recentAvg > olderAvg + 0.5) trend = "improving";
          if (recentAvg < olderAvg - 0.5) trend = "declining";

          // Get lessons learned
          const lessons = assessments
            .filter((a: any) => a.lessons_learned)
            .slice(-5)
            .map((a: any) => ({
              task: a.task_title,
              lesson: a.lessons_learned,
            }));

          // Get unassessed tasks count
          let unassessedCount = 0;
          if (existsSync(tasksPath)) {
            const tasks = readJson(tasksPath, { tasks: [] });
            const assessedIds = new Set(
              assessments.map((a: any) => a.task_id)
            );
            unassessedCount = (tasks.tasks || []).filter(
              (t: any) => t.status === "completed" && !assessedIds.has(t.id)
            ).length;
          }

          return JSON.stringify({
            success: true,
            stats: {
              total_assessed: store.aggregate_stats?.total_assessed || 0,
              avg_overall_score: (
                store.aggregate_stats?.avg_overall_score || 0
              ).toFixed(1),
              trend,
              recent_avg: recentAvg.toFixed(1),
              older_avg: olderAvg.toFixed(1),
              unassessed_count: unassessedCount,
            },
            recent_lessons: lessons,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),
  };
}
