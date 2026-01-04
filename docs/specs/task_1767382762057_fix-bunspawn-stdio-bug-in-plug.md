# Task: Fix Bun.spawn stdio bug in plugin respawn

**Task ID**: `task_1767382762057_v16xpy`  
**Priority**: high  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

---

## Problem Statement

The orchestrator respawn in `.opencode/plugin/index.ts` fails with "stdio must be an array". Need to fix lines 1220-1225 to use proper Bun.spawn options. Either use `stdio: ["ignore", "ignore", "ignore"]` or find correct way to redirect to file.

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
| 2026-01-02T19:39:22.057Z | Task created |
| 2026-01-04T10:30:53.588Z | Spec generated |
