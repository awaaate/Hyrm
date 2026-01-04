# Task: Reorganize tools/ structure and auto-document CLIs for agent awareness

**Task ID**: `task_1767520395465_2o5xy7`  
**Priority**: critical  
**Status**: completed  
**Complexity**: complex  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 4 hours  
**Assigned To**: agent-1767521195249-9aan9  
**Tags**: critical, refactoring, documentation, developer-experience

---

## Problem Statement

Major reorganization of tools/ directory and auto-documentation system.

See full specification: docs/specs/task_1767520395465_tools-reorganization.md

Summary:
1. Reorganize tools/ into cli/, lib/, shared/
2. Consolidate 20+ files into 8 unified CLIs
3. Auto-generate documentation
4. Create skill file for agent awareness
5. Update all imports

Estimated: 3-4 hours across 7 phases

## Goals

- Resolve critical issue immediately to restore system stability
- Design comprehensive solution with proper error handling and documentation
- Verify changes with tests and ensure no regressions

---

## Implementation Plan

**Phase 1: Analysis**
  - Review task requirements and acceptance criteria
  - Identify dependencies and related systems
  - Plan approach and document assumptions

**Phase 2: Design & Specification**
  - Create detailed design document or architecture notes
  - Validate approach with team/orchestrator
  - Prepare for incremental implementation

**Phase 3: Implementation**
  - Implement primary changes
  - Write tests for new functionality
  - Handle edge cases and error scenarios

**Phase 4: Integration & Validation**
  - Integrate with existing systems
  - Run full test suite
  - Code review and address feedback

**Phase 5: Verification & Documentation**
  - Verify changes in target environment
  - Update documentation and comments
  - Create PR/commit with clear messages

---

## Success Criteria

[ ] Code changes are clean, well-commented, and follow style guide
[ ] All tests pass (unit, integration, e2e if applicable)
[ ] No regressions in existing functionality
[ ] Fix verified in production-like environment
[ ] Root cause documented
[ ] Design reviewed and approved
[ ] Performance benchmarked if applicable
[ ] Error handling and logging comprehensive

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: task_1767520395465_2o5xy7
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T09:53:15.465Z | Task created |
| 2026-01-04T19:43:41.414Z | Spec generated |
