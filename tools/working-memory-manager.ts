#!/usr/bin/env bun
/**
 * Working Memory Manager
 * 
 * Manages the working.md file with:
 * - Archival of old session content to separate files
 * - Keep working.md focused on last 3-5 sessions
 * - CLI to search archived sessions
 * - Auto-archive on session count thresholds
 * 
 * Usage:
 *   bun tools/working-memory-manager.ts status        # Show current status
 *   bun tools/working-memory-manager.ts archive       # Archive old sessions
 *   bun tools/working-memory-manager.ts search <query># Search archived sessions
 *   bun tools/working-memory-manager.ts list          # List all archived sessions
 *   bun tools/working-memory-manager.ts view <n>      # View specific archived session
 *   bun tools/working-memory-manager.ts clean         # Clean up and optimize
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { readJson, writeJson } from './shared/json-utils';
import { PATHS, MEMORY_DIR } from './shared/paths';

const WORKING_PATH = PATHS.working;
const ARCHIVE_DIR = join(MEMORY_DIR, "working-archives");
const INDEX_PATH = join(ARCHIVE_DIR, "index.json");

// Configuration
const CONFIG = {
  keepSessions: 5,        // Keep last N sessions in working.md
  maxLines: 300,          // Archive if working.md exceeds this
  archiveThreshold: 10,   // Archive when this many sessions accumulate
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
  status          Show current status
  archive         Archive old sessions to files
  search <query>  Search across all sessions
  list            List all archived sessions
  view <n>        View specific session number
  clean           Clean up and optimize
  auto            Run automatic maintenance
`);
}
