#!/usr/bin/env bun
/**
 * Subagent Coordinator - Orchestrates multiple agents working in parallel
 * 
 * This tool allows spawning and managing multiple OpenCode agents to work
 * on different tasks simultaneously, with shared memory coordination.
 * 
 * Usage:
 *   bun memory/coordinator.ts plan <task>           # Create execution plan
 *   bun memory/coordinator.ts execute <plan_file>   # Execute a plan
 *   bun memory/coordinator.ts status                # Check running agents
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const PLANS_DIR = '/app/workspace/memory/plans';
const STATE_FILE = '/app/workspace/memory/coordinator-state.json';

interface Task {
  id: string;
  description: string;
  agent_type: 'general' | 'explore';
  dependencies: string[]; // IDs of tasks that must complete first
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  error?: string;
  started_at?: string;
  completed_at?: string;
}

interface ExecutionPlan {
  id: string;
  name: string;
  description: string;
  tasks: Task[];
  created: string;
  status: 'draft' | 'running' | 'completed' | 'failed';
}

interface CoordinatorState {
  active_plans: string[];
  completed_plans: string[];
  running_tasks: Map<string, string>; // task_id -> agent_session_id
  last_updated: string;
}

// State management
function loadState(): CoordinatorState {
  if (!existsSync(STATE_FILE)) {
    return {
      active_plans: [],
      completed_plans: [],
      running_tasks: new Map(),
      last_updated: new Date().toISOString(),
    };
  }
  
  const data = JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  return {
    ...data,
    running_tasks: new Map(Object.entries(data.running_tasks || {})),
  };
}

function saveState(state: CoordinatorState): void {
  const serializable = {
    ...state,
    running_tasks: Object.fromEntries(state.running_tasks),
  };
  writeFileSync(STATE_FILE, JSON.stringify(serializable, null, 2));
}

// Plan management
function createPlan(taskDescription: string): ExecutionPlan {
  // This is a simple planner - could be enhanced with LLM-based planning
  console.log(`\n=== Creating Execution Plan ===`);
  console.log(`Task: ${taskDescription}\n`);
  
  // For now, create a simple sequential plan
  // In a real system, this would use AI to break down the task
  const plan: ExecutionPlan = {
    id: `plan_${Date.now()}`,
    name: taskDescription.substring(0, 50),
    description: taskDescription,
    tasks: [
      {
        id: 'task_1',
        description: `Research and analyze: ${taskDescription}`,
        agent_type: 'explore',
        dependencies: [],
        status: 'pending',
      },
      {
        id: 'task_2',
        description: `Implement solution for: ${taskDescription}`,
        agent_type: 'general',
        dependencies: ['task_1'],
        status: 'pending',
      },
      {
        id: 'task_3',
        description: `Test and validate: ${taskDescription}`,
        agent_type: 'general',
        dependencies: ['task_2'],
        status: 'pending',
      },
    ],
    created: new Date().toISOString(),
    status: 'draft',
  };
  
  // Save plan
  const planFile = join(PLANS_DIR, `${plan.id}.json`);
  if (!existsSync(PLANS_DIR)) {
    const { mkdirSync } = require('fs');
    mkdirSync(PLANS_DIR, { recursive: true });
  }
  writeFileSync(planFile, JSON.stringify(plan, null, 2));
  
  console.log(`Plan created: ${planFile}`);
  console.log(`\nTasks:`);
  plan.tasks.forEach((task, i) => {
    const deps = task.dependencies.length > 0 
      ? ` (depends on: ${task.dependencies.join(', ')})` 
      : '';
    console.log(`  ${i + 1}. [${task.agent_type}] ${task.description}${deps}`);
  });
  
  return plan;
}

function loadPlan(planId: string): ExecutionPlan {
  const planFile = join(PLANS_DIR, `${planId}.json`);
  if (!existsSync(planFile)) {
    throw new Error(`Plan not found: ${planId}`);
  }
  return JSON.parse(readFileSync(planFile, 'utf-8'));
}

function savePlan(plan: ExecutionPlan): void {
  const planFile = join(PLANS_DIR, `${plan.id}.json`);
  writeFileSync(planFile, JSON.stringify(plan, null, 2));
}

// Task execution
function canStartTask(task: Task, plan: ExecutionPlan): boolean {
  if (task.status !== 'pending') {
    return false;
  }
  
  // Check if all dependencies are completed
  for (const depId of task.dependencies) {
    const depTask = plan.tasks.find(t => t.id === depId);
    if (!depTask || depTask.status !== 'completed') {
      return false;
    }
  }
  
  return true;
}

async function executeTask(task: Task, plan: ExecutionPlan): Promise<void> {
  console.log(`\n[${task.id}] Starting task: ${task.description}`);
  console.log(`  Agent type: ${task.agent_type}`);
  
  task.status = 'running';
  task.started_at = new Date().toISOString();
  savePlan(plan);
  
  try {
    // Note: In a real implementation, this would spawn an actual OpenCode agent
    // using the Task tool or OpenCode SDK. For now, we'll simulate it.
    
    // Simulated agent execution
    console.log(`  [Simulated] Agent working on task...`);
    
    // Gather context from dependencies
    let context = '';
    for (const depId of task.dependencies) {
      const depTask = plan.tasks.find(t => t.id === depId);
      if (depTask?.result) {
        context += `\nFrom ${depId}: ${depTask.result}\n`;
      }
    }
    
    // In real implementation, would use:
    // const result = await spawnAgent(task.agent_type, task.description + context);
    
    task.result = `Task completed: ${task.description}`;
    task.status = 'completed';
    task.completed_at = new Date().toISOString();
    
    console.log(`  ✅ Task completed`);
    
  } catch (error: any) {
    task.status = 'failed';
    task.error = error.message;
    task.completed_at = new Date().toISOString();
    
    console.error(`  ❌ Task failed: ${error.message}`);
  }
  
  savePlan(plan);
}

async function executePlan(planId: string): Promise<void> {
  console.log(`\n=== Executing Plan: ${planId} ===\n`);
  
  const plan = loadPlan(planId);
  const state = loadState();
  
  plan.status = 'running';
  state.active_plans.push(plan.id);
  savePlan(plan);
  saveState(state);
  
  // Simple sequential executor
  // In a real system, this would run tasks in parallel when dependencies allow
  let allCompleted = false;
  
  while (!allCompleted) {
    let startedAny = false;
    
    // Find tasks that can start
    for (const task of plan.tasks) {
      if (canStartTask(task, plan)) {
        await executeTask(task, plan);
        startedAny = true;
      }
    }
    
    // Check if all tasks are done
    const pending = plan.tasks.filter(t => t.status === 'pending');
    const running = plan.tasks.filter(t => t.status === 'running');
    const failed = plan.tasks.filter(t => t.status === 'failed');
    
    if (pending.length === 0 && running.length === 0) {
      allCompleted = true;
      
      if (failed.length > 0) {
        plan.status = 'failed';
        console.log(`\n❌ Plan failed with ${failed.length} failed tasks`);
      } else {
        plan.status = 'completed';
        console.log(`\n✅ Plan completed successfully!`);
      }
    }
    
    if (!startedAny && !allCompleted) {
      console.error('\n⚠️  No tasks can start but plan is not complete (dependency cycle?)');
      plan.status = 'failed';
      break;
    }
  }
  
  // Update state
  state.active_plans = state.active_plans.filter(id => id !== plan.id);
  state.completed_plans.push(plan.id);
  state.last_updated = new Date().toISOString();
  
  savePlan(plan);
  saveState(state);
  
  // Print summary
  console.log('\n=== Execution Summary ===');
  console.log(`Total tasks: ${plan.tasks.length}`);
  console.log(`Completed: ${plan.tasks.filter(t => t.status === 'completed').length}`);
  console.log(`Failed: ${plan.tasks.filter(t => t.status === 'failed').length}`);
}

function showStatus(): void {
  const state = loadState();
  
  console.log('\n=== Coordinator Status ===\n');
  console.log(`Last Updated: ${state.last_updated}`);
  console.log(`Active Plans: ${state.active_plans.length}`);
  console.log(`Completed Plans: ${state.completed_plans.length}`);
  console.log(`Running Tasks: ${state.running_tasks.size}`);
  
  if (state.active_plans.length > 0) {
    console.log('\n=== Active Plans ===');
    for (const planId of state.active_plans) {
      try {
        const plan = loadPlan(planId);
        console.log(`\n${plan.name} (${plan.id})`);
        console.log(`  Status: ${plan.status}`);
        console.log(`  Tasks: ${plan.tasks.length}`);
        console.log(`  Completed: ${plan.tasks.filter(t => t.status === 'completed').length}`);
        console.log(`  Running: ${plan.tasks.filter(t => t.status === 'running').length}`);
        console.log(`  Pending: ${plan.tasks.filter(t => t.status === 'pending').length}`);
      } catch (e) {
        console.log(`  [Error loading plan ${planId}]`);
      }
    }
  }
  
  if (existsSync(PLANS_DIR)) {
    const plans = readdirSync(PLANS_DIR).filter(f => f.endsWith('.json'));
    console.log(`\nTotal Plans: ${plans.length}`);
  }
}

function listPlans(): void {
  if (!existsSync(PLANS_DIR)) {
    console.log('No plans found.');
    return;
  }
  
  const files = readdirSync(PLANS_DIR).filter(f => f.endsWith('.json'));
  
  console.log(`\n=== All Plans (${files.length}) ===\n`);
  
  for (const file of files) {
    try {
      const plan = loadPlan(file.replace('.json', ''));
      console.log(`${plan.id}`);
      console.log(`  Name: ${plan.name}`);
      console.log(`  Status: ${plan.status}`);
      console.log(`  Tasks: ${plan.tasks.length}`);
      console.log(`  Created: ${plan.created}`);
      console.log();
    } catch (e) {
      console.log(`  [Error loading ${file}]`);
    }
  }
}

// CLI
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'plan':
    if (!arg) {
      console.error('Usage: bun memory/coordinator.ts plan <task description>');
      process.exit(1);
    }
    const taskDesc = process.argv.slice(3).join(' ');
    createPlan(taskDesc);
    break;
    
  case 'execute':
    if (!arg) {
      console.error('Usage: bun memory/coordinator.ts execute <plan_id>');
      process.exit(1);
    }
    await executePlan(arg);
    break;
    
  case 'status':
    showStatus();
    break;
    
  case 'list':
    listPlans();
    break;
    
  default:
    console.log('Subagent Coordinator - Orchestrate multiple agents');
    console.log('');
    console.log('Usage:');
    console.log('  bun memory/coordinator.ts plan <task>       # Create execution plan');
    console.log('  bun memory/coordinator.ts list              # List all plans');
    console.log('  bun memory/coordinator.ts execute <plan_id> # Execute a plan');
    console.log('  bun memory/coordinator.ts status            # Check coordinator status');
    console.log('');
    console.log('Examples:');
    console.log('  bun memory/coordinator.ts plan "optimize memory compression"');
    console.log('  bun memory/coordinator.ts execute plan_1234567890');
    process.exit(1);
}
