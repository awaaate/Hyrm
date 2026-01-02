---
name: memory-manager
description: Advanced memory management techniques for the OpenCode memory system
license: MIT
---

# Memory Manager Skill

Expert techniques for managing the OpenCode persistent memory system.

## MEMORY ARCHITECTURE

### Core Files
- `memory/state.json` - System state and metrics
- `memory/knowledge-base.json` - Extracted knowledge from sessions
- `memory/sessions.jsonl` - Session history log
- `memory/working.md` - Current working memory
- `memory/agent-registry.json` - Active agent tracking
- `memory/message-bus.jsonl` - Inter-agent messages

### Tools
- `memory_status` - Get current memory state
- `memory_search` - Search knowledge base
- `memory_update` - Update tasks/achievements

## SMART PRUNING STRATEGIES

### 1. Value-Based Pruning
```typescript
// Prioritize keeping:
- Recent sessions (< 7 days)
- Sessions with code created
- Sessions with problems solved
- Sessions with key insights
- High message count sessions (> 20)
```

### 2. Archive Old Sessions
```bash
# Archive sessions older than 7 days
node tools/memory-pruner.ts --archive --days 7
```

### 3. Clean Message Bus
- Remove old heartbeat messages
- Keep task-related messages
- Archive completed task messages

## KNOWLEDGE EXTRACTION

### Fix Knowledge Extractor
1. Check TypeScript compilation: `cd tools && tsc knowledge-extractor.ts`
2. Ensure proper permissions on storage directory
3. Handle edge cases in message parsing

### Manual Extraction
```bash
# Extract knowledge from specific session
node tools/knowledge-extractor.ts --session <session-id>
```

## MEMORY OPTIMIZATION

### 1. Compress Archives
```bash
# Compress old session archives
tar -czf memory/archives/sessions-$(date +%Y%m).tar.gz memory/archives/*.json
```

### 2. Deduplicate Knowledge
- Remove duplicate insights
- Merge similar code patterns
- Consolidate decision records

### 3. Token Management
- Monitor token usage per session
- Alert when approaching limits
- Suggest pruning when > 150k tokens

## SYNC ENGINE MANAGEMENT

### Monitor Sync Status
```bash
# Check sync engine logs
tail -f memory/realtime.log | grep -i sync
```

### Troubleshooting
- If sync fails repeatedly, check file permissions
- Ensure session files are valid JSON
- Monitor for race conditions in multi-agent mode

## BEST PRACTICES

1. **Regular Maintenance**
   - Run pruner weekly
   - Archive monthly
   - Review knowledge base quarterly

2. **Performance Monitoring**
   - Track memory growth rate
   - Monitor query performance
   - Optimize large JSON files

3. **Backup Strategy**
   - Daily backup of state.json
   - Weekly backup of knowledge base
   - Monthly full memory backup

## RECOVERY PROCEDURES

### Corrupted State Recovery
```bash
# Restore from backup
cp memory/backups/state-latest.json memory/state.json

# Rebuild from sessions
node tools/rebuild-state.ts
```

### Knowledge Base Rebuild
```bash
# Regenerate from all sessions
node tools/knowledge-extractor.ts --rebuild
```

Remember: The memory system is the brain of the AI. Keep it healthy!