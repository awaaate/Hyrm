# Task: Handle expired OAuth/API tokens gracefully (avoid crash/restart loops)

**Task ID**: `task_1767460707507_q5bin1`  
**Priority**: medium  
**Status**: pending  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

---

## Problem Statement

memory/realtime.log shows session.error with 401 ‘OAuth token has expired’. Add a guardrail: detect auth failures, mark system status as blocked/degraded, pause expensive loops, and emit a clear operator action message (refresh token) instead of cascading failures.

Success criteria:
- On 401, orchestrator remains healthy and stops retry storms
- A single clear error status is recorded (state + logs) with recovery steps

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
| 2026-01-03T17:18:27.507Z | Task created |
| 2026-01-04T10:30:53.598Z | Spec generated |
