# Task: Reduce orchestrator start failures observed in watchdog.log

**Task ID**: `task_1767548027432_dsoaar`  
**Priority**: high  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: agent-1767555140085-8fqkx  
**Tags**: reliability, watchdog, orchestrator

---

## Problem Statement

logs/watchdog.log contains repeated `[ERROR] Orchestrator failed to start!` and restart storms (including too many restarts/hour). After fixing plugin/prompt issues, harden watchdog startup diagnostics: include last N lines of orchestrator stderr, surface exit codes, and add backoff/jitter to prevent restart thundering-herd.

**Additional Context**:
- [2026-01-04T17:47:10.107Z] Worker spawned via spawn-worker.sh (PID 444876). Investigate frequent orchestrator start failures in logs/watchdog.log; correlate with prompt-generator and plugin errors.
- [2026-01-04T19:27:21.238Z] Reset from stale in_progress (idle for 40+ minutes with no assignee). Ready for fresh worker.
- [2026-01-04T19:35:23.529Z] Hardened watchdog startup diagnostics: integrated stderr logging, exit code surfacing, and restart jitter to prevent thundering-herd. Commit: 86ef8de"
- [2026-01-04T19:35:47.295Z] Watchdog startup diagnostics hardened with stderr capture (last 80 lines), exit code surfacing, and restart jitter (0-5s random delay) to prevent thundering-herd. Diagnostic files archived to logs/orchestrator-failures/. Implementation prevents coordinated restart storms when orchestrator fails.

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
- Reference task ID in commits: task_1767548027432_dsoaar
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T17:33:47.432Z | Task created |
| 2026-01-04T19:43:41.421Z | Spec generated |
