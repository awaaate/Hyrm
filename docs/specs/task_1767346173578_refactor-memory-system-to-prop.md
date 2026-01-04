# Task: Refactor memory system to properly save conversations

**Task ID**: `task_1767346173578_rcafqh`  
**Priority**: high  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 4  
**Assigned To**: agent-1767345914840-613n7n

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
| 2026-01-02T09:29:33.578Z | Task created |
| 2026-01-04T10:30:53.573Z | Spec generated |
