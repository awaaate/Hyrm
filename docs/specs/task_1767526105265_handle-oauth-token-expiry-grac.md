# Task: Handle OAuth token expiry gracefully

**Task ID**: `task_1767526105265_4tm7gp`  
**Priority**: medium  
**Status**: cancelled  
**Complexity**: unknown  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: unassigned  
**Tags**: spawned, general

---

## Problem Statement

You are implementing task_1767525714221_5831f3 in /app/workspace (bun runtime). Goal: detect API auth failures where error is APIError 401 with message containing "OAuth token has expired" (see memory/realtime.log line ~7269). Implement guardrails so the orchestrator/plugin/watchdog does not enter restart loops on this auth failure.

Requirements:
1) Add a classifier util (or reuse existing patterns) to detect expired OAuth/authentication errors from caught exceptions (APIError with statusCode==...

**Additional Context**:
- [2026-01-04T15:56:43.549Z] Cancelled as obsolete per user priority signal umsg_1767541963707_8hvdii.

## Goals

- Implement medium-priority feature to improve system
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
- Reference task ID in commits: task_1767526105265_4tm7gp
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T11:28:25.265Z | Task created |
| 2026-01-04T19:43:41.418Z | Spec generated |
