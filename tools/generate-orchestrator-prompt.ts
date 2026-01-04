#!/usr/bin/env bun
/**
 * Dynamic Orchestrator Prompt Generator
 * 
 * Generates a structured prompt for the orchestrator following Anthropic best practices:
 * - Clear role definition with XML tags
 * - Explicit context about current system state
 * - Step-by-step instructions
 * - Constraints and output format
 * 
 * Usage:
 *   bun tools/generate-orchestrator-prompt.ts > /tmp/orchestrator-prompt.txt
 *   opencode run "$(cat /tmp/orchestrator-prompt.txt)"
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { formatToolsForRole } from "./shared/tool-registry";
import { logWarning, getErrorMessage } from "./shared/error-handler";

const MEMORY_DIR = join(process.cwd(), "memory");
const STATE_PATH = join(MEMORY_DIR, "state.json");
const TASKS_PATH = join(MEMORY_DIR, "tasks.json");
const REGISTRY_PATH = join(MEMORY_DIR, "agent-registry.json");
const USER_MESSAGES_PATH = join(MEMORY_DIR, "user-messages.jsonl");

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: "critical" | "high" | "medium" | "low";
  status: string;
  tags?: string[];
}

interface State {
  session_count: number;
  status: string;
  active_tasks: string[];
  recent_achievements: string[];
}

interface Agent {
  agent_id: string;
  assigned_role: string;
  status: string;
  current_task?: string;
  last_heartbeat: string;
}

function loadState(): State {
  if (!existsSync(STATE_PATH)) {
    return {
      session_count: 0,
      status: "unknown",
      active_tasks: [],
      recent_achievements: [],
    };
  }
  return JSON.parse(readFileSync(STATE_PATH, "utf-8"));
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

function generatePrompt(): string {
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

// Main
const prompt = generatePrompt();
console.log(prompt);
