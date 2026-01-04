# CLI Tools Reference

Auto-generated documentation for all CLI tools in the workspace.

**Last Updated**: 2026-01-04T10:11:56.364Z

## Quick Reference

| Tool | Category | Description |
|------|----------|-------------|
| `debug-capture` | Legacy CLIs (root level) | Debug Capture Tool Captures command outputs and debug information for troublesho... |
| `agent-performance-profiler` | Legacy CLIs (root level) | Agent Performance Profiler Comprehensive performance profiling and optimization ... |
| `generate-orchestrator-prompt` | Legacy CLIs (root level) | Dynamic Orchestrator Prompt Generator Generates a structured prompt for the orch... |
| `message-bus-manager` | Legacy CLIs (root level) | Message Bus Manager Manages the message bus with: - Automatic rotation to archiv... |
| `quality-assessor` | Legacy CLIs (root level) | Task Quality Assessor Evaluates completed tasks across multiple quality dimensio... |
| `critique-agent` | Legacy CLIs (root level) | Critique Agent Tool A specialized agent for code review, output analysis, debugg... |
| `user-message` | Legacy CLIs (root level) | User Message System Allows users to send messages to the agent system that agent... |
| `opencode-tracker` | Legacy CLIs (root level) | OpenCode Session Tracker (Primary Tool) The main tool for tracking and analyzing... |
| `task-manager` | Legacy CLIs (root level) | Persistent Task Manager for Multi-Agent System Features: - Tasks persist across ... |
| `cli` | Legacy CLIs (root level) | Unified CLI - Single Entry Point for All Tools The main CLI for interacting with... |
| `agent-health-monitor` | Legacy CLIs (root level) | Agent Health Monitor Comprehensive health monitoring system for multi-agent coor... |
| `task-router` | Legacy CLIs (root level) | Task Router Intelligently routes tasks to available worker agents based on: - Ag... |
| `dashboard` | Legacy CLIs (root level) | OpenCode Interactive Dashboard v3.0 Terminal UI with timeline view for the multi... |
| `agent-conversation-viewer` | Legacy CLIs (root level) | Agent Conversation Viewer View per-agent conversations including messages, tool ... |
| `generate-worker-prompt` | Legacy CLIs (root level) | Worker Prompt Generator Generates focused, structured prompts for worker agents ... |
| `git-integration` | Legacy CLIs (root level) | Git Integration Tool for Multi-Agent System Provides git-aware functionality for... |
| `multi-agent-coordinator` | Legacy CLIs (root level) | Multi-Agent Coordination System Enables multiple OpenCode agents to work togethe... |
| `generate-tools-docs` | Legacy CLIs (root level) | Auto-Documentation Generator for CLI Tools Scans all CLI tools in the workspace ... |
| `session-summarizer` | Legacy CLIs (root level) | Session Summarizer Automatically summarizes completed sessions, extracting: - Ke... |
| `working-memory-manager` | Legacy CLIs (root level) | Working Memory Manager Manages the working.md file and overall memory system wit... |
| `system-message-config` | Legacy CLIs (root level) | System Message Configuration CLI Manage the dynamic system message injection for... |
| `daily-report-generator` | Legacy CLIs (root level) | Daily Performance Report Generator Generates automated daily performance reports... |
| `knowledge-extractor` | Legacy CLIs (root level) | Knowledge Extractor from OpenCode Session Storage Reads actual OpenCode sessions... |
| `knowledge-deduplicator` | Legacy CLIs (root level) | Knowledge Deduplicator Analyzes and deduplicates the knowledge base: - Removes d... |
| `realtime-monitor` | Legacy CLIs (root level) | Real-time System Monitor A comprehensive real-time monitoring CLI with: - File w... |
| `dashboard` | Interactive UIs | OpenCode Interactive Dashboard v3.0 Terminal UI with timeline view for the multi... |
| `realtime` | Interactive UIs | Real-time System Monitor A comprehensive real-time monitoring CLI with: - File w... |
| `task-router` | Libraries | Task Router Intelligently routes tasks to available worker agents based on: - Ag... |
| `prompt-generator` | Libraries | Prompt Generator Library Generates structured prompts for orchestrator and worke... |
| `system-message-config` | Libraries | System Message Configuration CLI Manage the dynamic system message injection for... |
| `coordinator` | Libraries | Multi-Agent Coordination System Enables multiple OpenCode agents to work togethe... |

