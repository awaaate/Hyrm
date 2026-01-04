# Task: Fix isPrimaryInstance() race condition

**Task ID**: `task_1767377656074_mk1m0r`  
**Priority**: high  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

---

## Problem Statement

Fix the race condition in isPrimaryInstance() function in .opencode/plugin/index.ts. 

The bug: 4 plugin instances are created simultaneously. They all read the lock file at the same time before any can write it, so all 4 believe they are primary.

Solution: Use INSTANCE_ID as a deterministic tiebreaker. Track all instance IDs in the lock file and only allow the lexicographically smallest ID to be primary. This eliminates the race condition.

Changes needed:
1. Modify isPrimaryInstance() to write INSTANCE_ID to lock file immediately
2. Add a short delay (50-100ms) before checking if this instance is primary
3. The instance with the smallest INSTANCE_ID among those written wins
4. Verify by running a tool call and checking realtime.log shows only 1 entry

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
| 2026-01-02T18:14:16.074Z | Task created |
| 2026-01-04T10:30:53.585Z | Spec generated |
