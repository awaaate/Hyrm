# Autonomous Self-Improving AI Agent System

An experimental multi-agent AI orchestration system built on [OpenCode](https://opencode.ai) that runs autonomously, coordinates multiple AI agents, maintains persistent memory across sessions, and continuously improves itself.

## Overview

This system demonstrates autonomous AI agent behavior through:

- **Persistent Orchestrator**: A main agent that runs continuously, delegating tasks to worker agents
- **Multi-Agent Coordination**: Multiple specialized agents (code workers, memory workers, analysts) working in parallel
- **Persistent Memory**: Knowledge, achievements, and context preserved across sessions
- **Self-Improvement Loop**: Agents identify issues, create tasks, and implement improvements autonomously
- **Quality Assessment**: Automated evaluation of completed work with metrics tracking

## Architecture

```
                    ┌─────────────────────┐
                    │      Watchdog       │
                    │  (orchestrator-     │
                    │   watchdog.sh)      │
                    └──────────┬──────────┘
                               │ monitors/restarts
                               ▼
                    ┌─────────────────────┐
                    │    Orchestrator     │
                    │  (persistent agent) │
                    └──────────┬──────────┘
                               │ spawns & coordinates
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
      ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
      │  Code Worker  │ │ Memory Worker │ │Analysis Worker│
      │   (task A)    │ │   (task B)    │ │   (task C)    │
      └───────────────┘ └───────────────┘ └───────────────┘
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │   Persistent State  │
                    │   (memory/*.json)   │
                    └─────────────────────┘
```

### Components

| Component | Description |
|-----------|-------------|
| **Orchestrator** | Persistent agent that coordinates all work, delegates tasks, monitors workers |
| **Workers** | Specialized agents spawned for specific tasks (code, memory, analysis) |
| **Watchdog** | Shell script that ensures orchestrator stays running |
| **Memory System** | Persistent JSON/JSONL files for state, tasks, knowledge, and communication |
| **Plugin** | OpenCode plugin providing tools for agent coordination, memory, and tasks |

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime
- [OpenCode CLI](https://opencode.ai) installed and configured with an API key

### Running the System

```bash
# Option 1: Start orchestrator manually
./start-main.sh

# Option 2: Start with watchdog (auto-restarts on failure)
./orchestrator-watchdog.sh
```

### Monitoring

```bash
# Check system status
bun tools/cli.ts status

# View active agents
bun tools/cli.ts agents

# List tasks
bun tools/cli.ts tasks

# Real-time dashboard (interactive)
bun tools/realtime-monitor.ts

# Send a message to the orchestrator
bun tools/user-message.ts send "Please prioritize bug fixes"
```

## The Self-Improvement Loop

The system autonomously improves itself through this cycle:

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  1. OBSERVE: Monitor codebase, logs, quality metrics        │
│       ↓                                                      │
│  2. IDENTIFY: Find bugs, inefficiencies, opportunities      │
│       ↓                                                      │
│  3. CREATE TASK: Log improvement as persistent task         │
│       ↓                                                      │
│  4. DELEGATE: Spawn worker to implement fix                 │
│       ↓                                                      │
│  5. IMPLEMENT: Worker makes code changes                    │
│       ↓                                                      │
│  6. ASSESS: Quality system evaluates the work               │
│       ↓                                                      │
│  7. LEARN: Extract insights to knowledge base               │
│       ↓                                                      │
│  (repeat)                                                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Example Improvements Made Autonomously

The system has already made improvements to itself, including:

- Implemented centralized error handling with JSON recovery
- Added file locking for concurrent state file access
- Created a shared data layer with caching
- Implemented automatic quality assessment on task completion
- Fixed various bugs in the plugin tools
- Archived and cleaned up working memory

## Key Features

### Multi-Agent Coordination

- **Leader Election**: Single-leader model prevents conflicts between orchestrators
- **Message Bus**: JSONL-based communication between agents
- **Task Claiming**: Atomic task assignment prevents duplicate work
- **Heartbeat Monitoring**: Stale agents automatically cleaned up

### Persistent Memory

| File | Purpose |
|------|---------|
| `state.json` | Session count, achievements, active tasks |
| `tasks.json` | Persistent task queue with priorities |
| `knowledge-base.json` | Extracted insights from completed work |
| `agent-registry.json` | Currently active agents |
| `message-bus.jsonl` | Agent-to-agent communication log |
| `working.md` | Current working context (Markdown) |

### Quality System

- Tasks are assessed on completeness, code quality, documentation, efficiency, and impact
- Scores from 1-10 with weighted overall calculation
- Trend tracking to identify improvement or regression
- Lessons learned captured for future reference

## Plugin Tools

The system provides custom tools to agents via an OpenCode plugin:

### Agent Tools
- `agent_register(role)` - Register in the multi-agent system
- `agent_status()` - View all active agents
- `agent_send(type, payload)` - Send messages to other agents
- `agent_messages()` - Read incoming messages
- `agent_set_handoff(enabled)` - Control agent persistence

### Task Tools
- `task_list(status)` - List tasks by status
- `task_create(title, ...)` - Create a new persistent task
- `task_claim(task_id)` - Atomically claim a task
- `task_update(task_id, ...)` - Update task status/notes
- `task_schedule()` - Get smart scheduling recommendations

### Memory Tools
- `memory_status()` - Get current system state
- `memory_search(query)` - Search knowledge base and history
- `memory_update(action, data)` - Update state, achievements, tasks

### Quality Tools
- `quality_assess(task_id, scores)` - Assess completed work
- `quality_report()` - View quality statistics and trends

## Project Structure

```
/app/workspace/
├── .opencode/
│   ├── plugin/             # OpenCode plugin with custom tools
│   ├── skill/              # Agent skills and patterns
│   └── command/            # Slash commands
├── memory/                 # Persistent state files
├── tools/                  # CLI utilities and scripts
├── docs/                   # Documentation and archives
├── orchestrator-watchdog.sh
├── start-main.sh
└── opencode.json           # OpenCode configuration
```

## Configuration

Edit `opencode.json` to configure:

- **Model**: Change `model` field to use different AI models
- **Agent Types**: Define specialized worker types in `agent` section
- **MCP Servers**: Add external tool servers in `mcp` section

## Limitations and Considerations

- **Experimental**: This is a research project exploring autonomous AI behavior
- **Resource Usage**: Running continuously consumes API credits
- **Error Recovery**: While robust, edge cases may require manual intervention
- **Safety**: The system can modify its own code - use appropriate safeguards

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Check system health
bun tools/agent-health-monitor.ts

# Generate daily report
bun tools/daily-report-generator.ts
```

## Contributing

This project is experimental and primarily self-improving. Human contributions are welcome for:

- Architectural improvements
- Safety and monitoring enhancements  
- Documentation
- Bug reports

## License

MIT

---

*This README was written by the autonomous agent system as part of its self-improvement process.*
