#!/usr/bin/env bun
/**
 * Session Summarizer
 * 
 * Automatically summarizes completed sessions, extracting:
 * - Key learnings and decisions
 * - Code changes and artifacts
 * - Tasks completed
 * - Quality metrics
 * 
 * Feeds summaries into the knowledge base for better context in future sessions.
 * 
 * Usage:
 *   bun tools/session-summarizer.ts summarize [session-id]   # Summarize a session
 *   bun tools/session-summarizer.ts recent [count]           # Summarize recent sessions
 *   bun tools/session-summarizer.ts export                   # Export all summaries
 *   bun tools/session-summarizer.ts stats                    # Show summary statistics
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join } from "path";
import { readJson, readJsonl, c, PATHS, MEMORY_DIR, SESSIONS_DIR } from "./shared";

// OpenCode session storage
const OPENCODE_STORAGE = join(process.env.HOME || "/root", ".local/share/opencode/storage");
const OPENCODE_MESSAGES = join(OPENCODE_STORAGE, "message");
const OPENCODE_PARTS = join(OPENCODE_STORAGE, "part");

interface SessionSummary {
  session_id: string;
  session_number: number;
  start_time: string;
  end_time?: string;
  duration_minutes: number;
  tool_calls: number;
  files_edited: string[];
  tasks_completed: string[];
  key_learnings: string[];
  code_changes: { file: string; type: "created" | "modified" }[];
  quality_scores: { task: string; score: number }[];
  agent_role?: string;
  summary_text: string;
  extracted_at: string;
}

interface SummaryStore {
  summaries: SessionSummary[];
  last_processed_session: string;
  total_sessions: number;
  stats: {
    total_tool_calls: number;
    total_files_edited: number;
    total_tasks_completed: number;
    avg_session_duration_min: number;
    avg_quality_score: number;
  };
}

/**
 * Get OpenCode session IDs from storage
 */
function getOpenCodeSessions(): string[] {
  if (!existsSync(OPENCODE_MESSAGES)) {
    return [];
  }
  return readdirSync(OPENCODE_MESSAGES)
    .filter((name) => name.startsWith("ses_"))
    .sort();
}

/**
 * Read message parts from OpenCode storage
 */
function readMessageParts(msgId: string): any[] {
  const partDir = join(OPENCODE_PARTS, msgId);
  if (!existsSync(partDir)) return [];

  const parts: any[] = [];
  const partFiles = readdirSync(partDir);

  for (const partFile of partFiles) {
    try {
      const part = JSON.parse(readFileSync(join(partDir, partFile), "utf-8"));
      parts.push(part);
    } catch {}
  }
  return parts;
}

/**
 * Extract key learnings from text content
 * Enhanced with better pattern matching for decisions, insights, and solutions
 */
