# Task: Implement message bus rotation and compaction

**Task ID**: `task_1767305786654_im18xd`  
**Priority**: high  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: agent-1767305734327-qycae  
**Tags**: message-bus, performance, cleanup

---

## Problem Statement

Message bus is 59KB with 190+ messages including many old heartbeats. Create: 1) Automatic rotation to archived files after N messages or size threshold 2) Heartbeat deduplication (keep only latest per agent) 3) Message TTL for cleanup 4) Index file for fast searching across archives

**Additional Context**:
- [2026-01-01T22:19:24.063Z] Created message-bus-manager.ts with: status, rotate, compact, cleanup, search, stats, auto commands. Integrated with plugin for automatic maintenance on session start. Reduced message bus from 198 to 123 messages (38% reduction). Added CLI command 'bus' to opencode-cli.ts.

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
- Reference task ID in commits: task_1767305786654_im18xd
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-01T22:16:26.654Z | Task created |
| 2026-01-04T19:43:41.358Z | Spec generated |
