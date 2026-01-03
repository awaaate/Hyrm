/**
 * Tool Registry - Dynamic Tool Documentation
 * 
 * Provides centralized, dynamically-generated documentation for all plugin tools.
 * This is the SINGLE SOURCE OF TRUTH for tool availability and documentation.
 * 
 * Usage:
 *   import { getToolRegistry, formatToolsForPrompt } from './tool-registry';
 *   const registry = getToolRegistry();
 *   const promptSection = formatToolsForPrompt('xml');
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { MEMORY_DIR, WORKSPACE_DIR } from "./paths";

// ============================================================================
// TOOL DEFINITIONS - Single Source of Truth
// ============================================================================

export interface ToolParam {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enumValues?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  params: ToolParam[];
}

export interface ToolCategory {
  name: string;
  description: string;
  tools: string[];
}

export interface ToolRegistry {
  version: string;
  generated_at: string;
  categories: Record<string, ToolCategory>;
  tools: Record<string, ToolDefinition>;
}

/**
 * Complete tool definitions - manually maintained but centralized.
 * This is much more maintainable than having copies in 5+ files.
 */
const TOOL_DEFINITIONS: ToolDefinition[] = [
  // === AGENT TOOLS ===
  {
    name: "agent_register",
    description: "Register this agent in the multi-agent coordination system",
    category: "agent",
    params: [
      { name: "role", type: "string", description: "Agent role (e.g., 'orchestrator', 'worker', 'memory-worker')", required: false }
    ]
  },
  {
    name: "agent_status",
    description: "Get status of all active agents and current leader",
    category: "agent",
    params: []
  },
  {
    name: "agent_send",
    description: "Send message to other agents (broadcast, direct, or typed)",
    category: "agent",
    params: [
      { name: "type", type: "enum", description: "Message type", required: true, enumValues: ["broadcast", "direct", "task_claim", "task_complete", "request_help", "status_update"] },
      { name: "payload", type: "object", description: "Message content", required: true },
      { name: "to_agent", type: "string", description: "Target agent ID for direct messages", required: false }
    ]
  },
  {
    name: "agent_messages",
    description: "Read messages sent to this agent",
    category: "agent",
    params: [
      { name: "unread_only", type: "boolean", description: "Only return unread messages", required: false },
      { name: "type_filter", type: "string", description: "Filter by message type", required: false }
    ]
  },
  {
    name: "agent_update_status",
    description: "Update this agent's status or current task",
    category: "agent",
    params: [
      { name: "status", type: "string", description: "New status", required: false },
      { name: "current_task", type: "string", description: "Current task description", required: false }
    ]
  },
  {
    name: "agent_set_handoff",
    description: "Control whether agent can handoff (stop). Orchestrator should disable this.",
    category: "agent",
    params: [
      { name: "enabled", type: "boolean", description: "Whether handoff is enabled", required: true }
    ]
  },

  // === MEMORY TOOLS ===
  {
    name: "memory_status",
    description: "Get current memory system status: session count, achievements, active tasks",
    category: "memory",
    params: []
  },
  {
    name: "memory_search",
    description: "Search the knowledge base for relevant information",
    category: "memory",
    params: [
      { name: "query", type: "string", description: "Search query", required: true },
      { name: "limit", type: "number", description: "Max results to return", required: false }
    ]
  },
  {
    name: "memory_update",
    description: "Update memory state with new achievements or status",
    category: "memory",
    params: [
      { name: "status", type: "string", description: "New status message", required: false },
      { name: "achievement", type: "string", description: "Achievement to record", required: false },
      { name: "active_task", type: "string", description: "Current active task", required: false }
    ]
  },

  // === TASK TOOLS ===
  {
    name: "task_list",
    description: "List tasks filtered by status",
    category: "task",
    params: [
      { name: "status", type: "enum", description: "Filter by status", required: false, enumValues: ["pending", "in_progress", "completed", "blocked", "cancelled"] },
      { name: "limit", type: "number", description: "Max tasks to return", required: false }
    ]
  },
  {
    name: "task_create",
    description: "Create a new task",
    category: "task",
    params: [
      { name: "title", type: "string", description: "Task title", required: true },
      { name: "description", type: "string", description: "Detailed description", required: false },
      { name: "priority", type: "enum", description: "Task priority", required: false, enumValues: ["critical", "high", "medium", "low"] },
      { name: "tags", type: "array", description: "Task tags for categorization", required: false }
    ]
  },
  {
    name: "task_update",
    description: "Update an existing task",
    category: "task",
    params: [
      { name: "task_id", type: "string", description: "Task ID to update", required: true },
      { name: "status", type: "enum", description: "New status", required: false, enumValues: ["pending", "in_progress", "completed", "blocked", "cancelled"] },
      { name: "notes", type: "string", description: "Progress notes", required: false }
    ]
  },
  {
    name: "task_next",
    description: "Get the next highest priority pending task",
    category: "task",
    params: []
  },
  {
    name: "task_claim",
    description: "Claim a task to work on it",
    category: "task",
    params: [
      { name: "task_id", type: "string", description: "Task ID to claim", required: true }
    ]
  },
  {
    name: "task_spawn",
    description: "Spawn a worker agent to handle a task",
    category: "task",
    params: [
      { name: "task_id", type: "string", description: "Task ID to assign", required: true },
      { name: "worker_prompt", type: "string", description: "Custom prompt for worker", required: false }
    ]
  },
  {
    name: "task_schedule",
    description: "Schedule a task for future execution",
    category: "task",
    params: [
      { name: "task_id", type: "string", description: "Task ID", required: true },
      { name: "schedule_at", type: "string", description: "ISO timestamp for execution", required: true }
    ]
  },

  // === QUALITY TOOLS ===
  {
    name: "quality_assess",
    description: "Assess the quality of completed work",
    category: "quality",
    params: [
      { name: "task_id", type: "string", description: "Task ID to assess", required: true },
      { name: "score", type: "number", description: "Quality score 1-10", required: true },
      { name: "notes", type: "string", description: "Assessment notes", required: false },
      { name: "issues", type: "array", description: "Issues found", required: false }
    ]
  },
  {
    name: "quality_report",
    description: "Generate quality report with trends and statistics",
    category: "quality",
    params: [
      { name: "days", type: "number", description: "Days to include in report", required: false }
    ]
  },

  // === USER MESSAGE TOOLS ===
  {
    name: "user_messages_read",
    description: "Read messages from the user (highest priority)",
    category: "user",
    params: [
      { name: "unread_only", type: "boolean", description: "Only unread messages", required: false },
      { name: "limit", type: "number", description: "Max messages to return", required: false }
    ]
  },
  {
    name: "user_messages_mark_read",
    description: "Mark a user message as read/handled",
    category: "user",
    params: [
      { name: "message_id", type: "string", description: "Message ID to mark read", required: true }
    ]
  },

  // === GIT TOOLS ===
  {
    name: "git_status",
    description: "Get git repository status (staged, unstaged, untracked files)",
    category: "git",
    params: []
  },
  {
    name: "git_diff",
    description: "Show git diff for changes",
    category: "git",
    params: [
      { name: "staged", type: "boolean", description: "Show staged changes only", required: false },
      { name: "file", type: "string", description: "Specific file to diff", required: false }
    ]
  },
  {
    name: "git_log",
    description: "Show recent git commits",
    category: "git",
    params: [
      { name: "limit", type: "number", description: "Number of commits to show", required: false },
      { name: "oneline", type: "boolean", description: "One line per commit", required: false }
    ]
  },
  {
    name: "git_commit",
    description: "Commit staged changes with a message",
    category: "git",
    params: [
      { name: "message", type: "string", description: "Commit message", required: true },
      { name: "add_all", type: "boolean", description: "Stage all changes first", required: false }
    ]
  },
  {
    name: "git_search",
    description: "Search git history for commits matching criteria",
    category: "git",
    params: [
      { name: "query", type: "string", description: "Search query", required: true },
      { name: "author", type: "string", description: "Filter by author", required: false }
    ]
  },
  {
    name: "git_branches",
    description: "List git branches",
    category: "git",
    params: [
      { name: "all", type: "boolean", description: "Include remote branches", required: false }
    ]
  },

  // === RECOVERY TOOLS ===
  {
    name: "checkpoint_save",
    description: "Save a checkpoint of current work state",
    category: "recovery",
    params: [
      { name: "description", type: "string", description: "Checkpoint description", required: true },
      { name: "files", type: "array", description: "Files to include", required: false }
    ]
  },
  {
    name: "checkpoint_load",
    description: "Load a previously saved checkpoint",
    category: "recovery",
    params: [
      { name: "checkpoint_id", type: "string", description: "Checkpoint ID to load", required: true }
    ]
  },
  {
    name: "recovery_status",
    description: "Get recovery system status and available checkpoints",
    category: "recovery",
    params: []
  },
  {
    name: "recovery_cleanup",
    description: "Clean up old checkpoints",
    category: "recovery",
    params: [
      { name: "keep_last", type: "number", description: "Number of checkpoints to keep", required: false }
    ]
  },
];

