# Task: Reorganize tools/ and Auto-Document CLIs

**Task ID**: `task_1767520395465_2o5xy7`  
**Priority**: Critical  
**Estimated Time**: 3-4 hours  
**Status**: Pending

---

## Problem Statement

1. **Agent doesn't know available CLIs** - Has to guess or explore `tools/` directory
2. **Disorganized structure** - 20+ files loose in `tools/`, hard to navigate
3. **No documentation** - Each CLI has different interfaces, no unified help
4. **Human visibility** - Dashboard exists but not easily discoverable or integrated

## Goals

1. Reorganize `tools/` into clear categories
2. Auto-generate documentation of all CLIs
3. Make CLI discovery easy for agents (skill file or system prompt injection)
4. Unified CLI interface pattern
5. **Human-facing dashboard as first-class citizen** - Easy to launch, documented, integrated

---

## Current State

```
tools/
├── shared/                          # OK - utilities
├── agent-conversation-viewer.ts     # CLI
├── agent-health-monitor.ts          # CLI
├── agent-performance-profiler.ts    # CLI/Lib
├── cli.ts                           # CLI (main entry?)
├── critique-agent.ts                # CLI
├── daily-report-generator.ts        # CLI
├── dashboard.ts                     # CLI
├── debug-capture.ts                 # CLI
├── generate-orchestrator-prompt.ts  # Lib
├── generate-worker-prompt.ts        # Lib
├── git-integration.ts               # CLI
├── knowledge-deduplicator.ts        # CLI
├── knowledge-extractor.ts           # CLI
├── message-bus-manager.ts           # CLI/Lib
├── multi-agent-coordinator.ts       # Lib (class)
├── opencode-tracker.ts              # CLI
├── quality-assessor.ts              # CLI
├── realtime-monitor.ts              # CLI
├── session-summarizer.ts            # CLI
├── system-message-config.ts         # Lib
├── task-manager.ts                  # CLI
├── task-router.ts                   # Lib
├── user-message.ts                  # CLI
└── working-memory-manager.ts        # CLI
```

---

## Target State

```
tools/
├── cli/                             # All executable CLIs
│   ├── index.ts                     # Main entry: bun tools/cli help
│   ├── task.ts                      # Task management
│   ├── agent.ts                     # Agent coordination
│   ├── memory.ts                    # Memory operations
│   ├── git.ts                       # Git integration
│   ├── quality.ts                   # Quality assessment
│   ├── monitor.ts                   # Monitoring & dashboards
│   ├── knowledge.ts                 # Knowledge base operations
│   └── debug.ts                     # Debugging utilities
│
├── ui/                              # Human-facing interactive UIs
│   ├── dashboard.ts                 # Main TUI dashboard (blessed)
│   ├── realtime.ts                  # Real-time log viewer
│   └── README.md                    # How to use the UIs
│
├── lib/                             # Non-executable libraries
│   ├── coordinator.ts               # MultiAgentCoordinator class
│   ├── task-manager.ts              # TaskManager class  
│   ├── prompt-generator.ts          # Orchestrator/worker prompts
│   ├── knowledge-extractor.ts       # Knowledge extraction logic
│   ├── session-summarizer.ts        # Session summarization
│   └── task-router.ts               # Task routing logic
│
├── shared/                          # Shared utilities (keep as-is)
│   └── ...
│
├── README.md                        # Auto-generated CLI documentation
└── index.ts                         # Exports all + generates docs
```

---

## Implementation Plan

### Phase 1: Create New Structure (30 min)

1. Create `tools/cli/` directory
2. Create `tools/lib/` directory
3. Don't move files yet - just prepare structure

### Phase 2: Consolidate CLIs (1.5 hours)

Each CLI file in `tools/cli/` should:
- Have consistent interface: `bun tools/cli/<name>.ts <command> [args]`
- Export a `COMMANDS` object describing available commands
- Have `--help` support

**Mapping**:

| New CLI | Old Files | Commands |
|---------|-----------|----------|
| `cli/task.ts` | task-manager.ts | create, list, status, view, next, gh:issue, gh:branch |
| `cli/agent.ts` | multi-agent-coordinator.ts, agent-health-monitor.ts | status, register, messages, health |
| `cli/memory.ts` | working-memory-manager.ts, user-message.ts | status, search, update, archive, user-msg |
| `cli/git.ts` | git-integration.ts | status, commit, branch, log |
| `cli/quality.ts` | quality-assessor.ts, critique-agent.ts | assess, report, critique |
| `cli/monitor.ts` | agent-health-monitor.ts, opencode-tracker.ts | health, status, sessions |
| `cli/knowledge.ts` | knowledge-extractor.ts, knowledge-deduplicator.ts | extract, dedupe, search |
| `cli/debug.ts` | debug-capture.ts, agent-conversation-viewer.ts | capture, view-conversation |

### Phase 3: Create UI Directory (20 min)

Move human-facing interactive tools to `tools/ui/`:
- `dashboard.ts` → `ui/dashboard.ts` (main TUI - 836 lines, blessed-based)
- `realtime-monitor.ts` → `ui/realtime.ts`

