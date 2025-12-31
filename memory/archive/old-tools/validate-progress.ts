#!/usr/bin/env bun

/**
 * Progress Validation Tool
 * 
 * Objectively measures if the memory system is making real progress
 * Provides critical assessment and actionable recommendations
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const MEMORY_DIR = '/app/workspace/memory';

interface State {
  session_count: number;
  status: string;
  active_tasks: string[];
  recent_achievements: string[];
  last_session: string;
}

interface Metrics {
  efficiency: {
    successful_recoveries: number;
    failed_recoveries: number;
    memory_overhead_percent: number;
  };
  effectiveness: {
    tasks_completed: number;
    tasks_abandoned: number;
    tasks_in_progress: number;
    context_continuity_score: number;
  };
  learning: {
    knowledge_articles: number;
    patterns_identified: number;
    optimizations_applied: number;
  };
}

interface ProgressReport {
  overall_score: number;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  areas: {
    recovery: { score: number; status: string; details: string };
    productivity: { score: number; status: string; details: string };
    learning: { score: number; status: string; details: string };
    efficiency: { score: number; status: string; details: string };
  };
  critical_issues: string[];
  recommendations: string[];
  achievements_validated: boolean;
}

function loadState(): State | null {
  const statePath = join(MEMORY_DIR, 'state.json');
  if (!existsSync(statePath)) {
    return null;
  }
  return JSON.parse(readFileSync(statePath, 'utf-8'));
}

function loadMetrics(): Metrics | null {
  const metricsPath = join(MEMORY_DIR, 'metrics.json');
  if (!existsSync(metricsPath)) {
    return null;
  }
  return JSON.parse(readFileSync(metricsPath, 'utf-8'));
}

function validateRecovery(state: State, metrics: Metrics): { score: number; status: string; details: string } {
  const successRate = metrics.efficiency.successful_recoveries / 
                     (metrics.efficiency.successful_recoveries + metrics.efficiency.failed_recoveries);
  
  let score = successRate * 100;
  let status = 'EXCELLENT';
  let details = `${metrics.efficiency.successful_recoveries}/${metrics.efficiency.successful_recoveries + metrics.efficiency.failed_recoveries} recoveries successful (${(successRate * 100).toFixed(1)}%)`;
  
  if (successRate < 0.95) {
    status = 'WARNING';
    details += ' - Below 95% target';
  } else if (successRate < 0.80) {
    status = 'CRITICAL';
    details += ' - Recovery system failing';
  }
  
  return { score, status, details };
}

function validateProductivity(state: State, metrics: Metrics): { score: number; status: string; details: string } {
  const { tasks_completed, tasks_abandoned, tasks_in_progress } = metrics.effectiveness;
  const total_tasks = tasks_completed + tasks_abandoned + tasks_in_progress;
  
  if (total_tasks === 0) {
    return { score: 0, status: 'CRITICAL', details: 'No tasks tracked - system may be idle' };
  }
  
  const completion_rate = tasks_completed / total_tasks;
  const abandonment_rate = tasks_abandoned / total_tasks;
  
  let score = (completion_rate * 100) - (abandonment_rate * 50);
  let status = 'GOOD';
  let details = `${tasks_completed} completed, ${tasks_in_progress} in progress, ${tasks_abandoned} abandoned`;
  
  if (state.active_tasks.length === 0) {
    status = 'CRITICAL';
    details += ' - NO ACTIVE TASKS';
    score -= 50;
  } else if (tasks_in_progress > 5) {
    status = 'WARNING';
    details += ' - Too many concurrent tasks';
    score -= 20;
  }
  
  if (abandonment_rate > 0.2) {
    status = 'WARNING';
    details += ' - High abandonment rate';
  }
  
  return { score: Math.max(0, score), status, details };
}

function validateLearning(metrics: Metrics): { score: number; status: string; details: string } {
  const { knowledge_articles, patterns_identified, optimizations_applied } = metrics.learning;
  
  // Score based on knowledge accumulation
  let score = (knowledge_articles * 10) + (patterns_identified * 2) + (optimizations_applied * 5);
  score = Math.min(100, score); // Cap at 100
  
  let status = 'GOOD';
  let details = `${knowledge_articles} articles, ${patterns_identified} patterns, ${optimizations_applied} optimizations`;
  
  if (knowledge_articles === 0) {
    status = 'WARNING';
    details += ' - No knowledge articles created';
    score = Math.min(score, 50);
  }
  
  if (score > 80) status = 'EXCELLENT';
  if (score < 30) status = 'CRITICAL';
  
  return { score, status, details };
}

function validateEfficiency(metrics: Metrics): { score: number; status: string; details: string } {
  const overhead = metrics.efficiency.memory_overhead_percent;
  
  let score = 100;
  let status = 'EXCELLENT';
  let details = `${overhead.toFixed(2)}% memory overhead`;
  
  if (overhead > 1) {
    score = 100 - ((overhead - 1) * 20);
    status = 'GOOD';
    details += ' - Acceptable';
  }
  
  if (overhead > 5) {
    score = 100 - ((overhead - 5) * 40);
    status = 'WARNING';
    details += ' - Above 5% target';
  }
  
  if (overhead > 10) {
    score = 0;
    status = 'CRITICAL';
    details += ' - Memory bloat detected';
  }
  
  return { score: Math.max(0, score), status, details };
}

function validateAchievements(state: State): boolean {
  // Check if recent achievements are actually recent (current session)
  const currentSession = `Session ${state.session_count}`;
  return state.recent_achievements.some(a => a.includes(currentSession));
}

function generateRecommendations(report: ProgressReport, state: State, metrics: Metrics): string[] {
  const recommendations: string[] = [];
  
  // Recovery recommendations
  if (report.areas.recovery.score < 95) {
    recommendations.push('CRITICAL: Investigate recovery failures - check boot.sh and state.json integrity');
  }
  
  // Productivity recommendations
  if (state.active_tasks.length === 0) {
    recommendations.push('CRITICAL: Create concrete action items - system is idle without tasks');
  } else if (state.active_tasks.length > 5) {
    recommendations.push('WARNING: Too many concurrent tasks - focus on completing existing work');
  }
  
  if (metrics.effectiveness.tasks_in_progress > metrics.effectiveness.tasks_completed) {
    recommendations.push('WARNING: More tasks started than completed - improve task completion rate');
  }
  
  // Learning recommendations
  if (metrics.learning.knowledge_articles < state.session_count / 3) {
    recommendations.push('Recommendation: Extract more knowledge - aim for 1 article per 3 sessions');
  }
  
  if (metrics.learning.optimizations_applied < 5) {
    recommendations.push('Recommendation: Apply more optimizations - look for improvement opportunities');
  }
  
  // Efficiency recommendations
  if (metrics.efficiency.memory_overhead_percent > 2) {
    recommendations.push('WARNING: Memory overhead increasing - run compression and optimization tools');
  }
  
  // Achievement validation
  if (!report.achievements_validated) {
    recommendations.push('WARNING: Recent achievements don\'t reference current session - update documentation');
  }
  
  // Session-specific checks
  const sessionsSinceLastKnowledge = state.session_count - metrics.learning.knowledge_articles * 2;
  if (sessionsSinceLastKnowledge > 3) {
    recommendations.push('Recommendation: Create knowledge article - capture learnings from recent sessions');
  }
  
  return recommendations;
}

function assessOverallStatus(scores: number[]): 'excellent' | 'good' | 'warning' | 'critical' {
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  
  if (avgScore >= 90) return 'excellent';
  if (avgScore >= 70) return 'good';
  if (avgScore >= 50) return 'warning';
  return 'critical';
}

function validateProgress(): ProgressReport {
  console.log('🔍 Progress Validation Tool\n');
  console.log('═══════════════════════════════════════════════════\n');
  
  const state = loadState();
  const metrics = loadMetrics();
  
  if (!state) {
    console.error('❌ CRITICAL: state.json not found');
    process.exit(1);
  }
  
  if (!metrics) {
    console.error('❌ CRITICAL: metrics.json not found');
    process.exit(1);
  }
  
  console.log(`📊 Session: ${state.session_count}`);
  console.log(`📍 Status: ${state.status}`);
  console.log(`📝 Active Tasks: ${state.active_tasks.length}\n`);
  
  // Validate each area
  const recovery = validateRecovery(state, metrics);
  const productivity = validateProductivity(state, metrics);
  const learning = validateLearning(metrics);
  const efficiency = validateEfficiency(metrics);
  
  const achievements_validated = validateAchievements(state);
  
  const scores = [recovery.score, productivity.score, learning.score, efficiency.score];
  const overall_score = scores.reduce((a, b) => a + b, 0) / scores.length;
  const status = assessOverallStatus(scores);
  
  const critical_issues: string[] = [];
  if (recovery.status === 'CRITICAL') critical_issues.push(`Recovery: ${recovery.details}`);
  if (productivity.status === 'CRITICAL') critical_issues.push(`Productivity: ${productivity.details}`);
  if (learning.status === 'CRITICAL') critical_issues.push(`Learning: ${learning.details}`);
  if (efficiency.status === 'CRITICAL') critical_issues.push(`Efficiency: ${efficiency.details}`);
  
  const report: ProgressReport = {
    overall_score,
    status,
    areas: { recovery, productivity, learning, efficiency },
    critical_issues,
    recommendations: [],
    achievements_validated
  };
  
  report.recommendations = generateRecommendations(report, state, metrics);
  
  // Display report
  console.log('Assessment Results:');
  console.log('───────────────────────────────────────────────────');
  console.log(`\n🎯 Overall Score: ${overall_score.toFixed(1)}/100 - ${status.toUpperCase()}\n`);
  
  console.log('Area Breakdown:');
  console.log(`  Recovery:     ${recovery.score.toFixed(0)}/100 - ${recovery.status}`);
  console.log(`                ${recovery.details}`);
  console.log(`  Productivity: ${productivity.score.toFixed(0)}/100 - ${productivity.status}`);
  console.log(`                ${productivity.details}`);
  console.log(`  Learning:     ${learning.score.toFixed(0)}/100 - ${learning.status}`);
  console.log(`                ${learning.details}`);
  console.log(`  Efficiency:   ${efficiency.score.toFixed(0)}/100 - ${efficiency.status}`);
  console.log(`                ${efficiency.details}\n`);
  
  if (critical_issues.length > 0) {
    console.log('🚨 Critical Issues:');
    critical_issues.forEach((issue, i) => console.log(`  ${i + 1}. ${issue}`));
    console.log('');
  }
  
  if (report.recommendations.length > 0) {
    console.log('💡 Recommendations:');
    report.recommendations.forEach((rec, i) => console.log(`  ${i + 1}. ${rec}`));
    console.log('');
  }
  
  console.log('───────────────────────────────────────────────────');
  
  if (status === 'critical') {
    console.log('\n⚠️  CRITICAL STATUS: Immediate action required!\n');
  } else if (status === 'excellent') {
    console.log('\n✅ EXCELLENT: System performing well!\n');
  }
  
  return report;
}

// Run validation
const report = validateProgress();

// Exit with appropriate code
if (report.status === 'critical') {
  process.exit(1);
} else {
  process.exit(0);
}
