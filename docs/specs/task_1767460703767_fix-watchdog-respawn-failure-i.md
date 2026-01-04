# Task: Fix watchdog respawn failure: invalid stdio option passed to spawn

**Task ID**: `task_1767460703767_6hiynl`  
**Priority**: high  
**Status**: cancelled  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

---

## Problem Statement

memory/realtime.log includes: ‘Failed to re-spawn orchestrator’ with TypeError [ERR_INVALID_ARG_TYPE]: stdio must be an array of 'inherit', 'ignore', or null. Find the watchdog respawn code path and correct spawn options (stdio/env/detached) so respawns never fail.

Success criteria:
- No stdio-related spawn exceptions
- Watchdog can successfully respawn orchestrator in a forced-kill test
- Add a small unit/integration check if test harness exists

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
| 2026-01-03T17:18:23.768Z | Task created |
| 2026-01-04T10:30:53.598Z | Spec generated |