/**
 * Category definitions with descriptions
 */
const CATEGORY_DEFINITIONS: Record<string, { description: string; priority: number }> = {
  agent: { description: "Multi-agent coordination and communication", priority: 1 },
  memory: { description: "Persistent memory system", priority: 2 },
  task: { description: "Task management and tracking", priority: 3 },
  quality: { description: "Work quality assessment", priority: 4 },
  user: { description: "User message handling (highest priority)", priority: 5 },
  git: { description: "Git version control operations", priority: 6 },
  recovery: { description: "Checkpoint and recovery system", priority: 7 },
};

// ============================================================================
// REGISTRY FUNCTIONS
// ============================================================================

let cachedRegistry: ToolRegistry | null = null;

/**
 * Get the complete tool registry
 */
export function getToolRegistry(): ToolRegistry {
  if (cachedRegistry) return cachedRegistry;

  const categories: Record<string, ToolCategory> = {};
  const tools: Record<string, ToolDefinition> = {};

  // Build categories
  for (const [catName, catDef] of Object.entries(CATEGORY_DEFINITIONS)) {
    categories[catName] = {
      name: catName,
      description: catDef.description,
      tools: [],
    };
  }

  // Build tools and populate categories
  for (const tool of TOOL_DEFINITIONS) {
    tools[tool.name] = tool;
    if (categories[tool.category]) {
      categories[tool.category].tools.push(tool.name);
    }
  }

  cachedRegistry = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    categories,
    tools,
  };

  return cachedRegistry;
}

