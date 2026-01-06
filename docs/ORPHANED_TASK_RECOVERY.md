# Orphaned Task Detection & Recovery Mechanism

## Overview

The orphaned task recovery mechanism automatically detects and recovers from tasks that become stuck in `in_progress` status when their assigned worker agent becomes stale (no longer active). This prevents long-term task loss and enables graceful recovery without manual intervention.

**Purpose**: Prevent catastrophic task loss like task_1767558071507_779q2v which remained stuck for 48+ hours with no way to recover.

## Architecture

### Detection

**Trigger**: Automatic detection runs during plugin initialization when any session starts (via `handleSessionCreated()` in `.opencode/plugin/index.ts` lines 1635-1640)

**Criteria**: A task is identified as orphaned if ALL of these conditions are met:
1. **Status**: Task is in `in_progress` state
2. **Age**: Task was claimed/started >2 hours ago (2 * 60 * 60 * 1000 ms)
3. **Agent Stale**: The assigned agent is NOT in the active agent registry
4. **Timestamp**: Task has a valid `claimed_at` timestamp (required to calculate age)

**Code Location**: `.opencode/plugin/index.ts` lines 1459-1551 (`detectOrphanedTasks()` function)

### Recovery Protocol

When orphaned tasks are detected:

1. **Logging**: Log WARNING to realtime.log with:
   - Count of orphaned tasks detected
   - Details: task ID, title, age in minutes, stale agent ID

2. **Status Update**: Mark each orphaned task as `blocked`:
   - Set `task.status = "blocked"`
   - Update `task.updated_at` to current timestamp
   - Add recovery note to `task.notes` array with timestamp and details

3. **Persistence**: Write updated tasks.json back to disk

4. **Availability**: Task is now available for re-assignment or respawn:
   - Orchestrator can detect blocked task via `task_list(status="blocked")`
   - Task can be manually re-assigned via `task_update()`
   - Task can be respawned via `task_spawn()` if needed

## Usage & Monitoring

### Automatic Detection

No action needed - detection runs automatically on every session start:

```bash
# Session starts → Plugin boot sequence runs
# handleSessionCreated() is called
# → detectOrphanedTasks(memoryDir) is invoked
# → Any orphaned tasks are marked blocked
```

### Viewing Orphaned Tasks

Once recovered, orphaned tasks appear as `blocked`:

```bash
# View all blocked tasks
bun tools/cli.ts tasks --status blocked

# View specific orphaned task
bun tools/task-manager.ts show <task_id>
# Will show: status="blocked", notes containing recovery note
```

### Recovery Actions

**Option 1: Re-assign to new worker**
```bash
bun tools/task-manager.ts update <task_id> --status pending
# Task returns to pending, available for next worker to claim
```

**Option 2: Respawn with worker**
```bash
bun tools/spawn-worker.sh <task_id>
# Spawns new worker process for the task
```

**Option 3: Manual investigation**
```bash
# View recovery details in task.notes
bun tools/task-manager.ts show <task_id> | grep notes
# Shows: "Orphaned task recovery: Task was in_progress for N minutes..."
```

## Configuration

### Detection Threshold

**Orphan Age Threshold**: 2 hours (2 * 60 * 60 * 1000 ms)
- **Location**: `.opencode/plugin/index.ts` line 1478
- **Rationale**: 2 hours is reasonable for finding legitimately stuck tasks while avoiding false positives for long-running tasks
- **Tuning**: To adjust, modify `ORPHAN_THRESHOLD_MS` constant

**Example threshold adjustments:**
```typescript
// Strict - catch orphans at 1 hour
const ORPHAN_THRESHOLD_MS = 1 * 60 * 60 * 1000;

// Lenient - allow 4 hours before marking orphaned
const ORPHAN_THRESHOLD_MS = 4 * 60 * 60 * 1000;
```

### Agent Staleness

Uses existing `AGENT_STALE_THRESHOLD` (2 minutes) from agent registry cleanup:
- Agent is considered stale if no heartbeat received for >2 minutes
- Registry is cleaned up at start of `handleSessionCreated()`
- Orphaned task detection uses the cleaned registry

## Implementation Details

### Data Flow

```
Session Start
    ↓
handleSessionCreated()
    ↓
Clean stale agents from registry
    ↓
detectOrphanedTasks()
    ├─ Read tasks.json
    ├─ Read agent-registry.json (cleaned)
    ├─ For each in_progress task:
    │   ├─ Check if claimed_at exists
    │   ├─ Check if age > 2 hours
    │   └─ Check if assigned_to agent is stale
    ├─ Log results to realtime.log
    ├─ Mark orphans as blocked
    ├─ Add recovery notes
    └─ Write tasks.json
    ↓
Task is now available for re-assignment
```

### Error Handling

- **Silent fail** on file corruption or parse errors
- **Logs WARNING** with error string if detection fails
- **Does not crash startup** - orphan detection is best-effort
- **Recoverable** - next session will retry detection if initial attempt failed

