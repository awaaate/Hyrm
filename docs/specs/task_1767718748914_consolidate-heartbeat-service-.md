# Task: Consolidate heartbeat service management and add diagnostics

**Task ID**: `task_1767718748914_aq74vm`  
**Priority**: high  
**Status**: pending  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 1.5 hours  
**Assigned To**: unassigned  
**Tags**: heartbeat, diagnostics, monitoring

---

## Problem Statement

Current heartbeat service implementation (tools/heartbeat-service.sh) lacks visibility into its health and success rate. Improvements needed:

1. **Add heartbeat verification**: periodically check if orchestrator-state.json is being updated
2. **Track success rate**: count how many heartbeats succeed vs fail per session
3. **Diagnostic logging**: log what agent_id the service is using and whether updates succeed
4. **Startup parameter validation**: ensure heartbeat service receives correct agent_id from orchestrator
5. **Status command**: `bun tools/cli.ts heartbeat-status` to show service health, last update, next heartbeat time

Current problem: It's unclear if heartbeat service is actually updating the lease or if the agent_id being passed is wrong.

Success criteria:
- Heartbeat service logs show successful updates every 60s
- cli.ts heartbeat-status shows last update within past 60s
- No more "Leader lease not found" warnings
- Leader lease age remains <60s (not reaching 240s before renewal)

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
- Reference task ID in commits: task_1767718748914_aq74vm
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-06T16:59:08.914Z | Task created |
| 2026-01-06T16:59:08.919Z | Spec generated |
