#!/usr/bin/env bun
/**
 * Auto-Update System - Automatically updates memory based on activity
 * 
 * This script can be run periodically or triggered by events to update memory
 * 
 * Usage:
 *   bun memory/auto-update.ts check      # Check if update is needed
 *   bun memory/auto-update.ts update     # Update memory automatically
 *   bun memory/auto-update.ts daemon     # Run in daemon mode (check every N minutes)
 */

import { readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

const MEMORY_DIR = '/app/workspace/memory';
const STATE_FILE = join(MEMORY_DIR, 'state.json');
const WORKING_FILE = join(MEMORY_DIR, 'working.md');
const METRICS_FILE = join(MEMORY_DIR, 'metrics.json');
const OPENCODE_STORAGE = join(process.env.HOME || '/root', '.local/share/opencode/storage');
const SESSION_DIR = join(OPENCODE_STORAGE, 'session/global');

interface CoreState {
  version: string;
  last_session: string;
  current_objective: string;
  active_tasks: string[];
  session_count: number;
  total_tokens_used: number;
  memory_version: number;
  status?: string;
}

interface Metrics {
  efficiency: {
    avg_tokens_per_session: number;
    total_sessions: number;
    total_tokens_used: number;
    memory_overhead_tokens: number;
    memory_overhead_percent: number;
    successful_recoveries: number;
    failed_recoveries: number;
  };
  effectiveness: {
    tasks_completed: number;
    tasks_abandoned: number;
    tasks_in_progress: number;
    context_continuity_score: number;
    recovery_confidence_scores: number[];
  };
  learning: {
    knowledge_articles: number;
    patterns_identified: number;
    optimizations_applied: number;
    discoveries: number;
  };
  sessions: {
    first_session: string;
    last_session: string;
    total_duration_minutes: number;
  };
}

// Utility functions
function loadJSON<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, 'utf-8'));
}

function saveJSON<T>(filepath: string, data: T): void {
  writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function getFileAge(filepath: string): number {
  const stats = statSync(filepath);
  return Date.now() - stats.mtimeMs;
}

// Check if update is needed
function needsUpdate(): { needed: boolean; reason: string } {
  // Check state file age
  const stateAge = getFileAge(STATE_FILE);
  const workingAge = getFileAge(WORKING_FILE);
  
  const stateAgeMinutes = stateAge / (1000 * 60);
  const workingAgeMinutes = workingAge / (1000 * 60);
  
  // Update if state hasn't been touched in > 10 minutes
  if (stateAgeMinutes > 10) {
    return { needed: true, reason: `State file age: ${stateAgeMinutes.toFixed(1)} minutes` };
  }
  
  // Update if working memory hasn't been updated in > 15 minutes
  if (workingAgeMinutes > 15) {
    return { needed: true, reason: `Working memory age: ${workingAgeMinutes.toFixed(1)} minutes` };
  }
  
  // Check for new OpenCode sessions
  try {
    const state = loadJSON<CoreState>(STATE_FILE);
    const lastSession = new Date(state.last_session).getTime();
    const timeSinceLastSession = Date.now() - lastSession;
    const minutesSinceLastSession = timeSinceLastSession / (1000 * 60);
    
    if (minutesSinceLastSession > 6) {
      return { needed: true, reason: `Last session: ${minutesSinceLastSession.toFixed(1)} minutes ago` };
    }
  } catch (e) {
    return { needed: true, reason: 'Failed to read state file' };
  }
  
  return { needed: false, reason: 'Memory is up to date' };
}

// Auto-update memory
function autoUpdate(): void {
  console.log('\n=== Auto-Update Memory System ===\n');
  
  const check = needsUpdate();
  console.log(`Status: ${check.needed ? '⚠️  UPDATE NEEDED' : '✅ UP TO DATE'}`);
  console.log(`Reason: ${check.reason}\n`);
  
  if (!check.needed) {
    console.log('No update needed at this time.');
    return;
  }
  
  // Update state
  const state = loadJSON<CoreState>(STATE_FILE);
  const now = new Date().toISOString();
  
  // Check if we need to increment session count
  const lastSession = new Date(state.last_session);
  const timeDiff = Date.now() - lastSession.getTime();
  const minutesDiff = timeDiff / (1000 * 60);
  
  if (minutesDiff > 5) {
    console.log('New session detected, incrementing session count');
    state.session_count += 1;
  }
  
  state.last_session = now;
  saveJSON(STATE_FILE, state);
  console.log('✅ State updated');
  
  // Update metrics
  try {
    const metrics = loadJSON<Metrics>(METRICS_FILE);
    metrics.sessions.last_session = now;
    
    // Recalculate duration
    const first = new Date(metrics.sessions.first_session).getTime();
    const last = Date.now();
    metrics.sessions.total_duration_minutes = Math.round((last - first) / (1000 * 60));
    
    saveJSON(METRICS_FILE, metrics);
    console.log('✅ Metrics updated');
  } catch (e) {
    console.log('⚠️  Failed to update metrics:', e);
  }
  
  // Update working memory timestamp
  try {
    const working = readFileSync(WORKING_FILE, 'utf-8');
    const updatedWorking = working.replace(
      /\*\*Last Updated\*\*:.*$/m,
      `**Last Updated**: ${now.split('T')[0]}`
    );
    writeFileSync(WORKING_FILE, updatedWorking);
    console.log('✅ Working memory timestamp updated');
  } catch (e) {
    console.log('⚠️  Failed to update working memory:', e);
  }
  
  console.log('\n✅ Auto-update complete!\n');
}

// Daemon mode - check every N minutes
async function daemon(intervalMinutes: number = 5): Promise<void> {
  console.log(`\n=== Auto-Update Daemon Started ===`);
  console.log(`Checking every ${intervalMinutes} minutes\n`);
  
  while (true) {
    try {
      const check = needsUpdate();
      if (check.needed) {
        console.log(`[${new Date().toLocaleTimeString()}] Update triggered: ${check.reason}`);
        autoUpdate();
      } else {
        console.log(`[${new Date().toLocaleTimeString()}] ${check.reason}`);
      }
    } catch (e) {
      console.error(`[${new Date().toLocaleTimeString()}] Error:`, e);
    }
    
    // Wait for interval
    await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60 * 1000));
  }
}

// Main CLI
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'check':
    const check = needsUpdate();
    console.log('\n=== Memory Update Check ===\n');
    console.log(`Status: ${check.needed ? '⚠️  UPDATE NEEDED' : '✅ UP TO DATE'}`);
    console.log(`Reason: ${check.reason}\n`);
    process.exit(check.needed ? 1 : 0);
    
  case 'update':
    autoUpdate();
    break;
    
  case 'daemon':
    const interval = arg ? parseInt(arg) : 5;
    daemon(interval);
    break;
    
  default:
    console.log('Auto-Update System - Automatic memory maintenance');
    console.log('');
    console.log('Usage:');
    console.log('  bun memory/auto-update.ts check          # Check if update needed');
    console.log('  bun memory/auto-update.ts update         # Update memory now');
    console.log('  bun memory/auto-update.ts daemon [min]   # Run daemon (default: 5 min)');
    console.log('');
    process.exit(1);
}
