#!/usr/bin/env bun
/**
 * Adaptive Memory Loader
 * Phase 3: Optimization
 * 
 * Intelligently loads memory based on context and keywords.
 * Minimizes token usage while maximizing relevance.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const MEMORY_DIR = '/app/workspace/memory';
const CONFIG_FILE = join(MEMORY_DIR, 'loader-config.json');

interface LoaderConfig {
  version: string;
  loading_strategy: string;
  rules: LoadingRule[];
  optimization_settings: OptimizationSettings;
}

interface LoadingRule {
  name: string;
  files: string[];
  condition: string;
  priority: number;
  keywords?: Record<string, string[]>;
  triggers?: string[];
}

interface OptimizationSettings {
  max_startup_tokens: number;
  prefer_recent_knowledge: boolean;
  auto_compress_threshold: number;
  cache_expiry_days: number;
}

interface LoadedMemory {
  core: Record<string, any>;
  knowledge: Record<string, string>;
  cache: Record<string, any>;
  metadata: {
    total_files: number;
    total_tokens: number;
    load_time_ms: number;
  };
}

class AdaptiveLoader {
  private config: LoaderConfig;
  
  constructor() {
    this.config = this.loadConfig();
  }
  
  private loadConfig(): LoaderConfig {
    if (!existsSync(CONFIG_FILE)) {
      throw new Error('Loader config not found. Run: bun memory/optimize.ts config');
    }
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  }
  
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
  
  private matchesKeywords(text: string, keywords: string[]): boolean {
    const lowerText = text.toLowerCase();
    return keywords.some(kw => lowerText.includes(kw.toLowerCase()));
  }
  
  private expandGlob(pattern: string): string[] {
    const parts = pattern.split('/');
    const dir = parts.slice(0, -1).join('/');
    const filePattern = parts[parts.length - 1];
    
    const fullDir = join(MEMORY_DIR, dir);
    if (!existsSync(fullDir)) return [];
    
    const files = readdirSync(fullDir);
    
    if (filePattern === '*' || filePattern === '*.md') {
      return files
        .filter(f => filePattern === '*' || f.endsWith('.md'))
        .map(f => join(dir, f));
    }
    
    return [pattern];
  }
  
  /**
   * Load memory based on context keywords
   * @param context - Keywords describing what you're working on
   * @param forceLoad - Files to force load regardless of rules
   */
  async load(context: string[] = [], forceLoad: string[] = []): Promise<LoadedMemory> {
    const startTime = Date.now();
    const result: LoadedMemory = {
      core: {},
      knowledge: {},
      cache: {},
      metadata: {
        total_files: 0,
        total_tokens: 0,
        load_time_ms: 0
      }
    };
    
    // Sort rules by priority
    const sortedRules = [...this.config.rules].sort((a, b) => a.priority - b.priority);
    
    for (const rule of sortedRules) {
      // Check if we should process this rule
      let shouldProcess = false;
      
      switch (rule.condition) {
        case 'always':
          shouldProcess = true;
          break;
          
        case 'keyword_match':
          if (rule.keywords && context.length > 0) {
            // Check if any context keyword matches this rule's files
            for (const [file, keywords] of Object.entries(rule.keywords)) {
              if (this.matchesKeywords(context.join(' '), keywords)) {
                shouldProcess = true;
                break;
              }
            }
          }
          break;
          
        case 'explicit_request':
          if (rule.triggers && context.length > 0) {
            if (this.matchesKeywords(context.join(' '), rule.triggers)) {
              shouldProcess = true;
            }
          }
          break;
          
        case 'manual_only':
          // Only load if explicitly in forceLoad
          break;
      }
      
      if (!shouldProcess && !forceLoad.some(f => rule.files.includes(f))) {
        continue;
      }
      
      // Load files for this rule
      for (const filePattern of rule.files) {
        const files = this.expandGlob(filePattern);
        
        for (const file of files) {
          // Skip if already loaded
          const fileName = file.split('/').pop() || file;
          if (result.core[fileName] || result.knowledge[fileName] || result.cache[fileName]) {
            continue;
          }
          
          const filePath = join(MEMORY_DIR, file);
          if (!existsSync(filePath)) {
            console.log(`  ⚠️  File not found: ${file}`);
            continue;
          }
          
          try {
            const content = readFileSync(filePath, 'utf-8');
            const tokens = this.estimateTokens(content);
            
            // Check token budget
            if (result.metadata.total_tokens + tokens > this.config.optimization_settings.max_startup_tokens) {
              console.log(`  ⚠️  Skipping ${file} (would exceed token budget)`);
              continue;
            }
            
            // Categorize and store
            if (file.endsWith('.json')) {
              try {
                const data = JSON.parse(content);
                if (file.includes('.cache/')) {
                  result.cache[fileName] = data;
                } else {
                  result.core[fileName] = data;
                }
              } catch {
                result.core[fileName] = content;
              }
            } else {
              result.knowledge[fileName] = content;
            }
            
            result.metadata.total_files++;
            result.metadata.total_tokens += tokens;
            
            console.log(`  ✓ Loaded ${file} (${tokens} tokens)`);
          } catch (err) {
            console.log(`  ✗ Failed to load ${file}: ${err}`);
          }
        }
      }
    }
    
    // Add forced files
    for (const file of forceLoad) {
      const filePath = join(MEMORY_DIR, file);
      if (existsSync(filePath)) {
        const fileName = file.split('/').pop() || file;
        if (!result.core[fileName] && !result.knowledge[fileName]) {
          try {
            const content = readFileSync(filePath, 'utf-8');
            const tokens = this.estimateTokens(content);
            
            if (file.endsWith('.json')) {
              result.core[fileName] = JSON.parse(content);
            } else {
              result.knowledge[fileName] = content;
            }
            
            result.metadata.total_files++;
            result.metadata.total_tokens += tokens;
            console.log(`  ✓ Force loaded ${file} (${tokens} tokens)`);
          } catch (err) {
            console.log(`  ✗ Failed to force load ${file}: ${err}`);
          }
        }
      }
    }
    
    result.metadata.load_time_ms = Date.now() - startTime;
    
    return result;
  }
  
  /**
   * Display loaded memory summary
   */
  displaySummary(memory: LoadedMemory) {
    console.log('\n=== MEMORY LOADED ===\n');
    console.log(`Files loaded: ${memory.metadata.total_files}`);
    console.log(`Total tokens: ${memory.metadata.total_tokens.toLocaleString()}`);
    console.log(`Load time: ${memory.metadata.load_time_ms}ms`);
    console.log(`Token budget usage: ${((memory.metadata.total_tokens / this.config.optimization_settings.max_startup_tokens) * 100).toFixed(1)}%`);
    
    if (Object.keys(memory.core).length > 0) {
      console.log(`\nCore files (${Object.keys(memory.core).length}):`);
      for (const name of Object.keys(memory.core)) {
        console.log(`  - ${name}`);
      }
    }
    
    if (Object.keys(memory.knowledge).length > 0) {
      console.log(`\nKnowledge files (${Object.keys(memory.knowledge).length}):`);
      for (const name of Object.keys(memory.knowledge)) {
        console.log(`  - ${name}`);
      }
    }
    
    if (Object.keys(memory.cache).length > 0) {
      console.log(`\nCache files (${Object.keys(memory.cache).length}):`);
      for (const name of Object.keys(memory.cache)) {
        console.log(`  - ${name}`);
      }
    }
  }
  
  /**
   * Display core state and working memory (similar to boot.sh)
   */
  displayContext(memory: LoadedMemory) {
    console.log('\n=== CONTEXT SUMMARY ===\n');
    
    // Display state
    if (memory.core['state.json']) {
      const state = memory.core['state.json'];
      console.log('CURRENT STATE:');
      console.log(`  Objective: ${state.current_objective}`);
      console.log(`  Status: ${state.status}`);
      console.log(`  Session: ${state.session_count}`);
      console.log(`  Active Tasks: ${state.active_tasks?.length || 0}`);
      
      if (state.active_tasks?.length > 0) {
        console.log('\nACTIVE TASKS:');
        state.active_tasks.forEach((task: string, i: number) => {
          console.log(`  ${i + 1}. ${task}`);
        });
      }
    }
    
    // Display recent achievements
    if (memory.core['state.json']?.recent_achievements) {
      const achievements = memory.core['state.json'].recent_achievements;
      if (achievements.length > 0) {
        console.log('\nRECENT ACHIEVEMENTS:');
        achievements.forEach((a: string) => console.log(`  ✓ ${a}`));
      }
    }
    
    console.log('\n---\n');
    console.log('Ready to continue! Use loaded knowledge and context above.\n');
  }
}