---

## Legacy CLIs (root level)

### `debug-capture`

Debug Capture Tool Captures command outputs and debug information for troubleshooting. run <command>   - Run a command and save its output

**Usage**: `bun tools/debug-capture.ts <command>`

**Commands**:

- `run`
- `log`
- `list`
- `view`
- `clean`

**File**: [`tools/debug-capture.ts`](../tools/debug-capture.ts)

---

### `agent-performance-profiler`

Agent Performance Profiler Comprehensive performance profiling and optimization system for multi-agent coordination. Features:

**Usage**: `bun tools/agent-performance-profiler.ts <command>`

**Commands**:

- `profile`
- `tools`
- `agents`
- `efficiency`
- `errors`
- `suggestions`
- `export`

**File**: [`tools/agent-performance-profiler.ts`](../tools/agent-performance-profiler.ts)

---

### `generate-orchestrator-prompt`

Dynamic Orchestrator Prompt Generator Generates a structured prompt for the orchestrator following Anthropic best practices: - Clear role definition with XML tags

**Usage**: `bun bun tools/generate-orchestrator-prompt.ts > /tmp/orchestrator-prompt.txt`

**File**: [`tools/generate-orchestrator-prompt.ts`](../tools/generate-orchestrator-prompt.ts)

---

### `message-bus-manager`

Message Bus Manager Manages the message bus with: - Automatic rotation to archived files

**Usage**: `bun bun tools/message-bus-manager.ts status          # Show current bus status`

**Commands**:

- `status`
- `rotate`
- `compact`
- `cleanup`
- `search`
- `stats`
- `auto`

**File**: [`tools/message-bus-manager.ts`](../tools/message-bus-manager.ts)

---

### `quality-assessor`

Task Quality Assessor Evaluates completed tasks across multiple quality dimensions: - Completeness: Did the task achieve its stated goal?

**Usage**: `bun tools/quality-assessor.ts <command>`

**Commands**:

- `assess`
- `unassessed` - List unassessed completed tasks
- `trends` - Show quality trends over time
- `lessons` - Show lessons learned
- `report` - Print quality summary report
- `export` - Export all assessment data as JSON

**File**: [`tools/quality-assessor.ts`](../tools/quality-assessor.ts)

---

### `critique-agent`

Critique Agent Tool A specialized agent for code review, output analysis, debugging critique, and quality assessment. Writes detailed markdown critiques to memory/critiques/.

**Usage**: `bun bun tools/critique-agent.ts code src/index.ts`

**Commands**:

- `critical`
- `error`
- `warning`
- `info`
- `code`
- `output`
- `task`
- `system`
- `review`
- `list`
- `view`
- `summary`

**File**: [`tools/critique-agent.ts`](../tools/critique-agent.ts)

---

### `user-message`

User Message System Allows users to send messages to the agent system that agents can read and respond to. This creates a communication channel from user -> agents.

**Usage**: `bun bun tools/user-message.ts send "Your message here"`

**Commands**:

- `send`
- `list`
- `unread`
- `mark-read`
- `clear`
- `watch`
- `count`

**File**: [`tools/user-message.ts`](../tools/user-message.ts)

---

### `opencode-tracker`

OpenCode Session Tracker (Primary Tool) The main tool for tracking and analyzing OpenCode conversations. Reads from OpenCode's native storage at ~/.local/share/opencode/storage/

**Usage**: `bun tools/opencode-tracker.ts <command>`

**Commands**:

- `text`
- `tool`
- `tool-invocation`
- `tool-result`
- `reasoning`
- `step-start`
- `sessions`
- `messages`
- `view`
- `tools`
- `search`
- `export`
- `watch`
- `stats`
- `sync`
- `learn`
- `tree`
- `tokens`

**File**: [`tools/opencode-tracker.ts`](../tools/opencode-tracker.ts)

---

### `task-manager`

Persistent Task Manager for Multi-Agent System Features: - Tasks persist across sessions

**Usage**: `bun tools/task-manager.ts <command>`

**Commands**:

- `create`
- `status`
- `next` - Get next available task
- `summary` - Show task summary
- `export` - Export to markdown
- `list`
- `search`
- `gh:issue`
- `gh:branch`
- `gh:sync`
- `view`

**File**: [`tools/task-manager.ts`](../tools/task-manager.ts)

