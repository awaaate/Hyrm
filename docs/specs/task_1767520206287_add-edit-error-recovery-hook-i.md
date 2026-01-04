# Task: Add Edit Error Recovery hook - inject reminder when Edit fails with oldString errors

**Task ID**: `task_1767520206287_6bpixl`  
**Priority**: high  
**Status**: completed  
**Complexity**: simple  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 0.5 hours  
**Assigned To**: agent-1767521213362-l0kg5y  
**Tags**: enhancement, plugin, error-handling

---

## Problem Statement

Add error recovery for Edit tool failures in plugin.

Implementation:
1. In tool.execute.after hook (.opencode/plugin/index.ts)
2. Detect errors: oldString not found, found multiple times, must be different
3. Append reminder: [EDIT ERROR] Read the file first before retrying

Reference: oh-my-opencode/src/hooks/edit-error-recovery/index.ts
Simple: if (tool===edit && hasError) output.output += reminder

**Additional Context**:
- [2026-01-04T10:08:15.569Z] Successfully implemented Edit Error Recovery hook in .opencode/plugin/index.ts

Features:
1. ✅ Detects Edit tool failures with error messages:
   - "oldString not found"
   - "oldString found multiple times"
   - "newString must be different"

2. ✅ Injects context-aware reminders with specific guidance:
   - Reminds to use Read tool first
   - Warns about line numbers being reference-only
   - Suggests using larger context for unique matches
   - Provides examples of common mistakes

3. ✅ Rate limiting to prevent spam:
   - Max 1 reminder per 5 minutes (cooldown period)
   - Tracks last error time to avoid duplicate injections

4. ✅ Logging integration:
   - Logs reminder injection events to realtime.log
   - Includes call_id and file path for debugging

5. ✅ Tested with 5 test cases - all passing

Implementation in tool.execute.after hook (line ~995-1015) detects errors and appends helpful reminder to output.output before returning to agent.

## Goals

- Complete high-priority work to unblock downstream tasks
- Implement straightforward change with good test coverage
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
- Reference task ID in commits: task_1767520206287_6bpixl
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-04T09:50:06.287Z | Task created |
| 2026-01-04T19:43:41.412Z | Spec generated |
