/**
 * Predictive Analyzer - Forecast maintenance needs based on trends
 * 
 * Analyzes log and archive growth patterns to predict:
 * - When logs will need rotation
 * - When archives will reach limits
 * - Unusual growth patterns that may indicate issues
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getLogMetrics, analyzeGrowth } from "../shared/growth-tracker";
import { MEMORY_DIR } from "../shared/paths";
import type { GrowthMetric, GrowthAnalysis } from "../shared/growth-tracker";

interface PredictiveAlert {
  timestamp: number;
  type: "rotation_needed" | "archive_warning" | "growth_anomaly" | "healthy";
  severity: "critical" | "warning" | "info";
  message: string;
  estimated_action_date?: string;
}

interface PredictionReport {
  realtime_log: GrowthAnalysis & { path: string };
  coordination_log: GrowthAnalysis & { path: string };
  archives: {
    growth_status: string;
    estimated_days_to_500mb: number | null;
  };
  alerts: PredictiveAlert[];
  last_updated: number;
}

/**
 * Generate predictive alerts based on current metrics
 */
export function generatePredictiveReport(): PredictionReport {
  const realtimePath = join(MEMORY_DIR, "realtime.log");
  const coordinationPath = join(MEMORY_DIR, "coordination.log");
  const alerts: PredictiveAlert[] = [];

  // Get current metrics
  const realtimeMetric = getLogMetrics(realtimePath);
  const coordinationMetric = getLogMetrics(coordinationPath);

  // Analyze growth (for now without historical data)
  const realtimeAnalysis = realtimeMetric
    ? analyzeGrowth(realtimeMetric, [], 5) // 5MB threshold
    : {
        current_size_mb: 0,
        current_lines: 0,
        growth_rate_kb_hour: 0,
        growth_rate_lines_day: 0,
        days_to_threshold_5mb: null,
        estimated_maintenance_window: "No data",
        growth_trend: "normal" as const,
        anomaly_factor: 1,
      };

  const coordinationAnalysis = coordinationMetric
    ? analyzeGrowth(coordinationMetric, [], 5) // 5MB threshold
    : {
        current_size_mb: 0,
        current_lines: 0,
        growth_rate_kb_hour: 0,
        growth_rate_lines_day: 0,
        days_to_threshold_5mb: null,
        estimated_maintenance_window: "No data",
        growth_trend: "normal" as const,
        anomaly_factor: 1,
      };

  // Generate alerts for realtime.log
  if (realtimeAnalysis.current_size_mb > 4.5) {
    alerts.push({
      timestamp: Date.now(),
      type: "rotation_needed",
      severity: "critical",
      message: `realtime.log approaching rotation threshold (${realtimeAnalysis.current_size_mb.toFixed(1)}MB / 5MB)`,
      estimated_action_date: new Date(
        Date.now() +
          (realtimeAnalysis.days_to_threshold_5mb || 0) * 24 * 60 * 60 * 1000
      ).toISOString(),
    });
  } else if (realtimeAnalysis.current_size_mb > 3.5) {
    alerts.push({
      timestamp: Date.now(),
      type: "rotation_needed",
      severity: "warning",
      message: `realtime.log approaching rotation threshold (${realtimeAnalysis.current_size_mb.toFixed(1)}MB / 5MB)`,
      estimated_action_date: new Date(
        Date.now() +
          (realtimeAnalysis.days_to_threshold_5mb || 1) * 24 * 60 * 60 * 1000
      ).toISOString(),
    });
  }

  // Generate alerts for coordination.log
  if (coordinationAnalysis.current_size_mb > 4.5) {
    alerts.push({
      timestamp: Date.now(),
      type: "rotation_needed",
      severity: "critical",
      message: `coordination.log approaching rotation threshold (${coordinationAnalysis.current_size_mb.toFixed(1)}MB / 5MB)`,
    });
  } else if (coordinationAnalysis.current_size_mb > 3.5) {
    alerts.push({
      timestamp: Date.now(),
      type: "rotation_needed",
      severity: "warning",
      message: `coordination.log approaching rotation threshold (${coordinationAnalysis.current_size_mb.toFixed(1)}MB / 5MB)`,
    });
  }

  // Detect anomalous growth
  if (realtimeAnalysis.growth_trend === "anomalous") {
    alerts.push({
      timestamp: Date.now(),
      type: "growth_anomaly",
      severity: "warning",
      message: `realtime.log growth rate is ${realtimeAnalysis.anomaly_factor.toFixed(1)}x normal (${realtimeAnalysis.growth_rate_kb_hour.toFixed(1)} KB/hr)`,
    });
  }

  if (coordinationAnalysis.growth_trend === "anomalous") {
    alerts.push({
      timestamp: Date.now(),
      type: "growth_anomaly",
      severity: "warning",
      message: `coordination.log growth rate is ${coordinationAnalysis.anomaly_factor.toFixed(1)}x normal (${coordinationAnalysis.growth_rate_kb_hour.toFixed(1)} KB/hr)`,
    });
  }

  // Archive size warning (simplified - 22KB currently growing ~5KB/day)
  // At 5KB/day growth, will reach 500MB in ~27,000 days (74 years)
  let archivesDaysTo500mb: number | null = null;
  const archiveGrowthKbDay = 5; // from working memory
  if (archiveGrowthKbDay > 0) {
    archivesDaysTo500mb = (500 * 1024) / archiveGrowthKbDay;
  }

  if (archivesDaysTo500mb && archivesDaysTo500mb < 30) {
    alerts.push({
      timestamp: Date.now(),
      type: "archive_warning",
      severity: "warning",
      message: `Archives projected to exceed 500MB in ${Math.ceil(archivesDaysTo500mb)} days. Consider compression.`,
    });
  }

  // If no alerts, add healthy status
  if (alerts.length === 0) {
    alerts.push({
      timestamp: Date.now(),
      type: "healthy",
      severity: "info",
      message: "All log growth within normal parameters",
    });
  }

  return {
    realtime_log: {
      ...realtimeAnalysis,
      path: realtimePath,
    },
    coordination_log: {
      ...coordinationAnalysis,
      path: coordinationPath,
    },
    archives: {
      growth_status:
        archivesDaysTo500mb && archivesDaysTo500mb < 1000
          ? `Growing at ~${archiveGrowthKbDay} KB/day`
          : "Sustainable growth rate",
      estimated_days_to_500mb: archivesDaysTo500mb,
    },
    alerts,
    last_updated: Date.now(),
  };
}

