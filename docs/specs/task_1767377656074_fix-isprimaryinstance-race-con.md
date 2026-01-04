# Task: Fix isPrimaryInstance() race condition

**Task ID**: `task_1767377656074_mk1m0r`  
**Priority**: high  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: unassigned  
**Tags**: bug-fix, plugin, race-condition

---

## Problem Statement

Fix the race condition in isPrimaryInstance() function in .opencode/plugin/index.ts. 

The bug: 4 plugin instances are created simultaneously. They all read the lock file at the same time before any can write it, so all 4 believe they are primary.

Solution: Use INSTANCE_ID as a deterministic tiebreaker. Track all instance IDs in the lock file and only allow the lexicographically smallest ID to be primary. This eliminates the race condition.

Changes needed:
1. Modify isPrimaryInstance() to write INSTANCE_ID to lock file immediately
2. Add a short delay (50-100ms) before checking if this instance is primary
3. The instance with the smallest INSTANCE_ID among those written wins
4. Verify by running a tool call and checking realtime.log shows only 1 entry

**Additional Context**:
- [2026-01-02T18:17:27.536Z] Fixed with commit 90a5f78. New approach: list-based registration with 150ms election delay, smallest ID wins. Lock file cleared for new format to take effect.

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
- Reference task ID in commits: task_1767377656074_mk1m0r
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-02T18:14:16.074Z | Task created |
| 2026-01-04T19:43:41.388Z | Spec generated |
