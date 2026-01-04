# Task: Consolidar TimingEntry en shared/types.ts

**Task ID**: `task_1767373051051_mfbxvp`  
**Priority**: high  
**Status**: completed  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

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
| 2026-01-02T16:57:31.053Z | Task created |
| 2026-01-04T10:30:53.582Z | Spec generated |
