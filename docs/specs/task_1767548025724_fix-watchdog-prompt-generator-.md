# Task: Fix watchdog prompt-generator failures and fallback behavior

**Task ID**: `task_1767548025724_8b49mn`  
**Priority**: high  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: unassigned  
**Tags**: bug, watchdog, prompt-generator

---

## Problem Statement

logs/watchdog.log shows `Warning: prompt-generator.ts failed, using fallback prompt` (2026-01-04). Investigate `tools/lib/prompt-generator.ts` invocation from `orchestrator-watchdog.sh` / `spawn-worker.sh`, capture stderr/exit code in logs, and fix underlying failure so watchdog uses generated prompt reliably.

**Additional Context**:
- [2026-01-04T17:44:10.512Z] Improved watchdog/spawn-worker prompt-generator invocation: capture exit code + stderr (with retries) instead of silencing; hardened prompt-generator JSON loading to avoid transient failures; bun test + bun build passed.
- [2026-01-04T17:47:09.307Z] Worker spawned via spawn-worker.sh (PID 444819). Investigate prompt-generator.ts failures causing watchdog fallback prompts.
- [2026-01-04T17:47:32.645Z] Worker completed: hardened watchdog + prompt-generator, improved fallback and added stderr/exit-code capture in scripts.

## Goals

- Complete high-priority work to unblock downstream tasks
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
[ ] Feature complete and tested
[ ] Documentation updated

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: task_1767548025724_8b49mn
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T17:33:45.724Z | Task created |
| 2026-01-04T19:43:41.421Z | Spec generated |
