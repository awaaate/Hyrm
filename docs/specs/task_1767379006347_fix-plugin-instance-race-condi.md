# Task: Fix plugin instance race condition with directory-based locking

**Task ID**: `task_1767379006347_zrm7k0`  
**Priority**: critical  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

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
| 2026-01-02T18:36:46.350Z | Task created |
| 2026-01-04T10:30:53.586Z | Spec generated |
