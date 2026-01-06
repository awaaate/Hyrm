#!/bin/bash
# Orchestrator Heartbeat Service
# Updates leader lease and agent registry heartbeat
# Runs independently of OpenCode session lifecycle
#
# This script is designed to run in a background shell loop
# It decouples heartbeats from the JavaScript session timer
# 
# Usage: bash tools/lib/orchestrator-heartbeat.sh
#        (called from heartbeat-service.sh)

set -uo pipefail
# Note: We use -u but not -e here because we want to handle errors gracefully
# and log them without immediately exiting the loop

# Paths
cd /app/workspace
REGISTRY_PATH="memory/agent-registry.json"
LEASE_PATH="memory/orchestrator-state.json"
HEARTBEAT_LOG="logs/orchestrator-heartbeat.log"
HEARTBEAT_STATS="memory/heartbeat-stats.json"

# Ensure log directory exists
mkdir -p logs

# Helper function to log
log_heartbeat() {
  local level="$1"
  local msg="$2"
  local timestamp
  timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  # Log to file
  echo "[${timestamp}] [${level}] ${msg}" >> "$HEARTBEAT_LOG"
  
  # Also log to realtime.log if available
  if [[ -f "memory/realtime.log" ]]; then
    echo "{\"timestamp\":\"${timestamp}\",\"level\":\"${level}\",\"message\":\"${msg}\",\"source\":\"heartbeat-service\"}" >> "memory/realtime.log"
  fi
}

# Get current timestamp in ISO format
get_iso_timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Update agent registry heartbeat for orchestrator
update_agent_heartbeat() {
  local agent_id="$1"
  local now
  now=$(get_iso_timestamp)
  
  if [[ ! -f "$REGISTRY_PATH" ]]; then
    log_heartbeat "WARN" "Agent registry not found at $REGISTRY_PATH"
    return 1
  fi
  
  # Use bun to safely update the registry
  # We use a temporary file to avoid corruption if script crashes mid-write
  local temp_registry
  temp_registry=$(mktemp)
  
  if bun run --smol - "$agent_id" "$now" > "$temp_registry" << 'BUNEOF'
const fs = require('fs');
const [agentId, timestamp] = process.argv.slice(2);
const registryPath = './memory/agent-registry.json';

try {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  
  // Find and update the orchestrator agent
  let found = false;
  for (const agent of registry.agents) {
    if (agent.agent_id === agentId) {
      agent.last_heartbeat = timestamp;
      found = true;
      break;
    }
  }
  
  if (found) {
    registry.last_updated = timestamp;
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    console.log('OK');
  } else {
    console.log('NOT_FOUND');
  }
} catch (e) {
  console.log('ERROR');
}
BUNEOF
  then
    local result
    result=$(cat "$temp_registry" 2>/dev/null || echo "ERROR")
    rm -f "$temp_registry"
    
    if [[ "$result" == "OK" ]]; then
      log_heartbeat "DEBUG" "Updated agent $agent_id heartbeat in registry"
      return 0
    else
      log_heartbeat "WARN" "Failed to update agent $agent_id in registry (status: $result)"
      return 1
    fi
  else
    rm -f "$temp_registry"
    log_heartbeat "WARN" "Failed to run registry update script"
    return 1
  fi
}

