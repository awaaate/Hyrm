/**
 * Shared Utilities - Barrel Export
 * 
 * Re-exports all shared utilities for convenient importing.
 * 
 * @example
 * import { readJson, c, formatDuration, PATHS } from './shared';
 * 
 * // Or import specific modules:
 * import { readJson, writeJson } from './shared/json-utils';
 * import { c, symbols } from './shared/colors';
 */

// JSON I/O utilities
export {
  readJson,
  writeJson,
  readJsonl,
  appendJsonl,
  appendLine,
  safeJsonParse,
} from "./json-utils";

// ANSI colors and symbols
export {
  c,
  symbols,
  statusColors,
  statusSymbols,
  stripAnsi,
  colorize,
} from "./colors";

// Time formatting utilities
export {
  formatDuration,
  formatTime,
  formatTimeAgo,
  formatTimeShort,
  formatDate,
  formatDateTime,
  getFilenameTimestamp,
  isWithinWindow,
  getAge,
} from "./time-utils";

// String utilities
export {
  truncate,
  stringSimilarity,
  padRight,
  padLeft,
  center,
  line,
  capitalize,
  titleCase,
  slugify,
  visibleLength,
  wrapText,
} from "./string-utils";

// Path utilities and constants
export {
  WORKSPACE_DIR,
  MEMORY_DIR,
  TOOLS_DIR,
  PLUGIN_DIR,
  SESSIONS_DIR,
  LOGS_DIR,
  PATHS,
  getMemoryPath,
  getSessionPath,
  getToolPath,
  ensureDir,
  ensureMemoryStructure,
  getBackupPath,
  getArchivePath,
} from "./paths";

// Configuration constants
export {
  CONFIG,
  PRIORITY_ORDER,
  STATUS_ORDER,
  TOOL_CATEGORIES,
  SIZE_LIMITS,
  getConfigValue,
} from "./config";

// Data fetchers - centralized data access
export {
  // Agent functions
  getAllAgents,
  getActiveAgents,
  getAgentsByStatus,
  getAgentsByRole,
  getAgentById,
  isAgentAlive,
  // Task functions
  getAllTasks,
  getTasksByStatus,
  getPendingTasks,
  getTaskById,
  getTasksByAgent,
  getTaskStats,
  // Message functions
  getMessages,
  getMessagesByAgent,
  getMessagesByType,
  getUserMessages,
  // Quality functions
  getQualityStore,
  getAverageQualityScore,
  getQualityForTask,
  // State functions
  getSystemState,
  getSessionCount,
  getSystemStatus,
  // Session functions
  getSessionEvents,
  getEventsForSession,
  // Aggregated
  getSystemOverview,
  // Constants
  STALENESS,
  // OpenCode native storage
  OPENCODE_STORAGE,
  OPENCODE_PATHS,
  isOpenCodeStorageAvailable,
  getOpenCodeProjects,
  getOpenCodeSessionsForProject,
  getAllOpenCodeSessions,
  getOpenCodeSessionById,
  getOpenCodeMessagesForSession,
  getOpenCodePartsForMessage,
  getOpenCodeToolCalls,
  getOpenCodeSessionStats,
  getOpenCodeToolUsageStats,
  searchOpenCodeSessions,
} from "./data-fetchers";

// OpenCode types from data-fetchers
export type {
  OpenCodeSession,
  OpenCodeMessage,
  OpenCodePart,
  ToolCallInfo,
} from "./data-fetchers";

// Type exports
export type {
  // Task types
  TaskPriority,
  TaskStatus,
  TaskComplexity,
  Task,
  TaskStore,
  // Agent types
  AgentStatus,
  Agent,
  AgentRegistry,
  HealthStatus,
  AgentHealthCheck,
  // Message types
  MessageType,
  Message,
  UserMessage,
  // Quality types
  QualityAssessment,
  QualityStore,
  // Session types
  SessionEventType,
  SessionEvent,
  SessionKnowledge,
  // Tool timing types
  ToolTiming,
  ToolTimingSummary,
  // State types
  SystemState,
  Achievement,
  // Checkpoint types
  FileModification,
  Checkpoint,
  // Configuration types
  SystemMessageConfig,
  // Utility types
  JsonRecord,
  Result,
  AsyncResult,
} from "./types";
