# Performance Benchmarking System

## Overview

The performance benchmarking system provides lightweight tracking of critical agent operations and task management latencies. This enables identification of performance degradation as the system ages and helps optimize bottlenecks.

## Architecture

### Components

1. **PerfTracker** (`tools/shared/perf-tracker.ts`)
   - Core utility for recording performance metrics
   - Records operation type, duration, success status, and context
   - Supports both sync and async operation timing
   - Non-invasive, fails silently if file I/O errors occur

2. **Performance Wrapper** (`.opencode/plugin/tools/perf-wrapper.ts`)
   - Thin wrapper for plugin-level performance tracking
   - Initialized on plugin startup
   - Provides global access to performance metrics

3. **Perf Reporter** (`tools/perf-reporter.ts`)
   - CLI tool for analyzing performance trends
   - Generates monthly, weekly, and custom-duration reports
   - Calculates statistics: min, avg, p95, p99 latencies
   - Detects performance degradation
   - Exports to CSV/JSON formats

### Data Storage

Performance metrics are stored in `memory/perf-metrics.jsonl` (one JSON object per line):

```json
{
  "timestamp": "2026-01-06T13:28:00.191Z",
  "operation_type": "agent_register",
  "duration_ms": 45,
  "success": true,
  "session_id": "ses_xxx",
  "error": null,
  "context": { "agents": 5 }
}
```

## Tracked Operations

### Agent Operations
- `agent_register` - Register agent in coordination system
- `agent_send` - Send message to other agent(s)
- `agent_messages` - Read messages from other agents
- `agent_status` - Get status of all agents
- `agent_update_status` - Update agent status/task
- `agent_set_handoff` - Control persistence behavior

### Task Operations
- `task_create` - Create new persistent task
- `task_update` - Update task status/notes
- `task_claim` - Atomically claim task
- `task_list` - List tasks by status
- `task_next` - Get next priority task
- `task_schedule` - Schedule task for future time
- `task_spawn` - Spawn subagent for task

### Message Operations
- `message_send` - Send message to agent(s)
- `message_read` - Read messages
- `message_deliver` - Deliver message

### Leader Election
- `leader_register` - Register as leader candidate
- `leader_heartbeat` - Send heartbeat (leader only)
- `leader_election` - Run election cycle
- `leader_failover` - Failover to new leader

## Usage

### Generate Reports

```bash
# Monthly report (last 30 days)
bun tools/perf-reporter.ts monthly

# Weekly report (last 7 days)
bun tools/perf-reporter.ts weekly

# Custom period (last 90 days)
bun tools/perf-reporter.ts trends --days 90

# Export to CSV (all time)
bun tools/perf-reporter.ts export --format csv > metrics.csv

# Export to JSON
bun tools/perf-reporter.ts export --format json > metrics.json
```

### Example Report Output

```
# Performance Report: Last 30 days
Generated: 2026-01-06T13:28:05.438Z
Total metrics recorded: 1,250

## Operations (Last 30 days)
| Operation | Count | Success | Avg (ms) | P95 (ms) | P99 (ms) | Min (ms) | Max (ms) |
|-----------|-------|---------|----------|----------|----------|----------|----------|
| task_create | 342 | 342/342 | 28.5 | 52 | 78 | 8 | 156 |
| agent_register | 156 | 156/156 | 12.3 | 25 | 42 | 2 | 89 |
| task_update | 298 | 298/298 | 19.2 | 38 | 62 | 3 | 125 |
| agent_send | 234 | 233/234 | 8.7 | 18 | 31 | 1 | 52 |
| leader_election | 45 | 45/45 | 34.2 | 89 | 145 | 12 | 203 |

## Reliability
- Total operations: 1,250
- Successful: 1,248
- Failed: 2
- Error rate: 0.16%

## Slowest Operations
1. task_create: 156ms (2026-01-06T13:27:52.191Z)
2. task_update: 125ms (2026-01-06T13:27:53.191Z)
...
```

## Key Metrics Explained

- **Avg (ms)**: Mean latency for the operation
- **P95 (ms)**: 95th percentile (95% of operations complete in this time)
- **P99 (ms)**: 99th percentile (99% of operations complete in this time)
- **Min/Max (ms)**: Minimum and maximum observed latencies
- **Count**: Total number of operations
- **Success**: Successful operations / total operations

## Degradation Detection

The perf reporter automatically identifies performance degradation by comparing:

1. **Within-period trends**: Operations with p95 > 2x average indicate outliers
2. **Period-to-period comparison**: Alerting if average latency increased >20%
3. **Reliability tracking**: Operations with >1% error rate flagged for investigation

## Performance Baselines

Typical baseline latencies (will vary based on system load):

| Operation | Typical Avg | P95 | Notes |
|-----------|------------|-----|-------|
| agent_register | 10-20ms | 30-50ms | Single agent registration |
| task_create | 20-40ms | 60-100ms | Depends on task complexity |
| task_claim | 5-15ms | 20-40ms | Atomic operation |
| agent_send | 3-10ms | 15-25ms | In-process messaging |
| agent_messages | 2-8ms | 12-20ms | Just reading from queue |
| leader_election | 30-60ms | 100-200ms | System-wide operation |

## Integration

Performance tracking is automatically initialized when the plugin boots. No explicit configuration needed.

To access performance data programmatically:

```typescript
import { PerfTracker } from "./tools/shared/perf-tracker";

const tracker = new PerfTracker(memoryDir);

// Record manual operation
tracker.recordOperation("custom_op", 123, true);

// Time async function
await tracker.timeAsync("expensive_operation", async () => {
  // Your code here
});

// Time sync function
const result = tracker.timeSync("quick_operation", () => {
  // Your code here
  return value;
});
```

## Recommendations for Optimization

When performance degrades, follow this process:

1. **Generate monthly report**: `bun tools/perf-reporter.ts monthly`
2. **Identify slowest operations**: Review "Slowest Operations" section
3. **Check error rate**: High error rate indicates reliability issues
4. **Compare periods**: `bun tools/perf-reporter.ts trends --days 90`
5. **Investigate outliers**: Review agent logs during slow operation windows
6. **Implement fix**: Optimize identified bottleneck
7. **Verify improvement**: Generate new report and compare metrics

## Future Enhancements

Potential improvements:

1. **Automated degradation alerts**: Email/Slack notification when latency increases >20%
2. **Percentile tracking over time**: Chart p95/p99 trends
3. **Correlation analysis**: Find operations that slow together
4. **Resource usage correlation**: Link performance to memory/CPU/disk
5. **Dashboard integration**: Real-time performance graphs in CLI dashboard
6. **Distributed tracing**: Track operation dependencies across agents
7. **SLA monitoring**: Alert when operations violate SLA targets

## See Also

- `ARCHITECTURE.md` - System architecture
- `LEADER_ELECTION.md` - Leader election performance tuning
- `TEST_FRAMEWORK.md` - Test execution benchmarks
