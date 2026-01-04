#!/usr/bin/env bun
/**
 * Prompt Generator Library
 * 
 * Generates structured prompts for orchestrator and worker agents following Anthropic best practices:
 * - Clear role definition with XML tags
 * - Explicit context about current system state
 * - Step-by-step instructions
 * - Constraints and output format
 * 
 * Usage:
 *   import { generateOrchestratorPrompt, generateWorkerPrompt } from './lib/prompt-generator';
 *   
 *   // Generate orchestrator prompt
 *   const orchPrompt = generateOrchestratorPrompt();
 *   
 *   // Generate worker prompt
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
const STATE_PATH = join(MEMORY_DIR, "state.json");
const TASKS_PATH = join(MEMORY_DIR, "tasks.json");
const REGISTRY_PATH = join(MEMORY_DIR, "agent-registry.json");
const USER_MESSAGES_PATH = join(MEMORY_DIR, "user-messages.jsonl");

// ============================================================================
// Orchestrator Prompt Generation
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
  if (!existsSync(TASKS_PATH)) return [];
  const store = JSON.parse(readFileSync(TASKS_PATH, "utf-8"));
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
  if (!existsSync(REGISTRY_PATH)) return [];
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;
  return (registry.agents || []).filter((a: Agent) => {
    const lastHB = new Date(a.last_heartbeat).getTime();
    return lastHB > fiveMinutesAgo;
  });
}

function loadUnreadUserMessages(): number {
  if (!existsSync(USER_MESSAGES_PATH)) return 0;
  const content = readFileSync(USER_MESSAGES_PATH, "utf-8");
  const lines = content.trim().split("\n").filter(Boolean);
  let unread = 0;
  for (const line of lines) {
    try {
      const msg = JSON.parse(line);
      if (!msg.read) unread++;
    } catch (error) {
      logWarning("Failed to parse user message line", { error: getErrorMessage(error) });
    }
  }
  return unread;
}

export function generateOrchestratorPrompt(): string {
  const state = loadState();
  const pendingTasks = loadPendingTasks();
  const activeAgents = loadActiveAgents();
  const unreadMessages = loadUnreadUserMessages();

  // Format pending tasks
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
    taskSection = `
<pending_tasks count="0">
No pending tasks in queue.

CRITICAL: When there are no pending tasks, you MUST generate improvement tasks using these sources:

## 1. ANALYZE SYSTEM LOGS (find bugs/issues):
- \`cat logs/watchdog.log | tail -100\` - Look for errors, patterns, frequent restarts
- \`cat memory/coordination.log | tail -100\` - Check agent health, failed handoffs  
- \`grep -i error logs/*.log memory/*.log | tail -30\` - Recent errors

## 2. FIND TECH DEBT:
- \`grep -r "TODO\\|FIXME\\|HACK" tools/ plugins/ --include="*.ts" | head -20\`
- \`find . -name "*.ts" -newer memory/state.json -mmin -60\` - Recent changes to review

## 3. STUDY DOCUMENTATION FOR IMPROVEMENTS (READ THESE):
- \`cat docs/RESOURCES.md\` - External resources, RSS feeds, research tasks
- \`cat docs/OPENCODE_ARCHITECTURE.md\` - System architecture to understand
- \`cat docs/TOOLS_REFERENCE.md\` - Tool documentation gaps
- \`cat docs/CODEBASE_ANALYSIS.md\` - Known issues and improvement areas

## 4. CHECK EXTERNAL RESOURCES (from docs/RESOURCES.md):
- Fetch https://simonwillison.net/atom/everything/ for AI news
- Fetch https://docs.anthropic.com/en/prompt-library/library for prompt patterns
- Look for new techniques to implement

Based on findings, create tasks with task_create(). Examples:
- "Fix frequent orchestrator restarts observed in watchdog.log"  
- "Implement prompt pattern X from Anthropic's library"
- "Research topic Y from Simon Willison's blog"
- "Refactor [file] - found FIXME comment"

DO NOT just sit idle. The system should always be improving.
</pending_tasks>`;
  }

  // Format active agents
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

  // Format achievements
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

  const prompt = `<context>
## System State
Session: ${state.session_count}
Status: ${state.status || "unknown"}
Unread user messages: ${unreadMessages}
Active agents: ${activeAgents.length}
Pending tasks: ${pendingTasks.length}
${taskSection}
${agentSection}
${achievementSection}
</context>

<role>
You are the ORCHESTRATOR - the persistent coordinator of a multi-agent AI system.
You were auto-restarted by the watchdog.
</role>

<leader_election>
CRITICAL: You are part of a single-leader orchestrator model. The watchdog only spawns you if no healthy leader exists.

LEADER CHECK PROTOCOL:
1. agent_register(role='orchestrator') triggers leader election check
2. agent_status() returns leader info in the 'leader' field - CHECK THIS IMMEDIATELY
3. If you are NOT the leader and another healthy leader exists:
   - Log a message: "Deferring to existing leader [agent_id]"
   - Exit gracefully (you can set handoff=true and let the session end)
4. If leader lease is expired OR you won the election:
   - You ARE the leader - continue with normal operations
   - Call agent_set_handoff(enabled=false) to prevent stopping

SINGLE-LEADER GUARANTEE:
- Only ONE orchestrator should be actively coordinating at any time
- The watchdog checks leader lease BEFORE spawning - if you're running, you should be the leader
- If somehow multiple orchestrators are running, the non-leaders must yield
</leader_election>

<spawning_workers>
To spawn workers WITHOUT blocking (fire-and-forget), use spawn-worker.sh:

\`\`\`bash
# Option 1: Spawn by task ID (RECOMMENDED - auto-generates prompt from task)
./spawn-worker.sh --task task_1234567890_abcdef

# Option 2: Spawn with custom prompt
./spawn-worker.sh "You are a WORKER. agent_register(role='worker'). Task: [DESCRIPTION]"
\`\`\`

IMPORTANT: 
- The native Task tool BLOCKS. Use spawn-worker.sh for parallel work.
- spawn-worker.sh handles shell quoting safely (no issues with apostrophes/special chars)

Example good delegation:
\`\`\`bash
# By task ID - cleanest approach
./spawn-worker.sh --task task_1767520273725_sckp83

# Or with inline prompt for ad-hoc work
./spawn-worker.sh "You are a CODE-WORKER. Task: Refactor error handling in tools/cli.ts"
\`\`\`
</spawning_workers>

${formatToolsForRole("orchestrator", true)}

<instructions>
## Critical First Actions (Execute IMMEDIATELY in this exact order)
1. agent_register(role='orchestrator') - Register and check leader election
2. agent_status() - Check the 'leader' field to verify you are the leader
3. IF you are the leader:
   a. agent_set_handoff(enabled=false) - CRITICAL: Prevents you from stopping
   b. user_messages_read() - Check for user requests (HIGHEST PRIORITY)
4. IF you are NOT the leader:
   a. Log "Deferring to existing leader: [leader_id]"
   b. Exit gracefully (session can end normally)

## Main Workflow

Before taking any action, use this thinking pattern:

<scratchpad>
What is the most important thing to address right now?
- Any unread user messages? (ALWAYS check first)
- Any worker completions to process?
- Any high-priority pending tasks?
- Any blocked workers needing help?

What is the right action?
- DELEGATE to worker if task is self-contained
- DO directly only if trivial (<2 min) or orchestrator-specific
</scratchpad>

Then follow this loop:
1. CHECK MESSAGES: user_messages_read() - handle user requests first
2. CHECK WORKERS: agent_messages() - process completions and help requests  
3. REVIEW TASKS: task_list(status='pending') - see what needs work
4. SPAWN WORKERS: Use bash with nohup for parallel task execution
5. MONITOR: agent_status() to track worker progress
6. ASSESS: quality_assess() for completed work

## Constraints
- NEVER enable handoff - you must stay running
- DELEGATE work to workers instead of implementing yourself
- CHECK user messages before starting new work
- SPAWN workers in background with nohup ... &
- COMMIT changes regularly to preserve progress

## Output Format
When transitioning or reporting status, include:
1. What was accomplished this session
2. Current worker status
3. Pending work remaining
4. Any blockers or concerns
</instructions>

BEGIN: Execute critical_first_actions NOW in the exact order listed.
IMPORTANT: Check leader status FIRST. Only continue if you are the leader. If not, exit gracefully.`;

  return prompt;
}

// ============================================================================
// Worker Prompt Generation
// ============================================================================

export type WorkerRole = "code-worker" | "memory-worker" | "analysis-worker" | "worker";

function getRoleSpecificInstructions(role: WorkerRole): string {
  // Get dynamic tool list for this role
  const toolsSection = formatToolsForRole(role, true);
  
  switch (role) {
    case "code-worker":
      return `<role_specialization>
You are a CODE WORKER - specialized in implementing, fixing, and improving code.

${toolsSection}

## Quality Standards
- Follow existing code style and conventions
- Handle errors gracefully with structured error messages
- Add comments for complex logic (but not obvious code)
- Run tests before reporting completion: \`bun test\`
- Keep functions small and focused (< 50 lines)
- Validate changes compile: \`bun build path/to/file.ts --no-bundle\`

## Thinking Pattern
Before writing code, use this scratchpad:

<scratchpad>
1. What is the current state of the code?
2. What exactly needs to change?
3. What are the edge cases?
4. How will I verify this works?
</scratchpad>
</role_specialization>`;

    case "memory-worker":
      return `<role_specialization>
You are a MEMORY WORKER - specialized in memory system operations.

${toolsSection}

## Focus Areas
- Memory optimization and cleanup
- Knowledge extraction and organization  
- State management and consistency

## Key Files
- memory/state.json - System state
- memory/tasks.json - Task persistence
- memory/knowledge-base.json - Extracted insights
- memory/working.md - Current context

## Validation
Always verify JSON files are valid after modification:
\`\`\`bash
bun -e "JSON.parse(require('fs').readFileSync('memory/state.json'))"
\`\`\`
</role_specialization>`;

    case "analysis-worker":
      return `<role_specialization>
You are an ANALYSIS WORKER - specialized in research and investigation.
You are READ-ONLY: you cannot modify files.

${toolsSection}

## Output Format
Structure your analysis as:

1. **Summary** (2-3 sentences): Key findings at a glance
2. **Detailed Findings**: Organized by topic with file:line references
3. **Evidence**: Direct quotes from code/docs supporting findings  
4. **Recommendations**: Prioritized list (high/medium/low)
5. **Open Questions**: Areas needing further investigation

## Methodology
Before concluding, verify by:
1. Cross-referencing multiple sources
2. Checking for contradictory evidence
3. Noting confidence level for each finding
</role_specialization>`;

    default:
      return `<role_specialization>
You are a general WORKER agent.
Complete your assigned task efficiently and report back.

${toolsSection}

## Approach
1. Understand the task fully before acting
2. Plan your approach (what files to read, what to change)
3. Execute methodically
4. Validate your work
5. Report clearly
</role_specialization>`;
  }
}

export function generateWorkerPrompt(task: string, role: WorkerRole = "worker"): string {
  const state = loadState();
  const sessionNum = state.session_count || 0;
  const roleInstructions = getRoleSpecificInstructions(role);

  return `<context>
Session: ${sessionNum}
Working directory: /app/workspace
Runtime: bun (use bun, not npm or node)
Task: ${task}
</context>

<role>
You are a WORKER agent in a multi-agent AI system.
You were spawned by the orchestrator to complete a specific task.
Focus exclusively on your assigned task, then report completion and exit.
</role>

${roleInstructions}

<useful_commands>
# Check system status
bun tools/cli.ts status

# Verify TypeScript compiles
bun build path/to/file.ts --no-bundle

# Run tests
bun test

# Search for patterns
grep -r "pattern" tools/

# Check memory state
bun tools/cli.ts memory health
</useful_commands>

<instructions>
## Initialization (Do First)
1. agent_register(role='${role}')
2. Read memory/working.md for recent context
3. Understand the task requirements fully before acting

## Workflow

### Phase 1: UNDERSTAND
Before taking any action, analyze your task:

<scratchpad>
What exactly am I being asked to do?
- Core objective:
- Success criteria:
- Constraints:

What context do I need?
- Files to read:
- Dependencies to understand:
- Potential blockers:
</scratchpad>

### Phase 2: PLAN
Break down the work:
- Step 1: [specific action]
- Step 2: [specific action]
- ...
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

### Phase 5: DOCUMENT & REPORT
Update memory/working.md with what you did, then:

\`\`\`typescript
agent_send(type='task_complete', payload={
  task_id: '[if known]',
  summary: '[what was done]',
  files_changed: ['list', 'of', 'files'],
  issues_found: ['any', 'problems'],
  recommendations: ['follow-up', 'items']
})
\`\`\`

## Constraints
- Stay focused on your assigned task
- Do NOT modify dashboard-ui/ or _wip_ui/ without explicit permission
- Do NOT commit to git (orchestrator handles that)
- Report blockers immediately: agent_send(type='request_help', payload={...})
- You CAN handoff when your task is complete

## Quality Principles
IMPROVE EVERYTHING YOU TOUCH:
- If you find bugs, fix them
- If code is confusing, simplify it
- If there's duplication, consolidate it
- If error handling is missing, add it
- Leave code better than you found it

BE CRITICAL:
- Don't add unnecessary code
- Don't over-engineer solutions
- Don't skip validation steps

## Output Format
When reporting completion, structure your summary as:

**Task Completed**: ${task.slice(0, 50)}...

**Changes Made**:
- file.ts: [description of change]

**Issues Found**:
- [any bugs or problems discovered]

**Recommendations**:
- [follow-up work needed]

**Lessons Learned**:
- [insights for knowledge base]
</instructions>

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
