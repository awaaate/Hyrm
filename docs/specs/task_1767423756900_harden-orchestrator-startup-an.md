# Task: Harden orchestrator startup and watchdog behavior for single-leader model

**Task ID**: `task_1767423756900_wguutv`  
**Priority**: high  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 4 hours  
**Assigned To**: agent-1767433780257-wn6w5r  
**Tags**: orchestrator, leader-election, watchdog, startup

---

## Problem Statement

After the orchestrator leader election and stale-agent cleanup implementation (task_1767422728098_488s1n) lands, refine orchestrator startup and watchdog behavior so that new processes prefer reusing an existing healthy leader instead of spawning parallel orchestrators. Implement self-shutdown or idle behavior for non-leader orchestrators that start when a healthy leader lease exists, and tighten stale-orchestrator cleanup to minimize multi-leader windows, following Session 189 follow-up recommendation #4 in memory/working.md.

**Additional Context**:
- [2026-01-03T09:56:44.882Z] Implemented leader lease check in watchdog. Changes: 1) Added check_leader_lease() to verify fresh leader heartbeat before spawning, 2) Added 30s grace period on top of TTL, 3) Updated start_orchestrator to skip if healthy leader exists, 4) Updated main loop to check leader before respawn, 5) Enhanced orchestrator prompt with explicit leader-first checking protocol. Commit: 0b1d02e
- [2026-01-03T09:57:12.295Z] Hardened watchdog for single-leader model: Added check_leader_lease() function that checks orchestrator-state.json before spawning; skips respawn if leader heartbeat is fresh. Updated orchestrator prompt to emphasize leader-first checking. Commit: 0b1d02e

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
- Reference task ID in commits: task_1767423756900_wguutv
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-03T07:02:36.900Z | Task created |
| 2026-01-04T19:43:41.397Z | Spec generated |
