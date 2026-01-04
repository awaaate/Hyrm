# Task: Implement orchestrator leader election and stale-agent cleanup

**Task ID**: `task_1767422728098_488s1n`  
**Priority**: critical  
**Status**: completed  
**Complexity**: complex  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 4 hours  
**Assigned To**: agent-1767423576529-lc6l8  
**Tags**: orchestrator, multi-agent, leader-election

---

## Problem Statement

Implement the single-leader orchestrator model with heartbeat-based lease, leader epoch and fencing tokens, stale-orchestrator detection, and self-shutdown, based on the design from task_1767422564433_bk0h88. Integrate with agent_status, agent_set_handoff, and existing monitoring so that only one orchestrator acts as leader at a time while others stay idle or shut down safely.

**Additional Context**:
- [2026-01-03T06:45:49.780Z] Worker started; implementing orchestrator leader election + stale-agent cleanup.
- [2026-01-03T06:59:24.014Z] Requeued by orchestrator agent-1767423494522-3a1e0r because previous leader-impl-worker is no longer active in agent_status; ready for a fresh leader-impl-worker to claim.
- [2026-01-03T09:44:47.379Z] Leader election implementation completed by agent-1767424446228-4p78mk at commit ef10060. Implementation includes: MultiAgentCoordinator with leader lease management, orchestrator-state.json for durable leader tracking, isOrchestratorLeader() API, stale orchestrator detection, and plugin integration for leader-aware respawn.

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
- Reference task ID in commits: task_1767422728098_488s1n
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-03T06:45:28.098Z | Task created |
| 2026-01-04T19:43:41.395Z | Spec generated |
