# Working Memory

## Session 138 - HANDOFF (2026-01-02)

**Status**: User requested stop after task completion
**Agent ID**: agent-1767358223781-o4sn3
**Commits**: 9f5c722

### CRITICAL: FOR NEXT AGENT

**YOU ARE A NEW INSTANCE**. The previous agent is gone. This file contains everything you need to continue.

**User Feedback (IMPORTANT)**:
> "update the watchdog script with telling in the prompt that you must never work on implementing this, but create agents and put them to work. create those agents always using the terminal. and stop your current session. also remove the backoff strategy. the aim is not having a large conversation in the orchestrator rather a short and orchestrative"

The user wants SHORT ORCHESTRATION sessions. The orchestrator should:
1. Check for user messages and pending tasks
2. Spawn workers via `opencode run` in the terminal
3. Exit quickly - let the watchdog restart

**Watchdog Updated**: 
- Backoff strategy DISABLED (short sessions desired)
- MAX_RESTARTS increased to 50/hour
- Prompt now tells orchestrator to spawn workers, not implement

---

## What Was Done This Session

### 1. Token Usage Tracking (Main Task)
- **Types added**: `SessionTokens`, `TokenTrend` in types.ts
- **Data functions**: `extractSessionTokens`, `getSessionTokens`, `getTokenTrends`, `getTotalTokenUsage` in data.ts
- **New view**: 'tokens' view mode (key 7) in terminal dashboard
- **Token data**: input, output, reasoning, cache_read, cache_write
- **Sessions view**: Now shows token count per session
- **Commit**: 9f5c722 - Add token usage tracking to terminal-dashboard CLI

### 2. Watchdog Script Updated
- Disabled backoff strategy (RESTART_BACKOFF_ENABLED=false)
- Increased MAX_RESTARTS to 50/hour
- Updated prompt to tell orchestrator to spawn workers, not implement
- Emphasis on short orchestration sessions

---

## Current System State

### Pending Tasks: 0
All tasks completed.

### Active Agents: 4
Multiple general agents registered.

### Recent Achievements
1. Session 138: Token usage tracking in terminal-dashboard CLI (8.3/10)
2. Session 127: Refactored terminal-dashboard, fixed OpenCode session paths
3. Session 126: Dashboard UI improvements (8.1/10 avg quality)

---

## Terminal Dashboard - Token View

The new tokens view (key 7) shows:
- Today's vs total token usage
- Breakdown: input, output, reasoning, cache
- Per-session token counts
- Cache efficiency calculation

---

## Key Files to Know

### Tools (24 total in /app/workspace/tools/)
- `opencode-cli.ts` - Unified CLI (status, agents, tasks)
- `opencode-tracker.ts` - PRIMARY for OpenCode session tracking
- `debug-capture.ts` - Save terminal outputs
- `task-manager.ts` - Task CRUD
- `realtime-monitor.ts` - Live dashboard

### Terminal Dashboard (/app/workspace/terminal-dashboard/)
- `index.ts` - Main entry (now with tokens view)
- `data.ts` - Data loading + token extraction
- `renders.ts` - Render functions + renderTokensContent
- `types.ts` - TypeScript types + SessionTokens

---

## Commands for Next Agent

```bash
# System status
bun tools/opencode-cli.ts status
bun tools/opencode-cli.ts agents
bun tools/opencode-cli.ts tasks

# Terminal dashboard (key 7 for tokens view)
bun terminal-dashboard/index.ts

# Spawn a worker
opencode run "You are a WORKER. Register as worker. Task: [X]. Report via agent_send."
```

---

## ORCHESTRATOR ROLE (Updated)

The orchestrator should:
1. **NOT implement tasks** - just coordinate
2. **Spawn workers** via `opencode run` in terminal
3. **Keep sessions short** - under 5 minutes
4. **Exit after spawning** - let watchdog restart

---

## Session History

- Session 138: Token tracking, watchdog updates (this session)
- Session 127: Dashboard refactoring, debug tools, cleanup
- Session 126: Dashboard UI improvements, recharts
- Session 122: OpenCode learnings, task_spawn, custom agents
