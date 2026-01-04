#!/usr/bin/env node

/**
 * Task Router
 * 
 * Intelligently routes tasks to available worker agents based on:
 * - Agent availability and status
 * - Agent role specialization
 * - Task priority and requirements
 * - Load balancing across agents
 */

import * as fs from 'fs';
import { execSync } from 'child_process';
import { PATHS, MEMORY_DIR, getMemoryPath } from '../shared';
import type { AgentRegistry } from '../shared/types';

// Use centralized paths from shared/paths.ts
const TASKS_PATH = PATHS.tasks;
const REGISTRY_PATH = PATHS.agentRegistry;
const ROUTER_LOG = getMemoryPath('task-router.log');

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  tags?: string[];
  assigned_to?: string;
}

interface Agent {
  agent_id: string;
  session_id: string;
  status: 'active' | 'idle' | 'working' | 'blocked';
  assigned_role?: string;
  current_task?: string;
  last_heartbeat: string;
}

interface RoutingDecision {
  task_id: string;
  agent_id: string;
  reason: string;
  priority: number;
}

class TaskRouter {
  private log(level: string, message: string): void {
    const timestamp = new Date().toISOString();
    const entry = `${timestamp} [${level}] ${message}\n`;
    
    if (fs.existsSync(ROUTER_LOG)) {
      fs.appendFileSync(ROUTER_LOG, entry);
    } else {
      fs.writeFileSync(ROUTER_LOG, entry);
    }
    console.log(`[TaskRouter] ${entry.trim()}`);
  }

