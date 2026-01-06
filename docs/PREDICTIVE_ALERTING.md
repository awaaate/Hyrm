# Predictive Alerting for Log Growth and Archive Management

## Overview

The predictive alerting system monitors log and archive growth rates to proactively alert operators before maintenance is needed. It provides:

1. **Growth Rate Tracking** - Measures log file sizes and line counts
2. **Maintenance Window Projection** - Estimates when logs will reach rotation thresholds
3. **Anomaly Detection** - Alerts when growth rate becomes unusual (2x+ normal)
4. **Archive Monitoring** - Tracks archive directory growth and projects space needs
5. **CLI Integration** - Displays projections in `bun tools/cli.ts status`

## Architecture

### Components

#### 1. Growth Tracker (`tools/shared/growth-tracker.ts`)

Core metrics collection and analysis:

```typescript
// Get current log metrics
const metric = getLogMetrics("/app/workspace/memory/realtime.log");
// Returns: { timestamp, type, size_bytes, line_count }

// Analyze growth between measurements
const growth = calculateGrowthRate(current, previous);
// Returns: { kb_per_hour, lines_per_day }

// Predict days until threshold
const days = daysUntilThreshold(
  currentSizeMb,   // e.g., 1.5
  growthRateKbPerHour,  // e.g., 10
  thresholdMb      // e.g., 5
);
// Returns: null if negative growth, or days until threshold

// Full analysis
const analysis = analyzeGrowth(metric, recentMetrics, 5);
// Returns: GrowthAnalysis with trend, anomaly factor, maintenance window
```

#### 2. Predictive Analyzer (`tools/lib/predictive-analyzer.ts`)

High-level forecasting and alerting:

```typescript
// Generate full prediction report
const report = generatePredictiveReport();
// Returns: PredictionReport with alerts and projections

// Format for display
const display = formatPredictionReport(report);
// Returns: Formatted string for CLI output

// Save/load reports
savePredictionReport(report);  // → memory/predictions.json
const loaded = loadPredictionReport();
```

### Data Flow

```
Session Start
    ↓
recordGrowthMetrics() [plugin]
    ↓
Append to memory/growth-metrics.jsonl
    ↓
bun cli.ts status (on demand)
    ↓
generatePredictiveReport()
    ↓
Display to user
```

## Features

### 1. Log Growth Monitoring

Tracks both critical log files:

- **realtime.log**: System events, log rotation lifecycle (5MB threshold)
- **coordination.log**: Agent messages and heartbeats (5MB threshold)

Metrics per file:
- Current size (MB and bytes)
- Current line count
- Growth rate (KB/hour, lines/day)
- Days until rotation needed
- Growth trend (normal/elevated/anomalous)

### 2. Maintenance Window Projection

Calculates when action is needed:

```
Current: 1.59 MB / 5 MB threshold
Growth: < 1 KB/hr
Projection: Not urgent (>30 days)

Current: 4.2 MB / 5 MB threshold
Growth: 50 KB/hr
Projection: Soon (2 days) → Maintenance window Saturday
```

### 3. Anomaly Detection

Compares current growth rate to recent history:

```typescript
// Normal pattern: 10 KB/hr
// Current: 25 KB/hr
// Factor: 2.5x
// Status: ANOMALOUS ⚠️ "May indicate issue or increased logging"
```

Threshold: 2x normal rate triggers warning

### 4. Archive Monitoring

Tracks compressed-archives and diagnostics directories:

```
Archives: Sustainable growth rate
  Current: 22 KB compressed
  Growth: ~5 KB/day
  Days to 500MB: 27,000+ (74+ years)
  Action: None needed
```

If archives growing faster (e.g., 50 KB/day):
```
Archives: Growing rapidly
  Days to 500MB: 2,700 (7.4 years)
  Action: Consider compression when 100MB threshold reached
```

### 5. Alert Types

#### CRITICAL
- Log file > 4.5MB (approaching rotation threshold)
- Archives nearing 500MB limit
- Growth rate 3x+ above normal

#### WARNING
- Log file > 3.5MB (warning zone)
- Unusual growth 2x+ above normal
- Archive growth accelerating

