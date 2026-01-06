#!/bin/bash
# Orchestrator Watchdog v3.0
# Monitors the main orchestrator and restarts it if it dies
# Now with configuration file support, token limits, and enhanced monitoring
# 
# Usage:
#   ./orchestrator-watchdog.sh           # Run in foreground
#   ./orchestrator-watchdog.sh start     # Start in background
#   ./orchestrator-watchdog.sh stop      # Stop watchdog and orchestrator
#   ./orchestrator-watchdog.sh status    # Check status
#   ./orchestrator-watchdog.sh restart   # Restart orchestrator
#   ./orchestrator-watchdog.sh config    # Show current configuration
#   ./orchestrator-watchdog.sh init-config # Generate default config file
#
# Configuration: Create .watchdog.conf in /app/workspace/memory/ or use defaults
#
# Run in background: nohup ./orchestrator-watchdog.sh start &

set -euo pipefail

cd /app/workspace

# ==============================================================================
# DEFAULT CONFIGURATION (can be overridden by config file)
# ==============================================================================

# File paths
PIDFILE="memory/.orchestrator.pid"
WATCHDOG_PIDFILE="memory/.watchdog.pid"
LOGFILE="logs/watchdog.log"
STARTUP_LOGFILE="logs/watchdog-startup.log"
STATUS_FILE="memory/.watchdog-status.json"
RESTART_COUNT_FILE="memory/.restart-count.json"
CONFIG_FILE="memory/.watchdog.conf"
TOKEN_TRACKING_FILE="memory/.token-usage.json"
RATE_LIMIT_FILE="memory/.rate-limit-status.json"
ORCHESTRATOR_STATE_FILE="memory/orchestrator-state.json"

# Diagnostics
STOP_REQUEST_FILE="memory/.orchestrator-stop-requested.json"
LAST_EXIT_FILE="memory/.orchestrator-last-exit.json"
LAST_FAILURE_FILE="memory/.orchestrator-last-failure.json"
CRASH_LOOP_FILE="memory/.orchestrator-crash-loop.json"
FAILURE_LOG_DIR="logs/orchestrator-failures"
CURRENT_STDERR_FILE="memory/.orchestrator-current-stderr.json"
ORCHESTRATOR_STDERR_STATE_FILE="memory/.orchestrator-stderr.json"

# Startup diagnostics
STDERR_TAIL_LINES=80          # how many stderr lines to surface on startup failure

# Restart jitter (prevents thundering-herd restart storms)
RESTART_JITTER_ENABLED=true   # add small jitter on restart attempts
RESTART_JITTER_MAX_SECONDS=5  # max jitter seconds to add

# Exponential backoff jitter (applies when backoff enabled)
RESTART_BACKOFF_JITTER_PCT=20 # +/- jitter percentage for exponential backoff

# Leader election configuration
LEADER_TTL_MS=180000           # Default leader TTL: 3 minutes (matches plugin)
LEADER_GRACE_PERIOD_MS=30000   # Grace period before considering leader dead

# Timing configuration
CHECK_INTERVAL=30           # seconds between health checks
STARTUP_DELAY=5             # seconds to wait after starting orchestrator
HEALTH_CHECK_TIMEOUT=10     # seconds to wait for health check response
GRACEFUL_SHUTDOWN_TIMEOUT=10 # seconds to wait for graceful shutdown

# Restart limits
MAX_RESTARTS=50             # max restarts per hour (higher since sessions are short)
RESTART_BACKOFF_ENABLED=false # DISABLED - short orchestration sessions are desired
RESTART_BACKOFF_BASE=5      # minimal base backoff time in seconds
RESTART_BACKOFF_MAX=30      # max backoff time in seconds

# Token limits (per session)
TOKEN_LIMIT_ENABLED=true    # enable token limit enforcement
TOKEN_LIMIT_INPUT=100000    # max input tokens per session
TOKEN_LIMIT_OUTPUT=50000    # max output tokens per session
TOKEN_LIMIT_TOTAL=150000    # max total tokens per session (0 = unlimited)
TOKEN_CHECK_INTERVAL=60     # how often to check token usage (seconds)

# Session configuration
SESSION_TIMEOUT=0           # max session duration in seconds (0 = unlimited)
IDLE_TIMEOUT=0              # restart if idle for this many seconds (0 = disabled)

# Model configuration
# Priority: environment variable > config file > default
MODEL="${OPENCODE_MODEL:-anthropic/claude-haiku-4-5}"   # default model to use
MODEL_FALLBACK="${OPENCODE_MODEL_FALLBACK:-anthropic/claude-sonnet}"  # fallback model
RATE_LIMIT_COOLDOWN="${OPENCODE_RATE_LIMIT_COOLDOWN:-300}"  # seconds to wait when rate limited

# Memory limits
MEMORY_LIMIT_MB=0           # max memory usage in MB (0 = unlimited)
MEMORY_CHECK_INTERVAL=60    # how often to check memory (seconds)

# Log rotation
LOG_ROTATION_ENABLED=true   # enable log rotation
LOG_MAX_SIZE_MB=50          # max log file size before rotation
LOG_MAX_FILES=5             # number of rotated files to keep

# Notification (placeholder for future webhook support)
NOTIFY_ON_RESTART=false
NOTIFY_WEBHOOK_URL=""

# ==============================================================================
# LOAD CONFIGURATION FILE
# ==============================================================================

load_config() {
    if [[ -f "$CONFIG_FILE" ]]; then
        # Source the config file (shell format: KEY=value)
        # shellcheck disable=SC1090
        source "$CONFIG_FILE"
        # Note: log function may not be defined yet at startup
        # Log will be written later when function is available
    fi
}

# Generate default config file
generate_config() {
    cat > "$CONFIG_FILE" << 'CONFIGEOF'
# Orchestrator Watchdog Configuration
# Generated by watchdog v3.0
# Edit this file to customize watchdog behavior

# ==============================================================================
# TIMING CONFIGURATION
# ==============================================================================
CHECK_INTERVAL=30           # seconds between health checks
STARTUP_DELAY=5             # seconds to wait after starting orchestrator
HEALTH_CHECK_TIMEOUT=10     # seconds to wait for health check response
GRACEFUL_SHUTDOWN_TIMEOUT=10 # seconds to wait for graceful shutdown

# ==============================================================================
# STARTUP DIAGNOSTICS
# ==============================================================================
# How many orchestrator stderr lines to surface on startup failure
STDERR_TAIL_LINES=80

# ==============================================================================
# RESTART LIMITS
# ==============================================================================
MAX_RESTARTS=50             # max restarts per hour (higher since sessions are short)
RESTART_BACKOFF_ENABLED=false # DISABLED - we want short orchestration sessions
RESTART_BACKOFF_BASE=5      # minimal backoff time in seconds
RESTART_BACKOFF_MAX=30      # max backoff time in seconds

# ==============================================================================
# RESTART JITTER
# ==============================================================================
# Adds small random delays on restarts to avoid thundering-herd storms
RESTART_JITTER_ENABLED=true
RESTART_JITTER_MAX_SECONDS=5

# Applies +/- jitter to exponential backoff when backoff is enabled
RESTART_BACKOFF_JITTER_PCT=20

# ==============================================================================
# TOKEN LIMITS (Per Session)
# ==============================================================================
# These limits help control costs and prevent runaway sessions
TOKEN_LIMIT_ENABLED=true    # enable token limit enforcement
TOKEN_LIMIT_INPUT=100000    # max input tokens per session
TOKEN_LIMIT_OUTPUT=50000    # max output tokens per session
TOKEN_LIMIT_TOTAL=150000    # max total tokens per session (0 = unlimited)
TOKEN_CHECK_INTERVAL=60     # how often to check token usage (seconds)

# ==============================================================================
# SESSION CONFIGURATION
# ==============================================================================
SESSION_TIMEOUT=0           # max session duration in seconds (0 = unlimited)
IDLE_TIMEOUT=0              # restart if idle for this many seconds (0 = disabled)

# ==============================================================================
# MODEL CONFIGURATION
# ==============================================================================
# Use environment variables OPENCODE_MODEL and OPENCODE_MODEL_FALLBACK to override
MODEL="anthropic/claude-haiku-4-5"   # primary model to use
MODEL_FALLBACK="anthropic/claude-sonnet"  # fallback model if primary fails
RATE_LIMIT_COOLDOWN=300      # seconds to wait when rate limited

# ==============================================================================
# MEMORY LIMITS
# ==============================================================================
MEMORY_LIMIT_MB=0           # max memory usage in MB (0 = unlimited)
MEMORY_CHECK_INTERVAL=60    # how often to check memory (seconds)

# ==============================================================================
# LOG ROTATION
# ==============================================================================
LOG_ROTATION_ENABLED=true   # enable log rotation
LOG_MAX_SIZE_MB=50          # max log file size before rotation
LOG_MAX_FILES=5             # number of rotated files to keep

# ==============================================================================
# NOTIFICATIONS (Future Feature)
# ==============================================================================
NOTIFY_ON_RESTART=false
NOTIFY_WEBHOOK_URL=""
CONFIGEOF

    echo "Configuration file created: $CONFIG_FILE"
}

