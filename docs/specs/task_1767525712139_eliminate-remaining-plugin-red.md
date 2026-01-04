# Task: Eliminate remaining plugin Redirect parse errors from shell usage

**Task ID**: `task_1767525712139_ng89qv`  
**Priority**: high  
**Status**: pending  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 4  
**Assigned To**: unassigned

---

## Problem Statement

memory/realtime.log repeatedly shows: "Plugin error: expected a command or assignment but got: Redirect" even after prior fixes. Audit plugin/tool code for remaining ctx.$ usage with shell redirects or other unsupported syntax; replace with fs-based helpers (readJson/writeJsonSafe) and add a regression check (grep-based or unit test).

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
| 2026-01-04T11:21:52.140Z | Task created |
| 2026-01-04T11:21:52.142Z | Spec generated |
