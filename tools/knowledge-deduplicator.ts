#!/usr/bin/env bun
/**
 * Knowledge Deduplicator
 * 
 * Analyzes and deduplicates the knowledge base:
 * - Removes duplicate insights across sessions
 * - Merges similar discoveries
 * - Summarizes redundant learnings
 * - Tracks code artifact frequency
 * 
 * Usage:
 *   bun tools/knowledge-deduplicator.ts analyze     # Show analysis of duplicates
 *   bun tools/knowledge-deduplicator.ts dedupe      # Perform deduplication
 *   bun tools/knowledge-deduplicator.ts stats       # Show knowledge statistics
 *   bun tools/knowledge-deduplicator.ts top         # Show top insights and code
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { c, stringSimilarity, PATHS, getBackupPath } from "./shared";

interface SessionKnowledge {
  session_id: string;
  timestamp: number;
  messages: number;
  decisions: string[];
  discoveries: string[];
  code_created: string[];
  problems_solved: string[];
  key_insights: string[];
  techniques: string[];
  solutions: string[];
}

interface DeduplicationStats {
  total_sessions: number;
  total_decisions: number;
  total_discoveries: number;
  total_insights: number;
  total_techniques: number;
  total_solutions: number;
  total_code_files: number;
  unique_decisions: number;
  unique_discoveries: number;
  unique_insights: number;
  unique_techniques: number;
  unique_solutions: number;
  unique_code_files: number;
  duplicates_removed: {
    decisions: number;
    discoveries: number;
    insights: number;
    techniques: number;
    solutions: number;
  };
}

function readKnowledge(): SessionKnowledge[] {
  if (!existsSync(PATHS.knowledgeBase)) {
    return [];
  }
  try {
    return JSON.parse(readFileSync(PATHS.knowledgeBase, "utf-8"));
  } catch {
    return [];
  }
}

function writeKnowledge(knowledge: SessionKnowledge[]): void {
  writeFileSync(PATHS.knowledgeBase, JSON.stringify(knowledge, null, 2));
}

function backupKnowledge(): void {
  const backupPath = getBackupPath(PATHS.knowledgeBase);
  if (existsSync(PATHS.knowledgeBase)) {
    const content = readFileSync(PATHS.knowledgeBase, "utf-8");
    writeFileSync(backupPath, content);
    console.log(`${c.dim}Backup saved to ${backupPath}${c.reset}`);
  }
}

/**
 * Check if a string is too short or noise
 */
