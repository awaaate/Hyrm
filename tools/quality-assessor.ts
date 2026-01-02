#!/usr/bin/env node

/**
 * Task Quality Assessor
 * 
 * Evaluates completed tasks across multiple quality dimensions:
 * - Completeness: Did the task achieve its stated goal?
 * - Code Quality: Is the code clean, tested, documented?
 * - Efficiency: Token usage, time taken
 * - Documentation: Was work properly documented?
 * - Impact: Did this improve the system?
 */

import * as fs from 'fs';
import * as path from 'path';

interface QualityDimension {
  name: string;
  score: number;  // 0-10
  weight: number; // 0-1
  notes?: string;
}

interface QualityAssessment {
  task_id: string;
  task_title: string;
  assessed_at: string;
  assessed_by: string;
  dimensions: QualityDimension[];
  overall_score: number;
  strengths: string[];
  improvements: string[];
  lessons_learned?: string;
  metadata: {
    duration_minutes?: number;
    files_changed?: number;
    lines_added?: number;
    lines_removed?: number;
    tests_added?: number;
    automated_checks_passed?: boolean;
  };
}

interface QualityStore {
  version: string;
  assessments: QualityAssessment[];
  aggregate_stats: {
    total_assessed: number;
    avg_overall_score: number;
    by_dimension: Record<string, { avg: number; count: number }>;
  };
  last_updated: string;
}

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: string;
  status: string;
  created_at: string;
  completed_at?: string;
  notes?: string[];
}

class QualityAssessor {
  private storePath = '/app/workspace/memory/quality-assessments.json';
  private tasksPath = '/app/workspace/memory/tasks.json';
  private store: QualityStore;

  constructor() {
    this.store = this.loadStore();
  }

  private loadStore(): QualityStore {
    if (fs.existsSync(this.storePath)) {
      try {
        return JSON.parse(fs.readFileSync(this.storePath, 'utf-8'));
      } catch (e) {
        console.error('Failed to load quality store:', e);
      }
    }
    return {
      version: '1.0',
      assessments: [],
      aggregate_stats: {
        total_assessed: 0,
        avg_overall_score: 0,
        by_dimension: {}
      },
      last_updated: new Date().toISOString()
    };
  }

