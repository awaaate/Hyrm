#!/usr/bin/env bun
/**
 * SMART MEMORY MANAGER
 * 
 * Enhanced memory system with intelligent pruning, compression, and archiving
 * Designed to handle persistent multi-agent systems with growing memory needs
 * 
 * Features:
 * - Smart pruning based on value/relevance scoring
 * - Automatic archiving of old sessions
 * - Compression of redundant data
 * - Token usage tracking and prediction
 * - Memory health monitoring
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { createGzip, createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { createReadStream, createWriteStream } from 'fs'

interface MemoryHealth {
  totalSize: number
  tokenEstimate: number
  oldestSession: Date
  newestSession: Date
  sessionCount: number
  archiveCount: number
  messageCount: number
  agentCount: number
  healthScore: number // 0-100
  recommendations: string[]
}

interface SessionSummary {
  id: string
  timestamp: string
  duration: number
  toolCalls: number
  achievements: string[]
  value_score: number // 0-100 based on achievements, duration, activity
}

const MEMORY_DIR = join(process.cwd(), 'memory')
const ARCHIVE_DIR = join(MEMORY_DIR, 'archive')
const STATE_PATH = join(MEMORY_DIR, 'state.json')
const KB_PATH = join(MEMORY_DIR, 'knowledge-base.json')
const SESSIONS_PATH = join(MEMORY_DIR, 'sessions.jsonl')
const MESSAGE_BUS_PATH = join(MEMORY_DIR, 'message-bus.jsonl')

// Thresholds
const TOKEN_WARNING_THRESHOLD = 150000  // Warn at 75% of 200k limit
const TOKEN_CRITICAL_THRESHOLD = 180000 // Critical at 90% of 200k limit
const MAX_ACTIVE_SESSIONS = 20  // Keep detailed info for last 20 sessions
const ARCHIVE_AFTER_DAYS = 7    // Archive sessions older than 7 days
const MIN_VALUE_SCORE = 30      // Minimum value score to keep in active memory

// Ensure archive directory exists
if (!existsSync(ARCHIVE_DIR)) {
  mkdirSync(ARCHIVE_DIR, { recursive: true })
}

/**
 * Estimate token count for a string (rough approximation)
 */
function estimateTokens(text: string): number {
  // Rough estimate: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4)
}

/**
 * Calculate value score for a session
 */
function calculateValueScore(session: any): number {
  let score = 0
  
  // Base score on duration (longer sessions = more value)
  if (session.duration) {
    score += Math.min(session.duration / 3600, 30) // Max 30 points for duration
  }
  
  // Tool calls indicate productive work
  if (session.tool_calls) {
    score += Math.min(session.tool_calls / 10, 20) // Max 20 points for tool usage
  }
  
  // Achievements are high value
  if (session.achievements && session.achievements.length > 0) {
    score += session.achievements.length * 10 // 10 points per achievement
  }
  
  // Recent sessions get a boost
  const age = Date.now() - new Date(session.timestamp).getTime()
  const daysOld = age / (1000 * 60 * 60 * 24)
  if (daysOld < 1) score += 20  // Very recent
  else if (daysOld < 3) score += 10  // Recent
  else if (daysOld < 7) score += 5   // This week
  
  return Math.min(score, 100) // Cap at 100
}

/**
 * Archive old sessions to compressed files
 */
async function archiveSessions(): Promise<number> {
  if (!existsSync(SESSIONS_PATH)) return 0
  
  const sessions = readFileSync(SESSIONS_PATH, 'utf-8')
    .trim()
    .split('\n')
    .filter(line => line)
    .map(line => JSON.parse(line))
  
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - ARCHIVE_AFTER_DAYS)
  
  const toArchive: any[] = []
  const toKeep: any[] = []
  
  sessions.forEach(session => {
    const sessionDate = new Date(session.timestamp || session.started_at)
    if (sessionDate < cutoffDate) {
      toArchive.push(session)
    } else {
      toKeep.push(session)
    }
  })
  
  if (toArchive.length > 0) {
    // Create archive file
    const archiveDate = new Date().toISOString().split('T')[0]
    const archivePath = join(ARCHIVE_DIR, `sessions-${archiveDate}.jsonl`)
    const archiveGzPath = `${archivePath}.gz`
    
    // Write sessions to archive
    writeFileSync(archivePath, toArchive.map(s => JSON.stringify(s)).join('\n'))
    
    // Compress archive
    await pipeline(
      createReadStream(archivePath),
      createGzip({ level: 9 }),
      createWriteStream(archiveGzPath)
    )
    
    // Remove uncompressed archive
    const { unlinkSync } = await import('fs')
    unlinkSync(archivePath)
    
    // Update sessions.jsonl with only recent sessions
    writeFileSync(SESSIONS_PATH, toKeep.map(s => JSON.stringify(s)).join('\n'))
    
    console.log(`📦 Archived ${toArchive.length} old sessions to ${archiveGzPath}`)
  }
  
  return toArchive.length
}

/**
 * Prune message bus - remove old heartbeats and acknowledged messages
 */
