# Task: Investigate orchestrator leader-lease churn and frequent watchdog restarts

**Task ID**: `task_1767460703488_zvj1xx`  
**Priority**: critical  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: agent-1767460906093-ieg80k  
**Tags**: orchestrator, watchdog, stability, leader-election

---

## Problem Statement

Logs show repeated cycles where the orchestrator process exits and the leader lease expires ~55–60s later, triggering watchdog respawn. Root-cause the orchestrator exiting (shutdown signals / unhandled errors / idle lifecycle), ensure heartbeats reliably renew the lease before TTL, and align watchdog check interval with TTL.

Success criteria:
- Orchestrator remains running >30 minutes without watchdog respawn under idle load
- Lease is renewed continuously (no ‘lease expired’ warnings during normal operation)
- Add minimal diagnostic logging for shutdown reason and last heartbeat timestamp

**Additional Context**:
- [2026-01-04] Fixed in commit 174d07e - added releaseLeaderLease() to prevent infinite spawn loop

## Goals

- Resolve critical issue immediately to restore system stability
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
[ ] Fix verified in production-like environment
[ ] Root cause documented

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: task_1767460703488_zvj1xx
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-03T17:18:23.488Z | Task created |
| 2026-01-04T19:43:41.409Z | Spec generated |
