#!/usr/bin/env bun
/**
 * OpenCode Conversation Tracker
 * 
 * @deprecated Use tools/opencode-tracker.ts instead
 * 
 * This tool has been superseded by opencode-tracker.ts which provides:
 * - All the same functionality (list → sessions, show → view, export, watch, stats)
 * - Additional features: sync to memory system, learn patterns, search, tools view
 * - Uses shared utilities for consistency
 * 
 * Migration guide:
 *   OLD: bun tools/conversation-tracker.ts list
 *   NEW: bun tools/opencode-tracker.ts sessions
 * 
 *   OLD: bun tools/conversation-tracker.ts show <id>
 *   NEW: bun tools/opencode-tracker.ts view <id>
 * 
 *   OLD: bun tools/conversation-tracker.ts export <id>
 *   NEW: bun tools/opencode-tracker.ts export <id>
 * 
 *   OLD: bun tools/conversation-tracker.ts watch
 *   NEW: bun tools/opencode-tracker.ts watch
 * 
 *   OLD: bun tools/conversation-tracker.ts stats
 *   NEW: bun tools/opencode-tracker.ts stats
 * 
 * Legacy Usage (still works):
 *   bun tools/conversation-tracker.ts list [--limit N] [--project]
 *   bun tools/conversation-tracker.ts show <session_id>
 *   bun tools/conversation-tracker.ts export <session_id> [--format json|markdown]
 *   bun tools/conversation-tracker.ts watch [--session <id>]
 *   bun tools/conversation-tracker.ts stats
 */

import { readdir, readFile, stat, watch } from 'fs/promises'
import { join, basename } from 'path'
import { existsSync } from 'fs'

// OpenCode storage location
const STORAGE_BASE = process.env.HOME 
  ? join(process.env.HOME, '.local/share/opencode/storage')
  : '/root/.local/share/opencode/storage'

// Paths
const SESSIONS_DIR = join(STORAGE_BASE, 'session')
const MESSAGES_DIR = join(STORAGE_BASE, 'message')
const PARTS_DIR = join(STORAGE_BASE, 'part')

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
}

// Types
interface Session {
  id: string
  version: string
  projectID: string
  directory: string
  title: string
  time: {
    created: number
    updated: number
  }
  summary?: {
    additions: number
    deletions: number
    files: number
  }
}

interface Message {
  id: string
  sessionID: string
  role: 'user' | 'assistant'
  time: {
    created: number
  }
  summary?: {
    title: string
    diffs?: Array<{
      file: string
      before: string
      after: string
    }>
  }
}

interface Part {
  id: string
  sessionID: string
  messageID: string
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  tool?: {
    name: string
    input: unknown
  }
  result?: unknown
}

// Utility functions
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'just now'
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 3) + '...'
}

// Get project hash for current directory
async function getProjectHash(): Promise<string | null> {
  try {
    const entries = await readdir(SESSIONS_DIR)
    // Find non-global directories (they are project hashes)
    for (const entry of entries) {
      if (entry !== 'global' && entry.length === 40) {
        return entry
      }
    }
  } catch {
    // ignore
  }
  return null
}

// List all sessions
async function listSessions(options: { limit?: number; projectOnly?: boolean } = {}): Promise<Session[]> {
  const sessions: Session[] = []
  
  try {
    const entries = await readdir(SESSIONS_DIR)
    
    for (const entry of entries) {
      const entryPath = join(SESSIONS_DIR, entry)
      const entryStat = await stat(entryPath)
      
      if (entryStat.isDirectory()) {
        // Skip global if projectOnly
        if (options.projectOnly && entry === 'global') continue
        
        const sessionFiles = await readdir(entryPath)
        
        for (const file of sessionFiles) {
          if (file.endsWith('.json')) {
            try {
              const content = await readFile(join(entryPath, file), 'utf-8')
              const session = JSON.parse(content) as Session
              sessions.push(session)
            } catch {
              // Skip invalid files
            }
          }
        }
      }
    }
  } catch (error) {
    console.error(`${colors.red}Error reading sessions:${colors.reset}`, error)
    return []
  }
  
  // Sort by creation time (newest first)
  sessions.sort((a, b) => b.time.created - a.time.created)
  
  // Apply limit
  if (options.limit) {
    return sessions.slice(0, options.limit)
  }
  
  return sessions
}

