# Task: Auto-create GitHub issue for every new task, branch on demand

**Task ID**: `task_1767520273725_sckp83`  
**Priority**: critical  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 1  
**Assigned To**: agent-1767521187231-phkqg

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

- TODO: Define goals

---

## Implementation Plan

- TODO: Add implementation phases

---

## Technical Details

- TODO: Add technical notes

---

## Success Criteria

- [ ] TODO: Define success criteria

---

## Notes

- TODO: Add links and context

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T09:51:13.726Z | Task created |
| 2026-01-04T10:30:53.600Z | Spec generated |
