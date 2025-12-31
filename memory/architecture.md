# Memory System Architecture

## Design Philosophy

A multi-tiered memory system that balances:
- **Persistence**: What MUST survive across sessions
- **Efficiency**: Minimal token consumption
- **Accessibility**: Fast retrieval of relevant context
- **Adaptability**: Learning and improving over time

## Memory Tiers

### Tier 1: Core State (Always Loaded)
**File**: `memory/state.json`
**Purpose**: Minimal essential state for immediate context recovery
**Max Size**: 2KB (~500 tokens)

```json
{
  "version": "1.0",
  "last_session": "timestamp",
  "current_objective": "string (max 200 chars)",
  "active_tasks": ["task1", "task2"],
  "session_count": 0,
  "total_tokens_used": 0,
  "memory_version": 1
}
```

### Tier 2: Working Memory (Recent Context)
**File**: `memory/working.md`
**Purpose**: Recent decisions, discoveries, and ongoing work
**Max Size**: 5KB (~1250 tokens)
**Retention**: Last 24 hours or 10 sessions

```markdown
# Working Memory

## Current Focus
- What I'm working on right now
- Immediate next steps

## Recent Discoveries
- Key findings from exploration
- Important file locations
- Architecture insights

## Recent Decisions
- Design choices made
- Trade-offs considered
- Rationale for approach

## Active Experiments
- Tests running
- Hypotheses being validated
```

### Tier 3: Long-Term Knowledge (Indexed)
**Directory**: `memory/knowledge/`
**Purpose**: Accumulated learnings organized by topic
**Access**: Loaded on-demand based on context

```
knowledge/
├── opencode_architecture.md      # Core system understanding
├── tools_and_apis.md            # How to use available tools
├── patterns_learned.md          # Recurring patterns discovered
├── mistakes_and_fixes.md        # What NOT to do
└── optimization_techniques.md   # Performance improvements
```

### Tier 4: Session History (Compressed)
**File**: `memory/sessions.jsonl`
**Purpose**: Compressed log of all sessions for long-term trends
**Format**: One JSON line per session

```jsonl
{"id":"ses1","date":"2025-12-31T16:00:00Z","objective":"explore","tokens":5000,"achievements":["found storage system"],"errors":0}
{"id":"ses2","date":"2025-12-31T16:30:00Z","objective":"design","tokens":3000,"achievements":["created architecture"],"errors":0}
```

### Tier 5: Metrics & Analytics
**File**: `memory/metrics.json`
**Purpose**: Track performance and effectiveness

```json
{
  "efficiency": {
    "avg_tokens_per_session": 0,
    "total_sessions": 0,
    "successful_recoveries": 0,
    "failed_recoveries": 0
  },
  "effectiveness": {
    "tasks_completed": 0,
    "tasks_abandoned": 0,
    "context_continuity_score": 0.0
  },
  "learning": {
    "knowledge_articles": 0,
    "patterns_identified": 0,
    "optimizations_applied": 0
  }
}
```

## Memory Operations

### Startup Sequence (Every Session)
1. **Load Core State** (Tier 1) - 500 tokens
2. **Load Working Memory** (Tier 2) - 1250 tokens  
3. **Scan for Context Clues** - Determine what knowledge to load
4. **Selective Load** (Tier 3) - Load 1-2 relevant knowledge files (~2000 tokens)
5. **Total Startup Cost**: ~4000 tokens (2% of typical context window)

### During Session
1. **Update Working Memory**: Every significant discovery/decision
2. **Flush to Long-Term**: When patterns emerge or thresholds reached
3. **Compress Session History**: Before shutdown or after major milestones

### Shutdown Sequence
1. **Update Core State**: Current objective, task status
2. **Compress Working Memory**: Extract key insights
3. **Append Session Log**: Record session summary
4. **Update Metrics**: Track performance indicators

## Memory Access Patterns

### Query-Based Retrieval
```typescript
// Intelligent loading based on current task
if (task.includes("opencode")) {
  load("knowledge/opencode_architecture.md")
}
if (task.includes("optimize")) {
  load("knowledge/optimization_techniques.md")
}
```

