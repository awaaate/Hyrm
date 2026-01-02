#!/usr/bin/env bun
/**
 * Agent Performance Profiler
 * 
 * Comprehensive performance profiling and optimization system for multi-agent coordination.
 * 
 * Features:
 * - Tool execution time tracking
 * - Context usage efficiency analysis
 * - Task completion rates by agent
 * - Error pattern detection
 * - Automated optimization suggestions
 * 
 * Commands:
 *   profile               - Show full performance profile
 *   tools                 - Tool execution time analysis
 *   agents                - Per-agent performance breakdown
 *   efficiency            - Context usage efficiency report
 *   errors                - Error pattern analysis
 *   suggestions           - Get optimization suggestions
 *   history [days]        - Performance trends over time
 *   export                - Export metrics to JSON
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { readJson, writeJson, readJsonl } from './shared/json-utils';
import { c } from './shared/colors';
import { formatDuration } from './shared/time-utils';
import { PATHS, MEMORY_DIR } from './shared/paths';

// Additional paths not in shared
const OPENCODE_STORAGE = join(homedir(), ".local", "share", "opencode", "storage");
const PROFILER_CACHE_PATH = join(MEMORY_DIR, ".profiler-cache.json");

// Types
interface ToolExecution {
  tool: string;
  count: number;
  totalDurationMs: number;
  avgDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  errorCount: number;
  errorRate: number;
}

interface AgentProfile {
  agentId: string;
  tasksCompleted: number;
  tasksClaimed: number;
  avgTaskDurationMs: number;
  avgQuality: number;
  toolUsage: Record<string, number>;
  errorCount: number;
  efficiency: number; // 0-100
  firstSeen: string;
  lastSeen: string;
}

interface ErrorPattern {
  pattern: string;
  count: number;
  agents: string[];
  tools: string[];
  lastOccurred: string;
  severity: "low" | "medium" | "high" | "critical";
}

interface OptimizationSuggestion {
  category: "tool_usage" | "task_efficiency" | "error_reduction" | "quality" | "context";
  priority: "low" | "medium" | "high";
  title: string;
  description: string;
  metric: string;
  currentValue: number | string;
  targetValue?: number | string;
  actions: string[];
}

interface ProfilerCache {
  lastUpdated: string;
  toolExecutions: Record<string, ToolExecution>;
  agentProfiles: Record<string, AgentProfile>;
  errorPatterns: ErrorPattern[];
  suggestions: OptimizationSuggestion[];
  trends: {
    date: string;
    tasksCompleted: number;
    avgQuality: number;
    avgDuration: number;
    errorRate: number;
  }[];
}

// Session event type for JSONL parsing
interface SessionEvent {
  type: string;
  timestamp?: string;
  tool?: string;
  duration_ms?: number;
  error?: {
    name?: string;
    message?: string;
    data?: {
      message?: string;
    };
  };
}

// Performance metrics stored in agent-performance-metrics.json
interface PerformanceMetricsFile {
  agents: Record<string, AgentPerformanceData>;
}

interface AgentPerformanceData {
  tasks_completed?: number;
  tasks_claimed?: number;
  avg_duration_ms?: number;
  avg_quality?: number;
  first_seen?: string;
  last_activity?: string;
}

// Message bus entry type
interface MessageBusEntry {
  from?: string;
  type?: string;
  payload?: {
    tool?: string;
  };
}

// Helper functions
function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function progressBar(value: number, max: number, width: number = 20): string {
  if (max <= 0 || !isFinite(value) || !isFinite(max)) {
    return `${c.dim}${"░".repeat(width)}${c.reset}`;
  }
  const ratio = Math.max(0, Math.min(1, value / max));
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const color = ratio > 0.7 ? c.green : ratio > 0.4 ? c.yellow : c.red;
  return `${color}${"█".repeat(filled)}${c.dim}${"░".repeat(empty)}${c.reset}`;
}

// Core analysis functions
function analyzeToolExecutions(): Record<string, ToolExecution> {
  const tools: Record<string, ToolExecution> = {};
  
  // Read from OpenCode parts storage for actual tool usage
  const partsDir = join(OPENCODE_STORAGE, "part");
  if (existsSync(partsDir)) {
    try {
      const partFiles = readdirSync(partsDir).filter(f => f.endsWith(".json"));
      
      for (const file of partFiles.slice(-500)) { // Analyze last 500 parts
        try {
          const part = JSON.parse(readFileSync(join(partsDir, file), "utf-8"));
          
          if (part.type === "tool-invocation" && part.toolName) {
            const toolName = part.toolName;
            
            if (!tools[toolName]) {
              tools[toolName] = {
                tool: toolName,
                count: 0,
                totalDurationMs: 0,
                avgDurationMs: 0,
                minDurationMs: Infinity,
                maxDurationMs: 0,
                errorCount: 0,
                errorRate: 0,
              };
            }
            
            tools[toolName].count++;
            
            // Estimate duration from timestamps if available
            if (part.time?.created && part.time?.completed) {
              const duration = part.time.completed - part.time.created;
              tools[toolName].totalDurationMs += duration;
              tools[toolName].minDurationMs = Math.min(tools[toolName].minDurationMs, duration);
              tools[toolName].maxDurationMs = Math.max(tools[toolName].maxDurationMs, duration);
            }
            
            // Check for errors
            if (part.state?.status === "error" || part.result?.error) {
              tools[toolName].errorCount++;
            }
          }
        } catch {}
      }
    } catch {}
  }
  
  // Also analyze our internal session log
  const sessionEvents = readJsonl<SessionEvent>(PATHS.sessions);
  for (const event of sessionEvents) {
    if (event.type === "tool_call" && event.tool) {
      const toolName = event.tool;
      if (!tools[toolName]) {
        tools[toolName] = {
          tool: toolName,
          count: 0,
          totalDurationMs: 0,
          avgDurationMs: 0,
          minDurationMs: Infinity,
          maxDurationMs: 0,
          errorCount: 0,
          errorRate: 0,
        };
      }
      tools[toolName].count++;
      
      if (event.duration_ms) {
        tools[toolName].totalDurationMs += event.duration_ms;
        tools[toolName].minDurationMs = Math.min(tools[toolName].minDurationMs, event.duration_ms);
        tools[toolName].maxDurationMs = Math.max(tools[toolName].maxDurationMs, event.duration_ms);
      }
      
      if (event.error) {
        tools[toolName].errorCount++;
      }
    }
  }
  
  // Calculate averages and rates
  for (const tool of Object.values(tools)) {
    tool.avgDurationMs = tool.count > 0 ? tool.totalDurationMs / tool.count : 0;
    tool.errorRate = tool.count > 0 ? tool.errorCount / tool.count : 0;
    if (tool.minDurationMs === Infinity) tool.minDurationMs = 0;
  }
  
  return tools;
}

function analyzeAgentProfiles(): Record<string, AgentProfile> {
  const profiles: Record<string, AgentProfile> = {};
  
  // Load existing performance metrics
  const perfMetrics = readJson<PerformanceMetricsFile>(PATHS.agentPerformanceMetrics, { agents: {} });
  
  for (const [agentId, data] of Object.entries(perfMetrics.agents || {})) {
    const agent = data;
    profiles[agentId] = {
      agentId,
      tasksCompleted: agent.tasks_completed || 0,
      tasksClaimed: agent.tasks_claimed || 0,
      avgTaskDurationMs: agent.avg_duration_ms || 0,
      avgQuality: agent.avg_quality || 0,
      toolUsage: {},
      errorCount: 0,
      efficiency: 0,
      firstSeen: agent.first_seen || "",
      lastSeen: agent.last_activity || "",
    };
    
    // Calculate efficiency: completed/claimed ratio weighted by quality
    if (profiles[agentId].tasksClaimed > 0) {
      const completionRate = profiles[agentId].tasksCompleted / profiles[agentId].tasksClaimed;
      const qualityWeight = (profiles[agentId].avgQuality || 5) / 10;
      profiles[agentId].efficiency = Math.round(completionRate * qualityWeight * 100);
    }
  }
  
  // Analyze message bus for tool usage per agent
  const messages = readJsonl<any>(PATHS.messageBus);
  for (const msg of messages) {
    const agentId = msg.from;
    if (agentId && profiles[agentId]) {
      if (msg.type === "tool_call" && msg.payload?.tool) {
        if (!profiles[agentId].toolUsage[msg.payload.tool]) {
          profiles[agentId].toolUsage[msg.payload.tool] = 0;
        }
        profiles[agentId].toolUsage[msg.payload.tool]++;
      }
    }
  }
  
  return profiles;
}

function analyzeErrorPatterns(): ErrorPattern[] {
  const patterns: Map<string, ErrorPattern> = new Map();
  
  // Analyze session errors
  const sessionEvents = readJsonl<any>(PATHS.sessions);
  for (const event of sessionEvents) {
    if (event.type === "session_error" && event.error) {
      const errorName = event.error.name || "UnknownError";
      const errorMessage = event.error.data?.message || event.error.message || "";
      
      // Extract pattern from error
      let pattern = errorName;
      if (errorMessage.includes("invalid_type")) {
        pattern = "Type validation error";
      } else if (errorMessage.includes("timeout")) {
        pattern = "Timeout error";
      } else if (errorMessage.includes("ENOENT")) {
        pattern = "File not found error";
      } else if (errorMessage.includes("permission")) {
        pattern = "Permission error";
      }
      
      if (!patterns.has(pattern)) {
        patterns.set(pattern, {
          pattern,
          count: 0,
          agents: [],
          tools: [],
          lastOccurred: "",
          severity: "low",
        });
      }
      
      const p = patterns.get(pattern)!;
      p.count++;
      p.lastOccurred = event.timestamp;
      
      // Determine severity based on count
      if (p.count > 10) p.severity = "critical";
      else if (p.count > 5) p.severity = "high";
      else if (p.count > 2) p.severity = "medium";
    }
  }
  
  return Array.from(patterns.values()).sort((a, b) => b.count - a.count);
}

function generateSuggestions(
  tools: Record<string, ToolExecution>,
  agents: Record<string, AgentProfile>,
  errors: ErrorPattern[]
): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];
  
  // Tool usage suggestions
  const toolList = Object.values(tools).sort((a, b) => b.count - a.count);
  
  // Check for tools with high error rates
  for (const tool of toolList) {
    if (tool.errorRate > 0.1 && tool.count >= 5) {
      suggestions.push({
        category: "error_reduction",
        priority: tool.errorRate > 0.3 ? "high" : "medium",
        title: `High error rate for ${tool.tool}`,
        description: `Tool "${tool.tool}" has ${formatPercent(tool.errorRate)} error rate across ${tool.count} calls`,
        metric: "errorRate",
        currentValue: formatPercent(tool.errorRate),
        targetValue: "< 5%",
        actions: [
          `Review error logs for ${tool.tool} failures`,
          "Add input validation before tool calls",
          "Implement retry logic for transient failures",
        ],
      });
    }
  }
  
  // Check for slow tools
  for (const tool of toolList) {
    if (tool.avgDurationMs > 10000 && tool.count >= 3) { // > 10s average
      suggestions.push({
        category: "tool_usage",
        priority: tool.avgDurationMs > 30000 ? "high" : "medium",
        title: `Slow tool execution: ${tool.tool}`,
        description: `Tool "${tool.tool}" averages ${formatDuration(tool.avgDurationMs)} per call`,
        metric: "avgDurationMs",
        currentValue: formatDuration(tool.avgDurationMs),
        targetValue: "< 10s",
        actions: [
          "Consider caching results where possible",
          "Batch multiple operations into single calls",
          "Use streaming for large responses",
        ],
      });
    }
  }
  
  // Agent efficiency suggestions
  const agentList = Object.values(agents).sort((a, b) => b.tasksCompleted - a.tasksCompleted);
  
  for (const agent of agentList) {
    if (agent.tasksCompleted > 0) {
      // Low completion rate
      if (agent.tasksClaimed > 0 && agent.tasksCompleted / agent.tasksClaimed < 0.7) {
        suggestions.push({
          category: "task_efficiency",
          priority: "medium",
          title: `Low completion rate for ${agent.agentId.slice(-15)}`,
          description: `Agent completed ${agent.tasksCompleted}/${agent.tasksClaimed} claimed tasks`,
          metric: "completionRate",
          currentValue: formatPercent(agent.tasksCompleted / agent.tasksClaimed),
          targetValue: "> 90%",
          actions: [
            "Review task complexity vs agent capabilities",
            "Ensure tasks have clear completion criteria",
            "Consider breaking large tasks into subtasks",
          ],
        });
      }
      
      // Low quality
      if (agent.avgQuality > 0 && agent.avgQuality < 7.5) {
        suggestions.push({
          category: "quality",
          priority: agent.avgQuality < 6 ? "high" : "medium",
          title: `Below-target quality for ${agent.agentId.slice(-15)}`,
          description: `Agent's average quality score is ${agent.avgQuality.toFixed(1)}/10`,
          metric: "avgQuality",
          currentValue: agent.avgQuality.toFixed(1),
          targetValue: "> 8.0",
          actions: [
            "Review recent low-scoring tasks for patterns",
            "Add quality checklist to task completion",
            "Implement peer review for complex tasks",
          ],
        });
      }
    }
  }
  
  // Error pattern suggestions
  for (const error of errors.slice(0, 3)) {
    if (error.count >= 3) {
      suggestions.push({
        category: "error_reduction",
        priority: error.severity === "critical" ? "high" : error.severity === "high" ? "medium" : "low",
        title: `Recurring error pattern: ${error.pattern}`,
        description: `Error "${error.pattern}" occurred ${error.count} times`,
        metric: "errorCount",
        currentValue: error.count.toString(),
        targetValue: "0",
        actions: [
          "Investigate root cause of this error pattern",
          "Add defensive coding for this case",
          "Update error handling to gracefully recover",
        ],
      });
    }
  }
  
  // Context efficiency suggestion (general)
  const totalTasks = agentList.reduce((sum, a) => sum + a.tasksCompleted, 0);
  const avgDuration = agentList.reduce((sum, a) => sum + a.avgTaskDurationMs, 0) / (agentList.length || 1);
  
  if (avgDuration > 300000) { // > 5 minutes average
    suggestions.push({
      category: "context",
      priority: "medium",
      title: "High average task duration",
      description: `Average task takes ${formatDuration(avgDuration)} - consider optimizing context usage`,
      metric: "avgTaskDuration",
      currentValue: formatDuration(avgDuration),
      targetValue: "< 5m",
      actions: [
        "Use TodoWrite tool to plan before executing",
        "Minimize redundant file reads",
        "Use grep/glob for targeted searches instead of broad exploration",
        "Leverage caching for repeated operations",
      ],
    });
  }
  
  return suggestions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

// CLI Commands
function showProfile(): void {
  console.log(`\n${c.bold}${c.cyan}AGENT PERFORMANCE PROFILE${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(80)}${c.reset}\n`);
  
  const tools = analyzeToolExecutions();
  const agents = analyzeAgentProfiles();
  const errors = analyzeErrorPatterns();
  const suggestions = generateSuggestions(tools, agents, errors);
  
  // Save to cache
  const cache: ProfilerCache = {
    lastUpdated: new Date().toISOString(),
    toolExecutions: tools,
    agentProfiles: agents,
    errorPatterns: errors,
    suggestions,
    trends: [],
  };
  writeJson(PROFILER_CACHE_PATH, cache);
  
  // Summary stats
  const totalTools = Object.keys(tools).length;
  const totalCalls = Object.values(tools).reduce((sum, t) => sum + t.count, 0);
  const totalAgents = Object.keys(agents).length;
  const totalTasks = Object.values(agents).reduce((sum, a) => sum + a.tasksCompleted, 0);
  const avgQuality = Object.values(agents)
    .filter(a => a.avgQuality > 0)
    .reduce((sum, a, _, arr) => sum + a.avgQuality / arr.length, 0);
  
  console.log(`${c.bold}Overview:${c.reset}`);
  console.log(`  ${c.cyan}Tools analyzed:${c.reset}  ${totalTools} tools, ${totalCalls} total calls`);
  console.log(`  ${c.cyan}Agents tracked:${c.reset}  ${totalAgents} agents, ${totalTasks} tasks completed`);
  console.log(`  ${c.cyan}Error patterns:${c.reset}  ${errors.length} unique patterns`);
  console.log(`  ${c.cyan}Avg quality:${c.reset}     ${avgQuality.toFixed(1)}/10`);
  
  // Top tools
  console.log(`\n${c.bold}Top 5 Tools by Usage:${c.reset}`);
  const topTools = Object.values(tools).sort((a, b) => b.count - a.count).slice(0, 5);
  for (const tool of topTools) {
    const bar = progressBar(tool.count, topTools[0].count, 15);
    const errorIndicator = tool.errorRate > 0.1 ? ` ${c.red}(${formatPercent(tool.errorRate)} errors)${c.reset}` : "";
    console.log(`  ${bar} ${tool.tool.padEnd(25)} ${tool.count.toString().padStart(5)} calls${errorIndicator}`);
  }
  
  // Top agents
  console.log(`\n${c.bold}Top 5 Agents by Tasks Completed:${c.reset}`);
  const topAgents = Object.values(agents)
    .filter(a => a.tasksCompleted > 0)
    .sort((a, b) => b.tasksCompleted - a.tasksCompleted)
    .slice(0, 5);
  for (const agent of topAgents) {
    const bar = progressBar(agent.efficiency, 100, 15);
    const qualityColor = agent.avgQuality >= 8 ? c.green : agent.avgQuality >= 7 ? c.yellow : c.red;
    console.log(
      `  ${bar} ${agent.agentId.slice(-25).padEnd(27)} ` +
      `${agent.tasksCompleted} tasks ` +
      `${qualityColor}(${agent.avgQuality.toFixed(1)}/10)${c.reset}`
    );
  }
  
  // Critical errors
  const criticalErrors = errors.filter(e => e.severity === "critical" || e.severity === "high");
  if (criticalErrors.length > 0) {
    console.log(`\n${c.bold}${c.red}Critical Error Patterns:${c.reset}`);
    for (const error of criticalErrors.slice(0, 3)) {
      const severityColor = error.severity === "critical" ? c.red + c.bold : c.yellow;
      console.log(`  ${severityColor}[${error.severity.toUpperCase()}]${c.reset} ${error.pattern}: ${error.count} occurrences`);
    }
  }
  
  // Top suggestions
  console.log(`\n${c.bold}Top Optimization Suggestions:${c.reset}`);
  for (const suggestion of suggestions.slice(0, 3)) {
    const priorityColor = suggestion.priority === "high" ? c.red : suggestion.priority === "medium" ? c.yellow : c.green;
    console.log(`  ${priorityColor}[${suggestion.priority.toUpperCase()}]${c.reset} ${suggestion.title}`);
    console.log(`    ${c.dim}Current: ${suggestion.currentValue} -> Target: ${suggestion.targetValue || "N/A"}${c.reset}`);
  }
  
  console.log(`\n${c.dim}Run 'bun tools/agent-performance-profiler.ts suggestions' for full recommendations${c.reset}\n`);
}

function showToolAnalysis(): void {
  console.log(`\n${c.bold}${c.blue}TOOL EXECUTION ANALYSIS${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(80)}${c.reset}\n`);
  
  const tools = analyzeToolExecutions();
  const toolList = Object.values(tools).sort((a, b) => b.count - a.count);
  
  if (toolList.length === 0) {
    console.log(`${c.dim}No tool execution data available yet.${c.reset}\n`);
    return;
  }
  
  // Header
  console.log(
    `${c.bold}${"Tool".padEnd(30)} ${"Calls".padStart(8)} ${"Avg".padStart(10)} ` +
    `${"Min".padStart(10)} ${"Max".padStart(10)} ${"Errors".padStart(10)}${c.reset}`
  );
  console.log(`${c.dim}${"─".repeat(80)}${c.reset}`);
  
  for (const tool of toolList) {
    const errorColor = tool.errorRate > 0.1 ? c.red : tool.errorRate > 0 ? c.yellow : c.dim;
    console.log(
      `${tool.tool.slice(0, 29).padEnd(30)} ` +
      `${tool.count.toString().padStart(8)} ` +
      `${formatDuration(tool.avgDurationMs).padStart(10)} ` +
      `${formatDuration(tool.minDurationMs).padStart(10)} ` +
      `${formatDuration(tool.maxDurationMs).padStart(10)} ` +
      `${errorColor}${formatPercent(tool.errorRate).padStart(10)}${c.reset}`
    );
  }
  
  // Summary
  const totalCalls = toolList.reduce((sum, t) => sum + t.count, 0);
  const totalErrors = toolList.reduce((sum, t) => sum + t.errorCount, 0);
  const avgDuration = toolList.reduce((sum, t) => sum + t.avgDurationMs * t.count, 0) / (totalCalls || 1);
  
  console.log(`\n${c.dim}${"─".repeat(80)}${c.reset}`);
  console.log(
    `${c.bold}Total${c.reset}`.padEnd(30) +
    `${totalCalls.toString().padStart(8)} ` +
    `${formatDuration(avgDuration).padStart(10)} ` +
    `${"".padStart(21)} ` +
    `${formatPercent(totalErrors / (totalCalls || 1)).padStart(10)}`
  );
  console.log();
}

function showAgentAnalysis(): void {
  console.log(`\n${c.bold}${c.magenta}AGENT PERFORMANCE BREAKDOWN${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(80)}${c.reset}\n`);
  
  const agents = analyzeAgentProfiles();
  const agentList = Object.values(agents)
    .filter(a => a.tasksCompleted > 0 || a.tasksClaimed > 0)
    .sort((a, b) => b.tasksCompleted - a.tasksCompleted);
  
  if (agentList.length === 0) {
    console.log(`${c.dim}No agent performance data available yet.${c.reset}\n`);
    return;
  }
  
  for (const agent of agentList) {
    const completionRate = agent.tasksClaimed > 0 ? agent.tasksCompleted / agent.tasksClaimed : 0;
    const qualityColor = agent.avgQuality >= 8 ? c.green : agent.avgQuality >= 7 ? c.yellow : c.red;
    const efficiencyColor = agent.efficiency >= 70 ? c.green : agent.efficiency >= 40 ? c.yellow : c.red;
    
    console.log(`${c.bold}${agent.agentId}${c.reset}`);
    console.log(`  Tasks: ${agent.tasksCompleted}/${agent.tasksClaimed} completed (${formatPercent(completionRate)})`);
    console.log(`  Quality: ${qualityColor}${agent.avgQuality.toFixed(1)}/10${c.reset}`);
    console.log(`  Avg Duration: ${formatDuration(agent.avgTaskDurationMs)}`);
    console.log(`  Efficiency: ${efficiencyColor}${agent.efficiency}%${c.reset}`);
    console.log(`  Active: ${agent.firstSeen.slice(0, 10)} - ${agent.lastSeen.slice(0, 10)}`);
    
    const topTools = Object.entries(agent.toolUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (topTools.length > 0) {
      console.log(`  Top tools: ${topTools.map(([t, c]) => `${t}(${c})`).join(", ")}`);
    }
    
    console.log();
  }
}

function showEfficiencyReport(): void {
  console.log(`\n${c.bold}${c.green}CONTEXT USAGE EFFICIENCY${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(80)}${c.reset}\n`);
  
  const agents = analyzeAgentProfiles();
  const tools = analyzeToolExecutions();
  
  // Calculate overall efficiency metrics
  const agentList = Object.values(agents).filter(a => a.tasksCompleted > 0);
  const totalTasks = agentList.reduce((sum, a) => sum + a.tasksCompleted, 0);
  const avgDuration = agentList.reduce((sum, a) => sum + a.avgTaskDurationMs, 0) / (agentList.length || 1);
  const avgQuality = agentList
    .filter(a => a.avgQuality > 0)
    .reduce((sum, a, _, arr) => sum + a.avgQuality / arr.length, 0);
  
  console.log(`${c.bold}Overall Metrics:${c.reset}`);
  console.log(`  Total tasks completed: ${totalTasks}`);
  console.log(`  Average task duration: ${formatDuration(avgDuration)}`);
  console.log(`  Average quality score: ${avgQuality.toFixed(1)}/10`);
  
  // Tool efficiency
  const toolList = Object.values(tools);
  const totalToolCalls = toolList.reduce((sum, t) => sum + t.count, 0);
  const totalToolTime = toolList.reduce((sum, t) => sum + t.totalDurationMs, 0);
  
  console.log(`\n${c.bold}Tool Usage:${c.reset}`);
  console.log(`  Total tool calls: ${totalToolCalls}`);
  console.log(`  Total tool time: ${formatDuration(totalToolTime)}`);
  console.log(`  Avg time per call: ${formatDuration(totalToolTime / (totalToolCalls || 1))}`);
  
  // Context efficiency score (heuristic)
  const durationScore = Math.max(0, 100 - (avgDuration / 60000) * 10); // Penalize > 10min
  const qualityScore = avgQuality * 10; // 0-100
  const errorRate = toolList.reduce((sum, t) => sum + t.errorCount, 0) / (totalToolCalls || 1);
  const errorScore = Math.max(0, 100 - errorRate * 500); // Heavy penalty for errors
  
  const overallScore = (durationScore + qualityScore + errorScore) / 3;
  
  console.log(`\n${c.bold}Efficiency Score:${c.reset}`);
  console.log(`  Duration efficiency:  ${progressBar(durationScore, 100)} ${durationScore.toFixed(0)}%`);
  console.log(`  Quality efficiency:   ${progressBar(qualityScore, 100)} ${qualityScore.toFixed(0)}%`);
  console.log(`  Error efficiency:     ${progressBar(errorScore, 100)} ${errorScore.toFixed(0)}%`);
  console.log(`  ${c.bold}Overall:              ${progressBar(overallScore, 100)} ${overallScore.toFixed(0)}%${c.reset}`);
  
  // Recommendations
  console.log(`\n${c.bold}Efficiency Recommendations:${c.reset}`);
  
  if (durationScore < 70) {
    console.log(`  ${c.yellow}!${c.reset} Consider breaking long tasks into smaller subtasks`);
    console.log(`  ${c.yellow}!${c.reset} Use targeted searches (grep/glob) instead of broad exploration`);
  }
  
  if (qualityScore < 70) {
    console.log(`  ${c.yellow}!${c.reset} Implement quality checklists before task completion`);
    console.log(`  ${c.yellow}!${c.reset} Add peer review for complex tasks`);
  }
  
  if (errorScore < 80) {
    console.log(`  ${c.red}!${c.reset} High error rate detected - investigate failing tools`);
    console.log(`  ${c.red}!${c.reset} Add input validation and retry logic`);
  }
  
  console.log();
}

function showErrorAnalysis(): void {
  console.log(`\n${c.bold}${c.red}ERROR PATTERN ANALYSIS${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(80)}${c.reset}\n`);
  
  const errors = analyzeErrorPatterns();
  
  if (errors.length === 0) {
    console.log(`${c.green}No error patterns detected.${c.reset}\n`);
    return;
  }
  
  for (const error of errors) {
    const severityColors: Record<string, string> = {
      critical: c.red + c.bold,
      high: c.red,
      medium: c.yellow,
      low: c.dim,
    };
    const severityColor = severityColors[error.severity];
    
    console.log(`${severityColor}[${error.severity.toUpperCase()}]${c.reset} ${error.pattern}`);
    console.log(`  Occurrences: ${error.count}`);
    console.log(`  Last seen: ${error.lastOccurred}`);
    if (error.tools.length > 0) {
      console.log(`  Affected tools: ${error.tools.join(", ")}`);
    }
    console.log();
  }
  
  // Summary
  const criticalCount = errors.filter(e => e.severity === "critical").length;
  const highCount = errors.filter(e => e.severity === "high").length;
  
  if (criticalCount > 0 || highCount > 0) {
    console.log(`${c.red}${c.bold}Attention needed:${c.reset} ${criticalCount} critical, ${highCount} high severity patterns\n`);
  }
}

function showSuggestions(): void {
  console.log(`\n${c.bold}${c.yellow}OPTIMIZATION SUGGESTIONS${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(80)}${c.reset}\n`);
  
  const tools = analyzeToolExecutions();
  const agents = analyzeAgentProfiles();
  const errors = analyzeErrorPatterns();
  const suggestions = generateSuggestions(tools, agents, errors);
  
  if (suggestions.length === 0) {
    console.log(`${c.green}No optimization suggestions at this time.${c.reset}\n`);
    return;
  }
  
  const groupedByCategory: Record<string, OptimizationSuggestion[]> = {};
  for (const suggestion of suggestions) {
    if (!groupedByCategory[suggestion.category]) {
      groupedByCategory[suggestion.category] = [];
    }
    groupedByCategory[suggestion.category].push(suggestion);
  }
  
  const categoryLabels: Record<string, string> = {
    tool_usage: "Tool Usage",
    task_efficiency: "Task Efficiency",
    error_reduction: "Error Reduction",
    quality: "Quality Improvement",
    context: "Context Optimization",
  };
  
  for (const [category, items] of Object.entries(groupedByCategory)) {
    console.log(`${c.bold}${categoryLabels[category] || category}:${c.reset}\n`);
    
    for (const suggestion of items) {
      const priorityColors: Record<string, string> = {
        high: c.red,
        medium: c.yellow,
        low: c.green,
      };
      const color = priorityColors[suggestion.priority];
      
      console.log(`  ${color}[${suggestion.priority.toUpperCase()}]${c.reset} ${suggestion.title}`);
      console.log(`    ${c.dim}${suggestion.description}${c.reset}`);
      console.log(`    ${c.cyan}Current:${c.reset} ${suggestion.currentValue} -> ${c.cyan}Target:${c.reset} ${suggestion.targetValue || "N/A"}`);
      console.log(`    ${c.bold}Actions:${c.reset}`);
      for (const action of suggestion.actions) {
        console.log(`      - ${action}`);
      }
      console.log();
    }
  }
}

function exportMetrics(): void {
  const tools = analyzeToolExecutions();
  const agents = analyzeAgentProfiles();
  const errors = analyzeErrorPatterns();
  const suggestions = generateSuggestions(tools, agents, errors);
  
  const exportData = {
    exportedAt: new Date().toISOString(),
    toolExecutions: tools,
    agentProfiles: agents,
    errorPatterns: errors,
    suggestions,
    summary: {
      totalTools: Object.keys(tools).length,
      totalToolCalls: Object.values(tools).reduce((sum, t) => sum + t.count, 0),
      totalAgents: Object.keys(agents).length,
      totalTasksCompleted: Object.values(agents).reduce((sum, a) => sum + a.tasksCompleted, 0),
      avgQuality: Object.values(agents)
        .filter(a => a.avgQuality > 0)
        .reduce((sum, a, _, arr) => sum + a.avgQuality / arr.length, 0),
      errorPatternCount: errors.length,
      suggestionCount: suggestions.length,
    },
  };
  
  const exportPath = join(MEMORY_DIR, `performance-export-${Date.now()}.json`);
  writeJson(exportPath, exportData);
  
  console.log(`\n${c.green}Performance metrics exported to:${c.reset}`);
  console.log(`  ${exportPath}\n`);
}

function showHelp(): void {
  console.log(`
${c.bold}${c.cyan}Agent Performance Profiler${c.reset}

${c.cyan}Usage:${c.reset}
  bun tools/agent-performance-profiler.ts <command>

${c.cyan}Commands:${c.reset}
  ${c.bold}profile${c.reset}        Show full performance profile (default)
  ${c.bold}tools${c.reset}          Tool execution time analysis
  ${c.bold}agents${c.reset}         Per-agent performance breakdown
  ${c.bold}efficiency${c.reset}     Context usage efficiency report
  ${c.bold}errors${c.reset}         Error pattern analysis
  ${c.bold}suggestions${c.reset}    Get optimization suggestions
  ${c.bold}export${c.reset}         Export metrics to JSON file
  ${c.bold}help${c.reset}           Show this help

${c.cyan}Examples:${c.reset}
  bun tools/agent-performance-profiler.ts profile
  bun tools/agent-performance-profiler.ts suggestions
  bun tools/agent-performance-profiler.ts errors

${c.dim}Metrics are stored in: ${PROFILER_CACHE_PATH}${c.reset}
`);
}

// CLI routing
const command = process.argv[2];

switch (command) {
  case "profile":
  case undefined:
    showProfile();
    break;
  case "tools":
    showToolAnalysis();
    break;
  case "agents":
    showAgentAnalysis();
    break;
  case "efficiency":
    showEfficiencyReport();
    break;
  case "errors":
    showErrorAnalysis();
    break;
  case "suggestions":
    showSuggestions();
    break;
  case "export":
    exportMetrics();
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
