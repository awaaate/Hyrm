#!/usr/bin/env bun
/**
 * Memory Compressor - Intelligently compresses working memory
 * 
 * This tool compresses working memory while preserving essential information
 * 
 * Usage:
 *   bun memory/compress.ts analyze          # Analyze current memory size
 *   bun memory/compress.ts compress [ratio] # Compress working memory (default 50% reduction)
 *   bun memory/compress.ts archive          # Archive old sessions to compressed format
 */

import { readFileSync, writeFileSync } from 'fs';

const WORKING_FILE = '/app/workspace/memory/working.md';
const ARCHIVE_FILE = '/app/workspace/memory/archive.md';
const STATE_FILE = '/app/workspace/memory/state.json';

interface CompressionStats {
  original_size: number;
  compressed_size: number;
  reduction_percent: number;
  original_tokens: number;
  compressed_tokens: number;
  token_reduction_percent: number;
}

// Estimate token count (rough approximation: ~4 chars per token)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Extract essential information from working memory
function extractEssentials(content: string): {
  objective: string;
  status: string;
  recentAchievements: string[];
  keyDiscoveries: string[];
  nextSteps: string[];
  criticalDecisions: string[];
} {
  const result = {
    objective: '',
    status: '',
    recentAchievements: [] as string[],
    keyDiscoveries: [] as string[],
    nextSteps: [] as string[],
    criticalDecisions: [] as string[],
  };

  // Extract current focus/objective
  const objectiveMatch = content.match(/##\s*Current Focus\s*\n+([\s\S]*?)(?=\n##|$)/i);
  if (objectiveMatch) {
    result.objective = objectiveMatch[1].trim().split('\n').slice(0, 3).join('\n');
  }

  // Extract status
  const statusMatch = content.match(/\*\*Current Status\*\*:?\s*(.+?)(?:\n|$)/i);
  if (statusMatch) {
    result.status = statusMatch[1].trim();
  }

  // Extract achievements (look for checkmarks)
  const achievementMatches = content.matchAll(/[-*]\s*✅\s*(.+?)(?:\n|$)/g);
  for (const match of achievementMatches) {
    result.recentAchievements.push(match[1].trim());
  }

  // Extract discoveries
  const discoverySection = content.match(/##\s*Recent Discoveries\s*\n+([\s\S]*?)(?=\n##|$)/i);
  if (discoverySection) {
    const discoveries = discoverySection[1].matchAll(/[-*]\s*\*\*(.+?)\*\*:?\s*(.+?)(?:\n|$)/g);
    for (const match of discoveries) {
      result.keyDiscoveries.push(`${match[1]}: ${match[2].trim()}`);
    }
  }

  // Extract next steps
  const nextMatch = content.match(/##\s*Next Session Goals\s*\n+([\s\S]*?)(?=\n##|$)/i);
  if (nextMatch) {
    const steps = nextMatch[1].matchAll(/\d+\.\s*(.+?)(?:\n|$)/g);
    for (const match of steps) {
      result.nextSteps.push(match[1].trim());
    }
  }

  // Extract key decisions
  const decisionSection = content.match(/##\s*Recent Decisions\s*\n+([\s\S]*?)(?=\n##|$)/i);
  if (decisionSection) {
    const decisions = decisionSection[1].matchAll(/[-*]\s*(.+?)(?:\n|$)/g);
    for (const match of decisions) {
      result.criticalDecisions.push(match[1].trim());
    }
  }

  return result;
}

// Compress session history
function compressSessionHistory(content: string): string {
  const sessions = content.matchAll(/##\s*Session\s*(\d+)\s*Achievements[\s\S]*?(?=##\s*Session\s*\d+|$)/gi);
  const compressed: string[] = [];

  for (const session of sessions) {
    const sessionNum = session[1];
    const achievements = [...session[0].matchAll(/\d+\.\s*✅\s*(.+?)(?:\n|$)/g)];
    
    if (achievements.length > 0) {
      const topAchievements = achievements.slice(0, 3).map(m => m[1].trim());
      compressed.push(`**S${sessionNum}**: ${topAchievements.join('; ')}`);
    }
  }

  return compressed.join('\n');
}

// Generate compressed working memory
function generateCompressed(essentials: any, sessionHistory: string): string {
  const now = new Date().toISOString().split('T')[0];
  
  let compressed = `# Working Memory (Compressed)\n\n`;
  compressed += `**Last Updated**: ${now}\n`;
  compressed += `**Status**: ${essentials.status || 'operational'}\n\n`;
  
  compressed += `## Current Objective\n\n`;
  compressed += `${essentials.objective || 'Build persistence system for cross-session memory'}\n\n`;
  
  if (essentials.recentAchievements.length > 0) {
    compressed += `## Recent Achievements\n\n`;
    // Keep only the most recent 5
    essentials.recentAchievements.slice(-5).forEach((ach: string) => {
      compressed += `- ✅ ${ach}\n`;
    });
    compressed += `\n`;
  }

  if (essentials.keyDiscoveries.length > 0) {
    compressed += `## Key Discoveries\n\n`;
    // Keep top 5
    essentials.keyDiscoveries.slice(0, 5).forEach((disc: string) => {
      compressed += `- ${disc}\n`;
    });
    compressed += `\n`;
  }

  if (essentials.criticalDecisions.length > 0) {
    compressed += `## Critical Decisions\n\n`;
    essentials.criticalDecisions.slice(0, 3).forEach((dec: string) => {
      compressed += `- ${dec}\n`;
    });
    compressed += `\n`;
  }

  if (sessionHistory) {
    compressed += `## Session History (Compressed)\n\n`;
    compressed += `${sessionHistory}\n\n`;
  }

  if (essentials.nextSteps.length > 0) {
    compressed += `## Next Steps\n\n`;
    essentials.nextSteps.forEach((step: string) => {
      compressed += `- ${step}\n`;
    });
    compressed += `\n`;
  }

  return compressed;
}

// Analyze current memory
function analyzeMemory(): void {
  const content = readFileSync(WORKING_FILE, 'utf-8');
  const size = content.length;
  const tokens = estimateTokens(content);
  const lines = content.split('\n').length;

  console.log('\n=== Working Memory Analysis ===\n');
  console.log(`File: ${WORKING_FILE}`);
  console.log(`Size: ${size} bytes (${(size / 1024).toFixed(2)} KB)`);
  console.log(`Estimated tokens: ${tokens}`);
  console.log(`Lines: ${lines}`);
  console.log(`\nToken budget impact: ${(tokens / 200000 * 100).toFixed(2)}%`);

  const essentials = extractEssentials(content);
  console.log(`\nExtracted essentials:`);
  console.log(`  Achievements: ${essentials.recentAchievements.length}`);
  console.log(`  Discoveries: ${essentials.keyDiscoveries.length}`);
  console.log(`  Decisions: ${essentials.criticalDecisions.length}`);
  console.log(`  Next steps: ${essentials.nextSteps.length}`);

  // Estimate compression potential
  const sessionHistory = compressSessionHistory(content);
  const compressed = generateCompressed(essentials, sessionHistory);
  const compressedSize = compressed.length;
  const compressedTokens = estimateTokens(compressed);
  const reduction = ((size - compressedSize) / size * 100).toFixed(1);
  const tokenReduction = ((tokens - compressedTokens) / tokens * 100).toFixed(1);

  console.log(`\nCompression potential:`);
  console.log(`  Compressed size: ${compressedSize} bytes`);
  console.log(`  Size reduction: ${reduction}%`);
  console.log(`  Compressed tokens: ${compressedTokens}`);
  console.log(`  Token reduction: ${tokenReduction}%`);
}

// Compress working memory
function compressMemory(targetReduction: number = 50): void {
  const original = readFileSync(WORKING_FILE, 'utf-8');
  const originalSize = original.length;
  const originalTokens = estimateTokens(original);

  console.log('\n=== Compressing Working Memory ===\n');
  console.log(`Original: ${originalSize} bytes, ~${originalTokens} tokens`);

  // Extract essentials
  const essentials = extractEssentials(original);
  const sessionHistory = compressSessionHistory(original);
  
  // Generate compressed version
  const compressed = generateCompressed(essentials, sessionHistory);
  const compressedSize = compressed.length;
  const compressedTokens = estimateTokens(compressed);
  
  const sizeReduction = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
  const tokenReduction = ((originalTokens - compressedTokens) / originalTokens * 100).toFixed(1);

  console.log(`Compressed: ${compressedSize} bytes, ~${compressedTokens} tokens`);
  console.log(`Reduction: ${sizeReduction}% (${tokenReduction}% tokens)`);

  // Archive the original
  const timestamp = new Date().toISOString();
  const archiveEntry = `\n\n---\n## Archived: ${timestamp}\n\n${original}\n`;
  
  try {
    const existingArchive = readFileSync(ARCHIVE_FILE, 'utf-8');
    writeFileSync(ARCHIVE_FILE, existingArchive + archiveEntry);
  } catch {
    writeFileSync(ARCHIVE_FILE, `# Working Memory Archive\n${archiveEntry}`);
  }

  // Save compressed version
  writeFileSync(WORKING_FILE, compressed);
  
  console.log(`\n✅ Compression complete!`);
  console.log(`   Original archived to: ${ARCHIVE_FILE}`);
  console.log(`   Compressed version saved to: ${WORKING_FILE}`);
  console.log(`   Tokens saved: ${originalTokens - compressedTokens}`);
}

// Archive old sessions
function archiveSessions(): void {
  console.log('\n=== Archiving Old Sessions ===\n');
  
  const content = readFileSync(WORKING_FILE, 'utf-8');
  
  // Extract all session sections except the most recent
  const sessionMatches = [...content.matchAll(/##\s*Session\s*(\d+)\s*Achievements[\s\S]*?(?=##\s*Session\s*\d+|##\s*Key Insight|$)/gi)];
  
  if (sessionMatches.length <= 1) {
    console.log('No old sessions to archive (keeping the most recent one)');
    return;
  }

  // Keep only the most recent session, archive the rest
  const sessionsToArchive = sessionMatches.slice(0, -1);
  const archiveContent = sessionsToArchive.map(m => m[0]).join('\n\n');
  
  // Remove archived sessions from working memory
  let updated = content;
  for (const session of sessionsToArchive) {
    updated = updated.replace(session[0], '');
  }
  
  // Clean up extra whitespace
  updated = updated.replace(/\n{3,}/g, '\n\n');
  
  // Archive
  const timestamp = new Date().toISOString();
  const archiveEntry = `\n\n---\n## Archived Sessions: ${timestamp}\n\n${archiveContent}\n`;
  
  try {
    const existingArchive = readFileSync(ARCHIVE_FILE, 'utf-8');
    writeFileSync(ARCHIVE_FILE, existingArchive + archiveEntry);
  } catch {
    writeFileSync(ARCHIVE_FILE, `# Working Memory Archive\n${archiveEntry}`);
  }
  
  writeFileSync(WORKING_FILE, updated);
  
  const originalTokens = estimateTokens(content);
  const newTokens = estimateTokens(updated);
  const saved = originalTokens - newTokens;
  
  console.log(`✅ Archived ${sessionsToArchive.length} old sessions`);
  console.log(`   Tokens saved: ${saved}`);
  console.log(`   Archive: ${ARCHIVE_FILE}`);
}

// Main CLI
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'analyze':
    analyzeMemory();
    break;
  case 'compress':
    const targetReduction = arg ? parseInt(arg) : 50;
    compressMemory(targetReduction);
    break;
  case 'archive':
    archiveSessions();
    break;
  default:
    console.log('Memory Compressor - Intelligent memory compression tool');
    console.log('');
    console.log('Usage:');
    console.log('  bun memory/compress.ts analyze          # Analyze current memory usage');
    console.log('  bun memory/compress.ts compress [ratio] # Compress working memory');
    console.log('  bun memory/compress.ts archive          # Archive old sessions');
    console.log('');
    process.exit(1);
}
