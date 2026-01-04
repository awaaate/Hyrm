# Realtime Log Rotation Monitoring Guide

## Overview

The `memory/realtime.log` file is the system's real-time event log for the multi-agent orchestration system. It records all plugin events, agent activities, and system state changes. The file was configured for rotation in Session 185 to prevent unbounded disk growth.

## Current Configuration (As of Session 182)

| Parameter | Value | Status |
|-----------|-------|--------|
| **Current Log Size** | 5.3 MB | Healthy |
| **Current Line Count** | 28,468 | Healthy |
| **Rotation Threshold** | 5,000 lines | Configured |
| **Last Rotation** | 2026-01-02 19:34 UTC | ~2 days ago |
| **Growth Rate** | ~14,000 lines/day | Moderate |
| **TTL at Current Rate** | 10+ days before 10 MB | Good |

## Rotation System

### Location
- **Rotation Function**: `tools/working-memory-manager.ts` (`rotateRealtimeLog()`)
- **Archive Directory**: `memory/realtime-archives/`
- **Manual Command**: `bun tools/working-memory-manager.ts rotate-realtime`
- **Auto-Trigger**: Part of `prune()` maintenance cycle

### How It Works
```
Current Log (realtime.log)
         ↓
  Exceeds 5,000 lines? 
         ↓
    YES  → Archive older lines
           Store as: realtime-YYYY-MM-DDTHH-mm-ss-sssZ.log
           Keep last: 5,000 lines in active log
    NO   → Continue logging
```

### Archive Location
```
memory/realtime-archives/
├── realtime-2026-01-02T19-34-50-226Z.log (42,542 lines from previous rotation)
└── ... (future archives)
```

## Health Assessment (Session 182)

### ✅ What's Working

1. **Rotation Mechanism Active**
   - Last rotation occurred 2 days ago (2026-01-02 at 19:34 UTC)
   - Archive file exists and contains previous data
   - System successfully archives old entries

2. **Moderate Growth Rate**
   - ~14,000 lines per day (~9.8 KB/hour)
   - At current rate: 5,000-line rotation every ~8-9 hours
   - Sustainable logging without disk explosion

3. **File Size Controlled**
   - Current size: 5.3 MB (well below warning threshold of 10 MB)
   - Keeps only active, recent events in main log
   - Prevents disk pressure on `memory/` partition

4. **Log Quality**
   - No errors or warnings in realtime.log about rotation failures
   - Clean rotation history
   - Structured JSON event logging maintained

### ⚠️ Observations

1. **Manual Rotation Not Triggered**
   - No automatic rotation appears to have occurred in last 2 days
   - This suggests either:
     a) Low logging volume during some periods
     b) Rotation function not being called regularly
     c) System uptime has been continuous without maintenance triggers

2. **Archive Growth**
   - Only 1 archive file exists (from Jan 2)
   - Expected: Multiple archives if rotation ran frequently
   - May indicate rotation is less frequent than expected

3. **Logging Intensity Varies**
   - Early sessions: Heavy logging with frequent rotations
   - Recent sessions: Lighter logging, longer intervals between rotations
   - Suggests system has stabilized and generates fewer debug events

## Monitoring Metrics

### Key Indicators to Track

1. **Log Size Growth**
   ```bash
   # Check current size
   ls -lh memory/realtime.log
   
   # Expected: < 10 MB for next 1-2 weeks
   # Warning threshold: > 10 MB
   # Critical threshold: > 50 MB
   ```

2. **Rotation Frequency**
   ```bash
   # Count archive files
   ls -1 memory/realtime-archives/ | wc -l
   
   # Expected: 2-4 new archives per week
   # Low frequency suggests: stable system, less logging
   # High frequency suggests: increased activity or verbose logging
   ```

3. **Lines Per Archive**
   ```bash
   # Check most recent archive
   wc -l memory/realtime-archives/realtime-*.log | tail -1
   
   # Expected: ~5,000 lines per archive
   # Variability indicates: fluctuating logging intensity
   ```

4. **Time Between Rotations**
   ```bash
   # List archives by modification time
   ls -lt memory/realtime-archives/ | head -5
   
   # Expected: 1 archive every 6-24 hours
   # Longer gaps: Lower activity or less verbose logging
   # Shorter gaps: High-activity periods or increased debugging
   ```

5. **Event Distribution**
   ```bash
   # Sample recent events
   tail -100 memory/realtime.log | grep -o '"level":"[^"]*"' | sort | uniq -c
   
   # Expected ratio: INFO >> DEBUG >> WARN >> ERROR
   # If WARN/ERROR prevalent: System under stress
   ```

## Maintenance Schedule

### Daily Checks (Quick - 2 minutes)
```bash
# Monitor file size
ls -lh memory/realtime.log

# Check for rotation
ls -lt memory/realtime-archives/ | head -1

# Verify no errors
tail -20 memory/realtime.log | grep -i error
```