// Get messages for a session
async function getMessages(sessionId: string): Promise<Message[]> {
  const messages: Message[] = []
  const sessionMsgDir = join(MESSAGES_DIR, sessionId)
  
  if (!existsSync(sessionMsgDir)) {
    return []
  }
  
  try {
    const files = await readdir(sessionMsgDir)
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await readFile(join(sessionMsgDir, file), 'utf-8')
        const message = JSON.parse(content) as Message
        messages.push(message)
      }
    }
  } catch (error) {
    console.error(`${colors.red}Error reading messages:${colors.reset}`, error)
  }
  
  // Sort by creation time
  messages.sort((a, b) => a.time.created - b.time.created)
  
  return messages
}

// Get parts for a message
async function getParts(messageId: string): Promise<Part[]> {
  const parts: Part[] = []
  const msgPartsDir = join(PARTS_DIR, messageId)
  
  if (!existsSync(msgPartsDir)) {
    return []
  }
  
  try {
    const files = await readdir(msgPartsDir)
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        const content = await readFile(join(msgPartsDir, file), 'utf-8')
        const part = JSON.parse(content) as Part
        parts.push(part)
      }
    }
  } catch (error) {
    console.error(`${colors.red}Error reading parts:${colors.reset}`, error)
  }
  
  return parts
}

// Find session by ID (partial match)
async function findSession(idOrPartial: string): Promise<Session | null> {
  const sessions = await listSessions()
  
  // Exact match first
  const exact = sessions.find(s => s.id === idOrPartial)
  if (exact) return exact
  
  // Partial match
  const partial = sessions.find(s => s.id.includes(idOrPartial))
  return partial || null
}

// Commands
async function commandList(args: string[]): Promise<void> {
  let limit: number | undefined
  let projectOnly = false
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--project') {
      projectOnly = true
    }
  }
  
  console.log(`\n${colors.bold}${colors.cyan}OpenCode Sessions${colors.reset}`)
  console.log(`${colors.dim}${'─'.repeat(80)}${colors.reset}\n`)
  
  const sessions = await listSessions({ limit, projectOnly })
  
  if (sessions.length === 0) {
    console.log(`${colors.yellow}No sessions found${colors.reset}`)
    return
  }
  
  for (const session of sessions) {
    const messages = await getMessages(session.id)
    const msgCount = messages.length
    const userMsgs = messages.filter(m => m.role === 'user').length
    const assistantMsgs = messages.filter(m => m.role === 'assistant').length
    
    console.log(`${colors.bold}${session.id}${colors.reset}`)
    console.log(`  ${colors.cyan}Title:${colors.reset} ${session.title || 'Untitled'}`)
    console.log(`  ${colors.cyan}Created:${colors.reset} ${formatTime(session.time.created)} (${formatRelativeTime(session.time.created)})`)
    console.log(`  ${colors.cyan}Messages:${colors.reset} ${msgCount} total (${userMsgs} user, ${assistantMsgs} assistant)`)
    
    if (session.summary) {
      console.log(`  ${colors.cyan}Changes:${colors.reset} +${session.summary.additions}/-${session.summary.deletions} in ${session.summary.files} files`)
    }
    
    console.log()
  }
  
  console.log(`${colors.dim}Total: ${sessions.length} sessions${colors.reset}`)
}

