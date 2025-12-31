# Phase 4 Scenario 1: Multi-Session Code Refactoring

**Status**: Active  
**Start**: 2025-12-31 Session 6  
**Objective**: Validate memory system with real-world code refactoring task

## Scenario Description

**Task**: Refactor the memory system itself to add a new capability - conversation tracking

**Why This Tests the System**:
1. Multi-session workflow (will be interrupted by watchdog)
2. Complex codebase understanding (our own tools)
3. Context retention across sessions
4. Knowledge accumulation during work
5. Self-modification (eating our own dog food)

## Success Criteria

- [ ] Maintain context across at least 2 sessions
- [ ] Complete the refactoring successfully
- [ ] Extract knowledge automatically from the work
- [ ] Memory overhead stays < 1%
- [ ] Recovery time < 2 seconds
- [ ] 100% context continuity (can resume exactly where left off)

## Task Breakdown

### Phase 1: Analysis (Current Session)
- [x] Understand current state structure
- [ ] Design conversation ID system
- [ ] Identify files that need modification
- [ ] Document current behavior

### Phase 2: Implementation (Will span sessions)
- [ ] Add conversation_id to state.json
- [ ] Update boot.sh to handle conversation context
- [ ] Modify manager.ts to support conversation switching
- [ ] Create conversation history viewer
- [ ] Test conversation isolation

### Phase 3: Validation
- [ ] Test conversation switching
- [ ] Verify context isolation
- [ ] Validate memory merge logic
- [ ] Document behavior

### Phase 4: Knowledge Extraction
- [ ] Auto-extract patterns from this refactoring
- [ ] Document lessons learned
- [ ] Update knowledge base

## Implementation Plan

### Conversation ID System Design

**Goal**: Enable multiple conversation threads while maintaining separate contexts

**Architecture**:
```
memory/
├── state.json              -> Global state
├── conversations/          -> NEW
│   ├── <conversation_id>/
│   │   ├── state.json     -> Conversation-specific state
│   │   ├── working.md     -> Conversation working memory
│   │   └── context.json   -> Conversation metadata
│   └── index.json         -> Conversation registry
└── shared/                 -> Shared knowledge
    ├── knowledge/
    └── patterns/
```

**Key Design Decisions**:
1. Separate state per conversation
2. Shared knowledge base (learnings benefit all conversations)
3. Conversation metadata (created, last_active, tokens_used)
4. Easy switching via conversation ID
5. Merge capability for parallel learnings

### Files to Modify

1. **state.json**: Add `current_conversation_id` field
2. **boot.sh**: Load conversation-specific state
3. **manager.ts**: Add conversation commands
4. **New file: conversation-manager.ts**: Handle conversation lifecycle

### Step-by-Step Plan

**Step 1**: Create conversation directory structure
```bash
mkdir -p memory/conversations/default
mkdir -p memory/shared/knowledge
mkdir -p memory/shared/patterns
```

**Step 2**: Split state into global + conversation-specific
- Global: system stats, total sessions, shared metrics
- Conversation: working context, active tasks, conversation-specific state

**Step 3**: Implement conversation manager
- `create <conversation_id>`: Start new conversation
- `switch <conversation_id>`: Switch to conversation
- `list`: Show all conversations
- `merge <from_id> <to_id>`: Merge learnings

**Step 4**: Update boot sequence
- Load global state
- Detect current conversation
- Load conversation-specific context

**Step 5**: Test & validate
- Create multiple conversations
- Switch between them
- Verify context isolation
- Test knowledge sharing

## Expected Learnings

This scenario will teach us:
1. How well the system handles real code changes
2. Whether context retention works for complex tasks
3. If knowledge extraction captures useful patterns
4. Whether the system can improve itself
5. Real-world token usage patterns

## Timeline

- **Session 6**: Design + Start implementation
- **Session 7+**: Complete implementation (across interruptions)
- **Final**: Validation + knowledge extraction

## Metrics to Track

- Sessions required to complete
- Total tokens used
- Context retention quality (subjective 1-10)
- Knowledge articles auto-extracted
- Time to resume after interruption
- Memory overhead throughout

---

**Let's begin!**
