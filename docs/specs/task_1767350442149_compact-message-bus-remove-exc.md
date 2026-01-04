# Task: Compact message bus - remove excessive heartbeats

**Task ID**: `task_1767350442149_qnozk0`  
**Priority**: medium  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 1  
**Assigned To**: agent-1767350313896-8mgpde

---

## Problem Statement

The message-bus.jsonl contains many heartbeat messages that clutter coordination. Create a scheduled cleanup that: 1) Keeps only latest heartbeat per agent, 2) Archives messages older than 1 hour, 3) Runs automatically on session start. Use tools/message-bus-manager.ts as foundation.

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
| 2026-01-02T10:40:42.149Z | Task created |
| 2026-01-04T10:30:53.577Z | Spec generated |
