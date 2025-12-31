#!/usr/bin/env bun
/**
 * Self-Optimization System
 * Phase 3: Optimization
 * 
 * Analyzes memory system performance and automatically applies optimizations.
 * Learns from usage patterns to improve efficiency over time.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const MEMORY_DIR = '/app/workspace/memory';
const METRICS_FILE = join(MEMORY_DIR, 'metrics.json');
const STATE_FILE = join(MEMORY_DIR, 'state.json');
const OPTIMIZATION_LOG = join(MEMORY_DIR, 'optimization-log.jsonl');

interface Metrics {
  efficiency: {
    avg_tokens_per_session: number;
    total_sessions: number;
    successful_recoveries: number;
    failed_recoveries: number;
    memory_overhead_percent: number;
  };
  effectiveness: {
    tasks_completed: number;
    tasks_in_progress: number;
    tasks_abandoned: number;
    context_continuity_score: number;
  };
  learning: {
    knowledge_articles: number;
    patterns_identified: number;
    optimizations_applied: number;
    discoveries?: number;
  };
  performance?: {
    avg_boot_time_ms: number;
    avg_load_tokens: number;
    cache_hit_rate: number;
  };
}

interface OptimizationRule {
  id: string;
  name: string;
  condition: (metrics: Metrics) => boolean;
  action: (metrics: Metrics) => Promise<{ applied: boolean; description: string }>;
  priority: number;
}

class SelfOptimizer {
  private metrics: Metrics;
  private optimizationRules: OptimizationRule[];
  
  constructor() {
    this.metrics = this.loadMetrics();
    this.optimizationRules = this.defineRules();
  }
  
  private loadMetrics(): Metrics {
    if (!existsSync(METRICS_FILE)) {
      throw new Error('Metrics file not found');
    }
    return JSON.parse(readFileSync(METRICS_FILE, 'utf-8'));
  }
  
  private saveMetrics() {
    writeFileSync(METRICS_FILE, JSON.stringify(this.metrics, null, 2));
  }
  
  private logOptimization(ruleId: string, description: string, success: boolean) {
    const entry = {
      timestamp: new Date().toISOString(),
      rule: ruleId,
      description,
      success,
      metrics_snapshot: {
        memory_overhead: this.metrics.efficiency.memory_overhead_percent,
        context_continuity: this.metrics.effectiveness.context_continuity_score * 100,
        optimizations_count: this.metrics.learning.optimizations_applied
      }
    };
    
    const log = JSON.stringify(entry) + '\n';
    
    try {
      const existing = existsSync(OPTIMIZATION_LOG) ? readFileSync(OPTIMIZATION_LOG, 'utf-8') : '';
      writeFileSync(OPTIMIZATION_LOG, existing + log);
    } catch (err) {
      console.error('Failed to log optimization:', err);
    }
  }
  
  private defineRules(): OptimizationRule[] {
    return [
      {
        id: 'compress_working_memory',
        name: 'Compress working memory if too large',
        priority: 1,
        condition: (m) => {
          // If working memory overhead is high
          return m.efficiency.memory_overhead_percent > 2.0;
        },
        action: async (m) => {
          try {
            // Run compression
            const { execSync } = await import('child_process');
            execSync('bun /app/workspace/memory/compress.ts compress', { stdio: 'inherit' });
            return { applied: true, description: 'Compressed working memory to reduce overhead' };
          } catch (err) {
            return { applied: false, description: `Compression failed: ${err}` };
          }
        }
      },
      {
        id: 'extract_knowledge',
        name: 'Extract knowledge from sessions',
        priority: 2,
        condition: (m) => {
          // Every 3 sessions, extract knowledge
          return m.efficiency.total_sessions % 3 === 0 && m.efficiency.total_sessions > 0;
        },
        action: async (m) => {
          try {
            const state = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
            const sessionCount = state.session_count;
            
            // Check if we already extracted for this session
            if (m.learning.knowledge_articles >= sessionCount) {
              return { applied: false, description: 'Knowledge already extracted for current session' };
            }
            
            // Run extractor on latest session
            const { execSync } = await import('child_process');
            execSync('bun /app/workspace/memory/extractor.ts auto', { stdio: 'inherit' });
            
            return { applied: true, description: `Extracted knowledge from session ${sessionCount}` };
          } catch (err) {
            return { applied: false, description: `Extraction failed: ${err}` };
          }
        }
      },
      {
        id: 'rebuild_search_index',
        name: 'Rebuild search index if knowledge increased',
        priority: 3,
        condition: (m) => {
          // If we have new knowledge articles
          const indexFile = join(MEMORY_DIR, '.cache/search-index.json');
          if (!existsSync(indexFile)) return true;
          
          const index = JSON.parse(readFileSync(indexFile, 'utf-8'));
          return index.documents.length < m.learning.knowledge_articles;
        },
        action: async (m) => {
          try {
            const { execSync } = await import('child_process');
            execSync('bun /app/workspace/memory/search.ts index', { stdio: 'inherit' });
            return { applied: true, description: 'Rebuilt search index with new knowledge' };
          } catch (err) {
            return { applied: false, description: `Index rebuild failed: ${err}` };
          }
        }
      },
      {
        id: 'update_loader_config',
        name: 'Update adaptive loader based on usage patterns',
        priority: 4,
        condition: (m) => {
          // If we have enough data to optimize
          return m.efficiency.total_sessions >= 5;
        },
        action: async (m) => {
          try {
            const configFile = join(MEMORY_DIR, 'loader-config.json');
            if (!existsSync(configFile)) {
              return { applied: false, description: 'Loader config not found' };
            }
            
            const config = JSON.parse(readFileSync(configFile, 'utf-8'));
            
            // Adjust token budget based on performance
            const currentOverhead = m.efficiency.memory_overhead_percent;
            if (currentOverhead < 1.0) {
              // We're doing great, can increase budget slightly
              config.optimization_settings.max_startup_tokens = Math.min(5000, config.optimization_settings.max_startup_tokens + 500);
            } else if (currentOverhead > 3.0) {
              // Too much overhead, reduce budget
              config.optimization_settings.max_startup_tokens = Math.max(2000, config.optimization_settings.max_startup_tokens - 500);
            }
            
            writeFileSync(configFile, JSON.stringify(config, null, 2));
            
            return {
              applied: true,
              description: `Adjusted token budget to ${config.optimization_settings.max_startup_tokens} (overhead: ${currentOverhead.toFixed(2)}%)`
            };
          } catch (err) {
            return { applied: false, description: `Config update failed: ${err}` };
          }
        }
      },
      {
        id: 'archive_old_plans',
        name: 'Archive old completed plans',
        priority: 5,
        condition: (m) => {
          const coordinatorState = join(MEMORY_DIR, 'coordinator-state.json');
          if (!existsSync(coordinatorState)) return false;
          
          const state = JSON.parse(readFileSync(coordinatorState, 'utf-8'));
          return state.completed_plans && state.completed_plans.length > 0;
        },
        action: async (m) => {
          try {
            const { execSync } = await import('child_process');
            execSync('bun /app/workspace/memory/optimize.ts plans', { stdio: 'inherit' });
            return { applied: true, description: 'Archived completed plans' };
          } catch (err) {
            return { applied: false, description: `Archiving failed: ${err}` };
          }
        }
      }
    ];
  }
  
  async analyze(): Promise<void> {
    console.log('=== SELF-OPTIMIZATION ANALYSIS ===\n');
    
    console.log('CURRENT METRICS:');
    console.log(`  Memory overhead: ${this.metrics.efficiency.memory_overhead_percent.toFixed(2)}%`);
    console.log(`  Context continuity: ${(this.metrics.effectiveness.context_continuity_score * 100).toFixed(0)}%`);
    console.log(`  Total sessions: ${this.metrics.efficiency.total_sessions}`);
    console.log(`  Tasks completed: ${this.metrics.effectiveness.tasks_completed}`);
    console.log(`  Knowledge articles: ${this.metrics.learning.knowledge_articles}`);
    console.log(`  Optimizations applied: ${this.metrics.learning.optimizations_applied}`);
    
    console.log('\n\nEVALUATING OPTIMIZATION RULES:\n');
    
    // Sort rules by priority
    const sortedRules = [...this.optimizationRules].sort((a, b) => a.priority - b.priority);
    
    for (const rule of sortedRules) {
      const shouldApply = rule.condition(this.metrics);
      const status = shouldApply ? '✓ TRIGGERED' : '○ Not triggered';
      console.log(`${status} - ${rule.name}`);
    }
  }
  
  async optimize(): Promise<void> {
    console.log('=== SELF-OPTIMIZATION ===\n');
    console.log('Analyzing performance and applying optimizations...\n');
    
    const sortedRules = [...this.optimizationRules].sort((a, b) => a.priority - b.priority);
    
    let appliedCount = 0;
    
    for (const rule of sortedRules) {
      if (rule.condition(this.metrics)) {
        console.log(`\n🔧 ${rule.name}...`);
        
        const result = await rule.action(this.metrics);
        
        if (result.applied) {
          console.log(`  ✓ ${result.description}`);
          this.metrics.learning.optimizations_applied++;
          appliedCount++;
          this.logOptimization(rule.id, result.description, true);
        } else {
          console.log(`  ○ ${result.description}`);
          this.logOptimization(rule.id, result.description, false);
        }
      }
    }
    
    if (appliedCount > 0) {
      this.saveMetrics();
      console.log(`\n\n✓ Applied ${appliedCount} optimization(s)`);
    } else {
      console.log('\n\n○ No optimizations needed - system is running optimally!');
    }
  }
  
  async showHistory(): Promise<void> {
    if (!existsSync(OPTIMIZATION_LOG)) {
      console.log('No optimization history yet.');
      return;
    }
    
    const log = readFileSync(OPTIMIZATION_LOG, 'utf-8');
    const entries = log.trim().split('\n').filter(l => l).map(l => JSON.parse(l));
    
    console.log('=== OPTIMIZATION HISTORY ===\n');
    
    for (const entry of entries.slice(-10)) {
      const date = new Date(entry.timestamp).toLocaleString();
      const status = entry.success ? '✓' : '✗';
      console.log(`${status} ${date}`);
      console.log(`   ${entry.description}`);
      console.log(`   Memory: ${entry.metrics_snapshot.memory_overhead.toFixed(2)}% | Continuity: ${entry.metrics_snapshot.context_continuity}%`);
      console.log();
    }
  }
}

// CLI
const main = async () => {
  const command = process.argv[2] || 'optimize';
  
  const optimizer = new SelfOptimizer();
  
  switch (command) {
    case 'analyze':
      await optimizer.analyze();
      break;
      
    case 'optimize':
      await optimizer.optimize();
      break;
      
    case 'history':
      await optimizer.showHistory();
      break;
      
    case 'help':
    default:
      console.log('Self-Optimization System - Automatically improve memory system');
      console.log('\nUsage:');
      console.log('  bun memory/self-optimize.ts optimize    Run optimizations');
      console.log('  bun memory/self-optimize.ts analyze     Analyze without applying');
      console.log('  bun memory/self-optimize.ts history     Show optimization history');
      console.log('  bun memory/self-optimize.ts help        Show this help');
      break;
  }
};

main();
