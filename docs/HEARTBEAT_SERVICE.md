# Background Heartbeat Service

## Problem Statement

The orchestrator's heartbeat mechanism was tightly coupled to the OpenCode session lifecycle. When a session became idle after 5-8 minutes, the JavaScript `setInterval` timer was killed by the OpenCode runtime, stopping the heartbeat. This caused the orchestrator's leader lease to expire, triggering unnecessary respawns every ~8 minutes.

**Impact**: 5-6 orchestrator respawns per hour instead of 0

## Solution

A **background shell script loop** that runs independently of the OpenCode session lifecycle, performing heartbeats every 60 seconds regardless of session state.

### Why This Approach?

1. **Shell scripts are not affected by OpenCode session idling** - they continue running even when the JavaScript runtime is paused
2. **Simple and reliable** - proven shell loop with sleep is a battle-tested pattern
3. **Completely independent** - no interference with the JavaScript heartbeat (which continues when session is active)
4. **Works with `agent_set_handoff(enabled=false)`** - orchestrator can remain persistent
5. **Minimal complexity** - ~150 lines of shell script total

## Architecture

### Components

#### 1. `tools/heartbeat-service.sh` - Service Controller
Manages the background heartbeat service lifecycle:

- **start** - Spawns the heartbeat loop in background with `nohup`
- **stop** - Gracefully terminates the background loop
- **status** - Reports whether the service is running

Features:
- Handles stale PID files gracefully
- Waits up to 5 seconds for graceful shutdown before force-killing
- Logs all operations to `logs/heartbeat-service.log`

Usage:
```bash
bash tools/heartbeat-service.sh "memory/.heartbeat-service.pid" start
bash tools/heartbeat-service.sh "memory/.heartbeat-service.pid" stop
bash tools/heartbeat-service.sh "memory/.heartbeat-service.pid" status
```

#### 2. `tools/lib/orchestrator-heartbeat.sh` - Heartbeat Logic
Performs the actual heartbeat every 60 seconds:

**What it does:**
1. Finds the orchestrator agent in `memory/agent-registry.json`
2. Updates the agent's `last_heartbeat` timestamp in the registry
3. Refreshes the `last_heartbeat` in `memory/orchestrator-state.json` (leader lease)
4. Logs operations to both `logs/orchestrator-heartbeat.log` and `memory/realtime.log`

**Safety mechanisms:**
- Uses temporary files to avoid corruption on write failure
- Only updates registry/lease if orchestrator agent exists
- Gracefully skips if no orchestrator is registered
- Logs both successes and failures for observability

#### 3. `orchestrator-watchdog.sh` - Integration Point
The watchdog integrates the heartbeat service with orchestrator lifecycle:

**On orchestrator startup** (line 1322):
```bash
bash tools/heartbeat-service.sh "memory/.heartbeat-service.pid" start
```

**On orchestrator shutdown** (line 1405):
```bash
bash tools/heartbeat-service.sh "memory/.heartbeat-service.pid" stop
```

## How It Works

### Timeline

1. **Orchestrator starts** (watchdog spawns it)
   - JavaScript heartbeat begins: `setInterval(sendHeartbeat, 60000)`
   - Background heartbeat service starts: `nohup bash -c 'while true; sleep 60; do heartbeat'`

2. **Session is active (first 5-8 minutes)**
   - Both JavaScript and shell heartbeats run
   - Registry and leader lease are updated regularly
   - Redundancy ensures heartbeat is never missed

3. **Session becomes idle**
   - JavaScript runtime pauses, killing `setInterval`
   - Shell heartbeat continues running in background
   - Leader lease keeps getting refreshed by shell loop
   - No respawn is triggered

4. **Orchestrator shutdown**
   - Watchdog calls `stop` on heartbeat service
   - Service gracefully terminates background loop
   - Orchestrator process is killed

### Key Design Decisions

1. **60-second interval**: Matches the JavaScript heartbeat interval for consistency
2. **Independent loop**: Uses `while true; sleep 60` so it survives session idling
3. **Bun scripts for updates**: Uses `bun run --smol` for safe JSON updates (avoids raw `jq`)
4. **Graceful fallthrough**: Continues even if updates fail, doesn't block orchestrator
5. **Dual logging**: Logs to both dedicated file and realtime.log for visibility