async function commandShow(sessionIdOrPartial: string): Promise<void> {
  const session = await findSession(sessionIdOrPartial)
  
  if (!session) {
    console.log(`${colors.red}Session not found: ${sessionIdOrPartial}${colors.reset}`)
    return
  }
  
  console.log(`\n${colors.bold}${colors.cyan}Session: ${session.id}${colors.reset}`)
  console.log(`${colors.dim}${'─'.repeat(80)}${colors.reset}\n`)
  
  console.log(`${colors.bold}Metadata:${colors.reset}`)
  console.log(`  Title: ${session.title || 'Untitled'}`)
  console.log(`  Directory: ${session.directory}`)
  console.log(`  Created: ${formatTime(session.time.created)}`)
  console.log(`  Updated: ${formatTime(session.time.updated)}`)
  
  if (session.summary) {
    console.log(`  Changes: +${session.summary.additions}/-${session.summary.deletions} in ${session.summary.files} files`)
  }
  
  console.log(`\n${colors.bold}Conversation:${colors.reset}\n`)
  
  const messages = await getMessages(session.id)
  
  for (const msg of messages) {
    const roleColor = msg.role === 'user' ? colors.green : colors.blue
    const roleIcon = msg.role === 'user' ? '>' : '<'
    
    console.log(`${roleColor}${roleIcon} [${msg.role.toUpperCase()}]${colors.reset} ${formatTime(msg.time.created)}`)
    
    if (msg.summary?.title) {
      console.log(`  ${colors.dim}Summary: ${msg.summary.title}${colors.reset}`)
    }
    
    const parts = await getParts(msg.id)
    
    for (const part of parts) {
      if (part.type === 'text' && part.text) {
        // Clean up the text (remove outer quotes if present)
        let text = part.text
        if (text.startsWith('"') && text.endsWith('"\n')) {
          text = text.slice(1, -2)
        }
        // Show first 500 chars
        const preview = truncate(text.replace(/\\n/g, '\n'), 500)
        console.log(`  ${colors.dim}${preview}${colors.reset}`)
      } else if (part.type === 'tool_use' && part.tool) {
        console.log(`  ${colors.magenta}[Tool: ${part.tool.name}]${colors.reset}`)
      } else if (part.type === 'tool_result') {
        console.log(`  ${colors.cyan}[Tool Result]${colors.reset}`)
      }
    }
    
    console.log()
  }
}

async function commandExport(sessionIdOrPartial: string, format: string = 'markdown'): Promise<void> {
  const session = await findSession(sessionIdOrPartial)
  
  if (!session) {
    console.log(`${colors.red}Session not found: ${sessionIdOrPartial}${colors.reset}`)
    return
  }
  
  const messages = await getMessages(session.id)
  
  if (format === 'json') {
    // Full JSON export
    const exportData = {
      session,
      messages: await Promise.all(messages.map(async (msg) => ({
        ...msg,
        parts: await getParts(msg.id)
      })))
    }
    console.log(JSON.stringify(exportData, null, 2))
  } else {
    // Markdown export
    console.log(`# Session: ${session.title || session.id}\n`)
    console.log(`- **Created**: ${formatTime(session.time.created)}`)
    console.log(`- **Directory**: ${session.directory}`)
    if (session.summary) {
      console.log(`- **Changes**: +${session.summary.additions}/-${session.summary.deletions} in ${session.summary.files} files`)
    }
    console.log(`\n---\n`)
    
    for (const msg of messages) {
      const roleLabel = msg.role === 'user' ? 'User' : 'Assistant'
      console.log(`## ${roleLabel}\n`)
      console.log(`*${formatTime(msg.time.created)}*\n`)
      
      const parts = await getParts(msg.id)
      
      for (const part of parts) {
        if (part.type === 'text' && part.text) {
          let text = part.text
          if (text.startsWith('"') && text.endsWith('"\n')) {
            text = text.slice(1, -2)
          }
          text = text.replace(/\\n/g, '\n')
          console.log(text)
        } else if (part.type === 'tool_use' && part.tool) {
          console.log(`\n> **Tool Call**: \`${part.tool.name}\`\n`)
        } else if (part.type === 'tool_result') {
          console.log(`\n> **Tool Result**\n`)
        }
      }
      
      console.log('\n---\n')
    }
  }
}

