# Task: Replace ctx.$ shell commands with fs.appendFileSync

**Task ID**: `task_1767377976707_t4l4jk`  
**Priority**: medium  
**Status**: completed  
**Complexity**: simple  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: unassigned  
**Tags**: bug-fix, plugin, shell

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

**Additional Context**:
- [2026-01-02T18:21:42.437Z] Session 174: Starting fix - 5 instances of ctx.$ echo >> to replace with appendFileSync
- [2026-01-02T18:22:36.952Z] Fixed in commit ae87c93. Replaced 5 instances of ctx.$ echo >> with appendFileSync

## Goals

- Implement medium-priority feature to improve system
- Implement straightforward change with good test coverage
- Verify changes with tests and ensure no regressions

---

## Implementation Plan

**Phase 1: Analysis**
  - Review task requirements and acceptance criteria
  - Identify dependencies and related systems
  - Plan approach and document assumptions

**Phase 2: Implementation**
  - Implement primary changes
  - Write tests for new functionality
  - Handle edge cases and error scenarios

**Phase 3: Integration & Validation**
  - Integrate with existing systems
  - Run full test suite
  - Code review and address feedback

**Phase 4: Verification & Documentation**
  - Verify changes in target environment
  - Update documentation and comments
  - Create PR/commit with clear messages

---

## Success Criteria

[ ] Code changes are clean, well-commented, and follow style guide
[ ] All tests pass (unit, integration, e2e if applicable)
[ ] No regressions in existing functionality

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: task_1767377976707_t4l4jk
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-02T18:19:36.707Z | Task created |
| 2026-01-04T19:43:41.388Z | Spec generated |
