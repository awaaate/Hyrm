# Task: Compact message bus - remove excessive heartbeats

**Task ID**: `task_1767350442149_qnozk0`  
**Priority**: medium  
**Status**: completed  
**Complexity**: simple  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 1 hours  
**Assigned To**: agent-1767350313896-8mgpde  
**Tags**: optimization, memory

---

## Problem Statement

The message-bus.jsonl contains many heartbeat messages that clutter coordination. Create a scheduled cleanup that: 1) Keeps only latest heartbeat per agent, 2) Archives messages older than 1 hour, 3) Runs automatically on session start. Use tools/message-bus-manager.ts as foundation.

**Additional Context**:
- [2026-01-02T10:46:51.612Z] Reduced heartbeat spam: lowered thresholds in message-bus-manager, reduced heartbeat frequency to 60s, only send to message bus every 5 min. Result: 51% message reduction.

## Goals

- Implement medium-priority feature to improve system
- Implement straightforward change with good test coverage
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

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: task_1767350442149_qnozk0
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-02T10:40:42.149Z | Task created |
| 2026-01-04T19:43:41.373Z | Spec generated |
