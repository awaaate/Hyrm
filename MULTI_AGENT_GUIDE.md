# Multi-Agent Coordination System

**Version**: 1.0.0  
**Date**: 2025-12-31  
**Status**: ✅ Deployed and Active

---

## Overview

The Multi-Agent Coordination System enables multiple OpenCode agents to work together in parallel, sharing state, communicating, and coordinating tasks without conflicts.

### Key Features

✅ **Agent Registry** - Track all active agents with heartbeat monitoring  
✅ **Message Bus** - Inter-agent communication (broadcast & direct)  
✅ **File Locking** - Prevent concurrent modification conflicts  
✅ **Auto-Registration** - Agents auto-register on session start  
✅ **Real-Time Logging** - All coordination events logged to `memory/coordination.log`  
✅ **Native Tools** - Built-in OpenCode tools for agent coordination

---

## Architecture

### Components

1. **Agent Registry** (`memory/agent-registry.json`)
   - Tracks all active agents
   - Heartbeat-based liveness detection (5-minute timeout)
   - Optimistic locking for concurrent updates
   - Auto-cleanup of stale agents

2. **Message Bus** (`memory/message-bus.jsonl`)
   - JSONL-based message queue
   - Supports broadcast and direct messages
   - Read receipts to track message consumption
   - Message types: broadcast, direct, task_claim, task_complete, heartbeat, request_help

3. **Coordination Log** (`memory/coordination.log`)
   - Real-time event logging
   - Structured format with timestamps and agent IDs
   - All agent actions logged (register, unregister, messages, status updates)

4. **Plugin Integration** (`.opencode/plugin/index.ts`)
   - Auto-registers agents on `session.created`
   - Auto-unregisters on `session.idle`
   - Provides native tools via OpenCode plugin API
   - Injects multi-agent awareness into context

---

## Usage

### For AI Agents

Agents are **automatically registered** when a session starts. No manual action needed!

#### Check Active Agents

```typescript
// Use the native tool
agent_status()
```

**Returns**:
```json
{
  "success": true,
  "agent_count": 2,
  "agents": [
    {
      "id": "agent-1735679100-abc123",
      "session": "session-xyz",
      "role": "general",
      "status": "working",
      "task": "Implementing multi-agent system",
      "last_heartbeat": "2025-12-31T19:45:00.000Z"
    }
  ]
}
```

#### Send Message to Other Agents

```typescript
// Broadcast to all agents
agent_send({
  type: "broadcast",
  payload: {
    status: "I'm working on the memory system",
    progress: "50%"
  }
})

// Direct message to specific agent
agent_send({
  type: "direct",
  to_agent: "agent-1735679100-abc123",
  payload: {
    question: "Are you working on file X?",
    file: "/path/to/file.ts"
  }
})

// Request help
agent_send({
  type: "request_help",
  payload: {
    task: "Need help optimizing SQL queries",
    details: { file: "database.ts", line: 42 }
  }
})
```

#### Read Messages from Other Agents

```typescript
// Get all unread messages (marks as read by default)
agent_messages()

// Get messages without marking as read
agent_messages({ mark_read: false })
```

**Returns**:
```json
{
  "success": true,
  "message_count": 3,
  "messages": [
    {
      "id": "msg-1735679200-xyz",
      "from": "agent-1735679100-abc123",
      "type": "broadcast",
      "timestamp": "2025-12-31T19:46:00.000Z",
      "payload": {
        "status": "Completed memory optimization",
        "tokens_saved": 1500
      }
    }
  ]
}
```

#### Update Your Status

```typescript
// Update status and current task
agent_update_status({
  status: "working",
  task: "Refactoring authentication module"
})

// Available statuses: "active", "idle", "working", "blocked"
```

### For CLI/Manual Testing

```bash
# Check active agents
bun run tools/multi-agent-coordinator.ts status

# Send message manually
bun run tools/multi-agent-coordinator.ts send broadcast '{"status":"testing"}'

# View unread messages
bun run tools/multi-agent-coordinator.ts messages

# Clean up stale entries
bun run tools/multi-agent-coordinator.ts cleanup
```

---

## How It Works

### Agent Lifecycle

1. **Session Start** (`session.created` hook)
   - Plugin creates `MultiAgentCoordinator` instance
   - Agent registers in `agent-registry.json` with unique ID
   - Heartbeat starts (updates every 30 seconds)
   - Broadcasts "Agent online" message

2. **During Session**
   - Agent can send/receive messages via tools
   - Status updates tracked in registry
   - All actions logged to `coordination.log`
   - File locks can be requested for conflict prevention

3. **Session End** (`session.idle` hook)
   - Agent unregisters from registry
   - Heartbeat stops
   - Registry cleaned up automatically

### Message Flow

```
Agent A                Message Bus              Agent B
   |                        |                       |
   |-- send(broadcast) ---->|                       |
   |                        |-----> poll() -------->|
   |                        |<-- mark_read() -------|
   |                        |                       |
   |<-- send(direct) -------|<---------------------|
   |-- mark_read() -------->|                       |
```

### Conflict Resolution

When multiple agents need to modify the same file:

