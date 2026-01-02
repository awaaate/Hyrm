#!/usr/bin/env node

/**
 * Persistent Task Manager for Multi-Agent System
 * 
 * Features:
 * - Tasks persist across sessions
 * - Priority levels and status tracking
 * - Agent assignment for parallel work
 * - Dependencies between tasks
 * - Automatic task quality assessment
 */

import * as fs from 'fs';
import * as path from 'path';

interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  created_by: string;
  assigned_to?: string;
  completed_at?: string;
  dependencies?: string[];
  tags?: string[];
  parent_task?: string;
  subtasks?: string[];
  notes?: string[];
  quality_score?: number; // 1-10
  quality_notes?: string;
}

interface TaskStore {
  version: string;
  tasks: Task[];
  completed_count: number;
  last_updated: string;
}

class TaskManager {
  private storePath = '/app/workspace/memory/tasks.json';
  private store: TaskStore;

  constructor() {
    this.store = this.loadStore();
  }

  private loadStore(): TaskStore {
    if (fs.existsSync(this.storePath)) {
      try {
        return JSON.parse(fs.readFileSync(this.storePath, 'utf-8'));
      } catch (e) {
        console.error('Failed to load task store:', e);
      }
    }
    return {
      version: '1.0',
      tasks: [],
      completed_count: 0,
      last_updated: new Date().toISOString()
    };
  }

  private saveStore(): void {
    this.store.last_updated = new Date().toISOString();
    fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2));
  }

  private generateId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Create a new task
   */
  create(options: {
    title: string;
    description?: string;
    priority?: Task['priority'];
    created_by?: string;
    dependencies?: string[];
    tags?: string[];
    parent_task?: string;
  }): Task {
    const task: Task = {
      id: this.generateId(),
      title: options.title,
      description: options.description || '',
      priority: options.priority || 'medium',
      status: 'pending',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: options.created_by || 'orchestrator',
      dependencies: options.dependencies,
      tags: options.tags,
      parent_task: options.parent_task
    };

    this.store.tasks.push(task);
    
    // If parent task exists, add this as subtask
    if (options.parent_task) {
      const parent = this.store.tasks.find(t => t.id === options.parent_task);
      if (parent) {
        parent.subtasks = parent.subtasks || [];
        parent.subtasks.push(task.id);
      }
    }

    this.saveStore();
    return task;
  }

  /**
   * Update task status
   */
  updateStatus(taskId: string, status: Task['status'], notes?: string): Task | null {
    const task = this.store.tasks.find(t => t.id === taskId);
    if (!task) return null;

    task.status = status;
    task.updated_at = new Date().toISOString();
    
    if (status === 'completed') {
      task.completed_at = new Date().toISOString();
      this.store.completed_count++;
    }

    if (notes) {
      task.notes = task.notes || [];
      task.notes.push(`[${new Date().toISOString()}] ${notes}`);
    }

    this.saveStore();
    return task;
  }

  /**
   * Assign task to an agent
   */
  assign(taskId: string, agentId: string): Task | null {
    const task = this.store.tasks.find(t => t.id === taskId);
    if (!task) return null;

    task.assigned_to = agentId;
    task.status = 'in_progress';
    task.updated_at = new Date().toISOString();

    this.saveStore();
    return task;
  }

  /**
   * Rate task quality (for completed tasks)
   */
  rateQuality(taskId: string, score: number, notes?: string): Task | null {
    const task = this.store.tasks.find(t => t.id === taskId);
    if (!task || task.status !== 'completed') return null;

    task.quality_score = Math.max(1, Math.min(10, score));
    task.quality_notes = notes;
    task.updated_at = new Date().toISOString();

    this.saveStore();
    return task;
  }

  /**
   * Get tasks by status
   */
  getByStatus(status: Task['status']): Task[] {
    return this.store.tasks.filter(t => t.status === status);
  }

  /**
   * Get tasks by priority
   */
  getByPriority(priority: Task['priority']): Task[] {
    return this.store.tasks.filter(t => t.priority === priority && t.status !== 'completed');
  }

  /**
   * Get all pending tasks, sorted by priority
   */
  getPending(): Task[] {
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return this.store.tasks
      .filter(t => t.status === 'pending')
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  /**
   * Get next available task (not blocked by dependencies)
   */
  getNextAvailable(): Task | null {
    const pending = this.getPending();
    
    for (const task of pending) {
      if (!task.dependencies?.length) {
        return task;
      }
      
      // Check if all dependencies are completed
      const allDepsComplete = task.dependencies.every(depId => {
        const dep = this.store.tasks.find(t => t.id === depId);
        return dep?.status === 'completed';
      });
      
      if (allDepsComplete) {
        return task;
      }
    }
    
    return null;
  }

  /**
   * Get task statistics
   */
  getStats(): {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    blocked: number;
    cancelled: number;
    avg_quality: number;
  } {
    const tasks = this.store.tasks;
    const completed = tasks.filter(t => t.status === 'completed');
    const qualityScores = completed.filter(t => t.quality_score).map(t => t.quality_score!);
    
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      completed: completed.length,
      blocked: tasks.filter(t => t.status === 'blocked').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
      avg_quality: qualityScores.length > 0 
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length 
        : 0
    };
  }

  /**
   * Search tasks
   */
  search(query: string): Task[] {
    const lower = query.toLowerCase();
    return this.store.tasks.filter(t => 
      t.title.toLowerCase().includes(lower) ||
      t.description.toLowerCase().includes(lower) ||
      t.tags?.some(tag => tag.toLowerCase().includes(lower))
    );
  }

  /**
   * Print task summary
   */
  printSummary(): void {
    const stats = this.getStats();
    console.log('\n📋 Task Manager Summary\n');
    console.log(`Total tasks: ${stats.total}`);
    console.log(`  Pending: ${stats.pending}`);
    console.log(`  In Progress: ${stats.in_progress}`);
    console.log(`  Completed: ${stats.completed}`);
    console.log(`  Blocked: ${stats.blocked}`);
    console.log(`  Average Quality: ${stats.avg_quality.toFixed(1)}/10\n`);

    const pending = this.getPending();
    if (pending.length > 0) {
      console.log('🔥 Top Priority Tasks:\n');
      pending.slice(0, 5).forEach((task, i) => {
        const priority = {
          critical: '🔴',
          high: '🟠',
          medium: '🟡',
          low: '🟢'
        }[task.priority];
        console.log(`  ${i + 1}. ${priority} [${task.id.slice(-8)}] ${task.title}`);
        if (task.description) {
          console.log(`     ${task.description.slice(0, 60)}...`);
        }
      });
      console.log('');
    }

    const inProgress = this.getByStatus('in_progress');
    if (inProgress.length > 0) {
      console.log('⏳ In Progress:\n');
      inProgress.forEach(task => {
        console.log(`  [${task.id.slice(-8)}] ${task.title}`);
        if (task.assigned_to) {
          console.log(`     Assigned to: ${task.assigned_to}`);
        }
      });
      console.log('');
    }
  }

  /**
   * Export tasks as markdown
   */
  exportMarkdown(): string {
    const stats = this.getStats();
    let md = `# Task Board\n\n`;
    md += `**Last Updated**: ${this.store.last_updated}\n\n`;
    md += `## Statistics\n`;
    md += `- Total: ${stats.total}\n`;
    md += `- Pending: ${stats.pending}\n`;
    md += `- In Progress: ${stats.in_progress}\n`;
    md += `- Completed: ${stats.completed}\n\n`;

    const pending = this.getPending();
    if (pending.length > 0) {
      md += `## Pending Tasks\n\n`;
      pending.forEach(task => {
        md += `- [ ] **[${task.priority.toUpperCase()}]** ${task.title}\n`;
        if (task.description) {
          md += `  - ${task.description}\n`;
        }
      });
      md += '\n';
    }

    const inProgress = this.getByStatus('in_progress');
    if (inProgress.length > 0) {
      md += `## In Progress\n\n`;
      inProgress.forEach(task => {
        md += `- [ ] ${task.title} (${task.assigned_to || 'unassigned'})\n`;
      });
      md += '\n';
    }

    const completed = this.getByStatus('completed').slice(-10);
    if (completed.length > 0) {
      md += `## Recently Completed\n\n`;
      completed.forEach(task => {
        const quality = task.quality_score ? ` (Quality: ${task.quality_score}/10)` : '';
        md += `- [x] ${task.title}${quality}\n`;
      });
    }

    return md;
  }
}

