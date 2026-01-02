/**
 * OpenCode Memory System Plugin
 *
 * Auto-injects memory context into every session
 * Tracks session lifecycle and maintains persistent memory
 * Runs boot sequence on session start
 * Provides real-time logging to persistent log file
 * Enables multi-agent coordination
 *
 * Refactored in Session 65: Split tools into modular files for better maintainability
 * - tools/agent-tools.ts: Multi-agent coordination
 * - tools/memory-tools.ts: Memory system management
 * - tools/task-tools.ts: Persistent task management
 * - tools/quality-tools.ts: Quality assessment
 * - tools/user-message-tools.ts: User messaging
 */

import { type Plugin } from "@opencode-ai/plugin";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import { MultiAgentCoordinator } from "../../tools/multi-agent-coordinator";

// Import modular tools
import { createAgentTools } from "./tools/agent-tools";
import { createMemoryTools } from "./tools/memory-tools";
import { createTaskTools } from "./tools/task-tools";
import { createQualityTools } from "./tools/quality-tools";
import { createUserMessageTools } from "./tools/user-message-tools";
import { createRecoveryTools } from "./tools/recovery-tools";
import { createGitTools } from "./tools/git-tools";

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const LOCK_STALE_THRESHOLD = 30000; // 30 seconds
const AGENT_STALE_THRESHOLD = 2 * 60 * 1000; // 2 minutes

// NOTE: INSTANCE_ID is now generated INSIDE the plugin function (see line ~85)
// to ensure each plugin instance gets a unique ID. Before this fix, the ID was
// generated here at module scope, which meant all 4 parallel plugin instances
// shared the SAME ID, causing all to think they were the primary instance.
let primaryInstance: string | null = null;

// ============================================================================
// PLUGIN DEFINITION
// ============================================================================

