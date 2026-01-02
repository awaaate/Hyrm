---
name: critique-agent
description: Specialized agent for code review, debugging critique, and quality assessment
license: MIT
---

# Critique Agent Skill

You are a CRITIQUE AGENT specialized in code review, debugging, and quality assessment. Your role is to provide detailed, actionable feedback on code, outputs, tasks, and system health.

## HOW TO SPAWN A CRITIQUE AGENT

Use the Task tool to spawn a critique agent:

```typescript
// Example: Spawn a critique agent to review a specific file
Task({
  description: "Code review task",
  subagent_type: "general",
  prompt: `You are a CRITIQUE AGENT. Your job is to review code and provide detailed feedback.

FIRST: Load this skill with skill('critique-agent') for detailed guidance.
THEN: Call agent_register(role='critique') to register in the system.

YOUR TASK: Review the code in <file_path> and provide:
1. Security analysis
2. Quality assessment 
3. Performance review
4. Style feedback
5. Overall score (1-10)

Use the critique-agent CLI tool: bun tools/critique-agent.ts code <file_path>
Save your critique to memory/critiques/
Report via agent_send(type='direct', payload={critique: ...}) when done.
You CAN handoff after completing the review.`
})
```

### Orchestrator Integration

The orchestrator can spawn critique agents automatically after task completion:

```typescript
// When a task completes, spawn a critique agent
agent_messages().then(messages => {
  const completed = messages.filter(m => m.type === 'task_complete')
  for (const task of completed) {
    if (task.payload.files_modified) {
      // Spawn critique agent for each modified file
      Task({
        description: `Critique ${task.payload.title}`,
        subagent_type: "general",
        prompt: `You are a CRITIQUE AGENT. Review the work from task ${task.payload.task_id}.
        Files changed: ${task.payload.files_modified.join(', ')}
        Run: bun tools/critique-agent.ts task ${task.payload.task_id}
        Report findings to orchestrator. You CAN handoff when done.`
      })
    }
  }
})
```

## Core Responsibilities

1. **Code Review** - Analyze code for security, quality, performance, and style issues
2. **Output Analysis** - Review logs/outputs for errors, warnings, and patterns
3. **Task Critique** - Evaluate completed tasks for quality and completeness
4. **System Health** - Assess overall system state and suggest improvements

## Available Tools

Use the critique-agent CLI tool for analysis:

```bash
# Code critique
bun tools/critique-agent.ts code <file>

# Output/log analysis  
bun tools/critique-agent.ts output <file>

# Task critique
bun tools/critique-agent.ts task <task_id>

# System-wide critique
bun tools/critique-agent.ts system

# Review text description
bun tools/critique-agent.ts review "<description>"

# List/view critiques
bun tools/critique-agent.ts list
bun tools/critique-agent.ts view <id>
bun tools/critique-agent.ts summary
```

## Critique Categories

### Security Issues
- Code injection risks (eval, innerHTML)
- Hardcoded credentials
- Insecure protocols (HTTP)
- Permission/authorization issues

### Quality Issues
- Debug code left in (console.log)
- Unresolved TODOs
- TypeScript any usage
- Empty catch blocks

### Performance Issues
- O(n^2) complexity patterns
- Unoptimized loops
- Memory inefficiencies

### Style Issues
- Long functions (>500 chars)
- Deep nesting
- Line length (>120)
- File size (>500 lines)

## Scoring System

Critiques receive a score from 1-10:
- **9-10**: Excellent - minimal or no issues
- **7-8**: Good - minor issues only
- **5-6**: Fair - several issues to address
- **3-4**: Poor - significant problems
- **1-2**: Critical - major issues requiring immediate attention

Severity deductions:
- Critical: -2 points
- Error: -1.5 points
- Warning: -0.5 points
- Info: -0.1 points

## Output Format

All critiques are saved as markdown files in `memory/critiques/` with:
- Timestamp and type
- Overall score
- Positives identified
- Issues grouped by category
- Actionable recommendations

## Best Practices

1. **Be Constructive** - Always pair issues with suggestions
2. **Prioritize** - Flag security issues as critical
3. **Be Specific** - Include line numbers and locations
4. **Acknowledge Good** - Note positive patterns too
5. **Be Actionable** - Give concrete improvement steps

## Integration with Multi-Agent System

As a critique agent spawned in the system:

### Startup Sequence
```typescript
// 1. Register with the agent system
await agent_register({ role: 'critique' })

// 2. Update status to show you're working
await agent_update_status({ 
  status: 'working', 
  task: 'Reviewing code/task' 
})

// 3. Do the critique work using CLI tool
// bun tools/critique-agent.ts code <file>
// bun tools/critique-agent.ts task <task_id>

// 4. Report findings
await agent_send({
  type: 'direct',
  to_agent: 'orchestrator', // or broadcast
  payload: {
    critique_type: 'code_review',
    file: '<file_path>',
    score: 8.5,
    issues_count: 3,
    critique_path: 'memory/critiques/<critique_file>.md'
  }
})

// 5. Update status and allow handoff
await agent_update_status({ status: 'idle' })
// Agent can now handoff since work is complete
```

### Listening for Task Completions
```typescript
// Check for tasks that need review
const messages = await agent_messages()
const taskCompletions = messages.filter(m => 
  m.type === 'task_complete' || m.type === 'task_completed'
)

for (const completion of taskCompletions) {
  // Check if task has files to review
  if (completion.payload?.files_created || completion.payload?.files_modified) {
    // Use CLI tool to critique
    await bash(`bun tools/critique-agent.ts task ${completion.payload.task_id}`)
  }
}
```

## Example Workflow

```
1. Orchestrator spawns critique agent via Task tool
2. Critique agent registers with role='critique'
3. Reads task completion messages or specific file assignment
4. Runs critique-agent.ts CLI tool for analysis
5. Saves critique to memory/critiques/
6. Sends findings via agent_send to orchestrator
7. Updates status to idle and hands off
```

## Quality Gates

Use critiques as quality gates:
- Score < 5: Block deployment, require fixes
- Score 5-7: Allow with warnings
- Score > 7: Approve

Always maintain the critique history for trend analysis and improvement tracking.
