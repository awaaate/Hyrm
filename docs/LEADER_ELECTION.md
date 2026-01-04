# Leader Election & Lease Timeout Tuning Guide

## Overview

The OpenCode multi-agent system uses a **single-leader orchestrator model** with a heartbeat-based lease mechanism to coordinate multiple agents and prevent split-brain scenarios.

## Current Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| **Lease TTL** | 180 seconds (3 minutes) | Time before a leader lease expires without heartbeat |
| **Heartbeat Interval** | 60 seconds | How often the leader refreshes its lease |
| **Stale Agent Threshold** | 120 seconds (2 minutes) | How long before non-leader agents are cleaned up |
| **Heartbeat Grace Period** | 2 minutes | Agents without heartbeat for 2+ min are considered stale |

**Key Configuration File**: `tools/lib/coordinator.ts`
- `ORCHESTRATOR_LEASE_TTL_MS`: 180,000 (3 minutes)
- `STALE_AGENT_THRESHOLD_MS`: 120,000 (2 minutes)
- Default heartbeat interval: 60,000 (1 minute)

## How Leader Election Works

### 1. Startup (Orchestrator Initialization)

```
┌─────────────────────────────────────────┐
│ Orchestrator Starts                     │
├─────────────────────────────────────────┤
│ 1. Call agent_register(role='orchestrator') │
│ 2. Check leader lease in memory/        │
│ 3. If lease is expired or missing:      │
│    → Acquire leadership                 │
│    → Write new epoch & timestamp        │
│ 4. If healthy leader exists:            │
│    → Become follower (exit gracefully)   │
└─────────────────────────────────────────┘
```

### 2. Leader Operation

**During Leadership:**
- Refresh lease heartbeat every **60 seconds**
- Update `last_heartbeat` timestamp in `memory/orchestrator-state.json`
- Increment epoch on each re-election
- Perform stale agent cleanup (remove agents without heartbeat for 2+ minutes)

### 3. Follower Behavior

**When Another Leader Exists:**
- Read-only access to leader lease
- No writes to orchestrator-state.json
- Monitor leader health via heartbeat age
- Exit gracefully if leader is healthy

### 4. Failover

**When Leader Lease Expires:**
- Next orchestrator to detect expired lease becomes new leader
- Acquires new epoch token
- Rehydrates state from disk
- Prevents double-processing of tasks via epoch fencing

## Timeout Tuning Guidelines

### When to Adjust Timeouts

#### **Scenario 1: High Churn (Too Many Leader Changes)**

**Symptoms:**
- Leader lease expires frequently despite active orchestrator
- Multiple leader elections in a short time window
- Watchdog logs show "Leader lease expired X seconds ago"

**Root Causes:**
- Orchestrator is too slow to heartbeat (network latency, GC pauses)
- Heartbeat interval too long relative to TTL
- Race condition in lease update

**Solutions:**

1. **Increase TTL (if leader is truly healthy)**
   ```
   Current: 180s TTL, 60s heartbeat interval = 3.0x safety margin
   Option: 270s TTL, 60s heartbeat interval = 4.5x safety margin
   ```
   Change in `tools/lib/coordinator.ts`:
   ```typescript
   const ORCHESTRATOR_LEASE_TTL_MS = 4.5 * 60 * 1000; // 270 seconds
   ```

2. **Decrease heartbeat interval (for tighter updates)**
   ```
   Current: 60s interval
   Option: 30s interval (double heartbeat frequency)
   ```
   Change in orchestrator agent prompt:
   ```typescript
   coordinator.startHeartbeat(30000); // 30 seconds
   ```

3. **Add exponential backoff for leader re-election**
   - First election: immediate
   - Second election (within 5 min): wait 5-10 seconds
   - Third election (within 10 min): wait 15-30 seconds
   - This prevents thundering herd on watchdog restart

#### **Scenario 2: Slow Failover (Leader Down, No Detection)**

**Symptoms:**
- Orchestrator crashes but system doesn't promote new leader for 3+ minutes
- Tasks accumulate in queue while system waits

**Root Causes:**
- TTL too long (waiting for expired lease)
- Watchdog not checking frequently enough

**Solutions:**

1. **Decrease TTL (faster failover)**
   ```
   Current: 180s TTL
   Option: 120s TTL = 2 minute failover time
   ```
   **Trade-off**: Risk more false positives if leader is slow

2. **Tighten watchdog check interval**
   - Current: 60 second check interval in `orchestrator-watchdog.sh`
   - Option: 30 second interval for faster detection

#### **Scenario 3: Stale Agents Not Cleaned Up**

**Symptoms:**
- Dead agents remain in registry indefinitely
- agent_status() shows agents with stale heartbeats
- Registry grows unbounded

**Solutions:**

1. **Decrease stale agent threshold**
   ```
   Current: 120s (2 minutes)
   Option: 90s (1.5 minutes) for faster cleanup
   ```
   Change in `tools/lib/coordinator.ts`:
   ```typescript
   const STALE_AGENT_THRESHOLD_MS = 90 * 1000;
   ```

