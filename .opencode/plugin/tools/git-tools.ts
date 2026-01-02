/**
 * Git Integration Tools
 * 
 * Provides git-aware functionality for agents:
 * - git_status: Show repository status
 * - git_log: View recent commits
 * - git_diff: Show changes
 * - git_commit: Create commits with agent metadata
 * - git_search: Search commit history
 */

import { tool } from "@opencode-ai/plugin";
import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, appendFileSync } from "fs";
import { join } from "path";

export interface GitToolsContext {
  memoryDir: string;
  agentId?: string;
  currentSessionId: string | null;
  log: (level: "INFO" | "WARN" | "ERROR", message: string, data?: any) => void;
}

// Helper to run git commands safely
function runGit(args: string[], cwd: string): { stdout: string; stderr: string; success: boolean } {
  try {
    const result = spawnSync("git", args, {
      encoding: "utf-8",
      cwd,
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

function logGitActivity(memoryDir: string, activity: GitActivity): void {
  try {
    const logPath = join(memoryDir, "git-activity.jsonl");
    appendFileSync(logPath, JSON.stringify(activity) + "\n");
  } catch {}
}

export function createGitTools(getContext: () => GitToolsContext) {
  const getCwd = () => process.cwd();

  return {
    git_status: tool({
      description: "Show current git repository status including staged, modified, and untracked files. Also shows branch info and ahead/behind status.",
      args: {},
      async execute() {
        try {
          const cwd = getCwd();
          
          // Check if git repo
          const isRepo = runGit(["rev-parse", "--git-dir"], cwd);
          if (!isRepo.success) {
            return JSON.stringify({
              success: false,
              error: "Not a git repository",
            });
          }
          
          // Get branch
          const branch = runGit(["branch", "--show-current"], cwd);
          
          // Get status
          const status = runGit(["status", "--porcelain"], cwd);
          
          // Parse status
          const staged: { status: string; file: string }[] = [];
          const modified: { status: string; file: string }[] = [];
          const untracked: string[] = [];
          
          if (status.stdout) {
            for (const line of status.stdout.split("\n")) {
              const st = line.slice(0, 2);
              const file = line.slice(3);
              
              if (st[0] !== " " && st[0] !== "?") {
                staged.push({ status: st[0], file });
              }
              if (st[1] === "M" || st[1] === "D") {
                modified.push({ status: st[1], file });
              }
              if (st[0] === "?") {
                untracked.push(file);
              }
            }
          }
          
          // Get ahead/behind
          const tracking = runGit(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], cwd);
          let ahead = 0, behind = 0;
          if (tracking.success && tracking.stdout) {
            const parts = tracking.stdout.split("\t").map(Number);
            ahead = parts[0] || 0;
            behind = parts[1] || 0;
          }
          
          // Get last commit
          const lastCommit = runGit(["log", "-1", "--format=%h %s"], cwd);
          
          return JSON.stringify({
            success: true,
            branch: branch.stdout || "detached",
            clean: staged.length === 0 && modified.length === 0 && untracked.length === 0,
            staged: staged.slice(0, 20),
            modified: modified.slice(0, 20),
            untracked: untracked.slice(0, 20),
            staged_count: staged.length,
            modified_count: modified.length,
            untracked_count: untracked.length,
            ahead,
            behind,
            last_commit: lastCommit.stdout || null,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    git_log: tool({
      description: "Show recent git commit history with hash, author, date, and message.",
      args: {
        count: tool.schema
          .number()
          .describe("Number of commits to show (default: 10, max: 50)")
          .optional(),
        author: tool.schema
          .string()
          .describe("Filter by author name (optional)")
          .optional(),
      },
      async execute({ count = 10, author }) {
        try {
          const cwd = getCwd();
          const limit = Math.min(count, 50);
          
          const args = ["log", `-${limit}`, "--format=%h|%an|%ar|%s"];
          if (author) {
            args.push(`--author=${author}`);
          }
          
          const log = runGit(args, cwd);
          
          if (!log.success) {
            return JSON.stringify({
              success: false,
              error: log.stderr || "Failed to get git log",
            });
          }
          
          if (!log.stdout) {
            return JSON.stringify({
              success: true,
              commits: [],
              message: "No commits found",
            });
          }
          
          const commits = log.stdout.split("\n").map(line => {
            const [hash, author, date, message] = line.split("|");
            return { hash, author, date, message };
          });
          
          return JSON.stringify({
            success: true,
            count: commits.length,
            commits,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    git_diff: tool({
      description: "Show git diff for current changes. Can show diff for specific file or all changes.",
      args: {
        file: tool.schema
          .string()
          .describe("Specific file to diff (optional, defaults to all changes)")
          .optional(),
        staged: tool.schema
          .boolean()
          .describe("Show staged changes instead of unstaged (default: false)")
          .optional(),
      },
      async execute({ file, staged = false }) {
        try {
          const cwd = getCwd();
          
          const args = ["diff"];
          if (staged) args.push("--staged");
          args.push("--stat");
          if (file) args.push(file);
          
          const stat = runGit(args, cwd);
          
          if (!stat.success) {
            return JSON.stringify({
              success: false,
              error: stat.stderr || "Failed to get diff",
            });
          }
          
          // Get actual diff (limited)
          const diffArgs = ["diff"];
          if (staged) diffArgs.push("--staged");
          if (file) diffArgs.push(file);
          
          const diff = runGit(diffArgs, cwd);
          
          // Truncate if too long
          let diffText = diff.stdout;
          const lines = diffText.split("\n");
          const truncated = lines.length > 100;
          if (truncated) {
            diffText = lines.slice(0, 100).join("\n") + `\n... (${lines.length - 100} more lines)`;
          }
          
          // Parse stat for summary
          let filesChanged = 0, insertions = 0, deletions = 0;
          if (stat.stdout) {
            const match = stat.stdout.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
            if (match) {
              filesChanged = parseInt(match[1]) || 0;
              insertions = parseInt(match[2]) || 0;
              deletions = parseInt(match[3]) || 0;
            }
          }
          
          return JSON.stringify({
            success: true,
            file: file || "all",
            staged,
            stat: stat.stdout || "No changes",
            summary: {
              files_changed: filesChanged,
              insertions,
              deletions,
            },
            diff: diffText || "No changes",
            truncated,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    git_commit: tool({
      description: "Create a git commit with all staged/modified files. Includes agent and task metadata for tracking. Can optionally push to remote after committing.",
      args: {
        message: tool.schema
          .string()
          .describe("Commit message describing the changes"),
        task_id: tool.schema
          .string()
          .describe("Task ID associated with this commit (optional)")
          .optional(),
        add_all: tool.schema
          .boolean()
          .describe("Add all changes before committing (default: true)")
          .optional(),
        push: tool.schema
          .boolean()
          .describe("Push to remote after committing (default: true)")
          .optional(),
      },
      async execute({ message, task_id, add_all = true, push = true }) {
        try {
          const ctx = getContext();
          const cwd = getCwd();
          
          // Add changes if requested
          if (add_all) {
            const add = runGit(["add", "-A"], cwd);
            if (!add.success) {
              return JSON.stringify({
                success: false,
                error: `Failed to stage changes: ${add.stderr}`,
              });
            }
          }
          
          // Check if there are changes
          const status = runGit(["status", "--porcelain"], cwd);
          if (!status.stdout) {
            return JSON.stringify({
              success: false,
              error: "No changes to commit",
            });
          }
          
          // Build commit message with metadata
          let fullMessage = message;
          const agentId = ctx.agentId || ctx.currentSessionId;
          if (agentId || task_id) {
            fullMessage += "\n\n";
            if (agentId) fullMessage += `Agent: ${agentId}\n`;
            if (task_id) fullMessage += `Task: ${task_id}\n`;
            fullMessage += `Timestamp: ${new Date().toISOString()}`;
          }
          
          // Create commit
          const commit = runGit(["commit", "-m", fullMessage], cwd);
          
          if (!commit.success) {
            return JSON.stringify({
              success: false,
              error: `Commit failed: ${commit.stderr}`,
            });
          }
          
          // Get commit info
          const hash = runGit(["rev-parse", "--short", "HEAD"], cwd).stdout;
          const stat = runGit(["diff", "--shortstat", "HEAD~1..HEAD"], cwd);
          
          // Parse stats
          let filesChanged = 0, insertions = 0, deletions = 0;
          if (stat.stdout) {
            const match = stat.stdout.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
            if (match) {
              filesChanged = parseInt(match[1]) || 0;
              insertions = parseInt(match[2]) || 0;
              deletions = parseInt(match[3]) || 0;
            }
          }
          
          // Log activity
          logGitActivity(ctx.memoryDir, {
            timestamp: new Date().toISOString(),
            action: "commit",
            agent_id: agentId || undefined,
            task_id,
            commit_hash: hash,
            message,
            files_changed: filesChanged,
            insertions,
            deletions,
          });
          
          ctx.log("INFO", `Git commit created: ${hash}`, { message, task_id });
          
          // Push to remote if requested
          let pushed = false;
          let pushError: string | null = null;
          if (push) {
            const pushResult = runGit(["push"], cwd);
            if (pushResult.success) {
              pushed = true;
              ctx.log("INFO", `Git push successful after commit ${hash}`);
              logGitActivity(ctx.memoryDir, {
                timestamp: new Date().toISOString(),
                action: "push",
                agent_id: agentId || undefined,
                task_id,
                commit_hash: hash,
              });
            } else {
              pushError = pushResult.stderr || "Push failed";
              ctx.log("WARN", `Git push failed: ${pushError}`);
            }
          }
          
          return JSON.stringify({
            success: true,
            commit_hash: hash,
            message,
            files_changed: filesChanged,
            insertions,
            deletions,
            agent_id: agentId,
            task_id,
            pushed,
            push_error: pushError,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    git_search: tool({
      description: "Search git commit history for messages or code changes containing the query.",
      args: {
        query: tool.schema
          .string()
          .describe("Search query to find in commits"),
        search_code: tool.schema
          .boolean()
          .describe("Also search in code changes, not just commit messages (default: false)")
          .optional(),
      },
      async execute({ query, search_code = false }) {
        try {
          const cwd = getCwd();
          
          // Search in commit messages
          const messageSearch = runGit(["log", "--oneline", "--grep", query, "-n", "20"], cwd);
          
          const results: { type: string; hash: string; message: string }[] = [];
          
          if (messageSearch.stdout) {
            for (const line of messageSearch.stdout.split("\n")) {
              const [hash, ...rest] = line.split(" ");
              results.push({
                type: "message",
                hash,
                message: rest.join(" "),
              });
            }
          }
          
          // Search in code changes if requested
          if (search_code) {
            const codeSearch = runGit(["log", "--oneline", "-S", query, "-n", "10"], cwd);
            if (codeSearch.stdout) {
              for (const line of codeSearch.stdout.split("\n")) {
                const [hash, ...rest] = line.split(" ");
                // Avoid duplicates
                if (!results.find(r => r.hash === hash)) {
                  results.push({
                    type: "code",
                    hash,
                    message: rest.join(" "),
                  });
                }
              }
            }
          }
          
          return JSON.stringify({
            success: true,
            query,
            result_count: results.length,
            results: results.slice(0, 20),
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    git_branches: tool({
      description: "List git branches and show current branch. Can also show remote branches.",
      args: {
        include_remote: tool.schema
          .boolean()
          .describe("Include remote branches (default: false)")
          .optional(),
      },
      async execute({ include_remote = false }) {
        try {
          const cwd = getCwd();
          
          const args = ["branch", "-v"];
          if (include_remote) args.push("-a");
          
          const branches = runGit(args, cwd);
          
          if (!branches.success) {
            return JSON.stringify({
              success: false,
              error: branches.stderr || "Failed to list branches",
            });
          }
          
          const current = runGit(["branch", "--show-current"], cwd).stdout;
          
          const branchList = branches.stdout.split("\n")
            .filter(Boolean)
            .map(line => {
              const isCurrent = line.startsWith("*");
              const parts = line.slice(2).trim().split(/\s+/);
              return {
                name: parts[0],
                commit: parts[1],
                is_current: isCurrent,
              };
            });
          
          return JSON.stringify({
            success: true,
            current_branch: current || "detached",
            branch_count: branchList.length,
            branches: branchList,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),
  };
}
