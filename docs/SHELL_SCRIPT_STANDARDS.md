# Shell Script Best Practices & Standards

This guide documents shell script standards for the OpenCode multi-agent system. Adherence to these practices prevents silent failures, syntax errors, and portability issues that can cause critical infrastructure failures (as experienced in Session 206).

## Overview

The OpenCode system relies on several critical shell scripts for background infrastructure:
- **orchestrator-watchdog.sh** - Monitors and respawns the orchestrator
- **tools/heartbeat-service.sh** - Manages background heartbeat service lifecycle
- **tools/lib/orchestrator-heartbeat.sh** - Performs heartbeat cycle operations
- **tools/cleanup-orchestrator-logs.sh** - Archives and rotates diagnostic logs
- **spawn-worker.sh** - Spawns worker agents for task execution
- **start-main.sh** - System startup orchestration

All shell scripts are validated with **shellcheck** in CI/CD (GitHub Actions) to catch errors before deployment.

## Critical Lessons from Session 206

Session 206 identified a CRITICAL heartbeat script failure that caused orchestrator to restart every 240-250 seconds (2-3 times per hour):

**Root Cause**: Bash syntax errors in `tools/lib/orchestrator-heartbeat.sh`:
```bash
# WRONG: Using 'local' keyword outside function context (lines 325, 335, 337)
local duration_ms=...  # ❌ Error: "local: can only be used in a function"

# WRONG: Unbound variables without proper scoping (lines 284, 339)
orchestrator_agent=...  # ❌ Error: "orchestrator_agent: unbound variable"
```

**Impact**: Silent failure every 60 seconds → no heartbeat updates → leader lease expired after 240s.

**Solution**: Refactor all `local` declarations and variable assignments into proper function scope.

## Mandatory Standards

All shell scripts in the OpenCode system MUST comply with these standards:

### 1. Header & Documentation

Every shell script must have:
- Shebang line (`#!/bin/bash`)
- Purpose comment
- Usage examples (if applicable)
- Author/maintainer info (optional)

```bash
#!/bin/bash
# Orchestrator Heartbeat Service
# Updates leader lease every 60 seconds
# Decouples from JavaScript session lifecycle
#
# Usage: bash tools/lib/orchestrator-heartbeat.sh
#        (called from heartbeat-service.sh)

set -uo pipefail
```

### 2. Error Handling (set options)

Always start scripts with proper error handling:

```bash
#!/bin/bash
set -uo pipefail
# set -e: Exit on error (use cautiously)
# set -u: Error on unset variables
# set -o pipefail: Fail if any pipe command fails
```

**Use `set -e` only in short, linear scripts.** Use explicit error checks in complex scripts:

```bash
# ❌ DON'T: set -e silently hides complex errors
set -e
complex_operation_that_might_fail || true  # This defeats the purpose

# ✅ DO: Explicit error handling with context
if ! complex_operation; then
  echo "ERROR: Operation failed, context: ..."
  exit 1
fi
```

### 3. Function Declarations

All functions must:
- Have function declaration: `function_name() {` (not `function function_name() {`)
- Include comments explaining purpose and arguments
- Be declared before use
- Return explicit exit codes

```bash
# ✅ Correct function declaration
log_heartbeat() {
  local level="$1"
  local msg="$2"
  
  echo "[${timestamp}] [${level}] ${msg}" >> "$HEARTBEAT_LOG"
  return 0
}
```

### 4. Variable Scoping (CRITICAL)

**Rule: ALL function-local variables MUST use `local` keyword.**

```bash
# ❌ WRONG: Using local outside function context
local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")  # Error at line 325
timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")  # Pollutes global scope

# ✅ CORRECT: Use local inside functions only
main_heartbeat_cycle() {
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")  # Scoped to function
}
```

**Rule: Declare and assign variables separately when capturing command output:**

```bash
# ❌ BAD: Variable assignment masks return value
local timestamp=$(date -Iseconds)

# ✅ GOOD: Separate declaration and assignment
local timestamp
timestamp=$(date -Iseconds)

# Or check command success:
local timestamp
if timestamp=$(date -Iseconds); then
  echo "Got timestamp: $timestamp"
else
  echo "ERROR: Failed to get timestamp"
  return 1
fi
```

