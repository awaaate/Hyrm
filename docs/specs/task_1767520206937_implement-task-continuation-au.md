# Task: Implement Task Continuation - auto-continue when session idle with pending tasks

**Task ID**: `task_1767520206937_xbfnbz`  
**Priority**: high  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 2 hours  
**Assigned To**: agent-1767521220322-6ggubp  
**Tags**: enhancement, plugin, autonomy

---

## Problem Statement

Auto-continue orchestrator when session goes idle but tasks are pending.

Implementation:
1. Modify handleSessionIdle in .opencode/plugin/index.ts
2. Before respawning, check memory/tasks.json for pending tasks
3. If pending tasks exist, customize respawn prompt to work on them
4. Optional: countdown toast (2s) for user cancellation

Reference: oh-my-opencode/src/hooks/todo-continuation-enforcer.ts
Simpler: check tasks.json and modify respawn prompt accordingly

**Additional Context**:
- [2026-01-04T10:08:47.501Z] Implemented Task Continuation system in .opencode/plugin/index.ts handleSessionIdle function. Features: 1) Detects when non-orchestrator sessions go idle with pending tasks, 2) Auto-spawns code-worker to claim and work on next priority task, 3) Rate limiting: max 1 continuation every 5 minutes (stored in .last-task-continuation.json), 4) Only triggers for normal worker sessions (orchestrator handles its own continuation), 5) Logs all continuation events to realtime.log. Worker spawned with proper prompt including task details and completion instructions.

## Goals

- Complete high-priority work to unblock downstream tasks
- Design and implement solution with appropriate abstraction
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
[ ] Feature complete and tested
[ ] Documentation updated

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: task_1767520206937_xbfnbz
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T09:50:06.937Z | Task created |
| 2026-01-04T19:43:41.413Z | Spec generated |