function extractLearnings(text: string): string[] {
  const learnings: string[] = [];
  
  // Expanded patterns for better extraction
  const patterns = [
    // Original patterns (slightly improved)
    /(?:learned|discovered|realized|found out|key insight|important:)\s*(?:that\s+)?([^.!?\n]{20,200}[.!?]?)/gi,
    /(?:the (?:solution|fix|answer|approach|trick) (?:is|was) (?:to\s+)?([^.!?\n]{20,200}[.!?]?))/gi,
    /(?:this works because)\s+([^.!?\n]{20,200}[.!?]?)/gi,
    /(?:successfully (?:implemented|created|fixed|built|added|enhanced))\s+([^.!?\n]{20,150}[.!?]?)/gi,
    
    // Decision patterns
    /(?:decided to|chose to|opted for|went with)\s+([^.!?\n]{15,150}[.!?]?)/gi,
    /(?:the best approach is|better to|should use)\s+([^.!?\n]{15,150}[.!?]?)/gi,
    
    // Problem/solution patterns
    /(?:the issue was|problem was|root cause|turned out)\s+([^.!?\n]{20,200}[.!?]?)/gi,
    /(?:fixed by|solved by|resolved by|addressed by)\s+([^.!?\n]{15,150}[.!?]?)/gi,
    
    // Technical insight patterns
    /(?:note:?|takeaway:?|reminder:?)\s+([^.!?\n]{15,200}[.!?]?)/gi,
    /(?:for future reference|remember that|don't forget)\s+([^.!?\n]{15,200}[.!?]?)/gi,
    
    // Implementation patterns
    /(?:implemented|created|built|added|enhanced)\s+(?:a |an |the )?([^.!?\n]{15,150}[.!?]?)/gi,
    /(?:now we have|this adds|this enables|this provides)\s+([^.!?\n]{20,150}[.!?]?)/gi,
    
    // Quality observations
    /(?:quality score|rated|assessed at)\s+([^.!?\n]{10,100}[.!?]?)/gi,
    /(?:improved|optimized|refactored|enhanced)\s+([^.!?\n]{15,150}[.!?]?)/gi,
  ];

  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const learning = (match[1] || "").trim();
      // Filter out very short or overly long matches
      if (learning.length >= 15 && learning.length <= 250) {
        // Clean up common artifacts
        const cleaned = learning
          .replace(/^(that|to|the|a|an)\s+/i, "")
          .replace(/\s+/g, " ")
          .trim();
        if (cleaned.length >= 10) {
          learnings.push(cleaned);
        }
      }
    }
  }

  // Deduplicate and limit
  const unique = [...new Set(learnings)];
  
  // Sort by length (prefer more detailed learnings)
  unique.sort((a, b) => b.length - a.length);
  
  return unique.slice(0, 8);
}

/**
 * Extract code changes from tool calls
 */
function extractCodeChanges(parts: any[]): { file: string; type: "created" | "modified" }[] {
  const changes: { file: string; type: "created" | "modified" }[] = [];

  for (const part of parts) {
    if (part.type === "tool" && part.state?.input?.filePath) {
      const filePath = part.state.input.filePath;
      if (filePath.startsWith("/app/workspace/")) {
        const relativePath = filePath.replace("/app/workspace/", "");
        const type = part.tool === "write" ? "created" : "modified";
        if (!changes.some((c) => c.file === relativePath)) {
          changes.push({ file: relativePath, type });
        }
      }
    }
  }

  return changes;
}

/**
 * Get session events from our sessions.jsonl
 */
function getSessionEvents(sessionId: string): any[] {
  const events = readJsonl<any>(PATHS.sessions);
  return events.filter((e: any) => e.session_id === sessionId);
}

/**
 * Get tasks completed during a session timeframe
 */
function getTasksCompleted(startTime: Date, endTime: Date): string[] {
  const tasks = readJson<any>(PATHS.tasks, { tasks: [] });
  
  return (tasks.tasks || [])
    .filter((t: any) => {
      if (t.status !== "completed") return false;
      const completedAt = t.completed_at ? new Date(t.completed_at) : null;
      if (!completedAt) return false;
      return completedAt >= startTime && completedAt <= endTime;
    })
    .map((t: any) => t.title);
}

/**
 * Get quality assessments during a session timeframe
 */
function getQualityScores(startTime: Date, endTime: Date): { task: string; score: number }[] {
  const quality = readJson<any>(PATHS.qualityAssessments, { assessments: [] });
  
  return (quality.assessments || [])
    .filter((a: any) => {
      const assessedAt = new Date(a.assessed_at);
      return assessedAt >= startTime && assessedAt <= endTime;
    })
    .map((a: any) => ({
      task: a.task_id,
      score: a.overall_score,
    }));
}

/**
 * Summarize a single OpenCode session
 */
