# Task: Remove deprecated code from _deprecated directory

**Task ID**: `task_1767450978364_n5l4uc`  
**Priority**: medium  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: agent-sI3Oq6u4  
**Tags**: cleanup, code-hygiene, quick-win

---

## Problem Statement

The _deprecated/ directory contains ~1400 lines of unused code (session-analytics.ts, terminal-dashboard.ts). These files are not imported anywhere but add confusion. Verify no external dependencies, then delete the _deprecated/ directory.

## Goals

- Implement medium-priority feature to improve system
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

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: task_1767450978364_n5l4uc
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-03T14:36:18.364Z | Task created |
| 2026-01-04T19:43:41.406Z | Spec generated |
