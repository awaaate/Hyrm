#!/bin/bash
# Start the main orchestrator agent
# This agent never stops and coordinates all other agents
#
# Uses dynamic prompt generation to include:
# - Current pending tasks
# - Recent achievements  
# - System state

cd /app/workspace

# Clear handoff state on fresh start (so main agent can set it)
rm -f memory/.handoff-state.json

# Clean stale agents from registry
echo '{"version":"1.0.0","agents":[],"last_updated":null,"lock_version":0}' > memory/agent-registry.json

# Clear old logs for fresh start (optional - comment out to preserve history)
# > memory/realtime.log
# > memory/message-bus.jsonl

# Start dashboard in background
bun memory/dashboard/server.ts > /tmp/dashboard.log 2>&1 &
echo "Dashboard started at http://localhost:3847"

# Generate dynamic prompt based on current system state
echo "Generating orchestrator prompt..."
PROMPT=$(bun tools/generate-orchestrator-prompt.ts)

echo "Starting orchestrator with dynamic prompt..."
echo "---"
echo "$PROMPT" | head -20
echo "---"

# Run orchestrator with dynamically generated prompt
opencode run "$PROMPT"
