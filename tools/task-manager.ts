#!/usr/bin/env bun

/**
 * Persistent Task Manager for Multi-Agent System
 * 
 * Features:
 * - Tasks persist across sessions
 * - Priority levels and status tracking
 * - Agent assignment for parallel work
 * - Dependencies between tasks
 * - Automatic task quality assessment
 * - GitHub CLI integration (issues, branches)
 */

import { readJson, writeJson } from './shared/json-utils';
import { PATHS } from './shared/paths';
import type { Task, TaskStore } from './shared/types';

/**
 * Result type for GitHub operations
 */
interface GitHubResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * GitHub issue info from `gh issue view --json`
 */
interface GitHubIssue {
  number: number;
  url: string;
  state: string;
  title: string;
}

/**
 * Slugify a title for branch naming
 */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

/**
 * Run a shell command and return the result
 */
async function runCommand(cmd: string, args: string[]): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const proc = Bun.spawn([cmd, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  
  return {
    success: exitCode === 0,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
}

class TaskManager {
  private store: TaskStore;

  constructor() {
    this.store = this.loadStore();
  }

  private loadStore(): TaskStore {
    return readJson<TaskStore>(PATHS.tasks, {
      version: '1.0',
      tasks: [],
      completed_count: 0,
      last_updated: new Date().toISOString()
    });
  }

  private saveStore(): void {
    this.store.last_updated = new Date().toISOString();
    writeJson(PATHS.tasks, this.store);
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
    console.log(`  Cancelled: ${stats.cancelled}`);
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

  // ============================================================================
  // GitHub CLI Integration
  // ============================================================================

  /**
   * Generate branch name from task
   */
  private generateBranchName(task: Task): string {
    const shortId = task.id.slice(-8);
    const slug = slugify(task.title);
    return `task/${task.priority}/${shortId}-${slug}`;
  }

  /**
   * Build issue body from task
   */
  private buildIssueBody(task: Task): string {
    let body = '';
    
    if (task.description) {
      body += `${task.description}\n\n`;
    }
    
    body += `## Task Metadata\n\n`;
    body += `- **Task ID**: \`${task.id}\`\n`;
    body += `- **Priority**: ${task.priority}\n`;
    body += `- **Status**: ${task.status}\n`;
    
    if (task.complexity) {
      body += `- **Complexity**: ${task.complexity}\n`;
    }
    
    if (task.estimated_hours) {
      body += `- **Estimated Hours**: ${task.estimated_hours}\n`;
    }
    
    if (task.tags?.length) {
      body += `- **Tags**: ${task.tags.join(', ')}\n`;
    }
    
    if (task.dependencies?.length) {
      body += `- **Dependencies**: ${task.dependencies.join(', ')}\n`;
    }
    
    body += `\n---\n*Created via task-manager CLI*\n`;
    
    return body;
  }

  /**
   * Create a GitHub issue from a task
   */
  async createGitHubIssue(taskId: string): Promise<GitHubResult> {
    const task = this.store.tasks.find(t => t.id === taskId);
    if (!task) {
      return { success: false, message: `Task not found: ${taskId}` };
    }

    if (task.github_issue_number) {
      return { 
        success: false, 
        message: `Task already has GitHub issue #${task.github_issue_number}`,
        data: { issue_number: task.github_issue_number, url: task.github_issue_url }
      };
    }

    const body = this.buildIssueBody(task);
    
    // Try to create with labels first, fallback to no labels if labels don't exist
    const labels = [`priority:${task.priority}`];
    if (task.tags?.length) {
      labels.push(...task.tags);
    }

    let args = [
      'issue', 'create',
      '--title', task.title,
      '--body', body,
    ];
    
    // Add labels
    for (const label of labels) {
      args.push('--label', label);
    }

    let result = await runCommand('gh', args);
    
    // If label error, retry without labels
    if (!result.success && result.stderr.includes('not found')) {
      console.log('Note: Some labels not found, creating issue without labels.');
      args = [
        'issue', 'create',
        '--title', task.title,
        '--body', body,
      ];
      result = await runCommand('gh', args);
    }
    
    if (!result.success) {
      return { 
        success: false, 
        message: `Failed to create issue: ${result.stderr}` 
      };
    }

    // Parse the issue URL from output (gh returns the URL)
    const issueUrl = result.stdout;
    const issueNumberMatch = issueUrl.match(/\/issues\/(\d+)$/);
    const issueNumber = issueNumberMatch ? parseInt(issueNumberMatch[1], 10) : 0;

    // Update task with GitHub info
    task.github_issue_number = issueNumber;
    task.github_issue_url = issueUrl;
    task.updated_at = new Date().toISOString();
    task.notes = task.notes || [];
    task.notes.push(`[${new Date().toISOString()}] Created GitHub issue #${issueNumber}`);
    
    this.saveStore();

    return {
      success: true,
      message: `Created GitHub issue #${issueNumber}`,
      data: { issue_number: issueNumber, url: issueUrl }
    };
  }

  /**
   * Create a git branch from a task
   */
  async createGitBranch(taskId: string): Promise<GitHubResult> {
    const task = this.store.tasks.find(t => t.id === taskId);
    if (!task) {
      return { success: false, message: `Task not found: ${taskId}` };
    }

    if (task.github_branch) {
      return {
        success: false,
        message: `Task already has branch: ${task.github_branch}`,
        data: { branch: task.github_branch }
      };
    }

    const branchName = this.generateBranchName(task);

    // Check if branch already exists
    const checkResult = await runCommand('git', ['rev-parse', '--verify', branchName]);
    if (checkResult.success) {
      // Branch exists, just associate it
      task.github_branch = branchName;
      task.updated_at = new Date().toISOString();
      this.saveStore();
      return {
        success: true,
        message: `Branch already exists, associated with task: ${branchName}`,
        data: { branch: branchName }
      };
    }

    // Create and checkout the branch
    const result = await runCommand('git', ['checkout', '-b', branchName]);
    
    if (!result.success) {
      return {
        success: false,
        message: `Failed to create branch: ${result.stderr}`
      };
    }

    // Update task with branch info
    task.github_branch = branchName;
    task.updated_at = new Date().toISOString();
    task.notes = task.notes || [];
    task.notes.push(`[${new Date().toISOString()}] Created branch: ${branchName}`);
    
    this.saveStore();

    return {
      success: true,
      message: `Created and switched to branch: ${branchName}`,
      data: { branch: branchName }
    };
  }

  /**
   * Sync task with GitHub (close issue if completed)
   */
  async syncWithGitHub(taskId: string): Promise<GitHubResult> {
    const task = this.store.tasks.find(t => t.id === taskId);
    if (!task) {
      return { success: false, message: `Task not found: ${taskId}` };
    }

    if (!task.github_issue_number) {
      return { success: false, message: 'Task has no associated GitHub issue' };
    }

    // Get current issue state
    const viewResult = await runCommand('gh', [
      'issue', 'view', task.github_issue_number.toString(),
      '--json', 'number,url,state,title'
    ]);

    if (!viewResult.success) {
      return {
        success: false,
        message: `Failed to get issue info: ${viewResult.stderr}`
      };
    }

    const issueInfo = JSON.parse(viewResult.stdout) as GitHubIssue;
    const actions: string[] = [];

    // Sync task completion -> close issue
    if (task.status === 'completed' && issueInfo.state === 'OPEN') {
      const closeResult = await runCommand('gh', [
        'issue', 'close', task.github_issue_number.toString(),
        '--comment', `Completed via task-manager (Task ID: ${task.id})`
      ]);
      
      if (closeResult.success) {
        actions.push('Closed issue');
      } else {
        return {
          success: false,
          message: `Failed to close issue: ${closeResult.stderr}`
        };
      }
    }

    // Sync cancelled task -> close issue with comment
    if (task.status === 'cancelled' && issueInfo.state === 'OPEN') {
      const closeResult = await runCommand('gh', [
        'issue', 'close', task.github_issue_number.toString(),
        '--reason', 'not_planned',
        '--comment', `Task cancelled (Task ID: ${task.id})`
      ]);
      
      if (closeResult.success) {
        actions.push('Closed issue as not planned');
      }
    }

    // Update task notes
    if (actions.length > 0) {
      task.notes = task.notes || [];
      task.notes.push(`[${new Date().toISOString()}] GitHub sync: ${actions.join(', ')}`);
      task.updated_at = new Date().toISOString();
      this.saveStore();
    }

    // Determine final issue state (after actions)
    const finalState = actions.some(a => a.includes('Closed')) ? 'CLOSED' : issueInfo.state;

    return {
      success: true,
      message: actions.length > 0 
        ? `Synced with GitHub: ${actions.join(', ')}`
        : 'Already in sync',
      data: { 
        issue_number: task.github_issue_number,
        issue_state: finalState,
        task_status: task.status,
        actions 
      }
    };
  }

  /**
   * Get a task by ID
   */
  getById(taskId: string): Task | undefined {
    return this.store.tasks.find(t => t.id === taskId);
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
    const { writeFileSync } = require('fs');
    const exportPath = '/app/workspace/memory/task-board.md';
    writeFileSync(exportPath, md);
    console.log(`Exported to ${exportPath}`);
    break;

  case 'list':
    const listStatus = process.argv[3] as Task['status'] | 'all';
    let tasks: Task[];
    if (listStatus === 'all') {
      tasks = tm.search(''); // Get all tasks
    } else if (listStatus) {
      tasks = tm.getByStatus(listStatus);
    } else {
      tasks = tm.getPending();
    }
    if (tasks.length === 0) {
      console.log(listStatus ? `No tasks with status: ${listStatus}` : 'No pending tasks');
    } else {
      tasks.forEach(t => {
        console.log(`[${t.id.slice(-8)}] ${t.priority} - ${t.title} (${t.status})`);
      });
    }
    break;

  case 'search':
    const query = process.argv[3];
    if (!query) {
      console.log('Usage: task-manager search <query>');
      process.exit(1);
    }
    const results = tm.search(query);
    if (results.length === 0) {
      console.log(`No tasks matching: ${query}`);
    } else {
      console.log(`Found ${results.length} task(s):\n`);
      results.forEach(t => {
        console.log(`[${t.id.slice(-8)}] ${t.priority} - ${t.title} (${t.status})`);
      });
    }
    break;

  case 'gh:issue': {
    const ghIssueTaskId = process.argv[3];
    if (!ghIssueTaskId) {
      console.log('Usage: task-manager gh:issue <taskId>');
      console.log('\nCreates a GitHub issue from the specified task.');
      process.exit(1);
    }
    const issueResult = await tm.createGitHubIssue(ghIssueTaskId);
    if (issueResult.success) {
      console.log(`\n${issueResult.message}`);
      if (issueResult.data?.url) {
        console.log(`URL: ${issueResult.data.url}`);
      }
    } else {
      console.log(`\nError: ${issueResult.message}`);
      process.exit(1);
    }
    break;
  }

  case 'gh:branch': {
    const ghBranchTaskId = process.argv[3];
    if (!ghBranchTaskId) {
      console.log('Usage: task-manager gh:branch <taskId>');
      console.log('\nCreates a git branch for the specified task.');
      console.log('Branch format: task/<priority>/<short-id>-<slug-title>');
      process.exit(1);
    }
    const branchResult = await tm.createGitBranch(ghBranchTaskId);
    if (branchResult.success) {
      console.log(`\n${branchResult.message}`);
      if (branchResult.data?.branch) {
        console.log(`Branch: ${branchResult.data.branch}`);
      }
    } else {
      console.log(`\nError: ${branchResult.message}`);
      process.exit(1);
    }
    break;
  }

  case 'gh:sync': {
    const ghSyncTaskId = process.argv[3];
    if (!ghSyncTaskId) {
      console.log('Usage: task-manager gh:sync <taskId>');
      console.log('\nSyncs task status with GitHub (closes issue if task completed).');
      process.exit(1);
    }
    const syncResult = await tm.syncWithGitHub(ghSyncTaskId);
    if (syncResult.success) {
      console.log(`\n${syncResult.message}`);
      if (syncResult.data) {
        console.log(`Issue #${syncResult.data.issue_number}: ${syncResult.data.issue_state}`);
        console.log(`Task status: ${syncResult.data.task_status}`);
      }
    } else {
      console.log(`\nError: ${syncResult.message}`);
      process.exit(1);
    }
    break;
  }

  case 'view': {
    const viewTaskId = process.argv[3];
    if (!viewTaskId) {
      console.log('Usage: task-manager view <taskId>');
      process.exit(1);
    }
    const viewTask = tm.getById(viewTaskId);
    if (!viewTask) {
      console.log(`Task not found: ${viewTaskId}`);
      process.exit(1);
    }
    console.log('\n--- Task Details ---\n');
    console.log(`ID: ${viewTask.id}`);
    console.log(`Title: ${viewTask.title}`);
    console.log(`Description: ${viewTask.description || 'None'}`);
    console.log(`Priority: ${viewTask.priority}`);
    console.log(`Status: ${viewTask.status}`);
    console.log(`Created: ${viewTask.created_at}`);
    console.log(`Updated: ${viewTask.updated_at}`);
    if (viewTask.assigned_to) console.log(`Assigned: ${viewTask.assigned_to}`);
    if (viewTask.tags?.length) console.log(`Tags: ${viewTask.tags.join(', ')}`);
    if (viewTask.github_issue_number) {
      console.log(`\n--- GitHub ---`);
      console.log(`Issue: #${viewTask.github_issue_number}`);
      if (viewTask.github_issue_url) console.log(`URL: ${viewTask.github_issue_url}`);
    }
    if (viewTask.github_branch) {
      console.log(`Branch: ${viewTask.github_branch}`);
    }
    if (viewTask.notes?.length) {
      console.log(`\n--- Notes ---`);
      viewTask.notes.forEach(n => console.log(`  ${n}`));
    }
    break;
  }

  case '--help':
  case '-h':
  case 'help':
  default:
    console.log('Usage: task-manager <command>');
    console.log('\nTask Commands:');
    console.log('  create <title> [priority]  - Create a new task (priority: critical|high|medium|low)');
    console.log('  status <id> <status>       - Update task status (pending|in_progress|completed|blocked|cancelled)');
    console.log('  view <id>                  - View task details');
    console.log('  next                       - Get next available task');
    console.log('  summary                    - Show task summary');
    console.log('  export                     - Export to markdown');
    console.log('  list [status|all]          - List tasks by status (default: pending)');
    console.log('  search <query>             - Search tasks by title, description, or tags');
    console.log('\nGitHub Commands:');
    console.log('  gh:issue <id>              - Create GitHub issue from task');
    console.log('  gh:branch <id>             - Create git branch for task');
    console.log('  gh:sync <id>               - Sync task status with GitHub');
}
