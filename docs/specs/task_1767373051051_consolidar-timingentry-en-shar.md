# Task: Consolidar TimingEntry en shared/types.ts

**Task ID**: `task_1767373051051_mfbxvp`  
**Priority**: high  
**Status**: completed  
**Complexity**: simple  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD hours  
**Assigned To**: unassigned  
**Tags**: refactoring, types, deduplication

---

## Problem Statement

El tipo TimingEntry está duplicado en cli.ts:640 y agent-conversation-viewer.ts:57. Debe consolidarse en shared/types.ts extendiendo el ToolTiming existente.

Pasos:
1. Actualizar ToolTiming en shared/types.ts para incluir todos los campos usados:
   - call_id, start_time, end_time, input_size, output_size (de cli.ts)
2. Eliminar interface TimingEntry local de cli.ts
3. Eliminar interface TimingEntry local de agent-conversation-viewer.ts
4. Importar ToolTiming from shared/types.ts en ambos archivos
5. Verificar que el código compila: bun build --no-bundle tools/cli.ts

La estructura real del JSON es:
{timestamp, session_id, tool, call_id, start_time, end_time, duration_ms, input_size, output_size, success, category}

**Additional Context**:
- [2026-01-02T17:00:15.417Z] Worker completed successfully. Consolidated TimingEntry into ToolTiming in shared/types.ts. Removed duplicate interfaces from cli.ts and agent-conversation-viewer.ts. All files compile.

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
- Reference task ID in commits: task_1767373051051_mfbxvp
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-02T16:57:31.053Z | Task created |
| 2026-01-04T19:43:41.383Z | Spec generated |
