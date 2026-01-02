#!/usr/bin/env bun
/**
 * Git Integration Tool for Multi-Agent System
 * 
 * Provides git-aware functionality for agents:
 * - Track code changes made by agents
 * - Show git status and diffs
 * - Auto-commit completed tasks with metadata
 * - Branch management for parallel work
 * - Search commit history
 * 
 * Commands:
 *   status              Show git status (staged, modified, untracked)
 *   diff [file]         Show current changes
 *   log [n]             Show recent commits (default: 10)
 *   branches            List and show current branch
 *   commit <msg>        Create a commit with agent metadata
 *   auto-commit <task>  Auto-commit for a completed task
 *   search <query>      Search commit history for query
 *   changes [since]     Show changes since commit/date
 *   agent-commits       Show commits made by agents
 *   stash               Stash current changes
 *   stash-pop           Pop stashed changes
 */

import { spawnSync } from "child_process";
import { existsSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";
import { c } from './shared/colors';
import { truncate } from './shared/string-utils';
import { MEMORY_DIR } from './shared/paths';

const GIT_LOG_PATH = join(MEMORY_DIR, "git-activity.jsonl");

interface GitActivity {
  timestamp: string;
  action: string;
  agent_id?: string;
  task_id?: string;
  commit_hash?: string;
  message?: string;
  files_changed?: number;
  insertions?: number;
  deletions?: number;
}

// Helper to run git commands
function git(args: string[], silent: boolean = false): { stdout: string; stderr: string; success: boolean } {
  try {
    const result = spawnSync("git", args, {
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    return {
      stdout: result.stdout?.trim() || "",
      stderr: result.stderr?.trim() || "",
      success: result.status === 0,
    };
  } catch (error) {
    return {
      stdout: "",
      stderr: String(error),
      success: false,
    };
  }
}

function logActivity(activity: GitActivity): void {
  try {
    appendFileSync(GIT_LOG_PATH, JSON.stringify(activity) + "\n");
  } catch {}
}

// Commands

function showStatus(): void {
  console.log(`\n${c.bgBlue}${c.white}${c.bright}  GIT STATUS  ${c.reset}\n`);
  
  // Get current branch
  const branch = git(["branch", "--show-current"]);
  console.log(`${c.cyan}Branch:${c.reset} ${c.bright}${branch.stdout || "detached HEAD"}${c.reset}`);
  
  // Get status
  const status = git(["status", "--porcelain"]);
  if (!status.success) {
    console.log(`${c.red}Error: Not a git repository${c.reset}`);
    return;
  }
  
  if (!status.stdout) {
    console.log(`${c.green}Working tree clean${c.reset}`);
  } else {
    const lines = status.stdout.split("\n");
    
    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];
    
    for (const line of lines) {
      const status = line.slice(0, 2);
      const file = line.slice(3);
      
      if (status[0] !== " " && status[0] !== "?") {
        staged.push({ status: status[0], file } as any);
      }
      if (status[1] === "M" || status[1] === "D") {
        modified.push({ status: status[1], file } as any);
      }
      if (status[0] === "?") {
        untracked.push(file);
      }
    }
    
    if (staged.length > 0) {
      console.log(`\n${c.green}Staged:${c.reset}`);
      for (const f of staged.slice(0, 10) as any[]) {
        console.log(`  ${c.green}${f.status}${c.reset} ${f.file}`);
      }
      if (staged.length > 10) {
        console.log(`  ${c.dim}...and ${staged.length - 10} more${c.reset}`);
      }
    }
    
    if (modified.length > 0) {
      console.log(`\n${c.yellow}Modified:${c.reset}`);
      for (const f of modified.slice(0, 10) as any[]) {
        console.log(`  ${c.yellow}${f.status}${c.reset} ${f.file}`);
      }
      if (modified.length > 10) {
        console.log(`  ${c.dim}...and ${modified.length - 10} more${c.reset}`);
      }
    }
    
    if (untracked.length > 0) {
      console.log(`\n${c.red}Untracked:${c.reset}`);
      for (const f of untracked.slice(0, 10)) {
        console.log(`  ${c.red}?${c.reset} ${f}`);
      }
      if (untracked.length > 10) {
        console.log(`  ${c.dim}...and ${untracked.length - 10} more${c.reset}`);
      }
    }
  }
  
  // Get ahead/behind
  const tracking = git(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]);
  if (tracking.success && tracking.stdout) {
    const [ahead, behind] = tracking.stdout.split("\t").map(Number);
    if (ahead > 0) {
      console.log(`\n${c.cyan}Ahead of remote:${c.reset} ${ahead} commit(s)`);
    }
    if (behind > 0) {
      console.log(`${c.yellow}Behind remote:${c.reset} ${behind} commit(s)`);
    }
  }
  
  console.log();
}

function showDiff(file?: string): void {
  console.log(`\n${c.bright}${c.cyan}GIT DIFF${c.reset}${file ? ` - ${file}` : ""}\n`);
  
  const args = ["diff", "--stat"];
  if (file) args.push(file);
  
  const stat = git(args);
  
  if (!stat.stdout) {
    console.log(`${c.dim}No changes${c.reset}`);
    return;
  }
  
  // Show stat summary
  console.log(stat.stdout);
  
  // Show actual diff if not too large
  const diffArgs = ["diff", "--no-color"];
  if (file) diffArgs.push(file);
  
  const diff = git(diffArgs);
  if (diff.stdout) {
    const lines = diff.stdout.split("\n");
    if (lines.length > 50) {
      console.log(`\n${c.dim}(diff truncated to 50 lines)${c.reset}\n`);
      for (const line of lines.slice(0, 50)) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          console.log(`${c.green}${line}${c.reset}`);
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          console.log(`${c.red}${line}${c.reset}`);
        } else if (line.startsWith("@@")) {
          console.log(`${c.cyan}${line}${c.reset}`);
        } else {
          console.log(line);
        }
      }
      console.log(`${c.dim}...${lines.length - 50} more lines${c.reset}`);
    } else {
      for (const line of lines) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          console.log(`${c.green}${line}${c.reset}`);
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          console.log(`${c.red}${line}${c.reset}`);
        } else if (line.startsWith("@@")) {
          console.log(`${c.cyan}${line}${c.reset}`);
        } else {
          console.log(line);
        }
      }
    }
  }
  
  console.log();
}