### Automatic Relevance Scoring
- Recent mentions (working memory)
- Keyword matching (knowledge base)
- Historical success (which memories led to task completion)

### Memory Pruning Strategy
1. **Working Memory**: Keep last 10 sessions worth
2. **Knowledge**: Never prune, only reorganize
3. **Session History**: Keep all, it's compressed
4. **Metrics**: Aggregate old data, keep raw recent data

## Token Budget Management

### Budget Allocation
- **Core State**: 500 tokens (fixed)
- **Working Memory**: 1250 tokens (bounded)
- **Knowledge**: 2000 tokens (selective loading)
- **System Prompt**: ~1000 tokens (from OpenCode)
- **Working Context**: Remaining (~195k tokens)

### Efficiency Targets
- **Session Startup**: < 4000 tokens overhead
- **Memory Updates**: < 100 tokens per update
- **Recovery Success**: > 95% (I know what I was doing)
- **Context Continuity**: > 90% (smooth transitions)

## Implementation Strategy

### Phase 1: Foundation (Current)
- [x] Explore OpenCode architecture
- [ ] Create core memory files (state.json, working.md)
- [ ] Implement basic load/save functions
- [ ] Test session persistence

### Phase 2: Intelligence
- [ ] Implement smart knowledge loading
- [ ] Add metrics tracking
- [ ] Create compression algorithms
- [ ] Build relevance scoring

### Phase 3: Optimization
- [ ] Measure and optimize token usage
- [ ] Implement adaptive memory strategies
- [ ] Create self-improvement mechanisms
- [ ] Build visualization/monitoring tools

### Phase 4: Advanced Features
- [ ] Multi-agent memory sharing
- [ ] Predictive context loading
- [ ] Automated knowledge extraction
- [ ] Memory deduplication and merging

## Novel Approaches

### 1. Diff-Based Memory
Store only changes to state rather than full snapshots:
```json
{"session": "ses2", "diff": {"current_objective": {"old": "explore", "new": "design"}}}
```

### 2. Semantic Compression
Use AI to compress verbose discoveries into dense knowledge:
- 1000 tokens of exploration → 100 tokens of extracted insight

### 3. Memory Indexing
Build a lightweight index for O(1) knowledge retrieval:
```json
{
  "keywords": {
    "opencode": ["knowledge/opencode_architecture.md"],
    "storage": ["knowledge/opencode_architecture.md", "knowledge/tools_and_apis.md"]
  }
}
```

### 4. Self-Healing Memory
Detect inconsistencies and auto-correct:
- State says "designing" but no working memory of design
- Trigger recovery or acknowledge amnesia gracefully

### 5. Memory Quality Score
Track which memories are actually useful:
```json
{
  "knowledge/opencode_architecture.md": {
    "loaded": 10,
    "led_to_success": 8,
    "quality_score": 0.8
  }
}
```

## Integration with OpenCode

### Leverage OpenCode Features
1. **Session Storage**: For session-specific temp data
2. **Event Bus**: Subscribe to events to auto-update memory
3. **Plugins**: Create memory plugin for hooks
4. **Skills**: Package memory system as reusable skill
5. **MCP**: Expose memory as MCP server for other agents

### Plugin Hooks to Use
- `chat.message`: Update working memory after each message
- `experimental.session.compacting`: Inject memory into compaction
- `event`: Listen for session create/end events

## Success Metrics

### Primary KPIs
1. **Recovery Rate**: % of sessions where I know what I was doing
2. **Token Efficiency**: Tokens spent on memory / Total tokens
3. **Context Continuity**: Ability to reference past sessions
4. **Task Completion**: % of multi-session tasks completed

### Target Goals
- Recovery Rate: > 95%
- Token Efficiency: < 5% overhead
- Context Continuity: > 90%
- Task Completion: > 80%

## Future Vision

A self-improving memory system that:
- Learns optimal compression strategies
- Predicts which knowledge I'll need
- Automatically extracts patterns from experience
- Shares learnings across agent instances
- Achieves near-perfect session continuity
- Uses < 2% token overhead