async function summarizeSession(sessionId: string, sessionNumber: number): Promise<SessionSummary | null> {
  const sessionDir = join(OPENCODE_MESSAGES, sessionId);
  
  if (!existsSync(sessionDir)) {
    console.log(`${c.dim}Session ${sessionId} not found in OpenCode storage${c.reset}`);
    return null;
  }

  // Read all messages in this session
  const msgFiles = readdirSync(sessionDir)
    .filter((f) => f.startsWith("msg_"))
    .sort();

  if (msgFiles.length === 0) {
    return null;
  }

  let startTime: Date | null = null;
  let endTime: Date | null = null;
  let toolCalls = 0;
  const filesEdited: string[] = [];
  const learnings: string[] = [];
  const codeChanges: { file: string; type: "created" | "modified" }[] = [];
  let agentRole: string | undefined;

  // Process each message
  for (const msgFile of msgFiles) {
    const msgId = msgFile.replace(".json", "");
    const msgPath = join(sessionDir, msgFile);
    
    try {
      const msg = JSON.parse(readFileSync(msgPath, "utf-8"));
      
      // Track timestamps
      if (msg.time?.created) {
        const timestamp = new Date(msg.time.created);
        if (!startTime || timestamp < startTime) startTime = timestamp;
        if (!endTime || timestamp > endTime) endTime = timestamp;
      }

      // Get message parts
      const parts = readMessageParts(msgId);

      for (const part of parts) {
        // Count tool calls
        if (part.type === "tool") {
          toolCalls++;
          
          // Track file edits
          if (part.state?.input?.filePath) {
            const filePath = part.state.input.filePath;
            if (filePath.startsWith("/app/workspace/")) {
              const relativePath = filePath.replace("/app/workspace/", "");
              if (!filesEdited.includes(relativePath)) {
                filesEdited.push(relativePath);
              }
            }
          }

          // Check for agent_register to get role
          if (part.tool === "agent_register" && part.state?.input?.role) {
            agentRole = part.state.input.role;
          }
        }

        // Extract learnings from assistant text
        if (msg.role === "assistant" && part.text) {
          learnings.push(...extractLearnings(part.text));
        }
      }

      // Extract code changes
      codeChanges.push(...extractCodeChanges(parts));
    } catch (e) {
      // Skip malformed messages
    }
  }

  if (!startTime || !endTime) {
    return null;
  }

  // Get tasks completed during this session
  const tasksCompleted = getTasksCompleted(startTime, endTime);
  
  // Get quality scores during this session
  const qualityScores = getQualityScores(startTime, endTime);

  // Calculate duration
  const durationMs = endTime.getTime() - startTime.getTime();
  const durationMinutes = Math.round(durationMs / 60000);

  // Generate summary text
  const summaryParts: string[] = [];
  
  if (agentRole) {
    summaryParts.push(`Agent role: ${agentRole}`);
  }
  
  if (tasksCompleted.length > 0) {
    summaryParts.push(`Completed ${tasksCompleted.length} task(s): ${tasksCompleted.slice(0, 3).join(", ")}`);
  }
  
  if (codeChanges.length > 0) {
    summaryParts.push(`Modified ${codeChanges.length} file(s)`);
  }
  
  if (qualityScores.length > 0) {
    const avgScore = qualityScores.reduce((sum, q) => sum + q.score, 0) / qualityScores.length;
    summaryParts.push(`Quality: ${avgScore.toFixed(1)}/10`);
  }

  const summary: SessionSummary = {
    session_id: sessionId,
    session_number: sessionNumber,
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    duration_minutes: durationMinutes,
    tool_calls: toolCalls,
    files_edited: filesEdited.slice(0, 20),
    tasks_completed: tasksCompleted,
    key_learnings: [...new Set(learnings)].slice(0, 5),
    code_changes: codeChanges.slice(0, 20),
    quality_scores: qualityScores,
    agent_role: agentRole,
    summary_text: summaryParts.join(". ") || "Session with no notable outcomes",
    extracted_at: new Date().toISOString(),
  };

  return summary;
}

/**
 * Load existing summaries
 */
function loadSummaries(): SummaryStore {
  return readJson<SummaryStore>(PATHS.sessionSummaries, {
    summaries: [],
    last_processed_session: "",
    total_sessions: 0,
    stats: {
      total_tool_calls: 0,
      total_files_edited: 0,
      total_tasks_completed: 0,
      avg_session_duration_min: 0,
      avg_quality_score: 0,
    },
  });
}

