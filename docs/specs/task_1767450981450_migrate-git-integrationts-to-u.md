# Task: Migrate git-integration.ts to use shared readJson utility

**Task ID**: `task_1767450981450_8a6g5u`  
**Priority**: medium  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: agent-sI3Oq6u4

---

## Problem Statement

git-integration.ts has 4 duplicated JSON.parse(readFileSync(...)) patterns for reading tasks.json. Replace with the centralized readJson() utility from tools/shared/json-utils.ts for consistency and better error handling.

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
| 2026-01-03T14:36:21.450Z | Task created |
| 2026-01-04T10:30:53.595Z | Spec generated |
