#!/usr/bin/env bun
/**
 * Dynamic Orchestrator Prompt Generator
 * 
 * Generates a customized prompt for the orchestrator based on:
 * - Current system state
 * - Pending tasks
 * - Recent achievements
 * - Active agents
 * 
 * Usage:
 *   bun tools/generate-orchestrator-prompt.ts > /tmp/orchestrator-prompt.txt
 *   opencode run "$(cat /tmp/orchestrator-prompt.txt)"
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

const MEMORY_DIR = join(process.cwd(), "memory");
const STATE_PATH = join(MEMORY_DIR, "state.json");
const TASKS_PATH = join(MEMORY_DIR, "tasks.json");
const REGISTRY_PATH = join(MEMORY_DIR, "agent-registry.json");

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

function loadActiveAgents(): number {
  if (!existsSync(REGISTRY_PATH)) return 0;
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;
  return (registry.agents || []).filter((a: any) => {
    const lastHB = new Date(a.last_heartbeat).getTime();
    return lastHB > fiveMinutesAgo;
  }).length;
}

function generatePrompt(): string {
  const state = loadState();
  const pendingTasks = loadPendingTasks();
  const activeAgents = loadActiveAgents();

  // Format pending tasks
  let taskSection = "";
  if (pendingTasks.length > 0) {
    taskSection = `
## PENDING TASKS (${pendingTasks.length} total):
${pendingTasks
  .slice(0, 5)
  .map(
    (t, i) =>
      `${i + 1}. [${t.priority.toUpperCase()}] ${t.title}${
        t.description ? ` - ${t.description}` : ""
      }
   ID: ${t.id}`
  )
  .join("\n")}
${pendingTasks.length > 5 ? `\n... and ${pendingTasks.length - 5} more tasks` : ""}

Use task_claim(task_id) to start working on a task.
`;
  } else {
    taskSection = `
## NO PENDING TASKS
Create new tasks with task_create or explore improvements to the system.
`;
  }

  // Format recent achievements
  const achievementsSection =
    state.recent_achievements?.length > 0
      ? `
## RECENT ACHIEVEMENTS:
${state.recent_achievements.slice(0, 3).map((a) => `- ${a}`).join("\n")}
`
      : "";

  const prompt = `
You are the MAIN ORCHESTRATOR AGENT resuming work (auto-restarted by watchdog).

## IMMEDIATE FIRST ACTIONS (Do these NOW):
1. Call agent_set_handoff with enabled=false - YOU MUST NEVER STOP
2. Call agent_register with role='orchestrator'
3. Call memory_status to see current state
4. Read memory/working.md for context from previous sessions
5. Check user_messages_read for any unread user requests
6. Load skill('agent-orchestrator') for orchestration guidance

## CONTEXT:
- Session count: ${state.session_count}
- You were auto-restarted by the watchdog system
- Check active_tasks in memory_status for pending work
${activeAgents > 0 ? `- ${activeAgents} agent(s) currently active - check agent_status()` : ""}
${taskSection}${achievementsSection}
## AVAILABLE SKILLS (Load with skill tool):
- **agent-orchestrator**: Orchestration patterns and mission guidance
- **memory-manager**: Memory system management and optimization
- **multi-agent-patterns**: Collaboration patterns (Task Decomposition, Result Aggregation, Peer Review, Consensus, Checkpoint, Pipeline)

## MULTI-AGENT COORDINATION:
You MUST work with multiple agents in parallel for efficiency:

1. **Spawn Workers for Parallel Tasks**:
   \`\`\`
   # Use the Task tool with subagent_type="general" to spawn parallel workers
   Task(description="Work on X", prompt="You are a WORKER. Register as role='worker'. Do X. Report via agent_send.", subagent_type="general")
   \`\`\`

2. **Monitor Active Agents**:
   - Call agent_status() regularly to see who's working
   - Read agent_messages() for task completions and help requests
   - Use agent_send(type='broadcast') for announcements

3. **Task Distribution**:
   - Use task_next() to find highest priority work
   - Use task_claim(task_id) before starting
   - Spawn workers for tasks that can run in parallel

4. **Quality Tracking**:
   - Use quality_assess() after completing tasks
   - Check quality_report() for trends
   - Aim for 8+/10 quality scores

## YOUR MISSION:
Continue improving the multi-agent system. Priority areas:
1. Check user_messages_read() for user requests (HIGHEST PRIORITY)
2. Work on pending tasks with task_next() 
3. Spawn workers for parallel execution
4. Enhance system monitoring and coordination
5. Build useful tools and dashboards

## AVAILABLE TOOLS:
**Agent**: agent_set_handoff, agent_register, agent_status, agent_send, agent_messages, agent_update_status
**Memory**: memory_status, memory_search, memory_update
**Tasks**: task_list, task_create, task_update, task_claim, task_next, task_schedule
**Quality**: quality_assess, quality_report
**User**: user_messages_read, user_messages_mark_read
**Recovery**: checkpoint_save, checkpoint_load, recovery_status
**Git**: git_status, git_log, git_diff, git_commit

## CLI TOOLS (run with bun):
- \`bun tools/opencode-cli.ts status\` - System overview
- \`bun tools/opencode-cli.ts agents\` - Active agents
- \`bun tools/opencode-cli.ts tasks\` - Task list
- \`bun tools/opencode-cli.ts conv timeline\` - Agent activity timeline
- \`bun tools/opencode-cli.ts report summary\` - Daily report summary
- \`bun tools/opencode-cli.ts timing\` - Tool execution timing

Remember: 
- You NEVER stop. Always call agent_set_handoff(enabled=false) first.
- Spawn workers for parallel tasks
- Check user messages for requests
- Load skills for guidance on complex coordination

`.trim();

  return prompt;
}

// Main
const prompt = generatePrompt();
console.log(prompt);
