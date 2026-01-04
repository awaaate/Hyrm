# Task: Harden orchestrator startup and watchdog behavior for single-leader model

**Task ID**: `task_1767423756900_wguutv`  
**Priority**: high  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 4  
**Assigned To**: agent-1767433780257-wn6w5r

---

## Problem Statement

After the orchestrator leader election and stale-agent cleanup implementation (task_1767422728098_488s1n) lands, refine orchestrator startup and watchdog behavior so that new processes prefer reusing an existing healthy leader instead of spawning parallel orchestrators. Implement self-shutdown or idle behavior for non-leader orchestrators that start when a healthy leader lease exists, and tighten stale-orchestrator cleanup to minimize multi-leader windows, following Session 189 follow-up recommendation #4 in memory/working.md.

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
| 2026-01-03T07:02:36.900Z | Task created |
| 2026-01-04T10:30:53.590Z | Spec generated |
