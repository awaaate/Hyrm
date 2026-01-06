# Task: Investigate and fix leader lease decay pattern (240-250s expiry)

**Task ID**: `task_1767718744256_z30xe8`  
**Priority**: critical  
**Status**: pending  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 2 hours  
**Assigned To**: unassigned  
**Tags**: heartbeat, leader-election, orchestrator, bug

---

## Problem Statement

CRITICAL: All orchestrator leader leases expire at ~240-250 seconds consistently despite background heartbeat service running. Investigation needed:

1. Verify heartbeat script is actually updating orchestrator-state.json (currently unclear)
2. Check if heartbeat service has the correct agent_id of current orchestrator
3. Confirm heartbeat loop is executing every 60s or if it's being interrupted
4. Verify file permissions on memory/orchestrator-state.json
5. Check if the issue is missing agent_id in heartbeat service startup

Pattern observed:
- Heartbeat service starts (PID 100192 at 16:58:11Z)
- Leader expires exactly 240-250s later (16:58:07 + 240s = 16:59:47Z expected ~17:04:07Z actual)
- Watchdog detects and respawns orchestrator
- New orchestrator takes over with fresh epoch
- Pattern repeats

This is the root cause of frequent orchestrator respawns (~2/hour instead of 0-1/hour target).

Success criteria:
- Leader lease remains valid for >180s (within TTL)
- No more stale leader warnings in realtime.log
- Orchestrator restarts drop to <1/hour

## Goals

- Resolve critical issue immediately to restore system stability
- Design and implement solution with appropriate abstraction
- Fix root cause and add regression test
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
- Reference task ID in commits: task_1767718744256_z30xe8
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-06T16:59:04.256Z | Task created |
| 2026-01-06T16:59:04.263Z | Spec generated |
