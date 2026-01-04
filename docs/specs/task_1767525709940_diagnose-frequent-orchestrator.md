# Task: Diagnose frequent orchestrator restarts and silent start failures

**Task ID**: `task_1767525709940_qa99je`  
**Priority**: critical  
**Status**: cancelled  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 6 hours  
**Assigned To**: unassigned  
**Tags**: stability, watchdog, orchestrator, logging

---

## Problem Statement

watchdog.log shows many restarts and repeated "Orchestrator failed to start!" without a root-cause message. Improve watchdog/orchestrator startup diagnostics: capture exit code + stderr, persist last failure reason, and distinguish intentional shutdown vs crash. Goal: reduce restart churn and make failures actionable.

**Additional Context**:
- [2026-01-04T15:56:41.715Z] Cancelled as obsolete per user priority signal umsg_1767541963707_8hvdii.

## Goals

- Resolve critical issue immediately to restore system stability
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
[ ] Fix verified in production-like environment
[ ] Root cause documented

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: task_1767525709940_qa99je
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T11:21:49.940Z | Task created |
| 2026-01-04T19:43:41.416Z | Spec generated |
