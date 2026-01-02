---
name: multi-agent-patterns
description: Common patterns and best practices for multi-agent coordination
license: MIT
---

# Multi-Agent Coordination Patterns

Essential patterns for effective multi-agent system coordination.

## AGENT TYPES & ROLES

### 1. Orchestrator Agent
- **Role**: `orchestrator`
- **Responsibilities**: System-wide coordination, task distribution, monitoring
- **Key trait**: NEVER hands off (persistent)

### 2. Worker Agents
- **Roles**: `worker`, `code-explorer`, `dashboard-enhancer`, etc.
- **Responsibilities**: Execute specific tasks, report results
- **Key trait**: CAN hand off when task complete

### 3. Monitor Agents
- **Role**: `monitor`
- **Responsibilities**: System health, performance tracking, alerting
- **Key trait**: Long-running but can hand off

## COORDINATION PATTERNS

### 1. Sequential Task Chain
```typescript
// Task A must complete before Task B
agent.send({ type: "task_claim", payload: { task_id: "A" } })
// ... complete task A ...
agent.send({ type: "task_complete", payload: { task_id: "A", result: "..." } })
agent.send({ type: "task_claim", payload: { task_id: "B" } })
```

### 2. Parallel Task Distribution
```bash
# Spawn multiple workers for parallel execution
opencode run 'Worker 1 instructions...'
opencode run 'Worker 2 instructions...'
opencode run 'Worker 3 instructions...'
```

### 3. Supervisor Pattern
```typescript
// Orchestrator monitors workers
const agents = await agent_status()
const workers = agents.filter(a => a.role === 'worker')
workers.forEach(w => {
  if (isStale(w.last_heartbeat)) {
    // Spawn replacement worker
  }
})
```

### 4. Message Routing Pattern
```typescript
// Broadcast to all
agent_send({ type: "broadcast", payload: { ... } })

// Direct to specific agent
agent_send({ type: "direct", payload: { ... }, to_agent: "agent-id" })

// Task assignment
agent_send({ type: "task_claim", payload: { task_id: "..." } })
```

## COMMUNICATION BEST PRACTICES

### 1. Message Types
- **heartbeat**: Automatic liveness check
- **broadcast**: System-wide announcements
- **direct**: Targeted communication
- **task_claim**: Claim a task for processing
- **task_complete**: Report task completion
- **request_help**: Ask for assistance

### 2. Message Structure
```typescript
{
  type: "task_complete",
  payload: {
    task_id: "explore-opencode",
    status: "success",
    result: {
      files_analyzed: 42,
      report_location: "/reports/opencode-analysis.md"
    },
    duration_ms: 120000
  }
}
```

### 3. Status Updates
```typescript
// Regular status updates
agent_update_status({
  status: "working",
  task: "Analyzing codebase structure"
})

// Completion
agent_update_status({
  status: "idle",
  task: null
})
```

## TASK MANAGEMENT

### 1. Persistent Task Creation (via plugin tools)
```typescript
// Create a simple task
task_create({
  title: "Analyze system architecture",
  description: "Review and document system components",
  priority: "high",
  tags: ["architecture", "documentation"]
})

// Create a task with dependencies
task_create({
  title: "Deploy to production",
  description: "Deploy after all tests pass",
  priority: "high",
  depends_on: ["task_123_abc", "task_456_def"] // Must complete first
})
```

### 2. Task Dependencies
Tasks can depend on other tasks. A task with dependencies:
- Starts in "blocked" status if dependencies aren't complete
- Automatically becomes "pending" when all dependencies complete
- `task_next()` only returns tasks with satisfied dependencies

```typescript
// Create a task chain
const setupTask = await task_create({ title: "Setup environment" })
const buildTask = await task_create({ 
  title: "Build project", 
  depends_on: [setupTask.id] 
})
const testTask = await task_create({ 
  title: "Run tests", 
  depends_on: [buildTask.id] 
})
// testTask will be blocked until buildTask completes
// buildTask will be blocked until setupTask completes
```

