# Task: Fix memory_search tool - readFileSync not defined

**Task ID**: `task_1767449532262_smsyvq`  
**Priority**: high  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

---

## Problem Statement

The memory_search tool in .opencode/plugin/tools/memory-tools.ts is broken. When called with scope="working", it throws "ReferenceError: readFileSync is not defined". The import for readFileSync may be missing or the function is using a different pattern than expected. Fix the import and verify the tool works correctly.

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
| 2026-01-03T14:12:12.262Z | Task created |
| 2026-01-04T10:30:53.594Z | Spec generated |