function showLog(count: number = 10): void {
  console.log(`\n${c.bright}${c.magenta}RECENT COMMITS${c.reset} ${c.dim}(last ${count})${c.reset}\n`);
  
  const format = "%h|%an|%ar|%s";
  const log = git(["log", `-${count}`, `--format=${format}`]);
  
  if (!log.success || !log.stdout) {
    console.log(`${c.dim}No commits found${c.reset}`);
    return;
  }
  
  for (const line of log.stdout.split("\n")) {
    const [hash, author, date, message] = line.split("|");
    const isAgent = author?.includes("agent") || message?.includes("[agent]");
    const hashColor = isAgent ? c.green : c.yellow;
    
    console.log(
      `${hashColor}${hash}${c.reset} ` +
      `${c.dim}${date}${c.reset} ` +
      `${c.bright}${truncate(message || "", 50)}${c.reset}`
    );
    console.log(`  ${c.dim}by ${author}${c.reset}`);
  }
  
  console.log();
}

function showBranches(): void {
  console.log(`\n${c.bright}${c.cyan}BRANCHES${c.reset}\n`);
  
  const branches = git(["branch", "-v"]);
  
  if (!branches.success || !branches.stdout) {
    console.log(`${c.dim}No branches found${c.reset}`);
    return;
  }
  
  for (const line of branches.stdout.split("\n")) {
    if (line.startsWith("*")) {
      console.log(`${c.green}${line}${c.reset}`);
    } else {
      console.log(line);
    }
  }
  
  console.log();
}

