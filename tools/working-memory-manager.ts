#!/usr/bin/env bun
/**
 * Working Memory Manager
 * 
 * Manages the working.md file and overall memory system with:
 * - Archival of old session content to separate files
 * - Keep working.md focused on last 3-5 sessions
 * - CLI to search archived sessions
 * - Auto-archive on session count thresholds
 * - Memory health analysis and token estimation
 * - Message bus pruning and knowledge base compression
 * 
 * Usage:
 *   bun tools/working-memory-manager.ts status        # Show current status
 *   bun tools/working-memory-manager.ts archive       # Archive old sessions
 *   bun tools/working-memory-manager.ts search <query># Search archived sessions
 *   bun tools/working-memory-manager.ts list          # List all archived sessions
 *   bun tools/working-memory-manager.ts view <n>      # View specific archived session
 *   bun tools/working-memory-manager.ts clean         # Clean up and optimize
 *   bun tools/working-memory-manager.ts health        # Analyze memory system health
 *   bun tools/working-memory-manager.ts prune         # Prune message bus and compress KB
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { readJson, writeJson, readJsonl } from './shared/json-utils';
import { PATHS, MEMORY_DIR, getMemoryPath } from './shared/paths';

const WORKING_PATH = PATHS.working;
const ARCHIVE_DIR = join(MEMORY_DIR, "working-archives");
const INDEX_PATH = join(ARCHIVE_DIR, "index.json");

// Configuration
const CONFIG = {
  keepSessions: 5,        // Keep last N sessions in working.md
  maxLines: 300,          // Archive if working.md exceeds this
  archiveThreshold: 10,   // Archive when this many sessions accumulate
  tokenWarningThreshold: 150000,  // Warn at 75% of 200k limit
  tokenCriticalThreshold: 180000, // Critical at 90% of 200k limit
  maxActiveKBSessions: 20,        // Keep detailed info for last 20 sessions in KB
  minValueScore: 30,              // Minimum value score to keep in active memory
};

interface SessionInfo {
  sessionNumber: number;
  startLine: number;
  endLine: number;
  date: string;
  status: string;
  achievements: string[];
  content: string;
}

interface ArchiveIndex {
  archives: Array<{
    filename: string;
    sessions: number[];
    dateRange: { start: string; end: string };
    lineCount: number;
  }>;
  lastUpdated: string;
  totalArchived: number;
}

interface MemoryHealth {
  totalSize: number;
  tokenEstimate: number;
  sessionCount: number;
  archiveCount: number;
  messageCount: number;
  agentCount: number;
  healthScore: number; // 0-100
  recommendations: string[];
}

interface SessionValueData {
  duration?: number;
  tool_calls?: number;
  achievements?: string[];
  timestamp: string;
}

interface SessionWithScore extends SessionValueData {
  _score: number;
  [key: string]: unknown;
}

// ============================================================================
// Token & Value Estimation (from smart-memory-manager)
// ============================================================================

/**
 * Estimate token count for a string (rough approximation: 1 token ≈ 4 chars)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate value score for a session (0-100)
 */
function calculateValueScore(session: SessionValueData): number {
  let score = 0;
  
  // Base score on duration (longer sessions = more value)
  if (session.duration) {
    score += Math.min(session.duration / 3600, 30); // Max 30 points
  }
  
  // Tool calls indicate productive work
  if (session.tool_calls) {
    score += Math.min(session.tool_calls / 10, 20); // Max 20 points
  }
  
  // Achievements are high value
  if (session.achievements && session.achievements.length > 0) {
    score += session.achievements.length * 10; // 10 points each
  }
  
  // Recent sessions get a boost
  const age = Date.now() - new Date(session.timestamp).getTime();
  const daysOld = age / (1000 * 60 * 60 * 24);
  if (daysOld < 1) score += 20;
  else if (daysOld < 3) score += 10;
  else if (daysOld < 7) score += 5;
  
  return Math.min(score, 100);
}