/**
 * Save summaries
 */
function saveSummaries(store: SummaryStore): void {
  // Update stats
  const summaries = store.summaries;
  if (summaries.length > 0) {
    store.stats.total_tool_calls = summaries.reduce((sum, s) => sum + s.tool_calls, 0);
    store.stats.total_files_edited = summaries.reduce((sum, s) => sum + s.files_edited.length, 0);
    store.stats.total_tasks_completed = summaries.reduce((sum, s) => sum + s.tasks_completed.length, 0);
    store.stats.avg_session_duration_min = 
      Math.round(summaries.reduce((sum, s) => sum + s.duration_minutes, 0) / summaries.length);
    
    const allScores = summaries.flatMap((s) => s.quality_scores.map((q) => q.score));
    store.stats.avg_quality_score = 
      allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;
  }
  
  store.total_sessions = summaries.length;
  
  writeFileSync(PATHS.sessionSummaries, JSON.stringify(store, null, 2));
}

/**
 * Feed learnings into knowledge base
 */
function feedToKnowledgeBase(summary: SessionSummary): void {
  const knowledge = readJson<any[]>(PATHS.knowledgeBase, []);
  
  // Find or create entry for this session
  let entry = knowledge.find((k) => k.session_id === summary.session_id);
  
  if (!entry) {
    entry = {
      session_id: summary.session_id,
      timestamp: new Date(summary.start_time).getTime(),
      messages: 0,
      decisions: [],
      discoveries: [],
      code_created: [],
      problems_solved: [],
      key_insights: [],
      techniques: [],
      solutions: [],
    };
    knowledge.push(entry);
  }
  
  // Add learnings as discoveries/insights
  for (const learning of summary.key_learnings) {
    if (!entry.discoveries.includes(learning) && !entry.key_insights.includes(learning)) {
      entry.key_insights.push(learning);
    }
  }
  
  // Add code changes
  for (const change of summary.code_changes) {
    if (!entry.code_created.includes(change.file)) {
      entry.code_created.push(change.file);
    }
  }
  
  // Add tasks as problems solved
  for (const task of summary.tasks_completed) {
    if (!entry.problems_solved.includes(task)) {
      entry.problems_solved.push(task);
    }
  }
  
  writeFileSync(PATHS.knowledgeBase, JSON.stringify(knowledge, null, 2));
}

// Command handlers
async function handleSummarize(sessionId?: string): Promise<void> {
  const store = loadSummaries();
  const state = readJson<any>(PATHS.state, { session_count: 0 });
  
  if (sessionId) {
    // Summarize specific session
    console.log(`\n${c.cyan}Summarizing session: ${sessionId}${c.reset}\n`);
    
    const summary = await summarizeSession(sessionId, state.session_count || 1);
    
    if (summary) {
      // Check if already exists
      const existingIdx = store.summaries.findIndex((s) => s.session_id === sessionId);
      if (existingIdx >= 0) {
        store.summaries[existingIdx] = summary;
        console.log(`${c.yellow}Updated existing summary${c.reset}`);
      } else {
        store.summaries.push(summary);
        console.log(`${c.green}Created new summary${c.reset}`);
      }
      
      store.last_processed_session = sessionId;
      saveSummaries(store);
      feedToKnowledgeBase(summary);
      
      printSummary(summary);
    } else {
      console.log(`${c.red}Failed to summarize session${c.reset}`);
    }
  } else {
    // Find sessions to summarize
    const sessions = getOpenCodeSessions();
    const processed = new Set(store.summaries.map((s) => s.session_id));
    const unprocessed = sessions.filter((s) => !processed.has(s));
    
    if (unprocessed.length === 0) {
      console.log(`${c.green}All ${sessions.length} sessions already summarized${c.reset}`);
      return;
    }
    
    console.log(`\n${c.cyan}Summarizing ${unprocessed.length} new session(s)...${c.reset}\n`);
    
    let count = 0;
    for (const sid of unprocessed) {
      process.stdout.write(`Processing ${sid}... `);
      
      const sessionNum = sessions.indexOf(sid) + 1;
      const summary = await summarizeSession(sid, sessionNum);
      
      if (summary) {
        store.summaries.push(summary);
        feedToKnowledgeBase(summary);
        console.log(`${c.green}done${c.reset} (${summary.tool_calls} tools, ${summary.duration_minutes}m)`);
        count++;
      } else {
        console.log(`${c.dim}skipped${c.reset}`);
      }
    }
    
    store.last_processed_session = unprocessed[unprocessed.length - 1];
    saveSummaries(store);
    
    console.log(`\n${c.green}Summarized ${count} session(s)${c.reset}`);
  }
}

