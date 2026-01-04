# Task: Improve agent registry auto-cleanup

**Task ID**: `task_1767449130409_uyousb`  
**Priority**: high  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: agent-1767449923682-u31sna  
**Tags**: agent-system, cleanup, user-request

---

## Problem Statement

Enhance the agent cleanup mechanism in agent-tools.ts and related files: 1) Make stale agent detection more aggressive 2) Clean up agents that haven't sent heartbeat in 2 minutes 3) Add periodic cleanup on orchestrator heartbeat 4) Consider adding a watchdog-style health check for agents.

**Additional Context**:
- [2026-01-03T14:26:08.302Z] Implemented: 1) Reduced stale threshold from 5min to 2min, 2) Added cleanupStaleAgents() method, 3) Added getAgentHealthStatus() for health monitoring, 4) Orchestrator heartbeat now runs cleanup automatically, 5) agent_status() tool runs cleanup on every call, 6) Added 'health' CLI command. Committed as 53c2cf9.

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
- Reference task ID in commits: task_1767449130409_uyousb
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-03T14:05:30.409Z | Task created |
| 2026-01-04T19:43:41.405Z | Spec generated |
