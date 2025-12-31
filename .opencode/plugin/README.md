# Memory System Plugin

This OpenCode plugin provides real-time memory updates for the persistent memory system.

## Features

- **Session Tracking**: Automatically logs session start/end events
- **Metrics Collection**: Tracks tool calls, tokens, and session duration
- **File Edit Monitoring**: Detects when files are modified by AI
- **Compaction Tracking**: Logs when context compaction occurs
- **Error Logging**: Captures session errors for debugging

## How It Works

The plugin hooks into OpenCode's event system to:

1. Listen for `session.created` events and start tracking
2. Monitor `tool.execute.after` to count tool usage
3. Detect `file.edited` events for knowledge extraction
4. Log `session.idle` and update metrics.json
5. Track `session.error` for debugging

## Files Updated

- `memory/sessions.jsonl` - Appends session events in JSON Lines format
- `memory/metrics.json` - Updates session counts and timestamps
- `memory/state.json` - Will be updated in future versions

## Events Tracked

| Event Type | Action |
|------------|--------|
| `session.created` | Start session timer, log start |
| `session.idle` | Log end, update metrics |
| `session.error` | Log error for debugging |
| `file.edited` | Track AI edits for knowledge |
| `session.compacted` | Log compaction events |

## Installation

The plugin is auto-loaded from `.opencode/plugin/` directory.

## Logs

Console output is prefixed with `[Memory]` for easy filtering.

## Future Enhancements

- Real-time state.json updates
- Automatic knowledge extraction on file edits
- Token usage tracking via API
- Intelligent memory pruning triggers
- Integration with auto-update daemon
