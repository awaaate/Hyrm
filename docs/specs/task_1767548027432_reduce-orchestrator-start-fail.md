# Task: Reduce orchestrator start failures observed in watchdog.log

**Task ID**: `task_1767548027432_dsoaar`  
**Priority**: high  
**Status**: pending  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

---

## Problem Statement

logs/watchdog.log contains repeated `[ERROR] Orchestrator failed to start!` and restart storms (including too many restarts/hour). After fixing plugin/prompt issues, harden watchdog startup diagnostics: include last N lines of orchestrator stderr, surface exit codes, and add backoff/jitter to prevent restart thundering-herd.

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
| 2026-01-04T17:33:47.432Z | Task created |
| 2026-01-04T17:33:47.437Z | Spec generated |
