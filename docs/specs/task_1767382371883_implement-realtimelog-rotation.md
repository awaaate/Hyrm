# Task: Implement realtime.log rotation

**Task ID**: `task_1767382371883_89d3o6`  
**Priority**: medium  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 0.5  
**Assigned To**: unassigned

---

## Problem Statement

Add rotateRealtimeLog() function to working-memory-manager.ts to prevent realtime.log from growing indefinitely. Currently at 11MB/47k lines.

Implementation:
1. Add rotateRealtimeLog() function (similar to rotateSessionsJsonl)
2. Keep last 5000 lines
3. Archive older lines to memory/realtime-archives/
4. Add 'rotate-realtime' CLI command
5. Integrate into 'prune' command

Reference: rotateSessionsJsonl() at line 317 for pattern to follow.

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
| 2026-01-02T19:32:51.883Z | Task created |
| 2026-01-04T10:30:53.587Z | Spec generated |
