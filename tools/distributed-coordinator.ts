#!/usr/bin/env node

/**
 * Distributed Subagent Coordinator
 * 
 * Spawns multiple OpenCode sessions to work on parallel tasks
 * Coordinates through shared memory state
 * 
 * Usage:
 *   ./distributed-coordinator.ts spawn <task1> <task2> <task3>
 *   ./distributed-coordinator.ts status
 *   ./distributed-coordinator.ts collect
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const WORKSPACE = '/app/workspace';
const MEMORY_DIR = path.join(WORKSPACE, 'memory');
const TASKS_DIR = path.join(MEMORY_DIR, 'distributed_tasks');
const STATE_FILE = path.join(TASKS_DIR, 'coordinator_state.json');

interface Task {
  id: string;
  description: string;
  status: 'pending' | 'assigned' | 'running' | 'completed' | 'failed';
  agent_id?: string;
  started_at?: string;
  completed_at?: string;
  result?: any;
  error?: string;
}

interface CoordinatorState {
  session_id: string;
  started_at: string;
  tasks: Task[];
  agents: {
    id: string;
    task_id: string;
    status: 'spawning' | 'running' | 'completed' | 'failed';
    pid?: number;
  }[];
}

// Initialize tasks directory
if (!fs.existsSync(TASKS_DIR)) {
  fs.mkdirSync(TASKS_DIR, { recursive: true });
}

function loadState(): CoordinatorState | null {
  if (!fs.existsSync(STATE_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}

function saveState(state: CoordinatorState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

async function spawnAgent(taskId: string, taskDescription: string): Promise<string> {
  const agentId = generateId();
  const taskFile = path.join(TASKS_DIR, `task_${taskId}.md`);
  
  // Write task specification
  fs.writeFileSync(taskFile, `# Task ${taskId}

**Agent**: ${agentId}
**Status**: Running
**Started**: ${new Date().toISOString()}

## Task Description

${taskDescription}

## Instructions

1. Read this task file to understand your objective
2. Complete the task
3. Write results to: ${path.join(TASKS_DIR, `result_${taskId}.json`)}
4. Update your status to 'completed'

## Result Format

Write a JSON file with:
\`\`\`json
{
  "task_id": "${taskId}",
  "agent_id": "${agentId}",
  "status": "completed",
  "completed_at": "<ISO timestamp>",
  "result": {
    "summary": "<1-2 sentence summary>",
    "details": "<any relevant details>",
    "files_created": ["<list of files>"],
    "key_findings": ["<important discoveries>"]
  }
}
\`\`\`

If you encounter errors, write:
\`\`\`json
{
  "task_id": "${taskId}",
  "agent_id": "${agentId}",
  "status": "failed",
  "error": "<error description>"
}
\`\`\`
`);

  console.log(`📝 Task specification written to: ${taskFile}`);
  
  // Spawn OpenCode session with task
  const opencodeBin = '/root/.opencode/bin/opencode';
  const prompt = `Read ${taskFile} and complete the task. Write results to ${path.join(TASKS_DIR, `result_${taskId}.json`)}`;
  
  console.log(`🚀 Spawning agent ${agentId} for task ${taskId}...`);
  console.log(`   Command: ${opencodeBin} "${prompt}"`);
  
  const child = spawn(opencodeBin, [prompt], {
    detached: true,
    stdio: 'ignore',
    cwd: WORKSPACE
  });
  
  child.unref();
  
  console.log(`✅ Agent spawned with PID: ${child.pid}`);
  
  return agentId;
}

async function spawnTasks(taskDescriptions: string[]) {
  const state: CoordinatorState = {
    session_id: generateId(),
    started_at: new Date().toISOString(),
    tasks: taskDescriptions.map((desc, i) => ({
      id: `task_${i + 1}`,
      description: desc,
      status: 'pending'
    })),
    agents: []
  };
  
  console.log(`\n=== DISTRIBUTED COORDINATOR ===\n`);
  console.log(`Session ID: ${state.session_id}`);
  console.log(`Tasks to spawn: ${state.tasks.length}\n`);
  
  for (const task of state.tasks) {
    try {
      const agentId = await spawnAgent(task.id, task.description);
      task.status = 'assigned';
      task.agent_id = agentId;
      task.started_at = new Date().toISOString();
      
      state.agents.push({
        id: agentId,
        task_id: task.id,
        status: 'running'
      });
      
      console.log(`\n`);
    } catch (error) {
      console.error(`❌ Failed to spawn agent for task ${task.id}:`, error);
      task.status = 'failed';
      task.error = String(error);
    }
  }
  
  saveState(state);
  
  console.log(`\n=== SPAWN COMPLETE ===\n`);
  console.log(`✅ ${state.agents.length} agents spawned`);
  console.log(`📊 State saved to: ${STATE_FILE}`);
  console.log(`\nMonitor progress with: ./distributed-coordinator.ts status`);
  console.log(`Collect results with: ./distributed-coordinator.ts collect\n`);
}

function checkStatus() {
  const state = loadState();
  if (!state) {
    console.log('❌ No active coordination session found');
    return;
  }
  
  console.log(`\n=== COORDINATOR STATUS ===\n`);
  console.log(`Session: ${state.session_id}`);
  console.log(`Started: ${new Date(state.started_at).toLocaleString()}`);
  console.log(`\n📋 Tasks:\n`);
  
  for (const task of state.tasks) {
    const statusIcon = {
      pending: '⏳',
      assigned: '🔄',
      running: '▶️',
      completed: '✅',
      failed: '❌'
    }[task.status];
    
    console.log(`${statusIcon} ${task.id}: ${task.description}`);
    console.log(`   Status: ${task.status}`);
    if (task.agent_id) {
      console.log(`   Agent: ${task.agent_id}`);
    }
    if (task.started_at) {
      console.log(`   Started: ${new Date(task.started_at).toLocaleString()}`);
    }
    console.log('');
  }
  
  // Check for result files
  const completed = state.tasks.filter(t => {
    const resultFile = path.join(TASKS_DIR, `result_${t.id}.json`);
    return fs.existsSync(resultFile);
  });
  
  console.log(`\n📊 Progress: ${completed.length}/${state.tasks.length} tasks have results\n`);
}

function collectResults() {
  const state = loadState();
  if (!state) {
    console.log('❌ No active coordination session found');
    return;
  }
  
  console.log(`\n=== COLLECTING RESULTS ===\n`);
  
  const results = [];
  
  for (const task of state.tasks) {
    const resultFile = path.join(TASKS_DIR, `result_${task.id}.json`);
    
    if (fs.existsSync(resultFile)) {
      try {
        const result = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
        results.push(result);
        
        console.log(`✅ ${task.id}: ${result.status}`);
        if (result.result?.summary) {
          console.log(`   ${result.result.summary}`);
        }
        if (result.error) {
          console.log(`   Error: ${result.error}`);
        }
      } catch (error) {
        console.log(`❌ ${task.id}: Failed to parse result`);
      }
    } else {
      console.log(`⏳ ${task.id}: No result yet`);
    }
  }
  
  console.log(`\n📊 Collected ${results.length}/${state.tasks.length} results\n`);
  
  // Write summary
  const summaryFile = path.join(TASKS_DIR, `summary_${state.session_id}.json`);
  fs.writeFileSync(summaryFile, JSON.stringify({
    session_id: state.session_id,
    started_at: state.started_at,
    collected_at: new Date().toISOString(),
    total_tasks: state.tasks.length,
    completed_tasks: results.length,
    results
  }, null, 2));
  
  console.log(`📄 Summary written to: ${summaryFile}\n`);
}

// CLI
const command = process.argv[2];

if (command === 'spawn') {
  const tasks = process.argv.slice(3);
  if (tasks.length === 0) {
    console.error('Usage: ./distributed-coordinator.ts spawn <task1> <task2> <task3>');
    console.error('Example: ./distributed-coordinator.ts spawn "List all .ts files" "Count lines in memory dir" "Find TODOs in code"');
    process.exit(1);
  }
  spawnTasks(tasks);
} else if (command === 'status') {
  checkStatus();
} else if (command === 'collect') {
  collectResults();
} else {
  console.log(`
Distributed Subagent Coordinator

Commands:
  spawn <task1> <task2> ...   Spawn agents for parallel tasks
  status                      Check status of active session
  collect                     Collect results from agents

Examples:
  ./distributed-coordinator.ts spawn "List all .ts files" "Count total lines" "Find TODOs"
  ./distributed-coordinator.ts status
  ./distributed-coordinator.ts collect
`);
}
