#!/usr/bin/env bun
/**
 * Message Bus Manager
 * 
 * Manages the message bus with:
 * - Automatic rotation to archived files
 * - Heartbeat deduplication (keep only latest per agent)
 * - Message TTL for cleanup
 * - Index file for fast searching across archives
 * 
 * Usage:
 *   bun tools/message-bus-manager.ts status          # Show current bus status
 *   bun tools/message-bus-manager.ts rotate          # Rotate to new archive
 *   bun tools/message-bus-manager.ts compact         # Remove old heartbeats, dedupe
 *   bun tools/message-bus-manager.ts cleanup [hours] # Remove messages older than N hours
 *   bun tools/message-bus-manager.ts search <query>  # Search across all archives
 *   bun tools/message-bus-manager.ts stats           # Message statistics
 */

import { existsSync, writeFileSync, statSync, mkdirSync } from "fs";
import { join } from "path";
import { readJson, readJsonl, writeJson } from './shared/json-utils';
import { formatTimeAgo } from './shared/time-utils';
import { PATHS, MEMORY_DIR } from './shared/paths';

const MESSAGE_BUS_PATH = PATHS.messageBus;
const ARCHIVE_DIR = join(MEMORY_DIR, "message-archives");
const INDEX_PATH = join(ARCHIVE_DIR, "index.json");

// Configuration
const CONFIG = {
  maxMessages: 500,           // Rotate after this many messages
  maxSizeBytes: 100 * 1024,   // Rotate after 100KB
  heartbeatTTLHours: 1,       // Keep heartbeats for 1 hour
  messageTTLHours: 24 * 7,    // Keep other messages for 7 days
  keepLatestHeartbeatsPerAgent: 3, // Keep last 3 heartbeats per agent
};

interface Message {
  id: string;
  from: string;
  type: string;
  timestamp: string;
  payload: any;
}

interface ArchiveIndex {
  archives: Array<{
    filename: string;
    startDate: string;
    endDate: string;
    messageCount: number;
    types: string[];
    agents: string[];
  }>;
  lastUpdated: string;
  totalMessages: number;
}

// Utility functions
function readMessages(path: string = MESSAGE_BUS_PATH): Message[] {
  return readJsonl<Message>(path);
}

function writeMessages(messages: Message[], path: string = MESSAGE_BUS_PATH): void {
  const content = messages.map(m => JSON.stringify(m)).join("\n");
  writeFileSync(path, content + (messages.length > 0 ? "\n" : ""));
}

function getIndex(): ArchiveIndex {
  return readJson<ArchiveIndex>(INDEX_PATH, { archives: [], lastUpdated: new Date().toISOString(), totalMessages: 0 });
}

function saveIndex(index: ArchiveIndex): void {
  writeJson(INDEX_PATH, index);
}

function ensureArchiveDir(): void {
  if (!existsSync(ARCHIVE_DIR)) {
    mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// Commands
function status(): void {
  const messages = readMessages();
  const size = existsSync(MESSAGE_BUS_PATH) 
    ? statSync(MESSAGE_BUS_PATH).size 
    : 0;
  
  const index = getIndex();
  
  // Count by type
  const typeCounts: Record<string, number> = {};
  const agentCounts: Record<string, number> = {};
  let oldestTimestamp = "";
  let newestTimestamp = "";
  
  for (const msg of messages) {
    typeCounts[msg.type] = (typeCounts[msg.type] || 0) + 1;
    agentCounts[msg.from] = (agentCounts[msg.from] || 0) + 1;
    
    if (!oldestTimestamp || msg.timestamp < oldestTimestamp) {
      oldestTimestamp = msg.timestamp;
    }
    if (!newestTimestamp || msg.timestamp > newestTimestamp) {
      newestTimestamp = msg.timestamp;
    }
  }
  
  console.log("\n\x1b[1m\x1b[44m MESSAGE BUS STATUS \x1b[0m\n");
  console.log(`\x1b[36mMessages:\x1b[0m     ${messages.length}`);
  console.log(`\x1b[36mSize:\x1b[0m         ${formatBytes(size)}`);
  console.log(`\x1b[36mArchives:\x1b[0m     ${index.archives.length}`);
  console.log(`\x1b[36mTotal (all):\x1b[0m  ${index.totalMessages + messages.length}`);
  
  if (messages.length > 0) {
    console.log(`\x1b[36mOldest:\x1b[0m       ${formatTimeAgo(oldestTimestamp)}`);
    console.log(`\x1b[36mNewest:\x1b[0m       ${formatTimeAgo(newestTimestamp)}`);
  }
  
  console.log("\n\x1b[1mBy Type:\x1b[0m");
  Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      const bar = "=".repeat(Math.min(count, 40));
      console.log(`  ${type.padEnd(18)} ${count.toString().padStart(4)} ${bar}`);
    });
  
  console.log("\n\x1b[1mBy Agent (top 5):\x1b[0m");
  Object.entries(agentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([agent, count]) => {
      const shortAgent = agent.replace("agent-", "").slice(0, 20);
      console.log(`  ${shortAgent.padEnd(25)} ${count.toString().padStart(4)}`);
    });
  
  // Rotation recommendation
  const shouldRotate = messages.length >= CONFIG.maxMessages || size >= CONFIG.maxSizeBytes;
  if (shouldRotate) {
    console.log("\n\x1b[33mRecommendation:\x1b[0m Run 'rotate' to archive old messages");
  }
}