  /**
   * Get all pending tasks sorted by priority
   */
  private getPendingTasks(): Task[] {
    if (!fs.existsSync(TASKS_PATH)) return [];
    
    try {
      const data = JSON.parse(fs.readFileSync(TASKS_PATH, 'utf-8'));
      const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      
      return (data.tasks || [])
        .filter((t: Task) => t.status === 'pending')
        .sort((a: Task, b: Task) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    } catch {
      return [];
    }
  }

  /**
   * Get available agents (active but not working on a task)
   */
  private getAvailableAgents(): Agent[] {
    if (!fs.existsSync(REGISTRY_PATH)) return [];
    
    try {
      const data = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      
      return (data.agents || []).filter((a: Agent) => {
        const lastHB = new Date(a.last_heartbeat).getTime();
        const isRecent = lastHB > fiveMinutesAgo;
        const isAvailable = a.status === 'active' || a.status === 'idle';
        return isRecent && isAvailable;
      });
    } catch {
      return [];
    }
  }

  /**
   * Calculate agent suitability for a task
   */
  private calculateSuitability(agent: Agent, task: Task): number {
    let score = 50; // Base score

    // Role matching
    if (task.tags && agent.assigned_role) {
      if (task.tags.includes(agent.assigned_role)) {
        score += 30;
      }
    }

    // Prefer idle agents over active
    if (agent.status === 'idle') {
      score += 10;
    }

    // Prefer agents without current task
    if (!agent.current_task) {
      score += 10;
    }

    return score;
  }

  /**
   * Find the best agent for a task
   */
  private findBestAgent(task: Task, agents: Agent[]): Agent | null {
    if (agents.length === 0) return null;

    let bestAgent: Agent | null = null;
    let bestScore = -1;

    for (const agent of agents) {
      const score = this.calculateSuitability(agent, task);
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return bestAgent;
  }

  /**
   * Assign a task to an agent
   */
  private assignTask(taskId: string, agentId: string): boolean {
    try {
      const data = JSON.parse(fs.readFileSync(TASKS_PATH, 'utf-8'));
      const task = data.tasks.find((t: Task) => t.id === taskId);
      
      if (task) {
        task.assigned_to = agentId;
        task.status = 'in_progress';
        task.updated_at = new Date().toISOString();
        fs.writeFileSync(TASKS_PATH, JSON.stringify(data, null, 2));
        return true;
      }
    } catch (e) {
      this.log('ERROR', `Failed to assign task: ${e}`);
    }
    return false;
  }

  /**
   * Route pending tasks to available agents
   */
  routeTasks(): RoutingDecision[] {
    const decisions: RoutingDecision[] = [];
    const tasks = this.getPendingTasks();
    let agents = this.getAvailableAgents();

    this.log('INFO', `Routing ${tasks.length} pending tasks to ${agents.length} available agents`);

    if (tasks.length === 0) {
      this.log('INFO', 'No pending tasks to route');
      return decisions;
    }

    if (agents.length === 0) {
      this.log('WARN', 'No available agents for task routing');
      return decisions;
    }

    // Route each task to the best available agent
    for (const task of tasks) {
      if (agents.length === 0) break;

      const bestAgent = this.findBestAgent(task, agents);
      
      if (bestAgent) {
        const success = this.assignTask(task.id, bestAgent.agent_id);
        
        if (success) {
          decisions.push({
            task_id: task.id,
            agent_id: bestAgent.agent_id,
            reason: `Best match for ${task.priority} priority task`,
            priority: { critical: 0, high: 1, medium: 2, low: 3 }[task.priority]
          });

          // Remove agent from available pool (one task per agent)
          agents = agents.filter(a => a.agent_id !== bestAgent.agent_id);
          
          this.log('INFO', `Routed task ${task.id} to agent ${bestAgent.agent_id}`);
        }
      }
    }

    return decisions;
  }

  /**
   * Spawn worker agents for pending tasks
   */
  spawnWorkers(count: number = 1): void {
    const tasks = this.getPendingTasks();
    
    if (tasks.length === 0) {
      this.log('INFO', 'No pending tasks - no workers needed');
      return;
    }

    const tasksToAssign = tasks.slice(0, count);
    
    for (const task of tasksToAssign) {
      const workerPrompt = `You are a WORKER AGENT. 
      
TASK: ${task.title}
${task.description ? `DESCRIPTION: ${task.description}` : ''}
TASK ID: ${task.id}
PRIORITY: ${task.priority}

INSTRUCTIONS:
1. Call agent_register with role='worker'
2. Call task_update to mark task as in_progress
3. Complete the task
4. Call task_update to mark task as completed
5. Call quality_assess to rate your work
6. Report results via agent_send with type=task_complete
7. You CAN handoff when done (unlike the orchestrator)

Begin working on the task now.`;

      try {
        this.log('INFO', `Spawning worker for task: ${task.id}`);
        
        // Spawn worker in background using spawn-worker.sh (handles quoting safely)
        execSync(
          `/app/workspace/spawn-worker.sh "${workerPrompt.replace(/"/g, '\\"')}"`,
          { shell: '/bin/bash' }
        );
        
        this.log('INFO', `Worker spawned for task ${task.id}`);
      } catch (e) {
        this.log('ERROR', `Failed to spawn worker: ${e}`);
      }
    }
  }

  /**
   * Get routing statistics
   */
  getStats(): {
    pending_tasks: number;
    available_agents: number;
    working_agents: number;
    unassigned_high_priority: number;
  } {
    const tasks = this.getPendingTasks();
    const agents = this.getAvailableAgents();
    
    let registry: AgentRegistry = { agents: [], last_updated: "" };
    try {
      registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
    } catch (error) {
      // Registry may not exist or be corrupted - use empty default
      console.error(`[TaskRouter] Failed to load agent registry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const workingAgents = (registry.agents || []).filter(
      (a: Agent) => a.status === 'working'
    );

    const highPriority = tasks.filter(
      t => (t.priority === 'critical' || t.priority === 'high') && !t.assigned_to
    );

    return {
      pending_tasks: tasks.length,
      available_agents: agents.length,
      working_agents: workingAgents.length,
      unassigned_high_priority: highPriority.length
    };
  }

  /**
   * Print routing dashboard
   */
  printDashboard(): void {
    const stats = this.getStats();
    const tasks = this.getPendingTasks();
    
    console.log('\n=== Task Router Dashboard ===\n');
    console.log(`Pending Tasks: ${stats.pending_tasks}`);
    console.log(`Available Agents: ${stats.available_agents}`);
    console.log(`Working Agents: ${stats.working_agents}`);
    console.log(`High Priority Unassigned: ${stats.unassigned_high_priority}`);
    
    if (tasks.length > 0) {
      console.log('\nTop Priority Tasks:');
      tasks.slice(0, 5).forEach((t, i) => {
        const priority = { critical: '!!!!', high: '!!!', medium: '!!', low: '!' }[t.priority];
        const status = t.assigned_to ? `-> ${t.assigned_to.slice(-8)}` : '(unassigned)';
        console.log(`  ${i + 1}. ${priority} ${t.title} ${status}`);
      });
    }
    
    console.log('\n' + '='.repeat(30) + '\n');
  }
}

// CLI Interface
const router = new TaskRouter();
const command = process.argv[2] || 'dashboard';

switch (command) {
  case 'route':
    const decisions = router.routeTasks();
    console.log(`Routed ${decisions.length} tasks`);
    decisions.forEach(d => {
      console.log(`  ${d.task_id} -> ${d.agent_id}`);
    });
    break;

  case 'spawn':
    const count = parseInt(process.argv[3] || '1');
    router.spawnWorkers(count);
    break;

  case 'stats':
    const stats = router.getStats();
    console.log(JSON.stringify(stats, null, 2));
    break;

  case 'dashboard':
    router.printDashboard();
    break;

  default:
    console.log(`
Task Router CLI

Usage:
  node task-router.ts <command> [args]

Commands:
  dashboard       - Show routing dashboard
  route           - Route pending tasks to available agents
  spawn [count]   - Spawn worker agents for pending tasks
  stats           - Get routing statistics as JSON
`);
}

export { TaskRouter };