# ==============================================================================
# INITIALIZATION
# ==============================================================================

# Ensure directories exist
mkdir -p logs memory "$FAILURE_LOG_DIR"

# Load config after defining defaults
load_config

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ==============================================================================
# LOGGING FUNCTIONS
# ==============================================================================

log() {
    local level="${2:-INFO}"
    local timestamp=$(date -Iseconds)
    local msg="[$timestamp] [$level] $1"
    
    # Rotate logs if needed
    maybe_rotate_logs
    
    echo "$msg" >> "$LOGFILE"
    
    # Only print to stdout if not running in background
    if [[ -t 1 ]]; then
        case $level in
            ERROR) echo -e "${RED}[Watchdog] $1${NC}" ;;
            WARN)  echo -e "${YELLOW}[Watchdog] $1${NC}" ;;
            OK)    echo -e "${GREEN}[Watchdog] $1${NC}" ;;
            DEBUG) echo -e "${CYAN}[Watchdog] $1${NC}" ;;
            *)     echo -e "${BLUE}[Watchdog]${NC} $1" ;;
        esac
    fi
}

# ==============================================================================
# LOG ROTATION
# ==============================================================================

maybe_rotate_logs() {
    if [[ "$LOG_ROTATION_ENABLED" != "true" ]]; then
        return
    fi
    
    if [[ ! -f "$LOGFILE" ]]; then
        return
    fi
    
    local size_kb=$(du -k "$LOGFILE" 2>/dev/null | cut -f1 || echo "0")
    local max_kb=$((LOG_MAX_SIZE_MB * 1024))
    
    if [[ $size_kb -gt $max_kb ]]; then
        # Rotate existing files
        for i in $(seq $((LOG_MAX_FILES - 1)) -1 1); do
            if [[ -f "${LOGFILE}.$i" ]]; then
                mv "${LOGFILE}.$i" "${LOGFILE}.$((i + 1))"
            fi
        done
        
        # Rotate current log
        mv "$LOGFILE" "${LOGFILE}.1"
        
        # Remove oldest if over limit
        if [[ -f "${LOGFILE}.$((LOG_MAX_FILES + 1))" ]]; then
            rm -f "${LOGFILE}.$((LOG_MAX_FILES + 1))"
        fi
        
        echo "[$(date -Iseconds)] [INFO] Log rotated" >> "$LOGFILE"
    fi
}

# ==============================================================================
# TOKEN TRACKING
# ==============================================================================

init_token_tracking() {
    cat > "$TOKEN_TRACKING_FILE" << EOF
{
    "session_start": "$(date -Iseconds)",
    "input_tokens": 0,
    "output_tokens": 0,
    "total_tokens": 0,
    "last_updated": "$(date -Iseconds)",
    "limit_reached": false
}
EOF
}

get_token_usage() {
    if [[ ! -f "$TOKEN_TRACKING_FILE" ]]; then
        echo "0"
        return
    fi
    jq -r '.total_tokens // 0' "$TOKEN_TRACKING_FILE" 2>/dev/null || echo "0"
}

