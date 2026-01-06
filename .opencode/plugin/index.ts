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
  statSync,
  createReadStream,
  createWriteStream,
} from "fs";
import { join } from "path";
import { createGzip } from "zlib";
import { readJson, writeJson, readJsonl } from "../../tools/shared/json-utils";
import { MultiAgentCoordinator } from "../../tools/lib/coordinator";
import { getModel, getModelFallback } from "../../tools/shared/models";
import { formatToolsForRole, formatToolsCompact } from "../../tools/shared/tool-registry";

// Import modular tools
import { createAgentTools } from "./tools/agent-tools";
import { createMemoryTools } from "./tools/memory-tools";
import { createTaskTools } from "./tools/task-tools";
import { createQualityTools } from "./tools/quality-tools";
import { createUserMessageTools } from "./tools/user-message-tools";
import { createRecoveryTools } from "./tools/recovery-tools";
import { createGitTools } from "./tools/git-tools";
import { initializePerformanceTracker } from "./tools/perf-wrapper";

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const LOCK_STALE_THRESHOLD = 30000; // 30 seconds
const AGENT_STALE_THRESHOLD = 2 * 60 * 1000; // 2 minutes

// Some OpenCode event hooks can fire before plugin primary election stabilizes.
// Use module-level state for cross-instance buffering + log throttling.
let bufferedSessionCreatedEvent: any | null = null;
const PLUGIN_ERROR_LOG_COOLDOWN_MS = 30_000;
const pluginErrorLogState = new Map<string, number>();

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
  let bufferedSessionCreatedEvent: any | null = null;
  let coordinator: MultiAgentCoordinator | null = null;


  // Tool timing state - maps callID to start time and metadata
  const toolTimingState = new Map<
    string,
    {
      tool: string;
      startTime: number;
      inputSize: number;
    }
  >();

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
            try {
              unlinkSync(filePath);
            } catch {}
          }
        } catch {
          // Invalid file, try to remove it
          try {
            unlinkSync(filePath);
          } catch {}
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

  // Async variant: waits until election delay has elapsed.
  // This prevents missing the very first `session.created` event.
  const isPrimaryInstanceAsync = async (): Promise<boolean> => {
    if (primaryElectionDone) {
      return isPrimary;
    }

    const elapsed = Date.now() - instanceStartTime;
    const remaining = ELECTION_DELAY_MS - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }

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

   // Compress an archive file with gzip
   // Returns compression stats (original size, compressed size, ratio)
   const compressArchiveFile = (archivePath: string): { success: boolean; originalSize: number; compressedSize: number; ratio: number } => {
     try {
       if (!existsSync(archivePath)) {
         return { success: false, originalSize: 0, compressedSize: 0, ratio: 0 };
       }

       const originalStats = statSync(archivePath);
       const originalSize = originalStats.size;
       
       // Skip if already compressed
       if (archivePath.endsWith(".gz")) {
         return { success: false, originalSize, compressedSize: originalSize, ratio: 1 };
       }

       // Read file and compress using zlib
       const content = readFileSync(archivePath);
       const compressedPath = archivePath + ".gz";
       
       // Import zlib for compression
       const zlib = require("zlib");
       const compressed = zlib.gzipSync(content);
       
       writeFileSync(compressedPath, compressed);
       
       const compressedStats = statSync(compressedPath);
       const compressedSize = compressedStats.size;
       const ratio = compressedSize / originalSize;
       
       // Remove original after successful compression
       unlinkSync(archivePath);
       
       return { success: true, originalSize, compressedSize, ratio };
     } catch (error) {
       // Silent fail - compression errors shouldn't break the system
       return { success: false, originalSize: 0, compressedSize: 0, ratio: 0 };
     }
   };

   // Compress old archives, keeping last N uncompressed for fast access
   const compressOldArchives = (): void => {
     try {
       const archiveDir = join(memoryDir, "realtime-archives");
       if (!existsSync(archiveDir)) return;
       
       const files = readdirSync(archiveDir)
         .filter(f => f.startsWith("realtime-") && f.endsWith(".log"))
         .sort()
         .reverse(); // Most recent first
       
       // Keep last 5 uncompressed, compress the rest
       const KEEP_UNCOMPRESSED = 5;
       const toCompress = files.slice(KEEP_UNCOMPRESSED);
       
       let totalOriginalSize = 0;
       let totalCompressedSize = 0;
       let compressedCount = 0;
       
       for (const file of toCompress) {
         const filePath = join(archiveDir, file);
         const stats = compressArchiveFile(filePath);
         
         if (stats.success) {
           totalOriginalSize += stats.originalSize;
           totalCompressedSize += stats.compressedSize;
           compressedCount++;
         }
       }
       
       // Log compression results if any files were compressed
       if (compressedCount > 0 && isPrimaryInstance()) {
         const savedBytes = totalOriginalSize - totalCompressedSize;
         const savedMB = (savedBytes / (1024 * 1024)).toFixed(2);
         const avgRatio = (totalCompressedSize / totalOriginalSize * 100).toFixed(1);
         
         const logEntry = {
           timestamp: new Date().toISOString(),
           session: currentSessionId,
           level: "INFO",
           message: `Archive compression completed: ${compressedCount} files compressed, ${savedMB}MB saved (${avgRatio}% of original)`,
         };
         appendFileSync(logPath, JSON.stringify(logEntry) + "\n");
       }
     } catch (error) {
       // Silent fail - compression errors shouldn't break the system
     }
   };

   // Check if realtime.log needs rotation and rotate if necessary
   // Rotate when file exceeds 5MB threshold
   const checkAndRotateRealtimeLog = (): void => {
    try {
      if (!existsSync(logPath)) return;
      
      const stats = statSync(logPath);
      const fileSizeInBytes = stats.size;
      const fileSizeInMB = fileSizeInBytes / (1024 * 1024);
      const ROTATION_THRESHOLD_MB = 5;
      
      // Rotate if file exceeds threshold
      if (fileSizeInMB > ROTATION_THRESHOLD_MB) {
        const content = readFileSync(logPath, "utf-8");
        const lines = content.trim().split("\n").filter(l => l);
        
        // Keep last 5000 lines, archive the rest
        if (lines.length > 5000) {
          const keepCount = 5000;
          const toArchive = lines.slice(0, -keepCount);
          const toKeep = lines.slice(-keepCount);
          
          // Create archive directory if it doesn't exist
          const archiveDir = join(memoryDir, "realtime-archives");
          if (!existsSync(archiveDir)) {
            mkdirSync(archiveDir, { recursive: true });
          }
          
          // Create timestamped archive file
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const archivePath = join(archiveDir, `realtime-${timestamp}.log`);
          
           // Write archived lines
           writeFileSync(archivePath, toArchive.join("\n") + "\n");
           
           // Write rotated realtime.log with only recent lines
           writeFileSync(logPath, toKeep.join("\n") + "\n");
           
           // After successful archiving, compress old archives if needed
           compressOldArchives();
         }
       }
      
      // Log warning if file is approaching or exceeds 5MB
      if (fileSizeInMB > 4.5 && isPrimaryInstance()) {
        const logEntry = {
          timestamp: new Date().toISOString(),
          session: currentSessionId,
          level: "WARN",
          message: `realtime.log size: ${fileSizeInMB.toFixed(2)}MB - approaching rotation threshold`,
        };
        appendFileSync(logPath, JSON.stringify(logEntry) + "\n");
      }
     } catch (error) {
       // Silent fail - don't break logging if rotation check fails
       // This ensures the logging system itself remains resilient
     }
   };

   // Record growth metrics for predictive alerting
   // Tracks log sizes and growth rates periodically
   const recordGrowthMetrics = (): void => {
     try {
       const realtimePath = join(memoryDir, "realtime.log");
       const coordinationPath = join(memoryDir, "coordination.log");
       const metricsPath = join(memoryDir, "growth-metrics.jsonl");

       interface GrowthMetricEntry {
         timestamp: number;
         realtime_size_bytes: number;
         coordination_size_bytes: number;
         realtime_lines: number;
         coordination_lines: number;
       }

       // Collect current sizes
       const realtimeStats = existsSync(realtimePath) ? statSync(realtimePath) : null;
       const coordinationStats = existsSync(coordinationPath) ? statSync(coordinationPath) : null;

       if (!realtimeStats || !coordinationStats) return;

       // Count lines
       const realtimeContent = readFileSync(realtimePath, "utf-8");
       const coordinationContent = readFileSync(coordinationPath, "utf-8");
       const realtimeLines = realtimeContent.split("\n").length - 1;
       const coordinationLines = coordinationContent.split("\n").length - 1;

       const metric: GrowthMetricEntry = {
         timestamp: Date.now(),
         realtime_size_bytes: realtimeStats.size,
         coordination_size_bytes: coordinationStats.size,
         realtime_lines: realtimeLines,
         coordination_lines: coordinationLines,
       };

       // Append to metrics file
       appendFileSync(metricsPath, JSON.stringify(metric) + "\n");
     } catch (error) {
       // Silent fail - metrics tracking shouldn't break anything
     }
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
      
      // Check and rotate log if necessary before appending
      checkAndRotateRealtimeLog();
      
      // Append the new log entry
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

  // Build role-specific instructions section from centralized prompts
  const buildRoleInstructionsSection = (role: string) => {
    // Load from centralized prompts file
    const promptsPath = join(ctx.directory, "prompts", "prompts.json");
    try {
      if (existsSync(promptsPath)) {
        const prompts = JSON.parse(readFileSync(promptsPath, "utf-8"));
        const roleConfig = prompts.roles?.[role];
        if (roleConfig) {
          const sections: string[] = [];
          
          // Add identity and purpose
          if (roleConfig.identity) sections.push(roleConfig.identity);
          if (roleConfig.purpose) sections.push(roleConfig.purpose);
          
          // Add constraints
          if (roleConfig.constraints?.length > 0) {
            sections.push("\nConstraints:");
            sections.push(...roleConfig.constraints.map((c: string) => `- ${c}`));
          }
          
          // Add thinking pattern if available
          if (roleConfig.thinking_pattern?.template) {
            sections.push(`\n${roleConfig.thinking_pattern.template}`);
          }
          
          return sections.join("\n");
        }
      }
    } catch (error) {
      log("WARN", "Failed to load role instructions from prompts.json", { error: String(error) });
    }
    
    // Fallback to system-message-config.json
    const config = loadSystemMessageConfig();
    const roleDefinitions = config.role_definitions || {};
    const roleDef = roleDefinitions[role] as any;

    if (
      !roleDef ||
      !roleDef.instructions ||
      roleDef.instructions.length === 0
    ) {
      return null;
    }

    return roleDef.instructions.join("\n");
  };

  // Build memory context section
  const buildMemoryContextSection = (state: any) => {
    const achievements = state.recent_achievements?.slice(0, 3) || [];
    const achievementsList = achievements.length > 0
      ? achievements.map((a: string) => `  - ${a}`).join("\n")
      : "  - None";
    
    return `<system_state>
Session: ${state.session_count || 0}
Status: ${state.status || "unknown"}
Active Tasks: ${state.active_tasks?.join(", ") || "none"}
Total Tokens: ${state.total_tokens_used?.toLocaleString() || 0}
</system_state>

<recent_achievements>
${achievementsList}
</recent_achievements>`;
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
      
      const taskList = pending
        .map((t: any) => `  - [${t.priority.toUpperCase()}] ${t.title} (ID: ${t.id})`)
        .join("\n");
      
      return `<pending_tasks count="${pending.length}">
${taskList}
</pending_tasks>`;
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
      
      const msgList = messages
        .slice(-maxItems)
        .map((m: any) => {
          const priority = m.priority || "normal";
          const truncatedMsg = m.message.length > 100 
            ? m.message.slice(0, 100) + "..." 
            : m.message;
          return `  - [${priority}] ${m.from}: "${truncatedMsg}" (id: ${m.id})`;
        })
        .join("\n");
      
      return `<priority_signals count="${messages.length}" priority="HIGH">
HANDLE THESE FIRST - System priority signals require immediate action.
${msgList}
Use user_messages_mark_read(id) after handling each signal.
</priority_signals>`;
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
      
      const agentList = agents
        .map((a: any) => `  - ${a.agent_id} (${a.assigned_role || 'worker'}): ${a.status || 'active'}`)
        .join("\n");
      
      return `<active_agents count="${agents.length}">
${agentList}
Use agent_status() for full details. Use agent_messages() to read their reports.
</active_agents>`;
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
    const taskList = summary.active_tasks.length > 0
      ? summary.active_tasks.map((t: any) => `  - ${t.title} (${t.status})`).join("\n")
      : "  - None";
    
    const accomplishmentList = summary.accomplishments.length > 0
      ? summary.accomplishments.map((a: string) => `  - ${a}`).join("\n")
      : "  - None recorded";
    
    return `<compaction_context session="${summary.session}">
<status>${summary.status}</status>

<active_tasks>
${taskList}
</active_tasks>

<recent_accomplishments>
${accomplishmentList}
</recent_accomplishments>

<recovery_tools>
Use memory_status(), task_list(), agent_status() for full context.
Read memory/working.md for detailed session history.
</recovery_tools>
</compaction_context>`;
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

      const roleTag = detectedRole
        ? `<detected_role>${detectedRole}</detected_role>\n`
        : "";

      // Generate tools section dynamically based on role
      const toolsSection = formatToolsForRole(detectedRole || "worker", true);

      return `<memory_system_context>
${roleTag}
${mainContent}

${toolsSection}

<multi_agent_note>
You are part of a multi-agent system. Use agent_status() to see other agents.
Coordinate work via agent_send() and agent_messages().
</multi_agent_note>
</memory_system_context>`;
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
  // INITIALIZE PERFORMANCE TRACKING
  // ============================================================================

  // Initialize performance tracker for benchmarking agent/task operations
  initializePerformanceTracker(memoryDir, currentSessionId || undefined);

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
  // EDIT ERROR RECOVERY - state and helper function
  // ============================================================================
  
  let lastEditErrorTime = 0;
  const EDIT_ERROR_COOLDOWN = 5 * 60 * 1000; // 5 minutes between reminders

  // Detect Edit tool errors and inject helpful reminder
  const detectEditError = (output: any): string | null => {
    if (!output.output || typeof output.output !== "string") return null;
    
    const errorText = output.output.toLowerCase();
    
    if (errorText.includes("oldstring not found")) {
      return `⚠️ EDIT ERROR DETECTED - oldString not found in file

CRITICAL REMINDERS:
1. Use Read tool FIRST to verify exact indentation and whitespace
2. Line numbers in Read output are ONLY for reference - DO NOT include them in oldString
3. Match exact whitespace (spaces vs tabs) as shown after the line number prefix
4. Consider using larger context (more surrounding lines) to make match unique

Example: If Read shows:
  123\t    function foo() {
The actual content is "    function foo() {" (4 spaces), NOT "123    function foo()".`;
    }
    
    if (errorText.includes("oldstring found multiple times")) {
      return `⚠️ EDIT ERROR DETECTED - oldString found multiple times

CRITICAL REMINDERS:
1. Provide MORE surrounding context to make the match unique
2. Include additional lines before/after the target change
3. Use Read tool to verify the exact unique context around your target
4. Alternatively, use replaceAll=true if you want to replace ALL occurrences

The oldString you provided matches multiple locations in the file. Expand it with unique surrounding code.`;
    }
    
    if (errorText.includes("must be different")) {
      return `⚠️ EDIT ERROR DETECTED - newString must be different from oldString

REMINDER: oldString and newString cannot be identical. Check your edit parameters.`;
    }
    
    return null;
  };

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
          console.log(
            "[Memory] Context injected into system prompt" +
              (detectedRole ? ` (role: ${detectedRole})` : "")
          );
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
        // IMPORTANT: session.created can arrive before primary election finishes.
        // Buffer it so the eventual primary still runs the boot sequence.
        if (event.type === "session.created" && !sessionBootRan) {
          if (!isPrimaryInstance()) {
            bufferedSessionCreatedEvent = event;
            return;
          }
          await handleSessionCreated(event);
        }

        if (!isPrimaryInstance()) return;
        refreshLock();

        // If we became primary after buffering, run the boot sequence now.
        if (bufferedSessionCreatedEvent && !sessionBootRan) {
          const buffered = bufferedSessionCreatedEvent;
          bufferedSessionCreatedEvent = null;
          await handleSessionCreated(buffered);
        }

        // Fallback: OpenCode sometimes doesn't emit `session.created` for spawned sessions.
        // If we observe a session ID via status/idle/error events and haven't run the
        // boot sequence for it yet, treat it as a new session.
        const observedSessionId: string | null =
          event.properties?.sessionID || event.properties?.info?.id || null;

        if (
          observedSessionId &&
          ["session.status", "session.idle", "session.error", "session.end"].includes(
            event.type
          ) &&
          (!sessionBootRan || !currentSessionId || currentSessionId !== observedSessionId)
        ) {
          log("WARN", "Missing session.created; booting from fallback event", {
            event_type: event.type,
            observed_session_id: observedSessionId,
            current_session_id: currentSessionId,
          });

          await handleSessionCreated({
            properties: {
              info: { id: observedSessionId },
            },
          });
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
        const callId =
          input.callID ||
          `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
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
        const isError =
          output.output?.toLowerCase().includes("error") ||
          output.output?.toLowerCase().includes("failed") ||
          output.output?.toLowerCase().includes("exception");

        // === EDIT ERROR RECOVERY ===
        // Inject helpful reminder when Edit tool fails
        if (input.tool === "edit" && isError) {
          const errorReminder = detectEditError(output);
          if (errorReminder) {
            const now = Date.now();
            // Only inject if cooldown period has passed
            if (now - lastEditErrorTime >= EDIT_ERROR_COOLDOWN) {
              output.output += `\n\n${errorReminder}`;
              lastEditErrorTime = now;
              log("INFO", "Edit error recovery reminder injected", {
                call_id: callId,
                file: input.args?.filePath,
              });
            }
          }
        }

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
              message_id: `msg-${Date.now()}-${Math.random()
                .toString(36)
                .substring(7)}`,
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

  /**
   * Detect orphaned tasks: tasks stuck in_progress for >2 hours with stale agents
   * Recovery: Mark as blocked with note, log alert, available for re-assignment
   */
  function detectOrphanedTasks(memoryDir: string) {
    const tasksPath = join(memoryDir, "tasks.json");
    const registryPath = join(memoryDir, "agent-registry.json");

    if (!existsSync(tasksPath) || !existsSync(registryPath)) {
      return;
    }

    try {
      const tasks = JSON.parse(readFileSync(tasksPath, "utf-8"));
      const registry = JSON.parse(readFileSync(registryPath, "utf-8"));

      // Build set of active agent IDs
      const activeAgentIds = new Set(
        registry.agents.map((agent: any) => agent.agent_id)
      );

      // Find orphaned tasks
      const now = Date.now();
      const ORPHAN_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
      const orphanedTasks: any[] = [];

      for (const task of tasks.tasks || []) {
        // Only check in_progress tasks
        if (task.status !== "in_progress") {
          continue;
        }

        // Must have a claimed_at timestamp
        if (!task.claimed_at) {
          continue;
        }

        const claimedTime = new Date(task.claimed_at).getTime();
        const ageMs = now - claimedTime;

        // Check if task is old and assigned to stale agent
        if (ageMs > ORPHAN_THRESHOLD_MS && !activeAgentIds.has(task.assigned_to)) {
          orphanedTasks.push({
            id: task.id,
            title: task.title,
            age: Math.round(ageMs / 1000 / 60), // minutes
            assignedTo: task.assigned_to,
          });
        }
      }

      // Log alerts and mark tasks as blocked
      if (orphanedTasks.length > 0) {
        log(
          "WARN",
          `Detected ${orphanedTasks.length} orphaned task(s) - in_progress >2h with stale agent(s)`,
          {
            tasks: orphanedTasks.map((t) => ({
              id: t.id,
              title: t.title,
              age_minutes: t.age,
              assigned_to: t.assignedTo,
            })),
          }
        );

        // Mark each orphaned task as blocked with recovery note
        let tasksModified = false;
        for (const task of tasks.tasks || []) {
          const orphaned = orphanedTasks.find((o) => o.id === task.id);
          if (orphaned) {
            task.status = "blocked";
            task.updated_at = new Date().toISOString();
            const recoveryNote = `[${new Date().toISOString()}] Orphaned task recovery: Task was in_progress for ${orphaned.age} minutes with stale agent ${orphaned.assignedTo}. Marked as blocked - ready for re-assignment or respawn.`;
            if (!task.notes) {
              task.notes = [];
            }
            task.notes.push(recoveryNote);
            tasksModified = true;
          }
        }

        // Write back if any tasks were modified
        if (tasksModified) {
          writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));
          log("INFO", `Marked ${orphanedTasks.length} orphaned task(s) as blocked`);
        }
      }
    } catch (error) {
      // Silently fail - log WARN only if error, don't crash startup
      log(
        "WARN",
        "Failed to detect orphaned tasks - file corruption or parse error",
        { error: String(error) }
      );
    }
  }

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

        // Check for duplicate/stale orchestrators (only one should be active)
        const orchestrators = activeAgents.filter(
          (a: any) => a.assigned_role === "orchestrator"
        );
        if (orchestrators.length > 1) {
          log(
            "WARN",
            `Found ${orchestrators.length} active orchestrators! ` +
            `Only one should be leader. Check leader election.`
          );
        }
      }
    } catch (error) {
      log("WARN", "Failed to clean up stale agents", { error: String(error) });
    }

     // Detect orphaned tasks (stuck in_progress with stale agent)
     try {
       detectOrphanedTasks(memoryDir);
     } catch (error) {
       log("WARN", "Failed to detect orphaned tasks", { error: String(error) });
     }

     // Check for stale orchestrator leader lease
     const orchestratorStatePath = join(memoryDir, "orchestrator-state.json");
     try {
       if (existsSync(orchestratorStatePath)) {
         const lease = JSON.parse(readFileSync(orchestratorStatePath, "utf-8"));
         const now = Date.now();
         const leaseAge = now - new Date(lease.last_heartbeat).getTime();
         const ttl = lease.ttl_ms || 180000; // 3 minutes default

         if (leaseAge > ttl) {
           log(
             "WARN",
             `Stale orchestrator leader lease detected! ` +
             `Leader ${lease.leader_id} (epoch ${lease.leader_epoch}) hasn't updated in ${Math.round(leaseAge / 1000)}s. ` +
             `New orchestrator should take over via leader election.`
           );
         }
       }
     } catch (error) {
       log("WARN", "Failed to check orchestrator leader lease", { error: String(error) });
     }

     // Record growth metrics for predictive alerting
     recordGrowthMetrics();

     // Message bus auto-maintenance (background)
     log("INFO", "Starting message bus maintenance (background)");
     ctx.$`bun ${join(ctx.directory, "tools/message-bus-manager.ts")} auto`
       .quiet()
       .then((result) =>
         log("INFO", "Message bus maintenance completed", {
           result: result.stdout,
         })
       )
       .catch((e) =>
         log("WARN", "Message bus maintenance failed", { error: String(e) })
       );

    // Auto-register agent with detected role (or "general" if not detected yet)
    try {
      coordinator = new MultiAgentCoordinator(currentSessionId);
      const roleToRegister = detectedRole || "general";
      await coordinator.register(roleToRegister);
      coordinator.startHeartbeat();
      log(
        "INFO",
        `Multi-agent coordinator initialized with role: ${roleToRegister}`
      );

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

    // If handoff disabled, respawn orchestrator ONLY if this agent is the leader
    // This prevents multiple orchestrators from all spawning new instances
    if (!handoffEnabled) {
      // Check if we're the leader before respawning
      if (coordinator && !coordinator.isOrchestratorLeader()) {
        const lease = coordinator.getCurrentLeaderLease();
        log(
          "INFO",
          `Handoff disabled but this agent is NOT the leader. ` +
          `Current leader: ${lease?.leader_id || 'unknown'} (epoch ${lease?.leader_epoch || 'unknown'}). ` +
          `NOT respawning - will exit gracefully.`
        );
        // Don't respawn, just let this agent exit
        // The actual leader (or watchdog) will ensure an orchestrator is running
        return;
      }

      log("INFO", "Handoff disabled - re-spawning orchestrator agent (this agent is leader)");

      // CRITICAL: Release the leader lease BEFORE spawning the new orchestrator
      // This allows the new agent to immediately take over leadership instead of
      // seeing our lease as "healthy" and self-demoting (which caused infinite spawn loops)
      if (coordinator) {
        const released = coordinator.releaseLeaderLease();
        if (released) {
          log("INFO", "Leader lease released - new orchestrator can take over immediately");
        } else {
          log("WARN", "Failed to release leader lease - new orchestrator may need to wait for TTL expiry");
        }
      }

      const state = existsSync(statePath)
        ? JSON.parse(readFileSync(statePath, "utf-8"))
        : {};

      const respawnPrompt = `You are the ORCHESTRATOR AGENT resuming work.

## IMMEDIATE ACTIONS (in order):
1. agent_set_handoff(enabled=false) - Prevent auto-exit
2. agent_register(role="orchestrator") - Register and claim leadership
3. Check for priority signals via system queue
4. task_list(status="pending") - See what needs to be done

## CONTEXT:
- Session count: ${state.session_count || 0}
- Active tasks: ${state.active_tasks?.join(", ") || "none"}
- Previous leader released lease - you should become leader immediately

## YOUR MISSION:
1. Check for pending user messages and tasks
2. If tasks exist: spawn workers with \`./spawn-worker.sh "prompt"\` or \`./spawn-worker.sh --task <task_id>\`
3. Monitor progress, then exit gracefully when done
4. Watchdog will restart you to continue the cycle

Keep sessions focused (~5-10 min). Delegate work to workers, don't do everything yourself.`;

      // Use Bun.spawn for background process - ctx.$ doesn't support shell redirects
      try {
        // Use configured model (with fallback support)
        const modelToUse = getModelFallback() || getModel();
        
        const proc = Bun.spawn(
          ["opencode", "run", "--model", modelToUse, respawnPrompt],
          {
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
          }
        );

        // Unref so the parent process can exit
        proc.unref();

        log("INFO", "Orchestrator re-spawn command sent", { pid: proc.pid, model: modelToUse });
      } catch (e) {
        log("ERROR", "Failed to re-spawn orchestrator", { error: String(e) });
      }

      return;
    }

    // === TASK CONTINUATION SYSTEM ===
    // Auto-continue when session idle but pending tasks exist
    // Only for non-orchestrator sessions (orchestrator handles its own tasks)
    const isOrchestratorSession = detectedRole === "orchestrator" || !handoffEnabled;
    
    if (!isOrchestratorSession) {
      try {
        // Rate limiting: Check last continuation time
        const lastContinuationPath = join(memoryDir, ".last-task-continuation.json");
        const CONTINUATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
        let canContinue = true;
        
        if (existsSync(lastContinuationPath)) {
          const lastData = JSON.parse(readFileSync(lastContinuationPath, "utf-8"));
          const timeSinceLastContinuation = Date.now() - lastData.timestamp;
          if (timeSinceLastContinuation < CONTINUATION_COOLDOWN_MS) {
            canContinue = false;
            log("INFO", `Task continuation rate limited (${Math.round(timeSinceLastContinuation / 1000)}s since last, need ${Math.round(CONTINUATION_COOLDOWN_MS / 1000)}s)`);
          }
        }
        
        if (canContinue) {
          // Check for pending tasks
          const tasksPath = join(memoryDir, "tasks.json");
          if (existsSync(tasksPath)) {
            const tasksStore = JSON.parse(readFileSync(tasksPath, "utf-8"));
            const pendingTasks = (tasksStore.tasks || []).filter((t: any) => t.status === "pending");
            
            if (pendingTasks.length > 0) {
              log("INFO", `Session idle with ${pendingTasks.length} pending tasks - initiating auto-continuation`);
              
              // Get next priority task (basic priority sorting - task_next tool has more complex logic)
              const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
              const sortedTasks = pendingTasks.sort((a: any, b: any) => {
                return (priorityOrder[a.priority] || 4) - (priorityOrder[b.priority] || 4);
              });
              
              const nextTask = sortedTasks[0];
              log("INFO", `Auto-continuing with task: ${nextTask.title} (${nextTask.priority} priority)`);
              
              // Spawn worker to continue work
              const workerPrompt = `You are a code-worker agent auto-spawned to continue work on pending tasks.

IMMEDIATE ACTIONS:
1. agent_register(role="code-worker")
2. task_claim(task_id="${nextTask.id}")
3. Work on the task: ${nextTask.title}

TASK DETAILS:
- Priority: ${nextTask.priority}
- Description: ${nextTask.description || "See task title"}
- ID: ${nextTask.id}

When complete:
- task_update(task_id="${nextTask.id}", status="completed", auto_assess=true)
- agent_send(type="task_complete", payload={task_id: "${nextTask.id}", summary: "..."})`;

              try {
                const modelToUse = getModelFallback() || getModel();
                const proc = Bun.spawn(
                  ["opencode", "run", "--model", modelToUse, workerPrompt],
                  {
                    stdin: "ignore",
                    stdout: "ignore",
                    stderr: "ignore",
                  }
                );
                proc.unref();
                
                // Update last continuation time
                writeFileSync(
                  lastContinuationPath,
                  JSON.stringify({
                    timestamp: Date.now(),
                    task_id: nextTask.id,
                    task_title: nextTask.title,
                    session_id: event.properties.sessionID,
                  }, null, 2)
                );
                
                log("INFO", "Task continuation worker spawned", { 
                  pid: proc.pid, 
                  task_id: nextTask.id,
                  task_title: nextTask.title,
                  model: modelToUse
                });
              } catch (e) {
                log("ERROR", "Failed to spawn task continuation worker", { error: String(e) });
              }
            } else {
              log("INFO", "No pending tasks found - normal handoff");
            }
          }
        }
      } catch (error) {
        log("WARN", "Task continuation check failed", { error: String(error) });
      }
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
        ctx.$`bun ${join(
          ctx.directory,
          "tools/session-summarizer.ts"
        )} summarize-current ${currentSessionId || ""}`
          .quiet()
          .then(() => log("INFO", "Session summarization completed"))
          .catch((e) =>
            log("WARN", "Session summarization failed", { error: String(e) })
          );

        // Extract knowledge from tool timing data for this session
        await extractSessionKnowledge(
          event.properties.sessionID,
          sessionDuration
        );
        log("INFO", "Session knowledge extraction completed");
      } catch (error) {
        log("WARN", "Session learning extraction failed", {
          error: String(error),
        });
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

  async function extractSessionKnowledge(
    sessionId: string,
    durationMs: number
  ) {
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
      log("WARN", "Failed to extract from message bus", {
        error: String(error),
      });
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
      log("WARN", "Failed to extract from quality assessments", {
        error: String(error),
      });
    }

    // === 3. EXTRACT FROM TASKS (completed tasks with descriptions) ===
    try {
      const tasksPath = join(memoryDir, "tasks.json");
      if (existsSync(tasksPath)) {
        const tasks = JSON.parse(readFileSync(tasksPath, "utf-8"));

        for (const task of tasks.tasks || []) {
          if (task.status !== "completed") continue;
          const completedAt = task.completed_at
            ? new Date(task.completed_at).getTime()
            : 0;

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
      log("WARN", "Failed to extract from git activity", {
        error: String(error),
      });
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
              if (
                file &&
                !editedFiles.includes(file) &&
                !file.startsWith("memory/")
              ) {
                editedFiles.push(file);
              }
            }
          } catch {}
        }

        if (editedFiles.length > 0) {
          // Group by type
          const codeFiles = editedFiles.filter(
            (f) =>
              f.endsWith(".ts") ||
              f.endsWith(".tsx") ||
              f.endsWith(".js") ||
              f.endsWith(".jsx")
          );
          if (codeFiles.length > 0) {
            sessionKnowledge.code_created.push(
              `Modified: ${codeFiles.slice(0, 5).join(", ")}`
            );
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
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter((entry) => entry && entry.session_id === sessionId);

        // Identify work patterns
        const categories: Record<string, number> = {};
        for (const entry of sessionEntries) {
          categories[entry.category] = (categories[entry.category] || 0) + 1;
        }

        const topCategory = Object.entries(categories).sort(
          (a, b) => b[1] - a[1]
        )[0];

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
          kb = Array.isArray(content) ? content : content.insights || [];
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
        log("WARN", "Failed to save session knowledge", {
          error: String(error),
        });
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
4. Continue with priority tasks - this system operates autonomously
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