#### INFO
- All systems healthy
- Normal growth patterns

## Usage

### Check Status via CLI

```bash
# Full system status with predictions
bun tools/cli.ts status

# Output includes:
# 📊 LOG GROWTH PROJECTIONS
# realtime.log: 1.59 MB
#   Growth: < 1 KB/hr (minimal)
#   Rotation in ~500+ days
#
# coordination.log: 0.52 MB
#   Growth: < 1 KB/hr (minimal)
#   Rotation in ~500+ days
#
# Archives: Sustainable growth rate
```

### Manual Prediction Report

```bash
# Generate full report
cat > /tmp/get_predictions.ts << 'EOF'
import { generatePredictiveReport, formatPredictionReport } from "/app/workspace/tools/lib/predictive-analyzer";
const report = generatePredictiveReport();
console.log(formatPredictionReport(report));
EOF
bun /tmp/get_predictions.ts
```

### Access Raw Metrics

```bash
# View growth metrics history
tail -20 memory/growth-metrics.jsonl

# Output (JSONL format, one metric per line):
# {"timestamp":1704576000000,"realtime_size_bytes":1671168,"coordination_size_bytes":532480,"realtime_lines":8665,"coordination_lines":4881}
```

### Export for Analysis

```bash
# Convert JSONL to CSV for spreadsheet analysis
cat memory/growth-metrics.jsonl | jq -r '[.timestamp, .realtime_size_bytes, .coordination_size_bytes] | @csv' > growth.csv
```

## Configuration

### Thresholds

Current thresholds (can be adjusted):

| Component | Threshold | Action |
|-----------|-----------|--------|
| realtime.log | 5 MB | Auto-rotate |
| coordination.log | 5 MB | Auto-rotate |
| Archives | 500 MB | Consider compression |
| Anomaly | 2x normal rate | Warning alert |

To change thresholds, modify values in:
- `tools/lib/predictive-analyzer.ts` (line 98-99 for 5MB threshold)
- `tools/lib/predictive-analyzer.ts` (line 146 for archive 500MB threshold)
- `tools/shared/growth-tracker.ts` (line 160 for 2x anomaly factor)

### Recording Frequency

Growth metrics are recorded once per session at startup (in `handleSessionCreated`).

To increase frequency (e.g., every 60s), modify plugin:
```typescript
// Current: recordGrowthMetrics() - once at startup

// Option: Add periodic recording via setInterval
setInterval(() => {
  recordGrowthMetrics();
}, 60_000);  // Every 60 seconds
```

## Examples

### Scenario 1: Normal Operations

```
realtime.log: 1.59 MB
  Growth: < 1 KB/hr (minimal)
  Rotation in ~500+ days

Status: ✅ HEALTHY - No action needed
```

### Scenario 2: Growing Logs

```
realtime.log: 3.8 MB
  Growth: 25 KB/hr
  Rotation in ~5 days

Status: ⚠️ WARNING - Plan rotation within a week
Suggestion: Monitor daily, prepare maintenance window
```

### Scenario 3: Urgent Action

```
realtime.log: 4.6 MB
  Growth: 100 KB/hr
  Rotation in ~8 hours

Status: 🔴 CRITICAL - Rotate NOW
Action: Execute log rotation immediately
```

### Scenario 4: Anomalous Growth

```
realtime.log: 2.1 MB
  Growth: 150 KB/hr (50x normal)
  Growth trend: ANOMALOUS

Status: 🔴 ANOMALY DETECTED
Suggestion: Check for:
  - Verbose logging enabled
  - Memory leaks causing log spam
  - Unusual agent/task activity
  - System under stress
```

## System Integration

### Plugin Integration

The `recordGrowthMetrics()` function is called at session startup:

```typescript
// In .opencode/plugin/index.ts handleSessionCreated()
recordGrowthMetrics();  // Records current state
```

This ensures metrics are captured for trend analysis.

### CLI Integration

The `showPredictiveAlerts()` function is called from status:

```typescript
// In tools/cli.ts showStatus()
console.log(showPredictiveAlerts());  // Displays projections
```

