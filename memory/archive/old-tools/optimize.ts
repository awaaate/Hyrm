#!/usr/bin/env bun
/**
 * Memory System Optimizer
 * Phase 3: Optimization
 * 
 * Features:
 * - Move large cache files out of main memory directory
 * - Archive completed plans
 * - Implement adaptive loading strategies
 * - Auto-optimize based on usage patterns
 */

import { existsSync, mkdirSync, renameSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const MEMORY_DIR = '/app/workspace/memory';
const CACHE_DIR = join(MEMORY_DIR, '.cache');
const ARCHIVE_DIR = join(MEMORY_DIR, 'archive');

interface OptimizationResult {
  action: string;
  details: string;
  tokensSaved: number;
  success: boolean;
}

const results: OptimizationResult[] = [];

// Ensure directories exist
const ensureDir = (dir: string) => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`✓ Created directory: ${dir}`);
  }
};

// Move large cache files
const moveToCacheDir = (filename: string): OptimizationResult => {
  const src = join(MEMORY_DIR, filename);
  
  if (!existsSync(src)) {
    return { action: 'move_to_cache', details: `${filename} not found`, tokensSaved: 0, success: false };
  }
  
  ensureDir(CACHE_DIR);
  const dest = join(CACHE_DIR, filename);
  
  try {
    const content = readFileSync(src, 'utf-8');
    const tokens = Math.ceil(content.length / 4);
    
    renameSync(src, dest);
    
    return {
      action: 'move_to_cache',
      details: `Moved ${filename} to .cache/`,
      tokensSaved: tokens,
      success: true
    };
  } catch (err) {
    return {
      action: 'move_to_cache',
      details: `Failed to move ${filename}: ${err}`,
      tokensSaved: 0,
      success: false
    };
  }
};

// Archive completed plans
const archiveCompletedPlans = (): OptimizationResult => {
  const plansDir = join(MEMORY_DIR, 'plans');
  const coordinatorStatePath = join(MEMORY_DIR, 'coordinator-state.json');
  
  if (!existsSync(plansDir) || !existsSync(coordinatorStatePath)) {
    return { action: 'archive_plans', details: 'No plans to archive', tokensSaved: 0, success: true };
  }
  
  ensureDir(ARCHIVE_DIR);
  ensureDir(join(ARCHIVE_DIR, 'plans'));
  
  try {
    const state = JSON.parse(readFileSync(coordinatorStatePath, 'utf-8'));
    const completedPlans = state.completed_plans || [];
    
    let totalTokens = 0;
    let archivedCount = 0;
    
    for (const planId of completedPlans) {
      const planPath = join(plansDir, `${planId}.json`);
      if (existsSync(planPath)) {
        const content = readFileSync(planPath, 'utf-8');
        const tokens = Math.ceil(content.length / 4);
        
        const archivePath = join(ARCHIVE_DIR, 'plans', `${planId}.json`);
        renameSync(planPath, archivePath);
        
        totalTokens += tokens;
        archivedCount++;
      }
    }
    
    return {
      action: 'archive_plans',
      details: `Archived ${archivedCount} completed plan(s)`,
      tokensSaved: totalTokens,
      success: true
    };
  } catch (err) {
    return {
      action: 'archive_plans',
      details: `Failed: ${err}`,
      tokensSaved: 0,
      success: false
    };
  }
};

// Create adaptive loader configuration
const createAdaptiveLoaderConfig = (): OptimizationResult => {
  const config = {
    version: '1.0',
    loading_strategy: 'adaptive',
    rules: [
      {
        name: 'core_always',
        files: ['state.json', 'working.md', 'metrics.json'],
        condition: 'always',
        priority: 1
      },
      {
        name: 'knowledge_on_keyword',
        files: ['knowledge/*.md'],
        condition: 'keyword_match',
        priority: 2,
        keywords: {
          'knowledge/opencode_essentials.md': ['opencode', 'architecture', 'storage', 'session'],
          'knowledge/session_recovery.md': ['recovery', 'boot', 'persistence', 'continuity'],
          'knowledge/session_3_intelligence.md': ['intelligence', 'extraction', 'compression', 'search']
        }
      },
      {
        name: 'cache_on_demand',
        files: ['.cache/search-index.json'],
        condition: 'explicit_request',
        priority: 3,
        triggers: ['search', 'query', 'find']
      },
      {
        name: 'archive_manual_only',
        files: ['archive/*'],
        condition: 'manual_only',
        priority: 4
      }
    ],
    optimization_settings: {
      max_startup_tokens: 4000,
      prefer_recent_knowledge: true,
      auto_compress_threshold: 3000,
      cache_expiry_days: 7
    }
  };
  
  const configPath = join(MEMORY_DIR, 'loader-config.json');
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  return {
    action: 'create_config',
    details: 'Created adaptive loader configuration',
    tokensSaved: 0,
    success: true
  };
};

// Create .gitignore for cache directory
const createGitignore = (): OptimizationResult => {
  ensureDir(CACHE_DIR);
  
  const gitignorePath = join(CACHE_DIR, '.gitignore');
  const content = `# Cache directory - generated files
*
!.gitignore
`;
  
  writeFileSync(gitignorePath, content);
  
  return {
    action: 'create_gitignore',
    details: 'Created .cache/.gitignore',
    tokensSaved: 0,
    success: true
  };
};

// Main optimization routine
const optimize = async (action?: string) => {
  console.log('=== MEMORY SYSTEM OPTIMIZER ===\n');
  console.log('Phase 3: Optimization\n');
  
  if (!action || action === 'cache') {
    console.log('Moving large cache files...');
    results.push(moveToCacheDir('search-index.json'));
    results.push(createGitignore());
  }
  
  if (!action || action === 'plans') {
    console.log('Archiving completed plans...');
    results.push(archiveCompletedPlans());
  }
  
  if (!action || action === 'config') {
    console.log('Creating adaptive loader config...');
    results.push(createAdaptiveLoaderConfig());
  }
  
  console.log('\n=== OPTIMIZATION RESULTS ===\n');
  
  let totalTokensSaved = 0;
  let successCount = 0;
  
  for (const result of results) {
    const status = result.success ? '✓' : '✗';
    console.log(`${status} ${result.action}: ${result.details}`);
    if (result.tokensSaved > 0) {
      console.log(`  → Saved ${result.tokensSaved.toLocaleString()} tokens`);
    }
    
    if (result.success) successCount++;
    totalTokensSaved += result.tokensSaved;
  }
  
  console.log(`\nTotal tokens saved: ${totalTokensSaved.toLocaleString()}`);
  console.log(`Success rate: ${successCount}/${results.length} (${((successCount / results.length) * 100).toFixed(0)}%)`);
  
  console.log('\n=== NEXT STEPS ===\n');
  console.log('1. Update boot.sh to use adaptive loader config');
  console.log('2. Modify search.ts to load index from .cache/ when needed');
  console.log('3. Test memory system with optimizations');
  console.log('4. Monitor token usage in next session');
};

// CLI
const action = process.argv[2];
optimize(action);
