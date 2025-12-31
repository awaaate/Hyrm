#!/usr/bin/env bun
/**
 * Memory System Monitor & Visualizer
 * Phase 3: Optimization
 * 
 * Real-time monitoring and visualization of memory system performance.
 * Provides insights into efficiency, effectiveness, and learning metrics.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const MEMORY_DIR = '/app/workspace/memory';

interface DashboardData {
  state: any;
  metrics: any;
  files: FileInfo[];
  health: HealthIndicators;
  trends: Trends;
  recommendations: string[];
}

interface FileInfo {
  name: string;
  path: string;
  bytes: number;
  tokens: number;
  category: string;
  lastModified: Date;
}

interface HealthIndicators {
  overall: 'excellent' | 'good' | 'warning' | 'critical';
  memoryOverhead: string;
  contextContinuity: string;
  recoveryRate: string;
  tokenEfficiency: string;
}

interface Trends {
  sessionsGrowth: string;
  tasksVelocity: string;
  knowledgeAccumulation: string;
  optimizationRate: string;
}

class Monitor {
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
  
  private loadFile(filename: string): any {
    const path = join(MEMORY_DIR, filename);
    if (!existsSync(path)) return null;
    
    try {
      const content = readFileSync(path, 'utf-8');
      if (filename.endsWith('.json')) {
        return JSON.parse(content);
      }
      return content;
    } catch {
      return null;
    }
  }
  
  private analyzeFiles(): FileInfo[] {
    const files: FileInfo[] = [];
    
    const scan = (dir: string, prefix = '') => {
      const items = readdirSync(dir);
      
      for (const item of items) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.')) {
          scan(fullPath, `${prefix}${item}/`);
        } else if (stat.isFile() && !item.startsWith('.')) {
          let category = 'other';
          if (item.endsWith('.json')) category = 'data';
          if (item.endsWith('.md')) category = 'docs';
          if (item.endsWith('.ts')) category = 'tools';
          if (item.endsWith('.sh')) category = 'scripts';
          
          const content = readFileSync(fullPath, 'utf-8');
          
          files.push({
            name: item,
            path: `${prefix}${item}`,
            bytes: stat.size,
            tokens: this.estimateTokens(content),
            category,
            lastModified: stat.mtime
          });
        }
      }
    };
    
    scan(MEMORY_DIR);
    return files;
  }
  
  private calculateHealth(state: any, metrics: any): HealthIndicators {
    const overhead = metrics.efficiency.memory_overhead_percent;
    const continuity = metrics.effectiveness.context_continuity_score * 100;
    const recoveryRate = metrics.efficiency.successful_recoveries / 
      (metrics.efficiency.successful_recoveries + metrics.efficiency.failed_recoveries);
    
    let overall: 'excellent' | 'good' | 'warning' | 'critical' = 'good';
    
    if (overhead < 1.0 && continuity >= 95 && recoveryRate === 1.0) {
      overall = 'excellent';
    } else if (overhead < 2.0 && continuity >= 90 && recoveryRate >= 0.95) {
      overall = 'good';
    } else if (overhead < 5.0 && continuity >= 80 && recoveryRate >= 0.90) {
      overall = 'warning';
    } else {
      overall = 'critical';
    }
    
    return {
      overall,
      memoryOverhead: overhead < 1.0 ? '✓ Excellent' : overhead < 2.0 ? '✓ Good' : overhead < 5.0 ? '⚠ Warning' : '✗ Critical',
      contextContinuity: continuity >= 95 ? '✓ Excellent' : continuity >= 90 ? '✓ Good' : continuity >= 80 ? '⚠ Warning' : '✗ Critical',
      recoveryRate: recoveryRate === 1.0 ? '✓ Perfect' : recoveryRate >= 0.95 ? '✓ Excellent' : recoveryRate >= 0.90 ? '⚠ Good' : '✗ Needs attention',
      tokenEfficiency: overhead < 1.0 ? '✓ Excellent (< 1%)' : overhead < 2.0 ? '✓ Good (< 2%)' : overhead < 5.0 ? '⚠ Acceptable (< 5%)' : '✗ Poor (> 5%)'
    };
  }
  
  private calculateTrends(metrics: any): Trends {
    const sessions = metrics.efficiency.total_sessions;
    const tasksCompleted = metrics.effectiveness.tasks_completed;
    const knowledge = metrics.learning.knowledge_articles;
    const optimizations = metrics.learning.optimizations_applied;
    
    return {
      sessionsGrowth: `${sessions} sessions (avg ${(metrics.sessions?.total_duration_minutes / sessions || 0).toFixed(0)} min each)`,
      tasksVelocity: `${tasksCompleted} completed, ${metrics.effectiveness.tasks_in_progress} in progress`,
      knowledgeAccumulation: `${knowledge} articles, ${metrics.learning.patterns_identified} patterns identified`,
      optimizationRate: `${optimizations} optimizations (${(optimizations / sessions).toFixed(1)} per session)`
    };
  }
  
  private generateRecommendations(state: any, metrics: any, files: FileInfo[]): string[] {
    const recommendations: string[] = [];
    
    const overhead = metrics.efficiency.memory_overhead_percent;
    if (overhead > 2.0) {
      recommendations.push('Consider running compression: bun memory/compress.ts compress');
    }
    
    const totalSessions = metrics.efficiency.total_sessions;
    if (totalSessions >= 5 && totalSessions % 3 === 0) {
      recommendations.push('Time to extract knowledge: bun memory/extractor.ts extract 3');
    }
    
    const cacheFiles = files.filter(f => f.path.includes('.cache/'));
    if (cacheFiles.length === 0) {
      recommendations.push('Cache is empty - consider rebuilding search index if needed');
    }
    
    const archiveSize = files.find(f => f.name === 'archive.md')?.tokens || 0;
    if (archiveSize > 3000) {
      recommendations.push('Archive.md is large (> 3000 tokens) - consider further compression');
    }
    
    const tasksInProgress = metrics.effectiveness.tasks_in_progress;
    if (tasksInProgress > 5) {
      recommendations.push(`Many tasks in progress (${tasksInProgress}) - consider prioritizing or archiving`);
    }
    
    if (recommendations.length === 0) {
      recommendations.push('System running optimally - no recommendations at this time');
    }
    
    return recommendations;
  }
  
  private createProgressBar(value: number, max: number, width = 30): string {
    const percent = Math.min(100, (value / max) * 100);
    const filled = Math.floor((percent / 100) * width);
    const empty = width - filled;
    
    let color = '█';
    if (percent > 80) color = '▓';
    if (percent > 95) color = '░';
    
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${percent.toFixed(1)}%`;
  }
  
  async dashboard(): Promise<void> {
    console.log('=== MEMORY SYSTEM MONITOR ===\n');
    console.log(`Generated: ${new Date().toLocaleString()}\n`);
    
    const state = this.loadFile('state.json');
    const metrics = this.loadFile('metrics.json');
    const files = this.analyzeFiles();
    
    if (!state || !metrics) {
      console.log('✗ Cannot load state or metrics files');
      return;
    }
    
    const health = this.calculateHealth(state, metrics);
    const trends = this.calculateTrends(metrics);
    const recommendations = this.generateRecommendations(state, metrics, files);
    
    // System Status
    console.log('📊 SYSTEM STATUS\n');
    console.log(`  Overall Health: ${health.overall.toUpperCase()} ${health.overall === 'excellent' ? '✓' : health.overall === 'good' ? '○' : health.overall === 'warning' ? '⚠' : '✗'}`);
    console.log(`  Current Phase: ${state.status}`);
    console.log(`  Session: ${state.session_count}`);
    console.log(`  Objective: ${state.current_objective}\n`);
    
    // Health Indicators
    console.log('🏥 HEALTH INDICATORS\n');
    console.log(`  Memory Overhead:     ${health.memoryOverhead.padEnd(20)} (${metrics.efficiency.memory_overhead_percent.toFixed(2)}%)`);
    console.log(`  Context Continuity:  ${health.contextContinuity.padEnd(20)} (${(metrics.effectiveness.context_continuity_score * 100).toFixed(0)}%)`);
    console.log(`  Recovery Rate:       ${health.recoveryRate.padEnd(20)} (${metrics.efficiency.successful_recoveries}/${metrics.efficiency.successful_recoveries + metrics.efficiency.failed_recoveries})`);
    console.log(`  Token Efficiency:    ${health.tokenEfficiency}\n`);
    
    // Performance Metrics
    console.log('⚡ PERFORMANCE METRICS\n');
    
    const coreFiles = files.filter(f => ['state.json', 'working.md', 'metrics.json'].includes(f.name));
    const coreTokens = coreFiles.reduce((sum, f) => sum + f.tokens, 0);
    const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);
    
    console.log(`  Core Memory:    ${coreTokens.toLocaleString().padStart(6)} tokens  ${this.createProgressBar(coreTokens, 4000, 20)}`);
    console.log(`  Total Files:    ${files.length.toString().padStart(6)} files`);
    console.log(`  Total Size:     ${(files.reduce((sum, f) => sum + f.bytes, 0) / 1024).toFixed(1).padStart(6)} KB\n`);
    
    // Trends
    console.log('📈 TRENDS\n');
    console.log(`  Sessions:       ${trends.sessionsGrowth}`);
    console.log(`  Tasks:          ${trends.tasksVelocity}`);
    console.log(`  Knowledge:      ${trends.knowledgeAccumulation}`);
    console.log(`  Optimizations:  ${trends.optimizationRate}\n`);
    
    // File Breakdown
    console.log('📁 FILE BREAKDOWN\n');
    
    const byCategory = files.reduce((acc, f) => {
      if (!acc[f.category]) acc[f.category] = { count: 0, tokens: 0 };
      acc[f.category].count++;
      acc[f.category].tokens += f.tokens;
      return acc;
    }, {} as Record<string, { count: number; tokens: number }>);
    
    for (const [cat, stats] of Object.entries(byCategory).sort((a, b) => b[1].tokens - a[1].tokens)) {
      const pct = ((stats.tokens / totalTokens) * 100).toFixed(1);
      console.log(`  ${cat.padEnd(10)} ${stats.count.toString().padStart(3)} files  ${stats.tokens.toLocaleString().padStart(8)} tokens (${pct.padStart(5)}%)`);
    }
    
    // Top Files
    console.log('\n\n📄 LARGEST FILES\n');
    const topFiles = files.sort((a, b) => b.tokens - a.tokens).slice(0, 8);
    for (const file of topFiles) {
      const pct = ((file.tokens / totalTokens) * 100).toFixed(1);
      console.log(`  ${file.tokens.toLocaleString().padStart(8)} tokens (${pct.padStart(5)}%)  ${file.path}`);
    }
    
    // Recommendations
    console.log('\n\n💡 RECOMMENDATIONS\n');
    for (const rec of recommendations) {
      console.log(`  • ${rec}`);
    }
    
    console.log('\n');
  }
  
  async quick(): Promise<void> {
    const state = this.loadFile('state.json');
    const metrics = this.loadFile('metrics.json');
    
    if (!state || !metrics) {
      console.log('✗ Cannot load state or metrics');
      return;
    }
    
    const health = this.calculateHealth(state, metrics);
    
    console.log('QUICK STATUS:');
    console.log(`  Health: ${health.overall.toUpperCase()} | Session: ${state.session_count} | Phase: ${state.status}`);
    console.log(`  Memory: ${metrics.efficiency.memory_overhead_percent.toFixed(2)}% | Continuity: ${(metrics.effectiveness.context_continuity_score * 100).toFixed(0)}% | Recovery: ${metrics.efficiency.successful_recoveries}/${metrics.efficiency.successful_recoveries + metrics.efficiency.failed_recoveries}`);
  }
}

// CLI
const main = async () => {
  const command = process.argv[2] || 'dashboard';
  const monitor = new Monitor();
  
  switch (command) {
    case 'dashboard':
    case 'dash':
      await monitor.dashboard();
      break;
      
    case 'quick':
    case 'q':
      await monitor.quick();
      break;
      
    case 'help':
    default:
      console.log('Memory System Monitor - Real-time performance visualization');
      console.log('\nUsage:');
      console.log('  bun memory/monitor.ts dashboard    Show full dashboard');
      console.log('  bun memory/monitor.ts quick         Quick status check');
      console.log('  bun memory/monitor.ts help          Show this help');
      break;
  }
};

main();