### Performance

- **Runtime**: O(n) where n = number of tasks
  - Single pass through task list
  - Single pass to mark orphans
  - Minimal file I/O (read registry once, read tasks once, write tasks once if needed)
- **Scale**: Tested with 140+ tasks (current system size) - negligible impact
- **Frequency**: Runs once per session start - no continuous polling

## Testing

### Test Coverage

The mechanism is validated with:

**Test 1: Basic orphaned task detection**
- Creates in_progress task claimed 3 hours ago
- Assigns to stale agent (not in registry)
- Verifies task marked as blocked
- ✓ PASS

**Test 2: No orphans if agent still active**
- Creates old in_progress task (3 hours ago)
- Agent is still in active registry
- Verifies task NOT marked as orphaned
- ✓ PASS

**Test 3: Ignore tasks without claimed_at**
- Creates in_progress task with no claimed_at
- Verifies task is ignored
- ✓ PASS

**Test 4: Ignore non in_progress tasks**
- Creates blocked/pending tasks that are very old
- Verifies they are ignored (only in_progress checked)
- ✓ PASS

**Test 5: Multiple orphaned tasks**
- Creates 5 in_progress tasks, 3 orphaned
- Verifies all 3 marked as blocked
- ✓ PASS

### Running Tests

```bash
# Run all plugin tool tests (includes detection tests)
bun test .opencode/plugin/tools/

# Create custom test
bun test-orphaned-detection.ts  # See /tmp/test-orphan-logic.ts for example
```

## Examples

### Example 1: Recovery After Worker Crash

**Scenario**: Worker agent crashes, task left in in_progress for 2+ hours

```
Timeline:
├─ 13:00 - Task claimed by agent-123 (in_progress)
├─ 13:05 - agent-123 crashes/disconnects
├─ 15:05 - Session 192 starts
├─ 15:05 - detectOrphanedTasks() runs
├─ 15:05 - Task marked as blocked with note:
│   "Orphaned task recovery: Task was in_progress for 120 minutes 
│    with stale agent agent-123. Marked as blocked - ready for 
│    re-assignment or respawn."
└─ 15:05 - Orchestrator can now handle recovery

Recovery action: Orchestrator respawns new worker for task
```

### Example 2: Detection in Logs

**realtime.log entry**:
```json
{
  "level": "WARN",
  "message": "Detected 1 orphaned task(s) - in_progress >2h with stale agent(s)",
  "data": {
    "tasks": [
      {
        "id": "task_1767558071507_779q2v",
        "title": "Implement performance benchmarking for agent tools",
        "age_minutes": 2880,
        "assigned_to": "agent-1767558507172-q7shz"
      }
    ]
  }
}
```

**realtime.log confirmation**:
```json
{
  "level": "INFO",
  "message": "Marked 1 orphaned task(s) as blocked"
}
```

## Monitoring & Alerting

### Key Metrics

- **Orphaned task count**: Monitored in realtime.log
- **Recovery success**: Tracked via task.notes
- **Time to recovery**: Calculated from claim time to detection time

### Dashboard Integration

The CLI can be extended to show orphaned task stats:

```bash
# (Future enhancement)
bun tools/cli.ts status
# Would show: "1 orphaned task recovered in last 24h"
```

### Log Monitoring

Check realtime.log for orphan-related warnings:

```bash
grep "orphaned task" memory/realtime.log
grep "Marked.*blocked" memory/realtime.log
```

## Limitations & Future Work

### Current Limitations

1. **Binary decision**: Task is either orphaned or not - no partial recovery
2. **Manual respawn**: Respawn must be triggered manually or by orchestrator
3. **2-hour threshold**: Fixed duration, not adjustable per task priority

### Future Enhancements

1. **Smart respawn**: Auto-respawn high-priority orphaned tasks
2. **Graduated recovery**: Warn at 1 hour, block at 2 hours, respawn at 3 hours
3. **Configuration per priority**: Different thresholds for critical vs low-priority tasks
4. **Recovery history**: Track how many times task was orphaned/recovered
5. **Coordination.log**: Alert orchestrator via coordination.log in addition to realtime.log

## Related Issues & Tasks

- **Root cause**: Session 192 discovered task_1767558071507_779q2v orphaned for 48+ hours
- **Triggered creation**: Session 192 created task_1767705496224_o403ev for this implementation
- **Implementation**: Completed in plugin with comprehensive detection & recovery

## References

- **Plugin code**: `.opencode/plugin/index.ts` lines 1459-1551, 1635-1640
- **Task file format**: `memory/tasks.json`
- **Agent registry**: `memory/agent-registry.json`
- **Real-time logging**: `memory/realtime.log`

---

**Last Updated**: 2026-01-06
**Status**: ✅ Implemented and tested
**Maintenance**: Automatic (no manual intervention needed)
