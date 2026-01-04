# Task: Fix orchestrator leader heartbeat decay - decouple from session lifecycle

**Task ID**: `task_1767555705974_l7mqvy`  
**Priority**: critical  
**Status**: pending  
**Complexity**: complex  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 2 hours  
**Assigned To**: unassigned  
**Tags**: orchestrator, heartbeat, leader-election, critical

---

## Problem Statement

Orchestrator sessions idle after 5-8 minutes even with handoff=false, killing the heartbeat interval timer and causing leader leases to expire. This causes unnecessary respawns every ~8 minutes. Root cause: heartbeat loop is tied to session context; when session idles, the interval timer is killed. Solution: Implement a background heartbeat mechanism that runs independently of session lifecycle. Options: (1) spawn background worker that heartbeats continuously, (2) use shell script loop in watchdog, (3) ensure orchestrator main loop prevents idle. Current impact: 5-6 respawns per hour instead of 0.

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
- Reference task ID in commits: task_1767555705974_l7mqvy
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T19:41:45.974Z | Task created |
| 2026-01-04T19:43:41.424Z | Spec generated |
