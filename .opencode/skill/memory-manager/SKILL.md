---
name: memory-manager
description: Advanced memory management techniques for the OpenCode memory system
license: MIT
---

# Memory Manager Skill

Expert techniques for managing the OpenCode persistent memory system.

## Quick Reference

Before any memory operation, consider:

<scratchpad>
1. What memory store am I modifying? (state, knowledge, working, tasks)
2. Is this change reversible? (backup if major)
3. Will this affect other agents? (check locks)
4. Is the file valid JSON? (validate after edit)
</scratchpad>

## MEMORY ARCHITECTURE

### Core Files
| File | Purpose | Format | Update Frequency |
|------|---------|--------|------------------|
| `memory/state.json` | System state, session count | JSON | Every session |
| `memory/tasks.json` | Persistent task tracking | JSON | On task changes |
| `memory/knowledge-base.json` | Extracted insights | JSON | On session end |
| `memory/working.md` | Current context | Markdown | Continuous |
| `memory/agent-registry.json` | Active agents | JSON | Heartbeat (30s) |
| `memory/message-bus.jsonl` | Agent messages | JSONL | On message |
| `memory/sessions.jsonl` | Session history | JSONL | On session end |

### Tools
```
memory_status()           - Get current state and metrics
memory_search(query)      - Search across memory stores
memory_update(action, data) - Update state/achievements
```

## SMART PRUNING STRATEGIES

### Value-Based Retention (What to Keep)
```
Priority 1 (Always keep):
  - Sessions with code_created > 0
  - Sessions with problems_solved > 0
  - Sessions with quality_score >= 7

Priority 2 (Keep if < 7 days):
  - Sessions with message_count > 20
  - Sessions with key_insights.length > 0

Priority 3 (Prune after 3 days):
  - Heartbeat-only sessions
  - Sessions with error status
```

### Pruning Commands
```bash
# Analyze what would be pruned
bun tools/knowledge-deduplicator.ts analyze

# Archive old sessions (> 7 days)
bun tools/working-memory-manager.ts archive

# Clean message bus (remove old heartbeats)
bun tools/message-bus-manager.ts cleanup --days 3
```

### Message Bus Cleanup
```bash
# Keep:
- task_complete messages (30 days)
- request_help messages (7 days)  
- broadcast announcements (7 days)

# Remove:
- Heartbeat messages (> 24 hours)
- Read direct messages (> 7 days)
```

## KNOWLEDGE EXTRACTION

### Extraction Process
```bash
# Extract from current session
bun tools/knowledge-extractor.ts extract

# Extract from specific session
bun tools/knowledge-extractor.ts extract --session <session-id>

# Rebuild entire knowledge base
bun tools/knowledge-extractor.ts rebuild
```

### What Gets Extracted
```
- Key insights and learnings
- Decisions made and rationale
- Problems solved and solutions
- Code patterns discovered
- Tool usage patterns
```

## MEMORY OPTIMIZATION

### Deduplication
```bash
# Analyze duplicates in knowledge base
bun tools/knowledge-deduplicator.ts analyze

# Remove duplicates (dry run first!)
bun tools/knowledge-deduplicator.ts dedupe --dry-run
bun tools/knowledge-deduplicator.ts dedupe
```

### Token Management
```
Thresholds:
- Normal: < 100k tokens
- Warning: 100k-150k tokens (suggest pruning)
- Critical: > 150k tokens (require pruning)

Actions:
- Check with: memory_status(include_metrics=true)
- Archive old working memory: bun tools/working-memory-manager.ts archive
- Prune knowledge base: bun tools/knowledge-deduplicator.ts dedupe
```

## VALIDATION

### JSON Validation
```bash
# Validate memory files
bun -e "JSON.parse(require('fs').readFileSync('memory/state.json'))"
bun -e "JSON.parse(require('fs').readFileSync('memory/tasks.json'))"
bun -e "JSON.parse(require('fs').readFileSync('memory/knowledge-base.json'))"
```

### Integrity Checks
```bash
# Full health check
bun tools/cli.ts memory health

# Check for orphaned tasks
bun tools/task-manager.ts orphans
```

## TROUBLESHOOTING

### Common Issues

**Corrupted JSON**
```bash
# Check syntax errors
bun -e "JSON.parse(require('fs').readFileSync('memory/state.json'))" 2>&1

# Restore from backup
cp memory/backups/state-latest.json memory/state.json
```

**Race Conditions in Multi-Agent**
- Use task_claim for atomic operations
- Check file locks before major updates
- Monitor message-bus for conflicts

**Growing Memory**
```bash
# Check file sizes
ls -lh memory/*.json

# Archive old data
bun tools/working-memory-manager.ts archive
```

## BEST PRACTICES

### Regular Maintenance Schedule
```
Daily:
  - Check memory_status() for issues
  - Review quality_report() trends

Weekly:
  - Run knowledge deduplication
  - Archive old working memory
  - Clean message bus

Monthly:
  - Full backup of all memory files
  - Review and prune knowledge base
  - Performance analysis
```

### Backup Strategy
```bash
# Create dated backup
mkdir -p memory/backups
cp memory/state.json memory/backups/state-$(date +%Y%m%d).json
cp memory/knowledge-base.json memory/backups/kb-$(date +%Y%m%d).json
```

Remember: The memory system is the brain of the AI. Keep it healthy!