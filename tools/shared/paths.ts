/**
 * Shared Path Utilities
 * 
 * Centralized path constants and helper functions
 * for consistent file path management across all tools.
 */

import { join } from "path";
import { existsSync, mkdirSync } from "fs";

/**
 * Base workspace directory.
 * Can be overridden with WORKSPACE_DIR environment variable.
 */
export const WORKSPACE_DIR = process.env.WORKSPACE_DIR || "/app/workspace";

/**
 * Memory directory containing all persistent state.
 * Can be overridden with MEMORY_DIR environment variable.
 */
export const MEMORY_DIR = process.env.MEMORY_DIR || join(WORKSPACE_DIR, "memory");

/**
 * Tools directory containing CLI utilities.
 * Can be overridden with TOOLS_DIR environment variable.
 */
export const TOOLS_DIR = process.env.TOOLS_DIR || join(WORKSPACE_DIR, "tools");

/**
 * Plugin directory containing OpenCode plugin code.
 */
export const PLUGIN_DIR = join(WORKSPACE_DIR, ".opencode", "plugin");

/**
 * Sessions directory for per-session state.
 */
export const SESSIONS_DIR = join(MEMORY_DIR, "sessions");

/**
 * Logs directory for debug outputs and terminal captures.
 */
export const LOGS_DIR = process.env.LOGS_DIR || join(WORKSPACE_DIR, "logs");

/**
 * Memory file paths - centralized constants for all memory files.
 */
export const PATHS = {
  // Core state files
  state: join(MEMORY_DIR, "state.json"),
  tasks: join(MEMORY_DIR, "tasks.json"),
  agentRegistry: join(MEMORY_DIR, "agent-registry.json"),
  knowledgeBase: join(MEMORY_DIR, "knowledge-base.json"),
  qualityAssessments: join(MEMORY_DIR, "quality-assessments.json"),
  
  // JSONL log files
  messageBus: join(MEMORY_DIR, "message-bus.jsonl"),
  sessions: join(MEMORY_DIR, "sessions.jsonl"),
  toolTiming: join(MEMORY_DIR, "tool-timing.jsonl"),
  userMessages: join(MEMORY_DIR, "user-messages.jsonl"),
  realtimeLog: join(MEMORY_DIR, "realtime.log"),
  coordinationLog: join(MEMORY_DIR, "coordination.log"),
  
  // Metrics files
  agentHealthMetrics: join(MEMORY_DIR, "agent-health-metrics.json"),
  agentPerformanceMetrics: join(MEMORY_DIR, "agent-performance-metrics.json"),
  metrics: join(MEMORY_DIR, "metrics.json"),
  
  // Working memory
  working: join(MEMORY_DIR, "working.md"),
  sessionSummaries: join(MEMORY_DIR, "session-summaries.json"),
  
  // Lock files
  pluginLock: join(MEMORY_DIR, ".plugin-lock.json"),
  handoffState: join(MEMORY_DIR, ".handoff-state.json"),
  watchdogStatus: join(MEMORY_DIR, ".watchdog-status.json"),
  
  // Debug/logs
  debugLog: join(LOGS_DIR, "debug.log"),
  commandLog: join(LOGS_DIR, "commands.jsonl"),
} as const;

/**
 * Get the full path to a file in the memory directory.
 * 
 * @param filename - Name of the file (without directory)
 * @returns Full path to the file
 * 
 * @example
 * getMemoryPath('tasks.json') // '/app/workspace/memory/tasks.json'
 */
export function getMemoryPath(filename: string): string {
  return join(MEMORY_DIR, filename);
}

/**
 * Get the full path to a session-specific file.
 * Creates the session directory if it doesn't exist.
 * 
 * @param sessionId - Session identifier
 * @param filename - Name of the file (without directory)
 * @returns Full path to the session file
 * 
 * @example
 * getSessionPath('ses_123abc', 'state.json')
 * // '/app/workspace/memory/sessions/ses_123abc/state.json'
 */
export function getSessionPath(sessionId: string, filename: string): string {
  const sessionDir = join(SESSIONS_DIR, sessionId);
  ensureDir(sessionDir);
  return join(sessionDir, filename);
}

/**
 * Get the full path to a tool file.
 * 
 * @param toolName - Name of the tool (with .ts extension)
 * @returns Full path to the tool file
 * 
 * @example
 * getToolPath('task-manager.ts') // '/app/workspace/tools/task-manager.ts'
 */
export function getToolPath(toolName: string): string {
  return join(TOOLS_DIR, toolName);
}

/**
 * Ensure a directory exists, creating it if necessary.
 * 
 * @param dir - Directory path to ensure
 * @returns True if directory exists or was created
 * 
 * @example
 * ensureDir('/app/workspace/memory/sessions/new-session')
 */
export function ensureDir(dir: string): boolean {
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure the memory directory structure exists.
 * Creates memory/ and memory/sessions/ directories if needed.
 */
export function ensureMemoryStructure(): void {
  ensureDir(MEMORY_DIR);
  ensureDir(SESSIONS_DIR);
  ensureDir(LOGS_DIR);
  ensureDir(join(MEMORY_DIR, "working-archives"));
  ensureDir(join(MEMORY_DIR, "message-archives"));
  ensureDir(join(MEMORY_DIR, "critiques"));
  ensureDir(join(MEMORY_DIR, "reports"));
}

/**
 * Get a backup path for a file (adds .backup extension).
 * 
 * @param originalPath - Original file path
 * @returns Backup file path
 * 
 * @example
 * getBackupPath('/app/workspace/memory/tasks.json')
 * // '/app/workspace/memory/tasks.backup.json'
 */
export function getBackupPath(originalPath: string): string {
  const ext = originalPath.match(/\.[^.]+$/)?.[0] || "";
  return originalPath.replace(ext, `.backup${ext}`);
}

/**
 * Get archive path for a file with timestamp.
 * 
 * @param baseName - Base name for the archive
 * @param ext - File extension (default: 'json')
 * @returns Archive file path with timestamp
 * 
 * @example
 * getArchivePath('message-bus', 'jsonl')
 * // '/app/workspace/memory/message-archives/message-bus-2026-01-02.jsonl'
 */
export function getArchivePath(baseName: string, ext: string = "json"): string {
  const date = new Date().toISOString().split("T")[0];
  return join(MEMORY_DIR, "message-archives", `${baseName}-${date}.${ext}`);
}
