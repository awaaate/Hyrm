# OpenCode Architecture Analysis

**Generated**: 2026-01-02  
**Source**: https://github.com/sst/opencode (v1.0.223)  
**Purpose**: Understand OpenCode internals for customization

---

## Table of Contents

1. [Overview](#overview)
2. [Package Structure](#package-structure)
3. [Agent System](#agent-system)
4. [Tool System](#tool-system)
5. [Task Tool Deep Dive](#task-tool-deep-dive)
6. [Plugin System](#plugin-system)
7. [Customization Options](#customization-options)
8. [Integration Plan](#integration-plan)

---

## Overview

OpenCode is an open-source AI coding agent with:
- Client/server architecture
- Multiple agent types (build, plan, explore, general)
- Plugin system for extensibility
- Skill system for specialized knowledge

### Repository Structure
```
sst/opencode/
├── packages/
│   ├── opencode/      # Core application
│   │   └── src/
│   │       ├── agent/     # Agent definitions
│   │       ├── tool/      # Built-in tools
│   │       ├── plugin/    # Plugin system
│   │       ├── session/   # Session management
│   │       └── ...
│   ├── plugin/        # @opencode-ai/plugin package
│   ├── sdk/           # @opencode-ai/sdk package
│   └── ...
└── ...
```

---

## Package Structure

### Core Package (`packages/opencode/src/`)

| Directory | Purpose |
|-----------|---------|
| `agent/` | Agent definitions and prompts |
| `tool/` | Built-in tool implementations |
| `plugin/` | Plugin loading and management |
| `session/` | Session lifecycle, messages, prompts |
| `config/` | Configuration management |
| `storage/` | Persistence layer |
| `mcp/` | MCP (Model Context Protocol) integration |
| `skill/` | Skill loading system |
| `command/` | Slash command handling |

---

## Agent System

### Agent Types

1. **build** (primary) - Default full-access agent for development
2. **plan** (primary) - Read-only agent for analysis
3. **general** (subagent) - For complex searches and multistep tasks
4. **explore** (subagent) - Fast codebase exploration

### Agent Configuration

Agents are defined in `src/agent/agent.ts` with prompts in `src/agent/prompt/`:
- `explore.txt` - Explore agent system prompt
- `compaction.txt` - Context compaction instructions
- `summary.txt` - Summary generation
- `title.txt` - Session title generation

### Agent Loading

```typescript
// From agent.ts
const agents = await Agent.list().then((x) => x.filter((a) => a.mode !== "primary"))
```

Agents can be:
- Built-in (defined in source)
- Custom (defined in `.opencode/agent/`)

---

## Tool System

### Tool Structure

Each tool consists of:
- `{name}.ts` - Implementation
- `{name}.txt` - Description (injected into system prompt)

### Built-in Tools

| Tool | File | Purpose |
|------|------|---------|
| `bash` | bash.ts | Shell command execution |
| `read` | read.ts | File reading |
| `write` | write.ts | File creation |
| `edit` | edit.ts | String replacement in files |
| `glob` | glob.ts | File pattern matching |
| `grep` | grep.ts | Content search |
| `task` | task.ts | Spawn subagent |
| `todowrite` | todo.ts | In-session task tracking |
| `todoread` | todo.ts | Read todo list |
| `skill` | skill.ts | Load skills |
| `webfetch` | webfetch.ts | Fetch web content |
| `lsp` | lsp.ts | Language server integration |

### Tool Registration

Tools are registered via `Tool.define()`:

```typescript
export const TaskTool = Tool.define("task", async () => {
  return {
    description: "...",
    parameters: z.object({...}),
    async execute(params, ctx) {...}
  }
})
```

---

## Task Tool Deep Dive

### How Task Tool Works

```typescript
// From task.ts
const session = await Session.create({
  parentID: ctx.sessionID,
  title: params.description + ` (@${agent.name} subagent)`,
  permission: [
    // Deny recursive task spawning
    { permission: "todowrite", pattern: "*", action: "deny" },
    { permission: "todoread", pattern: "*", action: "deny" },
    { permission: "task", pattern: "*", action: "deny" },
    // Allow primary tools if configured
    ...config.experimental?.primary_tools?.map(t => ({
      pattern: "*", action: "allow", permission: t,
    })) ?? [],
  ],
})
```

### Key Points

1. **Session Creation**: Task creates a new child session linked to parent
2. **Permission Restriction**: Subagents cannot:
   - Spawn more subagents (no recursive task)
   - Use todowrite/todoread
3. **Model Inheritance**: Uses parent's model unless agent specifies one
4. **Output Return**: Final text + session_id returned to parent

### Task Tool Description (task.txt)

The description includes:
- Available agent types dynamically injected
- When to use vs when NOT to use Task
- Usage notes about concurrency
- Examples

---

## Plugin System

### Plugin API

Plugins are loaded from `.opencode/plugin/index.ts`:

```typescript
import { type Plugin } from "@opencode-ai/plugin";

export const MyPlugin: Plugin = async (ctx) => {
  return {
    // Tools
    tool: {...},
    
    // Hooks
    "experimental.chat.system.transform": async (input, output) => {...},
    "tool.execute.before": async (input) => {...},
    "tool.execute.after": async (input, output) => {...},
    event: async ({ event }) => {...},
    
    // Compaction
    "experimental.session.compacting": async (input, output) => {...},
  }
}
```

### Available Hooks

| Hook | Timing | Purpose |
|------|--------|---------|
| `experimental.chat.system.transform` | Before each message | Modify system prompt |
| `tool.execute.before` | Before tool runs | Pre-processing |
| `tool.execute.after` | After tool runs | Post-processing, logging |
| `event` | Various events | Session lifecycle, file edits |
| `experimental.session.compacting` | On compaction | Preserve context |
| `config` | Plugin load | Initial configuration |

### Hook Context

```typescript
ctx = {
  directory: "/app/workspace",   // Project directory
  $: shell,                       // Shell runner
  // ... other context
}
```

---

## Customization Options

### Option 1: Plugin System Message Injection (Current)

We already use this to inject memory context:
```typescript
"experimental.chat.system.transform": async (input, output) => {
  const memoryContext = loadMemoryContext();
  output.system.push(memoryContext);
}
```

**Pros**: Easy, non-invasive  
**Cons**: Limited to system prompt additions

### Option 2: Custom Tools via Plugin

Add custom tools that integrate with our task system:
```typescript
tool: {
  task_create: tool({...}),
  task_list: tool({...}),
  task_update: tool({...}),
}
```

**Pros**: Full control over tool behavior  
**Cons**: Doesn't modify built-in Task tool

### Option 3: Custom Agents

Create custom agents in `.opencode/agent/`:
```
.opencode/agent/
├── orchestrator/
│   └── AGENT.yaml
├── worker/
│   └── AGENT.yaml
```

**Pros**: Full control over agent behavior  
**Cons**: Need to understand agent definition format

### Option 4: Fork/Patch OpenCode

Modify OpenCode source directly.

**Pros**: Complete control  
**Cons**: Maintenance burden, upgrade issues

---

## Integration Plan

### Phase 1: Enhanced Plugin Tools (Recommended)

Create plugin tools that mirror OpenCode's Task behavior but integrate with our system:

```typescript
// Custom task wrapper
task_spawn: tool({
  description: "Spawn a task-aware subagent",
  parameters: {...},
  async execute(params, ctx) {
    // 1. Create task in our system
    const task = await createTask(params.title, params.description);
    
    // 2. Spawn using native Task tool behavior
    // (or use opencode SDK to create session)
    
    // 3. Track in our task system
    await updateTask(task.id, { status: 'in_progress' });
    
    // 4. On completion, update task
    await updateTask(task.id, { status: 'completed' });
    
    return result;
  }
})
```

### Phase 2: Enhanced System Message

Inject task context into system prompt for subagents:

```typescript
"experimental.chat.system.transform": async (input, output) => {
  const taskContext = buildTaskContext();
  output.system.push(taskContext);
  
  // If this is a subagent session, add specific instructions
  if (input.session.parentID) {
    output.system.push(getSubagentInstructions());
  }
}
```

### Phase 3: Custom Agents (Future)

Define custom agents that use our memory/task system:

```yaml
# .opencode/agent/orchestrator/AGENT.yaml
name: orchestrator
description: Persistent orchestrator that uses memory system
mode: subagent
model:
  provider: anthropic
  model: claude-opus-4-5
system: |
  You are the ORCHESTRATOR AGENT.
  Always call memory_status first.
  Use task_create for new tasks.
  ...
```

---

## Current Integration Status

### What Already Works

1. **System Message Injection**: Memory context injected via plugin
2. **Custom Tools**: 40+ tools for memory, tasks, agents, quality
3. **Session Tracking**: tool-timing.jsonl, message-bus.jsonl
4. **Task Management**: Persistent task system via plugin tools

### What's Missing

1. **Native Task Tool Integration**: Our task system doesn't auto-sync with Task tool usage
2. **Subagent Awareness**: Subagents don't automatically inherit memory context
3. **Session Linking**: Child sessions created by Task aren't tracked in our system

### Recommended Next Steps

1. **Immediate**: Document findings, update AGENTS.md
2. **Short-term**: Create wrapper tool that integrates Task with our system
3. **Medium-term**: Add subagent detection to system message injection
4. **Long-term**: Create custom agents with full memory integration

---

## References

- OpenCode GitHub: https://github.com/sst/opencode
- OpenCode Docs: https://opencode.ai/docs
- Plugin Package: @opencode-ai/plugin
- SDK Package: @opencode-ai/sdk

---

*End of Analysis*