// ============================================================================
// Memory Health Analysis (from smart-memory-manager)
// ============================================================================

/**
 * Analyze memory health and provide recommendations
 */
function analyzeMemoryHealth(): MemoryHealth {
  const health: MemoryHealth = {
    totalSize: 0,
    tokenEstimate: 0,
    sessionCount: 0,
    archiveCount: 0,
    messageCount: 0,
    agentCount: 0,
    healthScore: 100,
    recommendations: []
  };
  
  // Files to check for size/tokens
  const files = [
    PATHS.state,
    PATHS.knowledgeBase,
    PATHS.sessions,
    PATHS.messageBus,
    PATHS.agentRegistry,
    PATHS.coordinationLog,
    PATHS.working
  ];
  
  for (const file of files) {
    if (existsSync(file)) {
      try {
        const stat = statSync(file);
        health.totalSize += stat.size;
        const content = readFileSync(file, "utf-8");
        health.tokenEstimate += estimateTokens(content);
      } catch {}
    }
  }
  
  // Count archives
  if (existsSync(ARCHIVE_DIR)) {
    try {
      health.archiveCount = readdirSync(ARCHIVE_DIR).filter(f => f.endsWith('.md')).length;
    } catch {}
  }
  
  // Count sessions in sessions.jsonl
  if (existsSync(PATHS.sessions)) {
    try {
      const content = readFileSync(PATHS.sessions, "utf-8");
      health.sessionCount = content.trim().split("\n").filter(l => l).length;
    } catch {}
  }
  
  // Count messages
  if (existsSync(PATHS.messageBus)) {
    try {
      const content = readFileSync(PATHS.messageBus, "utf-8");
      health.messageCount = content.trim().split("\n").filter(l => l).length;
    } catch {}
  }
  
  // Count agents
  if (existsSync(PATHS.agentRegistry)) {
    try {
      const registry = JSON.parse(readFileSync(PATHS.agentRegistry, "utf-8"));
      health.agentCount = registry.agents?.length || 0;
    } catch {}
  }
  
  // Calculate health score and recommendations
  if (health.tokenEstimate > CONFIG.tokenCriticalThreshold) {
    health.healthScore -= 40;
    health.recommendations.push("CRITICAL: Token usage exceeds 90% of limit. Immediate pruning needed!");
  } else if (health.tokenEstimate > CONFIG.tokenWarningThreshold) {
    health.healthScore -= 20;
    health.recommendations.push("WARNING: Token usage exceeds 75% of limit. Consider pruning.");
  }
  
  if (health.messageCount > 10000) {
    health.healthScore -= 10;
    health.recommendations.push("Message bus has >10k messages. Run 'prune' to clean old heartbeats.");
  }
  
  if (health.sessionCount > 100) {
    health.healthScore -= 10;
    health.recommendations.push("Over 100 sessions in sessions.jsonl. Consider archiving.");
  }
  
  if (health.totalSize > 10 * 1024 * 1024) { // 10MB
    health.healthScore -= 10;
    health.recommendations.push("Total memory size exceeds 10MB. Run comprehensive pruning.");
  }
  
  if (health.recommendations.length === 0) {
    health.recommendations.push("Memory system is healthy!");
  }
  
  return health;
}

// ============================================================================
// Pruning Functions (from smart-memory-manager)
// ============================================================================

/**
 * Prune message bus - remove old heartbeats and keep recent messages
 */