async function commandWatch(sessionId?: string): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}Watching for conversation updates...${colors.reset}`)
  console.log(`${colors.dim}Press Ctrl+C to stop${colors.reset}\n`)
  
  const targetDir = sessionId 
    ? join(MESSAGES_DIR, sessionId)
    : MESSAGES_DIR
  
  if (!existsSync(targetDir)) {
    console.log(`${colors.red}Directory not found: ${targetDir}${colors.reset}`)
    return
  }
  
  const seen = new Set<string>()
  
  // Watch for changes
  const watcher = watch(targetDir, { recursive: true })
  
  for await (const event of watcher) {
    if (event.filename?.endsWith('.json') && !seen.has(event.filename)) {
      seen.add(event.filename)
      
      const fullPath = join(targetDir, event.filename)
      
      if (existsSync(fullPath)) {
        try {
          const content = await readFile(fullPath, 'utf-8')
          const data = JSON.parse(content)
          
          if (data.role) {
            // It's a message
            const roleColor = data.role === 'user' ? colors.green : colors.blue
            console.log(`${colors.dim}[${formatTime(Date.now())}]${colors.reset} ${roleColor}${data.role.toUpperCase()}${colors.reset} message in ${data.sessionID}`)
            
            if (data.summary?.title) {
              console.log(`  ${colors.dim}${data.summary.title}${colors.reset}`)
            }
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }
}

async function commandStats(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}OpenCode Conversation Statistics${colors.reset}`)
  console.log(`${colors.dim}${'─'.repeat(50)}${colors.reset}\n`)
  
  const sessions = await listSessions()
  
  let totalMessages = 0
  let totalUserMessages = 0
  let totalAssistantMessages = 0
  let totalAdditions = 0
  let totalDeletions = 0
  let totalFiles = 0
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayTs = today.getTime()
  
  let sessionsToday = 0
  let sessionsThisWeek = 0
  
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  
  for (const session of sessions) {
    const messages = await getMessages(session.id)
    totalMessages += messages.length
    totalUserMessages += messages.filter(m => m.role === 'user').length
    totalAssistantMessages += messages.filter(m => m.role === 'assistant').length
    
    if (session.summary) {
      totalAdditions += session.summary.additions
      totalDeletions += session.summary.deletions
      totalFiles += session.summary.files
    }
    
    if (session.time.created >= todayTs) sessionsToday++
    if (session.time.created >= weekAgo) sessionsThisWeek++
  }
  
  console.log(`${colors.bold}Sessions:${colors.reset}`)
  console.log(`  Total: ${sessions.length}`)
  console.log(`  Today: ${sessionsToday}`)
  console.log(`  This Week: ${sessionsThisWeek}`)
  
  console.log(`\n${colors.bold}Messages:${colors.reset}`)
  console.log(`  Total: ${totalMessages}`)
  console.log(`  User: ${totalUserMessages}`)
  console.log(`  Assistant: ${totalAssistantMessages}`)
  console.log(`  Avg per session: ${(totalMessages / sessions.length || 0).toFixed(1)}`)
  
  console.log(`\n${colors.bold}Code Changes:${colors.reset}`)
  console.log(`  Additions: +${totalAdditions}`)
  console.log(`  Deletions: -${totalDeletions}`)
  console.log(`  Files Modified: ${totalFiles}`)
  
  if (sessions.length > 0) {
    const oldest = sessions[sessions.length - 1]
    const newest = sessions[0]
    
    console.log(`\n${colors.bold}Time Range:${colors.reset}`)
    console.log(`  First: ${formatTime(oldest.time.created)}`)
    console.log(`  Last: ${formatTime(newest.time.created)}`)
  }
}

// Main
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0] || 'help'
  
  if (!existsSync(STORAGE_BASE)) {
    console.log(`${colors.red}OpenCode storage not found at: ${STORAGE_BASE}${colors.reset}`)
    console.log(`Make sure OpenCode is installed and has been run at least once.`)
    process.exit(1)
  }
  
  switch (command) {
    case 'list':
    case 'ls':
      await commandList(args.slice(1))
      break
      
    case 'show':
    case 'view':
      if (!args[1]) {
        console.log(`${colors.red}Usage: conversation-tracker show <session_id>${colors.reset}`)
        process.exit(1)
      }
      await commandShow(args[1])
      break
      
    case 'export':
      if (!args[1]) {
        console.log(`${colors.red}Usage: conversation-tracker export <session_id> [--format json|markdown]${colors.reset}`)
        process.exit(1)
      }
      const formatIdx = args.indexOf('--format')
      const format = formatIdx !== -1 ? args[formatIdx + 1] : 'markdown'
      await commandExport(args[1], format)
      break
      
    case 'watch':
      await commandWatch(args[1])
      break
      
    case 'stats':
      await commandStats()
      break
      
    case 'help':
    default:
      console.log(`
${colors.bold}${colors.cyan}OpenCode Conversation Tracker${colors.reset}

Track and analyze OpenCode conversations from storage.

${colors.bold}Commands:${colors.reset}
  list [--limit N] [--project]  List all sessions
  show <session_id>             Show conversation details
  export <session_id> [--format json|markdown]  Export conversation
  watch [<session_id>]          Watch for new messages in real-time
  stats                         Show conversation statistics

${colors.bold}Examples:${colors.reset}
  bun tools/conversation-tracker.ts list --limit 10
  bun tools/conversation-tracker.ts show ses_48490b3
  bun tools/conversation-tracker.ts export ses_48490b3 --format markdown
  bun tools/conversation-tracker.ts watch
  bun tools/conversation-tracker.ts stats
`)
  }
}

main().catch(console.error)