# Update orchestrator leader lease
update_leader_lease() {
  local agent_id="$1"
  local now
  now=$(get_iso_timestamp)
  
  if [[ ! -f "$LEASE_PATH" ]]; then
    log_heartbeat "WARN" "Leader lease not found at $LEASE_PATH"
    return 1
  fi
  
  # Use bun to safely update the lease
  local temp_lease
  temp_lease=$(mktemp)
  
  if bun run --smol - "$agent_id" "$now" > "$temp_lease" << 'BUNEOF'
const fs = require('fs');
const [agentId, timestamp] = process.argv.slice(2);
const leasePath = './memory/orchestrator-state.json';

try {
  const lease = JSON.parse(fs.readFileSync(leasePath, 'utf-8'));
  
  // Only update if this agent is the leader
  if (lease.leader_id === agentId) {
    lease.last_heartbeat = timestamp;
    fs.writeFileSync(leasePath, JSON.stringify(lease, null, 2));
    console.log('OK');
  } else {
    // Not the leader, don't update
    console.log('NOT_LEADER');
  }
} catch (e) {
  console.log('ERROR');
}
BUNEOF
  then
    local result
    result=$(cat "$temp_lease" 2>/dev/null || echo "ERROR")
    rm -f "$temp_lease"
    
    if [[ "$result" == "OK" ]]; then
      log_heartbeat "DEBUG" "Refreshed leader lease for agent $agent_id"
      return 0
    elif [[ "$result" == "NOT_LEADER" ]]; then
      log_heartbeat "DEBUG" "Not the leader, skipping lease refresh"
      return 0
    else
      log_heartbeat "WARN" "Failed to refresh leader lease (status: $result)"
      return 1
    fi
  else
    rm -f "$temp_lease"
    log_heartbeat "WARN" "Failed to run lease update script"
    return 1
  fi
}

# Update heartbeat statistics file
update_heartbeat_stats() {
  local success="$1"
  local agent_id="$2"
  local error_msg="${3:-}"
  
  # Use a temporary file for the script
  local temp_script
  temp_script=$(mktemp)
  
  cat > "$temp_script" << 'BUNEOF'
const fs = require('fs');
const statsPath = './memory/heartbeat-stats.json';
const [success, agentId, errorMsg] = process.argv.slice(2);
const isSuccess = success === 'true';

try {
  let stats = {
    last_update: new Date().toISOString(),
    total_cycles: 0,
    successful_cycles: 0,
    failed_cycles: 0,
    last_agent_id: null,
    last_success: false,
    last_error: null,
    last_heartbeat_timestamp: null
  };
  
  if (fs.existsSync(statsPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
      // Only use existing if it has the expected structure
      if (existing && typeof existing === 'object' && 'total_cycles' in existing) {
        stats = existing;
      }
    } catch (e) {
      // File is corrupted, start fresh
    }
  }
  
  stats.last_update = new Date().toISOString();
  stats.total_cycles = (stats.total_cycles || 0) + 1;
  stats.last_heartbeat_timestamp = new Date().toISOString();
  
  if (isSuccess) {
    stats.successful_cycles = (stats.successful_cycles || 0) + 1;
    stats.last_success = true;
    stats.last_error = null;
  } else {
    stats.failed_cycles = (stats.failed_cycles || 0) + 1;
    stats.last_success = false;
    stats.last_error = errorMsg || 'Unknown error';
  }
  stats.last_agent_id = agentId;
  
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  console.log('OK');
} catch (e) {
  console.log(`ERROR: ${e.message}`);
}
BUNEOF

  # Execute the script with bun
  if bun "$temp_script" "$success" "$agent_id" "$error_msg" > /dev/null 2>&1; then
    log_heartbeat "DEBUG" "Updated heartbeat stats (success=$success, agent=$agent_id)"
    rm -f "$temp_script"
    return 0
  else
    log_heartbeat "WARN" "Failed to update stats"
    rm -f "$temp_script"
    return 1
  fi
}

