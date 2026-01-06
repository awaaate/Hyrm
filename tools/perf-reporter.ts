#!/usr/bin/env bun

/**
 * Performance Reporter
 *
 * Generates monthly/weekly performance reports from perf-metrics.jsonl.
 * Shows trends, identifies degradation, and suggests optimizations.
 *
 * Usage:
 *   bun tools/perf-reporter.ts monthly              # Last 30 days
 *   bun tools/perf-reporter.ts weekly               # Last 7 days
 *   bun tools/perf-reporter.ts trends --days 90    # 90-day trend
 *   bun tools/perf-reporter.ts export --format csv # Export to CSV
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

interface PerfMetric {
  timestamp: string;
  operation_type: string;
  duration_ms: number;
  success: boolean;
  session_id?: string;
  error?: string;
  context?: Record<string, any>;
}

interface OperationStats {
  count: number;
  success_count: number;
  error_count: number;
  min_ms: number;
  max_ms: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  total_duration_ms: number;
}

interface TrendData {
  period: string;
  stats: Map<string, OperationStats>;
}

function loadMetrics(metricsPath: string, startTime: Date, endTime: Date): PerfMetric[] {
  if (!existsSync(metricsPath)) {
    return [];
  }

  const content = readFileSync(metricsPath, "utf-8");
  const lines = content.trim().split("\n").filter((l) => l.length > 0);

  return lines
    .map((line) => {
      try {
        return JSON.parse(line) as PerfMetric;
      } catch {
        return null;
      }
    })
    .filter((m) => m !== null && new Date(m.timestamp) >= startTime && new Date(m.timestamp) < endTime) as PerfMetric[];
}

function calculateStats(durations: number[]): Partial<OperationStats> {
  if (durations.length === 0) {
    return {
      min_ms: 0,
      max_ms: 0,
      avg_ms: 0,
      p50_ms: 0,
      p95_ms: 0,
      p99_ms: 0,
    };
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const total = sorted.reduce((a, b) => a + b, 0);
  const avg = total / sorted.length;

  return {
    min_ms: sorted[0],
    max_ms: sorted[sorted.length - 1],
    avg_ms: Math.round(avg * 100) / 100,
    p50_ms: sorted[Math.floor(sorted.length * 0.5)],
    p95_ms: sorted[Math.floor(sorted.length * 0.95)],
    p99_ms: sorted[Math.floor(sorted.length * 0.99)],
  };
}

function getOperationStats(metrics: PerfMetric[]): Map<string, OperationStats> {
  const grouped = new Map<string, PerfMetric[]>();

  for (const metric of metrics) {
    if (!grouped.has(metric.operation_type)) {
      grouped.set(metric.operation_type, []);
    }
    grouped.get(metric.operation_type)!.push(metric);
  }

  const stats = new Map<string, OperationStats>();

  for (const [opType, metrics] of grouped) {
    const durations = metrics.map((m) => m.duration_ms);
    const successes = metrics.filter((m) => m.success).length;
    const errors = metrics.length - successes;

    const baseStats = calculateStats(durations);

    stats.set(opType, {
      count: metrics.length,
      success_count: successes,
      error_count: errors,
      total_duration_ms: durations.reduce((a, b) => a + b, 0),
      ...(baseStats as any),
    });
  }

  return stats;
}

function formatTable(
  stats: Map<string, OperationStats>,
  title: string,
  degradation?: Map<string, number>
): string {
  const lines: string[] = [];
  lines.push(`\n## ${title}`);
  lines.push(
    "| Operation | Count | Success | Avg (ms) | P95 (ms) | P99 (ms) | Min (ms) | Max (ms) |"
  );
  lines.push("|-----------|-------|---------|----------|----------|----------|----------|----------|");

  const sorted = Array.from(stats.entries()).sort((a, b) => b[1].count - a[1].count);

  for (const [opType, stat] of sorted) {
    const degradation_str = degradation?.has(opType)
      ? ` (${degradation.get(opType)!.toFixed(1)}% slower)`
      : "";

    lines.push(
      `| ${opType} | ${stat.count} | ${stat.success_count}/${stat.count} | ${stat.avg_ms.toFixed(2)} | ${stat.p95_ms} | ${stat.p99_ms} | ${stat.min_ms} | ${stat.max_ms} |${degradation_str}`
    );
  }

  return lines.join("\n");
}

function detectDegradation(
  current: Map<string, OperationStats>,
  previous: Map<string, OperationStats>,
  threshold: number = 20
): Map<string, number> {
  const degradation = new Map<string, number>();

  for (const [opType, currentStats] of current) {
    const prevStats = previous.get(opType);
    if (prevStats) {
      const percentChange = ((currentStats.avg_ms - prevStats.avg_ms) / prevStats.avg_ms) * 100;
      if (percentChange > threshold) {
        degradation.set(opType, percentChange);
      }
    }
  }

  return degradation;
}

function generateReport(metrics: PerfMetric[], period: string): string {
  const stats = getOperationStats(metrics);
  const lines: string[] = [];

  lines.push(`# Performance Report: ${period}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Total metrics recorded: ${metrics.length}`);

  lines.push(formatTable(stats, `Operations (${period})`));

  // Calculate error rate
  const totalOps = metrics.length;
  const failedOps = metrics.filter((m) => !m.success).length;
  const errorRate = totalOps > 0 ? ((failedOps / totalOps) * 100).toFixed(2) : "0.00";

  lines.push(`\n## Reliability`);
  lines.push(`- Total operations: ${totalOps}`);
  lines.push(`- Successful: ${totalOps - failedOps}`);
  lines.push(`- Failed: ${failedOps}`);
  lines.push(`- Error rate: ${errorRate}%`);

  // Top slowest operations
  lines.push(`\n## Slowest Operations`);
  const slowest = metrics.sort((a, b) => b.duration_ms - a.duration_ms).slice(0, 10);
  for (let i = 0; i < slowest.length; i++) {
    const m = slowest[i];
    lines.push(`${i + 1}. ${m.operation_type}: ${m.duration_ms}ms (${new Date(m.timestamp).toISOString()})`);
  }

  // Operations by frequency
  const opFreq = new Map<string, number>();
  for (const m of metrics) {
    opFreq.set(m.operation_type, (opFreq.get(m.operation_type) || 0) + 1);
  }

  lines.push(`\n## Most Frequent Operations`);
  const sorted = Array.from(opFreq.entries()).sort((a, b) => b[1] - a[1]);
  for (const [op, count] of sorted.slice(0, 10)) {
    const percent = ((count / totalOps) * 100).toFixed(1);
    lines.push(`- ${op}: ${count} calls (${percent}%)`);
  }

  return lines.join("\n");
}

async function main() {
  const memoryDir = join(process.cwd(), "memory");
  const metricsPath = join(memoryDir, "perf-metrics.jsonl");

  const args = process.argv.slice(2);
  const command = args[0] || "monthly";
  const daysArg = args.find((a) => a.startsWith("--days="));
  const formatArg = args.find((a) => a.startsWith("--format="));
  const format = formatArg?.split("=")[1] || "text";

  let startDate: Date;
  let period: string;

  const now = new Date();

  switch (command) {
    case "weekly":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      period = "Last 7 days";
      break;
    case "monthly":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      period = "Last 30 days";
      break;
    case "trends": {
      const days = parseInt(daysArg?.split("=")[1] || "90");
      startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      period = `Last ${days} days`;
      break;
    }
    case "export": {
      const metrics = loadMetrics(metricsPath, new Date(0), now);
      if (format === "csv") {
        console.log(
          "timestamp,operation_type,duration_ms,success,session_id,error"
        );
        for (const m of metrics) {
          console.log(
            `"${m.timestamp}","${m.operation_type}",${m.duration_ms},${m.success},"${m.session_id || ""}","${m.error || ""}"`
          );
        }
      } else if (format === "json") {
        console.log(JSON.stringify(metrics, null, 2));
      }
      return;
    }
    default:
      console.log(`Unknown command: ${command}`);
      console.log("Usage:");
      console.log("  bun tools/perf-reporter.ts monthly");
      console.log("  bun tools/perf-reporter.ts weekly");
      console.log("  bun tools/perf-reporter.ts trends --days 90");
      console.log("  bun tools/perf-reporter.ts export --format csv");
      process.exit(1);
  }

  const metrics = loadMetrics(metricsPath, startDate, now);

  if (metrics.length === 0) {
    console.log(`No performance metrics found for ${period}`);
    return;
  }

  const report = generateReport(metrics, period);
  console.log(report);
}

main().catch((e) => {
  console.error("Error generating report:", e);
  process.exit(1);
});