async function handleRecent(countStr?: string): Promise<void> {
  const count = parseInt(countStr || "5", 10);
  const store = loadSummaries();
  
  const recent = store.summaries.slice(-count).reverse();
  
  console.log(`\n${c.bright}${c.cyan}RECENT SESSIONS${c.reset} ${c.dim}(last ${count})${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(70)}${c.reset}\n`);
  
  if (recent.length === 0) {
    console.log(`${c.dim}No sessions summarized yet. Run: bun tools/session-summarizer.ts summarize${c.reset}\n`);
    return;
  }
  
  for (const summary of recent) {
    printSummary(summary, true);
    console.log(`${c.dim}${"─".repeat(70)}${c.reset}\n`);
  }
}

function handleStats(): void {
  const store = loadSummaries();
  
  console.log(`\n${c.bright}${c.blue}SESSION STATISTICS${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(50)}${c.reset}\n`);
  
  console.log(`${c.cyan}Total Sessions:${c.reset}       ${c.bright}${store.total_sessions}${c.reset}`);
  console.log(`${c.cyan}Total Tool Calls:${c.reset}     ${c.bright}${store.stats.total_tool_calls}${c.reset}`);
  console.log(`${c.cyan}Total Files Edited:${c.reset}   ${c.bright}${store.stats.total_files_edited}${c.reset}`);
  console.log(`${c.cyan}Total Tasks Done:${c.reset}     ${c.bright}${store.stats.total_tasks_completed}${c.reset}`);
  console.log(`${c.cyan}Avg Session Length:${c.reset}   ${c.bright}${store.stats.avg_session_duration_min}${c.reset} min`);
  console.log(`${c.cyan}Avg Quality Score:${c.reset}    ${c.bright}${store.stats.avg_quality_score.toFixed(1)}${c.reset}/10`);
  
  // Top files edited
  const filesCounts = new Map<string, number>();
  for (const s of store.summaries) {
    for (const f of s.files_edited) {
      filesCounts.set(f, (filesCounts.get(f) || 0) + 1);
    }
  }
  
  const topFiles = [...filesCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  if (topFiles.length > 0) {
    console.log(`\n${c.bright}Most Edited Files:${c.reset}`);
    for (const [file, count] of topFiles) {
      console.log(`  ${c.yellow}${count}x${c.reset} ${file}`);
    }
  }
  
  // Top learnings
  const allLearnings = store.summaries.flatMap((s) => s.key_learnings);
  if (allLearnings.length > 0) {
    console.log(`\n${c.bright}Recent Learnings:${c.reset}`);
    for (const learning of allLearnings.slice(-5)) {
      console.log(`  ${c.dim}-${c.reset} ${learning.slice(0, 80)}...`);
    }
  }
  
  console.log();
}

function handleExport(): void {
  const store = loadSummaries();
  console.log(JSON.stringify(store, null, 2));
}

function printSummary(summary: SessionSummary, compact: boolean = false): void {
  const roleTag = summary.agent_role ? `[${summary.agent_role}] ` : "";
  
  console.log(
    `${c.bright}Session ${summary.session_number}${c.reset} ${roleTag}` +
    `${c.dim}(${summary.session_id})${c.reset}`
  );
  console.log(
    `  ${c.cyan}Duration:${c.reset} ${summary.duration_minutes}m | ` +
    `${c.cyan}Tools:${c.reset} ${summary.tool_calls} | ` +
    `${c.cyan}Files:${c.reset} ${summary.files_edited.length}`
  );
  
  if (summary.tasks_completed.length > 0) {
    console.log(`  ${c.green}Tasks:${c.reset} ${summary.tasks_completed.join(", ")}`);
  }
  
  if (summary.quality_scores.length > 0) {
    const avg = summary.quality_scores.reduce((sum, q) => sum + q.score, 0) / summary.quality_scores.length;
    console.log(`  ${c.yellow}Quality:${c.reset} ${avg.toFixed(1)}/10`);
  }
  
  if (!compact && summary.key_learnings.length > 0) {
    console.log(`  ${c.magenta}Learnings:${c.reset}`);
    for (const learning of summary.key_learnings.slice(0, 3)) {
      console.log(`    - ${learning.slice(0, 70)}${learning.length > 70 ? "..." : ""}`);
    }
  }
  
  if (!compact && summary.code_changes.length > 0) {
    console.log(`  ${c.blue}Code Changes:${c.reset}`);
    for (const change of summary.code_changes.slice(0, 5)) {
      const icon = change.type === "created" ? "+" : "~";
      console.log(`    ${icon} ${change.file}`);
    }
  }
  
  console.log();
}

// Quiet version for auto-summarization (used by plugin hooks)
async function handleSummarizeQuiet(sessionId?: string): Promise<void> {
  if (!sessionId) return;
  
  try {
    const store = loadSummaries();
    const state = readJson<any>(PATHS.state, { session_count: 0 });
    
    const summary = await summarizeSession(sessionId, state.session_count || 1);
    
    if (summary) {
      // Check if already exists
      const existingIdx = store.summaries.findIndex((s) => s.session_id === sessionId);
      if (existingIdx >= 0) {
        store.summaries[existingIdx] = summary;
      } else {
        store.summaries.push(summary);
      }
      
      store.last_processed_session = sessionId;
      saveSummaries(store);
      feedToKnowledgeBase(summary);
      
      // Log success but minimal output
      console.log(`[SessionSummarizer] Summarized ${sessionId}: ${summary.tool_calls} calls, ${summary.key_learnings.length} learnings`);
    }
  } catch (error) {
    console.error(`[SessionSummarizer] Error summarizing ${sessionId}:`, error);
  }
}

function showHelp(): void {
  console.log(`
${c.bright}${c.blue}Session Summarizer${c.reset}

Summarize OpenCode sessions and extract knowledge for future context.

${c.cyan}Usage:${c.reset}
  bun tools/session-summarizer.ts <command> [args]

${c.cyan}Commands:${c.reset}
  ${c.bright}summarize${c.reset} [session-id]   Summarize session(s) - all new if no ID given
  ${c.bright}summarize-current${c.reset} <id>   Quiet mode for auto-summarization (plugin use)
  ${c.bright}recent${c.reset} [count]           Show recent session summaries (default: 5)
  ${c.bright}stats${c.reset}                    Show overall statistics
  ${c.bright}export${c.reset}                   Export all summaries as JSON
  ${c.bright}help${c.reset}                     Show this help

${c.cyan}Examples:${c.reset}
  bun tools/session-summarizer.ts summarize
  bun tools/session-summarizer.ts summarize ses_abc123
  bun tools/session-summarizer.ts recent 10
  bun tools/session-summarizer.ts stats

${c.dim}Summaries are saved to: memory/session-summaries.json
Learnings are fed to: memory/knowledge-base.json${c.reset}
`);
}

// CLI routing
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "summarize":
    handleSummarize(args[1]);
    break;
  case "summarize-current":
    // Special handler for auto-summarizing current/just-ended session
    handleSummarizeQuiet(args[1]);
    break;
  case "recent":
    handleRecent(args[1]);
    break;
  case "stats":
    handleStats();
    break;
  case "export":
    handleExport();
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    showHelp();
    break;
  default:
    console.log(`${c.red}Unknown command: ${command}${c.reset}`);
    showHelp();
    process.exit(1);
}
