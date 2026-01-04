#!/usr/bin/env bun
/**
 * Centralized Prompt Generator Library
 * 
 * Generates structured prompts for orchestrator and worker agents.
 * All prompts are defined in /prompts/prompts.json - this file loads and combines
 * templates with dynamic data.
 * 
 * CRITICAL: This system operates AUTONOMOUSLY - no human interaction.
 * Agents should NEVER ask questions or wait for responses.
 * 
 * Usage:
 *   import { generateOrchestratorPrompt, generateWorkerPrompt } from './lib/prompt-generator';
 *   
 *   const orchPrompt = generateOrchestratorPrompt();
 *   const workerPrompt = generateWorkerPrompt("Implement feature X", "code-worker");
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { readJson } from "../shared/json-utils";
import { PATHS } from "../shared/paths";
import { formatToolsForRole } from "../shared/tool-registry";
import { logWarning, getErrorMessage } from "../shared/error-handler";
import type { Task, SystemState, Agent } from "../shared/types";

const MEMORY_DIR = join(process.cwd(), "memory");
const PROMPTS_PATH = join(process.cwd(), "prompts", "prompts.json");
const STATE_PATH = join(MEMORY_DIR, "state.json");
const TASKS_PATH = join(MEMORY_DIR, "tasks.json");
const REGISTRY_PATH = join(MEMORY_DIR, "agent-registry.json");

// Cache for prompts config
let promptsConfig: any = null;

// ============================================================================
// Prompts Configuration Loading
// ============================================================================

function loadPromptsConfig(): any {
  if (promptsConfig) return promptsConfig;

  if (!existsSync(PROMPTS_PATH)) {
    throw new Error(`Prompts configuration not found at ${PROMPTS_PATH}`);
  }

  try {
    const content = readFileSync(PROMPTS_PATH, "utf-8");
    const parsed = JSON.parse(content);
    promptsConfig = parsed;
    return promptsConfig;
  } catch (error) {
    throw new Error(`Failed to load prompts configuration at ${PROMPTS_PATH}: ${getErrorMessage(error)}`);
  }
}

function getRole(roleName: string): any {
  const config = loadPromptsConfig();
  return config.roles[roleName] || config.roles.worker;
}

function getSection(sectionName: string): string[] | string {
  const config = loadPromptsConfig();
  const section = config.sections[sectionName];
  if (!section) return [];
  return section.content || section.template || [];
}

function getCriticalBehavior(): { neverDo: string[], alwaysDo: string[] } {
  const config = loadPromptsConfig();
  return {
    neverDo: config.critical_behavior?.NEVER_DO || [],
    alwaysDo: config.critical_behavior?.ALWAYS_DO || []
  };
}

function buildAutonomySection(): string {
  const config = loadPromptsConfig();
  const principles = config.core_principles || {};
  const behavior = config.critical_behavior || {};
  
  let content = `<autonomous_operation>
CRITICAL: This is a FULLY AUTONOMOUS system. There is NO human operator.

${principles.autonomous_operation || ""}
${principles.no_user_interaction || ""}
${principles.decision_making || ""}

## NEVER DO (These will cause the system to hang forever):
${(behavior.NEVER_DO || []).map((x: string) => `- ${x}`).join("\n")}

## ALWAYS DO:
${(behavior.ALWAYS_DO || []).map((x: string) => `- ${x}`).join("\n")}
</autonomous_operation>`;
  
  return content;
}

// ============================================================================
// Data Loading Functions
// ============================================================================

function loadState(): SystemState {
  return readJson<SystemState>(PATHS.state, { 
    session_count: 0, 
    status: "", 
    last_updated: "", 
    achievements: [], 
    active_tasks: [], 
    total_tokens: 0 
  });
}

function loadPendingTasks(): Task[] {
  const store = readJson<{ tasks: Task[] }>(TASKS_PATH, { tasks: [] });
  return (store.tasks || [])
    .filter((t: Task) => t.status === "pending")
    .sort((a: Task, b: Task) => {
      const priority: Record<string, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      return priority[a.priority] - priority[b.priority];
    });
}

function loadActiveAgents(): Agent[] {
  const registry = readJson<{ agents: Agent[] }>(REGISTRY_PATH, { agents: [] });
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;
  return (registry.agents || []).filter((a: Agent) => {
    const lastHB = new Date(a.last_heartbeat).getTime();
    return lastHB > fiveMinutesAgo;
  });
}


// ============================================================================
// Section Builders
// ============================================================================

function buildContextSection(state: SystemState, pendingTasks: Task[], activeAgents: Agent[]): string {
  let taskSection = "";
  if (pendingTasks.length > 0) {
    const taskList = pendingTasks
      .slice(0, 5)
      .map((t, i) => `  ${i + 1}. [${t.priority.toUpperCase()}] ${t.title} (ID: ${t.id})`)
      .join("\n");
    taskSection = `
<pending_tasks count="${pendingTasks.length}">
${taskList}
${pendingTasks.length > 5 ? `  ... and ${pendingTasks.length - 5} more` : ""}
</pending_tasks>`;
  } else {
    const noTasksContent = getSection("no_tasks_action");
    taskSection = `
<pending_tasks count="0">
No pending tasks in queue.

${Array.isArray(noTasksContent) ? noTasksContent.join("\n") : noTasksContent}
</pending_tasks>`;
  }

  let agentSection = "";
  if (activeAgents.length > 0) {
    const agentList = activeAgents
      .map((a) => `  - ${a.agent_id} (${a.assigned_role}): ${a.status}${a.current_task ? ` - ${a.current_task}` : ""}`)
      .join("\n");
    agentSection = `
<active_agents count="${activeAgents.length}">
${agentList}
</active_agents>`;
  }

  let achievementSection = "";
  if (state.recent_achievements?.length > 0) {
    const achievementList = state.recent_achievements
      .slice(0, 3)
      .map((a) => `  - ${a}`)
      .join("\n");
    achievementSection = `
<recent_achievements>
${achievementList}
</recent_achievements>`;
  }

  return `<context>
## System State
Session: ${state.session_count}
Status: ${state.status || "unknown"}
Active agents: ${activeAgents.length}
Pending tasks: ${pendingTasks.length}
${taskSection}
${agentSection}
${achievementSection}
</context>`;
}

function buildRoleSection(role: any): string {
  return `<role>
${role.identity}
${role.purpose ? `\n${role.purpose}` : ""}
</role>`;
}

function buildLeaderElectionSection(): string {
  const content = getSection("leader_election");
  return `<leader_election>
${Array.isArray(content) ? content.join("\n") : content}
</leader_election>`;
}

function buildSpawningWorkersSection(): string {
  const content = getSection("spawning_workers");
  return `<spawning_workers>
${Array.isArray(content) ? content.join("\n") : content}
</spawning_workers>`;
}

function buildInstructionsSection(role: any, roleName: string): string {
  const firstActions = role.first_actions || [];
  const workflow = role.workflow_loop || role.workflow_phases || role.approach || [];
  const constraints = role.constraints || [];
  
  let firstActionsStr = "";
  if (firstActions.length > 0) {
    firstActionsStr = `## Critical First Actions (Execute IMMEDIATELY in this exact order)
${firstActions.map((a: string, i: number) => `${i + 1}. ${a}`).join("\n")}
`;
  }

  let thinkingPattern = "";
  if (role.thinking_pattern) {
    thinkingPattern = `
Before taking action, use this thinking pattern:

${role.thinking_pattern.template}
`;
  }

  let workflowStr = "";
  if (roleName === "orchestrator") {
    workflowStr = `## Main Workflow

Then follow this loop:
${(role.workflow_loop || []).map((w: string, i: number) => `${i + 1}. ${w}`).join("\n")}
`;
  } else if (role.workflow_phases) {
    workflowStr = `## Workflow Phases
${role.workflow_phases.map((p: string) => `### ${p}`).join("\n")}
`;
  }

  let constraintsStr = "";
  if (constraints.length > 0) {
    constraintsStr = `## Constraints
${constraints.map((c: string) => `- ${c}`).join("\n")}
`;
  }

  // Add quality principles
  const qualityContent = getSection("quality_principles");
  let qualityStr = "";
  if (qualityContent && roleName !== "orchestrator") {
    qualityStr = `## Quality Principles
${Array.isArray(qualityContent) ? qualityContent.join("\n") : qualityContent}
`;
  }

  // Add autonomy section
  const autonomySection = buildAutonomySection();

  return `${autonomySection}

<instructions>
${firstActionsStr}
${thinkingPattern}
${workflowStr}
${constraintsStr}
${qualityStr}
## Working Memory (memory/working.md)
READ this file at session start - it contains context from previous sessions.
WRITE to this file:
- Your decisions and reasoning
- Open questions for future sessions to investigate
- Important findings and context
NEVER ask questions in your output - write them to working.md instead.

## Output Format
When reporting completion, include:
1. What was accomplished
2. Files changed (if any)
3. Issues found (if any)
4. Recommendations for follow-up
</instructions>`;
}

function buildRoleSpecializationSection(role: any, roleName: string): string {
  const toolsSection = formatToolsForRole(roleName, true);
  
  let qualityStandards = "";
  if (role.quality_standards) {
    qualityStandards = `
## Quality Standards
${role.quality_standards.map((s: string) => `- ${s}`).join("\n")}
`;
  }

  let keyFiles = "";
  if (role.key_files) {
    keyFiles = `
## Key Files
${role.key_files.map((f: string) => `- ${f}`).join("\n")}
`;
  }

  let outputFormat = "";
  if (role.output_format) {
    outputFormat = `
## Output Format
${role.output_format.map((f: string) => f).join("\n")}
`;
  }

  let methodology = "";
  if (role.methodology) {
    methodology = `
## Methodology
${role.methodology.map((m: string, i: number) => `${i + 1}. ${m}`).join("\n")}
`;
  }

  return `<role_specialization>
${role.identity}

${toolsSection}
${qualityStandards}
${keyFiles}
${outputFormat}
${methodology}
${role.thinking_pattern ? role.thinking_pattern.template : ""}
</role_specialization>`;
}

function buildUsefulCommandsSection(): string {
  const config = loadPromptsConfig();
  const commands = config.useful_commands?.commands || [];
  
  return `<useful_commands>
${commands.map((c: string) => `# ${c}`).join("\n")}
</useful_commands>`;
}

// ============================================================================
// Orchestrator Prompt Generation
// ============================================================================

export function generateOrchestratorPrompt(): string {
  const state = loadState();
  const pendingTasks = loadPendingTasks();
  const activeAgents = loadActiveAgents();
  const role = getRole("orchestrator");

  const contextSection = buildContextSection(state, pendingTasks, activeAgents);
  const roleSection = buildRoleSection(role);
  const leaderElectionSection = buildLeaderElectionSection();
  const spawningWorkersSection = buildSpawningWorkersSection();
  const toolsSection = formatToolsForRole("orchestrator", true);
  const instructionsSection = buildInstructionsSection(role, "orchestrator");

  return `${contextSection}

${roleSection}

<critical_autonomy>
THIS IS A FULLY AUTONOMOUS SYSTEM. There is NO human operator.
- NEVER ask questions - no one will answer
- NEVER wait for confirmation - proceed with best judgment  
- NEVER say "let me know if..." - no one is listening
- If uncertain, write your doubts to memory/working.md for the next session
- READ memory/working.md first - it has context from previous sessions
- Make decisions and ACT. Wrong action > no action.
</critical_autonomy>

${leaderElectionSection}

${spawningWorkersSection}

${toolsSection}

${instructionsSection}

BEGIN: Read memory/working.md for context, then execute critical_first_actions NOW.
IMPORTANT: Check leader status FIRST. Only continue if you are the leader. If not, exit gracefully.`;
}

// ============================================================================
// Worker Prompt Generation
// ============================================================================

export type WorkerRole = "code-worker" | "memory-worker" | "analysis-worker" | "worker";

export function generateWorkerPrompt(task: string, roleName: WorkerRole = "worker"): string {
  const state = loadState();
  const sessionNum = state.session_count || 0;
  const role = getRole(roleName);

  const contextSection = `<context>
Session: ${sessionNum}
Working directory: /app/workspace
Runtime: bun (use bun, not npm or node)
Task: ${task}
</context>`;

  const roleSection = `<role>
You are a WORKER agent in a multi-agent AI system.
You were spawned by the orchestrator to complete a specific task.
Focus exclusively on your assigned task, then report completion and exit.
</role>

<critical_autonomy>
THIS IS A FULLY AUTONOMOUS SYSTEM. There is NO human operator.
- NEVER ask questions - no one will answer
- NEVER wait for confirmation - proceed with best judgment
- If uncertain, write doubts to memory/working.md for future sessions
- Make decisions and ACT. Complete your task without waiting for input.
</critical_autonomy>`;

  const roleSpecialization = buildRoleSpecializationSection(role, roleName);
  const usefulCommands = buildUsefulCommandsSection();

  // Worker-specific instructions
  const constraints = role.constraints || [];
  const completionReport = getSection("worker_completion_report");
  const qualityContent = getSection("quality_principles");

  const instructionsSection = `<instructions>
## Initialization (Do First)
1. agent_register(role='${roleName}')
2. Read memory/working.md for recent context
3. Understand the task requirements fully before acting

## Workflow Phases

### Phase 1: UNDERSTAND
Before taking any action, analyze your task:

${role.thinking_pattern?.template || "<scratchpad>\nWhat exactly am I being asked to do?\n</scratchpad>"}

### Phase 2: PLAN
Break down the work:
- Step 1: [specific action]
- Step 2: [specific action]
- Final step: Validate and report

### Phase 3: IMPLEMENT
Execute your plan:
- Work through each step methodically
- Validate after each significant change
- Handle errors gracefully

### Phase 4: VALIDATE
Before reporting:
- Verify your work is complete and correct
- Run tests if applicable: \`bun test\`
- Check code compiles: \`bun build path/to/file.ts --no-bundle\`

### Phase 5: REPORT
Report completion:

\`\`\`typescript
${typeof completionReport === 'string' ? completionReport : ''}
\`\`\`

## Constraints
${constraints.map((c: string) => `- ${c}`).join("\n")}

## Quality Principles
${Array.isArray(qualityContent) ? qualityContent.join("\n") : qualityContent}

## Output Format
When reporting completion, structure your summary as:

**Task Completed**: ${task.slice(0, 50)}...

**Changes Made**:
- file.ts: [description of change]

**Issues Found**:
- [any bugs or problems discovered]

**Recommendations**:
- [follow-up work needed]
</instructions>`;

  return `${contextSection}

${roleSection}

${roleSpecialization}

${usefulCommands}

${instructionsSection}

BEGIN: Execute initialization steps, then follow the workflow to complete your task.`;
}

// ============================================================================
// CLI Interface (if run directly)
// ============================================================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "orchestrator") {
    console.log(generateOrchestratorPrompt());
  } else if (command === "worker") {
    let role: WorkerRole = "worker";
    let taskParts: string[] = [];

    for (let i = 1; i < args.length; i++) {
      if (args[i] === "--role" && args[i + 1]) {
        role = args[i + 1] as WorkerRole;
        i++; // Skip next arg
      } else {
        taskParts.push(args[i]);
      }
    }

    const task = taskParts.join(" ") || "Analyze and improve the system";
    console.log(generateWorkerPrompt(task, role));
  } else {
    console.log(`Usage:
  bun tools/lib/prompt-generator.ts orchestrator
  bun tools/lib/prompt-generator.ts worker [--role <role>] <task>

Examples:
  bun tools/lib/prompt-generator.ts orchestrator > /tmp/orch.txt
  bun tools/lib/prompt-generator.ts worker "Fix bug in X"
  bun tools/lib/prompt-generator.ts worker --role code-worker "Implement feature Y"
`);
  }
}