function isValidContent(str: string): boolean {
  if (!str || str.length < 15) return false;
  
  // Filter noise patterns
  const noisePatterns = [
    /^[\s\d\W]+$/,
    /^\s*[\[\{<\(]/,
    /```/,
    /^the file /i,
    /^check /i,
    /^look /i,
    /^see /i,
    /^read /i,
    /^undefined/i,
    /^null/i,
    /^true/i,
    /^false/i,
    /^https?:\/\//,
    /^:\s*$/,
  ];
  
  for (const pattern of noisePatterns) {
    if (pattern.test(str)) return false;
  }
  
  return true;
}

/**
 * Deduplicate an array of strings, keeping first occurrence
 */
function deduplicateStrings(strings: string[], similarityThreshold = 0.8): string[] {
  const unique: string[] = [];
  
  for (const str of strings) {
    if (!isValidContent(str)) continue;
    
    // Check if similar string already exists
    let isDuplicate = false;
    for (const existing of unique) {
      if (str === existing) {
        isDuplicate = true;
        break;
      }
      if (stringSimilarity(str, existing) >= similarityThreshold) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      unique.push(str);
    }
  }
  
  return unique;
}

/**
 * Analyze knowledge base for duplicates
 */
function analyze(): void {
  const knowledge = readKnowledge();
  
  if (knowledge.length === 0) {
    console.log(`${c.yellow}No knowledge base found.${c.reset}`);
    return;
  }
  
  // Collect all items
  const allDecisions: string[] = [];
  const allDiscoveries: string[] = [];
  const allInsights: string[] = [];
  const allTechniques: string[] = [];
  const allSolutions: string[] = [];
  const allCode: string[] = [];
  
  for (const session of knowledge) {
    allDecisions.push(...(session.decisions || []));
    allDiscoveries.push(...(session.discoveries || []));
    allInsights.push(...(session.key_insights || []));
    allTechniques.push(...(session.techniques || []));
    allSolutions.push(...(session.solutions || []));
    allCode.push(...(session.code_created || []));
  }
  
  // Deduplicate
  const uniqueDecisions = deduplicateStrings(allDecisions);
  const uniqueDiscoveries = deduplicateStrings(allDiscoveries);
  const uniqueInsights = deduplicateStrings(allInsights);
  const uniqueTechniques = deduplicateStrings(allTechniques);
  const uniqueSolutions = deduplicateStrings(allSolutions);
  const uniqueCode = [...new Set(allCode)];
  
  console.log(`\n${c.bright}${c.cyan}KNOWLEDGE BASE ANALYSIS${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(50)}${c.reset}\n`);
  
  console.log(`${c.bright}Sessions:${c.reset} ${knowledge.length}\n`);
  
  console.log(`${c.bright}Decisions:${c.reset}`);
  console.log(`  Total: ${allDecisions.length} | Unique: ${uniqueDecisions.length} | ${c.yellow}Duplicates: ${allDecisions.length - uniqueDecisions.length}${c.reset}`);
  
  console.log(`\n${c.bright}Discoveries:${c.reset}`);
  console.log(`  Total: ${allDiscoveries.length} | Unique: ${uniqueDiscoveries.length} | ${c.yellow}Duplicates: ${allDiscoveries.length - uniqueDiscoveries.length}${c.reset}`);
  
  console.log(`\n${c.bright}Key Insights:${c.reset}`);
  console.log(`  Total: ${allInsights.length} | Unique: ${uniqueInsights.length} | ${c.yellow}Duplicates: ${allInsights.length - uniqueInsights.length}${c.reset}`);
  
  console.log(`\n${c.bright}Techniques:${c.reset}`);
  console.log(`  Total: ${allTechniques.length} | Unique: ${uniqueTechniques.length} | ${c.yellow}Duplicates: ${allTechniques.length - uniqueTechniques.length}${c.reset}`);
  
  console.log(`\n${c.bright}Solutions:${c.reset}`);
  console.log(`  Total: ${allSolutions.length} | Unique: ${uniqueSolutions.length} | ${c.yellow}Duplicates: ${allSolutions.length - uniqueSolutions.length}${c.reset}`);
  
  console.log(`\n${c.bright}Code Files:${c.reset}`);
  console.log(`  Total: ${allCode.length} | Unique: ${uniqueCode.length} | ${c.yellow}Duplicates: ${allCode.length - uniqueCode.length}${c.reset}`);
  
  const totalDupes = 
    (allDecisions.length - uniqueDecisions.length) +
    (allDiscoveries.length - uniqueDiscoveries.length) +
    (allInsights.length - uniqueInsights.length) +
    (allTechniques.length - uniqueTechniques.length) +
    (allSolutions.length - uniqueSolutions.length) +
    (allCode.length - uniqueCode.length);
  
  console.log(`\n${c.bright}Total Potential Cleanup:${c.reset} ${c.green}${totalDupes} duplicate entries${c.reset}\n`);
}

/**
 * Perform deduplication
 */
function dedupe(): void {
  const knowledge = readKnowledge();
  
  if (knowledge.length === 0) {
    console.log(`${c.yellow}No knowledge base found.${c.reset}`);
    return;
  }
  
  // Backup first
  backupKnowledge();
  
  console.log(`\n${c.cyan}Deduplicating knowledge base...${c.reset}\n`);
  
  // Global deduplication sets
  const seenDecisions = new Set<string>();
  const seenDiscoveries = new Set<string>();
  const seenInsights = new Set<string>();
  const seenTechniques = new Set<string>();
  const seenSolutions = new Set<string>();
  const seenCodeFiles = new Set<string>(); // Global set for code files
  
  let totalRemoved = 0;
  
  for (const session of knowledge) {
    // Dedupe decisions
    const origDecisions = session.decisions?.length || 0;
    session.decisions = deduplicateWithGlobal(session.decisions || [], seenDecisions);
    totalRemoved += origDecisions - session.decisions.length;
    
    // Dedupe discoveries
    const origDiscoveries = session.discoveries?.length || 0;
    session.discoveries = deduplicateWithGlobal(session.discoveries || [], seenDiscoveries);
    totalRemoved += origDiscoveries - session.discoveries.length;
    
    // Dedupe insights
    const origInsights = session.key_insights?.length || 0;
    session.key_insights = deduplicateWithGlobal(session.key_insights || [], seenInsights);
    totalRemoved += origInsights - session.key_insights.length;
    
    // Dedupe techniques
    const origTechniques = session.techniques?.length || 0;
    session.techniques = deduplicateWithGlobal(session.techniques || [], seenTechniques);
    totalRemoved += origTechniques - session.techniques.length;
    
    // Dedupe solutions
    const origSolutions = session.solutions?.length || 0;
    session.solutions = deduplicateWithGlobal(session.solutions || [], seenSolutions);
    totalRemoved += origSolutions - session.solutions.length;
    
    // Dedupe code files (exact match, GLOBAL across sessions)
    const origCodeFiles = session.code_created?.length || 0;
    const uniqueCodeFiles: string[] = [];
    for (const file of session.code_created || []) {
      if (!seenCodeFiles.has(file)) {
        seenCodeFiles.add(file);
        uniqueCodeFiles.push(file);
      }
    }
    session.code_created = uniqueCodeFiles;
    totalRemoved += origCodeFiles - uniqueCodeFiles.length;
  }
  
  writeKnowledge(knowledge);
  
  console.log(`${c.green}Removed ${totalRemoved} duplicate/invalid entries${c.reset}`);
  console.log(`${c.dim}Backup saved to ${getBackupPath(PATHS.knowledgeBase)}${c.reset}\n`);
}

/**
 * Deduplicate with global seen set
 */
function deduplicateWithGlobal(strings: string[], seen: Set<string>): string[] {
  const result: string[] = [];
  
  for (const str of strings) {
    if (!isValidContent(str)) continue;
    
    // Normalize for comparison
    const normalized = str.toLowerCase().trim();
    
    // Check exact match
    if (seen.has(normalized)) continue;
    
    // Check similarity with existing
    let isDuplicate = false;
    for (const existing of seen) {
      if (stringSimilarity(str, existing) >= 0.75) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      seen.add(normalized);
      result.push(str);
    }
  }
  
  return result;
}

/**
 * Show statistics
 */
function showStats(): void {
  const knowledge = readKnowledge();
  
  if (knowledge.length === 0) {
    console.log(`${c.yellow}No knowledge base found.${c.reset}`);
    return;
  }
  
  // Count items
  let totalDecisions = 0;
  let totalDiscoveries = 0;
  let totalInsights = 0;
  let totalTechniques = 0;
  let totalSolutions = 0;
  let totalProblems = 0;
  let totalCode = 0;
  let totalMessages = 0;
  
  for (const session of knowledge) {
    totalDecisions += session.decisions?.length || 0;
    totalDiscoveries += session.discoveries?.length || 0;
    totalInsights += session.key_insights?.length || 0;
    totalTechniques += session.techniques?.length || 0;
    totalSolutions += session.solutions?.length || 0;
    totalProblems += session.problems_solved?.length || 0;
    totalCode += session.code_created?.length || 0;
    totalMessages += session.messages || 0;
  }
  
  console.log(`\n${c.bright}${c.blue}KNOWLEDGE BASE STATISTICS${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(40)}${c.reset}\n`);
  
  console.log(`${c.cyan}Sessions:${c.reset}       ${c.bright}${knowledge.length}${c.reset}`);
  console.log(`${c.cyan}Messages:${c.reset}       ${c.bright}${totalMessages}${c.reset}`);
  console.log();
  console.log(`${c.cyan}Decisions:${c.reset}      ${c.bright}${totalDecisions}${c.reset}`);
  console.log(`${c.cyan}Discoveries:${c.reset}    ${c.bright}${totalDiscoveries}${c.reset}`);
  console.log(`${c.cyan}Key Insights:${c.reset}   ${c.bright}${totalInsights}${c.reset}`);
  console.log(`${c.cyan}Techniques:${c.reset}     ${c.bright}${totalTechniques}${c.reset}`);
  console.log(`${c.cyan}Solutions:${c.reset}      ${c.bright}${totalSolutions}${c.reset}`);
  console.log(`${c.cyan}Problems:${c.reset}       ${c.bright}${totalProblems}${c.reset}`);
  console.log(`${c.cyan}Code Files:${c.reset}     ${c.bright}${totalCode}${c.reset}`);
  
  // Calculate averages
  const avgDecisions = (totalDecisions / knowledge.length).toFixed(1);
  const avgMessages = (totalMessages / knowledge.length).toFixed(1);
  
  console.log(`\n${c.bright}Averages per session:${c.reset}`);
  console.log(`  Messages: ${avgMessages}`);
  console.log(`  Decisions: ${avgDecisions}`);
  console.log();
}

/**
 * Show top insights and code
 */
function showTop(): void {
  const knowledge = readKnowledge();
  
  if (knowledge.length === 0) {
    console.log(`${c.yellow}No knowledge base found.${c.reset}`);
    return;
  }
  
  // Collect all items with frequency
  const codeFreq = new Map<string, number>();
  const allDiscoveries: string[] = [];
  const allInsights: string[] = [];
  const allSolutions: string[] = [];
  const allProblems: string[] = [];
  
  for (const session of knowledge) {
    for (const file of session.code_created || []) {
      codeFreq.set(file, (codeFreq.get(file) || 0) + 1);
    }
    allDiscoveries.push(...(session.discoveries || []));
    allInsights.push(...(session.key_insights || []));
    allSolutions.push(...(session.solutions || []));
    allProblems.push(...(session.problems_solved || []));
  }
  
  console.log(`\n${c.bright}${c.magenta}TOP KNOWLEDGE ITEMS${c.reset}\n`);
  console.log(`${c.dim}${"─".repeat(60)}${c.reset}`);
  
  // Top code files
  const topCode = [...codeFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  console.log(`\n${c.bright}Most Edited Files:${c.reset}`);
  for (const [file, count] of topCode) {
    console.log(`  ${c.yellow}${count}x${c.reset} ${file}`);
  }
  
  // Top discoveries (deduplicated)
  const uniqueDiscoveries = deduplicateStrings(allDiscoveries);
  console.log(`\n${c.bright}Recent Discoveries:${c.reset}`);
  for (const discovery of uniqueDiscoveries.slice(-5)) {
    console.log(`  ${c.dim}-${c.reset} ${discovery.slice(0, 70)}${discovery.length > 70 ? "..." : ""}`);
  }
  
  // Top insights
  const uniqueInsights = deduplicateStrings(allInsights);
  if (uniqueInsights.length > 0) {
    console.log(`\n${c.bright}Key Insights:${c.reset}`);
    for (const insight of uniqueInsights.slice(-5)) {
      console.log(`  ${c.dim}-${c.reset} ${insight.slice(0, 70)}${insight.length > 70 ? "..." : ""}`);
    }
  }
  
  // Top solutions
  const uniqueSolutions = deduplicateStrings(allSolutions);
  if (uniqueSolutions.length > 0) {
    console.log(`\n${c.bright}Solutions Found:${c.reset}`);
    for (const solution of uniqueSolutions.slice(-5)) {
      console.log(`  ${c.dim}-${c.reset} ${solution.slice(0, 70)}${solution.length > 70 ? "..." : ""}`);
    }
  }
  
  // Top problems solved
  const uniqueProblems = [...new Set(allProblems)];
  if (uniqueProblems.length > 0) {
    console.log(`\n${c.bright}Problems Solved:${c.reset}`);
    for (const problem of uniqueProblems.slice(-5)) {
      console.log(`  ${c.green}✓${c.reset} ${problem.slice(0, 70)}${problem.length > 70 ? "..." : ""}`);
    }
  }
  
  console.log();
}

function showHelp(): void {
  console.log(`
${c.bright}${c.blue}Knowledge Deduplicator${c.reset}

Analyze and clean up the knowledge base by removing duplicates
and invalid entries.

${c.cyan}Usage:${c.reset}
  bun tools/knowledge-deduplicator.ts <command>

${c.cyan}Commands:${c.reset}
  ${c.bright}analyze${c.reset}     Show analysis of duplicates
  ${c.bright}dedupe${c.reset}      Perform deduplication (creates backup)
  ${c.bright}stats${c.reset}       Show knowledge statistics
  ${c.bright}top${c.reset}         Show top insights and code
  ${c.bright}help${c.reset}        Show this help

${c.cyan}Examples:${c.reset}
  bun tools/knowledge-deduplicator.ts analyze
  bun tools/knowledge-deduplicator.ts dedupe
  bun tools/knowledge-deduplicator.ts top

${c.dim}Knowledge base: memory/knowledge-base.json
Backup: memory/knowledge-base.backup.json${c.reset}
`);
}

// CLI routing
const command = process.argv[2];

switch (command) {
  case "analyze":
    analyze();
    break;
  case "dedupe":
    dedupe();
    break;
  case "stats":
    showStats();
    break;
  case "top":
    showTop();
    break;
  case "help":
  case "--help":
  case "-h":
  case undefined:
    showHelp();
    break;
  default:
    console.log(`${c.red}Unknown command: ${command}${c.reset}`);
    showHelp();
    process.exit(1);
}
