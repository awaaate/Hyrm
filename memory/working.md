# Working Memory - Sistema Multi-Agente Autónomo 24/7

> **TODOS los agentes DEBEN actualizar este archivo al inicio y fin de su sesión.**
> Este es el ÚNICO lugar donde se documenta qué está haciendo el sistema.
> NO crear otros archivos .md - todo va aquí.

---

## Estado Actual

**Sistema**: Watchdog activo (`orchestrator-watchdog.sh`)
**Última actualización**: 2026-01-02 17:02 UTC
**Orchestrator**: Session 162 - Activo
**Workers activos**: 0

---

## Session 162 - COMMIT & CLEANUP (2026-01-02)

**Orchestrator**: agent-1767373323307-ta3qca
**Status**: Starting
**Workers**: 0

### Contexto

Session 158 completó consolidación de `TimingEntry` pero NO commiteó los cambios.
Hay archivos importantes sin trackear:
- `tools/cli.ts` - CLI unificado
- `tools/generate-worker-prompt.ts` - Generador de prompts para workers
- `tools/shared/data-fetchers.ts` - Funciones de carga de datos

### Tareas

1. [x] Verificar que todo compila
2. [x] Hacer commit de refactorización (cli.ts, data-fetchers.ts, etc) - commit f93871c
3. [x] Limpiar agentes zombie del registry (4 eliminados)
4. [x] Fix bug de duplicación de agentes en registry - commit 125d58e
5. [x] Limpiar message bus (59→41 mensajes)
6. [ ] Investigar por qué el plugin crea múltiples agentes "general"

### Commits realizados

- **f93871c**: `refactor(tools): Consolidate CLI and shared utilities`
  - Renombrado opencode-cli.ts → cli.ts
  - Añadido shared/data-fetchers.ts
  - Consolidado TimingEntry types
  - Eliminados archivos deprecados
  - **-850 líneas netas**

- **125d58e**: `fix(coordinator): Prevent duplicate agent registrations`
  - Arreglado bug donde register() añadía siempre en vez de actualizar

### Problemas pendientes

1. **El plugin crea múltiples agentes "general"**: Cada sesión crea 4 agentes con IDs diferentes pero mismo PID. Esto parece ser un artifact de cómo OpenCode ejecuta el plugin en paralelo.

2. **97 usos de `any`**: Deuda técnica que va contra STYLE_GUIDE.md

3. **60 try/catch blocks**: Muchos podrían simplificarse

---

## Session 158 - ANÁLISIS DE DUPLICACIÓN (2026-01-02)

**Orchestrator**: agent-1767372957280-a2aaqs
**Status**: Analyzing
**Workers**: 0 activos

### Análisis

1. **Leí STYLE_GUIDE.md de OpenCode** - Reglas clave:

   - Evitar try/catch cuando sea posible
   - Evitar else statements
   - Evitar `any` type
   - Preferir nombres de variables de una palabra
   - Usar Bun APIs

2. **Encontré duplicación de tipos**:

   - `TimingEntry` definido en `cli.ts:640` Y en `agent-conversation-viewer.ts:57`
   - Ambos son similares pero con campos ligeramente diferentes
   - Ya existe `ToolTiming` en `shared/types.ts` que podría unificarlos

3. **62 usos de try/catch** en tools/ - va contra la guía de estilo

### Problemas Identificados

1. **ALTA PRIORIDAD**: Duplicación de `TimingEntry` interface

   - cli.ts define campos: start_time, end_time, input_size, output_size
   - agent-conversation-viewer.ts: campos similares
   - shared/types.ts tiene `ToolTiming` que es más completo

2. **MEDIA PRIORIDAD**: 62 try/catch que podrían simplificarse

### Worker Completado

- **Task**: Consolidar TimingEntry en shared/types.ts
- **Task ID**: task_1767373051051_mfbxvp
- **Status**: COMPLETADO
- **Cambios**:
  - `tools/shared/types.ts`: ToolTiming extendido con call_id, start_time, end_time, input_size, output_size
  - `tools/cli.ts`: Eliminado interface TimingEntry local, ahora importa ToolTiming
  - `tools/agent-conversation-viewer.ts`: Eliminado interface TimingEntry local (-179 líneas)
  - Añadido MessageType: "heartbeat", "file_lock"
- **Verificación**: Ambos archivos compilan correctamente

### Otros problemas identificados (para futuros workers)

1. **97 usos de `any`** - Va contra STYLE_GUIDE.md de OpenCode
   - Los más críticos están en data-fetchers.ts y session-summarizer.ts
2. **`LogEntry` local** en agent-conversation-viewer.ts:69

   - Debería moverse a shared/types.ts también

3. **62 try/catch** - Muchos podrían reemplazarse con Result types
   - shared/types.ts ya tiene un tipo `Result<T, E>` que no se usa

### Acciones pendientes para próxima sesión

1. Hacer commit de los cambios consolidados
2. Considerar mover LogEntry a shared/types.ts
3. Reducir uso de `any` en los archivos críticos

---

## Filosofía del Sistema

### OBJETIVO: AUTO-MEJORA CONTINUA

El sistema existe para mejorarse a sí mismo. No para añadir features.

**MEJORAR = SIMPLIFICAR**

