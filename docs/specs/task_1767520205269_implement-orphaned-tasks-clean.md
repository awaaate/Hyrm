# Task: Implement orphaned tasks cleanup - release tasks when agent becomes stale

**Task ID**: `task_1767520205269_rwoygc`  
**Priority**: high  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 1  
**Assigned To**: agent-1767521206609-wjq7rn

---

## Problem Statement

When cleanupStaleAgents() removes a dead agent, also release any tasks assigned to it.

Implementation:
1. In multi-agent-coordinator.ts cleanupStaleAgents()
2. Find tasks with status=in_progress and assigned_to=stale_agent_id
3. Set those tasks to status=pending, clear assigned_to/claimed_at
4. Log released tasks for visibility

Currently 3 tasks stuck assigned to dead agent agent-1767460906093-ieg80k

## Goals

- TODO: Define goals

---

## Implementation Plan

- TODO: Add implementation phases

---

## Technical Details

- TODO: Add technical notes

---

## Success Criteria

- [ ] TODO: Define success criteria

---

## Notes

- TODO: Add links and context

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T09:50:05.269Z | Task created |
| 2026-01-04T10:30:53.599Z | Spec generated |
