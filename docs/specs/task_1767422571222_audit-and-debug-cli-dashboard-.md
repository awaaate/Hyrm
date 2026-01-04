# Task: Audit and debug CLI dashboard & multi-agent monitor outputs

**Task ID**: `task_1767422571222_xifnzr`  
**Priority**: high  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 3 hours  
**Assigned To**: agent-1767433547455-1a95rd  
**Tags**: cli, monitor, opencode, multi-agent, debug

---

## Problem Statement

Review tools/cli.ts monitor/watch, tools/realtime-monitor.ts, and terminal-dashboard data layer to ensure OpenCode sessions, messages, and metrics are displayed correctly (no formatting errors, no empty panels). Align outputs with tools/opencode-tracker.ts and avoid UI-only tweaks; focus on data correctness, robustness, and clear error reporting.

**Additional Context**:
- [2026-01-03T06:59:24.464Z] Current orchestrator instance resuming CLI dashboard & monitor audit; previous orchestrator agent-1767422633466-ypcjdc is superseded.
- [2026-01-03T09:45:09.514Z] Reset from stale worker. Original worker agent-1767423494522-3a1e0r is no longer active.
- [2026-01-03T09:52:22.366Z] Completed by cli-audit-worker. Fixed quality score display bug, normalized data format between quality-assessments.json and code expectations. Files changed: tools/shared/data-fetchers.ts, tools/cli.ts, tools/realtime-monitor.ts, _wip_ui/terminal-dashboard/data.ts

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
- Reference task ID in commits: task_1767422571222_xifnzr
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-03T06:42:51.222Z | Task created |
| 2026-01-04T19:43:41.395Z | Spec generated |