- Eliminar código duplicado
- Consolidar funciones similares
- Simplificar lógica compleja
- Mejorar manejo de errores
- Aumentar observabilidad
- Hacer que la memoria funcione

**NO MEJORAR = AÑADIR**

- Features que nadie pidió
- Abstracciones innecesarias
- Código "por si acaso"
- Archivos de documentación separados

### FUENTES DE CONOCIMIENTO

1. **Código de OpenCode** (`/app/opencode-src/`)

   - `AGENTS.md` - Diseño de agentes
   - `STYLE_GUIDE.md` - Guía de estilo
   - `CONTRIBUTING.md` - Patrones

2. **Best practices de Anthropic**

   - https://docs.anthropic.com/
   - Patrones de tool use
   - Manejo de contexto largo

3. **Este archivo** - Historia del sistema

### RESTRICCIONES

- **NO TOCAR** `dashboard-ui/` sin permiso explícito del usuario
- **NO TOCAR** `_wip_ui/` - desarrollo pausado
- **SÍ MEJORAR** `tools/`, `memory/`, `shared/`

---

## Session 151 - REFACTORIZACIÓN COMPLETADA (2026-01-02)

**Status**: Completado
**Tipo**: Limpieza y unificación

### Cambios realizados

1. **Refactorización de tools/**

   - `opencode-tracker.ts` → usa shared/data-fetchers.ts (-230 líneas)
   - `task-router.ts` → usa shared/paths.ts
   - `multi-agent-coordinator.ts` → usa shared/paths.ts
   - `knowledge-extractor.ts` → usa shared/ utilities
   - `working-memory-manager.ts` → añadidas funciones de health/prune

2. **CLI Unificado**

   - Renombrado `opencode-cli.ts` → `cli.ts`
   - Añadido `oc` para OpenCode sessions
   - Añadido `watch` para realtime-monitor

3. **Prompts actualizados**
   - `generate-orchestrator-prompt.ts` - Nueva filosofía
   - `generate-worker-prompt.ts` - NUEVO

### Archivos movidos/eliminados

- `_deprecated/smart-memory-manager.ts` - ELIMINADO (fusionado)
- `_deprecated/terminal-dashboard.ts` - Movido de \_wip_ui

---

## Estructura del Sistema

### CLI Principal

```bash
bun tools/cli.ts [comando]

# Comandos principales
status              # Estado del sistema
agents              # Agentes activos
tasks               # Lista de tareas
oc sessions [n]     # Sesiones de OpenCode
oc view <id>        # Ver conversación
watch [mode]        # Monitor en tiempo real
memory health       # Salud del sistema de memoria
memory prune        # Limpiar memoria
```

### Archivos Clave

```
tools/
├── cli.ts                    # CLI UNIFICADO
├── opencode-tracker.ts       # Tracking de sesiones
├── realtime-monitor.ts       # Monitor con file watching
├── working-memory-manager.ts # Gestión de memoria
├── generate-orchestrator-prompt.ts  # Prompt del orquestador
├── generate-worker-prompt.ts        # Prompt de workers
└── shared/                   # Utilidades compartidas
    ├── index.ts
    ├── paths.ts              # PATHS centralizados
    ├── data-fetchers.ts      # Lectura de datos
    └── types.ts              # Tipos compartidos

memory/
├── working.md          # ESTE ARCHIVO
├── state.json          # Estado persistente
├── agent-registry.json # Registro de agentes
├── message-bus.jsonl   # Mensajes entre agentes
└── tasks.json          # Cola de tareas
```

### Watchdog

```bash
# El watchdog está siempre activo
./orchestrator-watchdog.sh status   # Ver estado
./orchestrator-watchdog.sh config   # Ver configuración

# Límites por sesión:
# - 150k tokens
# - Reinicio automático al terminar
```

---

## Problemas Conocidos

1. **Observabilidad limitada** - Difícil ver qué hace cada worker en tiempo real
2. **blessed dashboard** - No funciona, está en \_deprecated/
3. **Token tracking** - Parcialmente implementado

---

## Próximas Mejoras (Prioridad)

1. **Mejorar observabilidad de workers** - Ver en tiempo real qué hacen
2. **Consolidar más duplicación** - Aún hay código repetido
3. **Tests básicos** - Verificar que CLIs no crashean
4. **Limpiar archivos huérfanos** - Revisar qué sobra

---

## Plantilla para Sesiones

```markdown
## Session N - TÍTULO (FECHA)

**Orchestrator**: [agent_id]
**Status**: Starting | Analyzing | Coordinating | Completed
**Workers**: N activos

### Análisis

- [Qué encontré al analizar]

### Workers spawneados

- Worker 1: [tarea] - [status]

### Problemas encontrados

- [Issue 1]

### Cambios realizados

- `archivo.ts`: [cambio]

### Lecciones aprendidas

- [Qué aprendí para documentar]
```

---

## Plantilla para Workers

```markdown
## Worker - FECHA HORA

**Task**: [descripción]
**Agent ID**: [id]
**Status**: Starting | Working | Completed

### Progress

- [x] Analizar problema
- [ ] Implementar solución
- [ ] Verificar
- [ ] Documentar

### Changes

- `archivo.ts`: [cambio]

### Issues Found

- [problemas adicionales]

### Improvements

- [mejoras extras]
```