function rotate(): void {
  const messages = readMessages();
  
  if (messages.length === 0) {
    console.log("No messages to rotate.");
    return;
  }
  
  ensureArchiveDir();
  
  // Create archive filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archiveFilename = `messages-${timestamp}.jsonl`;
  const archivePath = join(ARCHIVE_DIR, archiveFilename);
  
  // Write to archive
  writeMessages(messages, archivePath);
  
  // Update index
  const index = getIndex();
  const types = [...new Set(messages.map(m => m.type))];
  const agents = [...new Set(messages.map(m => m.from))];
  
  index.archives.push({
    filename: archiveFilename,
    startDate: messages[0].timestamp,
    endDate: messages[messages.length - 1].timestamp,
    messageCount: messages.length,
    types,
    agents: agents.slice(0, 10), // Keep first 10
  });
  index.totalMessages += messages.length;
  index.lastUpdated = new Date().toISOString();
  
  saveIndex(index);
  
  // Clear current message bus
  writeFileSync(MESSAGE_BUS_PATH, "");
  
  console.log(`\x1b[32mRotated ${messages.length} messages to ${archiveFilename}\x1b[0m`);
  console.log(`Archive size: ${formatBytes(statSync(archivePath).size)}`);
}

function compact(): void {
  const messages = readMessages();
  const now = Date.now();
  const heartbeatTTL = CONFIG.heartbeatTTLHours * 60 * 60 * 1000;
  
  // Group heartbeats by agent
  const heartbeatsByAgent: Record<string, Message[]> = {};
  const otherMessages: Message[] = [];
  
  for (const msg of messages) {
    if (msg.type === "heartbeat") {
      const agent = msg.from;
      if (!heartbeatsByAgent[agent]) {
        heartbeatsByAgent[agent] = [];
      }
      heartbeatsByAgent[agent].push(msg);
    } else {
      otherMessages.push(msg);
    }
  }
  
  // Keep only latest N heartbeats per agent within TTL
  const keptHeartbeats: Message[] = [];
  for (const [agent, heartbeats] of Object.entries(heartbeatsByAgent)) {
    const sorted = heartbeats.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    const recent = sorted
      .filter(hb => now - new Date(hb.timestamp).getTime() < heartbeatTTL)
      .slice(0, CONFIG.keepLatestHeartbeatsPerAgent);
    
    keptHeartbeats.push(...recent);
  }
  
  // Combine and sort
  const compactedMessages = [...otherMessages, ...keptHeartbeats]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  const removedCount = messages.length - compactedMessages.length;
  
  writeMessages(compactedMessages);
  
  console.log(`\x1b[32mCompacted message bus:\x1b[0m`);
  console.log(`  Before: ${messages.length} messages`);
  console.log(`  After:  ${compactedMessages.length} messages`);
  console.log(`  Removed: ${removedCount} (${Math.round(removedCount / messages.length * 100)}% reduction)`);
}

