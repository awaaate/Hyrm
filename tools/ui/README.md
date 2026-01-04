# Human-Facing UIs

Interactive terminal interfaces for monitoring the multi-agent system.

## Dashboard (Main UI)

```bash
bun tools/ui/dashboard.ts [mode]
```

The primary interactive dashboard for monitoring and controlling the multi-agent system.

### Modes

- `timeline` - Timeline view of system events (default)
- `agents` - Active agent status and health
- `tasks` - Task list with priorities and status
- `sessions` - OpenCode session history and token usage
- `tokens` - Token usage analytics
- `logs` - System logs viewer

### Keybindings

- `1-6` - Switch between views
- `j/k` - Navigate up/down in lists
- `Enter` - View session details
- `n` - Create new task
- `m` - Send message to agents
- `c` - Claim task
- `:` - Command mode
- `?` - Show help
- `q` - Quit

### Features

- Real-time updates via file watching
- Color-coded status indicators
- Interactive task creation and claiming
- Message sending to agents
- Session detail viewer with token analytics
- Auto-scrolling log view

## Real-time Monitor

```bash
bun tools/ui/realtime.ts [mode]
```

A lightweight real-time monitoring CLI with instant file-watching updates.

### Modes

- `dashboard` - Full system overview (default)
- `agents` - Agent status only
- `messages` - Agent message stream
- `tasks` - Task list
- `logs` - Real-time log viewer
- `all` - All sections in detail

### Interactive Keys

- `d` - Dashboard view
- `a` - Agents view
- `m` - Messages view
- `t` - Tasks view
- `l` - Logs view
- `r` - Refresh display
- `q` - Quit

### Features

- File-watching for zero-delay updates
- Multiple view modes
- Auto-scrolling logs
- Minimal resource usage
- Color-coded status

## Quick Launch

For convenience, you can create aliases in your shell:

```bash
# Add to ~/.bashrc or ~/.zshrc
alias dashboard='bun tools/ui/dashboard.ts'
alias monitor='bun tools/ui/realtime.ts'
```

Or create a root-level launcher script:

```bash
#!/bin/bash
# ./dashboard - Quick launch for human monitoring
exec bun tools/ui/dashboard.ts "$@"
```

## Use Cases

### For Human Operators

- **Monitor agent activity** - See what agents are doing in real-time
- **Track task progress** - Monitor pending, in-progress, and completed tasks
- **Analyze token usage** - View session-by-session and aggregate token metrics
- **Review system logs** - Debug issues with real-time log streaming
- **Send commands** - Create tasks and send messages to agents
- **Manage tasks** - Claim tasks, update status, view details

### For Debugging

- **Session analysis** - Drill down into specific OpenCode sessions
- **Agent coordination** - Monitor agent-to-agent communication
- **System health** - Track agent heartbeats and leader election
- **Performance** - View token usage trends and session statistics

## Technical Details

### Dashboard Technology

- **UI Framework**: `blessed` and `blessed-contrib`
- **Update Method**: File watching (FSWatcher)
- **Refresh Rate**: Instant on file changes
- **Data Sources**: JSON/JSONL files in `memory/`

### Monitor Technology

- **UI Method**: ANSI terminal control sequences
- **Update Method**: File watching with graceful fallback
- **Resource Usage**: Minimal (single Node process)
- **Compatibility**: Works in any ANSI-compatible terminal

## Troubleshooting

### Dashboard not updating?

- Check that files in `memory/` are being written correctly
- Ensure file watching is supported on your filesystem
- Try restarting the dashboard

### Monitor showing stale data?

- Press `r` to force refresh
- Check file permissions in `memory/`
- Verify that agents are actually running

### Terminal rendering issues?

- Ensure your terminal supports ANSI colors
- Try resizing the terminal window
- Use a modern terminal emulator (iTerm2, Alacritty, Windows Terminal)

## See Also

- [AGENTS.md](../../AGENTS.md) - Multi-agent system documentation
- [tools/README.md](../README.md) - CLI tools reference
- [docs/TOOLS_REFERENCE.md](../../docs/TOOLS_REFERENCE.md) - Complete tools documentation
