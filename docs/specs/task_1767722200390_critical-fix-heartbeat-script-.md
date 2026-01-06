# Task: CRITICAL: Fix heartbeat script shell syntax errors causing lease expiration

**Task ID**: `task_1767722200390_iykuo7`  
**Priority**: critical  
**Status**: pending  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 0.5 hours  
**Assigned To**: unassigned  
**Tags**: heartbeat, orchestrator, critical-bug, shell-syntax

---

## Problem Statement

CRITICAL: The orchestrator heartbeat service is failing with shell syntax errors that cause leader lease to expire every 240-250 seconds.

Root cause found in tools/lib/orchestrator-heartbeat.sh:
- Lines 325, 335, 337: Uses `local` keyword outside of function context (main block starts at line 317)
- Line 284: References `orchestrator_agent` variable that's not in scope
- Line 339: References `duration_ms` before it's defined in the error handler

These errors cause the heartbeat script to crash on every cycle, which means:
1. Leader lease never gets updated
2. Watchdog detects lease expiry after 240-250s
3. Watchdog spawns new orchestrator with epoch+1
4. Pattern repeats continuously (2-3 restarts/hour)

Evidence in logs:
- tools/lib/orchestrator-heartbeat.sh: line 284: orchestrator_agent: unbound variable
- tools/lib/orchestrator-heartbeat.sh: line 325: local: can only be used in a function
- tools/lib/orchestrator-heartbeat.sh: line 335: local: can only be used in a function
- logs/heartbeat-service.log shows repeated failures

Solution needed:
1. Wrap main code block in a proper function or remove `local` keywords in main block
2. Fix variable scoping (move variable definitions outside main block)
3. Add proper error handling to prevent crashes
4. Test that heartbeat updates occur every 60s without errors
5. Verify leader lease stays valid for full TTL (180s+)

Success criteria:
- Heartbeat script runs without shell errors
- Leader lease updates visible in realtime.log every 60s
- Orchestrator leaders stay active for >180s (not 240-250s expiry)
- Orchestrator restart rate drops from 2-3/hour to <1/hour

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
- Reference task ID in commits: task_1767722200390_iykuo7
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-06T17:56:40.390Z | Task created |
| 2026-01-06T17:56:40.396Z | Spec generated |
