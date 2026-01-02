/**
 * Shared Configuration
 * 
 * Centralized configuration constants for the multi-agent system.
 * All thresholds and settings should be defined here.
 */

/**
 * Core system configuration.
 * Values can be overridden via environment variables where noted.
 */
export const CONFIG = {
  /**
   * Lock stale threshold in milliseconds.
   * Locks older than this are considered abandoned.
   */
  LOCK_STALE_THRESHOLD: 30000, // 30 seconds
  
  /**
   * Agent stale threshold in milliseconds.
   * Agents without heartbeat for this duration are considered stale.
   */
  AGENT_STALE_THRESHOLD: 2 * 60 * 1000, // 2 minutes
  
  /**
   * Agent warning threshold in milliseconds.
   * Agents without heartbeat for this duration get a warning.
   */
  AGENT_WARNING_THRESHOLD: 1 * 60 * 1000, // 1 minute
  
  /**
   * Agent dead threshold in milliseconds.
   * Agents without heartbeat for this duration are considered dead.
   */
  AGENT_DEAD_THRESHOLD: 5 * 60 * 1000, // 5 minutes
  
  /**
   * Dashboard/API server base URL.
   * Override with API_BASE environment variable.
   */
  API_BASE: process.env.API_BASE || "http://localhost:3847",
  
  /**
   * WebSocket server URL.
   * Override with WS_URL environment variable.
   */
  WS_URL: process.env.WS_URL || "ws://localhost:3847/ws",
  
  /**
   * WebSocket reconnection delay in milliseconds.
   */
  WS_RECONNECT_DELAY: 3000,
  
  /**
   * Maximum entries to keep in log files.
   */
  MAX_LOG_ENTRIES: 1000,
  
  /**
   * Maximum entries to keep in message bus.
   */
  MAX_MESSAGE_BUS_ENTRIES: 5000,
  
  /**
   * Heartbeat interval in milliseconds.
   */
  HEARTBEAT_INTERVAL: 30000, // 30 seconds
  
  /**
   * Cleanup check interval in milliseconds.
   */
  CLEANUP_INTERVAL: 30000, // 30 seconds
  
  /**
   * Metrics rolling window in milliseconds.
   */
  METRICS_WINDOW: 60 * 60 * 1000, // 1 hour
  
  /**
   * Session idle timeout in milliseconds.
   * Session is considered idle after this duration of inactivity.
   */
  SESSION_IDLE_TIMEOUT: 60 * 1000, // 1 minute
  
  /**
   * Default tool execution timeout in milliseconds.
   */
  TOOL_TIMEOUT: 30000, // 30 seconds
  
  /**
   * Maximum number of concurrent agents.
   */
  MAX_CONCURRENT_AGENTS: 10,
  
  /**
   * Quality assessment thresholds.
   */
  QUALITY: {
    EXCELLENT: 9,
    GOOD: 7,
    ACCEPTABLE: 5,
    POOR: 3,
  },
  
  /**
   * Priority weights for task scheduling.
   */
  PRIORITY_WEIGHTS: {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  },
  
  /**
   * Task aging rate per hour for priority boost.
   * Older tasks get priority boost at this rate.
   */
  TASK_AGING_RATE: 0.1, // 10% boost per hour
} as const;

/**
 * Priority sort order (lower is higher priority).
 */
export const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Status sort order for display.
 */
export const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  pending: 1,
  blocked: 2,
  completed: 3,
  cancelled: 4,
};

/**
 * Tool categories for analytics.
 */
export const TOOL_CATEGORIES: Record<string, string[]> = {
  file: ["read", "write", "edit", "glob", "grep"],
  code: ["bash", "playwright_browser_*"],
  memory: ["memory_*", "task_*", "checkpoint_*", "recovery_*"],
  agent: ["agent_*"],
  quality: ["quality_*"],
  git: ["git_*"],
  browser: ["playwright_*"],
  other: [],
};

/**
 * Default file size limits.
 */
export const SIZE_LIMITS = {
  MAX_JSON_FILE: 10 * 1024 * 1024, // 10MB
  MAX_JSONL_FILE: 50 * 1024 * 1024, // 50MB
  MAX_LOG_FILE: 100 * 1024 * 1024, // 100MB
  ROTATION_THRESHOLD: 5 * 1024 * 1024, // 5MB - trigger rotation
};

/**
 * Get a config value with environment variable override.
 * 
 * @param key - Config key
 * @param envVar - Environment variable name
 * @returns Config value (env var takes precedence)
 */
export function getConfigValue<K extends keyof typeof CONFIG>(
  key: K,
  envVar?: string
): (typeof CONFIG)[K] {
  if (envVar && process.env[envVar] !== undefined) {
    const envValue = process.env[envVar];
    const configValue = CONFIG[key];
    
    // Type coercion based on original type
    if (typeof configValue === "number") {
      return Number(envValue) as (typeof CONFIG)[K];
    }
    if (typeof configValue === "boolean") {
      return (envValue === "true") as (typeof CONFIG)[K];
    }
    return envValue as (typeof CONFIG)[K];
  }
  return CONFIG[key];
}