function pruneMessageBus(): { before: number; after: number } {
  if (!existsSync(MESSAGE_BUS_PATH)) return { before: 0, after: 0 }
  
  const messages = readFileSync(MESSAGE_BUS_PATH, 'utf-8')
    .trim()
    .split('\n')
    .filter(line => line)
    .map(line => JSON.parse(line))
  
  const before = messages.length
  
  // Keep only recent messages and non-heartbeat messages
  const cutoffDate = new Date()
  cutoffDate.setHours(cutoffDate.getHours() - 24) // Keep last 24 hours
  
  const filtered = messages.filter(msg => {
    const msgDate = new Date(msg.timestamp)
    
    // Always keep non-heartbeat messages from last 7 days
    if (msg.type !== 'heartbeat') {
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      return msgDate > weekAgo
    }
    
    // Keep heartbeats only from last 24 hours
    return msgDate > cutoffDate
  })
  
  writeFileSync(MESSAGE_BUS_PATH, filtered.map(m => JSON.stringify(m)).join('\n'))
  
  return { before, after: filtered.length }
}

/**
 * Smart knowledge base compression
 */
function compressKnowledgeBase(): { before: number; after: number } {
  const kb = JSON.parse(readFileSync(KB_PATH, 'utf-8'))
  const before = JSON.stringify(kb).length
  
  // Score and sort sessions by value
  if (kb.sessions) {
    kb.sessions = kb.sessions
      .map((session: any) => ({
        ...session,
        value_score: calculateValueScore(session)
      }))
      .filter((s: any) => s.value_score >= MIN_VALUE_SCORE)
      .sort((a: any, b: any) => b.value_score - a.value_score)
      .slice(0, MAX_ACTIVE_SESSIONS)
      .map(({ value_score, ...session }: any) => session) // Remove score from output
  }
  
  // Deduplicate patterns and techniques
  if (kb.patterns) {
    const uniquePatterns = new Map()
    kb.patterns.forEach((p: any) => {
      const key = JSON.stringify({ name: p.name, category: p.category })
      if (!uniquePatterns.has(key) || p.usage_count > uniquePatterns.get(key).usage_count) {
        uniquePatterns.set(key, p)
      }
    })
    kb.patterns = Array.from(uniquePatterns.values())
  }
  
  const after = JSON.stringify(kb).length
  writeFileSync(KB_PATH, JSON.stringify(kb, null, 2))
  
  return { before, after }
}

/**
 * Analyze memory health and provide recommendations
 */
function analyzeMemoryHealth(): MemoryHealth {
  const health: MemoryHealth = {
    totalSize: 0,
    tokenEstimate: 0,
    oldestSession: new Date(),
    newestSession: new Date(0),
    sessionCount: 0,
    archiveCount: 0,
    messageCount: 0,
    agentCount: 0,
    healthScore: 100,
    recommendations: []
  }
  
  // Calculate sizes and counts
  const files = [
    STATE_PATH,
    KB_PATH,
    SESSIONS_PATH,
    MESSAGE_BUS_PATH,
    join(MEMORY_DIR, 'agent-registry.json'),
    join(MEMORY_DIR, 'coordination.log'),
    join(MEMORY_DIR, 'working.md')
  ]
  
  files.forEach(file => {
    if (existsSync(file)) {
      const stat = statSync(file)
      health.totalSize += stat.size
      
      const content = readFileSync(file, 'utf-8')
      health.tokenEstimate += estimateTokens(content)
    }
  })
  
  // Count archives
  if (existsSync(ARCHIVE_DIR)) {
    health.archiveCount = readdirSync(ARCHIVE_DIR)
      .filter(f => f.endsWith('.gz')).length
  }
  
  // Analyze sessions
  if (existsSync(SESSIONS_PATH)) {
    const sessions = readFileSync(SESSIONS_PATH, 'utf-8')
      .trim()
      .split('\n')
      .filter(line => line)
    
    health.sessionCount = sessions.length
    
    sessions.forEach(line => {
      try {
        const session = JSON.parse(line)
        const date = new Date(session.timestamp || session.started_at)
        if (date < health.oldestSession) health.oldestSession = date
        if (date > health.newestSession) health.newestSession = date
      } catch (e) {}
    })
  }
  
  // Count messages
  if (existsSync(MESSAGE_BUS_PATH)) {
    health.messageCount = readFileSync(MESSAGE_BUS_PATH, 'utf-8')
      .trim()
      .split('\n')
      .filter(line => line).length
  }
  
  // Count active agents
  if (existsSync(join(MEMORY_DIR, 'agent-registry.json'))) {
    try {
      const registry = JSON.parse(readFileSync(join(MEMORY_DIR, 'agent-registry.json'), 'utf-8'))
      health.agentCount = registry.agents?.length || 0
    } catch (e) {}
  }
  
  // Calculate health score and recommendations
  if (health.tokenEstimate > TOKEN_CRITICAL_THRESHOLD) {
    health.healthScore -= 40
    health.recommendations.push('🚨 CRITICAL: Token usage exceeds 90% of limit. Immediate pruning needed!')
  } else if (health.tokenEstimate > TOKEN_WARNING_THRESHOLD) {
    health.healthScore -= 20
    health.recommendations.push('⚠️  WARNING: Token usage exceeds 75% of limit. Consider pruning.')
  }
  
  if (health.messageCount > 10000) {
    health.healthScore -= 10
    health.recommendations.push('📨 Message bus has >10k messages. Run pruning to clean old heartbeats.')
  }
  
  if (health.sessionCount > 100) {
    health.healthScore -= 10
    health.recommendations.push('📚 Over 100 active sessions. Consider archiving old sessions.')
  }
  
  const daysSinceOldest = (Date.now() - health.oldestSession.getTime()) / (1000 * 60 * 60 * 24)
  if (daysSinceOldest > 30) {
    health.healthScore -= 5
    health.recommendations.push('🗓️  Oldest session is >30 days old. Archive historical data.')
  }
  
  if (health.totalSize > 10 * 1024 * 1024) { // 10MB
    health.healthScore -= 10
    health.recommendations.push('💾 Total memory size exceeds 10MB. Consider comprehensive pruning.')
  }
  
  if (health.recommendations.length === 0) {
    health.recommendations.push('✅ Memory system is healthy!')
  }
  
  return health
}

