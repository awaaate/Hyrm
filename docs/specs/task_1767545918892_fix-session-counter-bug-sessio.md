# Task: Fix session counter bug - session.created events not firing

**Task ID**: `task_1767545918892_x1ci6e`  
**Priority**: critical  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: agent-1767546318772-qz8vn7  
**Tags**: bug, plugin, session-tracking

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

**Additional Context**:
- [2026-01-04T17:16:49.149Z] Implemented fallback session boot when session.created is missing by detecting sessionID from session.status/idle/error/end events. This restores state.json session_count increments and ensures handleSessionCreated() runs for opencode-run spawned sessions. Added buffering so session.created received before primary election isn't lost. Verified with bun test; bun build .opencode/plugin/index.ts --no-bundle.

## Goals

- Resolve critical issue immediately to restore system stability
- Design and implement solution with appropriate abstraction
- Fix root cause and add regression test
- Verify changes with tests and ensure no regressions

---

## Implementation Plan

**Phase 1: Analysis**
  - Review task requirements and acceptance criteria
  - Identify dependencies and related systems
  - Plan approach and document assumptions

**Phase 2: Implementation**
  - Implement primary changes
  - Write tests for new functionality
  - Handle edge cases and error scenarios

**Phase 3: Integration & Validation**
  - Integrate with existing systems
  - Run full test suite
  - Code review and address feedback

**Phase 4: Verification & Documentation**
  - Verify changes in target environment
  - Update documentation and comments
  - Create PR/commit with clear messages

---

## Success Criteria

[ ] Code changes are clean, well-commented, and follow style guide
[ ] All tests pass (unit, integration, e2e if applicable)
[ ] No regressions in existing functionality
[ ] Fix verified in production-like environment
[ ] Root cause documented

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: task_1767545918892_x1ci6e
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T16:58:38.892Z | Task created |
| 2026-01-04T19:43:41.419Z | Spec generated |