// CLI
const main = async () => {
  const command = process.argv[2] || 'load';
  const args = process.argv.slice(3);
  
  const loader = new AdaptiveLoader();
  
  switch (command) {
    case 'load': {
      console.log('=== ADAPTIVE MEMORY LOADER ===\n');
      console.log('Loading memory with adaptive strategy...\n');
      
      const context = args;
      const memory = await loader.load(context);
      
      loader.displaySummary(memory);
      loader.displayContext(memory);
      break;
    }
    
    case 'test': {
      console.log('=== TESTING ADAPTIVE LOADER ===\n');
      
      const testCases = [
        { name: 'Minimal (no context)', context: [] },
        { name: 'OpenCode work', context: ['opencode', 'architecture'] },
        { name: 'Search functionality', context: ['search', 'query'] },
        { name: 'Recovery work', context: ['recovery', 'persistence'] }
      ];
      
      for (const test of testCases) {
        console.log(`\nTest: ${test.name}`);
        console.log(`Context: [${test.context.join(', ')}]`);
        const memory = await loader.load(test.context);
        console.log(`  → Loaded ${memory.metadata.total_files} files, ${memory.metadata.total_tokens} tokens`);
      }
      break;
    }
    
    case 'help':
    default:
      console.log('Adaptive Memory Loader - Load memory intelligently based on context');
      console.log('\nUsage:');
      console.log('  bun memory/adaptive-loader.ts load [keywords...]    Load with context');
      console.log('  bun memory/adaptive-loader.ts test                  Run test scenarios');
      console.log('  bun memory/adaptive-loader.ts help                  Show this help');
      console.log('\nExamples:');
      console.log('  bun memory/adaptive-loader.ts load opencode search');
      console.log('  bun memory/adaptive-loader.ts load recovery');
      console.log('  bun memory/adaptive-loader.ts test');
      break;
  }
};

main();