  private saveStore(): void {
    this.store.last_updated = new Date().toISOString();
    this.updateAggregateStats();
    fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2));
  }

  private updateAggregateStats(): void {
    const assessments = this.store.assessments;
    
    if (assessments.length === 0) {
      this.store.aggregate_stats = {
        total_assessed: 0,
        avg_overall_score: 0,
        by_dimension: {}
      };
      return;
    }

    // Calculate overall average
    const totalScore = assessments.reduce((sum, a) => sum + a.overall_score, 0);
    
    // Calculate by dimension
    const byDimension: Record<string, { total: number; count: number }> = {};
    for (const assessment of assessments) {
      for (const dim of assessment.dimensions) {
        if (!byDimension[dim.name]) {
          byDimension[dim.name] = { total: 0, count: 0 };
        }
        byDimension[dim.name].total += dim.score;
        byDimension[dim.name].count++;
      }
    }

    this.store.aggregate_stats = {
      total_assessed: assessments.length,
      avg_overall_score: totalScore / assessments.length,
      by_dimension: Object.fromEntries(
        Object.entries(byDimension).map(([name, data]) => [
          name,
          { avg: data.total / data.count, count: data.count }
        ])
      )
    };
  }

  private getTask(taskId: string): Task | null {
    if (!fs.existsSync(this.tasksPath)) return null;
    
    try {
      const tasks = JSON.parse(fs.readFileSync(this.tasksPath, 'utf-8'));
      return tasks.tasks?.find((t: Task) => t.id === taskId) || null;
    } catch {
      return null;
    }
  }

  /**
   * Assess a completed task using automated checks and manual input
   */
  assess(options: {
    task_id: string;
    assessed_by?: string;
    completeness?: number;
    code_quality?: number;
    documentation?: number;
    efficiency?: number;
    impact?: number;
    strengths?: string[];
    improvements?: string[];
    lessons_learned?: string;
    metadata?: Partial<QualityAssessment['metadata']>;
  }): QualityAssessment | null {
    const task = this.getTask(options.task_id);
    
    if (!task) {
      console.error(`Task ${options.task_id} not found`);
      return null;
    }
    
    if (task.status !== 'completed') {
      console.error(`Task ${options.task_id} is not completed (status: ${task.status})`);
      return null;
    }

    // Check if already assessed
    const existing = this.store.assessments.find(a => a.task_id === options.task_id);
    if (existing) {
      console.log(`Task ${options.task_id} already assessed. Updating...`);
    }

    // Build dimensions with defaults and provided values
    const dimensions: QualityDimension[] = [
      {
        name: 'completeness',
        score: options.completeness ?? 7,
        weight: 0.3,
        notes: 'Did the task achieve its stated goal?'
      },
      {
        name: 'code_quality',
        score: options.code_quality ?? 7,
        weight: 0.25,
        notes: 'Is the code clean, tested, maintainable?'
      },
      {
        name: 'documentation',
        score: options.documentation ?? 6,
        weight: 0.15,
        notes: 'Was work properly documented?'
      },
      {
        name: 'efficiency',
        score: options.efficiency ?? 7,
        weight: 0.15,
        notes: 'Token usage, time efficiency'
      },
      {
        name: 'impact',
        score: options.impact ?? 7,
        weight: 0.15,
        notes: 'Did this improve the system significantly?'
      }
    ];

    // Calculate weighted overall score (already 1-10 scale)
    const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
    const overallScore = dimensions.reduce(
      (sum, d) => sum + d.score * d.weight,
      0
    ) / totalWeight;

    // Calculate duration if available
    let durationMinutes: number | undefined;
    if (task.created_at && task.completed_at) {
      const created = new Date(task.created_at).getTime();
      const completed = new Date(task.completed_at).getTime();
      durationMinutes = Math.round((completed - created) / 60000);
    }

    const assessment: QualityAssessment = {
      task_id: options.task_id,
      task_title: task.title,
      assessed_at: new Date().toISOString(),
      assessed_by: options.assessed_by || 'orchestrator',
      dimensions,
      overall_score: Math.round(overallScore * 10) / 10,
      strengths: options.strengths || [],
      improvements: options.improvements || [],
      lessons_learned: options.lessons_learned,
      metadata: {
        duration_minutes: durationMinutes,
        ...options.metadata
      }
    };

    // Update or add assessment
    if (existing) {
      const index = this.store.assessments.indexOf(existing);
      this.store.assessments[index] = assessment;
    } else {
      this.store.assessments.push(assessment);
    }

    // Update task with quality score
    this.updateTaskQuality(options.task_id, overallScore, assessment.lessons_learned);

    this.saveStore();
    return assessment;
  }

  /**
   * Update the task's quality_score in tasks.json
   */
  private updateTaskQuality(taskId: string, score: number, notes?: string): void {
    if (!fs.existsSync(this.tasksPath)) return;
    
    try {
      const tasksData = JSON.parse(fs.readFileSync(this.tasksPath, 'utf-8'));
      const task = tasksData.tasks?.find((t: any) => t.id === taskId);
      
      if (task) {
        task.quality_score = Math.round(score * 10) / 10;
        if (notes) {
          task.quality_notes = notes;
        }
        task.updated_at = new Date().toISOString();
        fs.writeFileSync(this.tasksPath, JSON.stringify(tasksData, null, 2));
      }
    } catch (e) {
      console.error('Failed to update task quality:', e);
    }
  }

  /**
   * Quick assess - minimal input for fast assessments
   */
  quickAssess(taskId: string, overallScore: number, lessonLearned?: string): QualityAssessment | null {
    // Distribute the overall score across dimensions proportionally
    const normalized = Math.max(1, Math.min(10, overallScore));
    
    return this.assess({
      task_id: taskId,
      completeness: normalized,
      code_quality: normalized * 0.9,
      documentation: normalized * 0.8,
      efficiency: normalized * 0.95,
      impact: normalized * 0.85,
      lessons_learned: lessonLearned
    });
  }

  /**
   * Get assessment for a specific task
   */
  getAssessment(taskId: string): QualityAssessment | null {
    return this.store.assessments.find(a => a.task_id === taskId) || null;
  }

  /**
   * Get all unassessed completed tasks
   */
  getUnassessedTasks(): Task[] {
    if (!fs.existsSync(this.tasksPath)) return [];
    
    try {
      const tasks = JSON.parse(fs.readFileSync(this.tasksPath, 'utf-8'));
      const assessedIds = new Set(this.store.assessments.map(a => a.task_id));
      
      return (tasks.tasks || [])
        .filter((t: Task) => t.status === 'completed' && !assessedIds.has(t.id));
    } catch {
      return [];
    }
  }

  /**
   * Get aggregate quality stats
   */
  getStats() {
    return this.store.aggregate_stats;
  }

  /**
   * Get quality trends - compare recent vs older assessments
   */
  getQualityTrends(): {
    recent_avg: number;
    older_avg: number;
    trend: 'improving' | 'declining' | 'stable';
    by_dimension: Record<string, { recent: number; older: number }>;
  } {
    const assessments = this.store.assessments.sort(
      (a, b) => new Date(b.assessed_at).getTime() - new Date(a.assessed_at).getTime()
    );
    
    const half = Math.floor(assessments.length / 2);
    const recent = assessments.slice(0, half);
    const older = assessments.slice(half);
    
    const recentAvg = recent.length > 0
      ? recent.reduce((s, a) => s + a.overall_score, 0) / recent.length
      : 0;
    const olderAvg = older.length > 0
      ? older.reduce((s, a) => s + a.overall_score, 0) / older.length
      : 0;
    
    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (recentAvg > olderAvg + 0.5) trend = 'improving';
    if (recentAvg < olderAvg - 0.5) trend = 'declining';

    // By dimension trends
    const byDimension: Record<string, { recent: number; older: number }> = {};
    const dimensions = ['completeness', 'code_quality', 'documentation', 'efficiency', 'impact'];
    
    for (const dim of dimensions) {
      const recentDimScores = recent.flatMap(a => 
        a.dimensions.filter(d => d.name === dim).map(d => d.score)
      );
      const olderDimScores = older.flatMap(a => 
        a.dimensions.filter(d => d.name === dim).map(d => d.score)
      );
      
      byDimension[dim] = {
        recent: recentDimScores.length > 0 
          ? recentDimScores.reduce((s, v) => s + v, 0) / recentDimScores.length 
          : 0,
        older: olderDimScores.length > 0 
          ? olderDimScores.reduce((s, v) => s + v, 0) / olderDimScores.length 
          : 0
      };
    }
    
    return { recent_avg: recentAvg, older_avg: olderAvg, trend, by_dimension: byDimension };
  }

  /**
   * Get lessons learned from all assessments
   */
  getLessonsLearned(): string[] {
    return this.store.assessments
      .filter(a => a.lessons_learned)
      .map(a => `[${a.task_title}] ${a.lessons_learned}`);
  }

  /**
   * Print summary report
   */
  printReport(): void {
    const stats = this.getStats();
    const trends = this.getQualityTrends();
    const unassessed = this.getUnassessedTasks();
    
    console.log('\n📊 Task Quality Report\n');
    console.log('='.repeat(50));
    
    console.log(`\nOverall Statistics:`);
    console.log(`  Total Assessed: ${stats.total_assessed}`);
    console.log(`  Average Score: ${stats.avg_overall_score.toFixed(1)}/10`);
    console.log(`  Trend: ${trends.trend === 'improving' ? '📈' : trends.trend === 'declining' ? '📉' : '➡️'} ${trends.trend}`);
    
    console.log(`\nBy Dimension:`);
    for (const [name, data] of Object.entries(stats.by_dimension)) {
      const trendArrow = trends.by_dimension[name]?.recent > trends.by_dimension[name]?.older ? '↑' : 
                         trends.by_dimension[name]?.recent < trends.by_dimension[name]?.older ? '↓' : '→';
      console.log(`  ${name.padEnd(15)} ${data.avg.toFixed(1)}/10 ${trendArrow}`);
    }
    
    if (unassessed.length > 0) {
      console.log(`\n⚠️  Unassessed Completed Tasks: ${unassessed.length}`);
      unassessed.slice(0, 5).forEach(t => {
        console.log(`  - [${t.id.slice(-8)}] ${t.title}`);
      });
    }
    
    const lessons = this.getLessonsLearned();
    if (lessons.length > 0) {
      console.log(`\n💡 Recent Lessons Learned:`);
      lessons.slice(-5).forEach(l => console.log(`  • ${l}`));
    }
    
    console.log('\n' + '='.repeat(50));
  }

  /**
   * Export assessments as JSON for analysis
   */
  exportData(): QualityStore {
    return this.store;
  }
}

