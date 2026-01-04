#!/bin/bash
# spawn-worker.sh - Safely spawn a worker agent without shell quoting issues
#
# Usage:
#   ./spawn-worker.sh "worker prompt here"
#   ./spawn-worker.sh --task <task_id>
#   ./spawn-worker.sh --file <prompt_file>
#
# Examples:
#   ./spawn-worker.sh "You are a CODE-WORKER. Task: Fix the bug in cli.ts"
#   ./spawn-worker.sh --task task_1767520273725_sckp83
#   echo "worker prompt" | ./spawn-worker.sh --stdin

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/memory/worker-spawns.log"
MODEL="${OPENCODE_MODEL:-openai/gpt-5.2}"

log() {
    echo "[$(date -Iseconds)] $1" >> "$LOG_FILE"
}

get_task_prompt() {
    local task_id="$1"
    local task_info
    task_info=$(cat "${SCRIPT_DIR}/memory/tasks.json" | jq -r --arg id "$task_id" '
        .tasks[] | select(.id == $id) | 
        "Task ID: \(.id)\nTitle: \(.title)\nDescription: \(.description // "No description")\nPriority: \(.priority)"
    ')
    
    if [[ -z "$task_info" ]]; then
        echo "Error: Task $task_id not found" >&2
        exit 1
    fi
    
    cat <<EOF
You are a CODE-WORKER agent.

## IMMEDIATE ACTIONS (in order):
1. agent_register(role="code-worker")
2. Read the task details and understand what needs to be done
3. Implement the solution
4. Test your changes if possible
5. When complete: agent_send(type="task_complete", payload={task_id: "${task_id}", summary: "..."})

## TASK DETAILS:
${task_info}

## GUIDELINES:
- Focus on this ONE task only
- Make clean, minimal changes
- Commit your work with a clear message
- Report completion via agent_send

## WHEN DONE:
You can exit normally (handoff enabled). The orchestrator will pick up your completion message.
EOF
}

# Parse arguments
PROMPT=""

case "${1:-}" in
    --task)
        if [[ -z "${2:-}" ]]; then
            echo "Usage: $0 --task <task_id>" >&2
            exit 1
        fi
        PROMPT=$(get_task_prompt "$2")
        TASK_ID="$2"
        ;;
    --file)
        if [[ -z "${2:-}" ]] || [[ ! -f "${2:-}" ]]; then
            echo "Usage: $0 --file <prompt_file>" >&2
            exit 1
        fi
        PROMPT=$(cat "$2")
        ;;
    --stdin)
        PROMPT=$(cat)
        ;;
    --help|-h)
        cat <<EOF
spawn-worker.sh - Safely spawn a worker agent

Usage:
  $0 "prompt string"           Spawn with inline prompt
  $0 --task <task_id>          Spawn worker for specific task
  $0 --file <prompt_file>      Read prompt from file
  $0 --stdin                   Read prompt from stdin
  $0 --help                    Show this help

Environment:
  OPENCODE_MODEL    Model to use (default: openai/gpt-5.2)

Examples:
  $0 "You are a CODE-WORKER. Fix the bug in cli.ts"
  $0 --task task_1767520273725_sckp83
  cat prompt.txt | $0 --stdin
EOF
        exit 0
        ;;
    "")
        echo "Error: No prompt provided. Use --help for usage." >&2
        exit 1
        ;;
    *)
        PROMPT="$1"
        ;;
esac

if [[ -z "$PROMPT" ]]; then
    echo "Error: Empty prompt" >&2
    exit 1
fi

# Create temp file with prompt (avoids all quoting issues)
TEMP_PROMPT=$(mktemp /tmp/worker-prompt-XXXXXX.txt)
echo "$PROMPT" > "$TEMP_PROMPT"

# Log the spawn
log "Spawning worker with model=$MODEL prompt_file=$TEMP_PROMPT ${TASK_ID:+task=$TASK_ID}"

# Spawn the worker in background
# Read prompt from file to avoid ANY shell quoting issues
nohup bash -c "
    prompt=\$(cat '$TEMP_PROMPT')
    rm -f '$TEMP_PROMPT'
    exec opencode run --model '$MODEL' \"\$prompt\"
" > /dev/null 2>&1 &

WORKER_PID=$!
log "Worker spawned with PID=$WORKER_PID"

echo "Worker spawned (PID: $WORKER_PID)"
