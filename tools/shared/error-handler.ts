/**
 * Centralized Error Handling Utilities
 * 
 * Provides typed error classes, structured logging, and JSON recovery
 * for the multi-agent system. Replaces silent error swallowing with
 * proper logging and recovery mechanisms.
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import { MEMORY_DIR, PATHS, getBackupPath, ensureDir } from "./paths";

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error class for the multi-agent system.
 * All custom errors extend this class.
 */
export class AppError extends Error {
  readonly code: string;
  readonly context?: Record<string, unknown>;
  readonly timestamp: string;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.context = context;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

/**
 * Error for JSON parsing failures.
 */
export class JsonParseError extends AppError {
  constructor(path: string, originalError?: unknown) {
    super(
      `Failed to parse JSON from ${path}: ${getErrorMessage(originalError)}`,
      "JSON_PARSE_ERROR",
      { path, originalError: getErrorMessage(originalError) }
    );
    this.name = "JsonParseError";
  }
}

/**
 * Error for file I/O operations.
 */
export class FileIOError extends AppError {
  constructor(operation: "read" | "write" | "delete" | "copy", path: string, originalError?: unknown) {
    super(
      `Failed to ${operation} file ${path}: ${getErrorMessage(originalError)}`,
      "FILE_IO_ERROR",
      { operation, path, originalError: getErrorMessage(originalError) }
    );
    this.name = "FileIOError";
  }
}

/**
 * Error for schema validation failures.
 */
export class ValidationError extends AppError {
  constructor(message: string, issues: string[]) {
    super(message, "VALIDATION_ERROR", { issues });
    this.name = "ValidationError";
  }
}

/**
 * Error for agent coordination issues.
 */
export class AgentError extends AppError {
  constructor(message: string, agentId?: string, context?: Record<string, unknown>) {
    super(message, "AGENT_ERROR", { agentId, ...context });
    this.name = "AgentError";
  }
}

/**
 * Error for task management issues.
 */
export class TaskError extends AppError {
  constructor(message: string, taskId?: string, context?: Record<string, unknown>) {
    super(message, "TASK_ERROR", { taskId, ...context });
    this.name = "TaskError";
  }
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Extract error message from any error type.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

/**
 * Create a structured error context from an error.
 */
export function createErrorContext(error: unknown): {
  message: string;
  name: string;
  code?: string;
  stack?: string;
} {
  if (error instanceof AppError) {
    return {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack,
    };
  }
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }
  return {
    message: String(error),
    name: "UnknownError",
  };
}

// ============================================================================
// Logging
// ============================================================================

type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Log entry structure for structured logging.
 */
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    message: string;
    name: string;
    code?: string;
    stack?: string;
  };
}

/**
 * Format a log entry for file output.
 */
function formatLogEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Append a log entry to the error log file.
 */
function appendToLog(entry: LogEntry): void {
  try {
    const logPath = join(MEMORY_DIR, "error.log");
    const line = formatLogEntry(entry) + "\n";
    const fs = require("fs");
    fs.appendFileSync(logPath, line);
  } catch {
    // Fallback to console if file logging fails
    console.error(`[${entry.level.toUpperCase()}] ${entry.message}`);
  }
}

/**
 * Log an error with context - use this instead of empty catch blocks.
 */
export function logError(
  message: string,
  error?: unknown,
  context?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: "error",
    message,
    context,
  };
  if (error) {
    entry.error = createErrorContext(error);
  }
  appendToLog(entry);
}

/**
 * Log a warning with context.
 */
export function logWarning(
  message: string,
  context?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: "warn",
    message,
    context,
  };
  appendToLog(entry);
}

/**
 * Log debug info (only in debug mode).
 */
export function logDebug(
  message: string,
  context?: Record<string, unknown>
): void {
  if (process.env.DEBUG !== "true") return;
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: "debug",
    message,
    context,
  };
  appendToLog(entry);
}

/**
 * Log info message.
 */
export function logInfo(
  message: string,
  context?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: "info",
    message,
    context,
  };
  appendToLog(entry);
}

// ============================================================================
// JSON Recovery
// ============================================================================

/**
 * Result type for JSON read operations with recovery info.
 */
export interface JsonReadResult<T> {
  data: T;
  source: "file" | "backup" | "default";
  recovered: boolean;
  error?: string;
}

