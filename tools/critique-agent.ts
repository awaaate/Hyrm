#!/usr/bin/env bun
/**
 * Critique Agent Tool
 * 
 * A specialized agent for code review, output analysis, debugging critique,
 * and quality assessment. Writes detailed markdown critiques to memory/critiques/.
 * 
 * Commands:
 *   code <file>       - Critique a code file with detailed feedback
 *   output <file>     - Analyze output/logs for issues and improvements
 *   task <task_id>    - Critique a completed task's implementation
 *   system            - System-wide critique and improvement suggestions
 *   review <pr_desc>  - Review changes described in text
 *   list              - List all critiques
 *   view <id>         - View a specific critique
 *   summary           - Summary of all critiques and patterns
 *   help              - Show help
 * 
 * Usage:
 *   bun tools/critique-agent.ts code src/index.ts
 *   bun tools/critique-agent.ts task task_123
 *   bun tools/critique-agent.ts system
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join, basename } from "path";

// Import shared utilities
import { readJson, c, formatDate, MEMORY_DIR, PATHS, ensureDir } from "./shared";

// Configuration
const CRITIQUES_DIR = join(MEMORY_DIR, "critiques");

// Ensure critiques directory exists
ensureDir(CRITIQUES_DIR);

// Alias 'bright' to 'bold' for backwards compatibility with existing code
const bold = c.bright;

// Types
interface Critique {
  id: string;
  type: "code" | "output" | "task" | "system" | "review";
  target: string;
  timestamp: string;
  severity: "info" | "warning" | "error" | "critical";
  score: number; // 1-10
  summary: string;
  issues: CritiqueIssue[];
  suggestions: string[];
  positives: string[];
  file_path?: string;
}

interface CritiqueIssue {
  category: string;
  severity: "info" | "warning" | "error" | "critical";
  description: string;
  location?: string;
  suggestion?: string;
}

interface TaskData {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  created_at: string;
  completed_at?: string;
  notes?: string;
}

// Utility functions
function generateId(): string {
  return `critique_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case "critical": return c.red;
    case "error": return c.red;
    case "warning": return c.yellow;
    case "info": return c.blue;
    default: return c.white;
  }
}

function getScoreColor(score: number): string {
  if (score >= 8) return c.green;
  if (score >= 6) return c.yellow;
  return c.red;
}

// Code analysis patterns
const CODE_PATTERNS = {
  security: [
    { pattern: /eval\s*\(/, issue: "Use of eval() - potential code injection risk", severity: "critical" },
    { pattern: /innerHTML\s*=/, issue: "Direct innerHTML assignment - XSS vulnerability risk", severity: "warning" },
    { pattern: /password|secret|api.?key/i, issue: "Potential hardcoded credential", severity: "critical" },
    { pattern: /http:\/\//, issue: "Using HTTP instead of HTTPS", severity: "warning" },
  ],
  quality: [
    { pattern: /console\.log/, issue: "Debug console.log left in code", severity: "info" },
    { pattern: /TODO|FIXME|HACK|XXX/, issue: "Unresolved TODO/FIXME comment", severity: "info" },
    { pattern: /any(?!\w)/, issue: "TypeScript 'any' type usage - reduces type safety", severity: "warning" },
    { pattern: /\/\/\s*@ts-ignore/, issue: "TypeScript error suppression", severity: "warning" },
    { pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/, issue: "Empty catch block - errors silently ignored", severity: "error" },
  ],
  performance: [
    { pattern: /\.forEach\s*\(.*\.forEach/, issue: "Nested forEach loops - O(n²) complexity", severity: "warning" },
    { pattern: /new\s+RegExp\s*\(.*\)/, issue: "RegExp in loop/hot path - consider caching", severity: "info" },
    { pattern: /JSON\.parse\(JSON\.stringify/, issue: "Deep clone via JSON - slow for large objects", severity: "info" },
  ],
  style: [
    { pattern: /function\s+\w+\s*\([^)]*\)\s*\{[\s\S]{500,}?\}/, issue: "Function exceeds 500 chars - consider breaking down", severity: "info" },
    { pattern: /if\s*\([^)]+\)\s*\{[^}]*if\s*\([^)]+\)\s*\{[^}]*if/, issue: "Deeply nested conditionals - consider early returns", severity: "warning" },
  ],
};

// Core critique functions
function analyzeCode(content: string, filePath: string): CritiqueIssue[] {
  const issues: CritiqueIssue[] = [];
  const lines = content.split("\n");
  
  // Pattern-based analysis
  for (const [category, patterns] of Object.entries(CODE_PATTERNS)) {
    for (const { pattern, issue, severity } of patterns) {
      let match;
      const regex = new RegExp(pattern.source, "gm");
      while ((match = regex.exec(content)) !== null) {
        const lineNum = content.substring(0, match.index).split("\n").length;
        issues.push({
          category,
          severity: severity as any,
          description: issue,
          location: `Line ${lineNum}`,
          suggestion: getSuggestionForIssue(issue),
        });
      }
    }
  }
  
  // Line length check
  lines.forEach((line, i) => {
    if (line.length > 120) {
      issues.push({
        category: "style",
        severity: "info",
        description: `Line exceeds 120 characters (${line.length})`,
        location: `Line ${i + 1}`,
        suggestion: "Consider breaking into multiple lines",
      });
    }
  });
  
  // File length check
  if (lines.length > 500) {
    issues.push({
      category: "style",
      severity: "warning",
      description: `File has ${lines.length} lines - consider splitting`,
      suggestion: "Break into smaller, focused modules",
    });
  }
  
  return issues;
}

function getSuggestionForIssue(issue: string): string {
  const suggestions: Record<string, string> = {
    "Use of eval()": "Use JSON.parse(), Function constructor, or restructure code",
    "Direct innerHTML": "Use textContent, createElement, or a sanitization library",
    "Potential hardcoded credential": "Move to environment variables or secrets manager",
    "Using HTTP instead of HTTPS": "Update to HTTPS for secure communication",
    "Debug console.log": "Remove or replace with proper logging framework",
    "TypeScript 'any' type": "Add proper type definitions",
    "TypeScript error suppression": "Fix the underlying type issue",
    "Empty catch block": "Log the error or handle appropriately",
    "Nested forEach loops": "Consider using Map/Set or restructuring data",
  };
  
  for (const [key, suggestion] of Object.entries(suggestions)) {
    if (issue.includes(key)) return suggestion;
  }
  return "Review and address as appropriate";
}

function calculateScore(issues: CritiqueIssue[]): number {
  let score = 10;
  for (const issue of issues) {
    switch (issue.severity) {
      case "critical": score -= 2; break;
      case "error": score -= 1.5; break;
      case "warning": score -= 0.5; break;
      case "info": score -= 0.1; break;
    }
  }
  return Math.max(1, Math.round(score * 10) / 10);
}

function generatePositives(content: string, filePath: string): string[] {
  const positives: string[] = [];
  
  if (content.includes("try") && content.includes("catch")) {
    positives.push("Good error handling with try/catch blocks");
  }
  if (content.includes("interface ") || content.includes("type ")) {
    positives.push("Uses TypeScript types/interfaces for type safety");
  }
  if (content.includes("async ") && content.includes("await ")) {
    positives.push("Proper async/await usage for asynchronous operations");
  }
  if (content.includes("/**") || content.includes("* @")) {
    positives.push("Includes JSDoc documentation");
  }
  if (content.includes("const ") && !content.includes("var ")) {
    positives.push("Uses const/let instead of var");
  }
  if (/^\/\*\*[\s\S]*?\*\//.test(content)) {
    positives.push("File has header documentation");
  }
  
  return positives.length > 0 ? positives : ["Code follows basic standards"];
}

function generateSuggestions(issues: CritiqueIssue[]): string[] {
  const suggestions: string[] = [];
  const categories = new Set(issues.map(i => i.category));
  
  if (categories.has("security")) {
    suggestions.push("Prioritize security fixes before deployment");
  }
  if (categories.has("performance")) {
    suggestions.push("Consider profiling to identify actual bottlenecks");
  }
  if (categories.has("quality")) {
    suggestions.push("Set up linting rules to catch these issues automatically");
  }
  if (categories.has("style")) {
    suggestions.push("Consider using prettier/eslint for consistent formatting");
  }
  
  return suggestions;
}

function saveCritique(critique: Critique): string {
  const filename = `${formatDate(new Date(critique.timestamp))}-${critique.type}-${critique.id}.md`;
  const filePath = join(CRITIQUES_DIR, filename);
  
  const severityEmoji: Record<string, string> = {
    critical: "!!!",
    error: "!!",
    warning: "!",
    info: "i",
  };
  
  let md = `# Critique: ${critique.target}\n\n`;
  md += `**Type:** ${critique.type}\n`;
  md += `**Date:** ${critique.timestamp}\n`;
  md += `**Score:** ${critique.score}/10\n`;
  md += `**Severity:** ${critique.severity}\n\n`;
  
  md += `## Summary\n\n${critique.summary}\n\n`;
  
  if (critique.positives.length > 0) {
    md += `## Positives\n\n`;
    for (const positive of critique.positives) {
      md += `- ${positive}\n`;
    }
    md += "\n";
  }
  
  if (critique.issues.length > 0) {
    md += `## Issues Found (${critique.issues.length})\n\n`;
    
    // Group by category
    const byCategory: Record<string, CritiqueIssue[]> = {};
    for (const issue of critique.issues) {
      if (!byCategory[issue.category]) byCategory[issue.category] = [];
      byCategory[issue.category].push(issue);
    }
    
    for (const [category, catIssues] of Object.entries(byCategory)) {
      md += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
      for (const issue of catIssues) {
        md += `- **[${severityEmoji[issue.severity]}]** ${issue.description}`;
        if (issue.location) md += ` (${issue.location})`;
        md += "\n";
        if (issue.suggestion) md += `  - Suggestion: ${issue.suggestion}\n`;
      }
      md += "\n";
    }
  }
  
  if (critique.suggestions.length > 0) {
    md += `## Recommendations\n\n`;
    for (const suggestion of critique.suggestions) {
      md += `- ${suggestion}\n`;
    }
    md += "\n";
  }
  
  writeFileSync(filePath, md);
  return filePath;
}

// Commands
function critiqueCode(filePath: string): void {
  if (!existsSync(filePath)) {
    console.log(`${c.red}Error: File not found: ${filePath}${c.reset}`);
    process.exit(1);
  }
  
  console.log(`${bold}Analyzing: ${filePath}${c.reset}\n`);
  
  const content = readFileSync(filePath, "utf-8");
  const issues = analyzeCode(content, filePath);
  const score = calculateScore(issues);
  const positives = generatePositives(content, filePath);
  const suggestions = generateSuggestions(issues);
  
  const maxSeverity = issues.reduce((max, i) => {
    const order = ["info", "warning", "error", "critical"];
    return order.indexOf(i.severity) > order.indexOf(max) ? i.severity : max;
  }, "info" as const);
  
  const critique: Critique = {
    id: generateId(),
    type: "code",
    target: basename(filePath),
    timestamp: new Date().toISOString(),
    severity: maxSeverity,
    score,
    summary: `Code analysis of ${basename(filePath)} found ${issues.length} issues across ${new Set(issues.map(i => i.category)).size} categories.`,
    issues,
    suggestions,
    positives,
    file_path: filePath,
  };
  
  const savedPath = saveCritique(critique);
  
  // Display results
  console.log(`${bold}Score: ${getScoreColor(score)}${score}/10${c.reset}\n`);
  
  if (positives.length > 0) {
    console.log(`${c.green}${bold}Positives:${c.reset}`);
    for (const p of positives) {
      console.log(`  ${c.green}+${c.reset} ${p}`);
    }
    console.log();
  }
  
  if (issues.length > 0) {
    console.log(`${bold}Issues (${issues.length}):${c.reset}`);
    const shown = issues.slice(0, 10);
    for (const issue of shown) {
      const color = getSeverityColor(issue.severity);
      console.log(`  ${color}[${issue.severity.toUpperCase()}]${c.reset} ${issue.description}`);
      if (issue.location) console.log(`    ${c.dim}at ${issue.location}${c.reset}`);
    }
    if (issues.length > 10) {
      console.log(`  ${c.dim}... and ${issues.length - 10} more${c.reset}`);
    }
    console.log();
  }
  
  if (suggestions.length > 0) {
    console.log(`${c.cyan}${bold}Recommendations:${c.reset}`);
    for (const s of suggestions) {
      console.log(`  ${c.cyan}>${c.reset} ${s}`);
    }
    console.log();
  }
  
  console.log(`${c.dim}Full critique saved to: ${savedPath}${c.reset}`);
}

function critiqueOutput(filePath: string): void {
  if (!existsSync(filePath)) {
    console.log(`${c.red}Error: File not found: ${filePath}${c.reset}`);
    process.exit(1);
  }
  
  console.log(`${bold}Analyzing output: ${filePath}${c.reset}\n`);
  
  const content = readFileSync(filePath, "utf-8");
  const issues: CritiqueIssue[] = [];
  const lines = content.split("\n");
  
  // Analyze output for common issues
  const patterns = [
    { pattern: /error|Error|ERROR/i, category: "errors", severity: "error" as const },
    { pattern: /warn|Warning|WARN/i, category: "warnings", severity: "warning" as const },
    { pattern: /deprecated/i, category: "deprecation", severity: "warning" as const },
    { pattern: /failed|failure|FAILED/i, category: "failures", severity: "error" as const },
    { pattern: /exception|Exception/i, category: "exceptions", severity: "error" as const },
    { pattern: /timeout|Timeout/i, category: "performance", severity: "warning" as const },
    { pattern: /memory|heap|leak/i, category: "memory", severity: "warning" as const },
    { pattern: /permission|denied|unauthorized/i, category: "security", severity: "error" as const },
  ];
  
  lines.forEach((line, i) => {
    for (const { pattern, category, severity } of patterns) {
      if (pattern.test(line)) {
        issues.push({
          category,
          severity,
          description: line.trim().substring(0, 100),
          location: `Line ${i + 1}`,
        });
      }
    }
  });
  
  const score = calculateScore(issues);
  const maxSeverity = issues.length > 0 
    ? issues.reduce((max, i) => {
        const order = ["info", "warning", "error", "critical"];
        return order.indexOf(i.severity) > order.indexOf(max) ? i.severity : max;
      }, "info" as const)
    : "info";
  
  const critique: Critique = {
    id: generateId(),
    type: "output",
    target: basename(filePath),
    timestamp: new Date().toISOString(),
    severity: maxSeverity,
    score,
    summary: `Output analysis found ${issues.length} potential issues.`,
    issues,
    suggestions: issues.length > 0 
      ? ["Review and address error messages", "Check warning patterns for potential issues"]
      : ["Output looks clean"],
    positives: issues.length === 0 ? ["No errors or warnings detected"] : [],
    file_path: filePath,
  };
  
  const savedPath = saveCritique(critique);
  
  console.log(`${bold}Score: ${getScoreColor(score)}${score}/10${c.reset}`);
  console.log(`${bold}Issues found: ${issues.length}${c.reset}\n`);
  
  if (issues.length > 0) {
    const byCategory: Record<string, number> = {};
    for (const issue of issues) {
      byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
    }
    
    console.log(`${bold}Issue breakdown:${c.reset}`);
    for (const [cat, count] of Object.entries(byCategory)) {
      console.log(`  ${cat}: ${count}`);
    }
  }
  
  console.log(`\n${c.dim}Full critique saved to: ${savedPath}${c.reset}`);
}

function critiqueTask(taskId: string): void {
  const tasksData = readJson<{ tasks: TaskData[] }>(PATHS.tasks, { tasks: [] });
  const task = tasksData.tasks.find(t => t.id === taskId || t.id.includes(taskId));
  
  if (!task) {
    console.log(`${c.red}Error: Task not found: ${taskId}${c.reset}`);
    console.log(`${c.dim}Available tasks:${c.reset}`);
    for (const t of tasksData.tasks.slice(-5)) {
      console.log(`  ${t.id}: ${t.title}`);
    }
    process.exit(1);
  }
  
  console.log(`${bold}Critiquing task: ${task.title}${c.reset}\n`);
  
  const issues: CritiqueIssue[] = [];
  const positives: string[] = [];
  
  // Analyze task
  if (!task.description || task.description.length < 20) {
    issues.push({
      category: "documentation",
      severity: "warning",
      description: "Task lacks detailed description",
      suggestion: "Add clear acceptance criteria and context",
    });
  } else {
    positives.push("Task has detailed description");
  }
  
  if (task.status === "completed" && !task.completed_at) {
    issues.push({
      category: "tracking",
      severity: "info",
      description: "Completed task missing completion timestamp",
    });
  }
  
  if (task.status === "completed" && task.completed_at && task.created_at) {
    const created = new Date(task.created_at).getTime();
    const completed = new Date(task.completed_at).getTime();
    const hoursElapsed = (completed - created) / (1000 * 60 * 60);
    
    if (hoursElapsed < 0.1) {
      positives.push(`Completed quickly (${Math.round(hoursElapsed * 60)} minutes)`);
    } else if (hoursElapsed > 24) {
      issues.push({
        category: "efficiency",
        severity: "info",
        description: `Task took ${Math.round(hoursElapsed)} hours - consider breaking into smaller tasks`,
      });
    }
  }
  
  if (!task.notes) {
    issues.push({
      category: "documentation",
      severity: "info",
      description: "No completion notes added",
      suggestion: "Add notes about what was done and any learnings",
    });
  } else {
    positives.push("Has completion notes");
  }
  
  // Check quality assessment
  const quality = readJson<{ assessments: any[] }>(PATHS.qualityAssessments, { assessments: [] });
  const assessment = quality.assessments.find(a => a.task_id === task.id);
  
  if (assessment) {
    positives.push(`Quality assessed: ${assessment.overall_score}/10`);
    if (assessment.overall_score < 7) {
      issues.push({
        category: "quality",
        severity: "warning",
        description: `Below-target quality score: ${assessment.overall_score}/10`,
      });
    }
  } else if (task.status === "completed") {
    issues.push({
      category: "process",
      severity: "warning",
      description: "Completed task not quality assessed",
      suggestion: "Use quality_assess() after task completion",
    });
  }
  
  const score = calculateScore(issues);
  
  const critique: Critique = {
    id: generateId(),
    type: "task",
    target: task.title,
    timestamp: new Date().toISOString(),
    severity: issues.some(i => i.severity === "error") ? "error" : "warning",
    score,
    summary: `Task "${task.title}" (${task.status}) critique: ${issues.length} issues found.`,
    issues,
    suggestions: [
      "Always include clear acceptance criteria",
      "Add completion notes with learnings",
      "Run quality assessment after completion",
    ],
    positives,
  };
  
  const savedPath = saveCritique(critique);
  
  console.log(`${bold}Task: ${task.title}${c.reset}`);
  console.log(`Status: ${task.status} | Priority: ${task.priority}`);
  console.log(`${bold}Score: ${getScoreColor(score)}${score}/10${c.reset}\n`);
  
  if (positives.length > 0) {
    console.log(`${c.green}Positives:${c.reset}`);
    for (const p of positives) {
      console.log(`  ${c.green}+${c.reset} ${p}`);
    }
    console.log();
  }
  
  if (issues.length > 0) {
    console.log(`${c.yellow}Issues:${c.reset}`);
    for (const issue of issues) {
      const color = getSeverityColor(issue.severity);
      console.log(`  ${color}[${issue.severity}]${c.reset} ${issue.description}`);
    }
  }
  
  console.log(`\n${c.dim}Full critique saved to: ${savedPath}${c.reset}`);
}

function critiqueSystem(): void {
  console.log(`${bold}System-wide Critique${c.reset}\n`);
  
  const issues: CritiqueIssue[] = [];
  const positives: string[] = [];
  
  // Check tasks health
  const allTasks = readJson<{ tasks: TaskData[] }>(PATHS.tasks, { tasks: [] });
  const pendingTasks = allTasks.tasks.filter(t => t.status === "pending");
  const completedTasks = allTasks.tasks.filter(t => t.status === "completed");
  
  if (pendingTasks.length > 10) {
    issues.push({
      category: "task-management",
      severity: "warning",
      description: `${pendingTasks.length} pending tasks - consider prioritizing or pruning`,
    });
  }
  
  if (completedTasks.length > 0) {
    positives.push(`${completedTasks.length} tasks completed`);
  }
  
  // Check quality assessments
  const quality = readJson<{ assessments: any[] }>(PATHS.qualityAssessments, { assessments: [] });
  if (quality.assessments.length > 0) {
    const avgScore = quality.assessments.reduce((sum, a) => sum + a.overall_score, 0) / quality.assessments.length;
    if (avgScore >= 8) {
      positives.push(`High average quality score: ${avgScore.toFixed(1)}/10`);
    } else if (avgScore < 7) {
      issues.push({
        category: "quality",
        severity: "warning",
        description: `Below-target average quality: ${avgScore.toFixed(1)}/10`,
      });
    }
  } else {
    issues.push({
      category: "process",
      severity: "warning",
      description: "No quality assessments recorded",
      suggestion: "Use quality_assess() after completing tasks",
    });
  }
  
  // Check knowledge base
  const knowledge = readJson<{ entries: any[] }>(PATHS.knowledgeBase, { entries: [] });
  if (knowledge.entries && knowledge.entries.length > 0) {
    positives.push(`Knowledge base has ${knowledge.entries.length} entries`);
  }
  
  // Check session state
  const state = readJson<any>(PATHS.state, {});
  if (state.session_count) {
    positives.push(`${state.session_count} sessions completed`);
  }
  
  // Check memory directory structure
  const memoryFiles = readdirSync(MEMORY_DIR);
  if (memoryFiles.includes("working.md")) {
    positives.push("Working memory maintained");
  } else {
    issues.push({
      category: "memory",
      severity: "info",
      description: "No working.md file found",
    });
  }
  
  const score = calculateScore(issues);
  
  const critique: Critique = {
    id: generateId(),
    type: "system",
    target: "System Health",
    timestamp: new Date().toISOString(),
    severity: issues.some(i => i.severity === "error") ? "error" : "info",
    score,
    summary: `System critique: ${positives.length} positives, ${issues.length} issues identified.`,
    issues,
    suggestions: [
      "Regularly prune completed tasks older than 30 days",
      "Maintain quality assessment coverage above 80%",
      "Keep pending task queue under 10 items",
      "Update working memory at session end",
    ],
    positives,
  };
  
  const savedPath = saveCritique(critique);
  
  console.log(`${bold}Score: ${getScoreColor(score)}${score}/10${c.reset}\n`);
  
  console.log(`${c.green}${bold}Positives:${c.reset}`);
  for (const p of positives) {
    console.log(`  ${c.green}+${c.reset} ${p}`);
  }
  console.log();
  
  if (issues.length > 0) {
    console.log(`${c.yellow}${bold}Issues:${c.reset}`);
    for (const issue of issues) {
      const color = getSeverityColor(issue.severity);
      console.log(`  ${color}[${issue.severity}]${c.reset} ${issue.description}`);
    }
    console.log();
  }
  
  console.log(`${c.cyan}${bold}Statistics:${c.reset}`);
  console.log(`  Tasks: ${allTasks.tasks.length} total, ${pendingTasks.length} pending`);
  console.log(`  Quality Assessments: ${quality.assessments.length}`);
  console.log(`  Knowledge Entries: ${knowledge.entries?.length || 0}`);
  
  console.log(`\n${c.dim}Full critique saved to: ${savedPath}${c.reset}`);
}

function critiqueReview(description: string): void {
  console.log(`${bold}Review Critique${c.reset}\n`);
  
  const issues: CritiqueIssue[] = [];
  const positives: string[] = [];
  
  // Analyze the description
  const words = description.split(/\s+/).length;
  
  if (words < 10) {
    issues.push({
      category: "description",
      severity: "warning",
      description: "Very brief description - add more context",
    });
  } else if (words > 20) {
    positives.push("Detailed description provided");
  }
  
  if (/test|spec/i.test(description)) {
    positives.push("Mentions testing");
  } else {
    issues.push({
      category: "testing",
      severity: "info",
      description: "No mention of tests - consider adding test coverage",
    });
  }
  
  if (/breaking|major/i.test(description)) {
    issues.push({
      category: "impact",
      severity: "warning",
      description: "Potential breaking change - ensure proper versioning",
    });
  }
  
  if (/fix|bug/i.test(description)) {
    positives.push("Bug fix identified");
  }
  
  if (/feature|add/i.test(description)) {
    positives.push("New feature addition");
  }
  
  if (/refactor/i.test(description)) {
    positives.push("Code improvement/refactoring");
  }
  
  const score = calculateScore(issues);
  
  const critique: Critique = {
    id: generateId(),
    type: "review",
    target: description.substring(0, 50) + (description.length > 50 ? "..." : ""),
    timestamp: new Date().toISOString(),
    severity: issues.some(i => i.severity === "error") ? "error" : "info",
    score,
    summary: `Review of: "${description.substring(0, 100)}"`,
    issues,
    suggestions: [
      "Include test coverage information",
      "Mention any migration steps needed",
      "Note performance implications if any",
    ],
    positives,
  };
  
  saveCritique(critique);
  
  console.log(`${bold}Score: ${getScoreColor(score)}${score}/10${c.reset}\n`);
  
  if (positives.length > 0) {
    console.log(`${c.green}Positives:${c.reset}`);
    for (const p of positives) {
      console.log(`  ${c.green}+${c.reset} ${p}`);
    }
    console.log();
  }
  
  if (issues.length > 0) {
    console.log(`${c.yellow}Suggestions:${c.reset}`);
    for (const issue of issues) {
      console.log(`  ${c.yellow}!${c.reset} ${issue.description}`);
    }
  }
}

function listCritiques(): void {
  if (!existsSync(CRITIQUES_DIR)) {
    console.log(`${c.dim}No critiques yet${c.reset}`);
    return;
  }
  
  const files = readdirSync(CRITIQUES_DIR).filter(f => f.endsWith(".md"));
  
  if (files.length === 0) {
    console.log(`${c.dim}No critiques found${c.reset}`);
    return;
  }
  
  console.log(`${bold}Critiques (${files.length})${c.reset}\n`);
  
  // Sort by date (newest first)
  files.sort().reverse();
  
  for (const file of files.slice(0, 20)) {
    const parts = file.split("-");
    const date = parts.slice(0, 3).join("-");
    const type = parts[3];
    console.log(`  ${c.dim}${date}${c.reset} [${c.cyan}${type}${c.reset}] ${file}`);
  }
  
  if (files.length > 20) {
    console.log(`  ${c.dim}... and ${files.length - 20} more${c.reset}`);
  }
}

function viewCritique(idOrFile: string): void {
  const files = readdirSync(CRITIQUES_DIR).filter(f => f.includes(idOrFile));
  
  if (files.length === 0) {
    console.log(`${c.red}Critique not found: ${idOrFile}${c.reset}`);
    return;
  }
  
  const content = readFileSync(join(CRITIQUES_DIR, files[0]), "utf-8");
  console.log(content);
}

function showSummary(): void {
  if (!existsSync(CRITIQUES_DIR)) {
    console.log(`${c.dim}No critiques yet${c.reset}`);
    return;
  }
  
  const files = readdirSync(CRITIQUES_DIR).filter(f => f.endsWith(".md"));
  
  console.log(`${bold}Critique Summary${c.reset}\n`);
  console.log(`Total critiques: ${files.length}`);
  
  // Count by type
  const byType: Record<string, number> = {};
  for (const file of files) {
    const parts = file.split("-");
    const type = parts[3] || "unknown";
    byType[type] = (byType[type] || 0) + 1;
  }
  
  console.log(`\n${bold}By Type:${c.reset}`);
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }
  
  // Recent critiques
  console.log(`\n${bold}Recent:${c.reset}`);
  files.sort().reverse().slice(0, 5).forEach(f => {
    console.log(`  ${f}`);
  });
}

function showHelp(): void {
  console.log(`
${bold}Critique Agent${c.reset} - Code review, output analysis, and quality assessment

${bold}Usage:${c.reset}
  bun tools/critique-agent.ts <command> [args]

${bold}Commands:${c.reset}
  ${c.cyan}code${c.reset} <file>       Critique a code file with detailed feedback
  ${c.cyan}output${c.reset} <file>     Analyze output/logs for issues
  ${c.cyan}task${c.reset} <task_id>    Critique a completed task's implementation
  ${c.cyan}system${c.reset}            System-wide critique and improvement suggestions
  ${c.cyan}review${c.reset} <text>     Review changes described in text
  ${c.cyan}list${c.reset}              List all critiques
  ${c.cyan}view${c.reset} <id>         View a specific critique
  ${c.cyan}summary${c.reset}           Summary of all critiques and patterns
  ${c.cyan}help${c.reset}              Show this help

${bold}Examples:${c.reset}
  bun tools/critique-agent.ts code src/index.ts
  bun tools/critique-agent.ts task task_123
  bun tools/critique-agent.ts system
  bun tools/critique-agent.ts review "Added user authentication feature"

${bold}Output:${c.reset}
  Critiques are saved as markdown files in memory/critiques/
`);
}

// Main
const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "code":
    if (!args[0]) {
      console.log(`${c.red}Usage: critique-agent.ts code <file>${c.reset}`);
      process.exit(1);
    }
    critiqueCode(args[0]);
    break;
    
  case "output":
    if (!args[0]) {
      console.log(`${c.red}Usage: critique-agent.ts output <file>${c.reset}`);
      process.exit(1);
    }
    critiqueOutput(args[0]);
    break;
    
  case "task":
    if (!args[0]) {
      console.log(`${c.red}Usage: critique-agent.ts task <task_id>${c.reset}`);
      process.exit(1);
    }
    critiqueTask(args[0]);
    break;
    
  case "system":
    critiqueSystem();
    break;
    
  case "review":
    if (!args[0]) {
      console.log(`${c.red}Usage: critique-agent.ts review "<description>"${c.reset}`);
      process.exit(1);
    }
    critiqueReview(args.join(" "));
    break;
    
  case "list":
    listCritiques();
    break;
    
  case "view":
    if (!args[0]) {
      console.log(`${c.red}Usage: critique-agent.ts view <id>${c.reset}`);
      process.exit(1);
    }
    viewCritique(args[0]);
    break;
    
  case "summary":
    showSummary();
    break;
    
  case "help":
  case "--help":
  case "-h":
    showHelp();
    break;
    
  default:
    if (command) {
      console.log(`${c.red}Unknown command: ${command}${c.reset}`);
    }
    showHelp();
}