### Data Persistence

Metrics stored in:
- `memory/growth-metrics.jsonl` - Historical growth data (one per session)
- `memory/predictions.json` - Latest prediction report (optional)

## Best Practices

### Monitoring Schedule

1. **Daily Check**: `bun tools/cli.ts status` (quick overview)
2. **Weekly Review**: Analyze `growth-metrics.jsonl` for trends
3. **Monthly Planning**: Project maintenance windows for next month

### Responding to Alerts

| Alert | Response |
|-------|----------|
| INFO (healthy) | Continue monitoring |
| WARNING (>3.5MB) | Plan maintenance in next week |
| CRITICAL (>4.5MB) | Schedule rotation today |
| ANOMALY (2x+) | Investigate cause immediately |

### Tuning Growth Projections

If projections are consistently inaccurate:

1. Check actual growth rate: `tail -100 memory/growth-metrics.jsonl | jq -r '.realtime_size_bytes'`
2. Verify threshold values are correct
3. Consider external factors (increased agents, more tasks)
4. Adjust monitoring frequency if needed

## Performance Impact

- **Recording**: ~5ms per session (file I/O for metrics)
- **Prediction**: ~10ms per CLI status call (analysis + formatting)
- **Storage**: ~200 bytes per metric record (~100KB for 500 sessions)

Negligible system impact. Safe to run continuously.

## Troubleshooting

### Predictions Not Appearing

```bash
# Check if files exist
ls -lh memory/realtime.log memory/coordination.log

# Verify predictive analyzer can be imported
bun build tools/lib/predictive-analyzer.ts --no-bundle

# Test directly
cat > /tmp/test.ts << 'EOF'
import { generatePredictiveReport } from "/app/workspace/tools/lib/predictive-analyzer";
console.log(generatePredictiveReport());
EOF
bun /tmp/test.ts
```

### Growth Metrics Not Recorded

```bash
# Check growth-metrics.jsonl exists and has entries
wc -l memory/growth-metrics.jsonl
tail -3 memory/growth-metrics.jsonl

# If empty, verify plugin is running:
# - Check .opencode/plugin/index.ts has recordGrowthMetrics() call
# - Check session startup output for "Recording growth metrics"
```

### Anomaly Threshold Too Sensitive

Adjust in `tools/shared/growth-tracker.ts`:

```typescript
// Line 160: Change 2.0 to higher value (e.g., 3.0)
return {
  isAnomaly: factor > 3.0,  // 3x threshold instead of 2x
  factor,
};
```

## Future Enhancements

### Planned Features

1. **Predictive Alerts to CLI Dashboard**
   - Add widget showing next maintenance window
   - Color-coded growth trend visualization

2. **Automated Actions**
   - Auto-trigger rotation when > 4.8MB
   - Auto-compress archives when > 400MB
   - Auto-cleanup stale archives

3. **Advanced Analytics**
   - Correlation with agent activity (tasks/messages)
   - Per-agent logging analysis
   - Seasonal pattern detection (time-of-day, day-of-week)

4. **External Integrations**
   - Email/Slack notifications for critical alerts
   - Webhook integration for monitoring systems
   - Prometheus metrics export

5. **Machine Learning**
   - Auto-detect baseline growth rate
   - Predict maintenance windows with confidence intervals
   - Anomaly detection using statistical models

## Related Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System overview
- **[HEARTBEAT_SERVICE.md](./HEARTBEAT_SERVICE.md)** - Background service management
- **[PERFORMANCE_BENCHMARKING.md](./PERFORMANCE_BENCHMARKING.md)** - Metrics collection

## Summary

The predictive alerting system provides **proactive visibility** into system health without requiring manual monitoring. By tracking growth patterns and projecting maintenance windows, operators can plan ahead instead of reacting to emergencies.

Key benefits:
- ✅ No manual log size checks needed
- ✅ Early warning before thresholds reached
- ✅ Anomaly detection catches unusual patterns
- ✅ Integrated into existing CLI tools
- ✅ Minimal performance impact
- ✅ Extensible for future enhancements