# Main heartbeat function
# Called once per cycle (typically every 60 seconds)
# Sets global variables: HEARTBEAT_AGENT, HEARTBEAT_STATUS
perform_heartbeat() {
  HEARTBEAT_AGENT=""
  HEARTBEAT_STATUS="unknown"
  
  # Try to find the orchestrator agent ID from the registry
  # We look for the first agent with role "orchestrator"
  if [[ ! -f "$REGISTRY_PATH" ]]; then
    # Registry doesn't exist yet, nothing to heartbeat
    HEARTBEAT_STATUS="no_registry"
    return 0
  fi
  
  local orchestrator_agent
  orchestrator_agent=$(bun run --smol - << 'BUNEOF'
const fs = require('fs');
const registryPath = './memory/agent-registry.json';

try {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  const orchestrator = registry.agents.find(a => a.assigned_role === 'orchestrator');
  if (orchestrator) {
    console.log(orchestrator.agent_id);
  }
} catch (e) {
  // Silently fail, no agent to heartbeat
}
BUNEOF
) || true
  
  if [[ -z "$orchestrator_agent" ]]; then
    # No orchestrator found, nothing to do
    HEARTBEAT_STATUS="no_orchestrator"
    return 0
  fi
  
  HEARTBEAT_AGENT="$orchestrator_agent"
  
  # Log diagnostic info at start
  log_heartbeat "DEBUG" "Starting heartbeat cycle for agent: $orchestrator_agent"
  
  # Update both the registry and the lease
  local registry_ok=0
  local lease_ok=0
  
  if update_agent_heartbeat "$orchestrator_agent"; then
    registry_ok=1
    log_heartbeat "DEBUG" "✓ Updated agent registry heartbeat for $orchestrator_agent"
  else
    log_heartbeat "WARN" "✗ Failed to update agent registry for $orchestrator_agent"
  fi
  
  if update_leader_lease "$orchestrator_agent"; then
    lease_ok=1
    log_heartbeat "DEBUG" "✓ Updated leader lease for $orchestrator_agent"
  else
    log_heartbeat "DEBUG" "Leader lease not updated (not leader or not found)"
  fi
  
  # Success requires at least registry update (lease may fail if not leader)
  if [[ $registry_ok -eq 1 ]]; then
    HEARTBEAT_STATUS="success"
    log_heartbeat "INFO" "Heartbeat cycle complete: registry=OK lease=$([ $lease_ok -eq 1 ] && echo 'OK' || echo 'SKIPPED') agent=$orchestrator_agent"
    return 0
  else
    HEARTBEAT_STATUS="failure"
    log_heartbeat "WARN" "Heartbeat cycle failed: registry_ok=$registry_ok lease_ok=$lease_ok agent=$orchestrator_agent"
    return 1
  fi
}

# Main entry point with error handling
main_heartbeat_cycle() {
  local start_time
  local end_time
  local duration_ms
  
  start_time=$(date +%s%N)
  
  log_heartbeat "INFO" "=== Heartbeat service cycle started ==="
  
  # Execute heartbeat with error handling
  HEARTBEAT_AGENT=""
  HEARTBEAT_STATUS="unknown"
  
  if perform_heartbeat; then
    end_time=$(date +%s%N)
    duration_ms=$(( (end_time - start_time) / 1000000 ))
    
    log_heartbeat "INFO" "✓ Heartbeat cycle SUCCESS (agent=$HEARTBEAT_AGENT status=$HEARTBEAT_STATUS duration=${duration_ms}ms)"
    update_heartbeat_stats "true" "${HEARTBEAT_AGENT:-UNKNOWN}" ""
  else
    end_time=$(date +%s%N)
    duration_ms=$(( (end_time - start_time) / 1000000 ))
    
    log_heartbeat "WARN" "✗ Heartbeat cycle FAILED (agent=$HEARTBEAT_AGENT status=$HEARTBEAT_STATUS duration=${duration_ms}ms will retry next cycle)"
    update_heartbeat_stats "false" "${HEARTBEAT_AGENT:-UNKNOWN}" "$HEARTBEAT_STATUS"
  fi
}

# Execute main cycle with error handling
if main_heartbeat_cycle 2>&1; then
  : # Success, do nothing
else
  # Catch any unhandled errors
  log_heartbeat "ERROR" "✗ Heartbeat service CRASHED - unhandled error in heartbeat cycle"
  update_heartbeat_stats "false" "UNKNOWN" "Unhandled error in heartbeat cycle"
fi
