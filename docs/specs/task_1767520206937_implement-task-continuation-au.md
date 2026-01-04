# Task: Implement Task Continuation - auto-continue when session idle with pending tasks

**Task ID**: `task_1767520206937_xbfnbz`  
**Priority**: high  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 2  
**Assigned To**: agent-1767521220322-6ggubp

---

## Problem Statement

Auto-continue orchestrator when session goes idle but tasks are pending.

Implementation:
1. Modify handleSessionIdle in .opencode/plugin/index.ts
2. Before respawning, check memory/tasks.json for pending tasks
3. If pending tasks exist, customize respawn prompt to work on them
4. Optional: countdown toast (2s) for user cancellation

Reference: oh-my-opencode/src/hooks/todo-continuation-enforcer.ts
Simpler: check tasks.json and modify respawn prompt accordingly

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
| 2026-01-04T09:50:06.937Z | Task created |
| 2026-01-04T10:30:53.599Z | Spec generated |
