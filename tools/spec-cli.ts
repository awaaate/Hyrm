#!/usr/bin/env bun

/**
 * Spec CLI - Manage task specification files
 * 
 * Commands:
 * - generate <task_id>  : Generate or regenerate spec for a task
 * - view <task_id>      : View spec file for a task
 * - sync <task_id>      : Sync spec to GitHub issue (update issue body)
 * - list                : List all spec files
 * - backfill            : Generate specs for all tasks without them
 */

import { readJson, writeJson } from './shared/json-utils';
import { PATHS } from './shared/paths';
import type { Task, TaskStore } from './shared/types';
import { 
  ensureTaskSpecFile, 
  readSpecFile, 
  getSpecAbsolutePath,
  updateSpecsIndex,
  ensureSpecsDir,
  getSpecRelativePath
} from './lib/spec-generator';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message: string, color?: keyof typeof colors) {
  const c = color ? colors[color] : '';
  console.log(`${c}${message}${colors.reset}`);
}

function error(message: string) {
  log(`❌ ${message}`, 'red');
}

function success(message: string) {
  log(`✅ ${message}`, 'green');
}

function info(message: string) {
  log(`ℹ️  ${message}`, 'cyan');
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

/**
 * Generate or regenerate spec for a task
 */
function generateSpec(taskId: string, overwrite: boolean = false): void {
  const store = readJson<TaskStore>(PATHS.tasks, {
    version: '1.0',
    tasks: [],
    completed_count: 0,
    last_updated: new Date().toISOString()
  });

  const task = store.tasks.find(t => t.id === taskId);
  if (!task) {
    error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  const result = ensureTaskSpecFile(task, { overwrite });
  
  if (result.created || overwrite) {
    // Update task with spec_file reference if not already set
    if (!task.spec_file) {
      task.spec_file = result.spec_file;
      task.updated_at = new Date().toISOString();
      store.last_updated = new Date().toISOString();
      writeJson(PATHS.tasks, store);
    }
    
    success(`${overwrite ? 'Regenerated' : 'Generated'} spec: ${result.spec_file}`);
    info(`View with: bun tools/spec-cli.ts view ${taskId}`);
  } else {
    info(`Spec already exists: ${result.spec_file}`);
    info(`Use --force to regenerate`);
  }
}

/**
 * View spec file for a task
 */
function viewSpec(taskId: string): void {
  const store = readJson<TaskStore>(PATHS.tasks, {
    version: '1.0',
    tasks: [],
    completed_count: 0,
    last_updated: new Date().toISOString()
  });

  const task = store.tasks.find(t => t.id === taskId);
  if (!task) {
    error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  const specPath = task.spec_file || getSpecRelativePath(task.id, task.title);
  const content = readSpecFile(specPath);
  
  if (!content) {
    error(`Spec file not found: ${specPath}`);
    info(`Generate with: bun tools/spec-cli.ts generate ${taskId}`);
    process.exit(1);
  }

  log('\n' + '='.repeat(80), 'dim');
  log(`Spec: ${specPath}`, 'bright');
  log('='.repeat(80) + '\n', 'dim');
  console.log(content);
  log('\n' + '='.repeat(80) + '\n', 'dim');
}

/**
 * Sync spec to GitHub issue (update issue body)
 */
async function syncSpec(taskId: string): Promise<void> {
  const store = readJson<TaskStore>(PATHS.tasks, {
    version: '1.0',
    tasks: [],
    completed_count: 0,
    last_updated: new Date().toISOString()
  });

  const task = store.tasks.find(t => t.id === taskId);
  if (!task) {
    error(`Task not found: ${taskId}`);
    process.exit(1);
  }

  if (!task.github_issue_number) {
    error(`Task has no GitHub issue. Create one first.`);
    info(`Use: bun tools/task-manager.ts gh:issue ${taskId}`);
    process.exit(1);
  }

  const specPath = task.spec_file || getSpecRelativePath(task.id, task.title);
  const content = readSpecFile(specPath);
  
  if (!content) {
    error(`Spec file not found: ${specPath}`);
    info(`Generate with: bun tools/spec-cli.ts generate ${taskId}`);
    process.exit(1);
  }

  // Update GitHub issue body with spec content
  info(`Updating GitHub issue #${task.github_issue_number}...`);
  
  const result = await runCommand('gh', [
    'issue', 'edit', task.github_issue_number.toString(),
    '--body', content
  ]);

  if (!result.success) {
    error(`Failed to update issue: ${result.stderr}`);
    process.exit(1);
  }

  success(`Synced spec to GitHub issue #${task.github_issue_number}`);
  if (task.github_issue_url) {
    info(`View: ${task.github_issue_url}`);
  }
}

/**
 * List all spec files
 */
function listSpecs(): void {
  const specsDir = ensureSpecsDir();
  const files = readdirSync(specsDir)
    .filter(f => f.startsWith('task_') && f.endsWith('.md') && f !== 'README.md')
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    info('No spec files found.');
    info('Generate specs with: bun tools/spec-cli.ts backfill');
    return;
  }

  log(`\n📋 Spec Files (${files.length} total)\n`, 'bright');
  
  const store = readJson<TaskStore>(PATHS.tasks, {
    version: '1.0',
    tasks: [],
    completed_count: 0,
    last_updated: new Date().toISOString()
  });

  for (const file of files) {
    const relPath = `docs/specs/${file}`;
    const absPath = join(specsDir, file);
    
    // Try to find matching task
    const task = store.tasks.find(t => t.spec_file === relPath);
    
    if (task) {
      const statusColor = task.status === 'completed' ? 'green' : 
                         task.status === 'in_progress' ? 'yellow' : 'cyan';
      log(`  ${file}`, statusColor);
      log(`    Task: ${task.title}`, 'dim');
      log(`    Status: ${task.status} | Priority: ${task.priority}`, 'dim');
      if (task.github_issue_number) {
        log(`    GitHub: #${task.github_issue_number}`, 'dim');
      }
    } else {
      log(`  ${file}`, 'dim');
      log(`    (orphaned - no matching task)`, 'dim');
    }
  }
  
  console.log('');
}

/**
 * Backfill specs for all tasks without them
 */
function backfillSpecs(): void {
  const store = readJson<TaskStore>(PATHS.tasks, {
    version: '1.0',
    tasks: [],
    completed_count: 0,
    last_updated: new Date().toISOString()
  });

  if (store.tasks.length === 0) {
    info('No tasks found.');
    return;
  }

  let generated = 0;
  let skipped = 0;

  log('\n🔄 Backfilling specs for all tasks...\n', 'bright');

  for (const task of store.tasks) {
    const result = ensureTaskSpecFile(task);
    
    if (result.created) {
      // Update task with spec_file reference
      if (!task.spec_file) {
        task.spec_file = result.spec_file;
        task.updated_at = new Date().toISOString();
      }
      success(`Generated: ${result.spec_file}`);
      generated++;
    } else {
      log(`Skipped: ${result.spec_file} (already exists)`, 'dim');
      skipped++;
    }
  }

  // Save updated task store
  if (generated > 0) {
    store.last_updated = new Date().toISOString();
    writeJson(PATHS.tasks, store);
  }

  // Update specs index
  updateSpecsIndex();

  log('');
  success(`Backfill complete: ${generated} generated, ${skipped} skipped`);
  info(`Total tasks: ${store.tasks.length}`);
}

/**
 * Show help
 */
function showHelp(): void {
  console.log(`
Spec CLI - Manage task specification files

Usage: bun tools/spec-cli.ts <command> [args]

Commands:
  generate <task_id> [--force]  Generate or regenerate spec for a task
  view <task_id>                View spec file for a task
  sync <task_id>                Sync spec to GitHub issue (update issue body)
  list                          List all spec files
  backfill                      Generate specs for all tasks without them
  help                          Show this help message

Examples:
  bun tools/spec-cli.ts generate task_1767520578520_78t9d5
  bun tools/spec-cli.ts view task_1767520578520_78t9d5
  bun tools/spec-cli.ts sync task_1767520578520_78t9d5
  bun tools/spec-cli.ts list
  bun tools/spec-cli.ts backfill
`);
}

// ============================================================================
// Main CLI
// ============================================================================

const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case 'generate':
  case 'gen':
    if (args.length === 0) {
      error('Missing task ID');
      info('Usage: bun tools/spec-cli.ts generate <task_id> [--force]');
      process.exit(1);
    }
    generateSpec(args[0], args.includes('--force'));
    break;

  case 'view':
    if (args.length === 0) {
      error('Missing task ID');
      info('Usage: bun tools/spec-cli.ts view <task_id>');
      process.exit(1);
    }
    viewSpec(args[0]);
    break;

  case 'sync':
    if (args.length === 0) {
      error('Missing task ID');
      info('Usage: bun tools/spec-cli.ts sync <task_id>');
      process.exit(1);
    }
    await syncSpec(args[0]);
    break;

  case 'list':
  case 'ls':
    listSpecs();
    break;

  case 'backfill':
    backfillSpecs();
    break;

  case 'help':
  case '--help':
  case '-h':
  default:
    showHelp();
    if (command && command !== 'help' && command !== '--help' && command !== '-h') {
      error(`Unknown command: ${command}`);
      process.exit(1);
    }
}
