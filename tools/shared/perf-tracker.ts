/**
 * Performance Tracking Utility
 *
 * Records performance metrics for agent operations, task operations, and leader election.
 * Data is written to memory/perf-metrics.jsonl for trend analysis.
 *
 * Usage:
 *   const tracker = new PerfTracker(memoryDir, sessionId);
 *   tracker.recordOperation('agent_register', 45, true);
 *   tracker.recordOperation('task_create', 89, true, { priority: 'high' });
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
  context?: Record<string, any>;
}

export class PerfTracker {
  private metricsPath: string;
  private sessionId: string | null;

  constructor(memoryDir: string, sessionId?: string) {
    this.metricsPath = join(memoryDir, "perf-metrics.jsonl");
    this.sessionId = sessionId || null;

    // Ensure memory directory exists
    if (!existsSync(memoryDir)) {
      mkdirSync(memoryDir, { recursive: true });
    }
  }

  /**
   * Record a performance metric
   */
  recordOperation(
    operationType: string,
    durationMs: number,
    success: boolean = true,
    context?: Record<string, any>,
    error?: string
  ): void {
    try {
      const metric: PerfMetric = {
        timestamp: new Date().toISOString(),
        operation_type: operationType,
        duration_ms: durationMs,
        success,
        session_id: this.sessionId,
        ...(error && { error }),
        ...(context && { context }),
      };

      appendFileSync(this.metricsPath, JSON.stringify(metric) + "\n");
    } catch (e) {
      // Silently fail to avoid disrupting operation
      console.error("[PerfTracker] Failed to record metric:", e);
    }
  }

  /**
   * Record agent operation (register, send, messages, status, etc.)
   */
  recordAgentOperation(
    operation: "register" | "send" | "messages" | "status" | "update_status" | "set_handoff",
    durationMs: number,
    success: boolean = true,
    context?: Record<string, any>,
    error?: string
  ): void {
    this.recordOperation(`agent_${operation}`, durationMs, success, context, error);
  }

  /**
   * Record task operation (create, update, claim, list, next, schedule, spawn)
   */
  recordTaskOperation(
    operation: "create" | "update" | "claim" | "list" | "next" | "schedule" | "spawn",
    durationMs: number,
    success: boolean = true,
    context?: Record<string, any>,
    error?: string
  ): void {
    this.recordOperation(`task_${operation}`, durationMs, success, context, error);
  }

  /**
   * Record message passing latency
   */
  recordMessageOperation(
    operation: "send" | "read" | "deliver",
    durationMs: number,
    success: boolean = true,
    context?: Record<string, any>,
    error?: string
  ): void {
    this.recordOperation(`message_${operation}`, durationMs, success, context, error);
  }

  /**
   * Record leader election cycle time
   */
  recordLeaderElectionOperation(
    operation: "register" | "heartbeat" | "election" | "failover",
    durationMs: number,
    success: boolean = true,
    context?: Record<string, any>,
    error?: string
  ): void {
    this.recordOperation(`leader_${operation}`, durationMs, success, context, error);
  }

  /**
   * Time an async function and record result
   */
  async timeAsync<T>(
    operationType: string,
    fn: () => Promise<T>,
    context?: Record<string, any>
  ): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.recordOperation(operationType, duration, true, context);
      return result;
    } catch (e) {
      const duration = Date.now() - start;
      this.recordOperation(operationType, duration, false, context, String(e));
      throw e;
    }
  }

  /**
   * Time a sync function and record result
   */
  timeSync<T>(
    operationType: string,
    fn: () => T,
    context?: Record<string, any>
  ): T {
    const start = Date.now();
    try {
      const result = fn();
      const duration = Date.now() - start;
      this.recordOperation(operationType, duration, true, context);
      return result;
    } catch (e) {
      const duration = Date.now() - start;
      this.recordOperation(operationType, duration, false, context, String(e));
      throw e;
    }
  }
}

/**
 * Create a singleton perf tracker (thread-safe for this app's needs)
 */
let globalTracker: PerfTracker | null = null;

export function initGlobalPerfTracker(memoryDir: string, sessionId?: string): void {
  globalTracker = new PerfTracker(memoryDir, sessionId);
}

export function getGlobalPerfTracker(): PerfTracker | null {
  return globalTracker;
}
