# Deep Codebase Analysis

**Generated**: 2026-01-02  
**Analyst**: Orchestrator Agent  
**Session**: 110+

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Component Deep-Dive](#component-deep-dive)
4. [Code Quality Issues](#code-quality-issues)
5. [Redundancy Analysis](#redundancy-analysis)
6. [Recommendations](#recommendations)
7. [Migration Plan](#migration-plan)

---

## Executive Summary

This multi-agent AI orchestration system is built on OpenCode and consists of:

- **Plugin System**: 1,261-line core plugin with 7 modular tool files
- **CLI Tools**: 25 TypeScript CLI tools for various operations
- **Dashboard UI**: React/Vite web dashboard with WebSocket integration
- **Memory System**: JSON/JSONL-based persistence layer
- **Skill System**: Markdown-based agent guidance files

### Key Metrics
- Total TypeScript files: ~35 (plugin + tools + UI)
- Lines of code (estimated): 15,000+
- Tool definitions: 40+ custom plugin tools
- CLI commands: 80+ across all tools

### Critical Findings
1. **HIGH**: 10+ files duplicate the same `readJson` helper function
2. **HIGH**: ANSI color constants duplicated in 12+ files
3. **MEDIUM**: Inconsistent error handling (mix of empty catch, silent failure, logging)
4. **MEDIUM**: Hardcoded paths throughout (should use config)
5. **LOW**: Mixed shebang lines (`node` vs `bun`)
6. **LOW**: Inconsistent import styles

---

## Architecture Overview

```
/app/workspace/
├── .opencode/
│   ├── plugin/
│   │   ├── index.ts          # Main plugin (1,261 lines)
│   │   └── tools/            # Modular tool definitions
│   │       ├── agent-tools.ts
│   │       ├── memory-tools.ts
│   │       ├── task-tools.ts
│   │       ├── quality-tools.ts
│   │       ├── user-message-tools.ts
│   │       ├── recovery-tools.ts
│   │       └── git-tools.ts
│   ├── skill/               # Agent skills (markdown)
│   └── command/             # Slash commands
│
├── tools/                   # CLI utilities (25 files)
│   ├── opencode-cli.ts      # Unified CLI entry point
│   ├── task-manager.ts      # Task CRUD operations
│   ├── critique-agent.ts    # Code review
│   └── [22 more tools...]
│
├── dashboard-ui/            # React dashboard
│   └── src/App.tsx          # Main app (1,100+ lines)
│
└── memory/                  # Persistence layer
    ├── state.json           # System state
    ├── tasks.json           # Task store
    ├── agent-registry.json  # Active agents
    ├── message-bus.jsonl    # Agent messages
    └── [10+ more files...]
```

### Data Flow

```
User Request
    ↓
OpenCode (host)
    ↓
MemoryPlugin (hooks, tools)
    ↓
├── Tool calls → CLI tools / Direct file ops
├── Agent coordination → message-bus.jsonl
└── State updates → memory/*.json
    ↓
Memory System (persistence)
```

---

## Component Deep-Dive

### 1. Plugin System (`.opencode/plugin/`)

**File: `index.ts` (1,261 lines)**

The main plugin handles:
- System message injection via `experimental.chat.system.transform`
- Session lifecycle events (`session.created`, `session.idle`, `session.error`)
- Tool execution timing via `tool.execute.before/after` hooks
- Compaction context preservation
- Multi-agent coordination via `MultiAgentCoordinator`

**Key Functions:**
| Function | Lines | Purpose |
|----------|-------|---------|
| `handleSessionCreated` | 855-960 | Boot sequence, agent cleanup, background tasks |
| `handleSessionIdle` | 962-1071 | Handoff logic, session knowledge extraction |
| `extractSessionKnowledge` | 1073-1165 | Auto-extract learnings from tool timing |
| `loadMemoryContext` | 404-502 | Build dynamic system message |
| `getToolCategory` | 153-211 | Categorize tools for timing analysis |

**Modular Tools:**
| File | Tools | Purpose |
|------|-------|---------|
| `agent-tools.ts` | 6 | Agent registration, messaging, handoff control |
| `memory-tools.ts` | 3 | Memory status, search, update |
| `task-tools.ts` | 6 | Task CRUD, claiming, scheduling |
| `quality-tools.ts` | 2 | Quality assessment, reporting |
| `user-message-tools.ts` | 2 | User message reading/marking |
| `recovery-tools.ts` | 3+ | Checkpoint save/load, recovery status |
| `git-tools.ts` | 6 | Git status, diff, log, commit, search |

### 2. CLI Tools (`tools/`)

**25 CLI tools organized by function:**

**Core Tools:**
| Tool | Purpose | Commands |
|------|---------|----------|
| `opencode-cli.ts` | Unified CLI | status, agents, tasks, timing, bus, memory, git, critique |
| `task-manager.ts` | Task management | create, list, update, assign, next, summary |
| `realtime-monitor.ts` | Live dashboard | Interactive TUI with hotkeys |
| `terminal-dashboard.ts` | Blessed TUI | Agent status, task queue, messages |

**Analysis Tools:**
| Tool | Purpose |
|------|---------|
| `critique-agent.ts` | Code review with pattern matching |
| `agent-performance-profiler.ts` | Performance analytics |
| `session-analytics.ts` | Session pattern analysis |
| `daily-report-generator.ts` | Daily performance reports |

**Memory Management:**
| Tool | Purpose |
|------|---------|
| `working-memory-manager.ts` | Archive old sessions from working.md |
| `message-bus-manager.ts` | Rotate, compact, search message bus |
| `knowledge-extractor.ts` | Extract insights from sessions |
| `knowledge-deduplicator.ts` | Remove duplicate knowledge |
| `smart-memory-manager.ts` | Intelligent memory pruning |

**Agent Coordination:**
| Tool | Purpose |
|------|---------|
| `multi-agent-coordinator.ts` | Agent registration, messaging |
| `agent-health-monitor.ts` | Health checks, cleanup |
| `agent-conversation-viewer.ts` | View agent conversations |
| `conversation-tracker.ts` | Track OpenCode sessions |

**Configuration:**
| Tool | Purpose |
|------|---------|
| `system-message-config.ts` | Configure system message injection |
| `generate-orchestrator-prompt.ts` | Generate orchestrator startup prompts |

### 3. Dashboard UI (`dashboard-ui/`)

**React + Vite + TypeScript application**

**File: `App.tsx` (1,100+ lines)**

**Components:**
| Component | Lines | Purpose |
|-----------|-------|---------|
| `Sidebar` | ~50 | Navigation tabs |
| `OverviewPanel` | ~200 | System status, quick actions |
| `AgentsPanel` | ~150 | Agent list, status badges |
| `TasksPanel` | ~200 | Task table, priority/status |
| `MessagesPanel` | ~100 | Message bus viewer |
| `QualityPanel` | ~150 | Quality metrics, trends |
| `PerformancePanel` | ~374 | Tool timing, optimization suggestions |

**WebSocket Integration:**
- Connects to `ws://localhost:3847/ws`
- Real-time updates for all panels
- Reconnection logic with exponential backoff

**Server: `server.ts`**
- Express + WebSocket server
- File watching for real-time updates
- REST API for all data endpoints

### 4. Memory System (`memory/`)

**File Types:**
| File | Format | Purpose |
|------|--------|---------|
| `state.json` | JSON | Session count, status, achievements |
| `tasks.json` | JSON | Task store with full history |
| `agent-registry.json` | JSON | Active agent registrations |
| `quality-assessments.json` | JSON | Quality scores by task |
| `agent-performance-metrics.json` | JSON | Agent performance tracking |
| `message-bus.jsonl` | JSONL | Agent-to-agent messages |
| `sessions.jsonl` | JSONL | Session lifecycle events |
| `tool-timing.jsonl` | JSONL | Tool execution metrics |
| `realtime.log` | JSONL | Real-time event log |
| `user-messages.jsonl` | JSONL | User-to-agent messages |
| `working.md` | Markdown | Working memory for context |
| `knowledge-base.json` | JSON | Extracted insights |

### 5. Skill System (`.opencode/skill/`)

**Skills provide guidance for specialized agent behaviors:**
- `agent-orchestrator/SKILL.md` - Orchestrator mission, spawning patterns
- `memory-manager/SKILL.md` - Memory management best practices
- `multi-agent-patterns/SKILL.md` - Collaboration patterns
- `critique-agent/SKILL.md` - Code review guidelines

---

## Code Quality Issues

### 1. Duplicated Code (HIGH Priority)

#### `readJson` Helper (10+ duplications)

Found in:
- `tools/session-summarizer.ts:92-99`
- `tools/opencode-cli.ts:60-67`
- `tools/critique-agent.ts:92-99`
- `tools/knowledge-deduplicator.ts:74-83`
- `tools/realtime-monitor.ts:105-112`
- `tools/agent-health-monitor.ts:105-112`
- `.opencode/plugin/tools/memory-tools.ts:36-38`

```typescript
// Duplicated pattern:
function readJson<T>(path: string, defaultValue: T): T {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  } catch {}
  return defaultValue;
}
```

#### ANSI Color Constants (12+ duplications)

Found in almost every CLI tool:
```typescript
const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};
```

#### `readJsonl` Helper (8+ duplications)

```typescript
function readJsonl<T>(path: string): T[] {
  try {
    if (existsSync(path)) {
      return readFileSync(path, "utf-8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }
  } catch {}
  return [];
}
```

#### String Similarity Function (2 duplications)

- `tools/knowledge-extractor.ts:252-263`
- `tools/knowledge-deduplicator.ts:100-114`

#### Time Formatting Functions (4 variations)

- `formatDuration(ms)` - agent-health-monitor, session-summarizer
- `formatTime(timestamp)` - opencode-cli
- `formatTimeAgo(timestamp)` - realtime-monitor

### 2. Inconsistent Error Handling (MEDIUM Priority)

**Empty catch blocks (silent failure):**
- `tools/session-summarizer.ts:96-97`: `catch {}`
- `tools/opencode-cli.ts:64-65`: `catch {}`
- `.opencode/plugin/index.ts:115-117`: `catch { return ... }`

**Logged but not handled:**
- `tools/task-manager.ts:56-58`: `catch (e) { console.error(...); }`

**No try/catch at all:**
- `tools/task-manager.ts:70`: `fs.writeFileSync` without protection
- Multiple `writeFileSync` calls without error handling

### 3. Hardcoded Values (MEDIUM Priority)

**Paths:**
```typescript
// task-manager.ts
private storePath = '/app/workspace/memory/tasks.json';

// quality-assessor.ts
private storePath = '/app/workspace/memory/quality-assessments.json';

// All files assume /app/workspace/memory/ base
```

**Constants:**
```typescript
// plugin/index.ts
const LOCK_STALE_THRESHOLD = 30000; // Should be config
const AGENT_STALE_THRESHOLD = 2 * 60 * 1000;

// dashboard-ui/src/App.tsx
const API_BASE = "http://localhost:3847"; // Should be env var
```

### 4. Inconsistent Styles (LOW Priority)

**Shebang:**
- `node` shebang: task-manager, knowledge-extractor, quality-assessor
- `bun` shebang: opencode-cli, session-summarizer, critique-agent

**Imports:**
- `import * as fs from 'fs'` vs `import { readFileSync } from "fs"`

**Naming:**
- `storePath` vs `MEMORY_DIR` vs `memoryDir`
- Class-based (TaskManager) vs functional (createMemoryTools)

### 5. Long Functions (Code Smell)

| File | Function | Lines |
|------|----------|-------|
| `plugin/index.ts` | `handleSessionCreated` | 105 |
| `plugin/index.ts` | `handleSessionIdle` | 109 |
| `dashboard-ui/src/App.tsx` | `PerformancePanel` | 374 |
| `tools/critique-agent.ts` | `analyzeCode` | 46 |

---

## Redundancy Analysis

### Overlapping Functionality

| Feature | CLI Tool | Plugin Tool | Duplication Type |
|---------|----------|-------------|------------------|
| Task management | `task-manager.ts` | `task-tools.ts` | Near-identical logic |
| Quality assessment | `quality-assessor.ts` | `quality-tools.ts` | Same operations |
| Message bus | `message-bus-manager.ts` | `agent-tools.ts` | Partial overlap |

### Code That Could Be Shared

1. **JSON I/O utilities** (~100 lines saved across all files)
   - `readJson`, `writeJson`, `readJsonl`, `appendJsonl`

2. **Color/formatting utilities** (~50 lines saved)
   - ANSI color constants
   - Time formatting functions
   - String truncation

3. **Path utilities** (~30 lines saved)
   - Memory directory resolution
   - Session directory helpers

4. **Priority/status constants** (~20 lines saved)
   - `priorityOrder` object
   - Status enums

**Estimated savings: ~200 lines of duplicated code**

---

## Recommendations

### Immediate Actions (Before Code Quality Agent)

1. **Create Shared Utilities Module**
   ```
   tools/shared/
   ├── json-utils.ts      # readJson, writeJson, readJsonl, appendJsonl
   ├── colors.ts          # ANSI color constants
   ├── time-utils.ts      # formatDuration, formatTime, formatTimeAgo
   ├── string-utils.ts    # truncate, stringSimilarity
   ├── paths.ts           # memoryDir, getPath helpers
   ├── config.ts          # Centralized configuration
   └── types.ts           # Shared TypeScript interfaces
   ```

2. **Create Configuration File**
   ```typescript
   // tools/shared/config.ts
   export const CONFIG = {
     MEMORY_DIR: process.env.MEMORY_DIR || '/app/workspace/memory',
     LOCK_STALE_THRESHOLD: 30000,
     AGENT_STALE_THRESHOLD: 2 * 60 * 1000,
     API_BASE: process.env.API_BASE || 'http://localhost:3847',
   };
   ```

3. **Standardize Patterns**
   - All CLI tools use `#!/usr/bin/env bun`
   - All files use named imports: `import { x, y } from "z"`
   - All file operations wrapped in try/catch

### Medium-Term Improvements

1. **Extract Dashboard Components**
   - Split `App.tsx` into separate component files
   - Create shared hooks for data fetching

2. **Consolidate Task Logic**
   - Single source of truth for task operations
   - CLI tool wraps plugin tool (not duplicate)

3. **Add TypeScript Strict Mode**
   - Enable `strict: true` in all tsconfig
   - Replace `any` types with proper interfaces

### Long-Term Architecture

1. **Monorepo Structure**
   ```
   packages/
   ├── core/           # Shared utilities
   ├── plugin/         # OpenCode plugin
   ├── cli/            # CLI tools
   └── dashboard/      # React dashboard
   ```

2. **Test Coverage**
   - Unit tests for shared utilities
   - Integration tests for plugin tools
   - E2E tests for dashboard

---

## Migration Plan

### Phase 1: Create Shared Utilities (Safe)

1. Create `tools/shared/` directory
2. Extract `json-utils.ts` (no changes to existing code yet)
3. Extract `colors.ts`
4. Extract `time-utils.ts`
5. Create `types.ts` with shared interfaces

### Phase 2: Migrate CLI Tools (One at a Time)

Order by risk (lowest first):
1. `agent-health-monitor.ts` - Low usage
2. `knowledge-deduplicator.ts` - Low usage
3. `session-summarizer.ts` - Medium usage
4. `realtime-monitor.ts` - Medium usage
5. `critique-agent.ts` - Medium usage
6. `opencode-cli.ts` - High usage (last)

For each file:
1. Import shared utilities
2. Remove local duplicates
3. Test functionality
4. Commit changes

### Phase 3: Plugin Tools (Careful)

1. Update `memory-tools.ts` to use shared utilities
2. Update `task-tools.ts`
3. Test all plugin functionality
4. Update `index.ts` last

### Phase 4: Dashboard (Separate)

1. Create component files
2. Extract shared hooks
3. Add environment variable support
4. Test all panels

### Rollback Strategy

Each migration step:
1. Create backup of original file
2. Make changes
3. Run relevant tests
4. If failure, restore backup

---

## Appendix: File Inventory

### Plugin Files
- `.opencode/plugin/index.ts` (1,261 lines)
- `.opencode/plugin/tools/agent-tools.ts`
- `.opencode/plugin/tools/memory-tools.ts`
- `.opencode/plugin/tools/task-tools.ts`
- `.opencode/plugin/tools/quality-tools.ts`
- `.opencode/plugin/tools/user-message-tools.ts`
- `.opencode/plugin/tools/recovery-tools.ts`
- `.opencode/plugin/tools/git-tools.ts`

### CLI Tools (25 files)
- `opencode-cli.ts`
- `task-manager.ts`
- `critique-agent.ts`
- `generate-orchestrator-prompt.ts`
- `agent-conversation-viewer.ts`
- `daily-report-generator.ts`
- `terminal-dashboard.ts`
- `agent-performance-profiler.ts`
- `git-integration.ts`
- `working-memory-manager.ts`
- `message-bus-manager.ts`
- `session-analytics.ts`
- `conversation-tracker.ts`
- `opencode-tracker.ts`
- `realtime-monitor.ts`
- `system-message-config.ts`
- `knowledge-deduplicator.ts`
- `agent-health-monitor.ts`
- `multi-agent-coordinator.ts`
- `user-message.ts`
- `knowledge-extractor.ts`
- `task-router.ts`
- `quality-assessor.ts`
- `smart-memory-manager.ts`
- `session-summarizer.ts`

### Dashboard Files
- `dashboard-ui/src/App.tsx` (1,100+ lines)
- `dashboard-ui/server.ts`
- `dashboard-ui/src/main.tsx`

---

*End of Analysis*
