# Task: Refactor cli.ts to use proper types

**Task ID**: `task_1767373927809_h02iuz`  
**Priority**: high  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: unassigned  
**Tags**: type-safety, refactor, cli

---

## Problem Statement

Replace 24 uses of `any` type in tools/cli.ts with proper types from shared/types.ts. This includes:
1. Replace readJson<any> with readJson<AgentRegistry>, readJson<TaskStore>, etc.
2. Replace (a: any) => patterns with proper typed callbacks
3. Import necessary types from ./shared/types
4. Ensure the file compiles without errors

**Additional Context**:
- [2026-01-02T17:17:36.948Z] Worker agent-1767373949009-b5hbe completed the refactoring. cli.ts now uses proper types from shared/types.ts instead of any. Changes: +87/-55 lines. All 24 any usages replaced with proper types (Agent, Task, Message, UserMessage, etc). CLI tested and working correctly.

## Goals

- Complete high-priority work to unblock downstream tasks
- Design and implement solution with appropriate abstraction
- Improve code quality, maintainability, or performance
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
[ ] Feature complete and tested
[ ] Documentation updated

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: task_1767373927809_h02iuz
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-02T17:12:07.809Z | Task created |
| 2026-01-04T19:43:41.384Z | Spec generated |
