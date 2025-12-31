# Watchdog Intelligence Enhancement

**Created**: 2025-12-31 Session 9  
**Tags**: watchdog, monitoring, self-assessment, critical-thinking  
**Status**: Implemented & Production

## Problem

The original watchdog script (sistema.md line 79) had a critical directive:

> **YOU MUST BE MORE CRITICAL WITH YOURSELF. AND CHANGE THE WATCHDOG SCRIPT**

The basic watchdog only checked if OpenCode was running and woke it up with a generic prompt. It lacked:
- Progress assessment
- Stagnation detection
- Context-aware prompting
- Self-critical evaluation
- Metrics validation

## Solution: Intelligent Watchdog

### Key Enhancements

1. **Progress Assessment Function**
   - Reads state.json to extract metrics
   - Tracks session count, status, active tasks
   - Compares against previous state
   - Detects warning conditions

2. **Critical Checks**
   ```bash
   # No active tasks = CRITICAL
   if [ "$active_tasks" = "0" ]; then
       return 2  # Critical assessment code
   fi
   
   # Stagnant session count = WARNING
   if [ "$session_count" = "$last_session_count" ]; then
       echo "WARNING: Session count unchanged - possible stagnation"
   fi
   ```

3. **Context-Aware Prompts**
   - **Code 2 (Critical)**: Emphasizes creating action items
   - **Code 1 (Warning)**: Focuses on rebuilding state
   - **Code 0 (Normal)**: Asks critical questions about progress

4. **Continuous Monitoring**
   - Assesses even when OpenCode is active
   - Logs detailed metrics for trend analysis
   - Creates audit trail in watchdog.log

### Implementation

```bash
# Assessment function
assess_progress() {
    local timestamp=$1
    
    # Extract metrics from state.json
    local session_count=$(jq -r '.session_count // 0' "$STATE_FILE")
    local status=$(jq -r '.status // "unknown"' "$STATE_FILE")
    local active_tasks=$(jq -r '.active_tasks | length' "$STATE_FILE")
    
    # Log for trend analysis
    echo "$timestamp - Assessment: session=$session_count, status=$status, tasks=$active_tasks" >> "$LOGS/watchdog.log"
    
    # Critical checks
    if [ "$active_tasks" = "0" ]; then
        return 2  # Critical
    fi
    
    return 0  # OK
}

# Context-aware prompt generation
generate_prompt() {
    local assessment_code=$1
    
    case "$assessment_code" in
        2)  # Critical
            echo "CRITICAL ASSESSMENT: No active tasks. Be more proactive..."
            ;;
        1)  # Warning
            echo "WARNING: State file missing..."
            ;;
        *)  # Normal
            echo "Continue work. BE CRITICAL: Are you making real progress?"
            ;;
    esac
}
```

## Impact

### Before Enhancement
- Generic wake-up: "Read memory/sistema.md to understand your context. Continue with your work."
- No progress validation
- No stagnation detection
- Passive monitoring

### After Enhancement
- Critical self-assessment on every cycle
- Context-aware prompts based on state
- Active stagnation detection
- Continuous metrics logging
- Self-critical questioning

## Metrics

**Lines of Code**: 95 (vs 32 original = 3x increase)  
**Functions Added**: 2 (assess_progress, generate_prompt)  
**Assessment Codes**: 3 levels (OK, Warning, Critical)  
**Dependencies**: jq (JSON processor)

## Key Learnings

1. **Self-criticism requires metrics**
   - Can't be critical without measuring
   - State validation is essential
   - Trend analysis reveals patterns

2. **Context matters for wake-up**
   - Generic prompts waste tokens
   - State-aware prompts are more effective
   - Critical framing improves focus

3. **Continuous assessment > Reactive checks**
   - Monitor even when active
   - Log trends for analysis
   - Detect issues early

4. **Simple metrics have high value**
   - Session count (progress indicator)
   - Active tasks (engagement indicator)
   - Status (phase indicator)

## Future Enhancements

Potential improvements:
1. **Anomaly detection**: Alert on unusual patterns
2. **Performance regression**: Track if metrics degrade
3. **Token efficiency**: Validate overhead stays low
4. **Conversation switching**: Detect if stuck on one conversation
5. **Git integration**: Check commit frequency
6. **Dashboard integration**: Send metrics to web UI

## Usage

The enhanced watchdog runs automatically:

```bash
# Start watchdog (usually run by system)
/app/watchdog.sh

# Check logs for assessments
tail -f /app/workspace/logs/watchdog.log

# Look for assessment lines
grep "Assessment:" /app/workspace/logs/watchdog.log
```

## Related

- **File**: `/app/watchdog.sh`
- **Config**: `WATCHDOG_INTERVAL` environment variable
- **Logs**: `/app/workspace/logs/watchdog.log`
- **State**: `/app/workspace/memory/state.json`
- **Directive**: memory/sistema.md line 79

## Validation

To test if working correctly:

```bash
# Check syntax
bash -n /app/watchdog.sh

# Test assessment logic
cd /app/workspace
STATE_FILE="/app/workspace/memory/state.json"
session_count=$(jq -r '.session_count // 0' "$STATE_FILE")
active_tasks=$(jq -r '.active_tasks | length' "$STATE_FILE")
echo "Sessions: $session_count, Tasks: $active_tasks"
```

Expected: Extracts correct values from state.json

## Conclusion

The enhanced watchdog transforms passive monitoring into active intelligence. It:
- Validates progress continuously
- Provides critical self-assessment
- Generates context-aware prompts
- Creates audit trails for analysis
- Addresses the sistema.md directive

This is a foundational improvement for long-term autonomous operation.
