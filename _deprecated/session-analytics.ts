#!/usr/bin/env bun
/**
 * Session Analytics Tool
 * 
 * Analyzes OpenCode sessions to extract patterns, learnings, and recommendations.
 * Builds a learning system that improves over time.
 * 
 * Commands:
 *   analyze [limit]    - Analyze sessions and extract insights
 *   patterns           - Show discovered patterns
 *   learnings          - Extract and display learnings
 *   recommendations    - Generate improvement suggestions
 *   report             - Full analytics report
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Paths
const OPENCODE_STORAGE = join(homedir(), ".local", "share", "opencode", "storage");
const MEMORY_DIR = join(process.cwd(), "memory");
const KNOWLEDGE_BASE_PATH = join(MEMORY_DIR, "knowledge-base.json");
const ANALYTICS_CACHE_PATH = join(MEMORY_DIR, ".analytics-cache.json");

const PATHS = {
  sessions: join(OPENCODE_STORAGE, "session"),
  messages: join(OPENCODE_STORAGE, "message"),
  parts: join(OPENCODE_STORAGE, "part"),
  projects: join(OPENCODE_STORAGE, "project"),
};

// ANSI colors
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

// Types
interface OpenCodeSession {
  id: string;
  version: string;
  projectID: string;
  directory: string;
  title: string;
  parentID?: string;
  time: {
    created: number;
    updated: number;
    compacting?: number;
    archived?: number;
  };
  summary?: {
    additions?: number;
    deletions?: number;
    files?: number;
  };
  share?: {
    url: string;
  };
}

interface OpenCodeMessage {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  time: {
    created: number;
  };
  summary?: {
    title?: string;
    diffs?: any[];
  };
}

interface OpenCodePart {
  id: string;
  messageID: string;
  sessionID: string;
  type: string;
  text?: string;
  tool?: string;
  toolName?: string;
  callID?: string;
  state?: {
    status: string;
    input?: any;
    output?: any;
  };
  args?: any;
  result?: any;
  time?: {
    created?: number;
  };
}

interface SessionAnalysis {
  sessionId: string;
  title: string;
  duration: number; // ms
  messageCount: number;
  toolUsage: Record<string, number>;
  filesModified: string[];
  success: boolean;
  errorPatterns: string[];
  approaches: string[];
  learnings: string[];
  quality: number; // 0-10
}

interface AnalyticsReport {
  generatedAt: string;
  sessionsAnalyzed: number;
  totalDuration: number;
  patterns: {
    successfulTools: { tool: string; successRate: number; count: number }[];
    commonErrors: { error: string; count: number; sessions: string[] }[];
    productivityMetrics: {
      avgMessagesPerSession: number;
      avgDuration: number;
      avgFilesModified: number;
      completionRate: number;
    };
    toolEfficiency: { tool: string; avgUsagePerSession: number; inSuccessfulSessions: number }[];
  };
  learnings: {
    whatWorked: string[];
    whatFailed: string[];
    recommendations: string[];
  };
  sessionAnalyses: SessionAnalysis[];
}

// Utilities
function readJson<T>(path: string): T | null {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  } catch (e) {
    // Silent fail
  }
  return null;
}

function writeJson(path: string, data: any): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

function getProjects(): string[] {
  if (!existsSync(PATHS.projects)) return [];
  return readdirSync(PATHS.projects)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

function getSessionsForProject(projectId: string): OpenCodeSession[] {
  const projectDir = join(PATHS.sessions, projectId);
  if (!existsSync(projectDir)) return [];

  return readdirSync(projectDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<OpenCodeSession>(join(projectDir, f)))
    .filter((s): s is OpenCodeSession => s !== null)
    .sort((a, b) => b.time.updated - a.time.updated);
}

function getAllSessions(): OpenCodeSession[] {
  const projects = getProjects();
  const allSessions: OpenCodeSession[] = [];

  for (const projectId of projects) {
    allSessions.push(...getSessionsForProject(projectId));
  }

  if (existsSync(PATHS.sessions)) {
    const dirs = readdirSync(PATHS.sessions);
    for (const dir of dirs) {
      const dirPath = join(PATHS.sessions, dir);
      try {
        const stat = require("fs").statSync(dirPath);
        if (stat.isDirectory()) {
          const sessions = getSessionsForProject(dir);
          for (const session of sessions) {
            if (!allSessions.find((s) => s.id === session.id)) {
              allSessions.push(session);
            }
          }
        }
      } catch {}
    }
  }

  return allSessions.sort((a, b) => b.time.updated - a.time.updated);
}

function getMessagesForSession(sessionId: string): OpenCodeMessage[] {
  const messageDir = join(PATHS.messages, sessionId);
  if (!existsSync(messageDir)) return [];

  return readdirSync(messageDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<OpenCodeMessage>(join(messageDir, f)))
    .filter((m): m is OpenCodeMessage => m !== null)
    .sort((a, b) => a.time.created - b.time.created);
}

function getPartsForMessage(messageId: string): OpenCodePart[] {
  const partDir = join(PATHS.parts, messageId);
  if (!existsSync(partDir)) return [];

  return readdirSync(partDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson<OpenCodePart>(join(partDir, f)))
    .filter((p): p is OpenCodePart => p !== null);
}

// Analysis functions
function extractErrorPatterns(parts: OpenCodePart[]): string[] {
  const errorPatterns: string[] = [];
  const errorKeywords = [
    "error", "Error", "ERROR",
    "failed", "Failed", "FAILED",
    "exception", "Exception",
    "not found", "Not found",
    "permission denied",
    "timeout", "Timeout",
    "syntax error",
    "undefined", "null",
  ];

  for (const part of parts) {
    const text = part.text || JSON.stringify(part.result) || "";
    for (const keyword of errorKeywords) {
      if (text.includes(keyword)) {
        // Extract a short context around the error
        const idx = text.indexOf(keyword);
        const start = Math.max(0, idx - 20);
        const end = Math.min(text.length, idx + keyword.length + 50);
        const context = text.slice(start, end).replace(/\n/g, " ").trim();
        if (context.length > 10 && !errorPatterns.includes(context)) {
          errorPatterns.push(context.slice(0, 100));
        }
        break;
      }
    }
  }

  return errorPatterns.slice(0, 10); // Limit to 10 patterns
}

function extractApproaches(parts: OpenCodePart[]): string[] {
  const approaches: string[] = [];
  const approachKeywords = [
    "let me", "I'll", "I will",
    "approach", "strategy",
    "first", "then", "finally",
    "planning to", "going to",
  ];

  for (const part of parts) {
    if (part.type !== "text" || !part.text) continue;
    
    const sentences = part.text.split(/[.!?]\s+/);
    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      for (const keyword of approachKeywords) {
        if (lowerSentence.includes(keyword) && sentence.length > 20 && sentence.length < 200) {
          const clean = sentence.replace(/\n/g, " ").trim();
          if (!approaches.includes(clean)) {
            approaches.push(clean);
          }
          break;
        }
      }
    }
  }

  return approaches.slice(0, 5);
}

function extractLearnings(parts: OpenCodePart[]): string[] {
  const learnings: string[] = [];
  const learningKeywords = [
    "discovered", "found that", "realized",
    "the issue was", "the problem was",
    "solution:", "fixed by",
    "works because", "important to",
    "need to", "should always",
    "lesson learned", "key insight",
  ];

  for (const part of parts) {
    if (part.type !== "text" || !part.text) continue;
    
    const sentences = part.text.split(/[.!?]\s+/);
    for (const sentence of sentences) {
      const lowerSentence = sentence.toLowerCase();
      for (const keyword of learningKeywords) {
        if (lowerSentence.includes(keyword) && sentence.length > 30 && sentence.length < 300) {
          const clean = sentence.replace(/\n/g, " ").trim();
          if (!learnings.includes(clean)) {
            learnings.push(clean);
          }
          break;
        }
      }
    }
  }

  return learnings.slice(0, 5);
}

function analyzeSession(session: OpenCodeSession): SessionAnalysis {
  const messages = getMessagesForSession(session.id);
  const toolUsage: Record<string, number> = {};
  const filesModified: Set<string> = new Set();
  const allParts: OpenCodePart[] = [];
  let hasErrors = false;

  for (const msg of messages) {
    const parts = getPartsForMessage(msg.id);
    allParts.push(...parts);

    for (const part of parts) {
      // Track tool usage
      const toolName = part.tool || part.toolName;
      if (toolName) {
        toolUsage[toolName] = (toolUsage[toolName] || 0) + 1;
      }

      // Track file modifications (from edit/write tools)
      if (part.args?.filePath) {
        filesModified.add(part.args.filePath);
      }

      // Check for errors
      const resultStr = JSON.stringify(part.result || "").toLowerCase();
      if (resultStr.includes("error") || resultStr.includes("failed")) {
        hasErrors = true;
      }
    }
  }

  const errorPatterns = extractErrorPatterns(allParts);
  const approaches = extractApproaches(allParts);
  const learnings = extractLearnings(allParts);

  // Calculate quality score (0-10)
  let quality = 5; // Base score
  if (session.summary?.files && session.summary.files > 0) quality += 1;
  if (messages.length > 5) quality += 1;
  if (learnings.length > 0) quality += 1;
  if (!hasErrors) quality += 1;
  if (errorPatterns.length === 0) quality += 1;
  quality = Math.min(10, Math.max(0, quality));

  return {
    sessionId: session.id,
    title: session.title,
    duration: session.time.updated - session.time.created,
    messageCount: messages.length,
    toolUsage,
    filesModified: Array.from(filesModified),
    success: !hasErrors && errorPatterns.length < 3,
    errorPatterns,
    approaches,
    learnings,
    quality,
  };
}

function generateReport(sessions: OpenCodeSession[], limit: number): AnalyticsReport {
  console.log(`${c.cyan}Analyzing ${Math.min(sessions.length, limit)} sessions...${c.reset}\n`);

  const analyses: SessionAnalysis[] = [];
  const toolSuccessCount: Record<string, { success: number; total: number }> = {};
  const allErrors: { error: string; sessions: string[] }[] = [];
  const allLearnings: { text: string; sessions: string[] }[] = [];

  let totalDuration = 0;
  let totalMessages = 0;
  let totalFiles = 0;
  let successfulSessions = 0;

  const sessionsToAnalyze = sessions.slice(0, limit);
  
  for (let i = 0; i < sessionsToAnalyze.length; i++) {
    const session = sessionsToAnalyze[i];
    process.stdout.write(`\r${c.dim}Analyzing session ${i + 1}/${sessionsToAnalyze.length}...${c.reset}`);
    
    const analysis = analyzeSession(session);
    analyses.push(analysis);

    // Aggregate metrics
    totalDuration += analysis.duration;
    totalMessages += analysis.messageCount;
    totalFiles += analysis.filesModified.length;
    if (analysis.success) successfulSessions++;

    // Track tool success rates
    for (const [tool, count] of Object.entries(analysis.toolUsage)) {
      if (!toolSuccessCount[tool]) {
        toolSuccessCount[tool] = { success: 0, total: 0 };
      }
      toolSuccessCount[tool].total += count;
      if (analysis.success) {
        toolSuccessCount[tool].success += count;
      }
    }

    // Aggregate errors
    for (const error of analysis.errorPatterns) {
      const existing = allErrors.find((e) => e.error === error);
      if (existing) {
        existing.sessions.push(session.id);
      } else {
        allErrors.push({ error, sessions: [session.id] });
      }
    }

    // Aggregate learnings
    for (const learning of analysis.learnings) {
      const existing = allLearnings.find((l) => l.text === learning);
      if (existing) {
        existing.sessions.push(session.id);
      } else {
        allLearnings.push({ text: learning, sessions: [session.id] });
      }
    }
  }

  console.log("\n");

  // Build patterns
  const successfulTools = Object.entries(toolSuccessCount)
    .map(([tool, counts]) => ({
      tool,
      successRate: counts.total > 0 ? counts.success / counts.total : 0,
      count: counts.total,
    }))
    .filter((t) => t.count >= 5)
    .sort((a, b) => b.successRate - a.successRate);

  const commonErrors = allErrors
    .sort((a, b) => b.sessions.length - a.sessions.length)
    .slice(0, 10);

  const toolEfficiency = Object.entries(toolSuccessCount)
    .map(([tool, counts]) => ({
      tool,
      avgUsagePerSession: counts.total / sessionsToAnalyze.length,
      inSuccessfulSessions: counts.success,
    }))
    .sort((a, b) => b.avgUsagePerSession - a.avgUsagePerSession);

  // Generate learnings summary
  const whatWorked: string[] = [];
  const whatFailed: string[] = [];
  const recommendations: string[] = [];

  // What worked - tools with high success rates
  for (const tool of successfulTools.slice(0, 5)) {
    if (tool.successRate > 0.7) {
      whatWorked.push(`${tool.tool} has ${Math.round(tool.successRate * 100)}% success rate (${tool.count} uses)`);
    }
  }

  // What failed - common errors
  for (const error of commonErrors.slice(0, 5)) {
    if (error.sessions.length > 1) {
      whatFailed.push(`"${error.error.slice(0, 60)}..." occurred in ${error.sessions.length} sessions`);
    }
  }

  // Recommendations
  if (successfulSessions / sessionsToAnalyze.length < 0.7) {
    recommendations.push("Session success rate is low - consider reviewing error patterns");
  }
  
  const avgMessages = totalMessages / sessionsToAnalyze.length;
  if (avgMessages > 50) {
    recommendations.push("High message count per session - consider breaking tasks into smaller chunks");
  }
  
  if (commonErrors.length > 5) {
    recommendations.push("Many recurring errors - create documentation for common issues");
  }

  // Add top learnings
  const topLearnings = allLearnings
    .filter((l) => l.sessions.length > 1)
    .slice(0, 5)
    .map((l) => l.text);

  return {
    generatedAt: new Date().toISOString(),
    sessionsAnalyzed: sessionsToAnalyze.length,
    totalDuration,
    patterns: {
      successfulTools,
      commonErrors: commonErrors.map((e) => ({ error: e.error, count: e.sessions.length, sessions: e.sessions })),
      productivityMetrics: {
        avgMessagesPerSession: avgMessages,
        avgDuration: totalDuration / sessionsToAnalyze.length,
        avgFilesModified: totalFiles / sessionsToAnalyze.length,
        completionRate: successfulSessions / sessionsToAnalyze.length,
      },
      toolEfficiency,
    },
    learnings: {
      whatWorked: [...whatWorked, ...topLearnings.slice(0, 3)],
      whatFailed,
      recommendations,
    },
    sessionAnalyses: analyses,
  };
}

function updateKnowledgeBase(report: AnalyticsReport): void {
  let kb = readJson<any[]>(KNOWLEDGE_BASE_PATH) || [];

  // Add new insights to knowledge base
  const newInsight = {
    session_id: `analytics_${Date.now()}`,
    timestamp: Date.now(),
    type: "analytics_report",
    messages: report.sessionsAnalyzed,
    decisions: report.learnings.recommendations,
    discoveries: report.learnings.whatFailed,
    code_created: [],
    problems_solved: report.learnings.whatWorked,
    key_insights: [
      `Completion rate: ${Math.round(report.patterns.productivityMetrics.completionRate * 100)}%`,
      `Avg messages/session: ${Math.round(report.patterns.productivityMetrics.avgMessagesPerSession)}`,
      `Top tools: ${report.patterns.successfulTools.slice(0, 3).map((t) => t.tool).join(", ")}`,
    ],
    techniques: report.patterns.toolEfficiency.slice(0, 5).map((t) => `${t.tool}: ${t.avgUsagePerSession.toFixed(1)}/session`),
    solutions: report.learnings.whatWorked.slice(0, 3),
  };

  kb.unshift(newInsight);
  
  // Keep only last 100 entries
  kb = kb.slice(0, 100);
  
  writeJson(KNOWLEDGE_BASE_PATH, kb);
  console.log(`${c.green}Updated knowledge base with analytics insights${c.reset}`);
}

// Commands
async function cmdAnalyze(limit: number = 50) {
  console.log(`${c.bold}${c.cyan}Session Analytics${c.reset}\n`);

  if (!existsSync(OPENCODE_STORAGE)) {
    console.log(`${c.red}OpenCode storage not found at: ${OPENCODE_STORAGE}${c.reset}`);
    return;
  }

  const sessions = getAllSessions();
  if (sessions.length === 0) {
    console.log(`${c.dim}No sessions found${c.reset}`);
    return;
  }

  const report = generateReport(sessions, limit);

  // Save cache
  writeJson(ANALYTICS_CACHE_PATH, report);

  // Update knowledge base
  updateKnowledgeBase(report);

  // Display summary
  console.log(`${c.bold}Analysis Complete${c.reset}`);
  console.log(`${c.cyan}Sessions analyzed:${c.reset} ${report.sessionsAnalyzed}`);
  console.log(`${c.cyan}Success rate:${c.reset} ${Math.round(report.patterns.productivityMetrics.completionRate * 100)}%`);
  console.log(`${c.cyan}Avg messages/session:${c.reset} ${Math.round(report.patterns.productivityMetrics.avgMessagesPerSession)}`);
  console.log(`${c.cyan}Patterns discovered:${c.reset} ${report.patterns.successfulTools.length} tool patterns, ${report.patterns.commonErrors.length} error patterns`);
  console.log(`${c.cyan}Learnings extracted:${c.reset} ${report.learnings.whatWorked.length}`);
  console.log(`\n${c.dim}Full report saved to ${ANALYTICS_CACHE_PATH}${c.reset}`);
}

async function cmdPatterns() {
  console.log(`${c.bold}${c.cyan}Discovered Patterns${c.reset}\n`);

  const report = readJson<AnalyticsReport>(ANALYTICS_CACHE_PATH);
  if (!report) {
    console.log(`${c.yellow}No analytics data. Run 'analyze' first.${c.reset}`);
    return;
  }

  // Tool success patterns
  console.log(`${c.bold}Tool Success Rates:${c.reset}`);
  for (const tool of report.patterns.successfulTools.slice(0, 10)) {
    const bar = "█".repeat(Math.round(tool.successRate * 20));
    const color = tool.successRate > 0.7 ? c.green : tool.successRate > 0.5 ? c.yellow : c.red;
    console.log(`  ${tool.tool.padEnd(30)} ${color}${bar}${c.reset} ${Math.round(tool.successRate * 100)}% (${tool.count})`);
  }

  console.log(`\n${c.bold}Tool Efficiency (avg uses/session):${c.reset}`);
  for (const tool of report.patterns.toolEfficiency.slice(0, 10)) {
    const bar = "█".repeat(Math.min(20, Math.round(tool.avgUsagePerSession * 2)));
    console.log(`  ${tool.tool.padEnd(30)} ${c.cyan}${bar}${c.reset} ${tool.avgUsagePerSession.toFixed(1)}`);
  }

  console.log(`\n${c.bold}Common Errors:${c.reset}`);
  for (const error of report.patterns.commonErrors.slice(0, 5)) {
    console.log(`  ${c.red}●${c.reset} (${error.count}x) ${error.error.slice(0, 70)}...`);
  }

  console.log(`\n${c.bold}Productivity Metrics:${c.reset}`);
  const pm = report.patterns.productivityMetrics;
  console.log(`  ${c.cyan}Completion Rate:${c.reset} ${Math.round(pm.completionRate * 100)}%`);
  console.log(`  ${c.cyan}Avg Messages:${c.reset} ${Math.round(pm.avgMessagesPerSession)}/session`);
  console.log(`  ${c.cyan}Avg Duration:${c.reset} ${Math.round(pm.avgDuration / 60000)}min/session`);
  console.log(`  ${c.cyan}Avg Files Modified:${c.reset} ${pm.avgFilesModified.toFixed(1)}/session`);
}

async function cmdLearnings() {
  console.log(`${c.bold}${c.cyan}Extracted Learnings${c.reset}\n`);

  const report = readJson<AnalyticsReport>(ANALYTICS_CACHE_PATH);
  if (!report) {
    console.log(`${c.yellow}No analytics data. Run 'analyze' first.${c.reset}`);
    return;
  }

  console.log(`${c.bold}${c.green}What Worked Well:${c.reset}`);
  for (const item of report.learnings.whatWorked) {
    console.log(`  ${c.green}✓${c.reset} ${item}`);
  }

  console.log(`\n${c.bold}${c.red}What Went Wrong:${c.reset}`);
  for (const item of report.learnings.whatFailed) {
    console.log(`  ${c.red}✗${c.reset} ${item}`);
  }

  // Show session-level learnings
  console.log(`\n${c.bold}Session-Level Insights:${c.reset}`);
  const sessionsWithLearnings = report.sessionAnalyses
    .filter((s) => s.learnings.length > 0)
    .slice(0, 5);

  for (const session of sessionsWithLearnings) {
    console.log(`\n  ${c.cyan}${session.title.slice(0, 50)}${c.reset} (${session.sessionId.slice(0, 15)}...)`);
    for (const learning of session.learnings) {
      console.log(`    ${c.dim}•${c.reset} ${learning.slice(0, 80)}...`);
    }
  }
}

async function cmdRecommendations() {
  console.log(`${c.bold}${c.cyan}Improvement Recommendations${c.reset}\n`);

  const report = readJson<AnalyticsReport>(ANALYTICS_CACHE_PATH);
  if (!report) {
    console.log(`${c.yellow}No analytics data. Run 'analyze' first.${c.reset}`);
    return;
  }

  console.log(`${c.bold}Based on analysis of ${report.sessionsAnalyzed} sessions:${c.reset}\n`);

  // Built-in recommendations
  for (let i = 0; i < report.learnings.recommendations.length; i++) {
    console.log(`${c.yellow}${i + 1}.${c.reset} ${report.learnings.recommendations[i]}`);
  }

  // Generate additional recommendations based on data
  const pm = report.patterns.productivityMetrics;
  let recNum = report.learnings.recommendations.length + 1;

  if (pm.completionRate < 0.8) {
    console.log(`\n${c.yellow}${recNum++}.${c.reset} Session success rate (${Math.round(pm.completionRate * 100)}%) is below 80%`);
    console.log(`   ${c.dim}Consider: Review failed sessions for common patterns${c.reset}`);
  }

  // Find underutilized but successful tools
  const underutilized = report.patterns.successfulTools
    .filter((t) => t.successRate > 0.8 && t.count < 20)
    .slice(0, 3);
  
  if (underutilized.length > 0) {
    console.log(`\n${c.yellow}${recNum++}.${c.reset} High-success tools that could be used more:`);
    for (const tool of underutilized) {
      console.log(`   ${c.dim}• ${tool.tool} (${Math.round(tool.successRate * 100)}% success, only ${tool.count} uses)${c.reset}`);
    }
  }

  // Identify error patterns to fix
  const frequentErrors = report.patterns.commonErrors.filter((e) => e.count >= 3);
  if (frequentErrors.length > 0) {
    console.log(`\n${c.yellow}${recNum++}.${c.reset} Recurring errors need documentation/fixes:`);
    for (const error of frequentErrors.slice(0, 3)) {
      console.log(`   ${c.dim}• "${error.error.slice(0, 50)}..." (${error.count} occurrences)${c.reset}`);
    }
  }

  // Quality improvement suggestions
  const lowQualitySessions = report.sessionAnalyses.filter((s) => s.quality < 5);
  if (lowQualitySessions.length > report.sessionsAnalyzed * 0.3) {
    console.log(`\n${c.yellow}${recNum++}.${c.reset} ${Math.round(lowQualitySessions.length / report.sessionsAnalyzed * 100)}% of sessions have low quality scores`);
    console.log(`   ${c.dim}Consider: More thorough planning before starting tasks${c.reset}`);
  }
}

async function cmdReport() {
  console.log(`${c.bold}${c.cyan}Full Analytics Report${c.reset}\n`);
  console.log(`${c.dim}${"=".repeat(60)}${c.reset}\n`);

  await cmdAnalyze(100);
  console.log(`\n${c.dim}${"─".repeat(60)}${c.reset}\n`);
  
  await cmdPatterns();
  console.log(`\n${c.dim}${"─".repeat(60)}${c.reset}\n`);
  
  await cmdLearnings();
  console.log(`\n${c.dim}${"─".repeat(60)}${c.reset}\n`);
  
  await cmdRecommendations();
  
  console.log(`\n${c.dim}${"=".repeat(60)}${c.reset}`);
  console.log(`${c.green}Report complete. Data saved to:${c.reset}`);
  console.log(`  ${c.dim}Analytics: ${ANALYTICS_CACHE_PATH}${c.reset}`);
  console.log(`  ${c.dim}Knowledge: ${KNOWLEDGE_BASE_PATH}${c.reset}`);
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "analyze";

  switch (command) {
    case "analyze":
      await cmdAnalyze(parseInt(args[1]) || 50);
      break;

    case "patterns":
      await cmdPatterns();
      break;

    case "learnings":
      await cmdLearnings();
      break;

    case "recommendations":
    case "recommend":
      await cmdRecommendations();
      break;

    case "report":
      await cmdReport();
      break;

    case "help":
    case "--help":
    case "-h":
      console.log(`
${c.bold}Session Analytics Tool${c.reset}

Analyzes OpenCode sessions to extract patterns, learnings, and recommendations.

${c.cyan}Commands:${c.reset}
  analyze [limit]     Analyze sessions and extract insights (default: 50)
  patterns           Show discovered patterns
  learnings          Extract and display learnings
  recommendations    Generate improvement suggestions
  report             Full analytics report (runs all commands)

${c.cyan}Examples:${c.reset}
  bun tools/session-analytics.ts analyze
  bun tools/session-analytics.ts patterns
  bun tools/session-analytics.ts recommendations
  bun tools/session-analytics.ts report
`);
      break;

    default:
      console.log(`${c.red}Unknown command: ${command}${c.reset}`);
      console.log(`${c.dim}Run with --help for usage information${c.reset}`);
      process.exit(1);
  }
}

main().catch(console.error);