Create `tools/ui/README.md`:
```markdown
# Human-Facing UIs

Interactive terminal interfaces for monitoring the multi-agent system.

## Dashboard (main UI)

```bash
bun tools/ui/dashboard.ts [mode]
```

Modes: timeline, agents, tasks, sessions, tokens, logs

Keys:
- 1-6: Switch views
- j/k: Navigate  
- n: New task
- m: Send message
- q: Quit

## Realtime Monitor

```bash
bun tools/ui/realtime.ts
```

Live-streaming log viewer.
```

### Phase 4: Move Libraries (30 min)

Move non-CLI files to `tools/lib/`:
- `multi-agent-coordinator.ts` → `lib/coordinator.ts`
- `generate-orchestrator-prompt.ts` → `lib/prompt-generator.ts`
- `generate-worker-prompt.ts` → merge into `lib/prompt-generator.ts`
- `task-router.ts` → `lib/task-router.ts`
- `system-message-config.ts` → `lib/system-message-config.ts`

### Phase 5: Auto-Documentation (1 hour)

Create `tools/cli/index.ts` that:

```typescript
// tools/cli/index.ts
import { COMMANDS as taskCommands } from './task';
import { COMMANDS as agentCommands } from './agent';
// ...

const ALL_COMMANDS = {
  task: taskCommands,
  agent: agentCommands,
  memory: memoryCommands,
  git: gitCommands,
  quality: qualityCommands,
  monitor: monitorCommands,
  knowledge: knowledgeCommands,
  debug: debugCommands,
};

// Generate markdown documentation
function generateDocs(): string {
  let md = '# Available CLI Tools\n\n';
  for (const [name, commands] of Object.entries(ALL_COMMANDS)) {
    md += `## ${name}\n\n`;
    md += `\`bun tools/cli/${name}.ts <command>\`\n\n`;
    for (const [cmd, desc] of Object.entries(commands)) {
      md += `- **${cmd}**: ${desc}\n`;
    }
    md += '\n';
  }
  return md;
}

// CLI entry point
if (process.argv[2] === 'help' || !process.argv[2]) {
  console.log(generateDocs());
}

if (process.argv[2] === 'generate-docs') {
  writeFileSync('tools/README.md', generateDocs());
  console.log('Generated tools/README.md');
}
```

### Phase 6: Agent Awareness (30 min)

Create `.opencode/skill/cli-tools.md`:

```markdown
# CLI Tools Skill

You have access to these CLI tools in /app/workspace/tools/cli/:

## Quick Reference

- `bun tools/cli/task.ts <cmd>` - Task management
- `bun tools/cli/agent.ts <cmd>` - Agent coordination  
- `bun tools/cli/memory.ts <cmd>` - Memory operations
- `bun tools/cli/git.ts <cmd>` - Git operations
- `bun tools/cli/quality.ts <cmd>` - Quality assessment
- `bun tools/cli/monitor.ts <cmd>` - Monitoring
- `bun tools/cli/knowledge.ts <cmd>` - Knowledge base
- `bun tools/cli/debug.ts <cmd>` - Debugging

## Get Full Help

Run `bun tools/cli help` for complete command reference.
```

Also inject into system prompt via plugin (optional).

### Phase 7: Update Imports (30 min)

Update all files that import from old paths:
- Plugin imports
- Other tools
- Scripts

### Phase 8: Cleanup (15 min)

1. Remove old files (after verifying everything works)
2. Update any documentation referencing old paths
3. Commit changes

---

## Success Criteria

- [ ] All CLIs accessible via `bun tools/cli/<name>.ts`
- [ ] `bun tools/cli help` shows all available commands
- [ ] `tools/README.md` auto-generated with full documentation
- [ ] `.opencode/skill/cli-tools.md` exists for agent awareness
- [ ] All existing functionality preserved
- [ ] No broken imports
- [ ] Plugin still works after reorganization
- [ ] **Dashboard accessible via `bun tools/ui/dashboard.ts`**
- [ ] **`tools/ui/README.md` documents how humans can monitor the system**

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing scripts | Search for all usages before moving |
| Plugin import errors | Test plugin build after each phase |
| Lost functionality | Keep old files until new ones verified |

---

## Notes

- Keep `tools/shared/` as-is - it's already well organized
- Consider adding TypeScript path aliases for cleaner imports
- Future: Could add `bunx workspace-cli` global command

---

## Human Visibility (Important)

The `tools/ui/dashboard.ts` is **critical** for human operators to:
- See what agents are doing in real-time
- Monitor task progress
- View token usage
- Read logs
- Send messages to agents
- Create new tasks

It should be:
1. **Easy to launch**: `bun tools/ui/dashboard.ts` or alias `./dashboard`
2. **Well documented**: Clear keybindings, modes explained
3. **Reliable**: Handle missing data gracefully, auto-refresh
4. **Discoverable**: Mentioned in main README.md

Consider adding a root-level script:
```bash
#!/bin/bash
# ./dashboard - Quick launch for human monitoring
exec bun tools/ui/dashboard.ts "$@"
```
