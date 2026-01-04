# Orchestrator Lifecycle and Shutdown Behavior

This document describes the orchestrator's complete lifecycle, from startup through normal shutdown and crash recovery, including critical cleanup operations that prevent data corruption and system resource leaks.

## Table of Contents

1. [Orchestrator Lifecycle Overview](#orchestrator-lifecycle-overview)
2. [Startup Phase](#startup-phase)
3. [Normal Operation](#normal-operation)
4. [Shutdown Paths](#shutdown-paths)
5. [Crash Detection and Recovery](#crash-detection-and-recovery)
6. [Agent Handoff Behavior](#agent-handoff-behavior)
7. [Leader Lease Management](#leader-lease-management)
8. [Log Rotation on Shutdown](#log-rotation-on-shutdown)
9. [State File Persistence](#state-file-persistence)
10. [Exit Codes and Diagnostics](#exit-codes-and-diagnostics)
11. [Graceful Degradation](#graceful-degradation)

## Orchestrator Lifecycle Overview

The orchestrator operates in a **strongly supervised** environment with a watchdog script that monitors its health continuously. The system is designed for autonomous operation with NO human intervention, so all shutdown paths must be safe, idempotent, and preserve system state.

```
┌──────────────┐
│    START     │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ STARTUP PHASE                                            │
│ ├─ Check leader election (exit if follower)             │
│ ├─ Initialize agent registry                            │
│ ├─ Load state from disk                                 │
│ └─ Ready for work (handoff disabled)                    │
└──────┬───────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────┐
│ NORMAL OPERATION (Main Loop)                            │
│ ├─ Maintain leader heartbeat (60s interval)             │
│ ├─ Delegate work to workers                             │
│ ├─ Process task completions                             │
│ ├─ Assess quality                                       │
│ └─ Monitor system health                                │
└──────┬────────────────────────────────────────────────────┘
       │
   ┌───┴────────────────────────────────────────────────┐
   │ (Intentional exit)                                 │
   │ (Process killed)                                   │
   │ (Crash detected)                                   │
   ▼                                                    ▼
┌──────────────────────────────────┐    ┌──────────────────────┐
│ GRACEFUL SHUTDOWN                │    │ CRASH/SIGNAL HANDLER │
│ ├─ Persist state                 │    │ ├─ Save emergent state
│ ├─ Unregister from registry      │    │ ├─ Exit immediately  │
│ ├─ Notify watchdog               │    │ └─ Watchdog restarts │
│ └─ Log rotation (if needed)      │    └──────────────────────┘
└──────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────┐
│ CLEANUP & EXIT                   │
│ └─ Watchdog detects exit         │
└──────────────────────────────────┘
       │
   ┌───┘
   │ (if healthy leader exists and exit clean)
   │ OR (if no pending work)
   ▼
   SYSTEM STABLE - Watchdog awaits next check
   
   OR

   Watchdog spawns replacement orchestrator
```

## Startup Phase

### 1. Process Initialization

When the orchestrator starts (via `opencode run` through spawn-worker.sh):

1. **Bun runtime initializes** - Allocates memory, loads TypeScript/JavaScript
2. **Plugin auto-boot** (from `.opencode/plugin/index.ts`):
   - Hook: `session.start` fires
   - Injects system context into prompt
   - Loads `memory/working.md` for continuity
   - Records session start to `memory/sessions.jsonl`

3. **Orchestrator prompt executes** - Specialized prompt for coordination tasks
4. **First tool call: `agent_register(role='orchestrator')`**

### 2. Leader Election

During agent registration, the orchestrator:

```typescript
// .opencode/plugin/tools/agent-tools.ts - agent_register()
1. Read memory/orchestrator-state.json
   - If missing or lease expired → Attempt to become leader
   - Increment leader_epoch (prevent split-brain)
   - Write leader_id, leader_epoch, last_heartbeat, ttl_ms
   
2. If healthy leader exists → Log "Deferring to leader X" → Exit gracefully
3. If I won election → Proceed with orchestration
```

The leader lease structure:
```json
{
  "leader_id": "agent-1767558030320-oph5p",
  "leader_epoch": 24,
  "last_heartbeat": "2026-01-04T15:50:00Z",
  "ttl_ms": 180000
}
```

**Key point**: An orchestrator that loses the election **exits immediately** with code 0 (clean exit). The watchdog detects this and does NOT respawn a replacement, trusting the leader to handle everything.

### 3. Disable Handoff

Critical initialization step:
```typescript
// Must be called before any work delegation
agent_set_handoff(enabled=false)
```

This prevents the orchestrator from auto-stopping when idle. Without this, the orchestrator would terminate after ~5-8 minutes of inactivity, causing:
- Leader lease expiration
- Watchdog restart loop
- Unnecessary session overhead

See [Session 183 findings](/docs/HEARTBEAT_SERVICE.md) for the root cause and fix via background heartbeat service.

## Normal Operation

### Main Coordination Loop

```
while (orchestrator is running) {
  1. Check: Do I have leader lease? (heartbeat check)
  2. Read: Get pending tasks from memory/tasks.json
  3. Filter: Find highest-priority unblocked task
  4. Spawn: Launch worker via spawn-worker.sh
  5. Monitor: Check for agent_messages() of type task_complete
  6. Assess: Run quality_assess() on completed work
  7. Pause: ~30-60s before next iteration
}
```

### Heartbeat Mechanism

The orchestrator maintains leader election through:

1. **In-process heartbeats** (JavaScript setInterval):
   - Every 60 seconds, refresh `last_heartbeat` in orchestrator-state.json
   - Fail-safe: If setInterval dies (session idle), heartbeat stops

2. **Background heartbeat service** (shell script loop):
   - Started by watchdog on orchestrator spawn
   - Runs independently via `nohup` + shell loop
   - Updates orchestrator-state.json every 60 seconds
   - **Survives** session idle and JavaScript death
   - Prevents unnecessary respawns (Session 183 fix)

See `/docs/HEARTBEAT_SERVICE.md` for implementation details.

## Shutdown Paths

### Path 1: Graceful Shutdown (Leader Completes Work)

Triggered when:
- Orchestrator has processed all pending high-priority tasks
- No active workers are running
- System is in stable state

**Behavior**:
```
1. Final state save
   - Current agent-registry.json written to disk
   - Last completed task marked in tasks.json
   - Session end logged to sessions.jsonl
   
2. Working memory update
   - Update memory/working.md with session summary
   - Extract learnings (session-summarizer.ts)
   - Save discoveries to knowledge-base.json
   
3. Unregister from registry
   - Remove orchestrator ID from agent-registry.json
   - Clear leader lease (set leader_id to null)
   
4. Log rotation check
   - If realtime.log > 4.5MB, rotate to archives/
   - If coordination.log > 10MB, archive with timestamp
   
5. Return exit code 0 (success)
```

### Path 2: Intentional Exit (Non-Leader)

Triggered during startup when:
- Another healthy orchestrator holds leader lease
- Or: Worker finished task and has `agent_set_handoff(enabled=true)`

**Behavior**:
```
1. Log: "Deferring to leader X" or "Task complete, handing off"
2. Unregister from agent-registry.json (if registered)
3. Return exit code 0 (clean exit, not an error)
```

The watchdog **does not respawn** when exit code is 0 (clean exit).

### Path 3: Signal-Based Shutdown (SIGTERM/SIGINT)

Triggered by:
- `orchestrator-watchdog.sh stop` command
- `kill -TERM <pid>`
- System shutdown/reboot

**Behavior in watchdog.sh**:
```bash
# orchestrator-watchdog.sh - stop_orchestrator()
1. Send SIGTERM to orchestrator process
2. Wait up to 10 seconds for graceful exit
3. If still running: Send SIGKILL
4. Record shutdown reason to .orchestrator-last-exit.json
5. Note: signal handlers in plugin may not run if kill -9 used
```

**Orchestrator behavior**:
- If time permits: Flush state files and unregister
- If killed forcefully: Plugin cleanup runs on restart via session.start hook

### Path 4: Abnormal Exit (Crash)

Triggered by:
- Unhandled exception in code
- Out of memory (OOM)
- Process killed by external force
- Watchdog timeout (max time)

**Behavior**:
```
1. Exit code ≠ 0 (crash indicator)
2. Watchdog detects non-zero exit
3. Captures stderr tail (last 80 lines) → orchestrator-failures/ dir
4. Records crash details:
   - Exit code
   - PID
   - Restart count
   - Model used
   - Failure reason (if detectable)
5. If too many crashes in 120s → Enable backoff delay
6. Spawn new orchestrator
```

See [Exit Codes and Diagnostics](#exit-codes-and-diagnostics) for detailed exit code meanings.

## Agent Handoff Behavior

### What "Handoff" Means

The `agent_set_handoff(enabled)` setting controls whether an agent **auto-stops** when idle:

- **Enabled (enabled=true)**: Agent stops automatically after ~5-8 minutes of no tool calls
  - **Desired for**: Workers, one-off agents
  - Auto-exit saves resources
  - Safe because work is complete

- **Disabled (enabled=false)**: Agent stays alive indefinitely, even if idle
  - **Desired for**: Orchestrator agent
  - Maintains leader lease
  - Continues monitoring system
  - **CRITICAL**: Must call this on orchestrator startup

### Orchestrator Handoff Rules

```typescript
// Plugin system message injection
if (agentRole === 'orchestrator') {
  // Add to system prompt:
  "Call agent_set_handoff(enabled=false) IMMEDIATELY after agent_register()"
  "This is CRITICAL - without it, you will auto-exit after 5-8 min of idle"
}
```

### Worker Handoff Rules

```typescript
// Worker spawning via spawn-worker.sh
// Default: workers have handoff ENABLED
// After completing task:
//   1. agent_send(type='task_complete', payload={...})
//   2. Optional: agent_set_handoff(enabled=true)  // Accelerate shutdown
//   3. Return/exit naturally
```

## Leader Lease Management

### Lease Structure

```json
{
  "leader_id": "agent-1234567890-abcde",    // Unique orchestrator ID
  "leader_epoch": 24,                       // Fencing token (prevents split-brain)
  "last_heartbeat": "2026-01-04T15:50:00Z", // ISO timestamp
  "ttl_ms": 180000                          // 3 minutes: 180,000 ms
}
```

### Heartbeat Updates

**Leader responsibilities** (every 60 seconds):
```typescript
// From plugin: agent_register() after becoming leader
1. Read orchestrator-state.json
2. Check: Is my leader_id still in the file?
3. If yes: Update last_heartbeat to now()
4. If no: Another orchestrator stole leadership (this shouldn't happen)
5. Write back to orchestrator-state.json
```

**Failure mode**: If heartbeat fails to update:
- 60s: TTL expires (180s has passed)
- Watchdog checks: `last_heartbeat` > now - 180s = FALSE
- Watchdog decides: No healthy leader
- Watchdog spawns: New orchestrator
- New orchestrator increments epoch (prevents split-brain)

### Cleanup on Shutdown

**When an orchestrator exits** (gracefully or via crash):

1. **Plugin session.end hook runs**:
   - Calls `agent_unregister()`
   - Removes agent ID from agent-registry.json
   - Does NOT clear leader_id (another leader may take over)

2. **Watchdog can optionally clear lease**:
   ```bash
   # orchestrator-watchdog.sh - on graceful exit
   if [[ $exit_code -eq 0 ]]; then
     # Could clear leader lease here, but prefer to let next leader handle it
     # This avoids race condition where old leader clears just before new leader checks
   fi
   ```

3. **Next orchestrator on startup**:
   - Checks leader_id in orchestrator-state.json
   - If last_heartbeat > 180s ago: Lease is dead
   - Increment epoch (security: prevents reusing old epoch)
   - Write new leader_id + epoch
   - Become new leader

### Epoch Fencing (Prevents Split-Brain)

Why do we have `leader_epoch`?

**Scenario**: Two orchestrators think they are leader
- Orchestrator A increments epoch to 24, becomes leader
- Orchestrator B has cached epoch 23 (stale)
- Both try to update leader lease simultaneously
- Without fencing: Both could succeed, creating inconsistency

**Solution**: Epoch fencing via atomic writes
```typescript
// When writing to orchestrator-state.json:
const oldState = JSON.parse(readFileSync('orchestrator-state.json'));
if (oldState.leader_epoch > myEpoch) {
  // Another orchestrator is already leader with higher epoch
  // DO NOT overwrite - exit gracefully
}
// Safe to write our new epoch
newState.leader_epoch = myEpoch;
writeFileSync('orchestrator-state.json', JSON.stringify(newState));
```

## Log Rotation on Shutdown

### Realtime Log Rotation

The realtime.log file captures all plugin events and can grow unbounded. It's automatically rotated:

**When**: Before every log write (checkAndRotateRealtimeLog)
- **Threshold**: > 5MB
- **Action**:
  1. Read last 5,000 lines of realtime.log
  2. Save older lines to `realtime-archives/realtime-2026-01-04T15-50-00Z.log`
  3. Keep last 5,000 lines in realtime.log
  4. Log WARN if file exceeds 4.5MB (alert before rotation)

**On shutdown**:
- Rotation happens automatically on final log writes (session.end hook)
- No special cleanup needed

### Coordination Log Rotation

The coordination.log tracks agent messages, heartbeats, and leadership changes. It grows at ~10KB/hour.

**Current**: No automatic rotation (future task: add rotation task_1767558067916_6d4dco)

**On shutdown**:
- Could be archived manually via tools/working-memory-manager.ts
- Or left as-is for next session to review

### Log Preservation

**Why not delete logs on shutdown?**
1. Historical record needed for debugging
2. Many failures require log inspection
3. Archives provide learning material for future sessions
4. Orchestrator may not have permission to delete (safety)

**Log retention policy**:
- realtime.log: Keep last 5,000 lines + archives (historical)
- coordination.log: Keep all (grows slowly, space-efficient)
- watchdog.log: Keep all (size-limited by rotation in watchdog.sh)

## State File Persistence

### Critical State Files

| File | Purpose | On Shutdown | Crash Safety |
|------|---------|-------------|--------------|
| `tasks.json` | Task queue | Persisted ✅ | Atomic writes ✅ |
| `agent-registry.json` | Active agents | Unregister current | File lock ✅ |
| `orchestrator-state.json` | Leader election | Keep lease (next leader handles) | Atomic writes ✅ |
| `sessions.jsonl` | Session history | Append session end | Append-only ✅ |
| `knowledge-base.json` | Learnings | Merge new insights | Atomic writes ✅ |
| `message-bus.jsonl` | Agent messages | Append final messages | Append-only ✅ |
| `quality-assessments.json` | Task scores | Add new scores | Atomic writes ✅ |

### Write Safety Mechanisms

**1. Atomic writes** (for JSON files):
```typescript
// Anti-pattern (UNSAFE):
const data = JSON.parse(readFileSync('file.json'));
data.field = newValue;
writeFileSync('file.json', JSON.stringify(data));
// Risk: Process killed between read and write → partial update

// Correct pattern (SAFE):
const tmpFile = 'file.json.tmp';
writeFileSync(tmpFile, JSON.stringify(newData));
renameSync(tmpFile, 'file.json');  // Atomic on POSIX
```

All state files use this pattern in `tools/shared/json-utils.ts`.

**2. File locks** (for coordination):
```typescript
// When claiming a task or updating agent status:
const lockPath = 'memory/.tasks.lock';
while (existsSync(lockPath)) {
  // Spin-wait for lock release (quick, only milliseconds)
}
writeFileSync(lockPath, 'locked');
// Update state...
unlinkSync(lockPath);
```

**3. Append-only logs** (for journals):
- `message-bus.jsonl`: Never overwrite, only append
- `sessions.jsonl`: Never overwrite, only append
- `tool-timing.jsonl`: Never overwrite, only append
- **Safety**: Concurrent appends are safe (OS-level atomicity)

### State Recovery on Crash

When the orchestrator crashes and is respawned:

```
1. new orchestrator starts
2. session.start hook runs
3. Plugin loads memory/working.md
4. agent_register() reads task list from tasks.json
5. Sees: "Some tasks in_progress" (from old orchestrator)
6. Tasks remain pending (not lost)
7. New orchestrator claims old tasks and resumes work
```

**Key invariant**: Tasks never disappear, only transition between states (pending → in_progress → completed).

## Exit Codes and Diagnostics

### Exit Code Meanings

| Code | Meaning | Watchdog Action | Recovery |
|------|---------|-----------------|----------|
| **0** | Clean exit (intentional or non-leader) | Do not respawn | Normal - wait for next check |
| **1** | Unhandled exception | Respawn | Check stderr in orchestrator-failures/ |
| **127** | Command not found (bun/opencode missing) | Respawn with backoff | Check environment variables |
| **137** | SIGKILL (forceful kill) | Respawn | Check system logs (OOM killer?) |
| **143** | SIGTERM (graceful kill request) | Do not respawn | Normal - signal was sent intentionally |
| **255** | Generic error / stack overflow | Respawn | Check stderr for clues |

### Diagnostic Files

On startup failure, watchdog captures:

```
logs/orchestrator-failures/
├── orchestrator-startup-2026-01-04T15-50-00Z.log
│   └── Last 80 lines of stderr
└── orchestrator-crash-2026-01-04T15-55-00Z.log
    └── Crash details: PID, exit code, reason

memory/
├── .orchestrator-last-exit.json
│   ├── recorded_at: ISO timestamp
│   ├── pid: process ID
│   ├── exit_code: 0 | 1 | 127 | 137 | ...
│   ├── kind: "startup_failed" | "crash" | "clean_exit"
│   ├── reason: human-readable description
│   └── stop_requested: true if watchdog sent SIGTERM
│
├── .orchestrator-last-failure.json
│   ├── kind: "startup_failed"
│   ├── pid, exit_code, restart_count
│   ├── model: which model was running
│   └── stderr_log: last N lines of stderr
│
└── .orchestrator-current-stderr.json
    └── Sanitized stderr preview (first occurrence only)
```

### Common Failure Scenarios

**1. Exit Code 0 in Watchdog Logs**
- Appears as "clean exit" but no obvious shutdown trigger
- **Likely cause**: Non-leader orchestrator exiting after detecting leader
- **Remedy**: Check agent-registry.json for competing orchestrators
- **Prevention**: Ensure only one orchestrator running at a time

**2. Exit Code 137 (SIGKILL)**
- Usually indicates: Out-of-memory (OOM) killer
- Or: External process killed with `kill -9`
- **Remedy**: Check system logs: `dmesg | grep -i oom`
- **Prevention**: Monitor memory usage with `bun tools/cli.ts monitor`

**3. Repeated Restarts (crash loop)**
- Same error repeated 3+ times within 120 seconds
- **Watchdog response**: Enable exponential backoff (delay before respawn)
- **Manual remedy**: Kill watchdog, fix root cause, restart

## Graceful Degradation

### What Happens If State Files Corrupt

All state files have recovery mechanisms:

**Corrupted tasks.json**:
```typescript
// In task_list():
try {
  const tasks = JSON.parse(readFileSync('tasks.json'));
  return tasks.tasks || [];
} catch (error) {
  log("WARN", "tasks.json corrupted, using empty list");
  return [];  // Continue with no pending tasks
}
// User can manually fix or recreate tasks.json
```

**Corrupted agent-registry.json**:
```typescript
// In agent_register():
try {
  const registry = JSON.parse(readFileSync('agent-registry.json'));
  // Use existing registry
} catch (error) {
  log("WARN", "agent-registry.json corrupted, reinitializing");
  const newRegistry = { agents: [], leader: null };
  writeFileSync('agent-registry.json', JSON.stringify(newRegistry));
}
```

**Corrupted orchestrator-state.json**:
```typescript
// In agent_register() for orchestrator:
try {
  const state = JSON.parse(readFileSync('orchestrator-state.json'));
  if (state.leader_id && isHealthy(state)) {
    // Existing leader is healthy, defer to it
  } else {
    // Leader is dead or state is corrupt, claim leadership
  }
} catch (error) {
  log("WARN", "orchestrator-state.json corrupted, claiming leadership");
  // Become leader (epoch 1)
}
```

### Watchdog Resilience

The watchdog script itself is protected:

1. **Non-interactive shell script** (`#!/bin/bash`)
   - No dependency on TypeScript/Bun runtime
   - Runs independently of orchestrator
   - Can function even if orchestrator is completely broken

2. **Health checks**:
   - Verifies orchestrator PID exists
   - Checks leader lease hasn't expired
   - Validates token usage doesn't exceed limits
   - Monitors restart frequency

3. **Fallback behaviors**:
   - If config file missing: Use hardcoded defaults
   - If metadata files missing: Recreate on next startup
   - If leader election stuck: Wait grace period, then spawn new leader

### System Stability Targets

Based on configuration in orchestrator-watchdog.sh:

| Metric | Target | Action if Exceeded |
|--------|--------|-------------------|
| Max restarts | 50/hour | Enable backoff (wait 5-30s before next restart) |
| Leader TTL | 180s | Spawn replacement orchestrator if heartbeat missed |
| Token usage | 150k total | End session and respawn with fresh context |
| Idle timeout | None (disabled) | Orchestrator stays alive via background heartbeat |

---

## Related Documentation

- [LEADER_ELECTION.md](./LEADER_ELECTION.md) - Detailed leader election tuning guide
- [HEARTBEAT_SERVICE.md](./HEARTBEAT_SERVICE.md) - Background heartbeat service (prevents respawn loop)
- [REALTIME_LOG_MONITORING.md](./REALTIME_LOG_MONITORING.md) - Log rotation and monitoring
- [AGENTS.md](../AGENTS.md) - Project structure and conventions

## Summary

The orchestrator is designed as a **robust, autonomous system** that:

✅ **Survives crashes** - Watchdog respawns and recovers state from disk
✅ **Prevents split-brain** - Leader election with epoch fencing
✅ **Preserves data** - Atomic writes and append-only journals
✅ **Graceful shutdown** - Clean state persistence and unregistration
✅ **Self-healing** - Corruption recovery and fallback behaviors
✅ **No human intervention** - All decisions are autonomous and safe

The shutdown behavior reflects these principles: safe, automatic, and always preserving system integrity.
