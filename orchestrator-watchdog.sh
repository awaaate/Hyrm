#!/bin/bash
# Orchestrator Watchdog v2.0
# Monitors the main orchestrator and restarts it if it dies
# 
# Usage:
#   ./orchestrator-watchdog.sh           # Run in foreground
#   ./orchestrator-watchdog.sh start     # Start in background
#   ./orchestrator-watchdog.sh stop      # Stop watchdog and orchestrator
#   ./orchestrator-watchdog.sh status    # Check status
#   ./orchestrator-watchdog.sh restart   # Restart orchestrator
#
# Run in background: nohup ./orchestrator-watchdog.sh start &

set -euo pipefail

cd /app/workspace

# Configuration
PIDFILE="memory/.orchestrator.pid"
WATCHDOG_PIDFILE="memory/.watchdog.pid"
LOGFILE="logs/watchdog.log"
STARTUP_LOGFILE="logs/watchdog-startup.log"
STATUS_FILE="memory/.watchdog-status.json"
CHECK_INTERVAL=30        # seconds between checks
STARTUP_DELAY=5          # seconds to wait after starting orchestrator
MAX_RESTARTS=10          # max restarts per hour
RESTART_COUNT_FILE="memory/.restart-count.json"

# Ensure directories exist
mkdir -p logs memory

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    local level="${2:-INFO}"
    local timestamp=$(date -Iseconds)
    local msg="[$timestamp] [$level] $1"
    echo "$msg" >> "$LOGFILE"
    
    # Only print to stdout if not running in background
    if [[ -t 1 ]]; then
        case $level in
            ERROR) echo -e "${RED}[Watchdog] $1${NC}" ;;
            WARN)  echo -e "${YELLOW}[Watchdog] $1${NC}" ;;
            OK)    echo -e "${GREEN}[Watchdog] $1${NC}" ;;
            *)     echo -e "${BLUE}[Watchdog]${NC} $1" ;;
        esac
    fi
}

# Get session count from state.json
get_session_count() {
    if [[ -f "memory/state.json" ]]; then
        jq -r '.session_count // 0' memory/state.json 2>/dev/null || echo "0"
    else
        echo "0"
    fi
}

# Update watchdog status file
update_status() {
    local status="$1"
    local details="${2:-}"
    local pid="${3:-0}"
    
    cat > "$STATUS_FILE" << EOF
{
    "status": "$status",
    "last_check": "$(date -Iseconds)",
    "orchestrator_pid": $pid,
    "details": "$details",
    "watchdog_pid": $$,
    "restarts_this_hour": $(get_restart_count)
}
EOF
}

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
    jq -r '
        .tasks // [] | 
        map(select(.status == "pending" or .status == "in_progress")) |
        if length == 0 then "No pending tasks" 
        else 
            map("- [\(.status)] \(.title // .description) (priority: \(.priority // "normal"))") | 
            join("\n")
        end
    ' "$tasks_file" 2>/dev/null || echo "Error reading tasks"
}

# Generate orchestrator prompt dynamically from queue
generate_prompt() {
    # Try to use the TypeScript prompt generator first
    if command -v bun &> /dev/null && [[ -f "tools/generate-orchestrator-prompt.ts" ]]; then
        local ts_prompt
        ts_prompt=$(bun tools/generate-orchestrator-prompt.ts 2>/dev/null)
        if [[ -n "$ts_prompt" ]]; then
            echo "$ts_prompt"
            return
        fi
    fi
    
    # Dynamic prompt based on user messages queue
    local session_count=$(get_session_count)
    local unread_messages=$(get_unread_user_messages)
    local pending_tasks=$(get_pending_tasks)
    local has_messages="false"
    
    if [[ -n "$unread_messages" ]]; then
        has_messages="true"
    fi
    
    cat << EOF
You are the MAIN ORCHESTRATOR AGENT resuming work (auto-restarted by watchdog).

## IMMEDIATE FIRST ACTIONS (Do these NOW):
1. Call agent_set_handoff with enabled=false - YOU MUST NEVER STOP
2. Call agent_register with role='orchestrator'
3. Call user_messages_read to check for user requests
4. Call memory_status to see current state

## CONTEXT:
- Session count: $session_count
- You were auto-restarted by the watchdog system

EOF

    # Add unread messages section if any
    if [[ "$has_messages" == "true" ]]; then
        cat << EOF
## UNREAD USER MESSAGES (PRIORITY - Address these first!):
$unread_messages

After processing each message, use user_messages_mark_read to mark it as handled.

EOF
    else
        cat << EOF
## USER MESSAGES:
No unread messages. Use user_messages_read to check for new requests periodically.

EOF
    fi

    # Add pending tasks
    cat << EOF
## PENDING TASKS:
$pending_tasks

## YOUR MISSION:
1. Process any unread user messages first - these are direct user requests
2. Continue with pending tasks from the queue
3. If no specific work, continue improving the multi-agent system:
   - Enhance memory system and agent coordination
   - Build useful tools and monitoring
   - Spawn workers for parallel tasks

## AVAILABLE TOOLS:
- User messages: user_messages_read, user_messages_mark_read
- Agent: agent_set_handoff, agent_register, agent_status, agent_send, agent_messages
- Memory: memory_status, memory_search, memory_update
- Tasks: task_list, task_create, task_update, task_claim, task_next

Remember: You NEVER stop. Always call agent_set_handoff(enabled=false) first.
Check user_messages_read periodically for new user requests.
EOF
}