// CLI Interface
const qa = new QualityAssessor();
const command = process.argv[2] || 'report';

switch (command) {
  case 'assess':
    const taskId = process.argv[3];
    const score = parseFloat(process.argv[4] || '7');
    const lesson = process.argv[5];
    
    if (!taskId) {
      console.log('Usage: quality-assessor assess <task_id> [score] [lesson_learned]');
      process.exit(1);
    }
    
    const result = qa.quickAssess(taskId, score, lesson);
    if (result) {
      console.log(`\n✅ Assessed task: ${result.task_title}`);
      console.log(`   Overall Score: ${result.overall_score}/10`);
    }
    break;

  case 'unassessed':
    const unassessed = qa.getUnassessedTasks();
    if (unassessed.length === 0) {
      console.log('All completed tasks have been assessed!');
    } else {
      console.log(`\n${unassessed.length} unassessed completed tasks:\n`);
      unassessed.forEach(t => {
        console.log(`  [${t.id}] ${t.title}`);
      });
    }
    break;

  case 'trends':
    const trends = qa.getQualityTrends();
    console.log('\n📈 Quality Trends\n');
    console.log(`Recent Average: ${trends.recent_avg.toFixed(1)}`);
    console.log(`Older Average: ${trends.older_avg.toFixed(1)}`);
    console.log(`Trend: ${trends.trend}\n`);
    
    console.log('By Dimension:');
    for (const [dim, data] of Object.entries(trends.by_dimension)) {
      const change = data.recent - data.older;
      const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
      console.log(`  ${dim}: ${data.recent.toFixed(1)} ${arrow} (was ${data.older.toFixed(1)})`);
    }
    break;

  case 'lessons':
    const lessons = qa.getLessonsLearned();
    console.log('\n💡 Lessons Learned:\n');
    lessons.forEach((l, i) => console.log(`${i + 1}. ${l}`));
    break;

  case 'report':
    qa.printReport();
    break;

  case 'export':
    const data = qa.exportData();
    console.log(JSON.stringify(data, null, 2));
    break;

  default:
    console.log('Usage: quality-assessor <command>');
    console.log('Commands:');
    console.log('  report             - Print quality summary report');
    console.log('  assess <id> [score] [lesson] - Assess a completed task');
    console.log('  unassessed         - List unassessed completed tasks');
    console.log('  trends             - Show quality trends over time');
    console.log('  lessons            - Show lessons learned');
    console.log('  export             - Export all assessment data as JSON');
}
