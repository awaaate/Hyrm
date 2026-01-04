#!/usr/bin/env bun
/**
 * Worker Spawner - TypeScript version
 * 
 * Spawns worker agents using the centralized prompt system.
 * This is a TypeScript alternative to spawn-worker.sh for better maintainability.
 * 
 * Usage:
 *   bun tools/spawn-worker.ts "task description"
 *   bun tools/spawn-worker.ts --task <task_id>
 *   bun tools/spawn-worker.ts --role code-worker "description"
 */

import { existsSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";
import { generateWorkerPrompt, type WorkerRole } from "./lib/prompt-generator";
import { readJson } from "./shared/json-utils";
import { getModel, getModelFallback } from "./shared/models";

const WORKSPACE = process.cwd();
const LOG_FILE = join(WORKSPACE, "memory", "worker-spawns.log");
const TASKS_PATH = join(WORKSPACE, "memory", "tasks.json");

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: string;
  tags?: string[];
  status: string;
}

function log(message: string): void {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}\n`;
  try {
    appendFileSync(LOG_FILE, entry);
  } catch {
    // Ignore log errors
  }
}

function getTaskById(taskId: string): Task | null {
  if (!existsSync(TASKS_PATH)) return null;
  
  try {
    const store = JSON.parse(readFileSync(TASKS_PATH, "utf-8"));
    return (store.tasks || []).find((t: Task) => t.id === taskId) || null;
  } catch {
    return null;
  }
}

function determineRole(task: Task): WorkerRole {
  const tags = task.tags || [];
  const titleLower = task.title.toLowerCase();
  const descLower = (task.description || "").toLowerCase();
  
  // Check for memory-related task
  if (tags.some(t => t.toLowerCase().includes("memory")) ||
      titleLower.includes("memory") ||
      descLower.includes("memory system")) {
    return "memory-worker";
  }
  
  // Check for analysis/research task
  if (tags.some(t => t.toLowerCase().includes("analysis") || t.toLowerCase().includes("research")) ||
      titleLower.includes("analyze") ||
      titleLower.includes("research") ||
      titleLower.includes("investigate")) {
    return "analysis-worker";
  }
  
  // Default to code-worker for most tasks
  return "code-worker";
}

function generateTaskPrompt(task: Task): string {
  const role = determineRole(task);
  
  const taskDescription = `Task ID: ${task.id}
Title: ${task.title}
Description: ${task.description || "No description"}
Priority: ${task.priority}

Complete this task. When done:
- task_update(task_id="${task.id}", status="completed")
- agent_send(type="task_complete", payload={task_id: "${task.id}", summary: "..."})`;

  return generateWorkerPrompt(taskDescription, role);
}

async function spawnWorker(prompt: string, metadata: { taskId?: string; role?: string }): Promise<void> {
  const model = getModelFallback() || getModel() || "openai/gpt-5.2";
  
  log(`Spawning worker: model=${model} ${metadata.taskId ? `task=${metadata.taskId}` : ""} ${metadata.role ? `role=${metadata.role}` : ""}`);
  
  try {
    // Spawn opencode in background
    const proc = Bun.spawn(["opencode", "run", "--model", model, prompt], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    
    // Unref so parent can exit
    proc.unref();
    
    log(`Worker spawned: PID=${proc.pid}`);
    console.log(`Worker spawned (PID: ${proc.pid})`);
  } catch (error) {
    log(`Failed to spawn worker: ${error}`);
    console.error(`Failed to spawn worker: ${error}`);
    process.exit(1);
  }
}

function printHelp(): void {
  console.log(`spawn-worker.ts - Spawn worker agents using centralized prompts

Usage:
  bun tools/spawn-worker.ts "task description"
  bun tools/spawn-worker.ts --task <task_id>
  bun tools/spawn-worker.ts --role <role> "description"

Options:
  --task <task_id>        Spawn worker for specific task ID
  --role <role>           Use specific role (code-worker, memory-worker, analysis-worker, worker)
  --help, -h              Show this help

Examples:
  bun tools/spawn-worker.ts "Fix the bug in cli.ts"
  bun tools/spawn-worker.ts --task task_1767520273725_sckp83
  bun tools/spawn-worker.ts --role code-worker "Implement feature X"

Prompts are generated using tools/lib/prompt-generator.ts
`);
}

// Main
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(args.length === 0 ? 1 : 0);
  }
  
  let prompt = "";
  let role: WorkerRole = "worker";
  let taskId: string | undefined;
  
  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === "--task") {
      taskId = args[++i];
      if (!taskId) {
        console.error("Error: --task requires a task ID");
        process.exit(1);
      }
      
      const task = getTaskById(taskId);
      if (!task) {
        console.error(`Error: Task ${taskId} not found`);
        process.exit(1);
      }
      
      role = determineRole(task);
      prompt = generateTaskPrompt(task);
    } else if (arg === "--role") {
      role = args[++i] as WorkerRole;
      if (!role) {
        console.error("Error: --role requires a role name");
        process.exit(1);
      }
    } else if (!arg.startsWith("-")) {
      // This is the task description
      const description = args.slice(i).join(" ");
      prompt = generateWorkerPrompt(description, role);
      break;
    }
  }
  
  if (!prompt) {
    console.error("Error: No prompt generated. Provide a task description or --task <id>");
    process.exit(1);
  }
  
  await spawnWorker(prompt, { taskId, role });
}

main().catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