/**
 * Get tools for a specific category
 */
export function getToolsByCategory(category: string): ToolDefinition[] {
  const registry = getToolRegistry();
  const cat = registry.categories[category];
  if (!cat) return [];
  return cat.tools.map(name => registry.tools[name]).filter(Boolean);
}

/**
 * Get tools appropriate for a specific role
 */
export function getToolsForRole(role: string): ToolDefinition[] {
  const registry = getToolRegistry();
  
  const roleCategories: Record<string, string[]> = {
    orchestrator: ["agent", "memory", "task", "quality", "user", "git"],
    "memory-worker": ["memory", "agent"],
    "code-worker": ["agent", "task", "git"],
    "analysis-worker": ["memory", "agent"],
    worker: ["agent", "task", "memory"],
  };

  const categories = roleCategories[role] || roleCategories.worker;
  return categories.flatMap(cat => getToolsByCategory(cat));
}

// ============================================================================
// FORMATTING FUNCTIONS
// ============================================================================

/**
 * Format tool signature for display
 */
function formatToolSignature(tool: ToolDefinition): string {
  if (tool.params.length === 0) {
    return `${tool.name}()`;
  }
  
  const params = tool.params
    .map(p => {
      const optional = p.required ? "" : "?";
      return `${p.name}${optional}`;
    })
    .join(", ");
  
  return `${tool.name}(${params})`;
}

/**
 * Format tools for XML prompt section
 */
export function formatToolsAsXml(categories?: string[]): string {
  const registry = getToolRegistry();
  const sortedCats = Object.entries(CATEGORY_DEFINITIONS)
    .sort((a, b) => a[1].priority - b[1].priority)
    .filter(([name]) => !categories || categories.includes(name));

  let output = "<available_tools>\n";

  for (const [catName, catDef] of sortedCats) {
    const cat = registry.categories[catName];
    if (!cat || cat.tools.length === 0) continue;

    output += `\n<category name="${catName}" description="${catDef.description}">\n`;
    
    for (const toolName of cat.tools) {
      const tool = registry.tools[toolName];
      if (!tool) continue;
      
      const sig = formatToolSignature(tool);
      output += `  <tool name="${tool.name}">\n`;
      output += `    <signature>${sig}</signature>\n`;
      output += `    <description>${tool.description}</description>\n`;
      
      if (tool.params.length > 0) {
        output += `    <params>\n`;
        for (const param of tool.params) {
          const req = param.required ? "required" : "optional";
          const enumStr = param.enumValues ? ` values="${param.enumValues.join("|")}"` : "";
          output += `      <param name="${param.name}" type="${param.type}" ${req}${enumStr}>${param.description}</param>\n`;
        }
        output += `    </params>\n`;
      }
      
      output += `  </tool>\n`;
    }
    
    output += `</category>\n`;
  }

  output += "</available_tools>";
  return output;
}

/**
 * Format tools as compact list (for smaller prompts)
 */
export function formatToolsCompact(categories?: string[]): string {
  const registry = getToolRegistry();
  const sortedCats = Object.entries(CATEGORY_DEFINITIONS)
    .sort((a, b) => a[1].priority - b[1].priority)
    .filter(([name]) => !categories || categories.includes(name));

  const lines: string[] = ["<available_tools>"];

  for (const [catName, catDef] of sortedCats) {
    const cat = registry.categories[catName];
    if (!cat || cat.tools.length === 0) continue;

    const toolSigs = cat.tools
      .map(name => registry.tools[name])
      .filter(Boolean)
      .map(t => formatToolSignature(t));
    
    lines.push(`${catName}: ${toolSigs.join(", ")}`);
  }

  lines.push("</available_tools>");
  return lines.join("\n");
}

/**
 * Format tools for role-specific prompts
 */
export function formatToolsForRole(role: string, compact: boolean = false): string {
  const roleCategories: Record<string, string[]> = {
    orchestrator: ["agent", "memory", "task", "quality", "user", "git"],
    "memory-worker": ["memory", "agent"],
    "code-worker": ["agent", "task", "git"],
    "analysis-worker": ["memory", "agent"],
    worker: ["agent", "task", "memory"],
  };

  const categories = roleCategories[role] || roleCategories.worker;
  
  return compact 
    ? formatToolsCompact(categories)
    : formatToolsAsXml(categories);
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Save registry to disk for use by non-TypeScript tools (like shell scripts)
 */
export function saveRegistryToFile(): void {
  const registry = getToolRegistry();
  const path = join(MEMORY_DIR, "tool-registry.json");
  writeFileSync(path, JSON.stringify(registry, null, 2));
}

/**
 * Clear the cached registry (useful for testing)
 */
export function clearRegistryCache(): void {
  cachedRegistry = null;
}