function createCommit(message: string, agentId?: string, taskId?: string): void {
  // Add all changes
  const add = git(["add", "-A"]);
  if (!add.success) {
    console.log(`${c.red}Error staging changes: ${add.stderr}${c.reset}`);
    return;
  }
  
  // Check if there are changes to commit
  const status = git(["status", "--porcelain"]);
  if (!status.stdout) {
    console.log(`${c.yellow}No changes to commit${c.reset}`);
    return;
  }
  
  // Build commit message with metadata
  let fullMessage = message;
  if (agentId || taskId) {
    fullMessage += "\n\n";
    if (agentId) fullMessage += `Agent: ${agentId}\n`;
    if (taskId) fullMessage += `Task: ${taskId}\n`;
    fullMessage += `Timestamp: ${new Date().toISOString()}`;
  }
  
  // Create commit
  const commit = git(["commit", "-m", fullMessage]);
  
  if (!commit.success) {
    console.log(`${c.red}Error creating commit: ${commit.stderr}${c.reset}`);
    return;
  }
  
  // Get commit info
  const hash = git(["rev-parse", "--short", "HEAD"]).stdout;
  const stat = git(["diff", "--shortstat", "HEAD~1..HEAD"]);
  
  // Parse stats
  let filesChanged = 0, insertions = 0, deletions = 0;
  const statMatch = stat.stdout.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
  if (statMatch) {
    filesChanged = parseInt(statMatch[1]) || 0;
    insertions = parseInt(statMatch[2]) || 0;
    deletions = parseInt(statMatch[3]) || 0;
  }
  
  // Log activity
  logActivity({
    timestamp: new Date().toISOString(),
    action: "commit",
    agent_id: agentId,
    task_id: taskId,
    commit_hash: hash,
    message: message,
    files_changed: filesChanged,
    insertions,
    deletions,
  });
  
  console.log(`\n${c.green}✓ Commit created!${c.reset}`);
  console.log(`${c.cyan}Hash:${c.reset} ${hash}`);
  console.log(`${c.cyan}Message:${c.reset} ${message}`);
  if (filesChanged > 0) {
    console.log(`${c.cyan}Changes:${c.reset} ${filesChanged} file(s), +${insertions} -${deletions}`);
  }
  console.log();
}

function autoCommitTask(taskId: string): void {
  // Load task info from tasks.json
  const tasksPath = join(MEMORY_DIR, "tasks.json");
  let task: any = null;
  
  if (existsSync(tasksPath)) {
    try {
      const store = JSON.parse(readFileSync(tasksPath, "utf-8"));
      task = store.tasks.find((t: any) => t.id === taskId);
    } catch {}
  }
  
  if (!task) {
    console.log(`${c.yellow}Warning: Task ${taskId} not found, using generic message${c.reset}`);
  }
  
  // Build commit message
  const title = task?.title || "Complete task";
  const priority = task?.priority || "medium";
  const assignee = task?.assigned_to;
  
  const message = `[${priority.toUpperCase()}] ${title}`;
  
  createCommit(message, assignee, taskId);
}

function searchCommits(query: string): void {
  console.log(`\n${c.bright}${c.cyan}SEARCH RESULTS${c.reset} for "${query}"\n`);
  
  // Search in commit messages
  const messageSearch = git(["log", "--oneline", "--grep", query, "-n", "20"]);
  
  // Search in file changes
  const fileSearch = git(["log", "--oneline", "-S", query, "-n", "10"]);
  
  let found = false;
  
  if (messageSearch.stdout) {
    console.log(`${c.bright}In commit messages:${c.reset}`);
    for (const line of messageSearch.stdout.split("\n").slice(0, 10)) {
      const [hash, ...rest] = line.split(" ");
      console.log(`  ${c.yellow}${hash}${c.reset} ${rest.join(" ")}`);
    }
    found = true;
  }
  
  if (fileSearch.stdout) {
    console.log(`\n${c.bright}In file changes:${c.reset}`);
    for (const line of fileSearch.stdout.split("\n").slice(0, 10)) {
      const [hash, ...rest] = line.split(" ");
      console.log(`  ${c.green}${hash}${c.reset} ${rest.join(" ")}`);
    }
    found = true;
  }
  
  if (!found) {
    console.log(`${c.dim}No results found${c.reset}`);
  }
  
  console.log();
}