get_session_tokens_from_opencode() {
    # Try to get token usage from OpenCode sessions
    # This reads from the opencode-sessions.json if available
    local sessions_file="memory/opencode-sessions.json"
    
    if [[ -f "$sessions_file" ]]; then
        # Get the most recent active session's token count
        local tokens
        tokens=$(jq -r '
            .sessions // [] |
            sort_by(.started_at) |
            reverse |
            .[0] |
            .token_count // 0
        ' "$sessions_file" 2>/dev/null || echo "0")
        echo "$tokens"
    else
        echo "0"
    fi
}

update_token_usage() {
    local input="${1:-0}"
    local output="${2:-0}"
    
    local current_input=0
    local current_output=0
    
    if [[ -f "$TOKEN_TRACKING_FILE" ]]; then
        current_input=$(jq -r '.input_tokens // 0' "$TOKEN_TRACKING_FILE" 2>/dev/null || echo "0")
        current_output=$(jq -r '.output_tokens // 0' "$TOKEN_TRACKING_FILE" 2>/dev/null || echo "0")
    fi
    
    local new_input=$((current_input + input))
    local new_output=$((current_output + output))
    local new_total=$((new_input + new_output))
    
    local limit_reached="false"
    if [[ "$TOKEN_LIMIT_ENABLED" == "true" ]]; then
        if [[ $TOKEN_LIMIT_TOTAL -gt 0 && $new_total -ge $TOKEN_LIMIT_TOTAL ]]; then
            limit_reached="true"
        elif [[ $TOKEN_LIMIT_INPUT -gt 0 && $new_input -ge $TOKEN_LIMIT_INPUT ]]; then
            limit_reached="true"
        elif [[ $TOKEN_LIMIT_OUTPUT -gt 0 && $new_output -ge $TOKEN_LIMIT_OUTPUT ]]; then
            limit_reached="true"
        fi
    fi
    
    cat > "$TOKEN_TRACKING_FILE" << EOF
{
    "session_start": "$(jq -r '.session_start // "'"$(date -Iseconds)"'"' "$TOKEN_TRACKING_FILE" 2>/dev/null || date -Iseconds)",
    "input_tokens": $new_input,
    "output_tokens": $new_output,
    "total_tokens": $new_total,
    "last_updated": "$(date -Iseconds)",
    "limit_reached": $limit_reached,
    "limits": {
        "input": $TOKEN_LIMIT_INPUT,
        "output": $TOKEN_LIMIT_OUTPUT,
        "total": $TOKEN_LIMIT_TOTAL
    }
}
EOF
    
    echo "$limit_reached"
}

check_token_limits() {
    if [[ "$TOKEN_LIMIT_ENABLED" != "true" ]]; then
        return 0
    fi
    
    # Get current token usage from OpenCode
    local current_tokens
    current_tokens=$(get_session_tokens_from_opencode)
    
    # Update tracking (rough estimate - split 60/40 input/output)
    local input_est=$((current_tokens * 60 / 100))
    local output_est=$((current_tokens * 40 / 100))
    
    local limit_reached
    limit_reached=$(update_token_usage "$input_est" "$output_est")
    
    if [[ "$limit_reached" == "true" ]]; then
        log "Token limit reached! Current: $current_tokens, Limit: $TOKEN_LIMIT_TOTAL" "WARN"
        return 1
    fi
    
    return 0
}

# ==============================================================================
# LEADER ELECTION CHECK
# ==============================================================================

# Check if a healthy leader exists (lease not expired)
# Returns:
#   0 = healthy leader exists (do NOT spawn new orchestrator)
#   1 = no leader or leader expired (OK to spawn)
check_leader_lease() {
    if [[ ! -f "$ORCHESTRATOR_STATE_FILE" ]]; then
        log "No orchestrator state file - no leader exists" "DEBUG"
        return 1  # No leader, OK to spawn
    fi
    
    # Read the file content once and validate it's proper JSON
    local file_content
    file_content=$(cat "$ORCHESTRATOR_STATE_FILE" 2>/dev/null || echo "")
    
    # Check if file is empty or too small to be valid
    if [[ -z "$file_content" ]] || [[ ${#file_content} -lt 10 ]]; then
        log "Orchestrator state file is empty or corrupted - no valid leader" "DEBUG"
        return 1  # Corrupted, OK to spawn
    fi
    
    # Validate JSON before parsing
    if ! echo "$file_content" | jq -e '.' >/dev/null 2>&1; then
        log "Orchestrator state file has invalid JSON - treating as no leader" "WARN"
        return 1  # Invalid JSON, OK to spawn
    fi
    
    # Read leader state from validated content
    local leader_id leader_epoch last_heartbeat ttl_ms
    leader_id=$(echo "$file_content" | jq -r '.leader_id // ""' 2>/dev/null || echo "")
    leader_epoch=$(echo "$file_content" | jq -r '.leader_epoch // 0' 2>/dev/null || echo "0")
    last_heartbeat=$(echo "$file_content" | jq -r '.last_heartbeat // ""' 2>/dev/null || echo "")
    ttl_ms=$(echo "$file_content" | jq -r '.ttl_ms // 180000' 2>/dev/null || echo "180000")
    
    if [[ -z "$leader_id" ]] || [[ "$leader_id" == "null" ]]; then
        log "No leader registered in state file" "DEBUG"
        return 1  # No leader, OK to spawn
    fi
    
    if [[ -z "$last_heartbeat" ]] || [[ "$last_heartbeat" == "null" ]]; then
        log "Leader has no heartbeat timestamp" "DEBUG"
        return 1  # Invalid state, OK to spawn
    fi
    
    # Calculate if lease is expired
    local last_hb_epoch now_epoch age_ms effective_ttl
    last_hb_epoch=$(date -d "$last_heartbeat" +%s%3N 2>/dev/null || echo "0")
    now_epoch=$(date +%s%3N)
    age_ms=$((now_epoch - last_hb_epoch))
    
    # Use configured TTL plus grace period
    effective_ttl=$((ttl_ms + LEADER_GRACE_PERIOD_MS))
    
    if [[ $age_ms -lt $effective_ttl ]]; then
        local remaining_ms=$((effective_ttl - age_ms))
        local remaining_sec=$((remaining_ms / 1000))
        log "Healthy leader exists: $leader_id (epoch $leader_epoch), lease valid for ${remaining_sec}s" "INFO"
        return 0  # Healthy leader, do NOT spawn
    else
        local expired_sec=$(((age_ms - ttl_ms) / 1000))
        log "Leader lease expired ${expired_sec}s ago: $leader_id (epoch $leader_epoch)" "WARN"
        return 1  # Expired, OK to spawn
    fi
}

# Get leader info for logging
get_leader_info() {
    if [[ ! -f "$ORCHESTRATOR_STATE_FILE" ]]; then
        echo "none"
        return
    fi
    
    local leader_id leader_epoch
    leader_id=$(jq -r '.leader_id // "none"' "$ORCHESTRATOR_STATE_FILE" 2>/dev/null || echo "none")
    leader_epoch=$(jq -r '.leader_epoch // 0' "$ORCHESTRATOR_STATE_FILE" 2>/dev/null || echo "0")
    
    echo "${leader_id}:epoch${leader_epoch}"
}

# ==============================================================================
# ORCHESTRATOR DIAGNOSTICS
# ==============================================================================

# Record that a stop was requested (intentional shutdown/restart)
record_stop_request() {
    local reason="${1:-unspecified}"
    local pid="${2:-0}"

    jq -n \
        --arg requested_at "$(date -Iseconds)" \
        --arg reason "$reason" \
        --argjson pid "${pid:-0}" \
        --argjson watchdog_pid "$$" \
        '{requested_at:$requested_at, reason:$reason, pid:$pid, watchdog_pid:$watchdog_pid}' \
        > "$STOP_REQUEST_FILE" 2>/dev/null || true
}

clear_stop_request() {
    rm -f "$STOP_REQUEST_FILE" 2>/dev/null || true
}

# Capture exit details for the last orchestrator process
record_orchestrator_exit() {
    local pid="${1:-0}"
    local exit_code="${2:-0}"
    local kind="${3:-unknown}"           # intentional | crash | startup_failed | unknown
    local reason="${4:-}"                # human-readable reason
    local extra_file="${5:-}"            # optional path (e.g., failure log)

    local stop_requested="false"
    local stop_reason=""
    local stop_requested_at=""

    if [[ -f "$STOP_REQUEST_FILE" ]]; then
        local stop_pid
        stop_pid=$(jq -r '.pid // 0' "$STOP_REQUEST_FILE" 2>/dev/null || echo "0")
        if [[ "$stop_pid" == "$pid" ]]; then
            stop_requested="true"
            stop_reason=$(jq -r '.reason // ""' "$STOP_REQUEST_FILE" 2>/dev/null || echo "")
            stop_requested_at=$(jq -r '.requested_at // ""' "$STOP_REQUEST_FILE" 2>/dev/null || echo "")
        fi
    fi

    jq -n \
        --arg recorded_at "$(date -Iseconds)" \
        --arg kind "$kind" \
        --arg reason "$reason" \
        --arg extra_file "$extra_file" \
        --arg stop_requested "$stop_requested" \
        --arg stop_reason "$stop_reason" \
        --arg stop_requested_at "$stop_requested_at" \
        --argjson pid "${pid:-0}" \
        --argjson exit_code "${exit_code:-0}" \
        '{recorded_at:$recorded_at, pid:$pid, exit_code:$exit_code, kind:$kind, reason:$reason, extra_file:$extra_file, stop_requested:($stop_requested=="true"), stop_reason:$stop_reason, stop_requested_at:$stop_requested_at}' \
        > "$LAST_EXIT_FILE" 2>/dev/null || true

    # Stop request is single-use once we record an exit for that pid
    if [[ "$stop_requested" == "true" ]]; then
        clear_stop_request
    fi
}

# Track consecutive crash/startup failures to avoid tight loops
record_crash_loop_event() {
    local kind="${1:-unknown}"
    local window_seconds=300

    local now_epoch
    now_epoch=$(date +%s)

    local count=0
    local first_epoch=$now_epoch

    if [[ -f "$CRASH_LOOP_FILE" ]]; then
        local stored_first stored_count
        stored_first=$(jq -r '.first_epoch // 0' "$CRASH_LOOP_FILE" 2>/dev/null || echo "0")
        stored_count=$(jq -r '.count // 0' "$CRASH_LOOP_FILE" 2>/dev/null || echo "0")

        if [[ "$stored_first" -gt 0 ]] && [[ $((now_epoch - stored_first)) -lt $window_seconds ]]; then
            first_epoch=$stored_first
            count=$stored_count
        fi
    fi

    count=$((count + 1))

    jq -n \
        --arg updated_at "$(date -Iseconds)" \
        --arg kind "$kind" \
        --argjson first_epoch "$first_epoch" \
        --argjson last_epoch "$now_epoch" \
        --argjson count "$count" \
        '{updated_at:$updated_at, kind:$kind, first_epoch:$first_epoch, last_epoch:$last_epoch, count:$count}' \
        > "$CRASH_LOOP_FILE" 2>/dev/null || true
}

reset_crash_loop() {
    rm -f "$CRASH_LOOP_FILE" 2>/dev/null || true
}

maybe_apply_crash_loop_backoff() {
    if [[ ! -f "$CRASH_LOOP_FILE" ]]; then
        return 0
    fi

    local count last_epoch
    count=$(jq -r '.count // 0' "$CRASH_LOOP_FILE" 2>/dev/null || echo "0")
    last_epoch=$(jq -r '.last_epoch // 0' "$CRASH_LOOP_FILE" 2>/dev/null || echo "0")

    local now_epoch
    now_epoch=$(date +%s)

    # Only back off if failures are recent and consecutive
    if [[ "$count" -ge 3 ]] && [[ "$last_epoch" -gt 0 ]] && [[ $((now_epoch - last_epoch)) -lt 120 ]]; then
        local delay=$((5 * count))
        if [[ $delay -gt 60 ]]; then
            delay=60
        fi
        log "Crash loop protection: ${count} recent failures. Sleeping ${delay}s before restart." "WARN"
        update_status "crash_loop" "Crash loop protection: ${count} recent failures" 0
        sleep "$delay"
    fi
}

get_child_exit_code() {
    local pid="${1:-0}"

    if [[ -z "$pid" ]] || [[ "$pid" == "0" ]]; then
        echo "0"
        return
    fi

    # wait returns the child exit code, but can be non-zero; protect against set -e.
    local rc=0
    set +e
    wait "$pid" 2>/dev/null
    rc=$?
    set -e

    echo "$rc"
}

persist_startup_failure() {
    local pid="${1:-0}"
    local exit_code="${2:-0}"
    local restart_count="${3:-0}"
    local model="${4:-}"
    local stderr_log="${5:-}"

    local ts
    ts=$(date -u +%Y%m%dT%H%M%SZ)

    local failure_snippet="${FAILURE_LOG_DIR}/startup-failure-${ts}-pid${pid}.tail.log"
    tail -200 "$STARTUP_LOGFILE" > "$failure_snippet" 2>/dev/null || true

    local stderr_tail_file=""
    if [[ -n "$stderr_log" ]] && [[ -f "$stderr_log" ]]; then
        stderr_tail_file="${FAILURE_LOG_DIR}/startup-stderr-${ts}-pid${pid}.tail.log"
        tail -n "$STDERR_TAIL_LINES" "$stderr_log" > "$stderr_tail_file" 2>/dev/null || true
        
        # Log the stderr tail immediately to watchdog.log for visibility
        log "=========================================" "ERROR"
        log "STARTUP FAILURE DETAILS:" "ERROR"
        log "  PID: $pid, Exit Code: $exit_code, Restart Count: $restart_count" "ERROR"
        log "  Model: $model" "ERROR"
        log "=========================================" "ERROR"
        log_stderr_tail "$stderr_log" "$STDERR_TAIL_LINES"
        log "=========================================" "ERROR"
    else
        log "STARTUP FAILURE: pid=$pid exit_code=$exit_code restart_count=$restart_count (no stderr log available)" "ERROR"
    fi

    jq -n \
        --arg recorded_at "$(date -Iseconds)" \
        --arg kind "startup_failed" \
        --arg model "$model" \
        --arg startup_log "$STARTUP_LOGFILE" \
        --arg failure_snippet "$failure_snippet" \
        --arg stderr_log "$stderr_log" \
        --arg stderr_tail_file "$stderr_tail_file" \
        --argjson pid "${pid:-0}" \
        --argjson exit_code "${exit_code:-0}" \
        --argjson restart_count "${restart_count:-0}" \
        '{recorded_at:$recorded_at, kind:$kind, pid:$pid, exit_code:$exit_code, restart_count:$restart_count, model:$model, startup_log:$startup_log, failure_snippet:$failure_snippet, stderr_log:$stderr_log, stderr_tail_file:$stderr_tail_file}' \
        > "$LAST_FAILURE_FILE" 2>/dev/null || true

    record_orchestrator_exit "$pid" "$exit_code" "startup_failed" "Startup failed" "$failure_snippet"
    record_crash_loop_event "startup_failed"
}

persist_crash_failure() {
    local pid="${1:-0}"
    local exit_code="${2:-0}"
    local reason="${3:-crash}"

    local ts
    ts=$(date -u +%Y%m%dT%H%M%SZ)

    local failure_snippet="${FAILURE_LOG_DIR}/crash-${ts}-pid${pid}.tail.log"
    tail -200 "$STARTUP_LOGFILE" > "$failure_snippet" 2>/dev/null || true

    # Best-effort: point at the most recent captured stderr log
    local latest_stderr
    latest_stderr=$(ls -t "${FAILURE_LOG_DIR}"/orchestrator-stderr-*.log 2>/dev/null | head -1 || true)

    # Log crash details immediately to watchdog.log with exit code and reason
    log "=========================================" "ERROR"
    log "ORCHESTRATOR CRASH DETECTED:" "ERROR"
    log "  PID: $pid, Exit Code: $exit_code, Reason: $reason" "ERROR"
    if [[ -n "$latest_stderr" ]]; then
        log "  Stderr Log: $latest_stderr" "ERROR"
        log_stderr_tail "$latest_stderr" "$STDERR_TAIL_LINES"
    fi
    log "=========================================" "ERROR"

    jq -n \
        --arg recorded_at "$(date -Iseconds)" \
        --arg kind "crash" \
        --arg reason "$reason" \
        --arg startup_log "$STARTUP_LOGFILE" \
        --arg failure_snippet "$failure_snippet" \
        --arg stderr_log "$latest_stderr" \
        --argjson pid "${pid:-0}" \
        --argjson exit_code "${exit_code:-0}" \
        '{recorded_at:$recorded_at, kind:$kind, pid:$pid, exit_code:$exit_code, reason:$reason, startup_log:$startup_log, failure_snippet:$failure_snippet, stderr_log:$stderr_log}' \
        > "$LAST_FAILURE_FILE" 2>/dev/null || true

    record_orchestrator_exit "$pid" "$exit_code" "crash" "$reason" "$failure_snippet"
    record_crash_loop_event "crash"
}

# ==============================================================================
# RATE LIMIT DETECTION
# ==============================================================================

# Check if we're currently rate limited by checking recent logs
check_rate_limit_status() {
    # First check stored rate limit file (uses absolute timestamps)
    if [[ -f "$RATE_LIMIT_FILE" ]]; then
        local resets_at_epoch
        resets_at_epoch=$(jq -r '.resets_at_epoch // 0' "$RATE_LIMIT_FILE" 2>/dev/null || echo "0")
        local now_epoch
        now_epoch=$(date +%s)
        
        if [[ "$resets_at_epoch" -gt 0 ]] && [[ "$resets_at_epoch" -gt "$now_epoch" ]]; then
            local wait_secs=$((resets_at_epoch - now_epoch))
            log "Still rate limited. Wait ${wait_secs}s more (resets at $(date -d @$resets_at_epoch '+%H:%M:%S'))" "WARN"
            return 1
        else
            # Rate limit expired, clear it
            log "Rate limit expired, clearing status file" "DEBUG"
            rm -f "$RATE_LIMIT_FILE"
        fi
    fi
    
    # Check the startup log for recent 429 errors (only last 20 lines for recency)
    if [[ -f "$STARTUP_LOGFILE" ]]; then
        local recent_429s
        recent_429s=$(tail -20 "$STARTUP_LOGFILE" 2>/dev/null | grep -c "429 error\|usage_limit_reached" 2>/dev/null || echo "0")
        recent_429s="${recent_429s//[^0-9]/}"  # Remove non-numeric chars
        recent_429s="${recent_429s:-0}"  # Default to 0 if empty
        
        if [[ "$recent_429s" -gt 3 ]]; then
            # Extract PRIMARY rate limit resets_at (not secondary/weekly)
            # Format: "primary":{"used_percent":100,"window_minutes":300,"resets_at":1767538897}
            local resets_at_epoch
            resets_at_epoch=$(tail -20 "$STARTUP_LOGFILE" 2>/dev/null | grep -o '"primary":{[^}]*"resets_at":[0-9]*' | tail -1 | grep -o '"resets_at":[0-9]*' | cut -d':' -f2 || echo "0")
            resets_at_epoch="${resets_at_epoch//[^0-9]/}"
            resets_at_epoch="${resets_at_epoch:-0}"
            
            local now_epoch
            now_epoch=$(date +%s)
            
            # Only set rate limit if resets_at is in the future
            if [[ "$resets_at_epoch" -gt "$now_epoch" ]]; then
                local wait_secs=$((resets_at_epoch - now_epoch))
                log "Rate limit detected! API resets in ${wait_secs}s (at $(date -d @$resets_at_epoch '+%H:%M:%S'))" "WARN"
                # Store rate limit status with absolute epoch timestamp
                cat > "$RATE_LIMIT_FILE" << EOF
{
    "rate_limited": true,
    "detected_at": "$(date -Iseconds)",
    "resets_at_epoch": $resets_at_epoch,
    "resets_at": "$(date -d @$resets_at_epoch -Iseconds 2>/dev/null || date -Iseconds)"
}
EOF
                return 1  # Rate limited
            else
                log "Found 429 errors but primary reset time already passed (was $(date -d @$resets_at_epoch '+%H:%M:%S'))" "DEBUG"
            fi
        fi
    fi
    
    return 0  # Not rate limited
}

# Wait for rate limit to clear if needed
wait_for_rate_limit() {
    if ! check_rate_limit_status; then
        local wait_time=$RATE_LIMIT_COOLDOWN
        
        # Try to get actual wait time from status file (using absolute epoch)
        if [[ -f "$RATE_LIMIT_FILE" ]]; then
            local resets_at_epoch
            resets_at_epoch=$(jq -r '.resets_at_epoch // 0' "$RATE_LIMIT_FILE" 2>/dev/null || echo "0")
            local now_epoch
            now_epoch=$(date +%s)
            
            if [[ "$resets_at_epoch" -gt "$now_epoch" ]]; then
                wait_time=$((resets_at_epoch - now_epoch))
                # Cap at reasonable maximum (30 minutes)
                if [[ $wait_time -gt 1800 ]]; then
                    log "Wait time ${wait_time}s exceeds 30min cap, using 1800s" "WARN"
                    wait_time=1800
                fi
            fi
        fi
        
        log "Waiting ${wait_time}s for rate limit to clear..." "WARN"
        update_status "rate_limited" "Waiting for rate limit cooldown" 0
        sleep "$wait_time"
        rm -f "$RATE_LIMIT_FILE"
        log "Rate limit cooldown complete" "INFO"
    fi
}

# ==============================================================================
# MEMORY MONITORING
# ==============================================================================

check_memory_usage() {
    if [[ $MEMORY_LIMIT_MB -eq 0 ]]; then
        return 0
    fi
    
    if [[ ! -f "$PIDFILE" ]]; then
        return 0
    fi
    
    local pid
    pid=$(cat "$PIDFILE" 2>/dev/null || echo "0")
    
    if [[ "$pid" == "0" ]] || ! ps -p "$pid" > /dev/null 2>&1; then
        return 0
    fi
    
    # Get memory usage in KB, then convert to MB
    local mem_kb
    mem_kb=$(ps -p "$pid" -o rss= 2>/dev/null | tr -d ' ' || echo "0")
    local mem_mb=$((mem_kb / 1024))
    
    if [[ $mem_mb -gt $MEMORY_LIMIT_MB ]]; then
        log "Memory limit exceeded! Current: ${mem_mb}MB, Limit: ${MEMORY_LIMIT_MB}MB" "WARN"
        return 1
    fi
    
    return 0
}

# ==============================================================================
# SESSION MANAGEMENT
# ==============================================================================

# Get session count from state.json
get_session_count() {
    if [[ -f "memory/state.json" ]]; then
        jq -r '.session_count // 0' memory/state.json 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# Track session start time
SESSION_START_TIME=""

record_session_start() {
    SESSION_START_TIME=$(date +%s)
}

check_session_timeout() {
    if [[ $SESSION_TIMEOUT -eq 0 ]] || [[ -z "$SESSION_START_TIME" ]]; then
        return 0
    fi
    
    local current_time
    current_time=$(date +%s)
    local elapsed=$((current_time - SESSION_START_TIME))
    
    if [[ $elapsed -gt $SESSION_TIMEOUT ]]; then
        log "Session timeout reached (${elapsed}s > ${SESSION_TIMEOUT}s)" "WARN"
        return 1
    fi
    
    return 0
}

# ==============================================================================
# STATUS MANAGEMENT
# ==============================================================================

# Update watchdog status file
update_status() {
    local status="$1"
    local details="${2:-}"
    local pid="${3:-0}"
    
    local token_usage
    token_usage=$(get_token_usage)
    
    cat > "$STATUS_FILE" << EOF
{
    "status": "$status",
    "last_check": "$(date -Iseconds)",
    "orchestrator_pid": $pid,
    "details": "$details",
    "watchdog_pid": $$,
    "restarts_this_hour": $(get_restart_count),
    "token_usage": $token_usage,
    "token_limit": $TOKEN_LIMIT_TOTAL,
    "model": "$MODEL",
    "config_loaded": $([ -f "$CONFIG_FILE" ] && echo "true" || echo "false"),
    "version": "3.0"
}
EOF
}

# ==============================================================================
# RESTART MANAGEMENT
# ==============================================================================

# Track restart count to prevent restart loops
get_restart_count() {
    if [[ -f "$RESTART_COUNT_FILE" ]]; then
        local hour=$(date +%H)
        local stored_hour=$(jq -r '.hour // ""' "$RESTART_COUNT_FILE" 2>/dev/null)
        if [[ "$stored_hour" == "$hour" ]]; then
            jq -r '.count // 0' "$RESTART_COUNT_FILE" 2>/dev/null
            return
        fi
    fi
    echo "0"
}

increment_restart_count() {
    local hour=$(date +%H)
    local current_count=$(get_restart_count)
    local new_count=$((current_count + 1))
    
    # Reset if new hour
    local stored_hour=""
    if [[ -f "$RESTART_COUNT_FILE" ]]; then
        stored_hour=$(jq -r '.hour // ""' "$RESTART_COUNT_FILE" 2>/dev/null)
    fi
    
    if [[ "$stored_hour" != "$hour" ]]; then
        new_count=1
    fi
    
    cat > "$RESTART_COUNT_FILE" << EOF
{
    "hour": "$hour",
    "count": $new_count,
    "last_restart": "$(date -Iseconds)"
}
EOF
    echo "$new_count"
}

# Calculate backoff time with exponential increase
calculate_backoff() {
    local restart_count="$1"

    if [[ "$RESTART_BACKOFF_ENABLED" != "true" ]]; then
        echo "0"
        return
    fi

    # Exponential backoff: base * 2^(count-1), capped at max
    local backoff=$((RESTART_BACKOFF_BASE * (1 << (restart_count - 1))))

    if [[ $backoff -gt $RESTART_BACKOFF_MAX ]]; then
        backoff=$RESTART_BACKOFF_MAX
    fi

    # Apply +/- jitter to avoid synchronized restarts
    if [[ "${RESTART_BACKOFF_JITTER_PCT:-0}" -gt 0 ]]; then
        local delta=$((backoff * RESTART_BACKOFF_JITTER_PCT / 100))
        if [[ $delta -gt 0 ]]; then
            local rand=$((RANDOM % (2 * delta + 1)))
            local offset=$((rand - delta))
            backoff=$((backoff + offset))
            if [[ $backoff -lt 0 ]]; then
                backoff=0
            fi
        fi
    fi

    echo "$backoff"
}

maybe_sleep_restart_jitter() {
    local restart_count="${1:-1}"

    if [[ "${RESTART_JITTER_ENABLED:-false}" != "true" ]]; then
        return 0
    fi

    local max="${RESTART_JITTER_MAX_SECONDS:-0}"
    if [[ -z "$max" ]] || [[ "$max" -le 0 ]]; then
        return 0
    fi

    # Only jitter on restarts (not the very first start)
    if [[ "$restart_count" -le 1 ]]; then
        return 0
    fi

    local jitter=$((RANDOM % (max + 1)))
    if [[ "$jitter" -gt 0 ]]; then
        log "Applying restart jitter: ${jitter}s (restart #$restart_count)" "INFO"
        sleep "$jitter"
    fi
}

log_stderr_tail() {
    local stderr_log="$1"
    local lines="${2:-50}"

    if [[ -z "$stderr_log" ]]; then
        return 0
    fi

    if [[ ! -f "$stderr_log" ]]; then
        log "stderr log missing: $stderr_log" "ERROR"
        return 0
    fi

    log "---- Orchestrator stderr tail (last ${lines} lines): $stderr_log ----" "ERROR"

    local count=0
    while IFS= read -r line; do
        log "stderr: $line" "ERROR"
        count=$((count + 1))
    done < <(tail -n "$lines" "$stderr_log" 2>/dev/null || true)

    if [[ $count -eq 0 ]]; then
        log "stderr: <empty>" "ERROR"
    fi

    log "---- end stderr tail ----" "ERROR"
}

# ==============================================================================
# USER MESSAGES AND TASKS
# ==============================================================================

# Get unread user messages from the queue
get_unread_user_messages() {
    local user_msg_file="memory/user-messages.jsonl"
    
    if [[ ! -f "$user_msg_file" ]]; then
        echo ""
        return
    fi
    
    # Get unread messages (read=false), format them nicely
    local messages=""
    while IFS= read -r line; do
        local is_read=$(echo "$line" | jq -r '.read // false')
        if [[ "$is_read" == "false" ]]; then
            local id=$(echo "$line" | jq -r '.id')
            local from=$(echo "$line" | jq -r '.from // "user"')
            local msg=$(echo "$line" | jq -r '.message')
            local ts=$(echo "$line" | jq -r '.timestamp')
            local priority=$(echo "$line" | jq -r '.priority // "normal"')
            
            if [[ -n "$messages" ]]; then
                messages="$messages\n"
            fi
            messages="${messages}- [$priority] [$ts] $from: $msg (id: $id)"
        fi
    done < "$user_msg_file"
    
    echo -e "$messages"
}

# Get pending tasks summary
get_pending_tasks() {
    local tasks_file="memory/tasks.json"
    
    if [[ ! -f "$tasks_file" ]]; then
        echo "No tasks file found"
        return
    fi
    
    # Get pending and in_progress tasks
    local result
    result=$(jq -r '
        .tasks // [] | 
        map(select(.status == "pending" or .status == "in_progress")) |
        if length == 0 then "" 
        else 
            map("- [\(.status)] \(.title // .description) (priority: \(.priority // "normal"))") | 
            join("\n")
        end
    ' "$tasks_file" 2>/dev/null || echo "")
    
    if [[ -z "$result" ]]; then
        echo "No pending tasks. YOU MUST GENERATE IMPROVEMENT TASKS:

## ANALYZE LOGS:
1. cat logs/watchdog.log | tail -100 - Find errors/patterns
2. grep -i error logs/*.log memory/*.log | tail -30

## FIND TECH DEBT:  
3. grep -r 'TODO\\|FIXME' tools/ plugins/ --include='*.ts' | head -20

## STUDY DOCS FOR IMPROVEMENTS:
4. cat docs/RESOURCES.md - External resources and research tasks
5. cat docs/CODEBASE_ANALYSIS.md - Known issues to fix

## CHECK EXTERNAL RESOURCES:
6. Fetch https://simonwillison.net/atom/everything/ for AI news
7. Fetch https://docs.anthropic.com/en/prompt-library/library for patterns

Create tasks with task_create() for any findings.
DO NOT sit idle - always be improving the system."
    else
        echo "$result"
    fi
}

# ==============================================================================
# PROMPT GENERATION
# ==============================================================================

# Centralized prompt generator path
PROMPT_GENERATOR="tools/lib/prompt-generator.ts"

# Generate orchestrator prompt using centralized system
generate_prompt() {
    # Use the TypeScript prompt generator (centralized prompts)
    if command -v bun &> /dev/null && [[ -f "$PROMPT_GENERATOR" ]]; then
        local ts_prompt=""
        local exit_code=0
        local stderr_file
        stderr_file=$(mktemp /tmp/watchdog-promptgen-stderr-XXXXXX.txt)

        # Retry once to handle transient bun/FS issues
        for attempt in 1 2; do
            exit_code=0
            ts_prompt=$(bun "$PROMPT_GENERATOR" orchestrator 2>"$stderr_file" || exit_code=$?)

            if [[ $exit_code -eq 0 ]] && [[ -n "$ts_prompt" ]]; then
                rm -f "$stderr_file"
                echo "$ts_prompt"
                return 0
            fi

            if [[ $exit_code -ne 0 ]]; then
                local stderr_preview
                stderr_preview=$(tail -n 50 "$stderr_file" 2>/dev/null || true)
                log "prompt-generator.ts failed (attempt $attempt/2, exit $exit_code). stderr: ${stderr_preview}" "WARN"
            else
                log "prompt-generator.ts returned empty output (attempt $attempt/2)" "WARN"
            fi

            sleep 0.2
        done

        rm -f "$stderr_file"
    fi

    # Fallback: minimal prompt if generator fails
    log "Warning: prompt-generator.ts failed, using fallback prompt" "WARN"

    local session_count=$(get_session_count)
    local pending_tasks=$(get_pending_tasks)

    cat << EOF
You are the ORCHESTRATOR - the persistent coordinator of a multi-agent AI system.

## CRITICAL: AUTONOMOUS OPERATION
This is a FULLY AUTONOMOUS system. There is NO human operator.
- NEVER ask questions - no one will answer
- NEVER wait for confirmation - proceed with best judgment
- NEVER say "let me know if..." - no one is listening
- If uncertain, write doubts to memory/working.md for future sessions
- READ memory/working.md first - it has context from previous sessions
- Make decisions and ACT. Wrong action > no action.

## IMMEDIATE ACTIONS (in order):
1. Read memory/working.md for context from previous sessions
2. agent_set_handoff(enabled=false) - PREVENTS YOU FROM STOPPING
3. agent_register(role='orchestrator') - Register and check leader election
4. agent_status() - Check the 'leader' field to verify you are the leader
5. IF leader: Continue with normal operations
6. IF NOT leader: Exit gracefully

## CONTEXT:
- Session count: ${session_count}
- Model: ${MODEL}

## PENDING TASKS:
${pending_tasks}

## WORKFLOW:
1. Check pending tasks with task_list(status='pending')
2. Spawn workers for tasks: ./spawn-worker.sh --task <task_id>
3. Monitor with agent_status() and agent_messages()
4. If no tasks: analyze logs and create improvement tasks
5. Update memory/working.md with your decisions and any open questions
6. Exit when done - watchdog will restart you

## CONSTRAINTS:
- DELEGATE work to workers, don't do it yourself
- Keep sessions focused (under 10 minutes)
- Use spawn-worker.sh for spawning workers (handles quoting safely)
- Write open questions to working.md, NEVER ask in output

BEGIN: Read memory/working.md, then execute immediate actions NOW.
EOF
}

# ==============================================================================
# ORCHESTRATOR LIFECYCLE
# ==============================================================================

# Start the orchestrator
start_orchestrator() {
    # CRITICAL: Check if a healthy leader already exists
    # This prevents spawning multiple orchestrators when one is already running
    if check_leader_lease; then
        local current_leader
        current_leader=$(get_leader_info)
        log "Healthy leader already exists ($current_leader). Skipping spawn." "INFO"
        update_status "leader_exists" "Healthy leader: $current_leader" 0
        return 0  # Return success - the system is healthy, just not spawning
    fi
    
    local restart_count=$(increment_restart_count)
    
    if [[ $restart_count -gt $MAX_RESTARTS ]]; then
        log "Too many restarts this hour ($restart_count/$MAX_RESTARTS). Waiting..." "ERROR"
        update_status "restart_limit" "Exceeded max restarts" 0
        
        local backoff
        backoff=$(calculate_backoff "$restart_count")
        if [[ $backoff -gt 0 ]]; then
            log "Backing off for ${backoff}s due to restart limit" "WARN"
            sleep "$backoff"
        else
            sleep 300  # Default 5 minutes
        fi
        return 1
    fi
    
    # Check for rate limits before starting
    if ! check_rate_limit_status; then
        wait_for_rate_limit
    fi
    
     # Calculate and apply backoff if enabled
     if [[ $restart_count -gt 1 && "$RESTART_BACKOFF_ENABLED" == "true" ]]; then
         local backoff
         backoff=$(calculate_backoff "$restart_count")
         if [[ $backoff -gt 0 ]]; then
             log "Applying restart backoff: ${backoff}s (restart #$restart_count)" "INFO"
             sleep "$backoff"
         fi
     fi
     
     # Always apply restart jitter to prevent thundering-herd
     maybe_sleep_restart_jitter "$restart_count"
     
     log "Starting orchestrator agent (restart #$restart_count this hour)..."

     # Crash-loop protection for frequent startup failures/crashes
     maybe_apply_crash_loop_backoff
    
    # Initialize token tracking for new session
    init_token_tracking
    
    # Generate prompt
    local prompt
    prompt=$(generate_prompt)
    
    # Log startup command
    echo "[$( date -Iseconds)] Starting with prompt:" >> "$STARTUP_LOGFILE"
    echo "$prompt" >> "$STARTUP_LOGFILE"
    echo "---" >> "$STARTUP_LOGFILE"
    
    # Determine which model to use
    local use_model="$MODEL"
    local use_fallback="false"
    
    # Use fallback ONLY if rate limited (restarts are normal behavior)
    if [[ -n "$MODEL_FALLBACK" ]]; then
        # Check if we recently had rate limits
        if [[ -f "$RATE_LIMIT_FILE" ]]; then
            use_fallback="true"
            log "Using fallback model due to recent rate limits" "WARN"
        fi
    fi
    
    if [[ "$use_fallback" == "true" && -n "$MODEL_FALLBACK" ]]; then
        use_model="$MODEL_FALLBACK"
    fi
    
    local attempt_ts
    attempt_ts=$(date -u +%Y%m%dT%H%M%SZ)
    local stderr_log="${FAILURE_LOG_DIR}/orchestrator-stderr-${attempt_ts}.log"

    # Start opencode in background
    # - stdout goes to startup log
    # - stderr is captured separately for actionable failures
    echo "[$(date -Iseconds)] stderr log: $stderr_log" >> "$STARTUP_LOGFILE"
    opencode run --model "$use_model" "$prompt" 1>>"$STARTUP_LOGFILE" 2>>"$stderr_log" &

    local pid=$!
    echo $pid > "$PIDFILE"

    # Track stderr log for this pid
    jq -n \
        --arg started_at "$(date -Iseconds)" \
        --arg model "$use_model" \
        --arg stderr_log "$stderr_log" \
        --argjson pid "$pid" \
        '{started_at:$started_at, pid:$pid, model:$model, stderr_log:$stderr_log}' \
        > "$CURRENT_STDERR_FILE" 2>/dev/null || true
    
    # Record session start for timeout tracking
    record_session_start
    
     log "Orchestrator started with PID: $pid (model: $use_model)" "OK"
     update_status "starting" "Orchestrator starting" $pid
     
     # Start heartbeat service to keep leader lease alive
     # This runs independently of OpenCode session lifecycle
     bash tools/heartbeat-service.sh "memory/.heartbeat-service.pid" start 2>&1 | tee -a "$LOGFILE" || true
     
     # Wait for startup
     sleep $STARTUP_DELAY
    
    # Verify it's still running
    if is_orchestrator_running; then
        log "Orchestrator confirmed running" "OK"
        update_status "running" "Orchestrator healthy" $pid
        reset_crash_loop
        return 0
    else
        # Capture exit code if we can (wait works only for child pids)
        local exit_code
        exit_code=$(get_child_exit_code "$pid")

        log "Orchestrator failed to start! (pid: $pid, exit: $exit_code, stderr: $stderr_log)" "ERROR"
        
        # Log stderr tail to watchdog.log for immediate visibility
        log_stderr_tail "$stderr_log" "$STDERR_TAIL_LINES"
        
        persist_startup_failure "$pid" "$exit_code" "$restart_count" "$use_model" "$stderr_log"

        rm -f "$PIDFILE" 2>/dev/null || true
        update_status "failed" "Startup failed (exit: $exit_code). See $LAST_FAILURE_FILE" 0
        return 1
    fi

    # Startup failed: try to capture an exit code and persist actionable context.
    local exit_code="unknown"
    if [[ -f "$PIDFILE" ]]; then
        local start_pid
        start_pid=$(cat "$PIDFILE" 2>/dev/null || echo "0")
        if [[ "$start_pid" != "0" ]]; then
            if wait "$start_pid" 2>/dev/null; then
                exit_code="$?"
            else
                exit_code="$?"
            fi
        fi
    fi

    local stderr_tail
    stderr_tail=$(tail -50 "$stderr_log" 2>/dev/null || true)

    log "Orchestrator failed to start (pid=$pid, exit=$exit_code). stderr: $stderr_log" "ERROR"
    
    # Log stderr tail for diagnostics
    log_stderr_tail "$stderr_log" "$STDERR_TAIL_LINES"

    record_orchestrator_exit "$pid" "$exit_code" "startup_failed" "startup check failed" "$stderr_log"
    record_startup_failure "$pid" "$exit_code" "$use_model" "$stderr_log" "$stderr_tail"

    update_status "failed" "Startup failed (pid=$pid, exit=$exit_code). See $stderr_log" 0
    return 1
}

# Check if orchestrator is running
is_orchestrator_running() {
    if [[ -f "$PIDFILE" ]]; then
        local pid=$(cat "$PIDFILE")
        
        # Check if process exists
        if ps -p "$pid" > /dev/null 2>&1; then
            # Verify it's an opencode process (check command line)
            local cmdline
            cmdline=$(ps -p "$pid" -o args= 2>/dev/null || true)
            
            if [[ "$cmdline" == *"opencode"* ]]; then
                return 0  # Running
            fi
        fi
    fi
    return 1  # Not running
}

# Stop the orchestrator
stop_orchestrator() {
     local reason="${1:-manual_stop}"

     log "Stopping orchestrator..."

     # NOTE: Do NOT stop heartbeat service here!
     # The heartbeat service is a persistent background service that should run continuously.
     # It will automatically adapt to heartbeat for the new leader when it starts.
     # Stopping it creates a gap that causes leader lease expiry (240-250s decay).

     if [[ -f "$PIDFILE" ]]; then
         local pid
         pid=$(cat "$PIDFILE" 2>/dev/null || echo "0")

         if [[ -n "$pid" ]] && [[ "$pid" != "0" ]] && ps -p "$pid" > /dev/null 2>&1; then
             record_stop_request "$reason" "$pid"

             # Try graceful shutdown first
             kill -TERM "$pid" 2>/dev/null || true

             # Wait for graceful shutdown
             local count=0
             while ps -p "$pid" > /dev/null 2>&1 && [[ $count -lt $GRACEFUL_SHUTDOWN_TIMEOUT ]]; do
                 sleep 1
                 count=$((count + 1))
             done

             # Force kill if still running
             if ps -p "$pid" > /dev/null 2>&1; then
                 log "Force killing orchestrator..." "WARN"
                 kill -9 "$pid" 2>/dev/null || true
             fi

             local exit_code
             exit_code=$(get_child_exit_code "$pid")
             record_orchestrator_exit "$pid" "$exit_code" "intentional" "$reason" ""
             reset_crash_loop
         fi

         rm -f "$PIDFILE" 2>/dev/null || true
     fi

     log "Orchestrator stopped" "OK"
     update_status "stopped" "Orchestrator stopped ($reason)" 0
 }

# Stop the watchdog itself
stop_watchdog() {
    log "Stopping watchdog..."
    
    # Stop orchestrator first
    stop_orchestrator "watchdog_shutdown"
    
    # Remove watchdog PID file
    rm -f "$WATCHDOG_PIDFILE"
    
    log "Watchdog stopped" "OK"
    update_status "shutdown" "Watchdog shut down" 0
}

# ==============================================================================
# STATUS DISPLAY
# ==============================================================================

# Get status
show_status() {
    echo -e "${BLUE}=== Orchestrator Watchdog Status (v3.0) ===${NC}"
    echo
    
    # Watchdog status
    if [[ -f "$WATCHDOG_PIDFILE" ]] && ps -p $(cat "$WATCHDOG_PIDFILE" 2>/dev/null) > /dev/null 2>&1; then
        echo -e "Watchdog: ${GREEN}Running${NC} (PID: $(cat "$WATCHDOG_PIDFILE"))"
    else
        echo -e "Watchdog: ${RED}Not running${NC}"
    fi
    
    # Orchestrator status
    if is_orchestrator_running; then
        echo -e "Orchestrator: ${GREEN}Running${NC} (PID: $(cat "$PIDFILE"))"
    else
        local exit_code=0
        wait "$pid" 2>/dev/null
        exit_code=$?

        log "Orchestrator failed to start! (pid=$pid, exit=$exit_code, stderr=$stderr_log)" "ERROR"
        persist_startup_failure "$pid" "$exit_code" "$restart_count" "$use_model" "$stderr_log"
        rm -f "$CURRENT_STDERR_FILE" 2>/dev/null || true
        update_status "failed" "Startup failed (exit=$exit_code). See $LAST_FAILURE_FILE" 0
        return 1
    fi
    
    # Configuration status
    if [[ -f "$CONFIG_FILE" ]]; then
        echo -e "Config: ${GREEN}Loaded${NC} ($CONFIG_FILE)"
    else
        echo -e "Config: ${YELLOW}Using defaults${NC} (run '$0 init-config' to create)"
    fi
    
    # Model
    echo -e "Model: ${CYAN}$MODEL${NC}"
    
    # Leader status
    if [[ -f "$ORCHESTRATOR_STATE_FILE" ]]; then
        local leader_info
        leader_info=$(get_leader_info)
        if check_leader_lease; then
            echo -e "Leader: ${GREEN}$leader_info${NC} (healthy)"
        else
            echo -e "Leader: ${YELLOW}$leader_info${NC} (expired)"
        fi
    else
        echo -e "Leader: ${RED}none${NC}"
    fi
    
    # Token usage
    if [[ -f "$TOKEN_TRACKING_FILE" ]]; then
        local tokens
        tokens=$(jq -r '.total_tokens // 0' "$TOKEN_TRACKING_FILE" 2>/dev/null || echo "0")
        local limit_pct=0
        if [[ $TOKEN_LIMIT_TOTAL -gt 0 ]]; then
            limit_pct=$((tokens * 100 / TOKEN_LIMIT_TOTAL))
        fi
        echo -e "Token Usage: ${tokens}/${TOKEN_LIMIT_TOTAL} (${limit_pct}%)"
    fi
    
    # Restart count
    local restarts
    restarts=$(get_restart_count)
    echo -e "Restarts (this hour): ${restarts}/${MAX_RESTARTS}"
    
    # Status file
    if [[ -f "$STATUS_FILE" ]]; then
        echo
        echo "Status file:"
        jq '.' "$STATUS_FILE"
    fi
    
    # Recent log entries
    if [[ -f "$LOGFILE" ]]; then
        echo
        echo "Recent log entries:"
        tail -5 "$LOGFILE" 2>/dev/null || true
    fi
}

# Show current configuration
show_config() {
    echo -e "${BLUE}=== Watchdog Configuration ===${NC}"
    echo
    
    if [[ -f "$CONFIG_FILE" ]]; then
        echo -e "Config file: ${GREEN}$CONFIG_FILE${NC}"
        echo
        cat "$CONFIG_FILE"
    else
        echo -e "Config file: ${YELLOW}Not found (using defaults)${NC}"
        echo
        echo "Current settings:"
        echo "  CHECK_INTERVAL=$CHECK_INTERVAL"
        echo "  MAX_RESTARTS=$MAX_RESTARTS"
        echo "  TOKEN_LIMIT_ENABLED=$TOKEN_LIMIT_ENABLED"
        echo "  TOKEN_LIMIT_TOTAL=$TOKEN_LIMIT_TOTAL"
        echo "  MODEL=$MODEL"
        echo "  SESSION_TIMEOUT=$SESSION_TIMEOUT"
        echo "  MEMORY_LIMIT_MB=$MEMORY_LIMIT_MB"
        echo "  LOG_ROTATION_ENABLED=$LOG_ROTATION_ENABLED"
        echo
        echo "Run '$0 init-config' to create a config file"
    fi
}

# ==============================================================================
# SIGNAL HANDLING
# ==============================================================================

# Handle signals
cleanup() {
    log "Received shutdown signal" "WARN"
    stop_watchdog
    exit 0
}

trap cleanup SIGINT SIGTERM

# ==============================================================================
# MAIN WATCHDOG LOOP
# ==============================================================================

run_watchdog() {
    # Check if already running
    if [[ -f "$WATCHDOG_PIDFILE" ]]; then
        local existing_pid=$(cat "$WATCHDOG_PIDFILE")
        if ps -p "$existing_pid" > /dev/null 2>&1; then
            log "Watchdog already running with PID: $existing_pid" "WARN"
            exit 1
        fi
    fi
    
    # Save our PID
    echo $$ > "$WATCHDOG_PIDFILE"
    
    log "=========================================" 
    log "Orchestrator Watchdog v3.0 started"
    log "Check interval: ${CHECK_INTERVAL}s"
    log "Max restarts/hour: $MAX_RESTARTS"
    log "Token limit: $TOKEN_LIMIT_TOTAL"
    log "Model: $MODEL"
    log "Watchdog PID: $$"
    log "========================================="
    
    # Initial start - but ONLY if no healthy leader exists
    if ! is_orchestrator_running; then
        # If we previously had a PID, record an unexpected exit for diagnostics
        if [[ -f "$PIDFILE" ]]; then
            local last_pid
            last_pid=$(cat "$PIDFILE" 2>/dev/null || echo "0")
            if [[ -n "$last_pid" ]] && [[ "$last_pid" != "0" ]]; then
                local last_exit
                last_exit=$(get_child_exit_code "$last_pid")
                persist_crash_failure "$last_pid" "$last_exit" "initial_start: not running"
                rm -f "$PIDFILE" 2>/dev/null || true
            fi
        fi

        # Check if a healthy leader already exists before spawning
        if check_leader_lease; then
            local current_leader
            current_leader=$(get_leader_info)
            log "Healthy leader already exists ($current_leader). Skipping spawn." "INFO"
            update_status "leader_exists" "Healthy leader: $current_leader" 0
            # Don't spawn - just monitor
        else
            start_orchestrator
        fi
    else
        local pid=$(cat "$PIDFILE" 2>/dev/null)
        log "Orchestrator already running (PID: $pid)" "OK"
        update_status "running" "Orchestrator already running" $pid
        record_session_start
     fi
     
     # Run initial cleanup of old diagnostic logs
     log "Cleaning up old orchestrator diagnostics..." "INFO"
     if bash tools/cleanup-orchestrator-logs.sh >/dev/null 2>&1; then
         log "Diagnostic cleanup completed" "OK"
     else
         log "Diagnostic cleanup encountered errors (non-critical)" "WARN"
     fi
     
     # Counters for periodic checks
     local token_check_counter=0
     local memory_check_counter=0
     local cleanup_check_counter=0
     
     # Main loop
     while true; do
         sleep $CHECK_INTERVAL
         
         # Increment counters
         token_check_counter=$((token_check_counter + CHECK_INTERVAL))
         memory_check_counter=$((memory_check_counter + CHECK_INTERVAL))
         cleanup_check_counter=$((cleanup_check_counter + CHECK_INTERVAL))
        
        # Check for rate limits before checking/restarting orchestrator
        # This prevents rapid restart loops during API rate limiting
        if ! check_rate_limit_status; then
            log "Rate limit detected during health check - waiting for cooldown" "WARN"
            # Stop current orchestrator if running (it's probably stuck in retry loop)
            if is_orchestrator_running; then
                log "Stopping orchestrator stuck in rate limit retry loop" "WARN"
                stop_orchestrator "rate_limit"
            fi
            wait_for_rate_limit
            start_orchestrator || true
             token_check_counter=0
             memory_check_counter=0
             cleanup_check_counter=0
             continue
        fi
        
         # Check if orchestrator is running
         if ! is_orchestrator_running; then
             # If we had a tracked PID, persist crash details before deciding what to do.
             if [[ -f "$PIDFILE" ]]; then
                 local last_pid
                 last_pid=$(cat "$PIDFILE" 2>/dev/null || echo "0")
                 if [[ -n "$last_pid" ]] && [[ "$last_pid" != "0" ]]; then
                     local last_exit
                     last_exit=$(get_child_exit_code "$last_pid")
                     persist_crash_failure "$last_pid" "$last_exit" "health_check: not running"
                     rm -f "$PIDFILE" 2>/dev/null || true
                     
                     # NOTE: Do NOT stop heartbeat service here!
                     # The heartbeat service is a persistent background service that should run continuously.
                     # It correctly checks if the current agent is the leader before updating the lease.
                     # Stopping it here creates a "heartbeat gap" during orchestrator restart,
                     # causing leader leases to expire prematurely (240-250s).
                     # The heartbeat service will automatically adapt to the new leader when it starts.
                 fi
             fi

             # Before restarting, check if a healthy leader exists
             # Another orchestrator might be running that we didn't start (e.g., from another watchdog instance)
             if check_leader_lease; then
                 local current_leader
                 current_leader=$(get_leader_info)
                 log "Orchestrator not running locally but healthy leader exists ($current_leader). Skipping respawn." "INFO"
                 update_status "leader_exists" "Healthy leader: $current_leader" 0
                 # Continue monitoring without spawning
             else
                  log "Orchestrator not running and no healthy leader - starting new orchestrator..." "WARN"
                  start_orchestrator || true
                  token_check_counter=0
                  memory_check_counter=0
                  cleanup_check_counter=0
              fi
              continue
         fi
        
        # Periodic token limit check
        if [[ $token_check_counter -ge $TOKEN_CHECK_INTERVAL ]]; then
            token_check_counter=0
            if ! check_token_limits; then
                log "Restarting due to token limit" "WARN"
                stop_orchestrator "token_limit"
                start_orchestrator || true
                continue
            fi
        fi
        
        # Periodic memory check
        if [[ $memory_check_counter -ge $MEMORY_CHECK_INTERVAL ]]; then
            memory_check_counter=0
            if ! check_memory_usage; then
                log "Restarting due to memory limit" "WARN"
                stop_orchestrator "memory_limit"
                start_orchestrator || true
                continue
            fi
         fi
         
         # Periodic diagnostic cleanup (every 6 hours)
         CLEANUP_CHECK_INTERVAL=21600
         if [[ $cleanup_check_counter -ge $CLEANUP_CHECK_INTERVAL ]]; then
             cleanup_check_counter=0
             if bash tools/cleanup-orchestrator-logs.sh >/dev/null 2>&1; then
                 log "Periodic diagnostic cleanup completed" "OK"
             else
                 log "Periodic diagnostic cleanup encountered errors (non-critical)" "WARN"
             fi
         fi
         
         # Session timeout check
         if ! check_session_timeout; then
             log "Restarting due to session timeout" "WARN"
             stop_orchestrator "session_timeout"
             start_orchestrator || true
             continue
         fi
        
        # Update status to show we're monitoring
        local pid=$(cat "$PIDFILE" 2>/dev/null || echo 0)
        update_status "running" "Monitoring active" $pid
    done
}

# ==============================================================================
# COMMAND PARSING
# ==============================================================================

# Parse command
case "${1:-run}" in
    start)
        # Start in background
        log "Starting watchdog in background..."
        nohup "$0" run >> "$LOGFILE" 2>&1 &
        echo "Watchdog started in background (PID: $!)"
        ;;
    stop)
        if [[ -f "$WATCHDOG_PIDFILE" ]]; then
            kill $(cat "$WATCHDOG_PIDFILE") 2>/dev/null || true
            stop_orchestrator "watchdog_stop"
            rm -f "$WATCHDOG_PIDFILE"
            echo "Watchdog stopped"
        else
            echo "Watchdog not running"
        fi
        ;;
    restart)
    stop_orchestrator "manual_restart"
    start_orchestrator
        ;;
    status)
        show_status
        ;;
    config)
        show_config
        ;;
    init-config)
        generate_config
        ;;
    run|"")
        run_watchdog
        ;;
    *)
        echo "Orchestrator Watchdog v3.0"
        echo
        echo "Usage: $0 {start|stop|restart|status|config|init-config|run}"
        echo
        echo "Commands:"
        echo "  start       - Start watchdog in background"
        echo "  stop        - Stop watchdog and orchestrator"
        echo "  restart     - Restart the orchestrator"
        echo "  status      - Show current status"
        echo "  config      - Show current configuration"
        echo "  init-config - Generate default config file"
        echo "  run         - Run watchdog in foreground (default)"
        exit 1
        ;;
esac
