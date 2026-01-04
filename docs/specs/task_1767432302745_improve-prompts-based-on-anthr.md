# Task: Improve prompts based on Anthropic prompting guides

**Task ID**: `task_1767432302745_8oi36d`  
**Priority**: high  
**Status**: completed  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: agent-1767432247589-hhlnve  
**Tags**: prompts, anthropic, improvement, user-request

---

## Problem Statement

User request: Improve prompts for agents, tools, etc based on Anthropic blog guides.

Key Anthropic Guidance Found:
1. "Building Effective Agents" - Key principles: simplicity, transparency, well-documented tool interfaces
2. "Long Context Prompting" - Use scratchpad for quotes, contextual examples improve recall
3. "Claude 2.1 Prompting" - Add "Here is the most relevant sentence" to guide extraction (27% to 98% accuracy)
4. "Prompt Caching" - Structure prompts for cache efficiency

Prompts to Improve:
- Orchestrator prompt (tools/generate-orchestrator-prompt.ts)
- Worker prompt (tools/generate-worker-prompt.ts)
- Plugin system prompt injection (.opencode/plugin/index.ts)
- Tool definitions (.opencode/plugin/tools/*.ts)
- Agent skills (.opencode/skill/*.md)

Focus Areas per Anthropic:
1. Maintain simplicity in agent design
2. Prioritize transparency by showing planning steps
3. Craft agent-computer interface (ACI) through thorough tool documentation
4. Use routing for different task types
5. Evaluator-optimizer pattern for iterative refinement
6. Proper tool documentation with examples and edge cases

**Additional Context**:
- [2026-01-03T09:36:37.949Z] Applied Anthropic prompt engineering best practices to 10 files: 2 prompt generators, 4 plugin tool files, 4 skill files. Key improvements: scratchpad patterns for decision-making, context at start with instructions at end, tool descriptions with usage examples and edge cases, clearer workflow structures.
- [2026-01-03T09:39:05.357Z] Completed by prompt-worker (agent-1767432364632-gom2eh). Applied Anthropic prompt engineering best practices: added scratchpad/thinking patterns, restructured prompts with context-first ordering, enhanced tool descriptions with examples, updated all 4 skill files.

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
- Reference task ID in commits: task_1767432302745_8oi36d
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-03T09:25:02.745Z | Task created |
| 2026-01-04T19:43:41.398Z | Spec generated |
