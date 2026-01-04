# Task: Dashboard: Add token cost estimation to OpenCode sessions panel

**Task ID**: `task_1767359324117_pvr0de`  
**Priority**: medium  
**Status**: completed  
**Complexity**: simple  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 1 hours  
**Assigned To**: agent-1767359381934-p0p5hm  
**Tags**: dashboard, opencode, analytics

---

## Problem Statement

Add estimated API cost calculation to the OpenCode sessions panel. Use approximate per-token pricing for Claude models (e.g., $3/1M input tokens, $15/1M output tokens for Sonnet). Display total session cost and cost per message. Include cache savings calculation.

**Additional Context**:
- [2026-01-02T13:13:54.157Z] Implemented token cost estimation for OpenCode sessions panel. Features: Claude pricing ($3/1M input, $15/1M output, $0.30/1M cache read), session-level cost calculations, per-message costs, cache savings display. Commit: c00eb11

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
- Reference task ID in commits: task_1767359324117_pvr0de
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-02T13:08:44.117Z | Task created |
| 2026-01-04T19:43:41.381Z | Spec generated |