function showChanges(since?: string): void {
  const ref = since || "HEAD~5";
  console.log(`\n${c.bright}${c.cyan}CHANGES${c.reset} since ${ref}\n`);
  
  const log = git(["log", "--oneline", `${ref}..HEAD`]);
  
  if (!log.stdout) {
    console.log(`${c.dim}No changes since ${ref}${c.reset}`);
    return;
  }
  
  console.log(`${c.bright}Commits:${c.reset}`);
  for (const line of log.stdout.split("\n")) {
    const [hash, ...rest] = line.split(" ");
    console.log(`  ${c.yellow}${hash}${c.reset} ${rest.join(" ")}`);
  }
  
  // Show stat
  const stat = git(["diff", "--stat", ref]);
  if (stat.stdout) {
    console.log(`\n${c.bright}Files changed:${c.reset}`);
    console.log(stat.stdout);
  }
  
  console.log();
}

function showAgentCommits(): void {
  console.log(`\n${c.bright}${c.green}AGENT COMMITS${c.reset}\n`);
  
  // Read git activity log
  if (!existsSync(GIT_LOG_PATH)) {
    console.log(`${c.dim}No agent commits recorded yet${c.reset}`);
    return;
  }
  
  try {
    const lines = readFileSync(GIT_LOG_PATH, "utf-8").trim().split("\n");
    const activities: GitActivity[] = lines.filter(Boolean).map(l => JSON.parse(l));
    
    const commits = activities.filter(a => a.action === "commit").slice(-20).reverse();
    
    if (commits.length === 0) {
      console.log(`${c.dim}No agent commits recorded${c.reset}`);
      return;
    }
    
    for (const commit of commits) {
      const date = new Date(commit.timestamp).toLocaleString();
      console.log(
        `${c.green}${commit.commit_hash || "?"}${c.reset} ` +
        `${c.dim}${date}${c.reset}`
      );
      console.log(`  ${c.bright}${commit.message}${c.reset}`);
      if (commit.agent_id) {
        console.log(`  ${c.dim}Agent: ${commit.agent_id}${c.reset}`);
      }
      if (commit.task_id) {
        console.log(`  ${c.dim}Task: ${commit.task_id}${c.reset}`);
      }
      if (commit.files_changed) {
        console.log(`  ${c.dim}${commit.files_changed} files, +${commit.insertions} -${commit.deletions}${c.reset}`);
      }
      console.log();
    }
  } catch (error) {
    console.log(`${c.red}Error reading git activity log${c.reset}`);
  }
}

function stash(): void {
  const result = git(["stash", "push", "-m", `agent-stash-${Date.now()}`]);
  
  if (!result.success) {
    console.log(`${c.red}Error stashing changes: ${result.stderr}${c.reset}`);
    return;
  }
  
  if (result.stdout.includes("No local changes")) {
    console.log(`${c.yellow}No changes to stash${c.reset}`);
    return;
  }
  
  console.log(`${c.green}✓ Changes stashed${c.reset}`);
  
  logActivity({
    timestamp: new Date().toISOString(),
    action: "stash",
  });
}

function stashPop(): void {
  const result = git(["stash", "pop"]);
  
  if (!result.success) {
    console.log(`${c.red}Error popping stash: ${result.stderr}${c.reset}`);
    return;
  }
  
  console.log(`${c.green}✓ Stash applied${c.reset}`);
  
  logActivity({
    timestamp: new Date().toISOString(),
    action: "stash-pop",
  });
}

function showSummary(): void {
  console.log(`\n${c.bgBlue}${c.white}${c.bright}  GIT INTEGRATION SUMMARY  ${c.reset}\n`);
  
  // Get current branch
  const branch = git(["branch", "--show-current"]);
  console.log(`${c.cyan}Current Branch:${c.reset} ${c.bright}${branch.stdout || "detached"}${c.reset}`);
  
  // Get status counts
  const status = git(["status", "--porcelain"]);
  if (status.stdout) {
    const lines = status.stdout.split("\n");
    const staged = lines.filter(l => l[0] !== " " && l[0] !== "?").length;
    const modified = lines.filter(l => l[1] === "M" || l[1] === "D").length;
    const untracked = lines.filter(l => l[0] === "?").length;
    
    console.log(`${c.cyan}Working Tree:${c.reset} ${staged} staged, ${modified} modified, ${untracked} untracked`);
  } else {
    console.log(`${c.cyan}Working Tree:${c.reset} ${c.green}clean${c.reset}`);
  }
  
  // Get recent commit
  const lastCommit = git(["log", "-1", "--format=%h %s"]);
  if (lastCommit.stdout) {
    console.log(`${c.cyan}Last Commit:${c.reset} ${lastCommit.stdout}`);
  }
  
  // Get agent commit count
  if (existsSync(GIT_LOG_PATH)) {
    try {
      const lines = readFileSync(GIT_LOG_PATH, "utf-8").trim().split("\n");
      const commits = lines.filter(Boolean).filter(l => JSON.parse(l).action === "commit").length;
      console.log(`${c.cyan}Agent Commits:${c.reset} ${commits} recorded`);
    } catch {}
  }
  
  console.log();
}

