# Task: Refactor cli.ts to use proper types

**Task ID**: `task_1767373927809_h02iuz`  
**Priority**: high  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

---

## Problem Statement

Replace 24 uses of `any` type in tools/cli.ts with proper types from shared/types.ts. This includes:
1. Replace readJson<any> with readJson<AgentRegistry>, readJson<TaskStore>, etc.
2. Replace (a: any) => patterns with proper typed callbacks
3. Import necessary types from ./shared/types
4. Ensure the file compiles without errors

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
| 2026-01-02T17:12:07.809Z | Task created |
| 2026-01-04T10:30:53.583Z | Spec generated |
