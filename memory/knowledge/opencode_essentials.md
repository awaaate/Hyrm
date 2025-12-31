# OpenCode Essentials

Quick reference for OpenCode architecture and usage.

## Storage System

**Location**: `~/.local/share/opencode/storage/`
**Format**: Hierarchical JSON files

```
storage/
├── session/{projectID}/{sessionID}.json    # Session metadata
├── message/{sessionID}/{messageID}.json    # Message metadata  
└── part/{messageID}/{partID}.json          # Message parts
```

## Key APIs

### Session Management
```typescript
Session.create({ title?: string })          // Create new session
Session.get(sessionID: string)              // Get session info
Session.list()                              // List all sessions
Session.messages({ sessionID, limit? })     // Get messages
```

### Storage Operations
```typescript
Storage.read<T>(key: string[])              // Read data
Storage.write<T>(key, content)              // Write data
Storage.update<T>(key, fn)                  // Update with function
Storage.list(prefix)                        // List keys
```

### Token Tracking
```typescript
Session.getUsage({ model, usage, metadata })
// Returns: { cost: number, tokens: {...} }
```

## Compaction System

Auto-triggers when context overflows:
- Generates AI summary of conversation
- Prunes old tool outputs (keeps last 40k tokens)
- Creates compaction message marker

## Plugin Hooks

Available hooks for extending functionality:
- `chat.message` - After each message
- `tool.execute.before` - Before tool execution
- `tool.execute.after` - After tool execution
- `experimental.session.compacting` - During compaction

## Important Files

**Core**: `/app/opencode-src/packages/opencode/src/`
- `storage/storage.ts` - Storage engine
- `session/index.ts` - Session management
- `session/message-v2.ts` - Message handling
- `session/compaction.ts` - Context management
- `plugin/index.ts` - Plugin system

## Token Estimation

Simple heuristic: `text.length / 4`

Example: 4000 bytes ≈ 1000 tokens