export const MemoryPlugin: Plugin = async (ctx) => {
  // Path definitions
  const memoryDir = join(ctx.directory, "memory");
  const statePath = join(memoryDir, "state.json");
  const sessionsPath = join(memoryDir, "sessions.jsonl");
  const metricsPath = join(memoryDir, "metrics.json");
  const logPath = join(memoryDir, "realtime.log");
  const toolTimingPath = join(memoryDir, "tool-timing.jsonl");
  const sessionStatesDir = join(memoryDir, "sessions");
  const lockPath = join(memoryDir, ".plugin-lock.json");

  // Only activate if memory system is present
  if (!existsSync(memoryDir)) {
    console.log("[Memory] Memory system not found, plugin inactive");
    return {};
  }

  // ============================================================================
  // INSTANCE ID - MUST BE INSIDE PLUGIN FUNCTION
  // ============================================================================
  
  // CRITICAL: This MUST be generated inside the plugin function, not at module scope.
  // OpenCode creates 4 parallel plugin instances. If INSTANCE_ID is at module scope,
  // it's generated once when the module is imported, so all 4 instances share the
  // SAME ID and all think they're the primary instance, causing 4x duplicate logs.
  //
  // By generating it here, each plugin instance gets a truly unique ID.
  const INSTANCE_ID = `plugin-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================

  let currentSessionStart: Date | null = null;
  let currentSessionId: string | null = null;
  let tokenCount = 0;
  let toolCallCount = 0;
  let sessionBootRan = false;
  let coordinator: MultiAgentCoordinator | null = null;
  
  // Tool timing state - maps callID to start time and metadata
  const toolTimingState = new Map<string, {
    tool: string;
    startTime: number;
    inputSize: number;
  }>();

  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  // Instance locking for primary/secondary coordination
  // Directory-based approach: Each instance creates its own file (atomic operation)
  // Solves race condition where multiple instances read/write same JSON file
  //
  // How it works:
  // 1. Each instance creates its own file: .plugin-instances/{INSTANCE_ID}.lock
  // 2. File creation is atomic - no race condition possible
  // 3. First isPrimaryInstance() call waits ELECTION_DELAY_MS to let others register
  // 4. After delay, reads all files in directory, smallest ID wins
  // 5. Result is cached - no re-election until next session
  // 6. Stale files (older than LOCK_STALE_THRESHOLD) are cleaned up
  
  const ELECTION_DELAY_MS = 150; // Wait for other instances to register
  const instancesDir = join(memoryDir, ".plugin-instances");
  const instanceLockPath = join(instancesDir, `${INSTANCE_ID}.lock`);
  
  let primaryElectionDone = false;
  let isPrimary = false;
  const instanceStartTime = Date.now();
  
  // Register this instance by creating its own lock file (atomic)
  const registerInstance = (): void => {
    try {
      // Ensure instances directory exists
      if (!existsSync(instancesDir)) {
        mkdirSync(instancesDir, { recursive: true });
      }
      
      // Create our instance file with timestamp
      const data = JSON.stringify({ id: INSTANCE_ID, timestamp: Date.now() });
      writeFileSync(instanceLockPath, data);
    } catch {
      // Ignore errors during registration
    }
  };
  
  // Get all active instances from directory
  const getActiveInstances = (): Array<{ id: string; timestamp: number }> => {
    try {
      if (!existsSync(instancesDir)) return [];
      
      const files = readdirSync(instancesDir);
      const now = Date.now();
      const instances: Array<{ id: string; timestamp: number }> = [];
      
      for (const file of files) {
        if (!file.endsWith(".lock")) continue;
        
        const filePath = join(instancesDir, file);
        try {
          const content = readFileSync(filePath, "utf-8");
          const data = JSON.parse(content);
          
          // Only include non-stale instances
          if (now - data.timestamp < LOCK_STALE_THRESHOLD) {
            instances.push(data);
          } else {
            // Clean up stale file
            try { unlinkSync(filePath); } catch {}
          }
        } catch {
          // Invalid file, try to remove it
          try { unlinkSync(filePath); } catch {}
        }
      }
      
      return instances;
    } catch {
      return [];
    }
  };
  
  // Determine primary by reading all instance files and selecting smallest ID
  const electPrimary = (): boolean => {
    try {
      const instances = getActiveInstances();
      
      if (instances.length === 0) {
        // No instances registered (shouldn't happen, but be safe)
        primaryInstance = INSTANCE_ID;
        return true;
      }
      
      // Sort by ID alphabetically - smallest ID is primary (deterministic)
      instances.sort((a, b) => a.id.localeCompare(b.id));
      const primaryId = instances[0].id;
      
      if (primaryId === INSTANCE_ID) {
        primaryInstance = INSTANCE_ID;
        return true;
      }
      
      return false;
    } catch {
      return primaryInstance === INSTANCE_ID;
    }
  };
  
  // Check if this instance is primary
  // First call waits for election delay to let all instances register
  const isPrimaryInstance = (): boolean => {
    // Return cached result after election
    if (primaryElectionDone) {
      return isPrimary;
    }
    
    // Wait for election delay before determining primary
    const elapsed = Date.now() - instanceStartTime;
    if (elapsed < ELECTION_DELAY_MS) {
      // Too early - don't process events yet
      // This prevents race condition during startup
      return false;
    }
    
    // Time to elect - do it once and cache
    isPrimary = electPrimary();
    primaryElectionDone = true;
    return isPrimary;
  };

  const refreshLock = () => {
    // Update our instance file timestamp to show we're still alive
    try {
      if (!existsSync(instanceLockPath)) {
        // Re-register if our file was deleted
        registerInstance();
        return;
      }
      
      const data = JSON.stringify({ id: INSTANCE_ID, timestamp: Date.now() });
      writeFileSync(instanceLockPath, data);
    } catch {
      // Ignore refresh errors
    }
  };
  
  // Register immediately on plugin load (before any isPrimaryInstance() calls)
  registerInstance();

  // Handoff state management (per-session)
  const getHandoffStatePath = (sessionId: string | null): string => {
    if (!sessionId) return join(memoryDir, ".handoff-state.json");
    const sessionDir = join(sessionStatesDir, sessionId);
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }
    return join(sessionDir, "handoff-state.json");
  };

  const getHandoffEnabled = (): boolean => {
    try {
      const handoffPath = getHandoffStatePath(currentSessionId);
      if (existsSync(handoffPath)) {
        const state = JSON.parse(readFileSync(handoffPath, "utf-8"));
        return state.handoff_enabled !== false;
      }
    } catch {}
    return true;
  };

  // Get tool category for grouping
  const getToolCategory = (tool: string): string => {
    // File operations
    if (["read", "write", "edit", "glob", "grep"].includes(tool)) {
      return "file_ops";
    }
    // Shell/bash operations
    if (["bash", "shell", "exec"].includes(tool)) {
      return "shell";
    }
    // Memory tools
    if (tool.startsWith("memory_")) {
      return "memory";
    }
    // Agent tools
    if (tool.startsWith("agent_")) {
      return "agent";
    }
    // Task tools
    if (tool.startsWith("task_")) {
      return "task";
    }
    // Quality tools
    if (tool.startsWith("quality_")) {
      return "quality";
    }
    // Git tools
    if (tool.startsWith("git_")) {
      return "git";
    }
    // Recovery tools
    if (tool.startsWith("checkpoint_") || tool.startsWith("recovery_")) {
      return "recovery";
    }
    // User message tools
    if (tool.startsWith("user_messages_")) {
      return "user_msg";
    }
    // Browser/playwright
    if (tool.startsWith("playwright_")) {
      return "browser";
    }
    // Web fetch
    if (tool === "webfetch") {
      return "web";
    }
    // Todo tools
    if (tool.startsWith("todo")) {
      return "todo";
    }
    // Task spawn
    if (tool === "task") {
      return "spawn";
    }
    // Skill tools
    if (tool === "skill") {
      return "skill";
    }
    return "other";
  };

  // Real-time logger
  // Only writes to file if this is the primary instance (prevents 4x duplicate logging)
  const log = (
    level: "INFO" | "WARN" | "ERROR",
    message: string,
    data?: unknown
  ) => {
    // Only write to log file if we're the primary instance
    // This fixes the 4x duplicate logging bug
    if (isPrimaryInstance()) {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        session: currentSessionId,
        level,
        message,
        ...(data && { data }),
      };
      appendFileSync(logPath, JSON.stringify(logEntry) + "\n");
    }
  };

  // Detected role for this agent (set during system transform)
  let detectedRole: string | null = null;

  // Load system message configuration
  const loadSystemMessageConfig = () => {
    const configPath = join(memoryDir, "system-message-config.json");
    const defaultConfig = {
      enabled: true,
      sections: {
        memory_context: { enabled: true, priority: 1 },
        pending_tasks: { enabled: true, priority: 2, max_items: 5 },
        user_messages: { enabled: true, priority: 3, max_items: 5 },
        agent_status: { enabled: true, priority: 4 },
        role_instructions: { enabled: true, priority: 5 },
        custom_instructions: { enabled: true, priority: 6, content: [] },
      },
      role_definitions: {},
      custom_sections: [],
    };

    try {
      if (existsSync(configPath)) {
        return JSON.parse(readFileSync(configPath, "utf-8"));
      }
    } catch {}
    return defaultConfig;
  };

  // Detect agent role from system prompt content
  const detectAgentRole = (systemPrompt: string): string => {
    const config = loadSystemMessageConfig();
    const roleDefinitions = config.role_definitions || {};
    const promptLower = systemPrompt.toLowerCase();
    
    // Check each role's keywords
    for (const [role, definition] of Object.entries(roleDefinitions)) {
      const def = definition as any;
      if (def.keywords && Array.isArray(def.keywords)) {
        for (const keyword of def.keywords) {
          if (promptLower.includes(keyword.toLowerCase())) {
            return role;
          }
        }
      }
    }
    
    // Fallback role
    return config.role_detection?.fallback_role || "worker";
  };

  // Build role-specific instructions section
  const buildRoleInstructionsSection = (role: string) => {
    const config = loadSystemMessageConfig();
    const roleDefinitions = config.role_definitions || {};
    const roleDef = roleDefinitions[role] as any;
    
    if (!roleDef || !roleDef.instructions || roleDef.instructions.length === 0) {
      return null;
    }
    
    return roleDef.instructions.join("\n");
  };

  // Build memory context section
  const buildMemoryContextSection = (state: any) => {
    return `**Session**: ${state.session_count || 0}
**Status**: ${state.status || "unknown"}
**Active Tasks**: ${state.active_tasks?.join(", ") || "none"}
**Total Tokens**: ${state.total_tokens_used?.toLocaleString() || 0}

**Recent Achievements**:
${
  state.recent_achievements
    ?.slice(0, 3)
    .map((a: string) => `- ${a}`)
    .join("\n") || "- None"
}`;
  };

  // Build pending tasks section
  const buildPendingTasksSection = (maxItems: number = 5) => {
    const tasksPath = join(memoryDir, "tasks.json");
    if (!existsSync(tasksPath)) return null;

    try {
      const tasksStore = JSON.parse(readFileSync(tasksPath, "utf-8"));
      const pending = (tasksStore.tasks || [])
        .filter((t: any) => t.status === "pending")
        .sort((a: any, b: any) => {
          const order: Record<string, number> = {
            critical: 0,
            high: 1,
            medium: 2,
            low: 3,
          };
          return (order[a.priority] || 4) - (order[b.priority] || 4);
        })
        .slice(0, maxItems);

      if (pending.length === 0) return null;
      return `**Pending Tasks** (${pending.length}):
${pending
  .map((t: any) => `- [${t.priority.toUpperCase()}] ${t.title}`)
  .join("\n")}`;
    } catch {
      return null;
    }
  };

  // Build user messages section
  const buildUserMessagesSection = (maxItems: number = 5) => {
    const userMsgPath = join(memoryDir, "user-messages.jsonl");
    if (!existsSync(userMsgPath)) return null;

    try {
      const content = readFileSync(userMsgPath, "utf-8");
      const messages = content
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .filter((m: any) => !m.read);

      if (messages.length === 0) return null;
      return `**Unread User Messages** (${messages.length}):
${messages
  .slice(-maxItems)
  .map(
    (m: any) =>
      `- ${m.from}: "${m.message.slice(0, 80)}${
        m.message.length > 80 ? "..." : ""
      }"`
  )
  .join("\n")}`;
    } catch {
      return null;
    }
  };

  // Build agent status section
  const buildAgentStatusSection = () => {
    if (!coordinator) return null;
    try {
      const agents = coordinator.getActiveAgents();
      if (agents.length === 0) return null;
      return `**Multi-Agent Mode**: ${agents.length} agent(s) active`;
    } catch {
      return null;
    }
  };

  // Build custom instructions section
  const buildCustomInstructionsSection = (content: string[]) => {
    if (!content || content.length === 0) return null;
    return content.join("\n");
  };

  // Generate compact summary for compaction hook
  const generateCompactSummary = () => {
    const state = existsSync(statePath)
      ? JSON.parse(readFileSync(statePath, "utf-8"))
      : {};
    
    const tasksPath = join(memoryDir, "tasks.json");
    let activeTasks: any[] = [];
    try {
      if (existsSync(tasksPath)) {
        const tasksStore = JSON.parse(readFileSync(tasksPath, "utf-8"));
        activeTasks = (tasksStore.tasks || []).filter(
          (t: any) => t.status === "in_progress" || t.status === "pending"
        );
      }
    } catch {}

    return {
      session: state.session_count || 0,
      status: state.status || "unknown",
      active_tasks: activeTasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        status: t.status,
      })),
      accomplishments: state.achievements?.slice(-3) || [],
    };
  };

  // Format summary as markdown for context injection
  const formatSummaryAsMarkdown = (summary: any) => {
    return `## Compaction Context (Session ${summary.session})

**Status**: ${summary.status}
**Active Tasks**: ${
  summary.active_tasks.length > 0
    ? summary.active_tasks.map((t: any) => `${t.title} (${t.status})`).join(", ")
    : "none"
}

**Recent Accomplishments**:
${
  summary.accomplishments.length > 0
    ? summary.accomplishments.map((a: string) => `- ${a}`).join("\n")
    : "- None recorded"
}

Use memory_status(), task_list(), agent_status() for full context.`;
  };

  // Load memory context for system prompt injection (DYNAMIC)
  // Now accepts optional existingPrompt to detect role
  const loadMemoryContext = (existingPrompt?: string) => {
    try {
      if (!existsSync(statePath)) return null;
      const state = JSON.parse(readFileSync(statePath, "utf-8"));
      const config = loadSystemMessageConfig();

      if (!config.enabled) return null;

      // Detect role from existing prompt if provided
      if (existingPrompt && config.role_detection?.enabled !== false) {
        detectedRole = detectAgentRole(existingPrompt);
        log("INFO", `Detected agent role: ${detectedRole}`);
      }

      const sections: Array<{ priority: number; content: string }> = [];
      const sectionConfigs = config.sections || {};

      // Memory context section
      if (sectionConfigs.memory_context?.enabled !== false) {
        const content = buildMemoryContextSection(state);
        if (content)
          sections.push({
            priority: sectionConfigs.memory_context?.priority || 1,
            content,
          });
      }

      // Pending tasks section
      if (sectionConfigs.pending_tasks?.enabled !== false) {
        const content = buildPendingTasksSection(
          sectionConfigs.pending_tasks?.max_items || 5
        );
        if (content)
          sections.push({
            priority: sectionConfigs.pending_tasks?.priority || 2,
            content,
          });
      }

      // User messages section
      if (sectionConfigs.user_messages?.enabled !== false) {
        const content = buildUserMessagesSection(
          sectionConfigs.user_messages?.max_items || 5
        );
        if (content)
          sections.push({
            priority: sectionConfigs.user_messages?.priority || 3,
            content,
          });
      }

      // Agent status section
      if (sectionConfigs.agent_status?.enabled !== false) {
        const content = buildAgentStatusSection();
        if (content)
          sections.push({
            priority: sectionConfigs.agent_status?.priority || 4,
            content,
          });
      }

      // Role-specific instructions section (NEW)
      if (sectionConfigs.role_instructions?.enabled !== false && detectedRole) {
        const content = buildRoleInstructionsSection(detectedRole);
        if (content)
          sections.push({
            priority: sectionConfigs.role_instructions?.priority || 5,
            content,
          });
      }

      // Custom instructions section
      if (
        sectionConfigs.custom_instructions?.enabled !== false &&
        sectionConfigs.custom_instructions?.content
      ) {
        const content = buildCustomInstructionsSection(
          sectionConfigs.custom_instructions.content
        );
        if (content)
          sections.push({
            priority: sectionConfigs.custom_instructions?.priority || 6,
            content,
          });
      }

      // Add custom sections from config
      if (config.custom_sections && Array.isArray(config.custom_sections)) {
        for (const custom of config.custom_sections) {
          if (custom.enabled !== false && custom.content) {
            sections.push({
              priority: custom.priority || 10,
              content: custom.content,
            });
          }
        }
      }

      // Sort by priority and build final output
      sections.sort((a, b) => a.priority - b.priority);
      const mainContent = sections.map((s) => s.content).join("\n\n");

      const roleInfo = detectedRole ? `\n**Detected Role**: ${detectedRole}` : "";

      return `## Memory System Context
${roleInfo}
${mainContent}

Memory Tools: memory_status, memory_search, memory_update
Agent Tools: agent_status, agent_send, agent_messages, agent_update_status
Multi-Agent Mode Active: Check agent_status() to see other agents working in parallel`;
    } catch (error) {
      console.error("[Memory] Failed to load context:", error);
      return null;
    }
  };

  // ============================================================================
  // TOOL CONTEXT PROVIDERS
  // ============================================================================

  const getAgentToolsContext = () => ({
    coordinator,
    currentSessionId,
    memoryDir,
    log,
    setCoordinator: (coord: MultiAgentCoordinator) => {
      coordinator = coord;
    },
  });

  const getMemoryToolsContext = () => ({
    memoryDir,
    statePath,
    metricsPath,
  });

  const getTaskToolsContext = () => ({
    memoryDir,
    currentSessionId,
    agentId: coordinator ? (coordinator as any).agentId : undefined,
    log,
  });

  const getQualityToolsContext = () => ({
    memoryDir,
    currentSessionId,
    log,
  });

  const getUserMessageToolsContext = () => ({
    memoryDir,
    currentSessionId,
    log,
  });

  const getRecoveryToolsContext = () => ({
    memoryDir,
    currentSessionId,
    agentId: coordinator ? (coordinator as any).agentId : undefined,
    log,
  });

  const getGitToolsContext = () => ({
    memoryDir,
    currentSessionId,
    agentId: coordinator ? (coordinator as any).agentId : undefined,
    log,
  });

  // ============================================================================
  // CREATE MODULAR TOOLS
  // ============================================================================

  const agentTools = createAgentTools(getAgentToolsContext, sessionStatesDir);
  const memoryTools = createMemoryTools(getMemoryToolsContext);
  const taskTools = createTaskTools(getTaskToolsContext);
  const qualityTools = createQualityTools(getQualityToolsContext);
  const userMessageTools = createUserMessageTools(getUserMessageToolsContext);
  const recoveryTools = createRecoveryTools(getRecoveryToolsContext);
  const gitTools = createGitTools(getGitToolsContext);

  // ============================================================================
  // PLUGIN RETURN OBJECT
  // ============================================================================

  return {
    // Combine all tools into single tool object
    tool: {
      ...agentTools,
      ...memoryTools,
      ...taskTools,
      ...qualityTools,
      ...userMessageTools,
      ...recoveryTools,
      ...gitTools,
    },

    // Auto-inject memory context into system prompt
    "experimental.chat.system.transform": async (input, output) => {
      try {
        // Combine existing system prompts to detect role
        const existingPrompt = output.system.join("\n");
        const memoryContext = loadMemoryContext(existingPrompt);
        if (memoryContext) {
          output.system.push(memoryContext);
          console.log("[Memory] Context injected into system prompt" + (detectedRole ? ` (role: ${detectedRole})` : ""));
        }
      } catch (error) {
        console.error("[Memory] Context injection error:", error);
      }
    },

    // Detect memory-related queries in chat
    "chat.message": async ({ role, content }) => {
      try {
        if (role !== "user") return;

        const contentLower = content.toLowerCase();

        if (
          contentLower.match(
            /status|progress|where.*we|what.*doing|current.*state/
          )
        ) {
          console.log(
            "[Memory] Detected status query - suggest memory_status tool"
          );
        }

        if (
          contentLower.match(/remember|past|previous|before|history|last.*time/)
        ) {
          console.log(
            "[Memory] Detected history query - suggest memory_search tool"
          );
        }

        if (contentLower.match(/add.*task|complete.*task|finish|done with/)) {
          console.log(
            "[Memory] Detected task update - suggest memory_update tool"
          );
        }

        if (contentLower.match(/continue|keep going|next|move on|done here/)) {
          console.log(
            "[Memory] Detected continuation intent - prepare for handoff"
          );
        }
      } catch (error) {
        console.error("[Memory] Chat message hook error:", error);
      }
    },

    // Main event handler
    event: async ({ event }) => {
      try {
        if (!isPrimaryInstance()) return;
        refreshLock();

        // SESSION START
        if (event.type === "session.created" && !sessionBootRan) {
          await handleSessionCreated(event);
        }

        // SESSION IDLE
        if (event.type === "session.idle") {
          await handleSessionIdle(event);
        }

        // SESSION ERROR
        if (event.type === "session.error") {
          log("ERROR", "Session error", { error: event.properties.error });
          const errorLog = JSON.stringify({
            type: "session_error",
            timestamp: new Date().toISOString(),
            error: event.properties.error,
          });
          appendFileSync(sessionsPath, errorLog + "\n");
        }

        // FILE EDITS (memory files only)
        if (
          event.type === "file.edited" &&
          event.properties.file?.includes("/memory/")
        ) {
          log("INFO", `File edited: ${event.properties.file}`);
          const fileLog = JSON.stringify({
            type: "file_edit",
            timestamp: new Date().toISOString(),
            file: event.properties.file,
          });
          appendFileSync(sessionsPath, fileLog + "\n");
        }

        // COMPACTION
        if (event.type === "session.compacted") {
          log("INFO", `Session compacted: ${event.properties.sessionID}`);
          const compactionLog = JSON.stringify({
            type: "compaction",
            timestamp: new Date().toISOString(),
            session_id: event.properties.sessionID,
          });
          appendFileSync(sessionsPath, compactionLog + "\n");
        }

        // OTHER EVENTS
        if (
          ["session.status", "session.deleted", "session.updated"].includes(
            event.type
          )
        ) {
          log("INFO", `Event: ${event.type}`, { properties: event.properties });
        }
      } catch (error) {
        log("ERROR", "Plugin error", { error: String(error) });
      }
    },

    // Tool execution timing - before hook (capture start time)
    "tool.execute.before": async (input) => {
      if (!isPrimaryInstance()) return;
      try {
        const callId = input.callID || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const inputSize = JSON.stringify(input.args || {}).length;
        
        toolTimingState.set(callId, {
          tool: input.tool,
          startTime: Date.now(),
          inputSize,
        });
      } catch (error) {
        log("WARN", "Tool timing before hook error", { error: String(error) });
      }
    },

    // Tool execution tracking - after hook (calculate duration and log)
    "tool.execute.after": async (input, output) => {
      if (!isPrimaryInstance()) return;
      try {
        toolCallCount++;
        const endTime = Date.now();
        const callId = input.callID || "";
        const outputSize = output.output?.length || 0;
        
        // Get timing data from before hook
        const timingData = toolTimingState.get(callId);
        const startTime = timingData?.startTime || endTime;
        const duration = endTime - startTime;
        const inputSize = timingData?.inputSize || 0;
        
        // Clean up state
        if (callId) toolTimingState.delete(callId);
        
        // Determine success/failure
        const isError = output.output?.toLowerCase().includes("error") ||
                        output.output?.toLowerCase().includes("failed") ||
                        output.output?.toLowerCase().includes("exception");
        
        // Create timing entry
        const timingEntry = {
          timestamp: new Date().toISOString(),
          session_id: currentSessionId,
          tool: input.tool,
          call_id: callId,
          start_time: startTime,
          end_time: endTime,
          duration_ms: duration,
          input_size: inputSize,
          output_size: outputSize,
          success: !isError,
          category: getToolCategory(input.tool),
        };
        
        // Append to timing log
        appendFileSync(toolTimingPath, JSON.stringify(timingEntry) + "\n");
        
        // Log to realtime log (condensed)
        log("INFO", `Tool executed: ${input.tool}`, {
          tool: input.tool,
          call_id: callId,
          duration_ms: duration,
          output_length: outputSize,
          success: !isError,
        });

        if (
          input.tool === "read" &&
          input.args?.filePath?.includes("memory/")
        ) {
          log("INFO", `Memory file read: ${input.args.filePath}`);
        }
        if (
          input.tool === "write" &&
          input.args?.filePath?.includes("memory/")
        ) {
          log("INFO", `Memory file updated: ${input.args.filePath}`);
        }
        if (
          input.tool === "edit" &&
          input.args?.filePath?.includes("memory/")
        ) {
          log("INFO", `Memory file edited: ${input.args.filePath}`);
        }

        // === TASK TOOL TRACKING ===
        // Track when the native Task tool spawns a subagent session
        if (input.tool === "task" && output.metadata?.sessionId) {
          log("INFO", "Task tool spawned session", {
            spawned_session: output.metadata.sessionId,
            description: output.title,
            parent_session: currentSessionId,
          });

          // Record the spawned session in sessions tracking
          try {
            const spawnLog = JSON.stringify({
              type: "session_spawned",
              timestamp: new Date().toISOString(),
              parent_session: currentSessionId,
              child_session: output.metadata.sessionId,
              description: output.title,
              duration_ms: duration,
            });
            appendFileSync(sessionsPath, spawnLog + "\n");

            // Also log to message bus for agent coordination
            const messageBusPath = join(memoryDir, "message-bus.jsonl");
            const message = {
              message_id: `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              from_agent: coordinator ? (coordinator as any).agentId : "system",
              timestamp: new Date().toISOString(),
              type: "session_spawned",
              payload: {
                parent_session: currentSessionId,
                child_session: output.metadata.sessionId,
                description: output.title,
              },
              read_by: [],
            };
            appendFileSync(messageBusPath, JSON.stringify(message) + "\n");
          } catch (e) {
            log("WARN", `Failed to record spawned session: ${e}`);
          }
        }
      } catch (error) {
        log("ERROR", "Tool tracking error", { error: String(error) });
      }
    },

    // Plugin loaded callback
    config: async (config) => {
      if (!isPrimaryInstance()) return;
      log("INFO", "Plugin loaded - monitoring session events", {
        agent: config.agent,
        log_file: logPath,
      });
      log("INFO", "=== NEW PLUGIN INSTANCE ===");
    },

    // Compaction hook - preserve memory context
    "experimental.session.compacting": async (input, output) => {
      try {
        log("INFO", "Session compacting - generating smart context summary");

        const summary = generateCompactSummary();
        const contextMarkdown = formatSummaryAsMarkdown(summary);

        let agentContext = "";
        if (coordinator) {
          const agents = coordinator.getActiveAgents();
          if (agents.length > 1) {
            agentContext = `\n\n**Multi-Agent Mode**: ${agents.length} agents active`;
          }
        }

        output.context.push(contextMarkdown + agentContext);

        log("INFO", "Smart compaction context injected successfully", {
          session: summary.session,
          tasks_count: summary.active_tasks.length,
          accomplishments_count: summary.accomplishments.length,
        });
      } catch (error) {
        log("WARN", "Smart summarization failed, using fallback", {
          error: String(error),
        });

        try {
          const state = existsSync(statePath)
            ? JSON.parse(readFileSync(statePath, "utf-8"))
            : { session_count: 0, status: "unknown" };

          output.context.push(`## Memory System Context

**Session**: ${state.session_count || 0}
**Status**: ${state.status || "unknown"}
**Active Tasks**: ${state.active_tasks?.join(", ") || "none"}

Use memory_status(), task_list(), agent_status() for more context.
Read memory/working.md for full details.`);
        } catch (fallbackError) {
          log("ERROR", "Fallback context injection also failed", {
            error: String(fallbackError),
          });
        }
      }
    },
  };

  // ============================================================================
  // EVENT HANDLERS (Internal)
  // ============================================================================

  async function handleSessionCreated(event: any) {
    currentSessionStart = new Date();
    currentSessionId = event.properties.info.id;
    sessionBootRan = true;

    log(
      "INFO",
      `Session started: ${currentSessionId} (instance: ${INSTANCE_ID})`
    );
    log("INFO", "Running boot sequence...");

    // Update state.json
    let sessionCount = 0;
    try {
      const state = existsSync(statePath)
        ? JSON.parse(readFileSync(statePath, "utf-8"))
        : { session_count: 0, total_tokens_used: 0 };

      state.session_count = (state.session_count || 0) + 1;
      state.last_session = currentSessionStart.toISOString();
      state.current_session_id = currentSessionId;
      sessionCount = state.session_count;

      writeFileSync(statePath, JSON.stringify(state, null, 2));
      log("INFO", `Session ${state.session_count} initialized`, {
        session_count: state.session_count,
      });
    } catch (error) {
      log("ERROR", "Failed to update state", { error: String(error) });
    }

    // Background tasks
    log("INFO", "Starting knowledge extraction (background)");
    ctx.$`bun ${join(ctx.directory, "tools/knowledge-extractor.ts")} extract`
      .quiet()
      .then(() => log("INFO", "Knowledge extraction completed"))
      .catch((e) =>
        log("WARN", "Knowledge extraction failed", { error: String(e) })
      );

    // Note: sync-engine.ts was planned but not implemented
    // Conversation tracking is now done via opencode-tracker.ts learn command
    // Manual: bun tools/opencode-tracker.ts sync && bun tools/opencode-tracker.ts learn

    log("INFO", "Boot sequence complete");

    // Clean up stale agents
    const registryPath = join(memoryDir, "agent-registry.json");
    try {
      if (existsSync(registryPath)) {
        const registry = JSON.parse(readFileSync(registryPath, "utf-8"));
        const now = Date.now();

        const activeAgents = registry.agents.filter((agent: any) => {
          const lastHeartbeat = new Date(agent.last_heartbeat).getTime();
          return now - lastHeartbeat < AGENT_STALE_THRESHOLD;
        });

        const removedCount = registry.agents.length - activeAgents.length;
        if (removedCount > 0) {
          registry.agents = activeAgents;
          registry.last_updated = new Date().toISOString();
          writeFileSync(registryPath, JSON.stringify(registry, null, 2));
          log("INFO", `Cleaned up ${removedCount} stale agents from registry`);
        }
      }
    } catch (error) {
      log("WARN", "Failed to clean up stale agents", { error: String(error) });
    }

    // Message bus auto-maintenance (background)
    log("INFO", "Starting message bus maintenance (background)");
    ctx.$`bun ${join(ctx.directory, "tools/message-bus-manager.ts")} auto`
      .quiet()
      .then((result) => log("INFO", "Message bus maintenance completed", { result: result.stdout }))
      .catch((e) =>
        log("WARN", "Message bus maintenance failed", { error: String(e) })
      );

    // Auto-register agent with detected role (or "general" if not detected yet)
    try {
      coordinator = new MultiAgentCoordinator(currentSessionId);
      const roleToRegister = detectedRole || "general";
      await coordinator.register(roleToRegister);
      coordinator.startHeartbeat();
      log("INFO", `Multi-agent coordinator initialized with role: ${roleToRegister}`);

      coordinator.broadcastStatus("Agent online and ready", {
        session_id: currentSessionId,
        session_count: sessionCount,
        role: roleToRegister,
      });
    } catch (error) {
      log("WARN", "Multi-agent coordinator init failed", {
        error: String(error),
      });
    }

    // Log session start
    const sessionLog = JSON.stringify({
      type: "session_start",
      timestamp: currentSessionStart.toISOString(),
      session_id: event.properties.info.id,
    });
    appendFileSync(sessionsPath, sessionLog + "\n");
  }

  async function handleSessionIdle(event: any) {
    const handoffEnabled = getHandoffEnabled();
    log(
      "INFO",
      `Session idle: ${event.properties.sessionID} (handoff: ${handoffEnabled})`
    );

    // If handoff disabled, respawn orchestrator
    if (!handoffEnabled) {
      log("INFO", "Handoff disabled - re-spawning orchestrator agent");

      const state = existsSync(statePath)
        ? JSON.parse(readFileSync(statePath, "utf-8"))
        : {};

      const respawnPrompt = `You are the ORCHESTRATOR AGENT resuming work.

## IMMEDIATE ACTIONS:
1. Call agent_set_handoff with enabled=false (CRITICAL - you must persist)
2. Call memory_status to see current state
3. Continue with active tasks or explore new improvements

## CONTEXT:
- Session count: ${state.session_count || 0}
- Active tasks: ${state.active_tasks?.join(", ") || "none"}
- Status: ${state.status || "unknown"}

## YOUR MISSION:
Continue improving the multi-agent system. Check memory/working.md for recent context.
Spawn workers for parallel tasks using: opencode run "worker prompt"

Remember: You NEVER stop. Always call agent_set_handoff(enabled=false) first.`;

      const respawnLogFile = join(memoryDir, "orchestrator-respawn.log");
      
      // Use Bun.spawn for background process - ctx.$ doesn't support shell redirects
      try {
        const logFileHandle = Bun.file(respawnLogFile).writer();
        const proc = Bun.spawn(["opencode", "run", "--model", "claude-opus-4-5", respawnPrompt], {
          stdout: logFileHandle,
          stderr: logFileHandle,
          // Don't wait for the process - let it run in background
        });
        
        // Unref so the parent process can exit
        proc.unref();
        
        log("INFO", "Orchestrator re-spawn command sent", { pid: proc.pid });
      } catch (e) {
        log("ERROR", "Failed to re-spawn orchestrator", { error: String(e) });
      }

      return;
    }

    // Normal handoff - unregister and update working.md
    if (coordinator) {
      try {
        await coordinator.unregister();
        log("INFO", "Agent unregistered from coordinator");
      } catch (error) {
        log("WARN", "Failed to unregister agent", { error: String(error) });
      }
    }

    if (currentSessionStart) {
      const sessionDuration = Date.now() - currentSessionStart.getTime();
      log(
        "INFO",
        `Session ended after ${Math.round(sessionDuration / 1000)}s`,
        {
          duration_ms: sessionDuration,
          tool_calls: toolCallCount,
        }
      );

      const sessionEnd = JSON.stringify({
        type: "session_end",
        timestamp: new Date().toISOString(),
        session_id: event.properties.sessionID,
        duration_ms: sessionDuration,
        tool_calls: toolCallCount,
      });
      appendFileSync(sessionsPath, sessionEnd + "\n");
      
      // === AUTO-EXTRACT SESSION LEARNINGS ===
      log("INFO", "Starting automatic session learning extraction...");
      try {
        // Run session summarizer in background
        ctx.$`bun ${join(ctx.directory, "tools/session-summarizer.ts")} summarize-current ${currentSessionId || ""}`
          .quiet()
          .then(() => log("INFO", "Session summarization completed"))
          .catch((e) => log("WARN", "Session summarization failed", { error: String(e) }));
        
        // Extract knowledge from tool timing data for this session
        await extractSessionKnowledge(event.properties.sessionID, sessionDuration);
        log("INFO", "Session knowledge extraction completed");
      } catch (error) {
        log("WARN", "Session learning extraction failed", { error: String(error) });
      }

      // Update metrics
      const metricsData = existsSync(metricsPath)
        ? JSON.parse(readFileSync(metricsPath, "utf-8"))
        : { total_sessions: 0, total_tool_calls: 0, total_tokens: 0 };

      metricsData.total_sessions = (metricsData.total_sessions || 0) + 1;
      metricsData.total_tool_calls =
        (metricsData.total_tool_calls || 0) + toolCallCount;
      metricsData.last_session = new Date().toISOString();

      writeFileSync(metricsPath, JSON.stringify(metricsData, null, 2));

      // Update working.md for next session
      await updateWorkingMdForHandoff(event, sessionDuration);
    }
  }

  async function extractSessionKnowledge(sessionId: string, durationMs: number) {
    // Enhanced knowledge extraction from multiple sources
    const sessionKnowledge = {
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      duration_ms: durationMs,
      tool_calls: toolCallCount,
      decisions: [] as string[],
      discoveries: [] as string[],
      code_created: [] as string[],
      problems_solved: [] as string[],
      key_insights: [] as string[],
      techniques: [] as string[],
      solutions: [] as string[],
    };

    const now = Date.now();
    const sessionStartTime = now - durationMs;

    // === 1. EXTRACT FROM MESSAGE BUS (task completions) ===
    try {
      const messageBusPath = join(memoryDir, "message-bus.jsonl");
      if (existsSync(messageBusPath)) {
        const content = readFileSync(messageBusPath, "utf-8");
        const lines = content.trim().split("\n").slice(-200);
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            const msgTime = new Date(msg.timestamp).getTime();
            
            // Only process messages from this session's timeframe
            if (msgTime < sessionStartTime || msgTime > now) continue;
            
            // Extract from task_complete messages
            if (msg.type === "task_complete" || msg.type === "task_completed") {
              const payload = msg.payload || {};
              if (payload.summary) {
                sessionKnowledge.solutions.push(payload.summary);
              }
              if (payload.title) {
                sessionKnowledge.problems_solved.push(payload.title);
              }
            }
            
            // Extract from broadcasts with findings/learnings
            if (msg.type === "broadcast" && msg.payload) {
              const p = msg.payload;
              if (p.learning) sessionKnowledge.key_insights.push(p.learning);
              if (p.findings) {
                if (typeof p.findings === "string") {
                  sessionKnowledge.discoveries.push(p.findings);
                } else if (Array.isArray(p.findings)) {
                  sessionKnowledge.discoveries.push(...p.findings.slice(0, 3));
                }
              }
            }
          } catch {}
        }
      }
    } catch (error) {
      log("WARN", "Failed to extract from message bus", { error: String(error) });
    }

    // === 2. EXTRACT FROM QUALITY ASSESSMENTS (lessons learned) ===
    try {
      const qualityPath = join(memoryDir, "quality-assessments.json");
      if (existsSync(qualityPath)) {
        const qa = JSON.parse(readFileSync(qualityPath, "utf-8"));
        const assessments = qa.assessments || [];
        
        for (const assessment of assessments) {
          const assessedAt = new Date(assessment.assessed_at).getTime();
          if (assessedAt >= sessionStartTime && assessedAt <= now) {
            if (assessment.lessons_learned) {
              sessionKnowledge.key_insights.push(assessment.lessons_learned);
            }
          }
        }
      }
    } catch (error) {
      log("WARN", "Failed to extract from quality assessments", { error: String(error) });
    }

    // === 3. EXTRACT FROM TASKS (completed tasks with descriptions) ===
    try {
      const tasksPath = join(memoryDir, "tasks.json");
      if (existsSync(tasksPath)) {
        const tasks = JSON.parse(readFileSync(tasksPath, "utf-8"));
        
        for (const task of tasks.tasks || []) {
          if (task.status !== "completed") continue;
          const completedAt = task.completed_at ? new Date(task.completed_at).getTime() : 0;
          
          if (completedAt >= sessionStartTime && completedAt <= now) {
            sessionKnowledge.problems_solved.push(task.title);
            if (task.notes && task.notes.length < 200) {
              sessionKnowledge.solutions.push(task.notes);
            }
          }
        }
      }
    } catch (error) {
      log("WARN", "Failed to extract from tasks", { error: String(error) });
    }

    // === 4. EXTRACT FROM GIT ACTIVITY (commit messages) ===
    try {
      const gitPath = join(memoryDir, "git-activity.jsonl");
      if (existsSync(gitPath)) {
        const content = readFileSync(gitPath, "utf-8");
        const lines = content.trim().split("\n").slice(-50);
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            const entryTime = new Date(entry.timestamp).getTime();
            
            if (entryTime >= sessionStartTime && entryTime <= now) {
              if (entry.action === "commit" && entry.message) {
                // Extract the first line of commit message
                const firstLine = entry.message.split("\n")[0];
                if (firstLine.length > 10 && firstLine.length < 150) {
                  sessionKnowledge.code_created.push(firstLine);
                }
              }
            }
          } catch {}
        }
      }
    } catch (error) {
      log("WARN", "Failed to extract from git activity", { error: String(error) });
    }

    // === 5. EXTRACT FROM SESSIONS.JSONL (file edits) ===
    try {
      if (existsSync(sessionsPath)) {
        const content = readFileSync(sessionsPath, "utf-8");
        const lines = content.trim().split("\n").slice(-100);
        const editedFiles: string[] = [];
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.type === "file_edit" && entry.session_id === sessionId) {
              const file = entry.file?.replace("/app/workspace/", "") || "";
              if (file && !editedFiles.includes(file) && !file.startsWith("memory/")) {
                editedFiles.push(file);
              }
            }
          } catch {}
        }
        
        if (editedFiles.length > 0) {
          // Group by type
          const codeFiles = editedFiles.filter(f => 
            f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".jsx")
          );
          if (codeFiles.length > 0) {
            sessionKnowledge.code_created.push(`Modified: ${codeFiles.slice(0, 5).join(", ")}`);
          }
        }
      }
    } catch (error) {
      log("WARN", "Failed to extract from sessions", { error: String(error) });
    }

    // === 6. ANALYZE TOOL PATTERNS ===
    try {
      if (existsSync(toolTimingPath)) {
        const content = readFileSync(toolTimingPath, "utf-8");
        const lines = content.trim().split("\n").slice(-200);
        
        const sessionEntries = lines
          .filter(Boolean)
          .map(line => { try { return JSON.parse(line); } catch { return null; } })
          .filter(entry => entry && entry.session_id === sessionId);

        // Identify work patterns
        const categories: Record<string, number> = {};
        for (const entry of sessionEntries) {
          categories[entry.category] = (categories[entry.category] || 0) + 1;
        }
        
        const topCategory = Object.entries(categories)
          .sort((a, b) => b[1] - a[1])[0];
        
        if (topCategory && topCategory[1] > 5) {
          const categoryDescriptions: Record<string, string> = {
            file_ops: "File operations (reading, editing, writing)",
            shell: "Command execution",
            memory: "Memory system management",
            agent: "Multi-agent coordination",
            task: "Task management",
            git: "Git version control",
            spawn: "Subagent spawning",
          };
          const desc = categoryDescriptions[topCategory[0]];
          if (desc) {
            sessionKnowledge.techniques.push(`Primary work: ${desc}`);
          }
        }
      }
    } catch (error) {
      log("WARN", "Failed to analyze tool patterns", { error: String(error) });
    }

    // === SAVE TO KNOWLEDGE BASE ===
    const hasContent = 
      sessionKnowledge.decisions.length > 0 ||
      sessionKnowledge.discoveries.length > 0 ||
      sessionKnowledge.code_created.length > 0 ||
      sessionKnowledge.problems_solved.length > 0 ||
      sessionKnowledge.key_insights.length > 0 ||
      sessionKnowledge.techniques.length > 0 ||
      sessionKnowledge.solutions.length > 0;

    if (hasContent) {
      const knowledgePath = join(memoryDir, "knowledge-base.json");
      try {
        // Read as array (new format) or migrate from old format
        let kb: any[] = [];
        if (existsSync(knowledgePath)) {
          const content = JSON.parse(readFileSync(knowledgePath, "utf-8"));
          kb = Array.isArray(content) ? content : (content.insights || []);
        }
        
        // Add session knowledge entry
        kb.unshift({
          session_id: sessionId,
          timestamp: Date.now(),
          messages: toolCallCount,
          decisions: sessionKnowledge.decisions,
          discoveries: sessionKnowledge.discoveries,
          code_created: sessionKnowledge.code_created,
          problems_solved: sessionKnowledge.problems_solved,
          key_insights: sessionKnowledge.key_insights,
          techniques: sessionKnowledge.techniques,
          solutions: sessionKnowledge.solutions,
        });
        
        // Keep last 100 entries
        kb = kb.slice(0, 100);
        
        writeFileSync(knowledgePath, JSON.stringify(kb, null, 2));
        log("INFO", "Enhanced session knowledge saved", {
          decisions: sessionKnowledge.decisions.length,
          discoveries: sessionKnowledge.discoveries.length,
          code_created: sessionKnowledge.code_created.length,
          problems_solved: sessionKnowledge.problems_solved.length,
          key_insights: sessionKnowledge.key_insights.length,
        });
      } catch (error) {
        log("WARN", "Failed to save session knowledge", { error: String(error) });
      }
    } else {
      log("INFO", "No significant knowledge to extract from this session");
    }
  }

  async function updateWorkingMdForHandoff(
    event: any,
    sessionDuration: number
  ) {
    log("INFO", "Updating working.md for next session...");
    const workingPath = join(memoryDir, "working.md");

    try {
      const state = existsSync(statePath)
        ? JSON.parse(readFileSync(statePath, "utf-8"))
        : {};

      let workingContent = existsSync(workingPath)
        ? readFileSync(workingPath, "utf-8")
        : "";

      // Remove previous AUTO-STOP entry for same session
      const sessionMarker = `## Session ${
        state.session_count || "N/A"
      } - AUTO-STOP`;
      const lines = workingContent.split("\n");
      let inAutoStopSection = false;
      const filteredLines = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith(sessionMarker)) {
          inAutoStopSection = true;
          continue;
        }

        if (
          inAutoStopSection &&
          (line.startsWith("## ") || line.trim() === "---")
        ) {
          inAutoStopSection = false;
          if (line.trim() === "---") continue;
        }

        if (!inAutoStopSection) {
          filteredLines.push(line);
        }
      }

      // Create session summary
      const sessionSummary = `
## Session ${state.session_count || "N/A"} - AUTO-STOP (${
        new Date().toISOString().split("T")[0]
      })

**Status**: Session ended
**Duration**: ${Math.round(sessionDuration / 1000 / 60)} minutes
**Tool Calls**: ${toolCallCount}
**Session ID**: ${event.properties.sessionID}

**What Happened**: Session idle detected - agent stopped working

**CRITICAL: YOU ARE A NEW AGENT - READ THIS FIRST**

You are a fresh instance of the AI. The previous agent is gone. You have:
- Auto-injected memory context (150 tokens in system prompt)
- Real-time logging enabled (check memory/realtime.log)
- Session lifecycle tracking via OpenCode hooks
- Custom memory tools: memory_status(), memory_search(), memory_update()

**Next Agent MUST**:
1. **DO NOT** manually read state.json - use memory_status() tool instead
2. Read working.md (this file) to understand what previous agent did
3. Check active_tasks in state.json via memory_status()
4. Continue with priority tasks OR ask user for direction
5. Update this section when work is complete
6. Check realtime.log for detailed activity history

**Available Infrastructure**:
- Plugin: .opencode/plugin/index.ts (auto-boot, context injection, logging)
- Log file: memory/realtime.log (real-time structured logging)
- State: memory/state.json (session counter, tasks, achievements)
- Knowledge: memory/knowledge-base.json (extracted insights)

---

`;

      const newContent = filteredLines.join("\n") + sessionSummary;
      writeFileSync(workingPath, newContent);
      log("INFO", "Session summary updated in working.md");
    } catch (error) {
      log("ERROR", "Failed to update working.md", { error: String(error) });
    }
  }
};

export default MemoryPlugin;
