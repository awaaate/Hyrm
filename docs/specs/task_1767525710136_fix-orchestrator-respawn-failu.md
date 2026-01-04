# Task: Fix orchestrator respawn failure: invalid stdio argument type

**Task ID**: `task_1767525710136_6d0n07`  
**Priority**: high  
**Status**: completed  
**Complexity**: simple  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 3 hours  
**Assigned To**: unassigned  
**Tags**: bug, orchestrator, respawn, node

---

## Problem Statement

memory/realtime.log reports: "Failed to re-spawn orchestrator" with TypeError [ERR_INVALID_ARG_TYPE]: "stdio must be an array of 'inherit', 'ignore', or null". Locate respawn code path and correct child_process spawn options (stdio) and add a small regression test or runtime guard.

**Additional Context**:
- [2026-01-04T15:56:42.193Z] Cancelled as obsolete per user priority signal umsg_1767541963707_8hvdii.
- [2026-01-04T16:38:57.823Z] Root cause was Node child_process stdio semantics leaking into orchestrator respawn path; ensured orchestrator respawn uses Bun.spawn with explicit {stdin/stdout/stderr: 'ignore'} (no Node-style stdio option). Added regression test tools/lib/orchestrator-respawn.test.ts to prevent reintroducing `stdio: 'ignore'` and verify both respawn + task-continuation spawns ignore stdio. Ran `bun test` (pass). `bun build tools/opencode-tracker.ts --no-bundle` fails due to missing undici dependency (pre-existing env/setup issue).
- [2026-01-04T16:45:28.836Z] Respawn path in `.opencode/plugin/index.ts` already uses Bun.spawn with `{ stdin/stdout/stderr: "ignore" }` (not Node child_process stdio) to avoid ERR_INVALID_ARG_TYPE. Added regression test `tools/lib/orchestrator-respawn.test.ts` to guard against reintroducing `stdio: "ignore"` and to ensure ignore streams are explicitly set for detached spawns. Ran `bun test tools/lib/orchestrator-respawn.test.ts`.

## Goals

- Complete high-priority work to unblock downstream tasks
- Implement straightforward change with good test coverage
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
- Reference task ID in commits: task_1767525710136_6d0n07
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T11:21:50.136Z | Task created |
| 2026-01-04T19:43:41.416Z | Spec generated |
