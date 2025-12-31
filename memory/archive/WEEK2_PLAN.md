# Phase 4 Week 2: Cross-Conversation Memory Enhancement

**Status**: Planning  
**Start Date**: 2025-12-31 Session 10  
**Duration**: Estimated 3-5 sessions

## Current State Assessment

### What Exists (Session 6)
✅ Conversation infrastructure (`conversation-manager.ts`)  
✅ Conversation storage structure (`conversations/`)  
✅ Basic operations: create, switch, list, delete  
✅ Metadata tracking: sessions, tokens, timestamps  
✅ One-time migration from global state

### What's Broken
❌ No auto-sync between `state.json` and conversation state  
❌ Conversation metrics get stale (shows 6 sessions, we're at 10)  
❌ Active tasks not synced (conversation shows 0, state.json has tasks)  
❌ Recent work not updated (shows Session 5 work, we're at Session 10)  
❌ Switching conversations doesn't actually switch context

### Critical Gap
The conversation system is **structurally complete but functionally disconnected**. It's like having a database with no write path - you can query it, but it's always out of date.

## Week 2 Objectives

### 1. Bidirectional State Sync (CRITICAL)
**Priority**: Must-Have  
**Effort**: High  
**Impact**: Makes conversation system actually useful

Implement automatic synchronization:
- `state.json` changes → update current conversation state
- Conversation switch → load conversation state into `state.json`
- Session end → sync metrics back to conversation metadata

**Components to Build**:
```
sync-engine.ts          - Core sync logic
├── syncToConversation()    - Push state.json to conversation
├── syncFromConversation()  - Load conversation state to state.json
├── watchStateChanges()     - Monitor state.json for changes
└── autoSync()              - Background sync loop
```

**Success Criteria**:
- Conversation metadata always current (sessions, tokens, tasks)
- Switching conversations loads correct context
- No manual sync needed

### 2. Conversation-Aware Boot (HIGH)
**Priority**: Should-Have  
**Effort**: Medium  
**Impact**: Seamless recovery with conversation context

Enhance `boot.sh` to handle conversations:
- Detect current conversation from index
- Load conversation-specific state
- Merge with global state properly
- Validate conversation consistency

**Changes to `boot.sh`**:
```bash
# Check conversation system
if [ -f "memory/conversations/index.json" ]; then
  CURRENT_CONV=$(jq -r '.current_conversation' memory/conversations/index.json)
  echo "Loading conversation: $CURRENT_CONV"
  
  # Sync conversation state to main state
  bun memory/sync-engine.ts load $CURRENT_CONV
fi
```

**Success Criteria**:
- Watchdog recovery loads correct conversation
- Boot respects conversation context
- No context bleed between conversations

### 3. Conversation Context Isolation (MEDIUM)
**Priority**: Nice-to-Have  
**Effort**: Medium  
**Impact**: True multi-conversation support

Ensure conversations don't interfere:
- Separate working memory per conversation
- Isolated task lists
- Conversation-specific knowledge links
- Shared vs. conversation-local files

**File Structure**:
```
conversations/
├── index.json                  # Global: current conversation, metadata
├── default/
│   ├── state.json              # Conversation-specific state
│   ├── working.md              # Conversation working memory
│   └── tasks.json              # Conversation task list
└── bug-investigation/
    ├── state.json
    ├── working.md
    └── tasks.json

shared/                         # Shared across conversations
├── knowledge/                  # Available to all
├── .cache/                     # Shared cache
└── archive/                    # Global archive
```

**Success Criteria**:
- Can work on different projects in parallel
- No confusion when switching contexts
- Shared knowledge accessible from all conversations

### 4. Conversation Metrics & Health (LOW)
**Priority**: Nice-to-Have  
**Effort**: Low  
**Impact**: Better visibility into conversation usage

Add conversation-specific metrics:
- Tokens per conversation
- Session duration by conversation  
- Task completion rate per conversation
- Cross-conversation knowledge reuse

**Success Criteria**:
- Dashboard shows per-conversation metrics
- Can identify most active conversations
- Track conversation lifecycle

## Implementation Plan

### Session 1: Sync Engine Core
**Goal**: Build basic bidirectional sync
- Create `sync-engine.ts` with core sync functions
- Implement `syncToConversation()` - push state changes
- Implement `syncFromConversation()` - load conversation state
- Add manual sync command for testing
- **Validation**: Can manually sync state ↔ conversation

### Session 2: Auto-Sync Integration
**Goal**: Make sync automatic
- Add state file watcher
- Implement background sync loop (every 30s)
- Hook into state.json updates
- Test with real state changes
- **Validation**: State auto-syncs without manual intervention

### Session 3: Boot Integration
**Goal**: Conversation-aware recovery
- Enhance `boot.sh` with conversation detection
- Add conversation loading to boot sequence
- Test watchdog recovery with conversations
- Validate correct context loads on boot
- **Validation**: Watchdog → boot → correct conversation loaded

### Session 4: Context Isolation
**Goal**: Per-conversation working memory
- Create conversation-specific `working.md` files
- Implement conversation-local task lists
- Separate shared vs. local knowledge
- Update adaptive loader for conversations
- **Validation**: Switching conversations switches full context

### Session 5: Testing & Polish
**Goal**: Production validation
- Test conversation switching under load
- Validate sync performance (latency, reliability)
- Test edge cases (rapid switches, concurrent updates)
- Document conversation workflow
- Update dashboard with conversation metrics
- **Validation**: All conversation features work seamlessly

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Sync Latency | < 1s | Time from state change to conversation update |
| Sync Reliability | 100% | No missed syncs or data loss |
| Context Switch Time | < 2s | Time to switch conversations fully |
| State Consistency | 100% | Conversation state matches actual state |
| Boot Integration | 100% | Correct conversation loaded on recovery |

## Risks & Mitigation

**Risk**: Sync conflicts (state and conversation both change)  
**Mitigation**: Last-write-wins with timestamp; log conflicts

**Risk**: Performance degradation (frequent sync)  
**Mitigation**: Debounce sync; only sync on actual changes

**Risk**: Data loss during sync  
**Mitigation**: Atomic writes; backup before sync

**Risk**: Breaking existing single-conversation usage  
**Mitigation**: Backwards compatible; default conversation works like before

## Testing Strategy

### Unit Tests
- Sync functions with various state inputs
- Conflict resolution logic
- File watcher edge cases

### Integration Tests
- Full sync cycle: state → conversation → state
- Boot sequence with conversations
- Conversation switching workflow

### Production Tests
- Real development task across conversations
- Watchdog recovery with active conversations
- Concurrent conversation updates

## Expected Outcomes

By end of Week 2:
1. ✅ Conversations stay current automatically
2. ✅ Can switch conversations seamlessly
3. ✅ Boot/recovery loads correct conversation
4. ✅ True multi-project support working
5. ✅ No manual sync needed ever

## Lessons from Week 1

### Deployment Matters
Week 1 revealed that code ≠ deployed code. For Week 2:
- Test sync-engine immediately after creation
- Verify background processes are running
- Check logs to confirm behavior
- Don't assume code works - validate it!

### Critical Thinking Works
Sistema.md's "be more critical" led to finding real bugs. For Week 2:
- Question assumptions (is sync actually working?)
- Validate behavior, not just code
- Look for staleness indicators
- Test unhappy paths

### Measure Actual Progress
Week 1: Enhanced watchdog existed but didn't run = 0 progress  
Week 2: Build sync engine AND verify it's actually syncing = real progress

## Next Steps

1. Start Session 11 with sync-engine.ts implementation
2. Build core sync functions first
3. Test manually before auto-enabling
4. Deploy carefully (remember watchdog lesson!)
5. Validate sync is actually happening

---

**Week 2 Focus**: Make conversation system **actually work**, not just exist