function pruneMessageBus(): { before: number; after: number } {
  if (!existsSync(PATHS.messageBus)) return { before: 0, after: 0 };
  
  try {
    const content = readFileSync(PATHS.messageBus, "utf-8");
    const messages = content.trim().split("\n").filter(l => l).map(l => JSON.parse(l));
    const before = messages.length;
    
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    
    const filtered = messages.filter(msg => {
      const msgTime = new Date(msg.timestamp).getTime();
      
      // Keep non-heartbeat messages from last 7 days
      if (msg.type !== "heartbeat") {
        return msgTime > oneWeekAgo;
      }
      
      // Keep heartbeats only from last 24 hours
      return msgTime > oneDayAgo;
    });
    
    writeFileSync(PATHS.messageBus, filtered.map(m => JSON.stringify(m)).join("\n") + "\n");
    
    return { before, after: filtered.length };
  } catch {
    return { before: 0, after: 0 };
  }
}

/**
 * Compress knowledge base - dedupe and keep high-value sessions
 */
function compressKnowledgeBase(): { before: number; after: number } {
  if (!existsSync(PATHS.knowledgeBase)) return { before: 0, after: 0 };
  
  try {
    const kb = JSON.parse(readFileSync(PATHS.knowledgeBase, "utf-8"));
    const before = JSON.stringify(kb).length;
    
    // Score and filter sessions by value
    if (kb.sessions && Array.isArray(kb.sessions)) {
      kb.sessions = kb.sessions
        .map((session: SessionValueData) => ({ ...session, _score: calculateValueScore(session) }) as SessionWithScore)
        .filter((s: SessionWithScore) => s._score >= CONFIG.minValueScore)
        .sort((a: SessionWithScore, b: SessionWithScore) => b._score - a._score)
        .slice(0, CONFIG.maxActiveKBSessions)
        .map(({ _score, ...session }: SessionWithScore) => session);
    }
    
    // Deduplicate patterns
    if (kb.patterns && Array.isArray(kb.patterns)) {
      const uniquePatterns = new Map();
      for (const p of kb.patterns) {
        const key = JSON.stringify({ name: p.name, category: p.category });
        if (!uniquePatterns.has(key) || (p.usage_count || 0) > (uniquePatterns.get(key).usage_count || 0)) {
          uniquePatterns.set(key, p);
        }
      }
      kb.patterns = Array.from(uniquePatterns.values());
    }
    
    const after = JSON.stringify(kb).length;
    writeFileSync(PATHS.knowledgeBase, JSON.stringify(kb, null, 2));
    
    return { before, after };
  } catch {
    return { before: 0, after: 0 };
  }
}

