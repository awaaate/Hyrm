#!/bin/bash
# Orchestrator Background Heartbeat Service
# Runs continuously in the background to keep leader lease alive
# Independent of OpenCode session lifecycle
#
# Usage:
#   bash tools/heartbeat-service.sh start [pid_file]
#   bash tools/heartbeat-service.sh stop
#   bash tools/heartbeat-service.sh status
#
# This service solves the problem where orchestrator sessions idle after 5-8 minutes,
# killing the JavaScript setInterval timer and causing leader lease to expire.
# The shell loop runs independently, so heartbeats continue even when session is idle.

set -euo pipefail

cd /app/workspace

# Default paths
HEARTBEAT_PIDFILE="${1:-memory/.heartbeat-service.pid}"
HEARTBEAT_LOG="logs/heartbeat-service.log"
HEARTBEAT_SCRIPT="tools/lib/orchestrator-heartbeat.sh"

# Ensure log directory exists
mkdir -p logs

# Helper function to log
log_heartbeat_svc() {
  local level="$1"
  local msg="$2"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  echo "[${timestamp}] [${level}] ${msg}" | tee -a "$HEARTBEAT_LOG"
}

# Start heartbeat service in background
start_heartbeat_service() {
  if [[ -f "$HEARTBEAT_PIDFILE" ]]; then
    local old_pid
    old_pid=$(cat "$HEARTBEAT_PIDFILE")
    if kill -0 "$old_pid" 2>/dev/null; then
      log_heartbeat_svc "WARN" "Heartbeat service already running (PID: $old_pid)"
      return 1
    else
      log_heartbeat_svc "INFO" "Cleaning up stale PID file"
      rm -f "$HEARTBEAT_PIDFILE"
    fi
  fi
  
  # Start the heartbeat loop in the background
  # Use nohup so it survives session termination
  # Use >>/dev/null to avoid hanging on output buffering
  nohup bash -c '
    cd /app/workspace
    while true; do
      # Run heartbeat every 60 seconds
      bash tools/lib/orchestrator-heartbeat.sh || true
      sleep 60
    done
  ' >> "$HEARTBEAT_LOG" 2>&1 &
  
  local bg_pid=$!
  echo "$bg_pid" > "$HEARTBEAT_PIDFILE"
  
  log_heartbeat_svc "INFO" "Heartbeat service started (PID: $bg_pid)"
  return 0
}

# Stop heartbeat service
stop_heartbeat_service() {
  if [[ ! -f "$HEARTBEAT_PIDFILE" ]]; then
    log_heartbeat_svc "WARN" "Heartbeat service not running (no PID file)"
    return 1
  fi
  
  local pid
  pid=$(cat "$HEARTBEAT_PIDFILE")
  
  if ! kill -0 "$pid" 2>/dev/null; then
    log_heartbeat_svc "WARN" "Heartbeat service process not found (PID: $pid)"
    rm -f "$HEARTBEAT_PIDFILE"
    return 1
  fi
  
  log_heartbeat_svc "INFO" "Stopping heartbeat service (PID: $pid)"
  
  # Send SIGTERM and wait up to 5 seconds
  kill "$pid" 2>/dev/null || true
  local count=0
  while kill -0 "$pid" 2>/dev/null && [[ $count -lt 5 ]]; do
    sleep 1
    count=$((count + 1))
  done
  
  # Force kill if still running
  if kill -0 "$pid" 2>/dev/null; then
    log_heartbeat_svc "WARN" "Force killing heartbeat service (PID: $pid)"
    kill -9 "$pid" 2>/dev/null || true
  fi
  
  rm -f "$HEARTBEAT_PIDFILE"
  log_heartbeat_svc "INFO" "Heartbeat service stopped"
  return 0
}

# Check status
check_status() {
  if [[ ! -f "$HEARTBEAT_PIDFILE" ]]; then
    echo "Heartbeat service: NOT RUNNING (no PID file)"
    return 1
  fi
  
  local pid
  pid=$(cat "$HEARTBEAT_PIDFILE")
  
  if kill -0 "$pid" 2>/dev/null; then
    echo "Heartbeat service: RUNNING (PID: $pid)"
    return 0
  else
    echo "Heartbeat service: NOT RUNNING (stale PID: $pid)"
    rm -f "$HEARTBEAT_PIDFILE"
    return 1
  fi
}

# Main dispatcher
case "${2:-start}" in
  start)
    start_heartbeat_service
    ;;
  stop)
    stop_heartbeat_service
    ;;
  status)
    check_status
    ;;
  *)
    echo "Usage: $0 <pid_file> {start|stop|status}"
    exit 1
    ;;
esac
