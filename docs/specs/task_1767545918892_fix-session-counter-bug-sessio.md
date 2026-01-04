# Task: Fix session counter bug - session.created events not firing

**Task ID**: `task_1767545918892_x1ci6e`  
**Priority**: critical  
**Status**: pending  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

---

## Problem Statement

**Problem**: Session count stuck at 177 since Jan 3. Plugin's handleSessionCreated() not called since then.

**Root Cause**: OpenCode session.created events are not firing for orchestrator respawn sessions. Last session.created was Jan 3 10:07:32 (Session 177). Since then, dozens of orchestrator sessions ran but none triggered the event.

**Evidence**:
- realtime.log shows session.status and session.idle events but NO session.created events since Jan 3
- sessions.jsonl has session_start entries but state.json never updated
- Plugin instances are being created but handleSessionCreated() never called

**Potential causes**:
1. OpenCode CLI changed event firing behavior
2. Sessions created via `opencode run` don't fire session.created
3. Bug in OpenCode event dispatcher

**Fix Options**:
1. SHORT-TERM: Add fallback detection in plugin - if session.status fires but sessionBootRan is false, treat as new session
2. LONG-TERM: Investigate why OpenCode isn't firing session.created for spawned sessions
3. ALTERNATIVE: Track session IDs and detect new session by comparing currentSessionId !== event.sessionID

**Implementation**:
Modify plugin event handler to detect new sessions even without session.created event.

## Goals

- TODO: Define goals

---

## Implementation Plan

- TODO: Add implementation phases

---

## Technical Details

- TODO: Add technical notes

---

## Success Criteria

- [ ] TODO: Define success criteria

---

## Notes

- TODO: Add links and context

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T16:58:38.892Z | Task created |
| 2026-01-04T16:58:38.897Z | Spec generated |
