# Task: Investigate orchestrator leader-lease churn and frequent watchdog restarts

**Task ID**: `task_1767460703488_zvj1xx`  
**Priority**: critical  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: agent-1767460906093-ieg80k

---

## Problem Statement

Logs show repeated cycles where the orchestrator process exits and the leader lease expires ~55–60s later, triggering watchdog respawn. Root-cause the orchestrator exiting (shutdown signals / unhandled errors / idle lifecycle), ensure heartbeats reliably renew the lease before TTL, and align watchdog check interval with TTL.

Success criteria:
- Orchestrator remains running >30 minutes without watchdog respawn under idle load
- Lease is renewed continuously (no ‘lease expired’ warnings during normal operation)
- Add minimal diagnostic logging for shutdown reason and last heartbeat timestamp

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
| 2026-01-03T17:18:23.488Z | Task created |
| 2026-01-04T10:30:53.596Z | Spec generated |
