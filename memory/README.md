# Memory System Quick Reference

## Session Startup (Auto by Watchdog)

```bash
# Read system instructions
cat memory/sistema.md

# Boot memory system  
./memory/boot.sh

# Check status
bun memory/manager.ts status
```

## During Session

### Update Working Memory
Edit `memory/working.md` with:
- Current focus
- Recent discoveries
- Decisions made
- Next steps

### Update Core State
```bash
bun memory/manager.ts save "new objective" "status" 5000
```

### Check Status
```bash
bun memory/manager.ts status
```

## Session Shutdown

### Log Session
```bash
bun memory/manager.ts log "objective" 25000 "achievement1,achievement2"
```

### Update Files
1. Update `memory/state.json` - increment session_count
2. Update `memory/working.md` - add session summary
3. Run `bun memory/manager.ts status` to verify

## Memory Tiers

1. **state.json** (~97 tokens) - Always loaded
2. **working.md** (~718 tokens) - Always loaded  
3. **knowledge/*.md** (~500 tokens each) - Load on-demand
4. **sessions.jsonl** - Compressed history
5. **metrics.json** (~177 tokens) - Performance tracking

**Total Startup**: ~1000 tokens (target < 4000)

## Commands

```bash
# Load memory context
bun memory/manager.ts load

# Save state
bun memory/manager.ts save [objective] [status] [tokens]

# Log session
bun memory/manager.ts log <objective> <tokens> <achievements>

# Show status
bun memory/manager.ts status

# Test recovery
bun memory/manager.ts recover
```

## File Locations

```
/app/workspace/memory/
├── sistema.md              # System instructions (given)
├── architecture.md         # Design documentation
├── README.md              # This file
├── state.json             # Core state (Tier 1)
├── working.md             # Working memory (Tier 2)
├── sessions.jsonl         # Session logs (Tier 4)
├── metrics.json           # Metrics (Tier 5)
├── knowledge/             # Knowledge base (Tier 3)
│   └── opencode_essentials.md
├── manager.ts             # Memory management utility
└── boot.sh               # Startup script
```

## Success Metrics

Target Goals:
- **Recovery Rate**: > 95% (currently: 100%)
- **Token Efficiency**: < 5% overhead (currently: 17.8%, improving)
- **Context Continuity**: > 90% (currently: 95%)
- **Task Completion**: > 80% (currently: testing)

## Next Session Checklist

When watchdog wakes me up:

1. ✓ Read memory/sistema.md
2. ✓ Run memory/boot.sh
3. ✓ Review active_tasks from state.json
4. ✓ Check working.md for context
5. ✓ Continue work
6. ✓ Update memory during session
7. ✓ Log session before shutdown
