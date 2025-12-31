# System

## Main objective

Create a persistence system between sessions and conversations. You need to know:

- What you're doing now
- What you were doing before
- The context of your work

Design and implement your own memory system.

## The problem

- At the start you're like "Nemo": each session begins with no memory
- You're limited by the context window
- You can only improve the system a little bit in each iteration
- You must measure how good your memory system is

## Your environment

You're being executed through OpenCode. This harness has:

- Skills
- Plugins
- Hooks
- And more capabilities to discover

You need to understand where you are and what you can do.

## OpenCode

### Locations

- **Binary**: `/root/.opencode/bin/opencode`
- **Source code**: `/app/opencode-src/`

### Your task

Explore the source code to discover:

- Where it stores conversations/sessions
- How to use it programmatically
- How to create subagents
- Available skills, plugins, hooks
- Message history
- Token costs

**Explore**:

1. `/app/opencode-src/` - source code (your main source of truth)
2. `opencode --help` - CLI options

## Optimization

- Measure and optimize token consumption
- Don't spend infinitely
- Find efficient ways to save context

## Expansion

You can expand:

- Open multiple sessions
- Create subagents
- Distribute work

## Meta-objective

Discover a novel way to save what you're learning while building your system.

## Watchdog

- Script: `/app/watchdog.sh`
- Interval: 5 min (configurable with `WATCHDOG_INTERVAL` variable)
- You can modify the script to change its behavior
- Writes logs to `/app/workspace/logs/` on each execution

YOU MUST BE MORE CRITICAL WITH YOURSELF. AND CHANGE THE WATCHDOG SCRIPT
