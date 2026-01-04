# Task: Fix plugin ReferenceError breaking session.created events

**Task ID**: `task_1767548025490_5nmykl`  
**Priority**: critical  
**Status**: pending  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

---

## Problem Statement

memory/realtime.log shows repeated `Plugin error: ReferenceError: bufferedSessionCreatedEvent is not defined` around 2026-01-04T17:21Z. This likely prevents session.created hook from running, explaining session.created events not firing since Jan 3rd and session_count stuck. Root-cause: undefined variable in `.opencode/plugin/index.ts` or related module; ensure buffered event storage is defined, initialized, and referenced safely; add guard rails + log once to avoid spam; verify session.created updates state + sessions.jsonl.

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
| 2026-01-04T17:33:45.490Z | Task created |
| 2026-01-04T17:33:45.498Z | Spec generated |
