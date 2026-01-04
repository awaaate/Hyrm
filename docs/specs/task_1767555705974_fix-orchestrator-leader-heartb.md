# Task: Fix orchestrator leader heartbeat decay - decouple from session lifecycle

**Task ID**: `task_1767555705974_l7mqvy`  
**Priority**: critical  
**Status**: pending  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 2  
**Assigned To**: unassigned

---

## Problem Statement

Orchestrator sessions idle after 5-8 minutes even with handoff=false, killing the heartbeat interval timer and causing leader leases to expire. This causes unnecessary respawns every ~8 minutes. Root cause: heartbeat loop is tied to session context; when session idles, the interval timer is killed. Solution: Implement a background heartbeat mechanism that runs independently of session lifecycle. Options: (1) spawn background worker that heartbeats continuously, (2) use shell script loop in watchdog, (3) ensure orchestrator main loop prevents idle. Current impact: 5-6 respawns per hour instead of 0.

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
| 2026-01-04T19:41:45.974Z | Task created |
| 2026-01-04T19:41:45.978Z | Spec generated |