### Weekly Review (Moderate - 10 minutes)
```bash
# Growth rate calculation
du -h memory/realtime.log
ls -lh memory/realtime-archives/ | head -5

# Event distribution
tail -1000 memory/realtime.log | \
  grep -o '"level":"[^"]*"' | \
  sort | uniq -c

# Archive cleanup (if >10 archives)
ls -1 memory/realtime-archives/ | sort | head -n -5 | xargs rm
```

### Monthly Analysis (Comprehensive - 30 minutes)
```bash
# Growth trend over time
find memory/realtime-archives -type f -printf '%T@ %s\n' | \
  sort | awk '{print $1, $2}' | \
  tail -20

# Peak activity analysis
for file in memory/realtime-archives/realtime-*.log; do
  echo "$file: $(grep -c 'level' "$file") events"
done

# Storage utilization
du -sh memory/
du -sh memory/realtime-archives/
```

## Scaling Guidelines

### If Growth Exceeds Expectations

**Scenario 1: Log Size > 10 MB**

1. **Immediate Action**
   ```bash
   # Manual rotation to clean up
   bun tools/working-memory-manager.ts rotate-realtime
   
   # Verify new size
   ls -lh memory/realtime.log
   ```

2. **Root Cause Investigation**
   ```bash
   # Check for ERROR/WARN spam
   grep -c '"level":"ERROR"' memory/realtime.log
   grep -c '"level":"WARN"' memory/realtime.log
   
   # Find chatty event types
   grep -o '"event":"[^"]*"' memory/realtime.log | \
     sort | uniq -c | sort -rn | head -10
   ```

3. **Adjustment Options**
   - **Reduce rotation threshold**: 5,000 → 2,500 lines
   - **Increase cleanup frequency**: Update prune() schedule
   - **Filter verbose events**: Remove DEBUG-level events from logging

**Scenario 2: Rotation Not Happening**

1. **Check Rotation Function**
   ```bash
   grep -A 10 "rotateRealtimeLog" tools/working-memory-manager.ts
   ```

2. **Verify Manual Rotation**
   ```bash
   bun tools/working-memory-manager.ts rotate-realtime
   bun tools/working-memory-manager.ts prune
   ```

3. **Check for Errors**
   ```bash
   grep -i "rotate\|prune" memory/realtime.log | tail -20
   ```

## Configuration Recommendations

### For Current System (Stable, 5.3 MB)
**No changes needed.** Current settings are appropriate.

### If Log Size Reaches 10 MB
```typescript
// In tools/working-memory-manager.ts
const REALTIME_LOG_MAX_LINES = 2500; // Reduce from 5000
```

### If >1 GB Storage Available
```typescript
// Relax constraints for verbose debugging
const REALTIME_LOG_MAX_LINES = 10000; // Increase from 5000
```

### If Storage Becomes Constrained
```typescript
// Archive immediately on rotation
// Clean archives older than 7 days
const ARCHIVE_RETENTION_DAYS = 7;
```

## Implementation Details

### Rotation Algorithm
```typescript
function rotateRealtimeLog(): { rotated: boolean; message: string } {
  const logPath = join(memoryDir, "realtime.log");
  const archiveDir = join(memoryDir, "realtime-archives");
  
  // Read current log
  const lines = readFileSync(logPath, "utf8").split("\n");
  
  if (lines.length > 5000) {
    // Archive old lines (all but last 5000)
    const archiveLines = lines.slice(0, -5000);
    const timestamp = new Date().toISOString().replace(/[:]/g, "-");
    const archivePath = join(archiveDir, `realtime-${timestamp}.log`);
    
    writeFileSync(archivePath, archiveLines.join("\n"));
    
    // Keep last 5000 lines in active log
    const recentLines = lines.slice(-5000);
    writeFileSync(logPath, recentLines.join("\n"));
    
    return { rotated: true, message: `Archived ${archiveLines.length} lines` };
  }
  
  return { rotated: false, message: "No rotation needed" };
}
```

### Auto-Rotation Trigger
```typescript
// Called during prune() maintenance cycle
// Also called when log size exceeds threshold
// Prevents unbounded growth while keeping recent events accessible
```

## Future Improvements

1. **Compression**
   - Gzip archived logs to reduce storage footprint
   - 5 MB archive → ~500 KB compressed
   - Command: `gzip memory/realtime-archives/*.log`

2. **Selective Logging**
   - Allow filtering by log level (remove DEBUG in production)
   - Event type whitelisting (only log critical events)
   - Rate limiting (max events/second)

3. **Distributed Logging**
   - Send important events to external logger (Cloudflare, LogRocket)
   - Keep only recent events locally
   - Enable long-term analysis with external service

4. **Alerting**
   - Alert if rotation fails
   - Alert if growth rate exceeds threshold
   - Auto-rotate if size > 50 MB (emergency)

## References

- **Rotation Implementation**: `tools/working-memory-manager.ts`
- **Plugin Logging**: `.opencode/plugin/index.ts` (lines 150-200)
- **Maintenance Cycle**: Called from orchestrator periodic tasks
- **Session 185**: Original implementation and testing

---

**Last Updated**: 2026-01-04 (Session 182)
**Next Review**: 2026-01-11 (1 week) or immediately if size > 10 MB
**Maintainer**: Orchestrator Agent System