```typescript
// Agent A
const coordinator = new MultiAgentCoordinator();
if (coordinator.requestFileLock("/path/to/file.ts", 10000)) {
  // Modify file safely
  writeFileSync("/path/to/file.ts", newContent);
  coordinator.releaseFileLock("/path/to/file.ts");
} else {
  // Lock timeout - another agent is using the file
  console.log("File is locked, waiting...");
}
```

**Lock Features**:
- Timeout-based (default 10 seconds)
- Automatic stale lock cleanup (2 minutes)
- Process ID tracking
- Graceful retry with exponential backoff

---

## File Structure

```
workspace/
├── memory/
│   ├── agent-registry.json       # Active agents
│   ├── message-bus.jsonl         # Inter-agent messages
│   ├── coordination.log          # All coordination events
│   └── realtime.log              # General plugin events
├── tools/
│   └── multi-agent-coordinator.ts # Core coordinator class
└── .opencode/
    └── plugin/
        └── index.ts              # Plugin with agent tools
```

---

## Agent Registry Schema

```typescript
{
  "version": "1.0.0",
  "agents": [
    {
      "agent_id": "agent-1735679100-abc123",
      "session_id": "session-xyz",
      "started_at": "2025-12-31T19:45:00.000Z",
      "last_heartbeat": "2025-12-31T19:46:30.000Z",
      "status": "working" | "idle" | "active" | "blocked",
      "current_task": "Task description",
      "assigned_role": "memory-worker" | "system-optimizer" | "general",
      "pid": 12345
    }
  ],
  "last_updated": "2025-12-31T19:46:30.000Z",
  "lock_version": 42  // Optimistic locking
}
```

---

## Message Schema

```typescript
{
  "message_id": "msg-1735679200-xyz",
  "from_agent": "agent-1735679100-abc123",
  "to_agent": "agent-1735679200-def456",  // null for broadcast
  "timestamp": "2025-12-31T19:46:00.000Z",
  "type": "broadcast" | "direct" | "task_claim" | "task_complete" | "heartbeat" | "request_help",
  "payload": { /* arbitrary JSON */ },
  "read_by": ["agent-1735679200-def456"]  // Track who read this
}
```

---

## Best Practices

### For Agents

1. **Check for other agents before starting major work**
   ```typescript
   const { agents } = await agent_status();
   if (agents.some(a => a.task?.includes("memory system"))) {
     console.log("Another agent is working on memory - coordinating...");
   }
   ```

2. **Broadcast your intentions**
   ```typescript
   agent_update_status({ 
     status: "working", 
     task: "Refactoring authentication module" 
   });
   agent_send({
     type: "broadcast",
     payload: { starting_task: "auth refactor", estimated_time: "10 min" }
   });
   ```

3. **Use file locks for critical sections**
   ```typescript
   if (coordinator.requestFileLock(criticalFile)) {
     try {
       // Modify file
     } finally {
       coordinator.releaseFileLock(criticalFile);
     }
   }
   ```

4. **Poll messages periodically**
   ```typescript
   const messages = await agent_messages();
   if (messages.message_count > 0) {
     // Process messages from other agents
   }
   ```

### For Developers

1. **Monitor coordination.log** for debugging
   ```bash
   tail -f workspace/memory/coordination.log
   ```

2. **Clean up stale entries** if registry gets bloated
   ```bash
   bun run tools/multi-agent-coordinator.ts cleanup
   ```

3. **Test with multiple agents** before deploying
   ```bash
   # Terminal 1
   opencode run "Test agent coordination - I'll work on memory"
   
   # Terminal 2
   opencode run "Test agent coordination - I'll work on tools"
   ```

---

## Current State

As of **2025-12-31 19:45**:

- ✅ Multi-agent coordinator implemented
- ✅ Plugin integration complete
- ✅ Native tools available (`agent_*`)
- ✅ Auto-registration on session start
- ✅ Real-time logging operational
- ✅ Message bus functional
- ✅ File locking implemented

**Active Agents**: Check `agent_status()` or view `memory/agent-registry.json`

**Known Limitations**:
- Heartbeat interval is 30 seconds (might miss fast crashes)
- File locks have 2-minute stale timeout (conservative)
- Message bus is append-only (grows unbounded - needs pruning)

**Future Improvements**:
- Automatic message bus pruning (archive old messages)
- Task assignment coordination (prevent duplicate work)
- Load balancing for distributed tasks
- Agent role specialization (memory-worker, test-runner, etc.)

---

## Troubleshooting

### Agent not appearing in registry
- Check `memory/coordination.log` for registration errors
- Verify plugin is loaded (check console on session start)
- Ensure `memory/` directory exists

### Messages not being received
- Check `memory/message-bus.jsonl` exists
- Verify agent is registered (`agent_status()`)
- Try with `mark_read: false` to see if already read

### File lock timeout
- Another agent may be holding the lock
- Check for stale locks: `ls workspace/**/*.lock`
- Manually remove if needed: `rm workspace/path/to/file.lock`

### Stale agents in registry
- Run cleanup: `bun run tools/multi-agent-coordinator.ts cleanup`
- Agents with heartbeat >5 minutes old are considered dead

---

**End of Multi-Agent Guide**