/**
 * Save prediction report to memory
 */
export function savePredictionReport(report: PredictionReport): boolean {
  try {
    const reportPath = join(MEMORY_DIR, "predictions.json");
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    return true;
  } catch (err) {
    console.error("Failed to save prediction report:", err);
    return false;
  }
}

/**
 * Load last prediction report
 */
export function loadPredictionReport(): PredictionReport | null {
  try {
    const reportPath = join(MEMORY_DIR, "predictions.json");
    if (!existsSync(reportPath)) return null;

    const content = readFileSync(reportPath, "utf-8");
    return JSON.parse(content) as PredictionReport;
  } catch (err) {
    return null;
  }
}

/**
 * Format prediction report for CLI display
 */
export function formatPredictionReport(report: PredictionReport): string {
  const lines: string[] = [];

  lines.push("📊 LOG GROWTH PROJECTIONS");
  lines.push("");

  // Realtime log
  lines.push(`realtime.log: ${report.realtime_log.current_size_mb.toFixed(2)} MB`);
  if (report.realtime_log.growth_rate_kb_hour > 0) {
    lines.push(
      `  Growth: ${report.realtime_log.growth_rate_kb_hour.toFixed(2)} KB/hr`
    );
    if (report.realtime_log.days_to_threshold_5mb !== null) {
      lines.push(
        `  Rotation in ~${Math.ceil(report.realtime_log.days_to_threshold_5mb)} days`
      );
    }
  } else {
    lines.push(`  Growth: < 1 KB/hr (minimal)`);
  }

  // Coordination log
  lines.push(
    `coordination.log: ${report.coordination_log.current_size_mb.toFixed(2)} MB`
  );
  if (report.coordination_log.growth_rate_kb_hour > 0) {
    lines.push(
      `  Growth: ${report.coordination_log.growth_rate_kb_hour.toFixed(2)} KB/hr`
    );
    if (report.coordination_log.days_to_threshold_5mb !== null) {
      lines.push(
        `  Rotation in ~${Math.ceil(report.coordination_log.days_to_threshold_5mb)} days`
      );
    }
  } else {
    lines.push(`  Growth: < 1 KB/hr (minimal)`);
  }

  // Archives
  lines.push(`Archives: ${report.archives.growth_status}`);
  if (
    report.archives.estimated_days_to_500mb &&
    report.archives.estimated_days_to_500mb < 365
  ) {
    lines.push(
      `  Action needed in ~${Math.ceil(report.archives.estimated_days_to_500mb)} days`
    );
  }

  // Alerts
  if (report.alerts.length > 0 && report.alerts[0].type !== "healthy") {
    lines.push("");
    lines.push("🚨 ALERTS");
    report.alerts.forEach((alert) => {
      const icon =
        alert.severity === "critical" ? "🔴" : alert.severity === "warning" ? "🟡" : "ℹ️";
      lines.push(`${icon} ${alert.message}`);
      if (alert.estimated_action_date) {
        lines.push(`   Action by: ${new Date(alert.estimated_action_date).toLocaleDateString()}`);
      }
    });
  }

  return lines.join("\n");
}
