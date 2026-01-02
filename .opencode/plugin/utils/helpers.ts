/**
 * Plugin Helper Utilities
 * 
 * Common helper functions used across the plugin modules.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";

/**
 * Safely read and parse a JSON file
 */
export function readJsonFile<T>(path: string, defaultValue: T): T {
  try {
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`[Helper] Failed to read JSON file: ${path}`, error);
  }
  return defaultValue;
}

/**
 * Safely write a JSON file
 */
export function writeJsonFile(path: string, data: any, pretty: boolean = true): boolean {
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const content = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
    writeFileSync(path, content);
    return true;
  } catch (error) {
    console.error(`[Helper] Failed to write JSON file: ${path}`, error);
    return false;
  }
}

/**
 * Read a JSONL file and parse each line
 */
export function readJsonlFile<T>(path: string): T[] {
  try {
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      return content
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((item): item is T => item !== null);
    }
  } catch (error) {
    console.error(`[Helper] Failed to read JSONL file: ${path}`, error);
  }
  return [];
}

/**
 * Format a timestamp as relative time (e.g., "5m ago")
 */
export function formatTimeAgo(timestamp: string | Date): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 0) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

/**
 * Truncate a string to a maximum length
 */
export function truncate(str: string, maxLen: number): string {
  if (!str || str.length <= maxLen) return str || "";
  return str.slice(0, maxLen - 3) + "...";
}

/**
 * Generate a unique ID with a prefix
 */
export function generateId(prefix: string = "id"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Check if a file/directory path is safe (not escaping workspace)
 */
export function isSafePath(basePath: string, targetPath: string): boolean {
  const resolvedBase = join(basePath);
  const resolvedTarget = join(basePath, targetPath);
  return resolvedTarget.startsWith(resolvedBase);
}

/**
 * Deep merge two objects
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];
      const targetValue = result[key];
      
      if (
        sourceValue !== null &&
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === "object" &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(targetValue, sourceValue as any);
      } else {
        result[key] = sourceValue as any;
      }
    }
  }
  
  return result;
}

/**
 * Retry an async function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 100
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError;
}

/**
 * Create a simple debounce function
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: Timer | undefined;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), delayMs);
  };
}

/**
 * Parse priority string to number for sorting
 */
export function priorityToNumber(priority: string): number {
  const mapping: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return mapping[priority.toLowerCase()] ?? 4;
}

/**
 * Parse status string to number for sorting
 */
export function statusToNumber(status: string): number {
  const mapping: Record<string, number> = {
    in_progress: 0,
    pending: 1,
    blocked: 2,
    completed: 3,
    cancelled: 4,
  };
  return mapping[status.toLowerCase()] ?? 5;
}

/**
 * Filter out stale agents (older than threshold)
 */
export function filterStaleAgents<T extends { last_heartbeat: string }>(
  agents: T[],
  thresholdMs: number = 2 * 60 * 1000
): T[] {
  const cutoff = Date.now() - thresholdMs;
  return agents.filter((agent) => {
    const lastHB = new Date(agent.last_heartbeat).getTime();
    return lastHB > cutoff;
  });
}