### 3. Task Claiming & Assignment
```typescript
// Find next available task (respects dependencies)
const next = await task_next()

// Claim the task atomically (prevents conflicts)
if (next.task) {
  await task_claim({ task_id: next.task.id })
}

// Update task with notes
await task_update({
  task_id: "task_123",
  notes: "Progress: 50% complete"
})
```

### 4. Progress Tracking (via message bus)
```typescript
// Update progress
agent_send({
  type: "broadcast",
  payload: {
    task_id: "task-001",
    progress: 0.75,
    eta_minutes: 10
  }
})
```

## ERROR HANDLING

### 1. Graceful Failure
```typescript
try {
  // Execute task
} catch (error) {
  agent_send({
    type: "task_complete",
    payload: {
      task_id: "...",
      status: "failed",
      error: error.message
    }
  })
}
```

### 2. Retry Logic
```typescript
const MAX_RETRIES = 3
let attempt = 0
while (attempt < MAX_RETRIES) {
  try {
    // Try task
    break
  } catch (error) {
    attempt++
    if (attempt === MAX_RETRIES) {
      agent_send({ type: "request_help", payload: { ... } })
    }
  }
}
```

## WORKER POOLS

### 1. Spawning Worker Pools
Spawn multiple workers for parallel task execution:

```bash
# Spawn a pool of 3 workers for code analysis
for i in 1 2 3; do
  opencode run "You are WORKER-$i. Call agent_register with role=code-analyzer. 
  Poll task_next() for available code-analysis tasks.
  Claim tasks with task_claim. 
  Report results via agent_send type=task_complete.
  You CAN handoff when no more tasks are available." &
done
```

### 2. Worker Lifecycle
```
1. INIT: agent_register with role
2. POLL: task_next() or agent_messages for task_available
3. CLAIM: task_claim(task_id) - atomic assignment
4. EXECUTE: Do the work
5. COMPLETE: task_update status=completed, agent_send task_complete
6. REPEAT or HANDOFF
```

### 3. Worker Roles
- `code-analyzer`: Static analysis, code review
- `test-runner`: Execute and report test results
- `doc-writer`: Generate documentation
- `data-processor`: ETL, data transformation

## LOAD BALANCING

### 1. Check Agent Load
```typescript
const agents = await agent_status()
const workers = agents.filter(a => a.role !== 'orchestrator')

// Find idle workers
const idle = workers.filter(a => a.status === 'idle')

// Find least loaded worker
const leastLoaded = workers
  .sort((a, b) => (a.current_task ? 1 : 0) - (b.current_task ? 1 : 0))[0]
```

### 2. Task Distribution Strategy
```typescript
// Round-robin distribution
let workerIndex = 0
const assignTask = async (task) => {
  const workers = (await agent_status()).filter(a => a.role === 'worker')
  const target = workers[workerIndex % workers.length]
  workerIndex++
  
  await agent_send({
    type: "direct",
    to_agent: target.id,
    payload: { action: "work_on", task_id: task.id }
  })
}
```

### 3. Auto-scaling
```typescript
// Scale up if too many pending tasks
const pending = await task_list({ status: "pending" })
const workers = (await agent_status()).filter(a => a.role === 'worker')

if (pending.length > workers.length * 2) {
  // Spawn more workers
  for (let i = 0; i < Math.min(3, pending.length - workers.length); i++) {
    await spawn_worker("generic-worker")
  }
}
```

## AGENT COLLABORATION PATTERNS

### 1. Task Decomposition Pattern
Break complex tasks into smaller, parallelizable subtasks:

```typescript
// Orchestrator creates parent task and subtasks
const parentTask = await task_create({
  title: "Implement user authentication system",
  priority: "high",
  complexity: "complex"
})

// Create subtasks with dependencies on parent
const subtasks = [
  { title: "Create User model and migrations", tags: ["database"] },
  { title: "Implement login/logout endpoints", tags: ["api"] },
  { title: "Add password hashing utility", tags: ["security"] },
  { title: "Create auth middleware", tags: ["api"] },
  { title: "Write unit tests for auth", tags: ["testing"] }
]

for (const sub of subtasks) {
  await task_create({
    ...sub,
    priority: "medium",
    description: `Subtask of: ${parentTask.task.title}`,
    tags: [...sub.tags, `parent:${parentTask.task.id}`]
  })
}

// Spawn specialized workers for each tag
await spawn_worker("database-worker", { filter: ["database"] })
await spawn_worker("api-worker", { filter: ["api"] })
await spawn_worker("testing-worker", { filter: ["testing"] })
```

### 2. Result Aggregation Pattern
Combine results from multiple workers into a unified output:

```typescript
// Message structure for partial results
interface PartialResult {
  type: "partial_result"
  payload: {
    parent_task_id: string
    subtask_id: string
    result: any
    status: "success" | "failed"
  }
}

// Orchestrator collects and aggregates results
const collectResults = async (parentTaskId: string) => {
  const messages = await agent_messages()
  const partials = messages.filter(m => 
    m.type === "partial_result" && 
    m.payload.parent_task_id === parentTaskId
  )
  
  // Wait until all subtasks complete
  const subtasks = await task_list({ status: "all" })
  const childTasks = subtasks.filter(t => 
    t.tags?.includes(`parent:${parentTaskId}`)
  )
  
  const completed = childTasks.filter(t => t.status === "completed")
  if (completed.length === childTasks.length) {
    // Aggregate all results
    const aggregated = partials.map(p => p.payload.result)
    
    // Broadcast final aggregated result
    await agent_send({
      type: "task_complete",
      payload: {
        task_id: parentTaskId,
        result: { aggregated },
        subtasks_completed: completed.length
      }
    })
  }
}
```

### 3. Review Pattern (Agent Peer Review)
One agent reviews another's work before completion:

```typescript
// Worker submits work for review
await agent_send({
  type: "review_request",
  payload: {
    task_id: "task_abc",
    work_product: {
      files_changed: ["src/auth.ts", "src/auth.test.ts"],
      summary: "Implemented JWT authentication"
    },
    requested_by: agentId
  }
})

// Update task to "pending_review" status
await task_update({
  task_id: "task_abc",
  status: "pending_review",
  notes: "Awaiting peer review"
})

// Reviewer agent picks up review request
const reviews = (await agent_messages())
  .filter(m => m.type === "review_request")

for (const review of reviews) {
  // Analyze the work product
  const issues = await reviewCode(review.payload.work_product)
  
  // Send review result
  await agent_send({
    type: "review_complete",
    to_agent: review.payload.requested_by,
    payload: {
      task_id: review.payload.task_id,
      approved: issues.length === 0,
      issues,
      reviewer: agentId
    }
  })
}

// Original worker handles review feedback
const reviewResult = (await agent_messages())
  .find(m => m.type === "review_complete" && m.payload.task_id === taskId)

if (reviewResult.payload.approved) {
  await task_update({ task_id: taskId, status: "completed" })
} else {
  // Address issues and resubmit
  await fixIssues(reviewResult.payload.issues)
  await agent_send({ type: "review_request", ... })
}
```

### 4. Consensus Pattern
Multiple agents vote on a decision:

```typescript
// Orchestrator initiates vote
await agent_send({
  type: "broadcast",
  payload: {
    action: "vote_request",
    vote_id: "vote_123",
    question: "Should we migrate to TypeScript strict mode?",
    options: ["yes", "no", "abstain"],
    deadline_ms: 60000
  }
})

// Workers respond with votes
await agent_send({
  type: "vote_response",
  payload: {
    vote_id: "vote_123",
    choice: "yes",
    rationale: "Catches more bugs at compile time"
  }
})

// Orchestrator tallies votes
const collectVotes = async (voteId: string, deadline: number) => {
  await new Promise(r => setTimeout(r, deadline))
  
  const votes = (await agent_messages())
    .filter(m => m.type === "vote_response" && m.payload.vote_id === voteId)
  
  const tally = { yes: 0, no: 0, abstain: 0 }
  votes.forEach(v => tally[v.payload.choice]++)
  
  const winner = Object.entries(tally)
    .sort((a, b) => b[1] - a[1])[0][0]
  
  await agent_send({
    type: "broadcast",
    payload: {
      action: "vote_result",
      vote_id: voteId,
      result: winner,
      tally
    }
  })
}
```

