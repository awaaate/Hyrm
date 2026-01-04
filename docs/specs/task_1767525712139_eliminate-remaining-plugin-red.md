# Task: Eliminate remaining plugin Redirect parse errors from shell usage

**Task ID**: `task_1767525712139_ng89qv`  
**Priority**: high  
**Status**: cancelled  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 4 hours  
**Assigned To**: unassigned  
**Tags**: bug, plugin, shell, fs

---

## Problem Statement

memory/realtime.log repeatedly shows: "Plugin error: expected a command or assignment but got: Redirect" even after prior fixes. Audit plugin/tool code for remaining ctx.$ usage with shell redirects or other unsupported syntax; replace with fs-based helpers (readJson/writeJsonSafe) and add a regression check (grep-based or unit test).

**Additional Context**:
- [2026-01-04T15:56:42.652Z] Cancelled as obsolete per user priority signal umsg_1767541963707_8hvdii.

## Goals

- Complete high-priority work to unblock downstream tasks
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
[ ] Feature complete and tested
[ ] Documentation updated

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: task_1767525712139_ng89qv
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T11:21:52.140Z | Task created |
| 2026-01-04T19:43:41.417Z | Spec generated |
