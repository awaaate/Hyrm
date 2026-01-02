# Tools Reference

Complete reference for all CLI tools in the multi-agent system. All tools are run with `bun tools/<tool>.ts [command]`.

## Quick Reference

| Tool | Purpose | Key Commands |
|------|---------|--------------|
| cli.ts | Unified CLI | status, agents, tasks, monitor |
| realtime-monitor.ts | Live dashboard | d/a/m/t/l keys |
| task-manager.ts | Task CRUD | summary, next, create |
| user-message.ts | User messaging | send, list, unread |

---

## CLI Principal

### cli.ts
**Description**: Unified CLI entry point for all system operations.

**Usage**: `bun tools/cli.ts [command]`

**Commands**:
- `status` - System overview (session, agents, tasks, quality)
- `agents` - List all active agents
- `tasks` - Show pending tasks
- `messages` - View agent messages
- `monitor` - Launch live dashboard
- `interactive` - Interactive mode
- `help` - Show all commands

**Example**:
```bash
bun tools/cli.ts status
bun tools/cli.ts agents
```

---

## Agent Tools

### agent-health-monitor.ts
**Description**: Comprehensive health monitoring for multi-agent coordination. Tracks agent heartbeats, detects stale agents, and provides cleanup.

**Usage**: `bun tools/agent-health-monitor.ts [command]`

**Commands**:
- `status` - Show health status of all agents
- `check` - Run a single health check
- `monitor` - Start continuous monitoring
- `metrics` - Show performance metrics
- `cleanup` - Remove stale agents (>2 min inactive)

**Example**:
```bash
bun tools/agent-health-monitor.ts status
bun tools/agent-health-monitor.ts cleanup
```

---

### agent-conversation-viewer.ts
**Description**: View per-agent conversations including messages, tool calls, and outputs.

**Usage**: `bun tools/agent-conversation-viewer.ts [command]`

**Commands**:
- `agents` - List all agents with activity summary
- `view <agent_id>` - View full conversation for an agent
- `stream` - Real-time stream of all agent activity
- `tools <agent_id>` - Show tool calls for a specific agent
- `timeline` - Show chronological activity across all agents
- `export <agent_id>` - Export agent conversation as markdown

**Example**:
```bash
bun tools/agent-conversation-viewer.ts agents
bun tools/agent-conversation-viewer.ts view agent-123
```

---

### agent-performance-profiler.ts
**Description**: Performance profiling and optimization for multi-agent coordination. Tracks tool execution times, context usage, and error patterns.

**Usage**: `bun tools/agent-performance-profiler.ts [command]`

**Commands**:
- `profile` - Show full performance profile
- `tools` - Tool execution time analysis
- `agents` - Per-agent performance breakdown
- `efficiency` - Context usage efficiency report
- `errors` - Error pattern analysis
- `suggestions` - Get optimization suggestions
- `history [days]` - Performance trends over time
- `export` - Export metrics to JSON

**Example**:
```bash
bun tools/agent-performance-profiler.ts profile
bun tools/agent-performance-profiler.ts suggestions
```

---

### multi-agent-coordinator.ts
**Description**: Core coordination for multiple OpenCode agents. Manages agent registry, message bus, and task distribution.

**Usage**: `bun tools/multi-agent-coordinator.ts [command]`

**Features**:
- Agent registry tracking (active/idle/working/blocked)
- Message bus for inter-agent communication
- File lock conflict handling
- Task distribution coordination

---

### critique-agent.ts
**Description**: Specialized agent for code review, output analysis, and quality assessment. Writes detailed markdown critiques.

**Usage**: `bun tools/critique-agent.ts [command]`

**Commands**:
- `code <file>` - Critique a code file with detailed feedback
- `output <file>` - Analyze output/logs for issues
- `task <task_id>` - Critique a completed task's implementation
- `system` - System-wide critique and improvement suggestions
- `review <pr_desc>` - Review changes described in text
- `list` - List all critiques
- `view <id>` - View a specific critique
- `summary` - Summary of all critiques and patterns

**Example**:
```bash
bun tools/critique-agent.ts code src/index.ts
bun tools/critique-agent.ts system
```

---

### message-bus-manager.ts
**Description**: Manages the agent message bus with rotation, deduplication, and cleanup.

**Usage**: `bun tools/message-bus-manager.ts [command]`

**Commands**:
- `status` - Show current bus status
- `rotate` - Rotate to new archive file
- `compact` - Remove old heartbeats, deduplicate
- `cleanup [hours]` - Remove messages older than N hours
- `search <query>` - Search across all archives
- `stats` - Message statistics