### 5. Checkpoint Pattern
Save intermediate progress for resumability:

```typescript
// Worker periodically saves checkpoints
const saveCheckpoint = async (taskId: string, progress: any) => {
  const checkpointPath = `memory/checkpoints/${taskId}.json`
  
  await task_update({
    task_id: taskId,
    notes: JSON.stringify({
      checkpoint_time: new Date().toISOString(),
      progress_percent: progress.percent,
      checkpoint_path: checkpointPath
    })
  })
  
  // Save detailed checkpoint data
  writeFileSync(checkpointPath, JSON.stringify({
    task_id: taskId,
    timestamp: new Date().toISOString(),
    state: progress.state,
    completed_items: progress.completed,
    remaining_items: progress.remaining
  }, null, 2))
}

// New worker can resume from checkpoint
const resumeFromCheckpoint = async (taskId: string) => {
  const checkpointPath = `memory/checkpoints/${taskId}.json`
  
  if (existsSync(checkpointPath)) {
    const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf-8'))
    
    // Resume from saved state
    return {
      startFrom: checkpoint.completed_items.length,
      remaining: checkpoint.remaining_items,
      previousState: checkpoint.state
    }
  }
  
  return null // Start fresh
}
```

### 6. Pipeline Pattern
Chain agents in a processing pipeline:

```typescript
// Define pipeline stages
const pipeline = [
  { stage: "analyze", role: "code-analyzer" },
  { stage: "refactor", role: "code-refactorer" },
  { stage: "test", role: "test-runner" },
  { stage: "review", role: "code-reviewer" }
]

// Each stage creates output for next stage
const processPipeline = async (input: any) => {
  let stageInput = input
  
  for (const { stage, role } of pipeline) {
    // Create stage task
    const stageTask = await task_create({
      title: `Pipeline stage: ${stage}`,
      description: `Process: ${JSON.stringify(stageInput).slice(0, 100)}...`,
      tags: [`pipeline:${pipelineId}`, `stage:${stage}`]
    })
    
    // Assign to specialized worker
    await agent_send({
      type: "broadcast",
      payload: {
        action: "stage_ready",
        pipeline_id: pipelineId,
        stage,
        task_id: stageTask.task.id,
        input: stageInput
      }
    })
    
    // Wait for stage completion
    const result = await waitForTaskComplete(stageTask.task.id)
    stageInput = result.output
  }
  
  return stageInput // Final pipeline output
}
```

## PERFORMANCE OPTIMIZATION

### 1. Batched Operations
- Group related file reads
- Batch message processing
- Consolidate status updates

### 2. Resource Management
- Monitor token usage via memory_status()
- Check active agent count via agent_status()
- Balance workload across available workers

### 3. Caching Strategies
- Use knowledge-base.json for persistent insights
- Session-level state in working.md
- Message bus for ephemeral coordination

## ANTI-PATTERNS TO AVOID

### 1. Message Flooding
- Don't send messages in tight loops
- Batch updates when possible
- Use heartbeats sparingly (30s intervals)

### 2. Task Thrashing
- Don't claim tasks without intent to complete
- Avoid rapid claim/unclaim cycles
- Check task complexity before claiming

### 3. Agent Starvation
- Ensure fair task distribution
- Monitor idle workers
- Implement backpressure for overloaded agents

### 4. Deadlocks
- Avoid circular task dependencies
- Use timeouts for blocking operations
- Implement fallback handlers

Remember: Effective coordination is key to a healthy multi-agent system!