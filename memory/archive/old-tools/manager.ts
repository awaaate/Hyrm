#!/usr/bin/env bun
/**
 * Memory Manager - Handles persistent memory across sessions
 * 
 * Usage:
 *   bun memory/manager.ts load          # Load memory into context
 *   bun memory/manager.ts save          # Save current state
 *   bun memory/manager.ts log           # Log session
 *   bun memory/manager.ts status        # Show memory status
 *   bun memory/manager.ts recover       # Test recovery capability
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const MEMORY_DIR = '/app/workspace/memory';
const STATE_FILE = join(MEMORY_DIR, 'state.json');
const WORKING_FILE = join(MEMORY_DIR, 'working.md');
const METRICS_FILE = join(MEMORY_DIR, 'metrics.json');
const SESSIONS_FILE = join(MEMORY_DIR, 'sessions.jsonl');
const KNOWLEDGE_DIR = join(MEMORY_DIR, 'knowledge');

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

interface SessionLog {
  id: string;
  date: string;
  objective: string;
  tokens: number;
  achievements: string[];
  errors: number;
  duration_minutes: number;
}

// Utility functions
function loadJSON<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, 'utf-8'));
}

function saveJSON<T>(filepath: string, data: T): void {
  writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function loadText(filepath: string): string {
  return readFileSync(filepath, 'utf-8');
}

function saveText(filepath: string, content: string): void {
  writeFileSync(filepath, content);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Memory operations
function loadMemory(): void {
  console.log('=== LOADING MEMORY ===\n');
  
  const state = loadJSON<CoreState>(STATE_FILE);
  const working = loadText(WORKING_FILE);
  const metrics = loadJSON<Metrics>(METRICS_FILE);
  
  console.log('CORE STATE:');
  console.log(`  Objective: ${state.current_objective}`);
  console.log(`  Status: ${state.status || 'unknown'}`);
  console.log(`  Session: ${state.session_count}`);
  console.log(`  Active Tasks: ${state.active_tasks.length}`);
  state.active_tasks.forEach(task => console.log(`    - ${task}`));
  
  console.log('\nMETRICS:');
  console.log(`  Total Tokens: ${metrics.efficiency.total_tokens_used.toLocaleString()}`);
  console.log(`  Sessions: ${metrics.efficiency.total_sessions}`);
  console.log(`  Tasks Completed: ${metrics.effectiveness.tasks_completed}`);
  console.log(`  Tasks In Progress: ${metrics.effectiveness.tasks_in_progress}`);
  console.log(`  Discoveries: ${metrics.learning.discoveries}`);
  
  console.log('\n=== MEMORY LOADED ===\n');
  console.log('Context ready. Token budget estimate: ~4000 tokens');
}

function saveMemory(
  objective?: string,
  status?: string,
  tasks?: string[],
  tokensUsed?: number
): void {
  const state = loadJSON<CoreState>(STATE_FILE);
  
  if (objective) state.current_objective = objective;
  if (status) state.status = status;
  if (tasks) state.active_tasks = tasks;
  if (tokensUsed) state.total_tokens_used += tokensUsed;
  
  state.last_session = new Date().toISOString();
  
  saveJSON(STATE_FILE, state);
  console.log('State saved successfully');
}

function logSession(
  objective: string,
  tokensUsed: number,
  achievements: string[],
  errors: number = 0,
  durationMinutes: number = 0
): void {
  const state = loadJSON<CoreState>(STATE_FILE);
  const metrics = loadJSON<Metrics>(METRICS_FILE);
  
  // Create session log entry
  const sessionLog: SessionLog = {
    id: `ses${state.session_count}`,
    date: new Date().toISOString(),
    objective,
    tokens: tokensUsed,
    achievements,
    errors,
    duration_minutes: durationMinutes
  };
  
  // Append to sessions file
  const logLine = JSON.stringify(sessionLog) + '\n';
  if (existsSync(SESSIONS_FILE)) {
    const existing = readFileSync(SESSIONS_FILE, 'utf-8');
    saveText(SESSIONS_FILE, existing + logLine);
  } else {
    saveText(SESSIONS_FILE, logLine);
  }
  
  // Update metrics
  metrics.efficiency.total_sessions = state.session_count;
  metrics.efficiency.total_tokens_used = state.total_tokens_used;
  metrics.efficiency.avg_tokens_per_session = 
    metrics.efficiency.total_tokens_used / metrics.efficiency.total_sessions;
  metrics.sessions.last_session = new Date().toISOString();
  metrics.sessions.total_duration_minutes += durationMinutes;
  
  saveJSON(METRICS_FILE, metrics);
  
  console.log(`Session ${sessionLog.id} logged successfully`);
}

function showStatus(): void {
  const state = loadJSON<CoreState>(STATE_FILE);
  const metrics = loadJSON<Metrics>(METRICS_FILE);
  
  console.log('=== MEMORY SYSTEM STATUS ===\n');
  
  console.log('CURRENT STATE:');
  console.log(`  Version: ${state.version}`);
  console.log(`  Last Active: ${new Date(state.last_session).toLocaleString()}`);
  console.log(`  Objective: ${state.current_objective}`);
  console.log(`  Status: ${state.status || 'unknown'}`);
  console.log(`  Session Count: ${state.session_count}`);
  
  console.log('\nACTIVE TASKS:');
  state.active_tasks.forEach(task => console.log(`  - ${task}`));
  
  console.log('\nEFFICIENCY METRICS:');
  console.log(`  Total Sessions: ${metrics.efficiency.total_sessions}`);
  console.log(`  Total Tokens: ${metrics.efficiency.total_tokens_used.toLocaleString()}`);
  console.log(`  Avg Tokens/Session: ${Math.round(metrics.efficiency.avg_tokens_per_session).toLocaleString()}`);
  console.log(`  Memory Overhead: ${metrics.efficiency.memory_overhead_percent.toFixed(1)}%`);
  console.log(`  Successful Recoveries: ${metrics.efficiency.successful_recoveries}`);
  console.log(`  Failed Recoveries: ${metrics.efficiency.failed_recoveries}`);
  
  console.log('\nEFFECTIVENESS METRICS:');
  console.log(`  Tasks Completed: ${metrics.effectiveness.tasks_completed}`);
  console.log(`  Tasks In Progress: ${metrics.effectiveness.tasks_in_progress}`);
  console.log(`  Tasks Abandoned: ${metrics.effectiveness.tasks_abandoned}`);
  console.log(`  Context Continuity: ${(metrics.effectiveness.context_continuity_score * 100).toFixed(1)}%`);
  
  console.log('\nLEARNING METRICS:');
  console.log(`  Knowledge Articles: ${metrics.learning.knowledge_articles}`);
  console.log(`  Patterns Identified: ${metrics.learning.patterns_identified}`);
  console.log(`  Optimizations Applied: ${metrics.learning.optimizations_applied}`);
  console.log(`  Discoveries Made: ${metrics.learning.discoveries}`);
  
  console.log('\nFILE SIZES:');
  const files = [
    { name: 'state.json', path: STATE_FILE },
    { name: 'working.md', path: WORKING_FILE },
    { name: 'metrics.json', path: METRICS_FILE },
    { name: 'sessions.jsonl', path: SESSIONS_FILE }
  ];
  
  files.forEach(f => {
    if (existsSync(f.path)) {
      const size = readFileSync(f.path, 'utf-8').length;
      const tokens = Math.round(size / 4);
      console.log(`  ${f.name}: ${size} bytes (~${tokens} tokens)`);
    }
  });
}

function testRecovery(): void {
  console.log('=== TESTING RECOVERY CAPABILITY ===\n');
  
  try {
    const state = loadJSON<CoreState>(STATE_FILE);
    const working = loadText(WORKING_FILE);
    const metrics = loadJSON<Metrics>(METRICS_FILE);
    
    console.log('Recovery Test Results:');
    console.log('  ✓ Core state loaded');
    console.log('  ✓ Working memory loaded');
    console.log('  ✓ Metrics loaded');
    
    console.log('\nRecovered Context:');
    console.log(`  I know my objective: ${state.current_objective}`);
    console.log(`  I know my status: ${state.status || 'unknown'}`);
    console.log(`  I know I have ${state.active_tasks.length} active tasks`);
    console.log(`  I have ${working.split('\n').length} lines of working memory`);
    console.log(`  I completed ${metrics.effectiveness.tasks_completed} tasks so far`);
    
    const confidence = 0.95; // High confidence - all core data present
    console.log(`\nRecovery Confidence: ${(confidence * 100).toFixed(0)}%`);
    
    // Update metrics
    metrics.efficiency.successful_recoveries++;
    metrics.effectiveness.recovery_confidence_scores.push(confidence);
    metrics.effectiveness.context_continuity_score = 
      metrics.effectiveness.recovery_confidence_scores.reduce((a, b) => a + b, 0) / 
      metrics.effectiveness.recovery_confidence_scores.length;
    
    saveJSON(METRICS_FILE, metrics);
    
    console.log('\n✓ RECOVERY SUCCESSFUL');
    
  } catch (error) {
    console.log('\n✗ RECOVERY FAILED');
    console.error(error);
    
    const metrics = loadJSON<Metrics>(METRICS_FILE);
    metrics.efficiency.failed_recoveries++;
    saveJSON(METRICS_FILE, metrics);
  }
}

function startSession(): void {
  const state = loadJSON<CoreState>(STATE_FILE);
  const metrics = loadJSON<Metrics>(METRICS_FILE);
  
  // Increment session count
  state.session_count++;
  state.last_session = new Date().toISOString();
  
  saveJSON(STATE_FILE, state);
  
  console.log(`=== SESSION ${state.session_count} STARTED ===`);
  console.log(`Time: ${new Date().toLocaleString()}`);
  console.log(`Objective: ${state.current_objective}`);
  console.log(`Status: ${state.status || 'unknown'}`);
  console.log(`Active Tasks: ${state.active_tasks.length}`);
  
  // Update metrics
  metrics.efficiency.total_sessions = state.session_count;
  metrics.sessions.last_session = state.last_session;
  saveJSON(METRICS_FILE, metrics);
}

function endSession(
  tokensUsed: number,
  achievements: string[],
  tasksCompleted: number = 0
): void {
  const state = loadJSON<CoreState>(STATE_FILE);
  const metrics = loadJSON<Metrics>(METRICS_FILE);
  
  // Update state
  state.total_tokens_used += tokensUsed;
  saveJSON(STATE_FILE, state);
  
  // Log session
  const sessionLog: SessionLog = {
    id: `ses${state.session_count}`,
    date: new Date().toISOString(),
    objective: state.current_objective,
    tokens: tokensUsed,
    achievements,
    errors: 0,
    duration_minutes: 5 // Watchdog interval
  };
  
  const logLine = JSON.stringify(sessionLog) + '\n';
  if (existsSync(SESSIONS_FILE)) {
    const existing = readFileSync(SESSIONS_FILE, 'utf-8');
    saveText(SESSIONS_FILE, existing + logLine);
  } else {
    saveText(SESSIONS_FILE, logLine);
  }
  
  // Update metrics
  metrics.efficiency.total_tokens_used = state.total_tokens_used;
  metrics.efficiency.avg_tokens_per_session = 
    state.total_tokens_used / state.session_count;
  metrics.effectiveness.tasks_completed += tasksCompleted;
  metrics.sessions.total_duration_minutes += 5;
  
  saveJSON(METRICS_FILE, metrics);
  
  console.log(`=== SESSION ${state.session_count} ENDED ===`);
  console.log(`Tokens Used: ${tokensUsed.toLocaleString()}`);
  console.log(`Achievements: ${achievements.length}`);
  console.log(`Tasks Completed: ${tasksCompleted}`);
}

// CLI
const command = process.argv[2];

switch (command) {
  case 'load':
    loadMemory();
    break;
    
  case 'save':
    const objective = process.argv[3];
    const status = process.argv[4];
    const tokensStr = process.argv[5];
    saveMemory(
      objective || undefined,
      status || undefined,
      undefined,
      tokensStr ? parseInt(tokensStr) : undefined
    );
    break;
    
  case 'log':
    const logObjective = process.argv[3] || 'unknown';
    const logTokens = parseInt(process.argv[4] || '0');
    const achievements = process.argv[5]?.split(',') || [];
    logSession(logObjective, logTokens, achievements);
    break;
    
  case 'status':
    showStatus();
    break;
    
  case 'recover':
    testRecovery();
    break;
    
  case 'start':
    startSession();
    break;
    
  case 'end':
    const endTokens = parseInt(process.argv[3] || '0');
    const endAchievements = process.argv[4]?.split(',') || [];
    const endTasksCompleted = parseInt(process.argv[5] || '0');
    endSession(endTokens, endAchievements, endTasksCompleted);
    break;
    
  default:
    console.log('Memory Manager');
    console.log('');
    console.log('Usage:');
    console.log('  bun memory/manager.ts load');
    console.log('  bun memory/manager.ts save [objective] [status] [tokens]');
    console.log('  bun memory/manager.ts log <objective> <tokens> <achievements>');
    console.log('  bun memory/manager.ts status');
    console.log('  bun memory/manager.ts recover');
    console.log('  bun memory/manager.ts start');
    console.log('  bun memory/manager.ts end <tokens> <achievements> <tasks_completed>');
    break;
}
