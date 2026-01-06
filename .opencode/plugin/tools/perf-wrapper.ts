/**
 * Performance Tracking Wrapper for Plugin Tools
 *
 * Wraps tool executions to automatically record performance metrics.
 * This is a minimal, non-invasive wrapper that intercepts tool calls.
 */

import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export interface PerfMetric {
  timestamp: string;
  operation_type: string;
  duration_ms: number;
  success: boolean;
  session_id: string | null;
  error?: string;
}

export class PerformanceTracker {
  private metricsPath: string;
  private sessionId: string | null;
  private enabled: boolean;

  constructor(memoryDir: string, sessionId?: string) {
    this.metricsPath = join(memoryDir, "perf-metrics.jsonl");
    this.sessionId = sessionId || null;
    this.enabled = true;

    // Ensure memory directory exists
    if (!existsSync(memoryDir)) {
      try {
        mkdirSync(memoryDir, { recursive: true });
      } catch {
        this.enabled = false;
      }
    }
  }

  /**
   * Record a performance metric
   */
  record(operationType: string, durationMs: number, success: boolean = true, error?: string): void {
    if (!this.enabled) return;

    try {
      const metric: PerfMetric = {
        timestamp: new Date().toISOString(),
        operation_type: operationType,
        duration_ms: durationMs,
        success,
        session_id: this.sessionId,
        ...(error && { error }),
      };

      appendFileSync(this.metricsPath, JSON.stringify(metric) + "\n");
    } catch {
      // Silently fail to avoid disrupting operation
    }
  }

  /**
   * Wrap an async function with performance tracking
   */
  async wrap<T>(operationType: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.record(operationType, duration, true);
      return result;
    } catch (e) {
      const duration = Date.now() - start;
      this.record(operationType, duration, false, String(e));
      throw e;
    }
  }
}

// Global tracker instance
let globalTracker: PerformanceTracker | null = null;

export function initializePerformanceTracker(memoryDir: string, sessionId?: string): void {
  globalTracker = new PerformanceTracker(memoryDir, sessionId);
}

export function getPerformanceTracker(): PerformanceTracker | null {
  return globalTracker;
}

/**
 * Helper to record tool execution
 */
export function recordToolExecution(toolName: string, durationMs: number, success: boolean = true, error?: string): void {
  globalTracker?.record(`tool_${toolName}`, durationMs, success, error);
}
