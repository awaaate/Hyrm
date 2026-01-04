/**
 * Spec Generator
 *
 * Creates and maintains per-task spec markdown files in docs/specs/.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Task } from "../shared/types";
import { slugify } from "../shared/string-utils";
import { WORKSPACE_DIR } from "../shared/paths";

export const SPECS_DIR_REL = "docs/specs";

export interface GitHubIssueRef {
  number: number;
  url?: string;
}

export function ensureSpecsDir(): string {
  const abs = join(WORKSPACE_DIR, SPECS_DIR_REL);
  if (!existsSync(abs)) {
    mkdirSync(abs, { recursive: true });
  }
  return abs;
}

export function getTaskNumericId(taskId: string): string {
  const parts = taskId.split("_");
  // task_<timestamp>_<rand>
  return parts.length >= 2 ? parts[1] : taskId;
}

export function getSpecRelativePath(taskId: string, title: string): string {
  const numeric = getTaskNumericId(taskId);
  const slug = slugify(title).slice(0, 30) || "task";
  return `${SPECS_DIR_REL}/task_${numeric}_${slug}.md`;
}

export function getSpecAbsolutePath(specRelativePath: string): string {
  return join(WORKSPACE_DIR, specRelativePath);
}

export function generateSpecMarkdown(options: {
  task: Task;
  githubIssue?: GitHubIssueRef;
  branch?: string;
  now?: Date;
}): string {
  const { task, githubIssue, branch, now = new Date() } = options;

  const issueText = githubIssue
    ? githubIssue.url
      ? `[#${githubIssue.number}](${githubIssue.url})`
      : `#${githubIssue.number}`
    : "pending";

  const branchText = branch || task.github_branch || "not created";

  const estimated = task.estimated_hours ? String(task.estimated_hours) : "TBD";
  const assigned = task.assigned_to || "unassigned";

  const problem = task.description?.trim() ? task.description.trim() : "TODO: Add problem statement";

  return `# Task: ${task.title}

**Task ID**: \`${task.id}\`  
**Priority**: ${task.priority}  
**Status**: ${task.status}  
**GitHub Issue**: ${issueText}  
**Branch**: \`${branchText}\`  
**Estimated Time**: ${estimated}  
**Assigned To**: ${assigned}

---

## Problem Statement

${problem}

## Goals

- TODO: Define goals

---

## Implementation Plan

- TODO: Add implementation phases

---

## Technical Details

- TODO: Add technical notes

---

## Success Criteria

- [ ] TODO: Define success criteria

---

## Notes

- TODO: Add links and context

---

## History

| Date | Event |
|------|-------|
| ${task.created_at || now.toISOString()} | Task created |
| ${now.toISOString()} | Spec generated |
`;
}

export function upsertGitHubIssueLine(specMarkdown: string, issue: GitHubIssueRef): string {
  const issueText = issue.url ? `[#${issue.number}](${issue.url})` : `#${issue.number}`;
  const newLine = `**GitHub Issue**: ${issueText}`;

  const lines = specMarkdown.split("\n");
  const idx = lines.findIndex((l) => l.trim().startsWith("**GitHub Issue**:"));

  if (idx !== -1) {
    lines[idx] = newLine;
    return lines.join("\n");
  }

  // Insert after Status line if present, otherwise near top.
  const statusIdx = lines.findIndex((l) => l.trim().startsWith("**Status**:"));
  const insertAt = statusIdx !== -1 ? statusIdx + 1 : 4;
  lines.splice(insertAt, 0, newLine + "  ");
  return lines.join("\n");
}

export function writeSpecFile(specRelativePath: string, content: string): void {
  ensureSpecsDir();
  const abs = getSpecAbsolutePath(specRelativePath);
  writeFileSync(abs, content);
}

export function readSpecFile(specRelativePath: string): string | null {
  const abs = getSpecAbsolutePath(specRelativePath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs, "utf-8");
}

export function ensureTaskSpecFile(task: Task, options?: { overwrite?: boolean }): {
  spec_file: string;
  content: string;
  created: boolean;
} {
  const specRel = task.spec_file || getSpecRelativePath(task.id, task.title);
  const existing = readSpecFile(specRel);
  if (existing && !options?.overwrite) {
    return { spec_file: specRel, content: existing, created: false };
  }

  const content = generateSpecMarkdown({
    task,
    githubIssue:
      task.github_issue_number && task.github_issue_url
        ? { number: task.github_issue_number, url: task.github_issue_url }
        : task.github_issue_number
          ? { number: task.github_issue_number }
          : undefined,
    branch: task.github_branch,
  });

  writeSpecFile(specRel, content);
  updateSpecsIndex();
  return { spec_file: specRel, content, created: true };
}

export function updateSpecsIndex(): void {
  const specsDir = ensureSpecsDir();
  const files = readdirSync(specsDir)
    .filter((f) => f.startsWith("task_") && f.endsWith(".md"))
    .sort((a, b) => a.localeCompare(b));

  const relPaths = files.map((f) => `${SPECS_DIR_REL}/${f}`);
  const lines: string[] = [];
  lines.push("# Task Specs");
  lines.push("");
  lines.push("Auto-generated index of task specs in `docs/specs/`.");
  lines.push("");

  for (const rel of relPaths) {
    lines.push(`- [${rel}](${rel})`);
  }

  lines.push("");
  writeFileSync(join(specsDir, "README.md"), lines.join("\n"));
}
