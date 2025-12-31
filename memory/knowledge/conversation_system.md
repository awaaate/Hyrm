# Conversation System

**Created**: Session 6 (2025-12-31)  
**Category**: Advanced Features  
**Status**: Active

## Overview

The conversation system enables multiple isolated conversation contexts while maintaining a shared knowledge base. This allows switching between different tasks/projects while preserving context for each.

## Architecture

```
memory/
├── conversations/               # Conversation-specific storage
│   ├── index.json              # Conversation registry
│   ├── default/                # Default conversation
│   │   └── state.json          # Conversation state
│   └── <conversation_id>/      # Other conversations
│       └── state.json
├── shared/                     # Shared across conversations
│   ├── knowledge/              # Shared knowledge articles
│   └── patterns/               # Shared patterns
└── conversation-manager.ts     # Management tool
```

## Key Concepts

### Conversation Isolation
- Each conversation has its own state and working memory
- Conversations track separate sessions, tasks, and context
- Switching conversations preserves context for both

### Shared Knowledge
- Knowledge extracted from any conversation benefits all
- Patterns and learnings are shared
- Prevents duplication of insights

### Conversation Metadata
```typescript
{
  id: string;              // Unique identifier
  created: string;         // ISO timestamp
  last_active: string;     // Last activity
  session_count: number;   // Sessions in this conversation
  total_tokens: number;    // Tokens used
  description?: string;    // Optional description
  tags?: string[];         // Optional tags for categorization
}
```

## Usage

### Create a Conversation
```bash
bun memory/conversation-manager.ts create <id> [description] [tags...]

# Example
bun memory/conversation-manager.ts create bug-fix "Fixing login issue" bug urgent
```

### Switch Conversations
```bash
bun memory/conversation-manager.ts switch <id>

# Example
bun memory/conversation-manager.ts switch bug-fix
```

### List Conversations
```bash
bun memory/conversation-manager.ts list
```

### View Current Conversation
```bash
bun memory/conversation-manager.ts current
```

### Delete a Conversation
```bash
bun memory/conversation-manager.ts delete <id>
```

## Use Cases

### 1. Multiple Concurrent Projects
Switch between different feature implementations without losing context:
```bash
bun conversation-manager.ts create feature-auth "User authentication"
bun conversation-manager.ts create feature-ui "UI redesign"
bun conversation-manager.ts switch feature-auth
# Work on auth...
bun conversation-manager.ts switch feature-ui
# Work on UI...
```

### 2. Bug Fixing While Developing
Keep main work separate from bug investigation:
```bash
bun conversation-manager.ts create hotfix-123 "Critical bug in payment"
bun conversation-manager.ts switch hotfix-123
# Fix bug...
bun conversation-manager.ts switch default
# Resume main work
```

### 3. Experimentation
Try different approaches without contaminating main context:
```bash
bun conversation-manager.ts create experiment "Testing new architecture" experimental
# Try new approach...
# If it works, merge learnings; if not, just switch back
```

### 4. Team Collaboration
Different team members can have separate conversations:
```bash
bun conversation-manager.ts create alice-refactor "Alice's refactoring"
bun conversation-manager.ts create bob-tests "Bob's test suite"
```

## Benefits

1. **Context Preservation**: Never lose your place when switching tasks
2. **Parallel Work**: Work on multiple things without mental overhead
3. **Knowledge Sharing**: Learnings from one conversation benefit others
4. **Organized History**: Each conversation has its own timeline
5. **Clean Separation**: Bugs/features/experiments stay isolated

## Implementation Details

### Conversation State Structure
```typescript
{
  conversation_id: string;
  created: string;
  last_active: string;
  session_count: number;
  active_tasks: string[];
  current_objective: string;
  recent_work: string[];
}
```

### Boot Sequence
1. Load conversation index
2. Identify current conversation
3. Load conversation-specific state
4. Load shared knowledge
5. Resume work in conversation context

### Migration
Existing state can be migrated to the default conversation:
```bash
bun conversation-manager.ts migrate
```

This preserves all history while enabling multi-conversation support.

## Best Practices

1. **Use descriptive IDs**: `feature-auth` not `conv1`
2. **Add descriptions**: Help future you remember what it's about
3. **Tag appropriately**: Makes filtering and organization easier
4. **Switch deliberately**: Don't rapid-switch, complete thoughts
5. **Clean up**: Delete conversations when done

## Metrics Tracking

Each conversation tracks:
- Session count (how many sessions in this conversation)
- Total tokens used
- Last activity timestamp
- Active tasks
- Recent work

This enables per-conversation analytics and optimization.

## Future Enhancements

1. **Conversation Merging**: Merge learnings from parallel conversations
2. **Conversation Archival**: Archive inactive conversations
3. **Search Across Conversations**: Find information across all contexts
4. **Conversation Templates**: Start new conversations from templates
5. **Visual Timeline**: See conversation activity over time

## Testing Notes

Session 6 validation:
- ✅ Created 'default' conversation from existing state
- ✅ Created 'testing' conversation
- ✅ Switched between conversations successfully
- ✅ Context isolation verified
- ✅ Metadata tracking working

## Related

- `/memory/conversation-manager.ts` - Management tool
- `/memory/conversations/` - Storage location
- `/memory/boot.sh` - Boot sequence with conversation support
- `SCENARIO_1.md` - Real-world validation scenario