// CLI Interface
const tm = new TaskManager();
const command = process.argv[2] || 'summary';

switch (command) {
  case 'create':
    const title = process.argv[3];
    const priority = process.argv[4] as Task['priority'] || 'medium';
    if (!title) {
      console.log('Usage: task-manager create "Task title" [priority]');
      process.exit(1);
    }
    const task = tm.create({ title, priority });
    console.log(`Created task: ${task.id}`);
    break;

  case 'status':
    const taskId = process.argv[3];
    const status = process.argv[4] as Task['status'];
    if (!taskId || !status) {
      console.log('Usage: task-manager status <taskId> <pending|in_progress|completed|blocked|cancelled>');
      process.exit(1);
    }
    const updated = tm.updateStatus(taskId, status);
    if (updated) {
      console.log(`Updated task ${taskId} to ${status}`);
    } else {
      console.log('Task not found');
    }
    break;

  case 'next':
    const next = tm.getNextAvailable();
    if (next) {
      console.log(`\nNext available task:\n`);
      console.log(`ID: ${next.id}`);
      console.log(`Title: ${next.title}`);
      console.log(`Priority: ${next.priority}`);
      console.log(`Description: ${next.description || 'None'}`);
    } else {
      console.log('No available tasks');
    }
    break;

  case 'summary':
    tm.printSummary();
    break;

  case 'export':
    const md = tm.exportMarkdown();
    const exportPath = '/app/workspace/memory/task-board.md';
    fs.writeFileSync(exportPath, md);
    console.log(`Exported to ${exportPath}`);
    break;

  case 'list':
    const listStatus = process.argv[3] as Task['status'];
    const tasks = listStatus ? tm.getByStatus(listStatus) : tm.getPending();
    tasks.forEach(t => {
      console.log(`[${t.id.slice(-8)}] ${t.priority} - ${t.title} (${t.status})`);
    });
    break;

  default:
    console.log('Usage: task-manager <command>');
    console.log('Commands:');
    console.log('  create <title> [priority]  - Create a new task');
    console.log('  status <id> <status>       - Update task status');
    console.log('  next                       - Get next available task');
    console.log('  summary                    - Show task summary');
    console.log('  export                     - Export to markdown');
    console.log('  list [status]              - List tasks');
}
