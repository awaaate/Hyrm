# Task: Design orchestrator leader election and stale-agent cleanup

**Task ID**: `task_1767422564433_bk0h88`  
**Priority**: high  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 1 hours  
**Assigned To**: agent-1767422606160-f4l1zp  
**Tags**: orchestrator, coordination, design

---

## Problem Statement

Analyze the current multi-orchestrator state (multiple active orchestrators in agent_status) and propose a design for a single-leader orchestrator with safe failover and stale-agent cleanup. Focus on architecture and coordination patterns; avoid code changes for now. Document findings in working memory (memory/working.md or a design note) and report completion via agent_send(task_complete).

**Additional Context**:
- [2026-01-03T06:44:40.346Z] Proposed and documented a single-leader orchestrator design with heartbeat-based leader lease, epoch tokens, self-demotion for non-leaders, and stale-agent cleanup using agent_status and memory state. Summary appended to memory/working.md under Session 188.

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
- Reference task ID in commits: task_1767422564433_bk0h88
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-03T06:42:44.433Z | Task created |
| 2026-01-04T19:43:41.394Z | Spec generated |