---

### `cli`

Unified CLI - Single Entry Point for All Tools The main CLI for interacting with the multi-agent system. Delegates to specialized tools for complex operations.

**Usage**: `bun bun tools/cli.ts [command] [args]`

**Commands**:

- `status`
- `agents`
- `tasks`
- `messages`
- `send`
- `create`
- `claim`
- `complete`
- `refresh`
- `clear`
- `exit`
- `quit`
- `q`
- `summary`
- `tools`
- `recent`
- `slow`
- `categories`
- `export`
- `task-create`
- `create-task`
- `task-claim`
- `claim-task`
- `task-complete`
- `complete-task`
- `user-messages`
- `monitor`
- `dashboard`
- `dash`
- `interactive`
- `i`
- `quality`
- `conversations`
- `conv`
- `prune`
- `health`
- `bus`
- `message-bus`
- `memory`
- `working`
- `git`
- `profile`
- `perf`
- `profiler`
- `performance`
- `recovery`
- `checkpoints`
- `recover`
- `resume`
- `timing`
- `tool-timing`
- `report`
- `reports`
- `daily-report`
- `agent-conv`
- `critique`
- `review`
- `cr`
- `opencode`
- `oc`
- `tracker`
- `watch`
- `realtime`
- `live`

**File**: [`tools/cli.ts`](../tools/cli.ts)

---

### `agent-health-monitor`

Agent Health Monitor Comprehensive health monitoring system for multi-agent coordination. Features:

**Usage**: `bun bun tools/agent-health-monitor.ts [command]`

**Commands**:

- `status`
- `check`
- `monitor`
- `metrics`
- `cleanup`

**File**: [`tools/agent-health-monitor.ts`](../tools/agent-health-monitor.ts)

---

### `task-router`

Task Router Intelligently routes tasks to available worker agents based on: - Agent availability and status

**Usage**: `bun tools/task-router.ts <command>`

**Commands**:

- `route`
- `spawn`
- `stats`
- `dashboard`

**File**: [`tools/task-router.ts`](../tools/task-router.ts)

---

### `dashboard`

OpenCode Interactive Dashboard v3.0 Terminal UI with timeline view for the multi-agent system. bun tools/dashboard.ts [mode]

**Usage**: `bun bun tools/dashboard.ts [mode]`

**Commands**:

- `timeline`
- `agents`
- `tasks`
- `sessions`
- `tokens`
- `logs`
- `q`
- `quit`
- `n`
- `new`
- `m`
- `msg`
- `c`
- `claim`
- `r`
- `refresh`
- `h`

**File**: [`tools/dashboard.ts`](../tools/dashboard.ts)

---

### `agent-conversation-viewer`

Agent Conversation Viewer View per-agent conversations including messages, tool calls, and outputs. Integrates with the multi-agent system to show what each agent is doing.

**Usage**: `bun tools/agent-conversation-viewer.ts <command>`

**Commands**:

- `broadcast`
- `task_claim`
- `task_complete`
- `task_completed`
- `task_available`
- `direct`
- `heartbeat`
- `request_help`
- `agents`
- `list`
- `view`
- `show`
- `conversation`
- `tools`
- `stream`
- `watch`
- `timeline`
- `history`
- `export`

**File**: [`tools/agent-conversation-viewer.ts`](../tools/agent-conversation-viewer.ts)

---

### `generate-worker-prompt`

Worker Prompt Generator Generates focused, structured prompts for worker agents following Anthropic best practices: - Clear role definition

**Usage**: `bun bun tools/generate-worker-prompt.ts "Implement feature X"`

**Commands**:

- `code-worker`
- `memory-worker`
- `analysis-worker`

**File**: [`tools/generate-worker-prompt.ts`](../tools/generate-worker-prompt.ts)

---

### `git-integration`

Git Integration Tool for Multi-Agent System Provides git-aware functionality for agents: - Track code changes made by agents

**Usage**: `bun tools/git-integration.ts <command>`

**Commands**:

- `status`
- `diff`
- `log`
- `branches`
- `branch`
- `commit`
- `auto-commit`
- `search`
- `changes`
- `agent-commits`
- `agent`
- `stash`
- `stash-pop`
- `pop`
- `summary`
- `gh-status`
- `github`
- `issues`
- `issue-task`
- `branch-task`
- `pr-task`

