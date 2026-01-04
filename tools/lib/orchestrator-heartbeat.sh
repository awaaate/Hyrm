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

set -euo pipefail

# Paths
cd /app/workspace
REGISTRY_PATH="memory/agent-registry.json"
LEASE_PATH="memory/orchestrator-state.json"
HEARTBEAT_LOG="logs/orchestrator-heartbeat.log"

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

# Main heartbeat function
# Called once per cycle (typically every 60 seconds)
perform_heartbeat() {
  # Try to find the orchestrator agent ID from the registry
  # We look for the first agent with role "orchestrator"
  if [[ ! -f "$REGISTRY_PATH" ]]; then
    # Registry doesn't exist yet, nothing to heartbeat
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
    return 0
  fi
  
  # Update both the registry and the lease
  update_agent_heartbeat "$orchestrator_agent" || true
  update_leader_lease "$orchestrator_agent" || true
  
  log_heartbeat "INFO" "Heartbeat cycle complete (agent: $orchestrator_agent)"
}

# Main entry point
log_heartbeat "INFO" "Heartbeat service starting"
perform_heartbeat
log_heartbeat "INFO" "Heartbeat service complete"