// Parse working.md to extract sessions
function parseWorkingMd(content: string): { header: string; sessions: SessionInfo[] } {
  const lines = content.split("\n");
  const sessions: SessionInfo[] = [];
  let header = "";
  
  let currentSession: Partial<SessionInfo> | null = null;
  let sessionStartLine = 0;
  let inHeader = true;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect session headers (## Session N or ## Current Session: N or ## Previous Session: N)
    const sessionMatch = line.match(/^##\s+(?:Current\s+)?(?:Previous\s+)?(?:Earlier\s+)?Session(?:\s*:)?\s*(\d+)/i);
    
    if (sessionMatch) {
      // Save previous session
      if (currentSession && currentSession.sessionNumber !== undefined) {
        currentSession.endLine = i - 1;
        currentSession.content = lines.slice(sessionStartLine, i).join("\n");
        sessions.push(currentSession as SessionInfo);
      }
      
      // If we're still in header, save it
      if (inHeader) {
        header = lines.slice(0, sessionStartLine).join("\n");
        inHeader = false;
      }
      
      // Start new session
      currentSession = {
        sessionNumber: parseInt(sessionMatch[1]),
        startLine: i,
        date: "",
        status: "",
        achievements: [],
      };
      sessionStartLine = i;
    }
    
    // Extract date
    if (currentSession && line.match(/^\*\*Date\*\*:\s*/)) {
      currentSession.date = line.replace(/^\*\*Date\*\*:\s*/, "").trim();
    }
    
    // Extract status
    if (currentSession && line.match(/^\*\*Status\*\*:\s*/)) {
      currentSession.status = line.replace(/^\*\*Status\*\*:\s*/, "").trim();
    }
    
    // Extract achievements (lines starting with - in completed tasks section)
    if (currentSession && line.match(/^[-*]\s+\*\*.*\*\*/)) {
      const achievement = line.replace(/^[-*]\s+/, "").trim();
      currentSession.achievements.push(achievement);
    }
  }
  
  // Save last session
  if (currentSession && currentSession.sessionNumber !== undefined) {
    currentSession.endLine = lines.length - 1;
    currentSession.content = lines.slice(sessionStartLine).join("\n");
    sessions.push(currentSession as SessionInfo);
  }
  
  // If no sessions found, everything is header
  if (sessions.length === 0) {
    header = content;
  }
  
  return { header, sessions };
}

function getIndex(): ArchiveIndex {
  return readJson<ArchiveIndex>(INDEX_PATH, { archives: [], lastUpdated: new Date().toISOString(), totalArchived: 0 });
}

function saveIndex(index: ArchiveIndex): void {
  writeJson(INDEX_PATH, index);
}

function ensureArchiveDir(): void {
  if (!existsSync(ARCHIVE_DIR)) {
    mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
}

// Commands
function status(): void {
  if (!existsSync(WORKING_PATH)) {
    console.log("No working.md found.");
    return;
  }
  
  const content = readFileSync(WORKING_PATH, "utf-8");
  const lines = content.split("\n").length;
  const { header, sessions } = parseWorkingMd(content);
  const index = getIndex();
  
  console.log("\n\x1b[1m\x1b[44m WORKING MEMORY STATUS \x1b[0m\n");
  console.log(`\x1b[36mFile:\x1b[0m             ${WORKING_PATH}`);
  console.log(`\x1b[36mLines:\x1b[0m            ${lines}`);
  console.log(`\x1b[36mSessions in file:\x1b[0m ${sessions.length}`);
  console.log(`\x1b[36mArchived:\x1b[0m         ${index.totalArchived} sessions in ${index.archives.length} archives`);
  
  console.log("\n\x1b[1mSessions in working.md:\x1b[0m");
  for (const session of sessions.slice(0, 10)) {
    const lineCount = session.content.split("\n").length;
    console.log(`  Session ${session.sessionNumber.toString().padStart(3)}: ${lineCount.toString().padStart(4)} lines - ${session.status || "unknown status"}`);
  }
  if (sessions.length > 10) {
    console.log(`  ... and ${sessions.length - 10} more`);
  }
  
  // Recommendations
  const shouldArchive = lines > CONFIG.maxLines || sessions.length > CONFIG.archiveThreshold;
  if (shouldArchive) {
    const toArchive = sessions.length - CONFIG.keepSessions;
    console.log(`\n\x1b[33mRecommendation:\x1b[0m Run 'archive' to archive ${toArchive} old sessions`);
  }
}

function archive(): void {
  if (!existsSync(WORKING_PATH)) {
    console.log("No working.md found.");
    return;
  }
  
  const content = readFileSync(WORKING_PATH, "utf-8");
  const { header, sessions } = parseWorkingMd(content);
  
  if (sessions.length <= CONFIG.keepSessions) {
    console.log(`Only ${sessions.length} sessions found. Nothing to archive (keeping ${CONFIG.keepSessions}).`);
    return;
  }
  
  ensureArchiveDir();
  
  // Sort sessions by number (newest first) and split
  const sortedSessions = [...sessions].sort((a, b) => b.sessionNumber - a.sessionNumber);
  const toKeep = sortedSessions.slice(0, CONFIG.keepSessions);
  const toArchive = sortedSessions.slice(CONFIG.keepSessions);
  
  if (toArchive.length === 0) {
    console.log("Nothing to archive.");
    return;
  }
  
  // Create archive file
  const sessionNumbers = toArchive.map(s => s.sessionNumber).sort((a, b) => a - b);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archiveFilename = `sessions-${sessionNumbers[0]}-${sessionNumbers[sessionNumbers.length - 1]}-${timestamp}.md`;
  const archivePath = join(ARCHIVE_DIR, archiveFilename);
  
  // Build archive content
  const archiveContent = `# Archived Working Memory\n\n` +
    `Archived: ${new Date().toISOString()}\n` +
    `Sessions: ${sessionNumbers.join(", ")}\n\n---\n\n` +
    toArchive.map(s => s.content).join("\n\n---\n\n");
  
  writeFileSync(archivePath, archiveContent);
  
  // Update index
  const index = getIndex();
  index.archives.push({
    filename: archiveFilename,
    sessions: sessionNumbers,
    dateRange: {
      start: toArchive[toArchive.length - 1].date || "unknown",
      end: toArchive[0].date || "unknown",
    },
    lineCount: archiveContent.split("\n").length,
  });
  index.totalArchived += toArchive.length;
  index.lastUpdated = new Date().toISOString();
  saveIndex(index);
  
  // Rebuild working.md with only kept sessions
  const keptSorted = toKeep.sort((a, b) => b.sessionNumber - a.sessionNumber);
  
  // Get the current session number from header or first session
  const currentSession = keptSorted[0]?.sessionNumber || 99;
  
  const newWorkingContent = `# Working Memory\n\n` +
    `## Current Session: ${currentSession}\n\n` +
    keptSorted.map((s, i) => {
      if (i === 0) {
        // Current session - remove duplicate header
        return s.content.replace(/^##\s+(?:Current\s+)?Session(?:\s*:)?\s*\d+\s*\n+/i, "");
      }
      return s.content;
    }).join("\n\n---\n\n");
  
  writeFileSync(WORKING_PATH, newWorkingContent);
  
  console.log(`\x1b[32mArchived ${toArchive.length} sessions to ${archiveFilename}\x1b[0m`);
  console.log(`Kept ${toKeep.length} most recent sessions in working.md`);
  console.log(`New working.md: ${newWorkingContent.split("\n").length} lines`);
}

function search(query: string): void {
  const queryLower = query.toLowerCase();
  const results: Array<{ source: string; session: number; snippet: string }> = [];
  
  // Search current working.md
  if (existsSync(WORKING_PATH)) {
    const content = readFileSync(WORKING_PATH, "utf-8");
    const { sessions } = parseWorkingMd(content);
    
    for (const session of sessions) {
      if (session.content.toLowerCase().includes(queryLower)) {
        // Find matching line
        const lines = session.content.split("\n");
        const matchLine = lines.find(l => l.toLowerCase().includes(queryLower));
        results.push({
          source: "working.md",
          session: session.sessionNumber,
          snippet: matchLine?.trim().slice(0, 100) || "",
        });
      }
    }
  }
  
  // Search archives
  ensureArchiveDir();
  const index = getIndex();
  
  for (const archive of index.archives) {
    const archivePath = join(ARCHIVE_DIR, archive.filename);
    if (!existsSync(archivePath)) continue;
    
    const content = readFileSync(archivePath, "utf-8");
    if (content.toLowerCase().includes(queryLower)) {
      // Find matching sessions
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(queryLower)) {
          // Try to determine session number from context
          let sessionNum = 0;
          for (let j = i; j >= 0; j--) {
            const match = lines[j].match(/Session(?:\s*:)?\s*(\d+)/i);
            if (match) {
              sessionNum = parseInt(match[1]);
              break;
            }
          }
          
          results.push({
            source: archive.filename,
            session: sessionNum,
            snippet: lines[i].trim().slice(0, 100),
          });
          break; // One result per archive
        }
      }
    }
  }
  
  console.log(`\n\x1b[1mSearch Results for "${query}"\x1b[0m\n`);
  console.log(`Found ${results.length} matches\n`);
  
  for (const { source, session, snippet } of results) {
    console.log(`\x1b[2m[${source}]\x1b[0m \x1b[36mSession ${session}\x1b[0m`);
    console.log(`  ${snippet}...`);
  }
}

function listArchives(): void {
  ensureArchiveDir();
  const index = getIndex();
  
  console.log("\n\x1b[1m\x1b[44m ARCHIVED SESSIONS \x1b[0m\n");
  
  if (index.archives.length === 0) {
    console.log("No archived sessions found.");
    return;
  }
  
  console.log(`Total: ${index.totalArchived} sessions in ${index.archives.length} archives\n`);
  
  for (const archive of index.archives) {
    console.log(`\x1b[36m${archive.filename}\x1b[0m`);
    console.log(`  Sessions: ${archive.sessions.join(", ")}`);
    console.log(`  Date range: ${archive.dateRange.start} to ${archive.dateRange.end}`);
    console.log(`  Lines: ${archive.lineCount}`);
    console.log();
  }
}

function viewSession(sessionNumber: number): void {
  // First check working.md
  if (existsSync(WORKING_PATH)) {
    const content = readFileSync(WORKING_PATH, "utf-8");
    const { sessions } = parseWorkingMd(content);
    
    const session = sessions.find(s => s.sessionNumber === sessionNumber);
    if (session) {
      console.log(`\n\x1b[1m\x1b[44m SESSION ${sessionNumber} (in working.md) \x1b[0m\n`);
      console.log(session.content);
      return;
    }
  }
  
  // Check archives
  ensureArchiveDir();
  const index = getIndex();
  
  for (const archive of index.archives) {
    if (archive.sessions.includes(sessionNumber)) {
      const archivePath = join(ARCHIVE_DIR, archive.filename);
      if (!existsSync(archivePath)) continue;
      
      const content = readFileSync(archivePath, "utf-8");
      
      // Find the session in the archive
      const sessionRegex = new RegExp(`## (?:Current |Previous |Earlier )?Session:?\\s*${sessionNumber}\\b`, "i");
      const match = content.match(sessionRegex);
      
      if (match) {
        // Extract session content (until next session or end)
        const startIndex = content.indexOf(match[0]);
        const nextSessionMatch = content.slice(startIndex + match[0].length).match(/^## (?:Current |Previous |Earlier )?Session/im);
        
        const endIndex = nextSessionMatch 
          ? content.indexOf(nextSessionMatch[0], startIndex + match[0].length)
          : content.length;
        
        const sessionContent = content.slice(startIndex, endIndex);
        
        console.log(`\n\x1b[1m\x1b[44m SESSION ${sessionNumber} (from ${archive.filename}) \x1b[0m\n`);
        console.log(sessionContent);
        return;
      }
    }
  }
  
  console.log(`Session ${sessionNumber} not found in working.md or archives.`);
}

function clean(): void {
  if (!existsSync(WORKING_PATH)) {
    console.log("No working.md found.");
    return;
  }
  
  const content = readFileSync(WORKING_PATH, "utf-8");
  const lines = content.split("\n");
  
  // Remove excessive blank lines (more than 2 consecutive)
  const cleanedLines: string[] = [];
  let blankCount = 0;
  
  for (const line of lines) {
    if (line.trim() === "") {
      blankCount++;
      if (blankCount <= 2) {
        cleanedLines.push(line);
      }
    } else {
      blankCount = 0;
      cleanedLines.push(line);
    }
  }
  
  // Remove trailing whitespace from lines
  const finalLines = cleanedLines.map(l => l.trimEnd());
  
  // Ensure file ends with single newline
  const cleanedContent = finalLines.join("\n").trim() + "\n";
  
  const removedLines = lines.length - finalLines.length;
  
  if (removedLines > 0 || cleanedContent !== content) {
    writeFileSync(WORKING_PATH, cleanedContent);
    console.log(`\x1b[32mCleaned working.md:\x1b[0m`);
    console.log(`  Removed ${removedLines} excess blank lines`);
    console.log(`  Final: ${cleanedContent.split("\n").length} lines`);
  } else {
    console.log("Working.md is already clean.");
  }
}

function health(): void {
  console.log("\n\x1b[1m\x1b[44m MEMORY SYSTEM HEALTH \x1b[0m\n");
  
  const h = analyzeMemoryHealth();
  
  // Health score color
  const scoreColor = h.healthScore >= 80 ? "\x1b[32m" : h.healthScore >= 50 ? "\x1b[33m" : "\x1b[31m";
  
  console.log(`${scoreColor}Health Score: ${h.healthScore}/100\x1b[0m\n`);
  
  console.log("\x1b[36mSystem Status:\x1b[0m");
  console.log(`  Total Size:     ${(h.totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Token Estimate: ${h.tokenEstimate.toLocaleString()} / 200,000`);
  console.log(`  Sessions:       ${h.sessionCount}`);
  console.log(`  Archives:       ${h.archiveCount}`);
  console.log(`  Messages:       ${h.messageCount}`);
  console.log(`  Active Agents:  ${h.agentCount}`);
  
  console.log("\n\x1b[36mRecommendations:\x1b[0m");
  for (const rec of h.recommendations) {
    const icon = rec.includes("CRITICAL") ? "\x1b[31m!" : 
                 rec.includes("WARNING") ? "\x1b[33m!" : "\x1b[32m✓";
    console.log(`  ${icon}\x1b[0m ${rec}`);
  }
  
  if (h.healthScore < 70) {
    console.log("\n\x1b[33mRun 'prune' to clean up the memory system.\x1b[0m");
  }
}

function prune(): void {
  console.log("\n\x1b[1m\x1b[44m MEMORY PRUNING \x1b[0m\n");
  
  const healthBefore = analyzeMemoryHealth();
  
  // Prune message bus
  console.log("\x1b[36mPruning message bus...\x1b[0m");
  const msgResult = pruneMessageBus();
  const msgPruned = msgResult.before - msgResult.after;
  console.log(`  Removed ${msgPruned} old messages (${msgResult.before} -> ${msgResult.after})`);
  
  // Compress knowledge base
  console.log("\n\x1b[36mCompressing knowledge base...\x1b[0m");
  const kbResult = compressKnowledgeBase();
  const kbReduction = kbResult.before > 0 
    ? Math.round((1 - kbResult.after / kbResult.before) * 100) 
    : 0;
  console.log(`  Size reduction: ${kbReduction}% (${kbResult.before} -> ${kbResult.after} bytes)`);
  
  // Clean working.md
  console.log("\n\x1b[36mCleaning working.md...\x1b[0m");
  clean();
  
  // Results
  const healthAfter = analyzeMemoryHealth();
  const tokensSaved = healthBefore.tokenEstimate - healthAfter.tokenEstimate;
  const sizeSaved = healthBefore.totalSize - healthAfter.totalSize;
  
  console.log("\n\x1b[32m═══════════════════════════════════════\x1b[0m");
  console.log("\x1b[32m PRUNING COMPLETE\x1b[0m");
  console.log("\x1b[32m═══════════════════════════════════════\x1b[0m");
  console.log(`Health Score: ${healthBefore.healthScore} -> ${healthAfter.healthScore}`);
  console.log(`Tokens Saved: ${tokensSaved.toLocaleString()}`);
  console.log(`Space Saved:  ${(sizeSaved / 1024).toFixed(2)} KB`);
}

// Auto-maintenance function (for plugin integration)
export function autoMaintenance(): { archived: number; cleaned: boolean } {
  let archived = 0;
  let cleaned = false;
  
  if (!existsSync(WORKING_PATH)) {
    return { archived, cleaned };
  }
  
  const content = readFileSync(WORKING_PATH, "utf-8");
  const lines = content.split("\n").length;
  const { sessions } = parseWorkingMd(content);
  
  // Archive if needed
  if (lines > CONFIG.maxLines || sessions.length > CONFIG.archiveThreshold) {
    ensureArchiveDir();
    
    const sortedSessions = [...sessions].sort((a, b) => b.sessionNumber - a.sessionNumber);
    const toKeep = sortedSessions.slice(0, CONFIG.keepSessions);
    const toArchive = sortedSessions.slice(CONFIG.keepSessions);
    
    if (toArchive.length > 0) {
      const sessionNumbers = toArchive.map(s => s.sessionNumber).sort((a, b) => a - b);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const archiveFilename = `sessions-${sessionNumbers[0]}-${sessionNumbers[sessionNumbers.length - 1]}-${timestamp}.md`;
      const archivePath = join(ARCHIVE_DIR, archiveFilename);
      
      const archiveContent = `# Archived Working Memory\n\n` +
        `Archived: ${new Date().toISOString()}\n` +
        `Sessions: ${sessionNumbers.join(", ")}\n\n---\n\n` +
        toArchive.map(s => s.content).join("\n\n---\n\n");
      
      writeFileSync(archivePath, archiveContent);
      
      const index = getIndex();
      index.archives.push({
        filename: archiveFilename,
        sessions: sessionNumbers,
        dateRange: {
          start: toArchive[toArchive.length - 1].date || "unknown",
          end: toArchive[0].date || "unknown",
        },
        lineCount: archiveContent.split("\n").length,
      });
      index.totalArchived += toArchive.length;
      index.lastUpdated = new Date().toISOString();
      saveIndex(index);
      
      const keptSorted = toKeep.sort((a, b) => b.sessionNumber - a.sessionNumber);
      const currentSession = keptSorted[0]?.sessionNumber || 99;
      
      const newWorkingContent = `# Working Memory\n\n` +
        `## Current Session: ${currentSession}\n\n` +
        keptSorted.map((s, i) => {
          if (i === 0) {
            return s.content.replace(/^##\s+(?:Current\s+)?Session(?:\s*:)?\s*\d+\s*\n+/i, "");
          }
          return s.content;
        }).join("\n\n---\n\n");
      
      writeFileSync(WORKING_PATH, newWorkingContent);
      archived = toArchive.length;
    }
  }
  
  return { archived, cleaned };
}

// Main CLI
const args = process.argv.slice(2);
const command = args[0] || "status";

switch (command) {
  case "status":
    status();
    break;
  case "archive":
    archive();
    break;
  case "search":
    if (!args[1]) {
      console.error("Usage: working-memory-manager.ts search <query>");
      process.exit(1);
    }
    search(args.slice(1).join(" "));
    break;
  case "list":
    listArchives();
    break;
  case "view":
    if (!args[1]) {
      console.error("Usage: working-memory-manager.ts view <session-number>");
      process.exit(1);
    }
    viewSession(parseInt(args[1]));
    break;
  case "clean":
    clean();
    break;
  case "health":
    health();
    break;
  case "prune":
    prune();
    break;
  case "auto":
    const result = autoMaintenance();
    console.log("Auto-maintenance result:", result);
    break;
  default:
    console.log(`
Working Memory Manager

Usage:
  bun tools/working-memory-manager.ts <command>

Commands:
  status          Show current working.md status
  archive         Archive old sessions to files
  search <query>  Search across all sessions
  list            List all archived sessions
  view <n>        View specific session number
  clean           Clean up working.md whitespace
  health          Analyze memory system health
  prune           Prune message bus and compress KB
  auto            Run automatic maintenance
`);
}

// Export additional functions for use by other tools
export { 
  analyzeMemoryHealth, 
  pruneMessageBus, 
  compressKnowledgeBase,
  estimateTokens,
  calculateValueScore,
  type MemoryHealth 
};
