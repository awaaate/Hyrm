# Task: Fix watchdog respawn failure: invalid stdio option passed to spawn

**Task ID**: `task_1767460703767_6hiynl`  
**Priority**: high  
**Status**: cancelled  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: unassigned  
**Tags**: watchdog, bug, respawn

---

## Problem Statement

memory/realtime.log includes: ‘Failed to re-spawn orchestrator’ with TypeError [ERR_INVALID_ARG_TYPE]: stdio must be an array of 'inherit', 'ignore', or null. Find the watchdog respawn code path and correct spawn options (stdio/env/detached) so respawns never fail.

Success criteria:
- No stdio-related spawn exceptions
- Watchdog can successfully respawn orchestrator in a forced-kill test
- Add a small unit/integration check if test harness exists

**Additional Context**:
- [2026-01-04] Cancelled - agent died. Issue not reproducible after leader-lease fix. Reopen if needed.

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
- Reference task ID in commits: task_1767460703767_6hiynl
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-03T17:18:23.768Z | Task created |
| 2026-01-04T19:43:41.409Z | Spec generated |