## Monitoring

### Check Heartbeat Status

```bash
bash tools/heartbeat-service.sh "memory/.heartbeat-service.pid" status
```

Output:
- "RUNNING (PID: XXX)" - healthy
- "NOT RUNNING" - service not active

### View Heartbeat Logs

```bash
# Service lifecycle events
tail -f logs/heartbeat-service.log

# Actual heartbeat operations
tail -f logs/orchestrator-heartbeat.log

# Real-time system log
grep "heartbeat" memory/realtime.log
```

### Verify Registry Updates

Check that agent's `last_heartbeat` is being updated:

```bash
cat memory/agent-registry.json | jq '.agents[] | select(.assigned_role=="orchestrator") | .last_heartbeat'
```

Should show current timestamps, not old ones.

### Verify Lease Updates

Check that leader lease is being refreshed:

```bash
cat memory/orchestrator-state.json | jq '.last_heartbeat'
```

Should show recent timestamps.

## Troubleshooting

### Service Won't Start
- Check permissions: `ls -la tools/heartbeat-service.sh`
- Check bash syntax: `bash -n tools/heartbeat-service.sh`
- Check for stale PID: `rm -f memory/.heartbeat-service.pid`

### Heartbeats Not Being Recorded
- Verify orchestrator is registered: `grep orchestrator memory/agent-registry.json`
- Check heartbeat logs: `tail logs/orchestrator-heartbeat.log`
- Verify script can read registry: `cat memory/agent-registry.json > /dev/null`

### Service Running But Not Updating
- Check for bun errors: `bash -x tools/lib/orchestrator-heartbeat.sh 2>&1`
- Verify registry format is correct: `jq . memory/agent-registry.json`
- Check filesystem permissions in `memory/` directory

### Orchestrator Still Respawning
- This system only prevents respawns due to lease expiry
- Other causes of respawn:
  - Session timeout (check `SESSION_TIMEOUT` in watchdog)
  - Token limit exceeded (check `TOKEN_LIMIT_ENABLED`)
  - Process crash (check stderr log)
  - Manual restart request

## Performance Impact

- **CPU**: Negligible (one `bash` process in sleep loop, wakes up every 60s)
- **Memory**: ~2-3 MB for background process
- **I/O**: ~100 bytes per heartbeat (reads/writes small JSON)
- **Network**: None (all local file operations)

## Future Improvements

1. **Exponential backoff**: If heartbeat repeatedly fails, back off to prevent log spam
2. **Health checks**: Verify bun is available before running heartbeat
3. **Metrics**: Track heartbeat success/failure rate
4. **Configuration**: Make interval configurable (currently hardcoded to 60s)
5. **Cleanup**: Auto-cleanup old heartbeat logs to prevent unbounded growth

## Testing

### Manual Test

```bash
# Terminal 1: Start heartbeat service
bash tools/heartbeat-service.sh "memory/.test.pid" start

# Terminal 2: Watch it run
tail -f logs/orchestrator-heartbeat.log

# Verify registry updates
cat memory/agent-registry.json | jq '.agents[0].last_heartbeat'
# (timestamps should be changing)

# Cleanup
bash tools/heartbeat-service.sh "memory/.test.pid" stop
```

### Integration Test

The heartbeat service is automatically tested when the orchestrator starts:

1. Look at `logs/orchestrator-heartbeat.log`
2. Verify entries appear every 60 seconds
3. Check that `memory/agent-registry.json` has recent `last_heartbeat` values
4. Check that `memory/orchestrator-state.json` has recent `last_heartbeat` in the lease

## References

- **Problem identified**: Session 183 memory notes
- **Root cause**: OpenCode kills `setInterval` timers when session idles
- **Implementation**: Background shell loop independent of session lifecycle
- **Integration point**: `orchestrator-watchdog.sh` lifecycle hooks
- **Leader election design**: See `docs/LEADER_ELECTION.md`
