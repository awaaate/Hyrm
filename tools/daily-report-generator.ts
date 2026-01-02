#!/usr/bin/env bun
/**
 * Daily Performance Report Generator
 * 
 * Generates automated daily performance reports summarizing:
 * - Agent productivity (tasks completed, tool calls, active time)
 * - Quality trends (scores over time, improvements/regressions)
 * - Error patterns (common failures, affected tools)
 * - Improvement suggestions (based on patterns)
 * 
 * Reports are stored in memory/reports/ as markdown files.
 * 
 * Usage:
 *   bun tools/daily-report-generator.ts                    # Generate today's report
 *   bun tools/daily-report-generator.ts generate [date]    # Generate for specific date
 *   bun tools/daily-report-generator.ts list               # List available reports
 *   bun tools/daily-report-generator.ts view [date]        # View specific report
 *   bun tools/daily-report-generator.ts summary            # Quick summary stats
 *   bun tools/daily-report-generator.ts trends             # Show trends over time
 *   bun tools/daily-report-generator.ts help               # Show help
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { readJson, readJsonl } from './shared/json-utils';
import { c } from './shared/colors';
import { formatDate } from './shared/time-utils';
import { PATHS, MEMORY_DIR } from './shared/paths';

// Configuration
const REPORTS_DIR = join(MEMORY_DIR, "reports");

function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  return date;
}

function isToday(timestamp: string): boolean {
  const today = formatDate(new Date());
  const itemDate = formatDate(new Date(timestamp));
  return today === itemDate;
}

function isSameDay(timestamp: string, targetDate: string): boolean {
  const itemDate = formatDate(new Date(timestamp));
  return itemDate === targetDate;
}

// Data collection interfaces
interface AgentProductivity {
  totalAgents: number;
  activeAgents: number;
  totalToolCalls: number;
  toolCallsByAgent: Record<string, number>;
  toolCallsByType: Record<string, number>;
  avgToolCallsPerAgent: number;
  activeSessions: number;
  tasksCompleted: number;
  tasksCreated: number;
}

interface QualityTrends {
  averageScore: number;
  assessmentCount: number;
  scoresByDimension: Record<string, number>;
  trend: "improving" | "declining" | "stable";
  topPerformers: Array<{ task: string; score: number }>;
  lowPerformers: Array<{ task: string; score: number }>;
  recentScores: number[];
}

interface ErrorPatterns {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByTool: Record<string, number>;
  commonPatterns: Array<{ pattern: string; count: number }>;
  affectedTools: string[];
  errorRate: number;
}

interface Suggestion {
  category: "performance" | "quality" | "errors" | "productivity";
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  metric?: string;
}

// Data collection functions
function collectAgentProductivity(targetDate: string): AgentProductivity {
  const registry = readJson<any>(PATHS.agentRegistry, { agents: [] });
  const sessions = readJsonl<any>(PATHS.sessions);
  const messages = readJsonl<any>(PATHS.messageBus);
  const timing = readJsonl<any>(PATHS.toolTiming);
  const tasks = readJson<any>(PATHS.tasks, { tasks: [] });
  
  // Filter data for target date
  const dayMessages = messages.filter((m: any) => isSameDay(m.timestamp, targetDate));
  const dayTiming = timing.filter((t: any) => isSameDay(t.timestamp, targetDate));
  const daySessions = sessions.filter((s: any) => isSameDay(s.timestamp, targetDate));
  
  // Active agents today (from messages)
  const activeAgentIds = new Set(dayMessages.map((m: any) => m.from).filter(Boolean));
  
  // Tool calls by agent
  const toolCallsByAgent: Record<string, number> = {};
  const toolCallsByType: Record<string, number> = {};
  
  for (const t of dayTiming) {
    const agent = t.session_id || "unknown";
    toolCallsByAgent[agent] = (toolCallsByAgent[agent] || 0) + 1;
    toolCallsByType[t.tool] = (toolCallsByType[t.tool] || 0) + 1;
  }
  
  // Tasks completed today
  const tasksCompletedToday = (tasks.tasks || []).filter((t: any) => 
    t.status === "completed" && t.completed_at && isSameDay(t.completed_at, targetDate)
  ).length;
  
  const tasksCreatedToday = (tasks.tasks || []).filter((t: any) =>
    t.created_at && isSameDay(t.created_at, targetDate)
  ).length;
  
  // Session count
  const sessionStarts = daySessions.filter((s: any) => s.type === "session_start").length;
  
  return {
    totalAgents: registry.agents?.length || 0,
    activeAgents: activeAgentIds.size,
    totalToolCalls: dayTiming.length,
    toolCallsByAgent,
    toolCallsByType,
    avgToolCallsPerAgent: activeAgentIds.size > 0 ? dayTiming.length / activeAgentIds.size : 0,
    activeSessions: sessionStarts,
    tasksCompleted: tasksCompletedToday,
    tasksCreated: tasksCreatedToday,
  };
}

function collectQualityTrends(targetDate: string): QualityTrends {
  const quality = readJson<any>(PATHS.qualityAssessments, { assessments: [], summary: {} });
  const assessments = quality.assessments || [];
  
  // All assessments for trends
  const allScores = assessments.map((a: any) => a.overall_score || 0);
  
  // Today's assessments
  const todayAssessments = assessments.filter((a: any) => 
    a.assessed_at && isSameDay(a.assessed_at, targetDate)
  );
  
  const todayScores = todayAssessments.map((a: any) => a.overall_score || 0);
  const avgScore = todayScores.length > 0 
    ? todayScores.reduce((s: number, v: number) => s + v, 0) / todayScores.length 
    : quality.summary?.average_score || 0;
  
  // Calculate scores by dimension
  const scoresByDimension: Record<string, number> = {};
  const dimensionCounts: Record<string, number> = {};
  
  for (const a of todayAssessments) {
    if (a.dimensions) {
      for (const d of a.dimensions) {
        scoresByDimension[d.name] = (scoresByDimension[d.name] || 0) + d.score;
        dimensionCounts[d.name] = (dimensionCounts[d.name] || 0) + 1;
      }
    }
  }
  
  for (const dim in scoresByDimension) {
    scoresByDimension[dim] = scoresByDimension[dim] / dimensionCounts[dim];
  }
  
  // Calculate trend
  const recentScores = allScores.slice(-10);
  const olderScores = allScores.slice(-20, -10);
  const recentAvg = recentScores.length > 0 
    ? recentScores.reduce((s: number, v: number) => s + v, 0) / recentScores.length 
    : 0;
  const olderAvg = olderScores.length > 0 
    ? olderScores.reduce((s: number, v: number) => s + v, 0) / olderScores.length 
    : recentAvg;
  
  let trend: "improving" | "declining" | "stable" = "stable";
  if (recentAvg > olderAvg + 0.3) trend = "improving";
  if (recentAvg < olderAvg - 0.3) trend = "declining";
  
  // Top and low performers
  const sortedAssessments = [...todayAssessments].sort((a: any, b: any) => 
    (b.overall_score || 0) - (a.overall_score || 0)
  );
  
  const topPerformers = sortedAssessments.slice(0, 3).map((a: any) => ({
    task: a.task_title || a.task_id || "Unknown",
    score: a.overall_score || 0,
  }));
  
  const lowPerformers = sortedAssessments.slice(-3).reverse().map((a: any) => ({
    task: a.task_title || a.task_id || "Unknown",
    score: a.overall_score || 0,
  }));
  
  return {
    averageScore: avgScore,
    assessmentCount: todayAssessments.length,
    scoresByDimension,
    trend,
    topPerformers,
    lowPerformers,
    recentScores,
  };
}

function collectErrorPatterns(targetDate: string): ErrorPatterns {
  const timing = readJsonl<any>(PATHS.toolTiming);
  const logs = readJsonl<any>(PATHS.realtimeLog);
  
  // Filter for target date
  const dayTiming = timing.filter((t: any) => isSameDay(t.timestamp, targetDate));
  const dayLogs = logs.filter((l: any) => isSameDay(l.timestamp, targetDate));
  
  // Failed tool executions
  const failedTools = dayTiming.filter((t: any) => !t.success);
  
  // Error types and tools
  const errorsByType: Record<string, number> = {};
  const errorsByTool: Record<string, number> = {};
  
  for (const f of failedTools) {
    errorsByTool[f.tool] = (errorsByTool[f.tool] || 0) + 1;
    const category = f.category || "unknown";
    errorsByType[category] = (errorsByType[category] || 0) + 1;
  }
  
  // Error logs
  const errorLogs = dayLogs.filter((l: any) => l.level === "ERROR" || l.level === "WARN");
  
  // Common patterns (simple string matching)
  const patterns: Record<string, number> = {};
  for (const log of errorLogs) {
    const msg = log.message || "";
    // Extract key phrases
    if (msg.includes("timeout")) patterns["Timeout"] = (patterns["Timeout"] || 0) + 1;
    if (msg.includes("permission")) patterns["Permission"] = (patterns["Permission"] || 0) + 1;
    if (msg.includes("not found")) patterns["Not Found"] = (patterns["Not Found"] || 0) + 1;
    if (msg.includes("connection")) patterns["Connection"] = (patterns["Connection"] || 0) + 1;
    if (msg.includes("parse") || msg.includes("JSON")) patterns["Parse Error"] = (patterns["Parse Error"] || 0) + 1;
  }
  
  const commonPatterns = Object.entries(patterns)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  
  const errorRate = dayTiming.length > 0 
    ? (failedTools.length / dayTiming.length) * 100 
    : 0;
  
  return {
    totalErrors: failedTools.length + errorLogs.length,
    errorsByType,
    errorsByTool,
    commonPatterns,
    affectedTools: Object.keys(errorsByTool),
    errorRate,
  };
}

function generateSuggestions(
  productivity: AgentProductivity,
  quality: QualityTrends,
  errors: ErrorPatterns
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  
  // Productivity suggestions
  if (productivity.totalToolCalls < 50) {
    suggestions.push({
      category: "productivity",
      priority: "medium",
      title: "Low tool activity detected",
      description: "Consider reviewing task assignments or checking for blocked agents.",
      metric: `${productivity.totalToolCalls} tool calls today`,
    });
  }
  
  if (productivity.tasksCompleted === 0 && productivity.activeAgents > 0) {
    suggestions.push({
      category: "productivity",
      priority: "high",
      title: "No tasks completed today",
      description: "Active agents present but no task completions. Check task status and blockers.",
      metric: `${productivity.activeAgents} active agents, 0 completions`,
    });
  }
  
  // Quality suggestions
  if (quality.averageScore < 7) {
    suggestions.push({
      category: "quality",
      priority: "high",
      title: "Quality score below target",
      description: "Average quality score is below 7/10. Review low-scoring tasks and identify improvement areas.",
      metric: `${quality.averageScore.toFixed(1)}/10 average`,
    });
  }
  
  if (quality.trend === "declining") {
    suggestions.push({
      category: "quality",
      priority: "medium",
      title: "Quality trend declining",
      description: "Recent quality scores are lower than historical average. Investigate root causes.",
    });
  }
  
  // Low dimension scores
  for (const [dim, score] of Object.entries(quality.scoresByDimension)) {
    if (score < 7) {
      suggestions.push({
        category: "quality",
        priority: "medium",
        title: `Low ${dim} scores`,
        description: `The ${dim} dimension is averaging ${score.toFixed(1)}/10. Focus on improving this area.`,
      });
    }
  }
  
  // Error suggestions
  if (errors.errorRate > 5) {
    suggestions.push({
      category: "errors",
      priority: "high",
      title: "High error rate",
      description: `${errors.errorRate.toFixed(1)}% of tool executions are failing. Investigate most affected tools.`,
      metric: `${errors.totalErrors} errors total`,
    });
  }
  
  if (errors.affectedTools.length > 0) {
    const topErrorTool = Object.entries(errors.errorsByTool)
      .sort(([, a], [, b]) => b - a)[0];
    if (topErrorTool && topErrorTool[1] > 3) {
      suggestions.push({
        category: "errors",
        priority: "medium",
        title: `${topErrorTool[0]} has high failure rate`,
        description: `The ${topErrorTool[0]} tool failed ${topErrorTool[1]} times. Check implementation or inputs.`,
      });
    }
  }
  
  // Performance suggestions
  if (productivity.avgToolCallsPerAgent > 100) {
    suggestions.push({
      category: "performance",
      priority: "low",
      title: "High tool usage per agent",
      description: "Consider if agents are being efficient with tool calls. May indicate unnecessary operations.",
      metric: `${productivity.avgToolCallsPerAgent.toFixed(0)} calls/agent avg`,
    });
  }
  
  return suggestions;
}

// Report generation
function generateDailyReport(targetDate: string): string {
  const productivity = collectAgentProductivity(targetDate);
  const quality = collectQualityTrends(targetDate);
  const errors = collectErrorPatterns(targetDate);
  const suggestions = generateSuggestions(productivity, quality, errors);
  
  // Build markdown report
  let report = `# Daily Performance Report - ${targetDate}

Generated: ${new Date().toISOString()}

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Active Agents | ${productivity.activeAgents} |
| Tool Calls | ${productivity.totalToolCalls} |
| Tasks Completed | ${productivity.tasksCompleted} |
| Tasks Created | ${productivity.tasksCreated} |
| Quality Score | ${quality.averageScore.toFixed(1)}/10 |
| Error Rate | ${errors.errorRate.toFixed(1)}% |

---

## Agent Productivity

### Overview
- **Total Registered Agents**: ${productivity.totalAgents}
- **Active Today**: ${productivity.activeAgents}
- **Active Sessions**: ${productivity.activeSessions}
- **Tasks Completed**: ${productivity.tasksCompleted}
- **Tasks Created**: ${productivity.tasksCreated}
- **Avg Tool Calls/Agent**: ${productivity.avgToolCallsPerAgent.toFixed(1)}

### Tool Usage by Type
| Tool | Calls |
|------|-------|
${Object.entries(productivity.toolCallsByType)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 10)
  .map(([tool, count]) => `| ${tool} | ${count} |`)
  .join("\n") || "| No data | - |"}

---

## Quality Trends

### Overview
- **Average Score**: ${quality.averageScore.toFixed(1)}/10
- **Assessments Today**: ${quality.assessmentCount}
- **Trend**: ${quality.trend.charAt(0).toUpperCase() + quality.trend.slice(1)}

### Scores by Dimension
| Dimension | Score |
|-----------|-------|
${Object.entries(quality.scoresByDimension)
  .map(([dim, score]) => `| ${dim} | ${(score as number).toFixed(1)}/10 |`)
  .join("\n") || "| No assessments | - |"}

### Top Performers
${quality.topPerformers.length > 0
  ? quality.topPerformers.map((p, i) => `${i + 1}. **${p.task}** - ${p.score.toFixed(1)}/10`).join("\n")
  : "No assessments today"}

---

## Error Analysis

### Overview
- **Total Errors**: ${errors.totalErrors}
- **Error Rate**: ${errors.errorRate.toFixed(1)}%
- **Affected Tools**: ${errors.affectedTools.length}

### Errors by Tool
| Tool | Errors |
|------|--------|
${Object.entries(errors.errorsByTool)
  .sort(([, a], [, b]) => b - a)
  .slice(0, 5)
  .map(([tool, count]) => `| ${tool} | ${count} |`)
  .join("\n") || "| None | 0 |"}

### Common Patterns
${errors.commonPatterns.length > 0
  ? errors.commonPatterns.map(p => `- **${p.pattern}**: ${p.count} occurrences`).join("\n")
  : "No common patterns detected"}

---

## Improvement Suggestions

${suggestions.length > 0
  ? suggestions.map(s => `### ${s.priority.toUpperCase()}: ${s.title}

**Category**: ${s.category}
${s.metric ? `**Metric**: ${s.metric}` : ""}

${s.description}
`).join("\n")
  : "No specific suggestions - system is performing well!"}

---

## Notes

This report was automatically generated by the multi-agent system.
Use \`bun tools/daily-report-generator.ts trends\` to see historical trends.

`;

  return report;
}

// CLI functions
function showHelp(): void {
  console.log(`
${c.bright}Daily Performance Report Generator${c.reset}

${c.cyan}Usage:${c.reset}
  bun tools/daily-report-generator.ts [command] [args]

${c.cyan}Commands:${c.reset}
  ${c.bright}generate${c.reset} [date]    Generate report (default: today)
  ${c.bright}list${c.reset}              List available reports
  ${c.bright}view${c.reset} [date]       View specific report
  ${c.bright}summary${c.reset}           Quick summary stats
  ${c.bright}trends${c.reset}            Show trends over time
  ${c.bright}help${c.reset}              Show this help

${c.cyan}Examples:${c.reset}
  bun tools/daily-report-generator.ts                  # Generate today's report
  bun tools/daily-report-generator.ts generate 2026-01-01
  bun tools/daily-report-generator.ts list
  bun tools/daily-report-generator.ts view 2026-01-01
`);
}

function generateAndSaveReport(targetDate: string): void {
  console.log(`\n${c.cyan}Generating report for ${targetDate}...${c.reset}\n`);
  
  // Ensure reports directory exists
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }
  
  const report = generateDailyReport(targetDate);
  const reportPath = join(REPORTS_DIR, `report-${targetDate}.md`);
  
  writeFileSync(reportPath, report);
  
  console.log(`${c.green}Report generated successfully!${c.reset}`);
  console.log(`${c.dim}Saved to: ${reportPath}${c.reset}\n`);
  
  // Show summary
  console.log(`${c.bright}Quick Summary:${c.reset}`);
  const productivity = collectAgentProductivity(targetDate);
  const quality = collectQualityTrends(targetDate);
  const errors = collectErrorPatterns(targetDate);
  
  console.log(`  Active Agents:    ${c.cyan}${productivity.activeAgents}${c.reset}`);
  console.log(`  Tool Calls:       ${c.cyan}${productivity.totalToolCalls}${c.reset}`);
  console.log(`  Tasks Completed:  ${c.green}${productivity.tasksCompleted}${c.reset}`);
  console.log(`  Quality Score:    ${quality.averageScore >= 8 ? c.green : quality.averageScore >= 6 ? c.yellow : c.red}${quality.averageScore.toFixed(1)}/10${c.reset}`);
  console.log(`  Error Rate:       ${errors.errorRate < 5 ? c.green : errors.errorRate < 10 ? c.yellow : c.red}${errors.errorRate.toFixed(1)}%${c.reset}`);
  console.log();
}

function listReports(): void {
  console.log(`\n${c.bright}${c.cyan}AVAILABLE REPORTS${c.reset}\n`);
  
  if (!existsSync(REPORTS_DIR)) {
    console.log(`${c.dim}No reports directory found${c.reset}\n`);
    return;
  }
  
  const files = readdirSync(REPORTS_DIR)
    .filter(f => f.startsWith("report-") && f.endsWith(".md"))
    .sort()
    .reverse();
  
  if (files.length === 0) {
    console.log(`${c.dim}No reports found${c.reset}\n`);
    return;
  }
  
  for (const file of files) {
    const date = file.replace("report-", "").replace(".md", "");
    const path = join(REPORTS_DIR, file);
    const stat = require("fs").statSync(path);
    const size = (stat.size / 1024).toFixed(1);
    
    console.log(`  ${c.cyan}${date}${c.reset}  ${c.dim}(${size}KB)${c.reset}`);
  }
  console.log();
}

function viewReport(targetDate: string): void {
  const reportPath = join(REPORTS_DIR, `report-${targetDate}.md`);
  
  if (!existsSync(reportPath)) {
    console.log(`${c.red}Report not found for ${targetDate}${c.reset}`);
    console.log(`${c.dim}Generate it with: bun tools/daily-report-generator.ts generate ${targetDate}${c.reset}\n`);
    return;
  }
  
  const content = readFileSync(reportPath, "utf-8");
  console.log(content);
}

function showSummary(): void {
  const today = formatDate(new Date());
  console.log(`\n${c.bright}${c.cyan}QUICK SUMMARY - ${today}${c.reset}\n`);
  
  const productivity = collectAgentProductivity(today);
  const quality = collectQualityTrends(today);
  const errors = collectErrorPatterns(today);
  const suggestions = generateSuggestions(productivity, quality, errors);
  
  console.log(`${c.dim}Productivity:${c.reset}`);
  console.log(`  Active Agents:    ${productivity.activeAgents}`);
  console.log(`  Tool Calls:       ${productivity.totalToolCalls}`);
  console.log(`  Tasks Completed:  ${productivity.tasksCompleted}`);
  console.log(`  Tasks Created:    ${productivity.tasksCreated}`);
  console.log();
  
  console.log(`${c.dim}Quality:${c.reset}`);
  const qualityColor = quality.averageScore >= 8 ? c.green : quality.averageScore >= 6 ? c.yellow : c.red;
  console.log(`  Average Score:    ${qualityColor}${quality.averageScore.toFixed(1)}/10${c.reset}`);
  console.log(`  Assessments:      ${quality.assessmentCount}`);
  console.log(`  Trend:            ${quality.trend}`);
  console.log();
  
  console.log(`${c.dim}Errors:${c.reset}`);
  const errorColor = errors.errorRate < 5 ? c.green : errors.errorRate < 10 ? c.yellow : c.red;
  console.log(`  Total Errors:     ${errors.totalErrors}`);
  console.log(`  Error Rate:       ${errorColor}${errors.errorRate.toFixed(1)}%${c.reset}`);
  console.log();
  
  if (suggestions.length > 0) {
    console.log(`${c.dim}Suggestions (${suggestions.length}):${c.reset}`);
    for (const s of suggestions.slice(0, 3)) {
      const color = s.priority === "high" ? c.red : s.priority === "medium" ? c.yellow : c.dim;
      console.log(`  ${color}[${s.priority.toUpperCase()}]${c.reset} ${s.title}`);
    }
  }
  console.log();
}

function showTrends(): void {
  console.log(`\n${c.bright}${c.cyan}PERFORMANCE TRENDS${c.reset}\n`);
  
  if (!existsSync(REPORTS_DIR)) {
    console.log(`${c.dim}No reports available for trend analysis${c.reset}\n`);
    return;
  }
  
  // Get last 7 days of data
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(formatDate(date));
  }
  
  console.log(`${"Date".padEnd(12)} ${"Tools".padStart(7)} ${"Tasks".padStart(7)} ${"Quality".padStart(8)} ${"Errors".padStart(7)}`);
  console.log(`${"-".repeat(12)} ${"-".repeat(7)} ${"-".repeat(7)} ${"-".repeat(8)} ${"-".repeat(7)}`);
  
  for (const date of dates) {
    try {
      const productivity = collectAgentProductivity(date);
      const quality = collectQualityTrends(date);
      const errors = collectErrorPatterns(date);
      
      const qualityColor = quality.averageScore >= 8 ? c.green : quality.averageScore >= 6 ? c.yellow : c.red;
      const errorColor = errors.errorRate < 5 ? c.green : errors.errorRate < 10 ? c.yellow : c.red;
      
      console.log(
        `${date.padEnd(12)} ` +
        `${productivity.totalToolCalls.toString().padStart(7)} ` +
        `${productivity.tasksCompleted.toString().padStart(7)} ` +
        `${qualityColor}${quality.averageScore.toFixed(1).padStart(8)}${c.reset} ` +
        `${errorColor}${errors.errorRate.toFixed(1).padStart(6)}%${c.reset}`
      );
    } catch {
      console.log(`${date.padEnd(12)} ${c.dim}No data${c.reset}`);
    }
  }
  console.log();
}

// Main
const args = process.argv.slice(2);
const command = args[0] || "generate";

switch (command) {
  case "generate":
    const genDate = args[1] || formatDate(new Date());
    generateAndSaveReport(genDate);
    break;
    
  case "list":
    listReports();
    break;
    
  case "view":
    const viewDate = args[1] || formatDate(new Date());
    viewReport(viewDate);
    break;
    
  case "summary":
    showSummary();
    break;
    
  case "trends":
    showTrends();
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
