# Task: Fix remaining empty catch blocks in task-router and agent-performance-profiler

**Task ID**: `task_1767450975777_nwtn6a`  
**Priority**: high  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: agent-sI3Oq6u4

---

## Problem Statement

Several empty catch blocks remain after the initial error handling cleanup. Fix empty catch blocks in: 1) tools/task-router.ts line 279 - registry load failure 2) tools/agent-performance-profiler.ts lines 196, 198 - silently swallowed errors. Add proper error logging using existing error-handler utilities.

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
| 2026-01-03T14:36:15.777Z | Task created |
| 2026-01-04T10:30:53.594Z | Spec generated |
