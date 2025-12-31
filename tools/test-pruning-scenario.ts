#!/usr/bin/env bun
/**
 * TEST PRUNING SCENARIO
 * Simulate memory growth and verify pruning prevents overflow
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const MEMORY_DIR = join(process.cwd(), 'memory')

// Simulate memory bloat by adding fake achievements
function bloatMemory() {
  const statePath = join(MEMORY_DIR, 'state.json')
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  
  // Add 50 fake achievements to simulate long session history
  const fakeAchievements = Array.from({ length: 50 }, (_, i) => 
    `Session ${i + 17}: Built feature XYZ with ${Math.floor(Math.random() * 100)} lines of code`
  )
  
  state.recent_achievements = [...fakeAchievements, ...state.recent_achievements]
  state.session_count = 66
  state.total_tokens_used = 850000  // Approaching limit
  
  writeFileSync(statePath, JSON.stringify(state, null, 2))
  
  console.log(`📈 Bloated memory with ${fakeAchievements.length} fake achievements`)
  console.log(`💾 Memory size: ${JSON.stringify(state).length} bytes`)
  console.log(`🎯 Token usage: ${state.total_tokens_used.toLocaleString()}`)
}

// Measure memory before/after
function measureMemory() {
  const statePath = join(MEMORY_DIR, 'state.json')
  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const size = JSON.stringify(state).length
  const achievements = state.recent_achievements?.length || 0
  
  return { size, achievements, tokens: state.total_tokens_used }
}

console.log('🧪 PRUNING TEST SCENARIO\n')

console.log('📊 BEFORE BLOAT:')
const before = measureMemory()
console.log(`  Size: ${before.size} bytes`)
console.log(`  Achievements: ${before.achievements}`)
console.log(`  Tokens: ${before.tokens.toLocaleString()}\n`)

bloatMemory()

console.log('\n📊 AFTER BLOAT:')
const bloated = measureMemory()
console.log(`  Size: ${bloated.size} bytes (+${Math.round((bloated.size/before.size - 1) * 100)}%)`)
console.log(`  Achievements: ${bloated.achievements}`)
console.log(`  Tokens: ${bloated.tokens.toLocaleString()}\n`)

console.log('🧹 RUNNING PRUNER...\n')
await import('./memory-pruner.ts').then(m => m.pruneMemory())

console.log('\n📊 AFTER PRUNING:')
const after = measureMemory()
console.log(`  Size: ${after.size} bytes (${Math.round((after.size/bloated.size) * 100)}% of bloated)`)
console.log(`  Achievements: ${after.achievements} (kept top ${after.achievements})`)
console.log(`  Tokens: ${after.tokens.toLocaleString()}`)

console.log(`\n✅ RESULT: Pruned ${bloated.size - after.size} bytes (${Math.round((1 - after.size/bloated.size) * 100)}% reduction)`)
console.log(`🎯 Memory ready for high-token scenarios`)
