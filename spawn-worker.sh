#!/bin/bash
# spawn-worker.sh - Safely spawn a worker agent without shell quoting issues
#
# Uses the centralized prompt system from tools/lib/prompt-generator.ts
#
# Usage:
#   ./spawn-worker.sh "worker prompt here"
#   ./spawn-worker.sh --task <task_id>
#   ./spawn-worker.sh --role <role> "task description"
#   ./spawn-worker.sh --file <prompt_file>
#
# Examples:
#   ./spawn-worker.sh "Fix the bug in cli.ts"
#   ./spawn-worker.sh --task task_1767520273725_sckp83
#   ./spawn-worker.sh --role code-worker "Implement feature X"
#   echo "worker prompt" | ./spawn-worker.sh --stdin

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/memory/worker-spawns.log"
MODEL="${OPENCODE_MODEL:-openai/gpt-5.2}"
PROMPT_GENERATOR="${SCRIPT_DIR}/tools/lib/prompt-generator.ts"

log() {
    echo "[$(date -Iseconds)] $1" >> "$LOG_FILE"
}

# Generate prompt using centralized prompt-generator.ts
generate_worker_prompt() {
    local task="$1"
    local role="${2:-worker}"
    
    if command -v bun &> /dev/null && [[ -f "$PROMPT_GENERATOR" ]]; then
        local prompt=""
        local exit_code=0
        local stderr_file
        stderr_file=$(mktemp /tmp/spawn-worker-promptgen-stderr-XXXXXX.txt)

        # Retry once to handle transient bun/FS issues
        for attempt in 1 2; do
            exit_code=0
            prompt=$(bun "$PROMPT_GENERATOR" worker --role "$role" "$task" 2>"$stderr_file" || exit_code=$?)

            if [[ $exit_code -eq 0 ]] && [[ -n "$prompt" ]]; then
                rm -f "$stderr_file"
                echo "$prompt"
                return 0
            fi

            if [[ $exit_code -ne 0 ]]; then
                local stderr_preview
                stderr_preview=$(tail -n 20 "$stderr_file" 2>/dev/null | tr '\r\n' ' ' | cut -c1-2000 || true)
                log "prompt-generator.ts failed (attempt $attempt/2, exit $exit_code). stderr: ${stderr_preview}"
            else
                log "prompt-generator.ts returned empty output (attempt $attempt/2)"
            fi

            sleep 0.2
        done

        rm -f "$stderr_file"
    fi

    # Fallback to simple prompt if bun or generator not available
    {
        # Fallback to simple prompt if bun or generator not available
        cat <<EOF
You are a ${role} agent.

## IMMEDIATE ACTIONS:
1. agent_register(role="${role}")
2. Complete the task below
3. agent_send(type="task_complete", payload={summary: "..."})

## TASK:
${task}

## GUIDELINES:
- Focus on this ONE task only
- Make clean, minimal changes
- Report completion via agent_send
EOF
    }
}

# Get task info from tasks.json
get_task_info() {
    local task_id="$1"
    cat "${SCRIPT_DIR}/memory/tasks.json" | jq -r --arg id "$task_id" '
        .tasks[] | select(.id == $id) | 
        {id, title, description, priority, tags}
    ' 2>/dev/null
}

# Generate prompt for a specific task ID using centralized system
get_task_prompt() {
    local task_id="$1"
    local task_info
    task_info=$(get_task_info "$task_id")
    
    if [[ -z "$task_info" ]] || [[ "$task_info" == "null" ]]; then
        echo "Error: Task $task_id not found" >&2
        exit 1
    fi
    
    local title description priority
    title=$(echo "$task_info" | jq -r '.title // "Unknown task"')
    description=$(echo "$task_info" | jq -r '.description // "No description"')
    priority=$(echo "$task_info" | jq -r '.priority // "medium"')
    
    # Determine role based on task tags or title
    local role="code-worker"
    if echo "$task_info" | jq -r '.tags[]?' | grep -qi "memory"; then
        role="memory-worker"
    elif echo "$task_info" | jq -r '.tags[]?' | grep -qi "analysis\|research"; then
        role="analysis-worker"
    fi
    
    # Use centralized prompt generator
    local task_description="Task ID: ${task_id}
Title: ${title}
Description: ${description}
Priority: ${priority}

Complete this task. When done:
- task_update(task_id=\"${task_id}\", status=\"completed\")
- agent_send(type=\"task_complete\", payload={task_id: \"${task_id}\", summary: \"...\"})"

    generate_worker_prompt "$task_description" "$role"
}

# Parse arguments
PROMPT=""
ROLE="worker"
TASK_ID=""

case "${1:-}" in
    --task)
        if [[ -z "${2:-}" ]]; then
            echo "Usage: $0 --task <task_id>" >&2
            exit 1
        fi
        PROMPT=$(get_task_prompt "$2")
        TASK_ID="$2"
        ;;
    --role)
        if [[ -z "${2:-}" ]] || [[ -z "${3:-}" ]]; then
            echo "Usage: $0 --role <role> <task_description>" >&2
            exit 1
        fi
        ROLE="$2"
        PROMPT=$(generate_worker_prompt "$3" "$ROLE")
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
spawn-worker.sh - Safely spawn a worker agent using centralized prompts

Usage:
  $0 "task description"              Spawn with auto-generated prompt
  $0 --task <task_id>                Spawn worker for specific task
  $0 --role <role> "description"     Spawn with specific role
  $0 --file <prompt_file>            Read prompt from file
  $0 --stdin                         Read prompt from stdin
  $0 --help                          Show this help

Roles: code-worker, memory-worker, analysis-worker, worker

Environment:
  OPENCODE_MODEL    Model to use (default: openai/gpt-5.2)

Examples:
  $0 "Fix the bug in cli.ts"
  $0 --task task_1767520273725_sckp83
  $0 --role code-worker "Implement feature X"
  cat prompt.txt | $0 --stdin

Prompts are generated using tools/lib/prompt-generator.ts
EOF
        exit 0
        ;;
    "")
        echo "Error: No prompt provided. Use --help for usage." >&2
        exit 1
        ;;
    *)
        # Simple task description - generate prompt
        PROMPT=$(generate_worker_prompt "$1" "$ROLE")
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
log "Spawning worker: model=$MODEL role=$ROLE ${TASK_ID:+task=$TASK_ID}"

# Spawn the worker in background
# Read prompt from file to avoid ANY shell quoting issues
nohup bash -c "
    prompt=\$(cat '$TEMP_PROMPT')
    rm -f '$TEMP_PROMPT'
    exec opencode run --model '$MODEL' \"\$prompt\"
" > /dev/null 2>&1 &

WORKER_PID=$!
log "Worker spawned: PID=$WORKER_PID"

echo "Worker spawned (PID: $WORKER_PID)"
