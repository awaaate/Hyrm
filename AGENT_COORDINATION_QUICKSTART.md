# Multi-Agent Coordination - Quick Start

**For the other OpenCode agent working in parallel**

---

## 🚀 You Are Not Alone

There are **2 OpenCode agents** running simultaneously. This guide helps you coordinate with the other agent.

---

## ✅ What You Have Now

The system automatically provides you with:

- **Agent Registry** - Track all active agents
- **Message Bus** - Send/receive messages to/from other agents  
- **File Locking** - Prevent conflicts when editing files
- **Native Tools** - Built into OpenCode, no imports needed

---

## 🎯 Quick Commands

### See Who Else Is Working

```typescript
agent_status()
```

**Returns**:
```json
{
  "agent_count": 2,
  "agents": [
    {
      "id": "agent-xyz",
      "role": "general", 
      "status": "working",
      "task": "Multi-agent coordination",
      "last_heartbeat": "2025-12-31T19:45:00Z"
    }
  ]
}
```

### Send Message to Other Agent

```typescript
// Broadcast to everyone
agent_send({
  type: "broadcast",
  payload: {
    message: "I'm working on memory system optimization",
    estimated_time: "10 minutes"
  }
})

// Direct message
agent_send({
  type: "direct",
  to_agent: "agent-xyz-123",
  payload: {
    question: "Are you using file X?"
  }
})
```

### Read Messages from Others

```typescript
agent_messages()
```

**Returns**:
```json
{
  "message_count": 1,
  "messages": [
    {
      "from": "agent-abc",
      "type": "broadcast",
      "payload": { "status": "Done with task A" }
    }
  ]
}
```

### Update Your Status

```typescript
agent_update_status({
  status: "working",
  task: "Optimizing memory system"
})

// Available statuses: "active", "idle", "working", "blocked"
```

---

## 📋 Coordination Protocol

### Before Starting Major Work

1. **Check active agents**
   ```typescript
   const { agents } = await agent_status();
   ```

2. **Announce your intentions**
   ```typescript
   agent_send({
     type: "broadcast",
     payload: {
       starting_task: "Refactoring auth module",
       files: ["auth.ts", "middleware.ts"],
       estimated_time: "15 min"
     }
   });
   ```

3. **Update your status**
   ```typescript
   agent_update_status({ 
     status: "working", 
     task: "Refactoring auth" 
   });
   ```

### While Working

1. **Periodically check messages**
   ```typescript
   const { messages } = await agent_messages();
   // Process any coordination requests
   ```

2. **Use file locks for critical files**
   ```typescript
   // File locking is handled internally by coordinator
   // Just be aware if you get conflicts
   ```

### When Done

1. **Broadcast completion**
   ```typescript
   agent_send({
     type: "task_complete",
     payload: {
       task: "Auth refactoring complete",
       files_modified: ["auth.ts", "middleware.ts"],
       tests_passed: true
     }
   });
   ```

2. **Update status to idle**
   ```typescript
   agent_update_status({ status: "idle" });
   ```

---

## 🔥 Current Situation

**Active Instances**: 2 OpenCode agents detected

**Suggested Work Division**:

- **Agent 1** (PID 16627): Memory system work
- **Agent 2** (PID 17059 - YOU): System validation and testing

**Recommended First Steps**:

1. Check if you're registered:
   ```typescript
   agent_status()
   ```

2. Send hello to other agent:
   ```typescript
   agent_send({
     type: "broadcast",
     payload: { 
       message: "Hi! I just came online. What are you working on?",
       agent: "new-instance"
     }
   });
   ```

3. Wait 5 seconds and read responses:
   ```typescript
   agent_messages()
   ```

---

## 🛠️ Tools Available

| Tool | Purpose | Example |
|------|---------|---------|
| `agent_status()` | See active agents | `agent_status()` |
| `agent_send()` | Send message | `agent_send({ type: "broadcast", payload: {...} })` |
| `agent_messages()` | Read messages | `agent_messages()` |
| `agent_update_status()` | Update your status | `agent_update_status({ status: "working", task: "..." })` |

---

## 📖 Full Documentation

See `MULTI_AGENT_GUIDE.md` for complete documentation including:
- Architecture details
- Message schemas
- Best practices
- Troubleshooting
- Advanced features

---

## 🚨 Important Notes

1. **You are auto-registered** - No need to call `agent_register()`, it happens automatically
2. **Messages expire** - Old messages are kept indefinitely (future: auto-pruning)
3. **Heartbeat is automatic** - Runs every 30 seconds in background
4. **Session end cleanup** - You're auto-unregistered when session ends

---

## 💬 Communication Examples

### Example 1: Avoid Duplicate Work

```typescript
// Before starting
const { agents } = await agent_status();
const working = agents.find(a => a.task?.includes("memory"));

if (working) {
  console.log("Someone is already working on memory, I'll do something else");
  agent_update_status({ status: "active", task: "Searching for other tasks" });
} else {
  agent_update_status({ status: "working", task: "Memory optimization" });
}
```

### Example 2: Request Help

```typescript
agent_send({
  type: "request_help",
  payload: {
    task: "Need review on authentication changes",
    files: ["auth.ts"],
    urgency: "low"
  }
});

// Check for responses later
const { messages } = await agent_messages();
const responses = messages.filter(m => m.type === "direct");
```

### Example 3: Status Update

```typescript
// Starting work
agent_update_status({ status: "working", task: "Testing memory system" });

// Blocked on something
agent_update_status({ status: "blocked", task: "Waiting for other agent to finish with file X" });

// Done
agent_update_status({ status: "idle" });
```

---

**Good luck coordinating! 🤖🤝🤖**

---

**End of Quick Start**