/**
 * Read a JSON file with automatic backup restoration on parse failure.
 * 
 * Flow:
 * 1. Try to read and parse the file
 * 2. If parse fails, try the backup file
 * 3. If backup fails, return the default value
 * 4. Create a backup before returning valid data
 * 
 * @param path - Path to the JSON file
 * @param defaultValue - Value to return if all recovery attempts fail
 * @param options - Options for backup and logging
 * @returns Result with data and source information
 * 
 * @example
 * const result = readJsonSafe('/app/workspace/memory/tasks.json', { tasks: [] });
 * if (result.recovered) {
 *   console.log(`Recovered from ${result.source}`);
 * }
 */
export function readJsonSafe<T>(
  path: string,
  defaultValue: T,
  options: {
    createBackup?: boolean;
    logErrors?: boolean;
  } = {}
): JsonReadResult<T> {
  const { createBackup = true, logErrors = true } = options;
  const backupPath = getBackupPath(path);

  // Try reading the main file
  try {
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8").trim();
      if (content) {
        const data = JSON.parse(content) as T;
        
        // Create backup on successful read
        if (createBackup) {
          try {
            copyFileSync(path, backupPath);
          } catch (e) {
            logDebug("Failed to create backup", { path, error: getErrorMessage(e) });
          }
        }
        
        return { data, source: "file", recovered: false };
      }
    }
  } catch (error) {
    if (logErrors) {
      logWarning("JSON parse failed, attempting backup recovery", {
        path,
        error: getErrorMessage(error),
      });
    }

    // Try reading the backup file
    try {
      if (existsSync(backupPath)) {
        const backupContent = readFileSync(backupPath, "utf-8").trim();
        if (backupContent) {
          const data = JSON.parse(backupContent) as T;
          
          // Restore the backup to the main file
          try {
            writeFileSync(path, JSON.stringify(data, null, 2));
            if (logErrors) {
              logInfo("Restored file from backup", { path, backupPath });
            }
          } catch (e) {
            logWarning("Failed to restore backup to main file", {
              path,
              error: getErrorMessage(e),
            });
          }
          
          return {
            data,
            source: "backup",
            recovered: true,
            error: getErrorMessage(error),
          };
        }
      }
    } catch (backupError) {
      if (logErrors) {
        logError("Backup recovery also failed", backupError, { path, backupPath });
      }
    }
  }

  // Return default value
  return {
    data: defaultValue,
    source: "default",
    recovered: !existsSync(path), // Only "recovered" if file existed but failed
    error: existsSync(path) ? "All recovery attempts failed" : undefined,
  };
}

/**
 * Write JSON with automatic backup creation.
 * Creates a backup of the existing file before writing.
 * 
 * @param path - Path to write the JSON file
 * @param data - Data to serialize and write
 * @param options - Options for backup behavior
 */
export function writeJsonSafe(
  path: string,
  data: unknown,
  options: {
    createBackup?: boolean;
    indent?: number;
  } = {}
): void {
  const { createBackup = true, indent = 2 } = options;
  const backupPath = getBackupPath(path);

  // Create backup of existing file
  if (createBackup && existsSync(path)) {
    try {
      copyFileSync(path, backupPath);
    } catch (e) {
      logDebug("Failed to create backup before write", {
        path,
        error: getErrorMessage(e),
      });
    }
  }

  // Write the new content
  try {
    const content = JSON.stringify(data, null, indent);
    writeFileSync(path, content);
  } catch (error) {
    throw new FileIOError("write", path, error);
  }
}

// ============================================================================
// Schema Validation
// ============================================================================

/**
 * Schema definition for validation.
 * Uses a simple type-based validation approach.
 */
export interface SchemaField {
  type: "string" | "number" | "boolean" | "array" | "object";
  required?: boolean;
  items?: SchemaField; // For array types
  properties?: Record<string, SchemaField>; // For object types
}

export type Schema = Record<string, SchemaField>;

/**
 * Validate data against a schema.
 * Returns an array of validation issues (empty if valid).
 */
