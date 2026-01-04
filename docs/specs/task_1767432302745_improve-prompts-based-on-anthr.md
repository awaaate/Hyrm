# Task: Improve prompts based on Anthropic prompting guides

**Task ID**: `task_1767432302745_8oi36d`  
**Priority**: high  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: agent-1767432247589-hhlnve

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
| 2026-01-03T09:25:02.745Z | Task created |
| 2026-01-04T10:30:53.591Z | Spec generated |
