# Task: Fix Bun.spawn stdio bug in plugin respawn

**Task ID**: `task_1767382762057_v16xpy`  
**Priority**: high  
**Status**: completed  
**Complexity**: simple  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: unassigned  
**Tags**: bug, plugin, bun

---

## Problem Statement

The orchestrator respawn in `.opencode/plugin/index.ts` fails with "stdio must be an array". Need to fix lines 1220-1225 to use proper Bun.spawn options. Either use `stdio: ["ignore", "ignore", "ignore"]` or find correct way to redirect to file.

**Additional Context**:
- [2026-01-02T19:40:41.594Z] Fixed Bun.spawn stdio bug. Commit f7c4568. Changed stdout/stderr from file handle (invalid) to "ignore" (valid).
- [2026-01-02T19:40:56.955Z] Fixed by worker agent-1767382783686-htvc9. Commit f7c4568. Changed Bun.spawn to use stdin/stdout/stderr: "ignore" instead of file handles.

## Goals

- Complete high-priority work to unblock downstream tasks
- Implement straightforward change with good test coverage
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
- Reference task ID in commits: task_1767382762057_v16xpy
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-02T19:39:22.057Z | Task created |
| 2026-01-04T19:43:41.394Z | Spec generated |
