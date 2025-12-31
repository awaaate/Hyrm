#!/usr/bin/env node
/**
 * INTELLIGENT MEMORY PRUNER
 * 
 * Core problem: OpenCode sessions have 200k token limit
 * Solution: Prune old/low-value memory before hitting limit
 * 
 * Strategy:
 * 1. Keep last 3 sessions (recent context)
 * 2. Keep high-value achievements (major milestones)
 * 3. Prune old session details, keep summaries
 * 4. Compress knowledge base entries
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

interface MemoryState {
  session_count: number
  total_tokens_used: number
  recent_achievements: string[]
  active_tasks: string[]
  status: string
  [key: string]: any
}

interface KnowledgeBase {
  sessions: Array<{
    id: string
    timestamp: string
    summary: string
    key_learnings: string[]
    artifacts: number
  }>
  patterns: any[]
  techniques: any[]
}

const MEMORY_DIR = join(process.cwd(), 'memory')
const STATE_PATH = join(MEMORY_DIR, 'state.json')
const KB_PATH = join(MEMORY_DIR, 'knowledge-base.json')
const WORKING_PATH = join(MEMORY_DIR, 'working.md')

// Pruning thresholds
const MAX_ACHIEVEMENTS = 5  // Keep only top 5 achievements
const MAX_KB_SESSIONS = 10  // Keep only last 10 sessions in detail
const MAX_WORKING_LINES = 100  // Limit working memory size

function loadJSON<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch (error) {
    console.error(`Failed to load ${path}:`, error)
    return null
  }
}

function saveJSON(path: string, data: any): void {
  writeFileSync(path, JSON.stringify(data, null, 2))
}

/**
 * Prune state.json - keep only essential recent data
 */
function pruneState(): { before: number; after: number } {
  const state = loadJSON<MemoryState>(STATE_PATH)
  if (!state) return { before: 0, after: 0 }

  const before = JSON.stringify(state).length

  // Keep only top achievements (sorted by session number, most recent first)
  if (state.recent_achievements && state.recent_achievements.length > MAX_ACHIEVEMENTS) {
    state.recent_achievements = state.recent_achievements.slice(0, MAX_ACHIEVEMENTS)
  }

  // Remove old metadata that accumulates
  delete state.opencode_sessions  // Tracked elsewhere
  delete state.artifacts_created  // Not critical for context

  const after = JSON.stringify(state).length
  saveJSON(STATE_PATH, state)

  return { before, after }
}

/**
 * Prune knowledge-base.json - compress old sessions
 */
function pruneKnowledgeBase(): { before: number; after: number } {
  const kb = loadJSON<KnowledgeBase>(KB_PATH)
  if (!kb) return { before: 0, after: 0 }

  const before = JSON.stringify(kb).length

  // Keep detailed info for recent sessions, summarize old ones
  if (kb.sessions && kb.sessions.length > MAX_KB_SESSIONS) {
    const recentSessions = kb.sessions.slice(-MAX_KB_SESSIONS)
    const oldCount = kb.sessions.length - MAX_KB_SESSIONS
    
    kb.sessions = [
      {
        id: 'archived',
        timestamp: kb.sessions[0].timestamp,
        summary: `${oldCount} earlier sessions archived (sessions 1-${oldCount})`,
        key_learnings: ['Historical context available in sessions.jsonl'],
        artifacts: 0
      },
      ...recentSessions
    ]
  }

  const after = JSON.stringify(kb).length
  saveJSON(KB_PATH, kb)

  return { before, after }
}

/**
 * Prune working.md - keep only recent context
 */
function pruneWorkingMemory(): { before: number; after: number } {
  if (!existsSync(WORKING_PATH)) return { before: 0, after: 0 }

  const content = readFileSync(WORKING_PATH, 'utf-8')
  const before = content.length

  const lines = content.split('\n')
  
  if (lines.length <= MAX_WORKING_LINES) {
    return { before, after: before }  // No pruning needed
  }

  // Keep header and recent entries
  const header = lines.slice(0, 10)  // Preserve structure
  const recentEntries = lines.slice(-MAX_WORKING_LINES + 10)
  
  const pruned = [
    ...header,
    '',
    `_[Older entries pruned - ${lines.length - MAX_WORKING_LINES} lines archived]_`,
    '',
    ...recentEntries
  ].join('\n')

  writeFileSync(WORKING_PATH, pruned)

  return { before, after: pruned.length }
}

/**
 * Main pruning function
 */
function pruneMemory() {
  console.log('🧹 Starting intelligent memory pruning...\n')

  const stateResult = pruneState()
  console.log(`📊 state.json: ${stateResult.before} → ${stateResult.after} bytes (${Math.round((1 - stateResult.after/stateResult.before) * 100)}% reduction)`)

  const kbResult = pruneKnowledgeBase()
  console.log(`📚 knowledge-base.json: ${kbResult.before} → ${kbResult.after} bytes (${Math.round((1 - kbResult.after/kbResult.before) * 100)}% reduction)`)

  const workingResult = pruneWorkingMemory()
  if (workingResult.before > 0) {
    console.log(`📝 working.md: ${workingResult.before} → ${workingResult.after} bytes (${Math.round((1 - workingResult.after/workingResult.before) * 100)}% reduction)`)
  }

  const totalBefore = stateResult.before + kbResult.before + workingResult.before
  const totalAfter = stateResult.after + kbResult.after + workingResult.after
  const totalSaved = totalBefore - totalAfter

  console.log(`\n✅ Total pruned: ${totalSaved} bytes (${Math.round((totalSaved/totalBefore) * 100)}% reduction)`)
  console.log(`💾 Current memory size: ${totalAfter} bytes`)
}

// Run if called directly
if (require.main === module) {
  pruneMemory()
}

export { pruneMemory }
