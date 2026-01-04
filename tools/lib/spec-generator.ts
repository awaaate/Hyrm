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

/**
 * Generate meaningful goals from task metadata
 */
function generateGoals(task: Task): string[] {
  const goals: string[] = [];

  // Goal 1: Complete the task per priority
  const priorityGoal = {
    critical: "Resolve critical issue immediately to restore system stability",
    high: "Complete high-priority work to unblock downstream tasks",
    medium: "Implement medium-priority feature to improve system",
    low: "Address technical debt or minor improvement",
  }[task.priority];

  if (priorityGoal) {
    goals.push(priorityGoal);
  }

  // Goal 2: Based on task complexity
  if (task.complexity) {
    const complexityGoal = {
      trivial: "Make quick fix with minimal changes",
      simple: "Implement straightforward change with good test coverage",
      moderate: "Design and implement solution with appropriate abstraction",
      complex: "Design comprehensive solution with proper error handling and documentation",
      epic: "Break into phases and deliver incrementally with quality gates",
    }[task.complexity];

    if (complexityGoal) {
      goals.push(complexityGoal);
    }
  }

  // Goal 3: Based on tags (if any indicate specific goals)
  if (task.tags?.length) {
    if (task.tags.includes("refactor")) {
      goals.push("Improve code quality, maintainability, or performance");
    }
    if (task.tags.includes("bug")) {
      goals.push("Fix root cause and add regression test");
    }
    if (task.tags.includes("feature")) {
      goals.push("Implement new functionality with appropriate tests");
    }
    if (task.tags.includes("docs")) {
      goals.push("Create clear, comprehensive documentation");
    }
  }

  // Goal 4: Validation
  goals.push("Verify changes with tests and ensure no regressions");

  return goals;
}

/**
 * Generate implementation phases from task complexity and dependencies
 */
function generateImplementationPhases(task: Task): string[] {
  const phases: string[] = [];

  // Phase 1: Analysis
  phases.push("**Phase 1: Analysis**");
  phases.push("  - Review task requirements and acceptance criteria");
  phases.push("  - Identify dependencies and related systems");
  phases.push("  - Plan approach and document assumptions");

  // Phase 2: Implementation (varies by complexity)
  phases.push("");
  if (task.complexity === "epic" || task.complexity === "complex") {
    phases.push("**Phase 2: Design & Specification**");
    phases.push("  - Create detailed design document or architecture notes");
    phases.push("  - Validate approach with team/orchestrator");
    phases.push("  - Prepare for incremental implementation");
    phases.push("");
  }

  phases.push("**Phase " + (task.complexity === "epic" || task.complexity === "complex" ? "3" : "2") + ": Implementation**");
  phases.push("  - Implement primary changes");
  phases.push("  - Write tests for new functionality");
  phases.push("  - Handle edge cases and error scenarios");
  phases.push("");

  // Phase N: Integration & Validation
  const phaseNum = task.complexity === "epic" || task.complexity === "complex" ? "4" : "3";
  phases.push(`**Phase ${phaseNum}: Integration & Validation**`);
  phases.push("  - Integrate with existing systems");
  phases.push("  - Run full test suite");
  phases.push("  - Code review and address feedback");
  phases.push("");

  // Phase N+1: Deployment (if applicable)
  const deployNum = parseInt(phaseNum) + 1;
  phases.push(`**Phase ${deployNum}: Verification & Documentation**`);
  phases.push("  - Verify changes in target environment");
  phases.push("  - Update documentation and comments");
  phases.push("  - Create PR/commit with clear messages");

  // Dependencies note
  if (task.dependencies?.length) {
    phases.push("");
    phases.push(`**Dependencies**: This task depends on ${task.dependencies.length} other task(s)`);
  }

  return phases;
}

/**
 * Generate success criteria from task priority and status
 */
function generateSuccessCriteria(task: Task): string[] {
  const criteria: string[] = [];

  // Always include: code quality
  criteria.push("[ ] Code changes are clean, well-commented, and follow style guide");
  criteria.push("[ ] All tests pass (unit, integration, e2e if applicable)");
  criteria.push("[ ] No regressions in existing functionality");

  // Priority-based criteria
  if (task.priority === "critical") {
    criteria.push("[ ] Fix verified in production-like environment");
    criteria.push("[ ] Root cause documented");
  } else if (task.priority === "high") {
    criteria.push("[ ] Feature complete and tested");
    criteria.push("[ ] Documentation updated");
  }

  // Complexity-based criteria
  if (task.complexity === "epic" || task.complexity === "complex") {
    criteria.push("[ ] Design reviewed and approved");
    criteria.push("[ ] Performance benchmarked if applicable");
    criteria.push("[ ] Error handling and logging comprehensive");
  }

  // Task type indicators
  if (task.tags?.includes("breaking")) {
    criteria.push("[ ] Breaking changes documented");
    criteria.push("[ ] Migration path provided if needed");
  }

  if (task.tags?.includes("security")) {
    criteria.push("[ ] Security review completed");
    criteria.push("[ ] No new vulnerabilities introduced");
  }

  // GitHub integration
  if (task.github_issue_number) {
    criteria.push(`[ ] GitHub issue #${task.github_issue_number} updated with progress`);
  }

  return criteria;
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

   // Extract meaningful problem statement from description
   const problem = task.description?.trim() 
     ? task.description.trim() 
     : "No description provided. This task needs context added via `task_update(task_id, description=...)`.";

   // Generate goals, phases, and criteria
   const goals = generateGoals(task);
   const phases = generateImplementationPhases(task);
   const criteria = generateSuccessCriteria(task);

   // Build the markdown
   let markdown = `# Task: ${task.title}

**Task ID**: \`${task.id}\`  
**Priority**: ${task.priority}  
**Status**: ${task.status}  
**Complexity**: ${task.complexity || "unknown"}  
**GitHub Issue**: ${issueText}  
**Branch**: \`${branchText}\`  
**Estimated Time**: ${estimated} hours  
**Assigned To**: ${assigned}`;

   if (task.tags?.length) {
     markdown += `  \n**Tags**: ${task.tags.join(", ")}`;
   }

   markdown += `

---

## Problem Statement

${problem}`;

   if (task.notes?.length) {
     markdown += `

**Additional Context**:
${task.notes.map(n => `- ${n}`).join("\n")}`;
   }

   markdown += `

## Goals

${goals.map(g => `- ${g}`).join("\n")}

---

## Implementation Plan

${phases.join("\n")}

---

## Success Criteria

${criteria.map(c => `${c}`).join("\n")}

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: ${task.id}
- Keep implementation phases realistic and reviewable`;

   if (task.dependencies?.length) {
     markdown += `
- This task depends on: ${task.dependencies.join(", ")}`;
   }

   markdown += `

---

## History

| Date | Event |
|------|-------|
| ${task.created_at || now.toISOString()} | Task created |
| ${now.toISOString()} | Spec generated |
`;

   return markdown;
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
