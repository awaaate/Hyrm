# Task: Auto-create GitHub issue for every new task, branch on demand

**Task ID**: `task_1767520273725_sckp83`  
**Priority**: critical  
**Status**: completed  
**Complexity**: simple  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 1 hours  
**Assigned To**: agent-1767521187231-phkqg  
**Tags**: critical, github, automation, task-manager

---

## Problem Statement

Automatically create a GitHub issue when any task is created in the system.

Implementation:
1. Modify task-manager.ts create() method
2. After saving task to tasks.json, call createGitHubIssue(taskId)
3. Store the issue URL/number in the task object
4. Add optional flag --branch to also create a git branch
5. Branch naming: task/<task_id_short>-<slugified-title>

Benefits:
- All work is tracked in GitHub
- Easy to link PRs to tasks
- Better visibility for external contributors
- Enables GitHub project boards integration

Existing code:
- gh:issue command already exists in task-manager.ts
- gh:branch command already exists
- Just need to auto-trigger on create()

## Goals

- Resolve critical issue immediately to restore system stability
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
[ ] Fix verified in production-like environment
[ ] Root cause documented

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: task_1767520273725_sckp83
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T09:51:13.726Z | Task created |
| 2026-01-04T19:43:41.413Z | Spec generated |
