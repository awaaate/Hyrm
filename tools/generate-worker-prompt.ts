#!/usr/bin/env bun
/**
 * Worker Prompt Generator
 * 
 * Generates focused, structured prompts for worker agents following Anthropic best practices:
 * - Clear role definition
 * - Specific task context
 * - Step-by-step workflow
 * - Quality standards and constraints
 * 
 * Usage:
 *   bun tools/generate-worker-prompt.ts "Implement feature X"
 *   bun tools/generate-worker-prompt.ts --role code-worker "Fix bug in Y"
 */

import { readJson } from "./shared/json-utils";
import { PATHS } from "./shared/paths";
import type { SystemState } from "./shared/types";
import { formatToolsForRole } from "./shared/tool-registry";

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

type WorkerRole = "code-worker" | "memory-worker" | "analysis-worker" | "worker";

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

function generateWorkerPrompt(task: string, role: WorkerRole = "worker"): string {
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

// Parse arguments
const args = process.argv.slice(2);
let role: WorkerRole = "worker";
let taskParts: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--role" && args[i + 1]) {
    role = args[i + 1] as WorkerRole;
    i++; // Skip next arg
  } else {
    taskParts.push(args[i]);
  }
}

const task = taskParts.join(" ") || "Analyze and improve the system";
console.log(generateWorkerPrompt(task, role));
