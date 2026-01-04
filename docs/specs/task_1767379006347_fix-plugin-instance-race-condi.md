# Task: Fix plugin instance race condition with directory-based locking

**Task ID**: `task_1767379006347_zrm7k0`  
**Priority**: critical  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: unassigned  
**Tags**: bug, plugin, race-condition

---

## Problem Statement

The current isPrimaryInstance() fix still has a race condition. The problem:
1. All 4 plugin instances call registerInstance() simultaneously
2. They all read the lock file at the same time (empty or old data)
3. Each adds only its own ID and writes back
4. Last writer wins, overwriting others
5. After election delay, each sees only 1-2 instances and thinks it's primary

Solution: Use directory-based locking instead of JSON file:
1. Create memory/.plugin-instances/ directory
2. Each instance creates its own file: memory/.plugin-instances/{INSTANCE_ID}.lock
3. File creation is atomic - no race condition
4. electPrimary() reads all files in directory, picks alphabetically smallest ID
5. Cleanup: Delete files older than LOCK_STALE_THRESHOLD

Changes needed in .opencode/plugin/index.ts:
- Replace registerInstance() to create individual file
- Replace electPrimary() to read directory
- Replace refreshLock() to touch file timestamp
- Add cleanup of stale files

This is a HIGH priority bug that causes 4x log duplication.

**Additional Context**:
- [2026-01-02T18:38:31.325Z] Implemented directory-based locking. Each plugin instance now creates its own file in memory/.plugin-instances/{INSTANCE_ID}.lock. This is atomic and prevents race conditions. The smallest INSTANCE_ID alphabetically wins the election after 150ms delay.

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
- Reference task ID in commits: task_1767379006347_zrm7k0
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-02T18:36:46.350Z | Task created |
| 2026-01-04T19:43:41.390Z | Spec generated |
