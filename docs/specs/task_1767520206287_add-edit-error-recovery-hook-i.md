# Task: Add Edit Error Recovery hook - inject reminder when Edit fails with oldString errors

**Task ID**: `task_1767520206287_6bpixl`  
**Priority**: high  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 0.5  
**Assigned To**: agent-1767521213362-l0kg5y

---

## Problem Statement

Add error recovery for Edit tool failures in plugin.

Implementation:
1. In tool.execute.after hook (.opencode/plugin/index.ts)
2. Detect errors: oldString not found, found multiple times, must be different
3. Append reminder: [EDIT ERROR] Read the file first before retrying

Reference: oh-my-opencode/src/hooks/edit-error-recovery/index.ts
Simple: if (tool===edit && hasError) output.output += reminder

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
| 2026-01-04T09:50:06.287Z | Task created |
| 2026-01-04T10:30:53.599Z | Spec generated |
