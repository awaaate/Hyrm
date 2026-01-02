# Multi-Agent Memory System

A multi-agent AI orchestration system built on OpenCode with persistent memory, task management, and autonomous agent coordination.

## Project Structure

```
/app/workspace/
├── .opencode/                    # OpenCode plugin and configuration
│   ├── plugin/
│   │   ├── index.ts              # Main plugin (hooks, system message injection)
│   │   └── tools/                # Modular tool definitions
│   │       ├── agent-tools.ts    # Multi-agent coordination
│   │       ├── memory-tools.ts   # Memory system management
│   │       ├── task-tools.ts     # Task management
│   │       ├── quality-tools.ts  # Quality assessment
│   │       └── user-message-tools.ts
│   ├── skill/                    # Agent skills (orchestrator, memory, patterns)
│   └── command/                  # Slash commands (/status, /orchestrator)
│
├── dashboard-ui/                 # React dashboard (Vite + TypeScript)
│   └── src/                      # Dashboard source code
│
├── docs/                         # Documentation
│   └── archive/                  # Old session reports and research
│
├── memory/                       # Persistent state
│   ├── state.json                # Session count, achievements
│   ├── tasks.json                # Task management
│   ├── knowledge-base.json       # Extracted insights
│   ├── agent-registry.json       # Active agents
│   ├── message-bus.jsonl         # Agent messages
│   ├── user-messages.jsonl       # User-to-agent messages
│   ├── working.md                # Working memory
│   └── sessions/                 # Per-session state
│
├── tools/                        # CLI utilities (14 tools)
│   ├── opencode-cli.ts           # Unified CLI (status, agents, tasks, monitor)
│   ├── task-manager.ts           # Task CRUD operations
│   ├── realtime-monitor.ts       # Live dashboard with file watching
│   ├── user-message.ts           # User messaging CLI
│   ├── multi-agent-coordinator.ts # Agent coordination
│   ├── knowledge-extractor.ts    # Extract session insights
│   ├── session-summarizer.ts     # Summarize sessions
│   ├── knowledge-deduplicator.ts # Clean duplicates
│   ├── quality-assessor.ts       # Quality tracking
│   ├── agent-health-monitor.ts   # Agent health/cleanup
│   ├── smart-memory-manager.ts   # Memory pruning
│   ├── task-router.ts            # Task routing
│   ├── system-message-config.ts  # System message config
│   └── generate-orchestrator-prompt.ts
│
├── mcp-servers/                  # MCP server implementations
│
├── AGENTS.md                     # This file - project rules
├── opencode.json                 # OpenCode configuration
├── orchestrator-watchdog.sh      # Watchdog for orchestrator
└── start-main.sh                 # Startup script
```

## Code Standards

- **Runtime**: Always use `bun` for running TypeScript files
- **Language**: TypeScript with strict mode
- **Style**: Functional patterns, avoid classes when possible
- **Imports**: Use ES modules, relative imports for local files
- **Error Handling**: Always handle errors gracefully, log with context

## Key Commands

```bash
# System management
bun tools/opencode-cli.ts status     # System status
bun tools/opencode-cli.ts agents     # Active agents
bun tools/opencode-cli.ts tasks      # Task list
bun tools/opencode-cli.ts monitor    # Live dashboard

# Real-time monitoring
bun tools/realtime-monitor.ts        # Interactive monitor (d/a/m/t/l keys)

# User messaging
bun tools/user-message.ts send "msg" # Send to agents
bun tools/user-message.ts list       # View messages

# Task management
bun tools/task-manager.ts summary    # All tasks
bun tools/task-manager.ts next       # Next priority task

# Knowledge tools
bun tools/knowledge-extractor.ts extract
bun tools/knowledge-deduplicator.ts analyze
```

## Memory System Architecture

### What Gets Saved Automatically
- **Tool timing** (`tool-timing.jsonl`) - Every tool call with duration, success, category
- **Agent messages** (`message-bus.jsonl`) - All agent-to-agent communication
- **Tasks** (`tasks.json`) - Persistent task state across sessions
- **Quality assessments** (`quality-assessments.json`) - Task quality scores
- **Realtime log** (`realtime.log`) - All plugin events
- **Session events** (`sessions.jsonl`) - Session start/end/error events
- **Session knowledge** (`knowledge-base.json`) - Auto-extracted learnings on session end

### What Needs Manual Trigger
- Full session summarization: `bun tools/session-summarizer.ts summarize`
- Knowledge deduplication: `bun tools/knowledge-deduplicator.ts analyze`
- Working memory archival: `bun tools/working-memory-manager.ts archive`

### Tool Status

**ACTIVE & MAINTAINED:**
- `opencode-cli.ts` - Unified CLI for all operations
- `critique-agent.ts` - Code review and quality assessment
- `daily-report-generator.ts` - Performance reports
- `agent-performance-profiler.ts` - Agent analytics
- `session-summarizer.ts` - Session summarization
- `message-bus-manager.ts` - Message bus maintenance
- `working-memory-manager.ts` - Working.md archival
- `git-integration.ts` - Git operations
- `realtime-monitor.ts` - Live monitoring
- `terminal-dashboard.ts` - TUI dashboard

**UTILITY TOOLS:**
- `conversation-tracker.ts` - Read OpenCode's native session storage
- `opencode-tracker.ts` - Parse OpenCode conversations
- `session-analytics.ts` - Analyze session patterns
- `knowledge-extractor.ts` - Extract knowledge from sessions
- `knowledge-deduplicator.ts` - Clean duplicate knowledge

**DEPRECATED/LEGACY:**
- None currently - all tools are maintained

## Multi-Agent System

### Orchestrator Agent
- Runs persistently with `agent_set_handoff(enabled=false)`
- Auto-restarts via `orchestrator-watchdog.sh`
- Manages task distribution and worker spawning

### Worker Agents
- Spawned for specific tasks, hand off after completion
- Communicate via message bus

### Agent Communication
- `agent_send(type, payload)` - Send messages
- `agent_messages()` - Read messages
- Types: broadcast, direct, task_claim, task_complete, task_available

## Plugin Tools

### Memory Tools
- `memory_status()` - Get system state
- `memory_search(query)` - Search knowledge
- `memory_update(action, data)` - Update state

### Agent Tools
- `agent_register(role)` - Register in system
- `agent_status()` - See all agents
- `agent_send(type, payload)` - Send messages
- `agent_messages()` - Read messages
- `agent_set_handoff(enabled)` - Control persistence

### Task Tools
- `task_list(status)` - List tasks
- `task_create(title, ...)` - Create task
- `task_update(task_id, ...)` - Update task
- `task_next()` - Get next priority task
- `task_claim(task_id)` - Claim task atomically
- `task_schedule()` - Smart scheduling

### Quality Tools
- `quality_assess(task_id, scores...)` - Assess tasks
- `quality_report()` - View statistics

### User Message Tools
- `user_messages_read()` - Read messages
- `user_messages_mark_read(id)` - Mark as read

## Conventions

1. **Session Continuity**: Read `memory/working.md` at session start
2. **Task Tracking**: Use TodoWrite for in-session, task_create for persistent
3. **Agent Registration**: Call `agent_register()` at session start
4. **Handoff**: Orchestrator disables handoff, workers enable it
5. **Quality**: Assess completed tasks with `quality_assess()`

## Important Notes

- Plugin auto-injects memory context into system prompt
- Events logged to `memory/realtime.log`
- Stale agents cleaned up after 2 minutes
- Use memory tools via plugin, NOT direct JSON access
