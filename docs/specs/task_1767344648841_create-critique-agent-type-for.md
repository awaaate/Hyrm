# Task: Create critique agent type for code review and debugging

**Task ID**: `task_1767344648841_8si6qk`  
**Priority**: high  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: agent-1767343905998-p10btt  
**Tags**: agents, code-review, quality

---

## Problem Statement

Create a new agent type that critiques everything by writing markdown files. Functions: 1) Code review with detailed feedback 2) Output analysis and debugging 3) System critique and improvement suggestions 4) Quality gate for completed tasks. Files stored in memory/critiques/

**Additional Context**:
- [2026-01-02T09:14:32.576Z] Created critique agent with 9 commands (code, output, task, system, review, list, view, summary, help). Analyzes security, quality, performance, and style issues. Created skill file at .opencode/skill/critique-agent/SKILL.md. Integrated with opencode-cli.ts via 'critique'/'review'/'cr' commands. Critiques saved as markdown in memory/critiques/.

## Goals

- Complete high-priority work to unblock downstream tasks
- Design and implement solution with appropriate abstraction
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
- Reference task ID in commits: task_1767344648841_8si6qk
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-02T09:04:08.841Z | Task created |
| 2026-01-04T19:43:41.365Z | Spec generated |