**Example**:
```bash
bun tools/message-bus-manager.ts status
bun tools/message-bus-manager.ts compact
```

---

### generate-orchestrator-prompt.ts
**Description**: Generates focused prompts for the orchestrator agent with current system state.

**Usage**: `bun tools/generate-orchestrator-prompt.ts`

---

### generate-worker-prompt.ts
**Description**: Generates focused prompts for worker agents with task context.

**Usage**: `bun tools/generate-worker-prompt.ts "<task>"`

---

## Memory Tools

### working-memory-manager.ts
**Description**: Manages working.md with archival, search, and memory health analysis.

**Usage**: `bun tools/working-memory-manager.ts [command]`

**Commands**:
- `status` - Show current status
- `archive` - Archive old sessions (keeps last 5)
- `search <query>` - Search archived sessions
- `list` - List all archived sessions
- `view <n>` - View specific archived session
- `clean` - Clean up and optimize
- `health` - Analyze memory system health
- `prune` - Prune message bus and compress KB

**Example**:
```bash
bun tools/working-memory-manager.ts health
bun tools/working-memory-manager.ts archive
```

---

### knowledge-extractor.ts
**Description**: Extracts knowledge from OpenCode sessions including decisions, discoveries, and patterns.

**Usage**: `bun tools/knowledge-extractor.ts [command]`

**Commands**:
- `extract` - Extract knowledge from recent sessions

**Example**:
```bash
bun tools/knowledge-extractor.ts extract
```

---

### knowledge-deduplicator.ts
**Description**: Analyzes and deduplicates the knowledge base. Removes duplicate insights, merges similar discoveries.

**Usage**: `bun tools/knowledge-deduplicator.ts [command]`

**Commands**:
- `analyze` - Show analysis of duplicates
- `dedupe` - Perform deduplication
- `stats` - Show knowledge statistics
- `top` - Show top insights and code artifacts

**Example**:
```bash
bun tools/knowledge-deduplicator.ts analyze
bun tools/knowledge-deduplicator.ts dedupe
```

---

## Task Tools

### task-manager.ts
**Description**: Persistent task manager for multi-agent system. Tasks survive across sessions.

**Usage**: `bun tools/task-manager.ts [command]`

**Commands**:
- `summary` - Show all tasks
- `next` - Get next priority task
- `create <title>` - Create new task
- `complete <id>` - Mark task complete
- `list [status]` - List tasks by status

**Example**:
```bash
bun tools/task-manager.ts summary
bun tools/task-manager.ts next
```

---

### task-router.ts
**Description**: Intelligently routes tasks to available worker agents based on availability, specialization, and load balancing.

**Usage**: `bun tools/task-router.ts [command]`

**Features**:
- Agent availability checking
- Role-based task assignment
- Priority-based routing
- Load balancing across agents

---

### quality-assessor.ts
**Description**: Evaluates completed tasks across quality dimensions: completeness, code quality, efficiency, documentation, impact.

**Usage**: `bun tools/quality-assessor.ts [command]`

**Dimensions Tracked**:
- Completeness (0-10)
- Code Quality (0-10)
- Efficiency (0-10)
- Documentation (0-10)
- Impact (0-10)

---

## Session Tools

### opencode-tracker.ts
**Description**: Primary tool for tracking and analyzing OpenCode conversations. Reads from OpenCode's native storage.

**Usage**: `bun tools/opencode-tracker.ts [command]`

**Commands**:
- `sessions [limit]` - List all sessions with metadata
- `messages <sessionId>` - Show all messages for a session
- `view <sessionId>` - Full conversation view with tool calls
- `tools <sessionId>` - Show all tool calls with inputs/outputs
- `search <query> [limit]` - Search across sessions
- `export <sessionId>` - Export full conversation as JSON
- `watch` - Watch for new messages in real-time
- `stats` - Show statistics about all sessions
- `sync` - Sync OpenCode sessions to memory system
- `learn [limit]` - Extract learnings from recent sessions

**Example**:
```bash
bun tools/opencode-tracker.ts sessions 20
bun tools/opencode-tracker.ts search "error" 30
bun tools/opencode-tracker.ts sync && bun tools/opencode-tracker.ts learn
```

---

### session-summarizer.ts
**Description**: Automatically summarizes completed sessions, extracting key learnings, code changes, and quality metrics.

**Usage**: `bun tools/session-summarizer.ts [command]`

**Commands**:
- `summarize [session-id]` - Summarize a session
- `recent [count]` - Summarize recent sessions
- `export` - Export all summaries
- `stats` - Show summary statistics

