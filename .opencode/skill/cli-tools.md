# CLI Tools Awareness Skill

This skill provides agents with knowledge of available CLI tools in the workspace.

## Quick Reference - Most Important Tools

### System Management
- `bun tools/cli.ts status` - Full system overview (session, agents, tasks, messages)
- `bun tools/cli.ts agents` - List active agents with leader election status
- `bun tools/cli.ts tasks` - View all tasks by priority

### Task Management
- `bun tools/task-manager.ts summary` - Task overview with statistics
- `bun tools/task-manager.ts create "<title>" <priority>` - Create new task
- `bun tools/task-manager.ts next` - Get next available task
- `bun tools/task-manager.ts list [status]` - List tasks by status
- `bun tools/task-manager.ts view <id>` - View task details
- `bun tools/task-manager.ts gh:issue <id>` - Create GitHub issue
- `bun tools/task-manager.ts gh:branch <id>` - Create git branch

### Agent Operations
- `bun tools/agent-health-monitor.ts status` - Agent health and cleanup
- `bun tools/agent-conversation-viewer.ts <agent-id>` - View agent messages
- `bun tools/agent-performance-profiler.ts summary` - Agent performance metrics

### Memory & Knowledge
- `bun tools/working-memory-manager.ts status` - Working memory health
- `bun tools/working-memory-manager.ts archive` - Archive old content
- `bun tools/knowledge-extractor.ts extract` - Extract session learnings
- `bun tools/knowledge-deduplicator.ts analyze` - Find duplicate knowledge
- `bun tools/session-summarizer.ts summarize` - Summarize sessions

### Git Integration
- `bun tools/git-integration.ts status` - Git status with metadata
- `bun tools/git-integration.ts diff [file]` - Show changes
- `bun tools/git-integration.ts commit "<msg>"` - Create commit
- `bun tools/git-integration.ts log [n]` - Show recent commits
- `bun tools/git-integration.ts search <query>` - Search commit history

### Quality & Review
- `bun tools/quality-assessor.ts summary` - Quality statistics
- `bun tools/quality-assessor.ts assess <task-id>` - Assess task quality
- `bun tools/critique-agent.ts review <files>` - Code review
- `bun tools/daily-report-generator.ts generate` - Generate daily report

### Monitoring & Debugging
- `bun tools/ui/dashboard.ts` - Interactive TUI dashboard (humans)
- `bun tools/ui/realtime.ts` - Real-time monitor with file watching
- `bun tools/opencode-tracker.ts sessions` - List OpenCode sessions
- `bun tools/opencode-tracker.ts view <session-id>` - View session details
- `bun tools/debug-capture.ts start` - Capture debug output

### User Interaction
- `bun tools/user-message.ts send "<message>"` - Send message to agents
- `bun tools/user-message.ts list` - View user messages

## Tool Categories

### Interactive UIs (tools/ui/)
For human operators to monitor and control the system:
- **dashboard.ts** - Main interactive TUI with 6 views (timeline, agents, tasks, sessions, tokens, logs)
- **realtime.ts** - Lightweight real-time monitor with file watching

### Libraries (tools/lib/)
Reusable code modules (import, don't execute):
- **coordinator.ts** - MultiAgentCoordinator class
- **prompt-generator.ts** - Generate orchestrator/worker prompts
- **task-router.ts** - Task routing logic
- **system-message-config.ts** - System message configuration

### Legacy CLIs (tools/)
Main CLI tools at root level (will be reorganized):
- See full list with `bun tools/generate-tools-docs.ts`

## How to Use Tools as an Agent

### Via Bash Tool
```typescript
// Run a CLI command
const result = await bash("bun tools/cli.ts status");

// Create a task
await bash('bun tools/task-manager.ts create "Fix bug in X" high');

// Check git status
await bash("bun tools/git-integration.ts status");
```

### Via Direct Import (for libraries)
```typescript
import { generateWorkerPrompt } from './tools/lib/prompt-generator';
import { MultiAgentCoordinator } from './tools/lib/coordinator';

const prompt = generateWorkerPrompt("Task description", "code-worker");
```

### Via Plugin Tools
Prefer using plugin tools when available:
- `task_create()` instead of `bash("bun tools/task-manager.ts create ...")`
- `agent_status()` instead of parsing CLI output
- `memory_search()` instead of manual file reading

## Best Practices

### When to Use CLI Tools vs Plugin Tools

**Use Plugin Tools When:**
- Performing orchestration operations (task management, agent coordination)
- Updating memory system state
- Reading structured data (tasks, agents, messages)

**Use CLI Tools When:**
- Generating reports or documentation
- Running complex analysis scripts
- Debugging or investigating issues
- Performing git operations
- Extracting knowledge or summarizing sessions

### Common Patterns

**Check system health**:
```bash
bun tools/cli.ts status
bun tools/agent-health-monitor.ts status
bun tools/working-memory-manager.ts status
```

**Before starting work**:
```bash
# See what needs to be done
bun tools/task-manager.ts summary
bun tools/task-manager.ts next

# Check what agents are active
bun tools/cli.ts agents

# Review recent changes
bun tools/git-integration.ts log 5
```

**After completing work**:
```bash
# Commit changes
bun tools/git-integration.ts commit "Description of changes"

# Update knowledge base
bun tools/knowledge-extractor.ts extract

# Generate quality report
bun tools/daily-report-generator.ts generate
```

## Tool Discovery

### Get Full Documentation
```bash
# Generate comprehensive tools reference
bun tools/generate-tools-docs.ts

# View generated documentation
cat docs/TOOLS_REFERENCE.md
```

### Search for Tools
```bash
# Find all CLI tools
find tools/ -name "*.ts" -type f | grep -v node_modules | grep -v ".test.ts"

# Find tools with specific functionality
grep -r "Task Management" tools/*.ts | head -5
```

## Documentation Links

- **Full Tools Reference**: [docs/TOOLS_REFERENCE.md](../../docs/TOOLS_REFERENCE.md)
- **UI Documentation**: [tools/ui/README.md](../../tools/ui/README.md)
- **System Architecture**: [docs/OPENCODE_ARCHITECTURE.md](../../docs/OPENCODE_ARCHITECTURE.md)
- **Agent Guidelines**: [AGENTS.md](../../AGENTS.md)

## Notes for Orchestrators

When spawning workers, you can give them this skill context:

```bash
nohup opencode run 'You are a CODE-WORKER. 
Before starting, review available tools with: cat docs/TOOLS_REFERENCE.md

Task: [your task description]
Available tools: bun tools/cli.ts, task-manager, git-integration

When done: agent_send(type="task_complete", ...)' > /dev/null 2>&1 &
```

## Auto-Update

The tools documentation is auto-generated. To refresh:

```bash
bun tools/generate-tools-docs.ts
```

This scans all tools and updates `docs/TOOLS_REFERENCE.md` with current commands and descriptions.