export function validateSchema(
  data: unknown,
  schema: Schema,
  path: string = ""
): string[] {
  const issues: string[] = [];

  if (typeof data !== "object" || data === null) {
    return [`${path || "root"}: expected object, got ${typeof data}`];
  }

  const record = data as Record<string, unknown>;

  for (const [key, field] of Object.entries(schema)) {
    const fieldPath = path ? `${path}.${key}` : key;
    const value = record[key];

    // Check required fields
    if (field.required && (value === undefined || value === null)) {
      issues.push(`${fieldPath}: required field is missing`);
      continue;
    }

    // Skip optional undefined fields
    if (value === undefined || value === null) continue;

    // Type validation
    const actualType = Array.isArray(value) ? "array" : typeof value;
    if (actualType !== field.type) {
      issues.push(`${fieldPath}: expected ${field.type}, got ${actualType}`);
      continue;
    }

    // Recursive validation for arrays
    if (field.type === "array" && field.items) {
      const arr = value as unknown[];
      for (let i = 0; i < arr.length; i++) {
        if (field.items.type === "object" && field.items.properties) {
          issues.push(
            ...validateSchema(arr[i], field.items.properties, `${fieldPath}[${i}]`)
          );
        }
      }
    }

    // Recursive validation for nested objects
    if (field.type === "object" && field.properties) {
      issues.push(...validateSchema(value, field.properties, fieldPath));
    }
  }

  return issues;
}

// ============================================================================
// Predefined Schemas
// ============================================================================

/**
 * Schema for state.json
 */
export const STATE_SCHEMA: Schema = {
  session_count: { type: "number", required: true },
  status: { type: "string", required: true },
  last_updated: { type: "string", required: true },
  achievements: { type: "array", required: true },
  active_tasks: { type: "array", required: true },
  total_tokens: { type: "number", required: false },
};

/**
 * Schema for tasks.json
 */
export const TASKS_SCHEMA: Schema = {
  version: { type: "string", required: true },
  tasks: { type: "array", required: true },
  completed_count: { type: "number", required: true },
  last_updated: { type: "string", required: true },
};

/**
 * Schema for agent-registry.json
 */
export const AGENT_REGISTRY_SCHEMA: Schema = {
  agents: { type: "array", required: true },
  last_updated: { type: "string", required: true },
};

/**
 * Validate critical state files and return issues.
 */
export function validateCriticalFiles(): Record<string, string[]> {
  const results: Record<string, string[]> = {};

  // Validate state.json
  const stateResult = readJsonSafe(PATHS.state, null);
  if (stateResult.data) {
    results["state.json"] = validateSchema(stateResult.data, STATE_SCHEMA);
  } else {
    results["state.json"] = ["File does not exist or is empty"];
  }

  // Validate tasks.json
  const tasksResult = readJsonSafe(PATHS.tasks, null);
  if (tasksResult.data) {
    results["tasks.json"] = validateSchema(tasksResult.data, TASKS_SCHEMA);
  } else {
    results["tasks.json"] = ["File does not exist or is empty"];
  }

  // Validate agent-registry.json
  const registryResult = readJsonSafe(PATHS.agentRegistry, null);
  if (registryResult.data) {
    results["agent-registry.json"] = validateSchema(
      registryResult.data,
      AGENT_REGISTRY_SCHEMA
    );
  } else {
    results["agent-registry.json"] = ["File does not exist or is empty"];
  }

  return results;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Safely execute a function and log any errors.
 * Returns the default value if the function throws.
 */
export function trySafe<T>(
  fn: () => T,
  defaultValue: T,
  context?: { operation?: string; file?: string }
): T {
  try {
    return fn();
  } catch (error) {
    logError(
      `Operation failed: ${context?.operation || "unknown"}`,
      error,
      context
    );
    return defaultValue;
  }
}

/**
 * Safely execute an async function and log any errors.
 */
export async function trySafeAsync<T>(
  fn: () => Promise<T>,
  defaultValue: T,
  context?: { operation?: string; file?: string }
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logError(
      `Async operation failed: ${context?.operation || "unknown"}`,
      error,
      context
    );
    return defaultValue;
  }
}

/**
 * Wrap a function to catch and log errors without throwing.
 */
export function withErrorLogging<T extends (...args: unknown[]) => unknown>(
  fn: T,
  operation: string
): T {
  return ((...args: unknown[]) => {
    try {
      return fn(...args);
    } catch (error) {
      logError(`${operation} failed`, error);
      throw error;
    }
  }) as T;
}