/**
 * Generate memory report
 */
function generateReport(health: MemoryHealth, pruneResults: any): string {
  return `# Memory System Report

Generated: ${new Date().toISOString()}

## Health Score: ${health.healthScore}/100

## System Status
- Total Size: ${(health.totalSize / 1024 / 1024).toFixed(2)} MB
- Token Estimate: ${health.tokenEstimate.toLocaleString()} / 200,000
- Active Sessions: ${health.sessionCount}
- Archived Sessions: ${health.archiveCount}
- Message Count: ${health.messageCount}
- Active Agents: ${health.agentCount}

## Date Range
- Oldest: ${health.oldestSession.toISOString()}
- Newest: ${health.newestSession.toISOString()}

## Recommendations
${health.recommendations.map(r => `- ${r}`).join('\n')}

## Pruning Results
- Sessions Archived: ${pruneResults.sessionsArchived}
- Messages Pruned: ${pruneResults.messagesPruned}
- Knowledge Base: ${pruneResults.kbReduction}% reduction
- Total Space Saved: ${(pruneResults.totalSaved / 1024).toFixed(2)} KB

## Next Steps
${health.healthScore < 70 ? `
1. Run \`bun run tools/smart-memory-manager.ts --aggressive\` for deep pruning
2. Review and clean working.md manually
3. Consider increasing archive frequency
` : `
1. Continue monitoring memory usage
2. Run pruning weekly or when warnings appear
3. Review archived sessions periodically
`}
`
}

/**
 * Main smart memory management function
 */
async function manageMemory(options: { aggressive?: boolean } = {}) {
  console.log('🧠 Smart Memory Manager v2.0')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  // Analyze current health
  console.log('📊 Analyzing memory health...')
  const healthBefore = analyzeMemoryHealth()
  
  const results = {
    sessionsArchived: 0,
    messagesPruned: 0,
    kbReduction: 0,
    totalSaved: 0
  }
  
  // Archive old sessions
  if (options.aggressive || healthBefore.tokenEstimate > TOKEN_WARNING_THRESHOLD) {
    console.log('\n📦 Archiving old sessions...')
    results.sessionsArchived = await archiveSessions()
  }
  
  // Prune message bus
  console.log('\n📨 Pruning message bus...')
  const msgResult = pruneMessageBus()
  results.messagesPruned = msgResult.before - msgResult.after
  
  // Compress knowledge base
  console.log('\n📚 Compressing knowledge base...')
  const kbResult = compressKnowledgeBase()
  results.kbReduction = Math.round((1 - kbResult.after / kbResult.before) * 100)
  
  // Calculate total saved
  const healthAfter = analyzeMemoryHealth()
  results.totalSaved = healthBefore.totalSize - healthAfter.totalSize
  
  // Generate report
  const report = generateReport(healthAfter, results)
  const reportPath = join(MEMORY_DIR, `memory-report-${Date.now()}.md`)
  writeFileSync(reportPath, report)
  
  // Display summary
  console.log('\n' + '═'.repeat(50))
  console.log('📊 MEMORY MANAGEMENT COMPLETE')
  console.log('═'.repeat(50))
  console.log(`Health Score: ${healthBefore.healthScore} → ${healthAfter.healthScore}`)
  console.log(`Token Usage: ${healthBefore.tokenEstimate.toLocaleString()} → ${healthAfter.tokenEstimate.toLocaleString()}`)
  console.log(`Space Saved: ${(results.totalSaved / 1024).toFixed(2)} KB`)
  console.log(`\n📄 Full report: ${reportPath}`)
  
  return { health: healthAfter, results, report }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2)
  const aggressive = args.includes('--aggressive') || args.includes('-a')
  
  manageMemory({ aggressive }).catch(console.error)
}

export { manageMemory, analyzeMemoryHealth, MemoryHealth }