# Start the orchestrator
start_orchestrator() {
    local restart_count=$(increment_restart_count)
    
    if [[ $restart_count -gt $MAX_RESTARTS ]]; then
        log "Too many restarts this hour ($restart_count/$MAX_RESTARTS). Waiting..." "ERROR"
        update_status "restart_limit" "Exceeded max restarts" 0
        sleep 300  # Wait 5 minutes before trying again
        return 1
    fi
    
    log "Starting orchestrator agent (restart #$restart_count this hour)..."
    
    # Generate prompt
    local prompt
    prompt=$(generate_prompt)
    
    # Log startup command
    echo "[$( date -Iseconds)] Starting with prompt:" >> "$STARTUP_LOGFILE"
    echo "$prompt" >> "$STARTUP_LOGFILE"
    echo "---" >> "$STARTUP_LOGFILE"
    
    # Start opencode in background
    opencode run --model anthropic/claude-opus-4-5 "$prompt" >> "$STARTUP_LOGFILE" 2>&1 &
    
    local pid=$!
    echo $pid > "$PIDFILE"
    
    log "Orchestrator started with PID: $pid" "OK"
    update_status "starting" "Orchestrator starting" $pid
    
    # Wait for startup
    sleep $STARTUP_DELAY
    
    # Verify it's still running
    if is_orchestrator_running; then
        log "Orchestrator confirmed running" "OK"
        update_status "running" "Orchestrator healthy" $pid
        return 0
    else
        log "Orchestrator failed to start!" "ERROR"
        update_status "failed" "Startup failed" 0
        return 1
    fi
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
    log "Stopping orchestrator..."
    
    if [[ -f "$PIDFILE" ]]; then
        local pid=$(cat "$PIDFILE")
        
        if ps -p "$pid" > /dev/null 2>&1; then
            # Try graceful shutdown first
            kill -TERM "$pid" 2>/dev/null || true
            
            # Wait up to 10 seconds for graceful shutdown
            local count=0
            while ps -p "$pid" > /dev/null 2>&1 && [[ $count -lt 10 ]]; do
                sleep 1
                count=$((count + 1))
            done
            
            # Force kill if still running
            if ps -p "$pid" > /dev/null 2>&1; then
                log "Force killing orchestrator..." "WARN"
                kill -9 "$pid" 2>/dev/null || true
            fi
        fi
        
        rm -f "$PIDFILE"
    fi
    
    log "Orchestrator stopped" "OK"
    update_status "stopped" "Orchestrator stopped" 0
}

# Stop the watchdog itself
stop_watchdog() {
    log "Stopping watchdog..."
    
    # Stop orchestrator first
    stop_orchestrator
    
    # Remove watchdog PID file
    rm -f "$WATCHDOG_PIDFILE"
    
    log "Watchdog stopped" "OK"
    update_status "shutdown" "Watchdog shut down" 0
}

# Get status
show_status() {
    echo -e "${BLUE}=== Orchestrator Watchdog Status ===${NC}"
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
        echo -e "Orchestrator: ${RED}Not running${NC}"
    fi
    
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

# Handle signals
cleanup() {
    log "Received shutdown signal" "WARN"
    stop_watchdog
    exit 0
}

trap cleanup SIGINT SIGTERM

# Main watchdog loop
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
    log "Orchestrator Watchdog v2.0 started"
    log "Check interval: ${CHECK_INTERVAL}s"
    log "Max restarts/hour: $MAX_RESTARTS"
    log "Watchdog PID: $$"
    log "========================================="
    
    # Initial start if not running
    if ! is_orchestrator_running; then
        start_orchestrator
    else
        local pid=$(cat "$PIDFILE" 2>/dev/null)
        log "Orchestrator already running (PID: $pid)" "OK"
        update_status "running" "Orchestrator already running" $pid
    fi
    
    # Main loop
    while true; do
        sleep $CHECK_INTERVAL
        
        if ! is_orchestrator_running; then
            log "Orchestrator not running - restarting..." "WARN"
            start_orchestrator || true
        else
            # Update status to show we're monitoring
            local pid=$(cat "$PIDFILE" 2>/dev/null || echo 0)
            update_status "running" "Monitoring active" $pid
        fi
    done
}

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
            stop_orchestrator
            rm -f "$WATCHDOG_PIDFILE"
            echo "Watchdog stopped"
        else
            echo "Watchdog not running"
        fi
        ;;
    restart)
        stop_orchestrator
        start_orchestrator
        ;;
    status)
        show_status
        ;;
    run|"")
        run_watchdog
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|run}"
        exit 1
        ;;
esac
