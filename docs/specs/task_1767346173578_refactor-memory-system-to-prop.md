# Task: Refactor memory system to properly save conversations

**Task ID**: `task_1767346173578_rcafqh`  
**Priority**: high  
**Status**: completed  
**Complexity**: complex  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 4 hours  
**Assigned To**: agent-1767345914840-613n7n  
**Tags**: memory-system, refactor, user-feedback, critical

---

## Problem Statement

User feedback: Memory system isn't saving conversations from all sessions. Issues identified:

1. **Missing automatic conversation extraction**: The plugin tracks session start/end events but doesn't extract actual conversation content (messages, tool calls, outputs)

2. **Duplicated functionality**: 
   - `conversation-tracker.ts` reads from OpenCode's native storage 
   - `opencode-tracker.ts` does similar things
   - `session-summarizer.ts` summarizes sessions
   - `session-analytics.ts` analyzes sessions
   These should be consolidated or have clear roles

3. **Manual vs Automatic**:
   - Knowledge extraction (`knowledge-extractor.ts`) is manual
   - Session summaries need to be generated manually
   - No automatic extraction after session ends

4. **What IS working**:
   - Tool timing is tracked (tool-timing.jsonl)
   - Agent messages are tracked (message-bus.jsonl)  
   - Tasks are persisted (tasks.json)
   - Quality assessments are saved (quality-assessments.json)
   - Working memory is updated (working.md)

SOLUTION NEEDED:
1. Add session.end hook to automatically extract key learnings
2. Integrate conversation-tracker to pull messages into our memory system
3. Auto-summarize completed sessions
4. Consolidate duplicated tools
5. Create clear documentation on what's active vs deprecated

**Additional Context**:
- [2026-01-02T09:32:39.163Z] Implemented automatic session knowledge extraction: 1) Added session.end hook to auto-extract learnings from tool timing data 2) Created extractSessionKnowledge function that analyzes tool usage patterns, errors, and slow tools 3) Added summarize-current command to session-summarizer for quiet auto-summarization 4) Added Memory System Architecture section to AGENTS.md documenting active vs deprecated tools

## Goals

- Complete high-priority work to unblock downstream tasks
- Design comprehensive solution with proper error handling and documentation
- Improve code quality, maintainability, or performance
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
[ ] Feature complete and tested
[ ] Documentation updated
[ ] Design reviewed and approved
[ ] Performance benchmarked if applicable
[ ] Error handling and logging comprehensive

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: task_1767346173578_rcafqh
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-02T09:29:33.578Z | Task created |
| 2026-01-04T19:43:41.367Z | Spec generated |
