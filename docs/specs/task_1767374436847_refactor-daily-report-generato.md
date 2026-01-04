# Task: Refactor daily-report-generator.ts types

**Task ID**: `task_1767374436847_0l6k9v`  
**Priority**: high  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

---

## Problem Statement

Replace all 25 uses of `any` in daily-report-generator.ts with proper types from shared/types.ts. Key changes:
1. Replace `readJson<any>` with typed versions (AgentRegistry, TaskStore, QualityStore)
2. Replace `readJsonl<any>` with typed versions (SessionEvent, Message, ToolTiming)
3. Replace callback `(x: any) =>` with proper types
4. Verify compilation with `bun build`

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
| 2026-01-02T17:20:36.847Z | Task created |
| 2026-01-04T10:30:53.583Z | Spec generated |