### 5. Command Substitution

Always use `$()` syntax, never backticks:

```bash
# ❌ WRONG: Backticks are deprecated and hard to read
result=`get_value`

# ✅ CORRECT: Use $() for clarity and nesting
result=$(get_value)
nested=$( echo "Value: $(get_inner)" )
```

### 6. Quoting (String Safety)

**Rule: Quote all variables unless you explicitly want word splitting.**

```bash
# ❌ DANGEROUS: Unquoted variables
if [ -f $LOGFILE ]; then  # Fails if LOGFILE has spaces

# ✅ SAFE: Always quote
if [ -f "$LOGFILE" ]; then  # Works with spaces

# Word splitting when intentional:
for file in $pattern; do  # Intentional word splitting on glob
  process "$file"
done
```

### 7. Conditionals

Always use `[[ ]]` for bash, or `[ ]` with careful quoting for POSIX:

```bash
# ✅ BASH (preferred for bash scripts)
if [[ "$result" == "OK" ]]; then
  echo "Success"
fi

# ✅ POSIX (for maximum compatibility)
if [ "$result" = "OK" ]; then
  echo "Success"
fi

# ❌ AVOID: Unquoted variables in conditionals
if [ $result = "OK" ]; then  # Fails if $result is empty
```

### 8. File Operations

Always check if directory operations succeed:

```bash
# ❌ WRONG: No error checking
cd /app/workspace
mkdir -p logs

# ✅ CORRECT: Validate or exit
cd /app/workspace || exit 1
mkdir -p logs || { echo "ERROR: Failed to create logs"; exit 1; }
```

### 9. Command Substitution in Variables

When using command output for critical values, validate:

```bash
# ❌ RISKY: No validation if command fails
size_kb=$(du -k "$LOGFILE" | cut -f1)

# ✅ BETTER: Fallback for safety
size_kb=$(du -k "$LOGFILE" 2>/dev/null | cut -f1 || echo "0")

# ✅ BEST: Separate and validate
local size_kb
if size_kb=$(du -k "$LOGFILE" 2>/dev/null | cut -f1); then
  echo "File size: $size_kb KB"
else
  echo "ERROR: Failed to get file size"
  return 1
fi
```

### 10. Unused Variables

Remove unused variables or document why they're needed:

```bash
# ❌ WRONG: Unused variables
HEARTBEAT_STATS="memory/heartbeat-stats.json"  # Never referenced

# ✅ CORRECT: Remove if not used
# Or add comment if reserved for future use:
HEARTBEAT_STATS="memory/heartbeat-stats.json"  # Reserved for future feature
```

### 11. Comments & Documentation

Comment non-obvious logic:

```bash
# ✅ GOOD: Explains WHY, not WHAT
# Separate declare and assign to catch command failures
local timestamp
timestamp=$(date -Iseconds)

# Comments for complex logic:
# Only update lease if this agent is current leader (check via lease.leader_id)
if [[ "$(jq -r '.leader_id' "$LEASE_PATH")" == "$orchestrator_agent" ]]; then
  update_lease
fi
```

## Shellcheck Validation

All shell scripts are validated with **shellcheck** to catch:

### Errors (severity=error)
- Syntax errors
- Command not found
- Undefined variables
- Invalid operators

### Warnings (severity=warning)
- Unused variables: `SC2034`
- Variable masking: `SC2155`
- Missing error checks: `SC2164`
- Unquoted variables: `SC2086`
- Deprecated syntax: `SC2006` (backticks)

### Run Shellcheck Locally

```bash
# Validate all project shell scripts
shellcheck --severity=warning \
  tools/heartbeat-service.sh \
  tools/lib/orchestrator-heartbeat.sh \
  tools/cleanup-orchestrator-logs.sh \
  orchestrator-watchdog.sh \
  spawn-worker.sh \
  start-main.sh

# Validate a single script
shellcheck tools/lib/orchestrator-heartbeat.sh

# Disable specific warnings if necessary (with justification)
shellcheck --exclude=SC2034 tools/heartbeat-service.sh
```

## CI/CD Integration

Shell scripts are validated in GitHub Actions (`.github/workflows/test.yml`):