2. **Increase cleanup frequency**
   - Currently: Cleanup runs every heartbeat
   - Decrease heartbeat interval to trigger cleanup more often

## Recommended Configurations

### **Production (Stable System)**
- **Lease TTL**: 180s (3 minutes)
- **Heartbeat Interval**: 60s (1 minute)
- **Stale Threshold**: 120s (2 minutes)
- **Watchdog Check**: 60s
- **Safety Margin**: 3.0x (TTL / heartbeat interval)

### **High-Availability (Aggressive Failover)**
- **Lease TTL**: 120s (2 minutes)
- **Heartbeat Interval**: 30s
- **Stale Threshold**: 90s (1.5 minutes)
- **Watchdog Check**: 30s
- **Safety Margin**: 4.0x

### **Lenient (Slow Networks, High Latency)**
- **Lease TTL**: 270s (4.5 minutes)
- **Heartbeat Interval**: 60s
- **Stale Threshold**: 180s (3 minutes)
- **Watchdog Check**: 60s
- **Safety Margin**: 4.5x

## Implementation Details

### Leader Lease Record Format
**File**: `memory/orchestrator-state.json`
```json
{
  "leader_id": "agent-1234567890-abcde",
  "leader_epoch": 42,
  "last_heartbeat": "2026-01-04T19:32:20.091Z",
  "ttl_ms": 180000
}
```

### Heartbeat Refresh Process
```typescript
// Called every 60 seconds by the leader
function refreshLeaderLease() {
  const lease = {
    leader_id: this.agentId,
    leader_epoch: this.currentEpoch,
    last_heartbeat: new Date().toISOString(),
    ttl_ms: ORCHESTRATOR_LEASE_TTL_MS
  };
  writeFileSync(leaseFile, JSON.stringify(lease, null, 2));
}
```

### Stale Agent Cleanup
```typescript
function cleanupStaleAgents() {
  const now = Date.now();
  const staleAgents = agents.filter(agent => {
    const age = now - new Date(agent.last_heartbeat).getTime();
    return age > STALE_AGENT_THRESHOLD_MS;
  });
  
  // Mark as stale in registry
  staleAgents.forEach(agent => {
    if (agent.id !== leaderAgent.id) {
      agent.status = "stale";
    }
  });
}
```

## Monitoring & Alerting

### Key Metrics to Monitor

1. **Lease Churn Rate**
   ```bash
   grep "Leader lease expired\|became leader" memory/realtime.log | wc -l
   ```
   - Healthy: 0-1 per hour
   - Warning: 5+ per hour
   - Critical: 10+ per hour

2. **Leader Heartbeat Age**
   ```bash
   cat memory/orchestrator-state.json | jq '.last_heartbeat'
   # Should be within 60-80 seconds old
   ```

3. **Stale Agent Count**
   ```bash
   bun tools/cli.ts agents | grep "stale\|dead"
   # Should be 0
   ```

4. **Watchdog Restart Rate**
   ```bash
   grep "Starting orchestrator agent" logs/watchdog.log | wc -l
   # Should be < 20 per hour
   ```

## Troubleshooting

### "Leader lease expired X seconds ago"
1. Check orchestrator process status: `ps aux | grep "opencode run"`
2. Check if orchestrator is frozen (CPU usage): `top -p $(pgrep -f 'opencode run')`
3. Review realtime.log for errors: `tail -100 memory/realtime.log | grep ERROR`
4. If frequent: Increase TTL or heartbeat frequency

### "Multiple leaders detected"
1. This should never happen - indicates election bug
2. Check for clock skew: `date` on different machines
3. Review memory/orchestrator-state.json for corruption
4. Restart system: `./orchestrator-watchdog.sh --restart`

### "Stale agents not cleaned up"
1. Verify leader heartbeat is refreshing: `cat memory/orchestrator-state.json`
2. Check stale agent cleanup logs: `grep -i "cleanup" memory/realtime.log | tail -10`
3. If not cleaning: Restart orchestrator

## Future Improvements

1. **Exponential Backoff**
   - Add jitter to election attempts to prevent thundering herd
   - Exponential delay: 0s → 5s → 15s → 30s

2. **Adaptive Timeout**
   - Monitor orchestrator responsiveness
   - Dynamically adjust TTL based on observed latency

3. **Health-Based Demotion**
   - If leader can't process tasks, voluntarily demote
   - Prevents zombie leaders from blocking election

4. **Multi-Region Support**
   - Implement geographically-aware failover
   - Account for network partition scenarios

## References

- **Implementation**: `tools/lib/coordinator.ts` (lines 22-300)
- **Plugin Integration**: `.opencode/plugin/tools/agent-tools.ts`
- **Watchdog**: `orchestrator-watchdog.sh`
- **Design Session**: Session 188 - Orchestrator Leader Election Design

---

**Last Updated**: 2026-01-04 (Session 182)
**Maintainer**: Orchestrator Agent System