function showHelp(): void {
  console.log(`
${c.bgBlue}${c.white}${c.bright}  GIT INTEGRATION  ${c.reset}

${c.cyan}Usage:${c.reset}
  bun tools/git-integration.ts <command> [args]

${c.cyan}View Commands:${c.reset}
  ${c.bright}status${c.reset}              Show git status (staged, modified, untracked)
  ${c.bright}diff${c.reset} [file]         Show current changes
  ${c.bright}log${c.reset} [n]             Show recent commits (default: 10)
  ${c.bright}branches${c.reset}            List branches with current highlighted
  ${c.bright}changes${c.reset} [since]     Show changes since commit/ref (default: HEAD~5)
  ${c.bright}agent-commits${c.reset}       Show commits made by agents
  ${c.bright}summary${c.reset}             Show git integration summary

${c.cyan}Action Commands:${c.reset}
  ${c.bright}commit${c.reset} <msg>        Create commit with agent metadata
  ${c.bright}auto-commit${c.reset} <task>  Auto-commit for completed task
  ${c.bright}search${c.reset} <query>      Search commit history
  ${c.bright}stash${c.reset}               Stash current changes
  ${c.bright}stash-pop${c.reset}           Pop stashed changes

${c.cyan}Environment:${c.reset}
  GIT_AGENT_ID       Agent ID to include in commits
  GIT_TASK_ID        Task ID to include in commits

${c.cyan}Examples:${c.reset}
  bun tools/git-integration.ts status
  bun tools/git-integration.ts commit "Add new feature"
  bun tools/git-integration.ts auto-commit task_123
  bun tools/git-integration.ts search "fix bug"
  bun tools/git-integration.ts changes yesterday

${c.dim}Activity logged to: ${GIT_LOG_PATH}${c.reset}
`);
}

// CLI routing
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "status":
    showStatus();
    break;
    
  case "diff":
    showDiff(args[1]);
    break;
    
  case "log":
    showLog(parseInt(args[1]) || 10);
    break;
    
  case "branches":
  case "branch":
    showBranches();
    break;
    
  case "commit":
    const message = args.slice(1).join(" ");
    if (!message) {
      console.log(`${c.red}Error: Commit message required${c.reset}`);
      console.log(`Usage: bun tools/git-integration.ts commit "Your message"`);
      process.exit(1);
    }
    createCommit(message, process.env.GIT_AGENT_ID, process.env.GIT_TASK_ID);
    break;
    
  case "auto-commit":
    if (!args[1]) {
      console.log(`${c.red}Error: Task ID required${c.reset}`);
      console.log(`Usage: bun tools/git-integration.ts auto-commit <task_id>`);
      process.exit(1);
    }
    autoCommitTask(args[1]);
    break;
    
  case "search":
    if (!args[1]) {
      console.log(`${c.red}Error: Search query required${c.reset}`);
      console.log(`Usage: bun tools/git-integration.ts search <query>`);
      process.exit(1);
    }
    searchCommits(args.slice(1).join(" "));
    break;
    
  case "changes":
    showChanges(args[1]);
    break;
    
  case "agent-commits":
  case "agent":
    showAgentCommits();
    break;
    
  case "stash":
    stash();
    break;
    
  case "stash-pop":
  case "pop":
    stashPop();
    break;
    
  case "summary":
    showSummary();
    break;
    
  case "help":
  case "--help":
  case "-h":
    showHelp();
    break;
    
  case undefined:
    showStatus();
    break;
    
  default:
    console.log(`${c.red}Unknown command: ${command}${c.reset}`);
    showHelp();
    process.exit(1);
}
