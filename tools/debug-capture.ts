#!/usr/bin/env bun
/**
 * Debug Capture Tool
 * 
 * Captures command outputs and debug information for troubleshooting.
 * 
 * Commands:
 *   run <command>   - Run a command and save its output
 *   log <message>   - Log a debug message with timestamp
 *   list [limit]    - List recent captured outputs
 *   view <id>       - View a specific capture
 *   clean [days]    - Clean old captures (default: 7 days)
 * 
 * Examples:
 *   bun tools/debug-capture.ts run "bun tools/task-manager.ts summary"
 *   bun tools/debug-capture.ts log "Starting orchestrator test"
 *   bun tools/debug-capture.ts list 20
 */

import { existsSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { c, LOGS_DIR, readJson, writeJson, appendLine, ensureDir } from "./shared";

const CAPTURES_DIR = join(LOGS_DIR, "captures");
const INDEX_FILE = join(CAPTURES_DIR, "index.json");

interface Capture {
  id: string;
  timestamp: string;
  type: "command" | "log" | "error";
  command?: string;
  message?: string;
  exitCode?: number;
  duration?: number;
  outputFile?: string;
}

interface CaptureIndex {
  captures: Capture[];
}

function ensureCapturesDir(): void {
  ensureDir(LOGS_DIR);
  ensureDir(CAPTURES_DIR);
}

function loadIndex(): CaptureIndex {
  return readJson<CaptureIndex>(INDEX_FILE, { captures: [] });
}

function saveIndex(index: CaptureIndex): void {
  writeJson(INDEX_FILE, index);
}

function generateId(): string {
  return `cap_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
}

async function runCommand(command: string): Promise<void> {
  ensureCapturesDir();
  
  const id = generateId();
  const timestamp = new Date().toISOString();
  const outputFile = join(CAPTURES_DIR, `${id}.txt`);
  
  console.log(`${c.cyan}Running:${c.reset} ${command}`);
  console.log(`${c.dim}Capture ID: ${id}${c.reset}\n`);
  
  const startTime = Date.now();
  
  const proc = Bun.spawn(["sh", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: process.cwd(),
  });
  
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  const duration = Date.now() - startTime;
  
  // Combine stdout and stderr
  const fullOutput = [
    `=== Command: ${command} ===`,
    `=== Timestamp: ${timestamp} ===`,
    `=== Duration: ${duration}ms ===`,
    `=== Exit Code: ${exitCode} ===`,
    "",
    "=== STDOUT ===",
    stdout,
    "",
    "=== STDERR ===",
    stderr,
  ].join("\n");
  
  await Bun.write(outputFile, fullOutput);
  
  // Update index
  const index = loadIndex();
  index.captures.unshift({
    id,
    timestamp,
    type: "command",
    command,
    exitCode,
    duration,
    outputFile,
  });
  
  // Keep only last 100 captures in index
  if (index.captures.length > 100) {
    index.captures = index.captures.slice(0, 100);
  }
  saveIndex(index);
  
  // Display output
  console.log(stdout);
  if (stderr) {
    console.log(`${c.red}STDERR:${c.reset}`);
    console.log(stderr);
  }
  
  console.log(`\n${c.dim}───────────────────────────────────────${c.reset}`);
  console.log(`${c.green}Captured:${c.reset} ${outputFile}`);
  console.log(`${c.cyan}Duration:${c.reset} ${duration}ms`);
  console.log(`${c.cyan}Exit Code:${c.reset} ${exitCode}`);
}

async function logMessage(message: string): Promise<void> {
  ensureCapturesDir();
  
  const id = generateId();
  const timestamp = new Date().toISOString();
  
  const index = loadIndex();
  index.captures.unshift({
    id,
    timestamp,
    type: "log",
    message,
  });
  saveIndex(index);
  
  // Also append to debug.log
  const logLine = `[${timestamp}] ${message}`;
  await appendLine(join(LOGS_DIR, "debug.log"), logLine);
  
  console.log(`${c.green}Logged:${c.reset} ${message}`);
  console.log(`${c.dim}ID: ${id}${c.reset}`);
}

function listCaptures(limit: number = 20): void {
  ensureCapturesDir();
  
  const index = loadIndex();
  const captures = index.captures.slice(0, limit);
  
  console.log(`${c.bold}${c.cyan}Recent Captures${c.reset}\n`);
  
  if (captures.length === 0) {
    console.log(`${c.dim}No captures found${c.reset}`);
    return;
  }
  
  for (const cap of captures) {
    const time = new Date(cap.timestamp).toLocaleString();
    const typeIcon = cap.type === "command" ? ">" : cap.type === "log" ? "#" : "!";
    const typeColor = cap.type === "command" ? c.yellow : cap.type === "log" ? c.blue : c.red;
    
    console.log(`${typeColor}${typeIcon}${c.reset} ${c.dim}${cap.id}${c.reset}`);
    console.log(`  ${c.cyan}Time:${c.reset} ${time}`);
    
    if (cap.command) {
      console.log(`  ${c.cyan}Command:${c.reset} ${cap.command.substring(0, 60)}${cap.command.length > 60 ? "..." : ""}`);
      console.log(`  ${c.cyan}Exit:${c.reset} ${cap.exitCode} ${c.dim}(${cap.duration}ms)${c.reset}`);
    }
    
    if (cap.message) {
      console.log(`  ${c.cyan}Message:${c.reset} ${cap.message}`);
    }
    
    console.log();
  }
  
  console.log(`${c.dim}Showing ${captures.length} of ${index.captures.length} captures${c.reset}`);
}

async function viewCapture(id: string): Promise<void> {
  ensureCapturesDir();
  
  const index = loadIndex();
  const capture = index.captures.find(c => c.id === id || c.id.includes(id));
  
  if (!capture) {
    console.log(`${c.red}Capture not found:${c.reset} ${id}`);
    return;
  }
  
  console.log(`${c.bold}${c.cyan}Capture: ${capture.id}${c.reset}\n`);
  console.log(`${c.cyan}Type:${c.reset} ${capture.type}`);
  console.log(`${c.cyan}Time:${c.reset} ${new Date(capture.timestamp).toLocaleString()}`);
  
  if (capture.command) {
    console.log(`${c.cyan}Command:${c.reset} ${capture.command}`);
    console.log(`${c.cyan}Exit Code:${c.reset} ${capture.exitCode}`);
    console.log(`${c.cyan}Duration:${c.reset} ${capture.duration}ms`);
  }
  
  if (capture.message) {
    console.log(`${c.cyan}Message:${c.reset} ${capture.message}`);
  }
  
  if (capture.outputFile && existsSync(capture.outputFile)) {
    console.log(`\n${c.dim}─── Output ───${c.reset}\n`);
    const content = await Bun.file(capture.outputFile).text();
    console.log(content);
  }
}

function cleanCaptures(days: number = 7): void {
  ensureCapturesDir();
  
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
  const index = loadIndex();
  
  let cleaned = 0;
  const remaining: Capture[] = [];
  
  for (const cap of index.captures) {
    const capTime = new Date(cap.timestamp).getTime();
    
    if (capTime < cutoffTime) {
      // Delete the output file if it exists
      if (cap.outputFile && existsSync(cap.outputFile)) {
        unlinkSync(cap.outputFile);
      }
      cleaned++;
    } else {
      remaining.push(cap);
    }
  }
  
  index.captures = remaining;
  saveIndex(index);
  
  console.log(`${c.green}Cleaned ${cleaned} captures${c.reset} older than ${days} days`);
  console.log(`${c.dim}Remaining: ${remaining.length} captures${c.reset}`);
}

function showHelp(): void {
  console.log(`${c.bold}${c.cyan}Debug Capture Tool${c.reset}

${c.yellow}Commands:${c.reset}
  run <command>   Run a command and save its output
  log <message>   Log a debug message with timestamp
  list [limit]    List recent captured outputs (default: 20)
  view <id>       View a specific capture
  clean [days]    Clean old captures (default: 7 days)

${c.yellow}Examples:${c.reset}
  bun tools/debug-capture.ts run "bun tools/task-manager.ts summary"
  bun tools/debug-capture.ts log "Starting orchestrator test"
  bun tools/debug-capture.ts list 20
  bun tools/debug-capture.ts view cap_1234567890_abc12
  bun tools/debug-capture.ts clean 3
`);
}

// Main
const [, , command, ...args] = process.argv;

switch (command) {
  case "run":
    if (args.length === 0) {
      console.log(`${c.red}Error:${c.reset} Command required`);
      console.log(`Usage: bun tools/debug-capture.ts run "<command>"`);
    } else {
      await runCommand(args.join(" "));
    }
    break;
    
  case "log":
    if (args.length === 0) {
      console.log(`${c.red}Error:${c.reset} Message required`);
      console.log(`Usage: bun tools/debug-capture.ts log "<message>"`);
    } else {
      await logMessage(args.join(" "));
    }
    break;
    
  case "list":
    listCaptures(parseInt(args[0]) || 20);
    break;
    
  case "view":
    if (args.length === 0) {
      console.log(`${c.red}Error:${c.reset} Capture ID required`);
    } else {
      await viewCapture(args[0]);
    }
    break;
    
  case "clean":
    cleanCaptures(parseInt(args[0]) || 7);
    break;
    
  case "help":
  case "--help":
  case "-h":
    showHelp();
    break;
    
  default:
    showHelp();
}