**File**: [`tools/git-integration.ts`](../tools/git-integration.ts)

---

### `multi-agent-coordinator`

Multi-Agent Coordination System Enables multiple OpenCode agents to work together by: - Tracking active agents in a registry

**Usage**: `bun tools/multi-agent-coordinator.ts <command>`

**Commands**:

- `register`
- `status`
- `messages`
- `send`
- `cleanup`
- `health`
- `prune-messages`

**File**: [`tools/multi-agent-coordinator.ts`](../tools/multi-agent-coordinator.ts)

---

### `generate-tools-docs`

Auto-Documentation Generator for CLI Tools Scans all CLI tools in the workspace and generates comprehensive documentation. Extracts commands, usage patterns, and descriptions from:

**Usage**: `bun bun tools/generate-tools-docs.ts`

**Commands**:

- `command` - Match case statements: case 'command': or

**File**: [`tools/generate-tools-docs.ts`](../tools/generate-tools-docs.ts)

---

### `session-summarizer`

Session Summarizer Automatically summarizes completed sessions, extracting: - Key learnings and decisions

**Usage**: `bun bun tools/session-summarizer.ts summarize [session-id]   # Summarize a session`

**Commands**:

- `summarize`
- `summarize-current`
- `recent`
- `stats`
- `export`

**File**: [`tools/session-summarizer.ts`](../tools/session-summarizer.ts)

---

### `working-memory-manager`

Working Memory Manager Manages the working.md file and overall memory system with: - Archival of old session content to separate files

**Usage**: `bun bun tools/working-memory-manager.ts status        # Show current status`

**Commands**:

- `status`
- `archive`
- `search`
- `list`
- `view`
- `clean`
- `health`
- `prune`
- `auto`
- `rotate`
- `rotate-sessions`
- `rotate-realtime`

**File**: [`tools/working-memory-manager.ts`](../tools/working-memory-manager.ts)

---

### `system-message-config`

System Message Configuration CLI Manage the dynamic system message injection for OpenCode agents. Configure which sections appear in the agent's system prompt.

**Usage**: `bun bun tools/system-message-config.ts show           # Show current config`

**Commands**:

- `show`
- `preview`
- `enable`
- `disable`
- `add-custom`
- `remove-custom`
- `set-priority`
- `set-max-items`
- `add-instruction`
- `clear-instructions`

**File**: [`tools/system-message-config.ts`](../tools/system-message-config.ts)

---

### `daily-report-generator`

Daily Performance Report Generator Generates automated daily performance reports summarizing: - Agent productivity (tasks completed, tool calls, active time)

**Usage**: `bun bun tools/daily-report-generator.ts                    # Generate today's report`

**Commands**:

- `generate`
- `list`
- `view`
- `summary`
- `trends`

**File**: [`tools/daily-report-generator.ts`](../tools/daily-report-generator.ts)

---

### `knowledge-extractor`

Knowledge Extractor from OpenCode Session Storage Reads actual OpenCode sessions from ~/.local/share/opencode/storage/ and extracts:

**Usage**: `bun tools/knowledge-extractor.ts <command>`

**Commands**:

- `extract`
- `session`

**File**: [`tools/knowledge-extractor.ts`](../tools/knowledge-extractor.ts)

---

### `knowledge-deduplicator`

Knowledge Deduplicator Analyzes and deduplicates the knowledge base: - Removes duplicate insights across sessions

**Usage**: `bun bun tools/knowledge-deduplicator.ts analyze     # Show analysis of duplicates`

**Commands**:

- `analyze`
- `dedupe`
- `stats`
- `top`

**File**: [`tools/knowledge-deduplicator.ts`](../tools/knowledge-deduplicator.ts)

---

### `realtime-monitor`

Real-time System Monitor A comprehensive real-time monitoring CLI with: - File watching for instant updates (no polling delay)

**Usage**: `bun bun tools/realtime-monitor.ts [mode]`

**Commands**:

- `active`
- `completed`
- `orchestrator_active`
- `working`
- `in_progress`
- `blocked`
- `critical`
- `error`
- `idle`
- `pending`
- `high`
- `medium`
- `low`
- `dashboard`
- `agents`
- `messages`
- `tasks`
- `logs`
- `quality`
- `all`
- `s`
- `n`
- `o`
- `\u001b`
- `\x1b`
- `d`
- `a`
- `m`
- `t`
- `l`
- `q`
- `i`
- `r`