**Example**:
```bash
bun tools/session-summarizer.ts summarize
bun tools/session-summarizer.ts recent 5
```

---

## Monitor Tools

### realtime-monitor.ts
**Description**: Comprehensive real-time monitoring CLI with file watching, multiple view modes, and keyboard navigation.

**Usage**: `bun tools/realtime-monitor.ts [mode]`

**Modes**:
- `dashboard` (default) - Full system overview
- `agents` - Agent status only
- `messages` - Agent messages stream
- `tasks` - Task list
- `logs` - Real-time log viewer
- `all` - All sections in detail

**Keyboard**:
- `d` - Dashboard mode
- `a` - Agents mode
- `m` - Messages mode
- `t` - Tasks mode
- `l` - Logs mode
- `q` - Quit

**Example**:
```bash
bun tools/realtime-monitor.ts
bun tools/realtime-monitor.ts agents
```

---

### daily-report-generator.ts
**Description**: Generates automated daily performance reports with agent productivity, quality trends, and error patterns.

**Usage**: `bun tools/daily-report-generator.ts [command]`

**Commands**:
- (no args) - Generate today's report
- `generate [date]` - Generate for specific date
- `list` - List available reports
- `view [date]` - View specific report
- `summary` - Quick summary stats
- `trends` - Show trends over time

**Example**:
```bash
bun tools/daily-report-generator.ts
bun tools/daily-report-generator.ts trends
```

---

## CLI/Core Tools

### user-message.ts
**Description**: User-to-agent messaging system. Allows users to send messages that agents can read and respond to.

**Usage**: `bun tools/user-message.ts [command]`

**Commands**:
- `send "message"` - Send a message to agents
- `list` - View all messages
- `unread` - View unread messages only
- `mark-read <id>` - Mark a message as read
- `clear` - Clear all messages

**Example**:
```bash
bun tools/user-message.ts send "Please check the build"
bun tools/user-message.ts list
```

---

### system-message-config.ts
**Description**: Configure dynamic system message injection for OpenCode agents.

**Usage**: `bun tools/system-message-config.ts [command]`

**Commands**:
- `show` - Show current config
- `enable <section>` - Enable a section
- `disable <section>` - Disable a section
- `add-custom "title" "content"` - Add custom section
- `preview` - Preview system message

**Example**:
```bash
bun tools/system-message-config.ts show
bun tools/system-message-config.ts preview
```

---

### git-integration.ts
**Description**: Git-aware functionality for agents. Tracks code changes, auto-commits, and manages branches.

**Usage**: `bun tools/git-integration.ts [command]`

**Commands**:
- `status` - Show git status
- `diff [file]` - Show current changes
- `log [n]` - Show recent commits (default: 10)
- `branches` - List branches
- `commit <msg>` - Create commit with agent metadata
- `auto-commit <task>` - Auto-commit for completed task
- `search <query>` - Search commit history
- `changes [since]` - Show changes since commit/date
- `agent-commits` - Show commits made by agents
- `stash` - Stash current changes
- `stash-pop` - Pop stashed changes

**Example**:
```bash
bun tools/git-integration.ts status
bun tools/git-integration.ts log 20
```

---

### debug-capture.ts
**Description**: Captures command outputs and debug information for troubleshooting.

**Usage**: `bun tools/debug-capture.ts [command]`

**Commands**:
- `run <command>` - Run a command and save its output
- `log <message>` - Log a debug message with timestamp
- `list [limit]` - List recent captured outputs
- `view <id>` - View a specific capture
- `clean [days]` - Clean old captures (default: 7 days)

**Example**:
```bash
bun tools/debug-capture.ts run "bun tools/task-manager.ts summary"
bun tools/debug-capture.ts list 20
```

---

## Tool Categories Summary

| Category | Tools | Count |
|----------|-------|-------|
| CLI Principal | cli.ts | 1 |
| Agent Tools | agent-health-monitor, agent-conversation-viewer, agent-performance-profiler, multi-agent-coordinator, critique-agent, message-bus-manager, generate-orchestrator-prompt, generate-worker-prompt | 8 |
| Memory Tools | working-memory-manager, knowledge-extractor, knowledge-deduplicator | 3 |
| Task Tools | task-manager, task-router, quality-assessor | 3 |
| Session Tools | opencode-tracker, session-summarizer | 2 |
| Monitor Tools | realtime-monitor, daily-report-generator | 2 |
| CLI/Core Tools | user-message, system-message-config, git-integration, debug-capture | 4 |
| **Total** | | **23** |
