# Task: Replace ctx.$ shell commands with fs.appendFileSync

**Task ID**: `task_1767377976707_t4l4jk`  
**Priority**: medium  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

---

## Problem Statement

The plugin uses ctx.$ with echo >> file patterns which fail when JSON contains special characters like > or <. This causes "expected a command or assignment but got: Redirect" errors.

Replace all occurrences of:
  ctx.$`echo ${jsonStr} >> ${filePath}`.quiet()
with:
  appendFileSync(filePath, jsonStr + "\n")

Lines affected in .opencode/plugin/index.ts:
- Line 841
- Line 855
- Line 866
- Line 1181
- Line 1256
- Line 1284

Also check if ctx.$ is needed for other operations or if fs functions would be safer.

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
| 2026-01-02T18:19:36.707Z | Task created |
| 2026-01-04T10:30:53.585Z | Spec generated |
