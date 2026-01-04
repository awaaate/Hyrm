# Task: Fix orchestrator respawn failure: invalid stdio argument type

**Task ID**: `task_1767525710136_6d0n07`  
**Priority**: high  
**Status**: pending  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 3  
**Assigned To**: unassigned

---

## Problem Statement

memory/realtime.log reports: "Failed to re-spawn orchestrator" with TypeError [ERR_INVALID_ARG_TYPE]: "stdio must be an array of 'inherit', 'ignore', or null". Locate respawn code path and correct child_process spawn options (stdio) and add a small regression test or runtime guard.

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
| 2026-01-04T11:21:50.136Z | Task created |
| 2026-01-04T11:21:50.138Z | Spec generated |