1. **Job: shellcheck**
   - Runs on every push and PR
   - Installs shellcheck in CI environment
   - Validates all project shell scripts
   - Fails if warnings found (severity=warning)

2. **Failure handling**
   - CI fails if any script has warnings
   - Must fix before merging
   - No merging of shell syntax issues

Example workflow:

```yaml
shellcheck:
  name: Shell Script Linting
  runs-on: ubuntu-latest
  
  steps:
    - uses: actions/checkout@v4
    
    - name: Install shellcheck
      run: apt-get install -y shellcheck
    
    - name: Run shellcheck
      run: |
        shellcheck --severity=warning \
          tools/heartbeat-service.sh \
          tools/lib/orchestrator-heartbeat.sh \
          ...
```

## Pre-Commit Hook Integration

Optional: Add shell script validation to pre-commit hooks:

```bash
# .git/hooks/pre-commit
#!/bin/bash
# Validate shell scripts before commit

shellcheck --severity=warning \
  tools/heartbeat-service.sh \
  tools/lib/orchestrator-heartbeat.sh \
  tools/cleanup-orchestrator-logs.sh \
  orchestrator-watchdog.sh \
  spawn-worker.sh \
  start-main.sh

if [ $? -ne 0 ]; then
  echo "ERROR: Shell script validation failed"
  echo "Fix warnings with shellcheck and try again"
  exit 1
fi
```

## Common Mistakes to Avoid

| Mistake | Problem | Solution |
|---------|---------|----------|
| `local` outside functions | Syntax error, silent failure | Use `local` only inside functions |
| Unquoted variables | Space issues, globbing | Quote all variables: `"$var"` |
| Command output without check | Silent failures | Validate: `if result=$(cmd); then...` |
| Backticks instead of `$()` | Hard to read, nesting issues | Use `$()` syntax |
| `set -e` in complex scripts | Unexpected early exits | Use explicit error checks |
| Unset variables | Silent failures | Use `set -u` and initialize vars |
| No function scope | Global pollution | Use `local` for all function variables |
| Missing `cd` error checks | Wrong directory operations | Use `cd ... \|\| exit` |
| No comments on complex logic | Hard to maintain | Document WHY, not WHAT |

## Testing & Verification

Before merging shell script changes:

1. **Run shellcheck locally**
   ```bash
   shellcheck --severity=warning script.sh
   ```

2. **Test the script**
   ```bash
   bash script.sh --dry-run  # If supported
   bash script.sh  # Full test
   ```

3. **Verify in CI**
   - Push to branch
   - Check GitHub Actions results
   - Ensure shellcheck job passes

4. **Code review**
   - Have another person review shell changes
   - Verify error handling
   - Check for undocumented assumptions

## References

- **ShellCheck Documentation**: https://www.shellcheck.net/
- **Google Shell Style Guide**: https://google.github.io/styleguide/shellguide.html
- **Bash Strict Mode**: http://redsymbol.net/articles/unofficial-bash-strict-mode/
- **POSIX Shell**: https://pubs.opengroup.org/onlinepubs/9699919799/utilities/sh.html

## Session 206 Root Cause & Fix

**The Problem**:
```bash
# tools/lib/orchestrator-heartbeat.sh: WRONG
# Lines used 'local' outside function, causing silent failures:

local duration_ms=...  # Line 325 - ❌ Not in function
local start_time=...   # Line 335 - ❌ Not in function
local end_time=...     # Line 337 - ❌ Not in function
```

**The Fix**:
```bash
# Refactor into proper function scope:
main_heartbeat_cycle() {
  local duration_ms
  local start_time
  local end_time
  
  # ... rest of logic inside function ...
}
```

**Impact**:
- **Before**: Heartbeat failed silently every 60s → no lease updates → restart every 240-250s
- **After**: Heartbeat runs correctly → lease updates every 60s → stable orchestrators >180s

This incident validated why shell script validation is critical for infrastructure code.

## Questions & Issues

For shell script questions or issues:
1. Check shellcheck warnings: `shellcheck script.sh`
2. Run locally: `bash -x script.sh` (debug mode)
3. Review logs: check realtime.log and shell-specific logs
4. Update this guide if you discover new patterns or mistakes
