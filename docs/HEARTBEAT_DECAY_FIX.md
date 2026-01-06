# Heartbeat Service Decay Fix

**Session**: 198  
**Date**: 2026-01-06  
**Status**: COMPLETED ✅  
**Commit**: 8f6b809

## Problem

All orchestrator leader leases were expiring at exactly **240-250 seconds** despite the background heartbeat service running continuously. This caused frequent orchestrator respawns (~2/hour instead of target <1/hour).

**Pattern Observed**:
- Leader starts fresh with heartbeat timestamp
- Exactly 240-250s later, leader lease expires (should have TTL 180s, with 60s heartbeat interval)
- Watchdog detects expired lease and respawns orchestrator
- New orchestrator takes leadership with epoch+1
- **Pattern repeats identically with every new orchestrator**

## Root Cause

The **watchdog script was incorrectly stopping the heartbeat service** when:

1. **Line 1405 (stop_orchestrator function)**: When manually stopping the orchestrator
2. **Line 1681 (health check)**: When the local orchestrator process died

This created a "heartbeat gap" during orchestrator restart cycles:

```
Old Orchestrator                 Heartbeat Service              New Orchestrator
       |                                |                             |
       x (exits)                        |                             |
         |                              |                             |
         +---> watchdog stops service --x                             |
         |                              (no heartbeats!)             |
         |                                                            x (starts, registers)
         |                                                            |
         |                                                            |
       ← Gap causes lease expiry →                                   |
         |                                                            |
         |                              ← heartbeat resumed ─────────+
         |                              (now for new leader)
```

During this gap, the leader lease had no heartbeat refresh, and after 240-250 seconds without any update (longer than the TTL), it was marked as stale.

## Solution

**Removed the incorrect heartbeat stop calls** from the watchdog:

1. Removed line 1405 from `stop_orchestrator()` function
2. Removed line 1681 from health check path

**Why This Works**:

The heartbeat service is designed as a **persistent background process**:
- Runs independently of orchestrator lifecycle
- Finds the current orchestrator agent from the registry each cycle
- Updates the leader lease **only if the agent matches the current leader_id**
- Automatically adapts when a new orchestrator starts and registers

The heartbeat script (`tools/lib/orchestrator-heartbeat.sh`) has this safety check built-in:

```bash
# Only update if this agent is the leader
if (lease.leader_id === agentId) {
  lease.last_heartbeat = timestamp;
  fs.writeFileSync(leasePath, JSON.stringify(lease, null, 2));
}
```

This means:
- Old leader's heartbeat stops updating when it's no longer the leader
- New leader's heartbeat automatically starts updating when it takes over
- No gap in heartbeat coverage during transitions

## Changes Made

**File**: `orchestrator-watchdog.sh`

### Change 1: stop_orchestrator() function (line ~1405)

**Before**:
```bash
stop_orchestrator() {
    local reason="${1:-manual_stop}"
    log "Stopping orchestrator..."
    
    # Stop heartbeat service first (it will try to read the lease)
    bash tools/heartbeat-service.sh "memory/.heartbeat-service.pid" stop 2>&1 | tee -a "$LOGFILE" || true
    
    if [[ -f "$PIDFILE" ]]; then
```

**After**:
```bash
stop_orchestrator() {
    local reason="${1:-manual_stop}"
    log "Stopping orchestrator..."
    
    # NOTE: Do NOT stop heartbeat service here!
    # The heartbeat service is a persistent background service that should run continuously.
    # It will automatically adapt to heartbeat for the new leader when it starts.
    # Stopping it creates a gap that causes leader lease expiry (240-250s decay).
    
    if [[ -f "$PIDFILE" ]]; then
```

### Change 2: Health check path (line ~1681)

**Before**:
```bash
if ! is_orchestrator_running; then
    if [[ -f "$PIDFILE" ]]; then
        # ... cleanup ...
        
        # CRITICAL: Stop heartbeat service when orchestrator dies
        # Otherwise it keeps renewing the lease and blocks respawn
        log "Stopping orphaned heartbeat service..." "DEBUG"
        bash tools/heartbeat-service.sh "memory/.heartbeat-service.pid" stop 2>/dev/null || true
    fi
```

**After**:
```bash
if ! is_orchestrator_running; then
    if [[ -f "$PIDFILE" ]]; then
        # ... cleanup ...
        
        # NOTE: Do NOT stop heartbeat service here!
        # The heartbeat service is a persistent background service that should run continuously.
        # It correctly checks if the current agent is the leader before updating the lease.
        # Stopping it here creates a "heartbeat gap" during orchestrator restart,
        # causing leader leases to expire prematurely (240-250s).
        # The heartbeat service will automatically adapt to the new leader when it starts.
    fi
```

## Expected Improvements

After this fix:
- ✅ Leader lease remains valid for full TTL (180s+)
- ✅ No more stale leader warnings in realtime.log
- ✅ Orchestrator restarts drop to <1/hour (normal pattern)
- ✅ Smooth handoff when orchestrators restart
- ✅ Continuous heartbeat coverage during all transitions

## Verification

- ✅ All tests pass: 119/119 (100%)
- ✅ Bash syntax verified
- ✅ Git commit: 8f6b809

## Architecture Insight

This fix reveals an important architectural principle:

**Persistent background services should NOT be lifecycle-managed by processes they serve.**

The heartbeat service:
- Started by watchdog
- Runs independently of orchestrator sessions
- Monitors and updates shared state (leader lease)
- Should only be stopped by explicit shutdown commands, not by orchestrator lifecycle events

This pattern prevents state corruption and timing gaps during component transitions.