function cleanup(hours: number = 24): void {
  const messages = readMessages();
  const now = Date.now();
  const cutoff = hours * 60 * 60 * 1000;
  
  const kept = messages.filter(msg => {
    const age = now - new Date(msg.timestamp).getTime();
    
    // Heartbeats have shorter TTL
    if (msg.type === "heartbeat") {
      return age < CONFIG.heartbeatTTLHours * 60 * 60 * 1000;
    }
    
    return age < cutoff;
  });
  
  const removedCount = messages.length - kept.length;
  
  if (removedCount > 0) {
    writeMessages(kept);
    console.log(`\x1b[32mCleaned up ${removedCount} messages older than ${hours} hours\x1b[0m`);
    console.log(`Remaining: ${kept.length} messages`);
  } else {
    console.log("No messages to clean up.");
  }
}

function search(query: string): void {
  const queryLower = query.toLowerCase();
  const results: Array<{ source: string; message: Message }> = [];
  
  // Search current bus
  const currentMessages = readMessages();
  for (const msg of currentMessages) {
    const searchable = JSON.stringify(msg).toLowerCase();
    if (searchable.includes(queryLower)) {
      results.push({ source: "current", message: msg });
    }
  }
  
  // Search archives
  ensureArchiveDir();
  const index = getIndex();
  
  for (const archive of index.archives) {
    const archivePath = join(ARCHIVE_DIR, archive.filename);
    if (!existsSync(archivePath)) continue;
    
    const archiveMessages = readMessages(archivePath);
    for (const msg of archiveMessages) {
      const searchable = JSON.stringify(msg).toLowerCase();
      if (searchable.includes(queryLower)) {
        results.push({ source: archive.filename, message: msg });
      }
    }
  }
  
  console.log(`\n\x1b[1mSearch Results for "${query}"\x1b[0m\n`);
  console.log(`Found ${results.length} matches\n`);
  
  // Show last 20 results
  const toShow = results.slice(-20);
  for (const { source, message } of toShow) {
    console.log(`\x1b[2m[${source}]\x1b[0m \x1b[36m${message.type}\x1b[0m from ${message.from.replace("agent-", "").slice(0, 15)}...`);
    console.log(`  ${formatTimeAgo(message.timestamp)}: ${JSON.stringify(message.payload).slice(0, 80)}...`);
  }
  
  if (results.length > 20) {
    console.log(`\n... and ${results.length - 20} more`);
  }
}

function stats(): void {
  const index = getIndex();
  const currentMessages = readMessages();
  
  const allMessages: Message[] = [...currentMessages];
  
  // Load all archives
  for (const archive of index.archives) {
    const archivePath = join(ARCHIVE_DIR, archive.filename);
    if (existsSync(archivePath)) {
      allMessages.push(...readMessages(archivePath));
    }
  }
  
  // Analyze
  const typeCounts: Record<string, number> = {};
  const agentCounts: Record<string, number> = {};
  const hourlyDistribution: Record<number, number> = {};
  const dailyDistribution: Record<string, number> = {};
  
  for (const msg of allMessages) {
    typeCounts[msg.type] = (typeCounts[msg.type] || 0) + 1;
    agentCounts[msg.from] = (agentCounts[msg.from] || 0) + 1;
    
    const date = new Date(msg.timestamp);
    const hour = date.getHours();
    const day = date.toISOString().split("T")[0];
    
    hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
    dailyDistribution[day] = (dailyDistribution[day] || 0) + 1;
  }
  
  console.log("\n\x1b[1m\x1b[44m MESSAGE BUS STATISTICS \x1b[0m\n");
  console.log(`\x1b[36mTotal Messages:\x1b[0m ${allMessages.length}`);
  console.log(`\x1b[36mArchives:\x1b[0m       ${index.archives.length}`);
  console.log(`\x1b[36mUnique Agents:\x1b[0m  ${Object.keys(agentCounts).length}`);
  console.log(`\x1b[36mMessage Types:\x1b[0m  ${Object.keys(typeCounts).length}`);
  
  console.log("\n\x1b[1mMessage Types:\x1b[0m");
  Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      const pct = Math.round(count / allMessages.length * 100);
      console.log(`  ${type.padEnd(20)} ${count.toString().padStart(6)} (${pct}%)`);
    });
  
  console.log("\n\x1b[1mTop 10 Active Agents:\x1b[0m");
  Object.entries(agentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([agent, count]) => {
      const shortAgent = agent.replace("agent-", "").slice(0, 25);
      console.log(`  ${shortAgent.padEnd(28)} ${count.toString().padStart(5)}`);
    });
  
  console.log("\n\x1b[1mDaily Distribution (last 7 days):\x1b[0m");
  Object.entries(dailyDistribution)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-7)
    .forEach(([day, count]) => {
      const bar = "=".repeat(Math.min(Math.floor(count / 5), 40));
      console.log(`  ${day} ${count.toString().padStart(4)} ${bar}`);
    });
}

