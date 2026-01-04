# Task: Integrate leader election state into CLI dashboard/monitor

**Task ID**: `task_1767423270940_xmgxle`  
**Priority**: high  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 3 hours  
**Assigned To**: agent-1767433541786-00vj5  
**Tags**: orchestrator, cli, monitoring, leader-election

---

## Problem Statement

Update CLI monitoring tools (tools/cli.ts monitor/watch, tools/realtime-monitor.ts, and any supporting trackers) to surface the new single-leader orchestrator state. Show which orchestrator is leader, follower counts, and stale-orchestrator detections based on the leader-election implementation from task_1767422728098_488s1n and the design in Session 188 (memory/working.md). Focus on data correctness and robust error handling if leader state is missing or inconsistent; avoid cosmetic-only UI tweaks.

**Additional Context**:
- [2026-01-03T06:54:45.209Z] Releasing claim from orchestrator; task should be picked up by a dedicated worker spawned via opencode run.
- [2026-01-03T09:45:10.664Z] Reset from stale worker. Original worker agent-1767423314532-41ys2 is no longer active.
- [2026-01-03T09:51:40.380Z] Integrated leader election state into CLI dashboard/monitor. Changes: 1) Added LeaderState, LeaderHealthStatus, LeaderInfo types to shared/types.ts, 2) Added getLeaderInfo(), getLeaderState(), hasActiveLeader(), isLeader() to shared/data-fetchers.ts, 3) Updated cli.ts showAgents() with leader status section and [LEADER] tag, 4) Updated realtime-monitor.ts with renderLeaderSection(), leader in status bar, [L] tag on agents, and orchestrator-state.json in file watchers.
- [2026-01-03T09:52:25.054Z] Completed by cli-worker. Added leader election state display to CLI dashboard/monitor. Added LeaderState/LeaderInfo types, getLeaderInfo() helper, leader section in CLI agents command, leader info in realtime-monitor status bar with [L] tags.

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
- Reference task ID in commits: task_1767423270940_xmgxle
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-03T06:54:30.940Z | Task created |
| 2026-01-04T19:43:41.396Z | Spec generated |