**File**: [`tools/realtime-monitor.ts`](../tools/realtime-monitor.ts)

---

## Interactive UIs

### `dashboard`

OpenCode Interactive Dashboard v3.0 Terminal UI with timeline view for the multi-agent system. bun tools/dashboard.ts [mode]

**Usage**: `bun bun tools/dashboard.ts [mode]`

**Commands**:

- `timeline`
- `agents`
- `tasks`
- `sessions`
- `tokens`
- `logs`
- `q`
- `quit`
- `n`
- `new`
- `m`
- `msg`
- `c`
- `claim`
- `r`
- `refresh`
- `h`

**File**: [`tools/ui/dashboard.ts`](../tools/ui/dashboard.ts)

---

### `realtime`

Real-time System Monitor A comprehensive real-time monitoring CLI with: - File watching for instant updates (no polling delay)

**Usage**: `bun bun tools/realtime-monitor.ts [mode]`

**Commands**:

- `active`
- `completed`
- `orchestrator_active`
- `working`
- `in_progress`
- `blocked`
- `critical`
- `error`
- `idle`
- `pending`
- `high`
- `medium`
- `low`
- `dashboard`
- `agents`
- `messages`
- `tasks`
- `logs`
- `quality`
- `all`
- `s`
- `n`
- `o`
- `\u001b`
- `\x1b`
- `d`
- `a`
- `m`
- `t`
- `l`
- `q`
- `i`
- `r`

**File**: [`tools/ui/realtime.ts`](../tools/ui/realtime.ts)

---

## Libraries

### `task-router`

Task Router Intelligently routes tasks to available worker agents based on: - Agent availability and status

**Usage**: `bun tools/lib/task-router.ts <command>`

**Commands**:

- `route`
- `spawn`
- `stats`
- `dashboard`

**File**: [`tools/lib/task-router.ts`](../tools/lib/task-router.ts)

---

### `prompt-generator`

Prompt Generator Library Generates structured prompts for orchestrator and worker agents following Anthropic best practices: - Clear role definition with XML tags

**Usage**: `import { generateOrchestratorPrompt, generateWorkerPrompt } from './lib/prompt-generator';`

**Commands**:

- `code-worker`
- `memory-worker`
- `analysis-worker`

**File**: [`tools/lib/prompt-generator.ts`](../tools/lib/prompt-generator.ts)

---

### `system-message-config`

System Message Configuration CLI Manage the dynamic system message injection for OpenCode agents. Configure which sections appear in the agent's system prompt.

**Usage**: `bun bun tools/system-message-config.ts show           # Show current config`

**Commands**:

- `show`
- `preview`
- `enable`
- `disable`
- `add-custom`
- `remove-custom`
- `set-priority`
- `set-max-items`
- `add-instruction`
- `clear-instructions`

**File**: [`tools/lib/system-message-config.ts`](../tools/lib/system-message-config.ts)

---

### `coordinator`

Multi-Agent Coordination System Enables multiple OpenCode agents to work together by: - Tracking active agents in a registry

**Usage**: `bun tools/lib/coordinator.ts <command>`

**Commands**:

- `register`
- `status`
- `messages`
- `send`
- `cleanup`
- `health`
- `prune-messages`

**File**: [`tools/lib/coordinator.ts`](../tools/lib/coordinator.ts)

---

## Usage Notes

### Running Tools

All tools use `bun` as the runtime:

```bash
bun tools/<tool-name>.ts [command] [args]
```

### Common Patterns

**Check help**:
```bash
bun tools/<tool>.ts --help
```

**Run with arguments**:
```bash
bun tools/task-manager.ts create "Task title" high
```

**Pipe output**:
```bash
bun tools/cli.ts status | grep -i error
```

### For Agents

Agents can use these tools via the `bash` tool or by reading this documentation.

**Example agent usage**:
```typescript
// Check system status
await bash("bun tools/cli.ts status");

// Create a task
await bash('bun tools/task-manager.ts create "Fix bug" high');

// View tasks
await bash("bun tools/task-manager.ts summary");
```

## See Also

- [AGENTS.md](../AGENTS.md) - Multi-agent system documentation
- [tools/ui/README.md](../tools/ui/README.md) - Interactive UI documentation
- [opencode.json](../opencode.json) - OpenCode configuration
