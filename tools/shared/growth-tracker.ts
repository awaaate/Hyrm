/**
 * Growth Tracker - Monitor log and archive growth rates
 * 
 * Tracks file sizes, line counts, and calculates growth rates.
 * Used for predictive alerting on maintenance windows.
 */

import { existsSync, statSync, readFileSync } from "fs";
import { join } from "path";

export interface GrowthMetric {
  timestamp: number;
  type: "realtime.log" | "coordination.log" | "archives";
  size_bytes: number;
  line_count?: number;
  growth_rate_kb_per_hour?: number;
  growth_rate_lines_per_day?: number;
}

export interface GrowthAnalysis {
  current_size_mb: number;
  current_lines: number;
  growth_rate_kb_hour: number;
  growth_rate_lines_day: number;
  days_to_threshold_5mb: number | null;
  estimated_maintenance_window: string;
  growth_trend: "normal" | "elevated" | "anomalous";
  anomaly_factor: number; // multiplier above normal (1.0 = normal, 2.0 = 2x normal)
}

/**
 * Get current metrics for a log file
 */
export function getLogMetrics(filePath: string): GrowthMetric | null {
  try {
    if (!existsSync(filePath)) return null;

    const stats = statSync(filePath);
    const size = stats.size;
    const content = readFileSync(filePath, "utf-8");
    const lineCount = content.split("\n").length - 1; // exclude last empty line

    return {
      timestamp: Date.now(),
      type: filePath.includes("realtime") ? "realtime.log" : "coordination.log",
      size_bytes: size,
      line_count: lineCount,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Get archive directory metrics (simplified)
 */
export function getArchiveMetrics(archiveDir: string): GrowthMetric | null {
  try {
    if (!existsSync(archiveDir)) return null;

    // Return a placeholder metric - archiving is typically non-critical
    // Real size tracking handled separately in archive cleanup
    return {
      timestamp: Date.now(),
      type: "archives",
      size_bytes: 0, // Approximation
    };
  } catch (err) {
    return null;
  }
}

/**
 * Calculate growth rate between two measurements
 */
export function calculateGrowthRate(
  current: GrowthMetric,
  previous: GrowthMetric
): {
  kb_per_hour: number;
  lines_per_day: number;
} {
  const timeDiffHours = (current.timestamp - previous.timestamp) / (1000 * 60 * 60);
  const sizeDiffKb = (current.size_bytes - previous.size_bytes) / 1024;
  const lineDiff = (current.line_count || 0) - (previous.line_count || 0);

  return {
    kb_per_hour: timeDiffHours > 0 ? sizeDiffKb / timeDiffHours : 0,
    lines_per_day: timeDiffHours > 0 ? (lineDiff / timeDiffHours) * 24 : 0,
  };
}

/**
 * Predict days until threshold is reached
 */
export function daysUntilThreshold(
  currentSizeMb: number,
  growthRateKbPerHour: number,
  thresholdMb: number
): number | null {
  if (growthRateKbPerHour <= 0) return null;

  const remainingKb = (thresholdMb * 1024) - (currentSizeMb * 1024);
  const hoursNeeded = remainingKb / growthRateKbPerHour;
  return hoursNeeded / 24;
}

/**
 * Detect anomalous growth patterns
 */
export function detectAnomaly(
  currentRate: number,
  recentRates: number[],
  threshold: number = 2.0
): { isAnomaly: boolean; factor: number } {
  if (recentRates.length < 2) {
    return { isAnomaly: false, factor: 1.0 };
  }

  const avgRate =
    recentRates.reduce((a, b) => a + b, 0) / recentRates.length;
  const factor = avgRate > 0 ? currentRate / avgRate : 1.0;

  return {
    isAnomaly: factor > threshold,
    factor,
  };
}

/**
 * Analyze log growth and generate insights
 */
export function analyzeGrowth(
  metric: GrowthMetric,
  recentMetrics: GrowthMetric[] = [],
  thresholdMb: number = 5
): GrowthAnalysis {
  const currentSizeMb = metric.size_bytes / (1024 * 1024);
  const currentLines = metric.line_count || 0;

  // Calculate growth rate from recent measurements
  let growthRateKbHour = 0;
  let growthRateLinesDay = 0;
  const recentRates: number[] = [];

  if (recentMetrics.length > 0) {
    const sortedMetrics = [
      ...recentMetrics,
      metric,
    ].sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 1; i < sortedMetrics.length; i++) {
      const rate = calculateGrowthRate(sortedMetrics[i], sortedMetrics[i - 1]);
      growthRateKbHour = rate.kb_per_hour;
      growthRateLinesDay = rate.lines_per_day;
      recentRates.push(rate.kb_per_hour);
    }
  }

  // Detect anomalies
  const { isAnomaly, factor } = detectAnomaly(
    growthRateKbHour,
    recentRates.slice(-5), // last 5 measurements
    2.0 // 2x threshold
  );

  // Predict days to threshold
  const daysToThreshold = daysUntilThreshold(
    currentSizeMb,
    growthRateKbHour,
    thresholdMb
  );

  // Generate maintenance window estimate
  let maintenanceWindow = "No growth data";
  if (daysToThreshold !== null) {
    if (daysToThreshold < 1) {
      maintenanceWindow = `Urgent (< 1 day)`;
    } else if (daysToThreshold < 7) {
      maintenanceWindow = `Soon (${Math.ceil(daysToThreshold)} days)`;
    } else if (daysToThreshold < 30) {
      maintenanceWindow = `Scheduled (${Math.ceil(daysToThreshold)} days)`;
    } else {
      maintenanceWindow = `Not urgent (${Math.ceil(daysToThreshold)} days)`;
    }
  }

  // Determine growth trend
  let trend: "normal" | "elevated" | "anomalous" = "normal";
  if (isAnomaly) {
    trend = "anomalous";
  } else if (factor > 1.5) {
    trend = "elevated";
  }

  return {
    current_size_mb: currentSizeMb,
    current_lines: currentLines,
    growth_rate_kb_hour: growthRateKbHour,
    growth_rate_lines_day: growthRateLinesDay,
    days_to_threshold_5mb: daysToThreshold,
    estimated_maintenance_window: maintenanceWindow,
    growth_trend: trend,
    anomaly_factor: factor,
  };
}
