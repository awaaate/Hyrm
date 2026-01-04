# Task: Fix watchdog prompt-generator failures and fallback behavior

**Task ID**: `task_1767548025724_8b49mn`  
**Priority**: high  
**Status**: pending  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

---

## Problem Statement

logs/watchdog.log shows `Warning: prompt-generator.ts failed, using fallback prompt` (2026-01-04). Investigate `tools/lib/prompt-generator.ts` invocation from `orchestrator-watchdog.sh` / `spawn-worker.sh`, capture stderr/exit code in logs, and fix underlying failure so watchdog uses generated prompt reliably.

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
| 2026-01-04T17:33:45.724Z | Task created |
| 2026-01-04T17:33:45.725Z | Spec generated |