// Auto-maintenance function (can be called from plugin)
export function autoMaintenance(): { rotated: boolean; compacted: boolean; removed: number } {
  const messages = readMessages();
  const size = existsSync(MESSAGE_BUS_PATH) ? statSync(MESSAGE_BUS_PATH).size : 0;
  
  let rotated = false;
  let compacted = false;
  let removed = 0;
  
  // Check if rotation needed
  if (messages.length >= CONFIG.maxMessages || size >= CONFIG.maxSizeBytes) {
    ensureArchiveDir();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archiveFilename = `messages-${timestamp}.jsonl`;
    const archivePath = join(ARCHIVE_DIR, archiveFilename);
    
    writeMessages(messages, archivePath);
    
    const index = getIndex();
    index.archives.push({
      filename: archiveFilename,
      startDate: messages[0].timestamp,
      endDate: messages[messages.length - 1].timestamp,
      messageCount: messages.length,
      types: [...new Set(messages.map(m => m.type))],
      agents: [...new Set(messages.map(m => m.from))].slice(0, 10),
    });
    index.totalMessages += messages.length;
    index.lastUpdated = new Date().toISOString();
    saveIndex(index);
    
    writeFileSync(MESSAGE_BUS_PATH, "");
    rotated = true;
    removed = messages.length;
  }
  
  // Always compact heartbeats
  const currentMessages = readMessages();
  if (currentMessages.length > 0) {
    const heartbeatCount = currentMessages.filter(m => m.type === "heartbeat").length;
    
    if (heartbeatCount > 20) {
      const now = Date.now();
      const heartbeatTTL = CONFIG.heartbeatTTLHours * 60 * 60 * 1000;
      
      const heartbeatsByAgent: Record<string, Message[]> = {};
      const otherMessages: Message[] = [];
      
      for (const msg of currentMessages) {
        if (msg.type === "heartbeat") {
          if (!heartbeatsByAgent[msg.from]) {
            heartbeatsByAgent[msg.from] = [];
          }
          heartbeatsByAgent[msg.from].push(msg);
        } else {
          otherMessages.push(msg);
        }
      }
      
      const keptHeartbeats: Message[] = [];
      for (const heartbeats of Object.values(heartbeatsByAgent)) {
        const sorted = heartbeats.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        keptHeartbeats.push(
          ...sorted
            .filter(hb => now - new Date(hb.timestamp).getTime() < heartbeatTTL)
            .slice(0, CONFIG.keepLatestHeartbeatsPerAgent)
        );
      }
      
      const compactedMessages = [...otherMessages, ...keptHeartbeats]
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      if (compactedMessages.length < currentMessages.length) {
        writeMessages(compactedMessages);
        compacted = true;
        removed += currentMessages.length - compactedMessages.length;
      }
    }
  }
  
  return { rotated, compacted, removed };
}

// Main CLI
const args = process.argv.slice(2);
const command = args[0] || "status";

switch (command) {
  case "status":
    status();
    break;
  case "rotate":
    rotate();
    break;
  case "compact":
    compact();
    break;
  case "cleanup":
    cleanup(parseInt(args[1]) || 24);
    break;
  case "search":
    if (!args[1]) {
      console.error("Usage: message-bus-manager.ts search <query>");
      process.exit(1);
    }
    search(args.slice(1).join(" "));
    break;
  case "stats":
    stats();
    break;
  case "auto":
    const result = autoMaintenance();
    console.log("Auto-maintenance result:", result);
    break;
  default:
    console.log(`
Message Bus Manager

Usage:
  bun tools/message-bus-manager.ts <command>

Commands:
  status         Show current bus status
  rotate         Archive current messages and start fresh
  compact        Remove old heartbeats, deduplicate
  cleanup [hrs]  Remove messages older than N hours (default: 24)
  search <query> Search across all archives
  stats          Message statistics
  auto           Run automatic maintenance
`);
}
