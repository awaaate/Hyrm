#!/usr/bin/env bun
/**
 * System Message Configuration CLI
 * 
 * Manage the dynamic system message injection for OpenCode agents.
 * Configure which sections appear in the agent's system prompt.
 * 
 * Usage:
 *   bun tools/system-message-config.ts show           # Show current config
 *   bun tools/system-message-config.ts enable <section>  # Enable a section
 *   bun tools/system-message-config.ts disable <section> # Disable a section
 *   bun tools/system-message-config.ts add-custom "title" "content"  # Add custom section
 *   bun tools/system-message-config.ts preview        # Preview system message
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { Task, TaskPriority } from "./shared/types";

const MEMORY_DIR = join(process.cwd(), "memory");
const CONFIG_PATH = join(MEMORY_DIR, "system-message-config.json");
const STATE_PATH = join(MEMORY_DIR, "state.json");
const TASKS_PATH = join(MEMORY_DIR, "tasks.json");
const USER_MSG_PATH = join(MEMORY_DIR, "user-messages.jsonl");

interface SectionConfig {
  enabled: boolean;
  priority: number;
  max_items?: number;
  description?: string;
  content?: string[];
}

/** User message entry from user-messages.jsonl */
interface UserMessageEntry {
  id: string;
  from: string;
  message: string;
  timestamp: string;
  read: boolean;
}

/** Section keys for type-safe access */
type SectionKey = keyof SystemMessageConfig["sections"];

interface SystemMessageConfig {
  version: string;
  description: string;
  enabled: boolean;
  sections: {
    memory_context: SectionConfig;
    pending_tasks: SectionConfig;
    user_messages: SectionConfig;
    agent_status: SectionConfig;
    custom_instructions: SectionConfig;
  };
  custom_sections: Array<{
    id: string;
    title: string;
    enabled: boolean;
    priority: number;
    content: string;
  }>;
  last_updated: string;
}

function loadConfig(): SystemMessageConfig {
  const defaultConfig: SystemMessageConfig = {
    version: "1.0",
    description: "Dynamic system message configuration for OpenCode agents",
    enabled: true,
    sections: {
      memory_context: { enabled: true, priority: 1, description: "Auto-generated memory system context" },
      pending_tasks: { enabled: true, priority: 2, max_items: 5, description: "Pending tasks sorted by priority" },
      user_messages: { enabled: true, priority: 3, max_items: 5, description: "Unread user messages" },
      agent_status: { enabled: true, priority: 4, description: "Active agents in the coordination system" },
      custom_instructions: { enabled: true, priority: 5, content: [] },
    },
    custom_sections: [],
    last_updated: new Date().toISOString(),
  };

  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    } catch {
      console.error("Failed to parse config, using defaults");
    }
  }
  return defaultConfig;
}

function saveConfig(config: SystemMessageConfig) {
  config.last_updated = new Date().toISOString();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function showConfig() {
  const config = loadConfig();
  
  console.log("\n=== System Message Configuration ===\n");
  console.log(`Version: ${config.version}`);
  console.log(`Enabled: ${config.enabled ? "Yes" : "No"}`);
  console.log(`Last Updated: ${config.last_updated}\n`);
  
  console.log("Built-in Sections:");
  console.log("-".repeat(60));
  
  const sectionNames = Object.keys(config.sections) as Array<keyof typeof config.sections>;
  for (const name of sectionNames) {
    const section = config.sections[name];
    const status = section.enabled ? "[ON]" : "[OFF]";
    const priority = `P${section.priority}`;
    const maxItems = section.max_items ? ` (max: ${section.max_items})` : "";
    console.log(`  ${status} ${priority} ${name}${maxItems}`);
    if (section.description) {
      console.log(`       ${section.description}`);
    }
  }
  
  if (config.custom_sections.length > 0) {
    console.log("\nCustom Sections:");
    console.log("-".repeat(60));
    for (const section of config.custom_sections) {
      const status = section.enabled ? "[ON]" : "[OFF]";
      console.log(`  ${status} P${section.priority} ${section.id}: ${section.title}`);
      console.log(`       ${section.content.slice(0, 60)}${section.content.length > 60 ? "..." : ""}`);
    }
  }
  
  console.log("\n");
}

function enableSection(sectionName: string) {
  const config = loadConfig();
  
  if (sectionName in config.sections) {
    config.sections[sectionName as SectionKey].enabled = true;
    saveConfig(config);
    console.log(`Enabled section: ${sectionName}`);
  } else {
    const customSection = config.custom_sections.find(s => s.id === sectionName);
    if (customSection) {
      customSection.enabled = true;
      saveConfig(config);
      console.log(`Enabled custom section: ${sectionName}`);
    } else {
      console.error(`Section not found: ${sectionName}`);
      console.log("Available sections:", Object.keys(config.sections).join(", "));
      if (config.custom_sections.length > 0) {
        console.log("Custom sections:", config.custom_sections.map(s => s.id).join(", "));
      }
    }
  }
}

function disableSection(sectionName: string) {
  const config = loadConfig();
  
  if (sectionName in config.sections) {
    config.sections[sectionName as SectionKey].enabled = false;
    saveConfig(config);
    console.log(`Disabled section: ${sectionName}`);
  } else {
    const customSection = config.custom_sections.find(s => s.id === sectionName);
    if (customSection) {
      customSection.enabled = false;
      saveConfig(config);
      console.log(`Disabled custom section: ${sectionName}`);
    } else {
      console.error(`Section not found: ${sectionName}`);
    }
  }
}

function addCustomSection(title: string, content: string) {
  const config = loadConfig();
  
  const id = `custom_${Date.now().toString(36)}`;
  const maxPriority = Math.max(
    ...Object.values(config.sections).map(s => s.priority),
    ...config.custom_sections.map(s => s.priority),
    0
  );
  
  config.custom_sections.push({
    id,
    title,
    enabled: true,
    priority: maxPriority + 1,
    content,
  });
  
  saveConfig(config);
  console.log(`Added custom section: ${id}`);
  console.log(`  Title: ${title}`);
  console.log(`  Priority: ${maxPriority + 1}`);
}

function removeCustomSection(id: string) {
  const config = loadConfig();
  const index = config.custom_sections.findIndex(s => s.id === id);
  
  if (index !== -1) {
    config.custom_sections.splice(index, 1);
    saveConfig(config);
    console.log(`Removed custom section: ${id}`);
  } else {
    console.error(`Custom section not found: ${id}`);
  }
}

function setPriority(sectionName: string, priority: number) {
  const config = loadConfig();
  
  if (sectionName in config.sections) {
    config.sections[sectionName as SectionKey].priority = priority;
    saveConfig(config);
    console.log(`Set priority ${priority} for section: ${sectionName}`);
  } else {
    const customSection = config.custom_sections.find(s => s.id === sectionName);
    if (customSection) {
      customSection.priority = priority;
      saveConfig(config);
      console.log(`Set priority ${priority} for custom section: ${sectionName}`);
    } else {
      console.error(`Section not found: ${sectionName}`);
    }
  }
}

function setMaxItems(sectionName: string, maxItems: number) {
  const config = loadConfig();
  
  if (sectionName in config.sections) {
    config.sections[sectionName as SectionKey].max_items = maxItems;
    saveConfig(config);
    console.log(`Set max_items ${maxItems} for section: ${sectionName}`);
  } else {
    console.error(`Section not found: ${sectionName}`);
  }
}

function addInstruction(instruction: string) {
  const config = loadConfig();
  
  if (!config.sections.custom_instructions.content) {
    config.sections.custom_instructions.content = [];
  }
  
  config.sections.custom_instructions.content.push(instruction);
  saveConfig(config);
  console.log(`Added custom instruction: ${instruction.slice(0, 60)}...`);
}

function clearInstructions() {
  const config = loadConfig();
  config.sections.custom_instructions.content = [];
  saveConfig(config);
  console.log("Cleared all custom instructions");
}

function previewSystemMessage() {
  console.log("\n=== System Message Preview ===\n");
  
  const config = loadConfig();
  
  if (!config.enabled) {
    console.log("(System message injection is disabled)\n");
    return;
  }
  
  const sections: Array<{ priority: number; content: string }> = [];
  
  // Memory context
  if (config.sections.memory_context?.enabled) {
    if (existsSync(STATE_PATH)) {
      const state = JSON.parse(readFileSync(STATE_PATH, "utf-8"));
      const achievements = state.recent_achievements?.slice(0, 3) || [];
      const achievementsList = achievements.length > 0
        ? achievements.map((a: string) => `  - ${a}`).join("\n")
        : "  - None";
      
      sections.push({
        priority: config.sections.memory_context.priority,
        content: `<system_state>
Session: ${state.session_count || 0}
Status: ${state.status || "unknown"}
Active Tasks: ${state.active_tasks?.join(", ") || "none"}
Total Tokens: ${state.total_tokens_used?.toLocaleString() || 0}
</system_state>

<recent_achievements>
${achievementsList}
</recent_achievements>`
      });
    }
  }
  
  // Pending tasks
  if (config.sections.pending_tasks?.enabled && existsSync(TASKS_PATH)) {
    const tasksStore = JSON.parse(readFileSync(TASKS_PATH, "utf-8")) as { tasks?: Task[] };
    const pending = (tasksStore.tasks || [])
      .filter((t: Task) => t.status === "pending")
      .sort((a: Task, b: Task) => {
        const order: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
      })
      .slice(0, config.sections.pending_tasks.max_items || 5);
    
    if (pending.length > 0) {
      const taskList = pending
        .map((t: Task) => `  - [${t.priority.toUpperCase()}] ${t.title} (ID: ${t.id})`)
        .join("\n");
      
      sections.push({
        priority: config.sections.pending_tasks.priority,
        content: `<pending_tasks count="${pending.length}">
${taskList}
</pending_tasks>`
      });
    }
  }
  
  // User messages
  if (config.sections.user_messages?.enabled && existsSync(USER_MSG_PATH)) {
    const content = readFileSync(USER_MSG_PATH, "utf-8");
    const messages = content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as UserMessageEntry)
      .filter((m: UserMessageEntry) => !m.read);
    
    if (messages.length > 0) {
      const maxItems = config.sections.user_messages.max_items || 5;
      const msgList = messages
        .slice(-maxItems)
        .map((m: UserMessageEntry) => {
          const truncatedMsg = m.message.length > 100 
            ? m.message.slice(0, 100) + "..." 
            : m.message;
          return `  - ${m.from}: "${truncatedMsg}" (id: ${m.id})`;
        })
        .join("\n");
      
      sections.push({
        priority: config.sections.user_messages.priority,
        content: `<unread_user_messages count="${messages.length}" priority="HIGH">
ADDRESS THESE FIRST - User requests have highest priority!
${msgList}
Use user_messages_mark_read(id) after handling each message.
</unread_user_messages>`
      });
    }
  }
  
  // Custom instructions
  if (config.sections.custom_instructions?.enabled && config.sections.custom_instructions.content?.length > 0) {
    sections.push({
      priority: config.sections.custom_instructions.priority,
      content: `<custom_instructions>
${config.sections.custom_instructions.content.join("\n")}
</custom_instructions>`
    });
  }
  
  // Custom sections
  for (const custom of config.custom_sections) {
    if (custom.enabled) {
      sections.push({
        priority: custom.priority,
        content: `<custom_section title="${custom.title}">
${custom.content}
</custom_section>`
      });
    }
  }
  
  // Sort and print
  sections.sort((a, b) => a.priority - b.priority);
  
  console.log("<memory_system_context>");
  console.log(sections.map(s => s.content).join("\n\n"));
  console.log(`
<available_tools>
Memory: memory_status, memory_search, memory_update
Agent: agent_status, agent_send, agent_messages, agent_register
Tasks: task_list, task_create, task_update, task_claim
User: user_messages_read, user_messages_mark_read
</available_tools>

<multi_agent_note>
You are part of a multi-agent system. Use agent_status() to see other agents.
Coordinate work via agent_send() and agent_messages().
</multi_agent_note>
</memory_system_context>`);
  console.log("\n");
}

function showHelp() {
  console.log(`
System Message Configuration CLI

Usage:
  bun tools/system-message-config.ts <command> [options]

Commands:
  show                         Show current configuration
  preview                      Preview the system message that would be injected
  enable <section>             Enable a section
  disable <section>            Disable a section
  add-custom <title> <content> Add a custom section
  remove-custom <id>           Remove a custom section
  set-priority <section> <n>   Set section priority (lower = first)
  set-max-items <section> <n>  Set max items for tasks/messages sections
  add-instruction <text>       Add a custom instruction
  clear-instructions           Clear all custom instructions

Sections:
  memory_context     - Session count, status, achievements
  pending_tasks      - Pending tasks sorted by priority
  user_messages      - Unread user messages
  agent_status       - Active agents info
  custom_instructions - Custom instructions list

Examples:
  bun tools/system-message-config.ts show
  bun tools/system-message-config.ts disable user_messages
  bun tools/system-message-config.ts set-max-items pending_tasks 10
  bun tools/system-message-config.ts add-custom "Important" "Always use bun for TypeScript"
  bun tools/system-message-config.ts add-instruction "Focus on code quality"
`);
}

// Main
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "show":
    showConfig();
    break;
  case "preview":
    previewSystemMessage();
    break;
  case "enable":
    enableSection(args[1]);
    break;
  case "disable":
    disableSection(args[1]);
    break;
  case "add-custom":
    addCustomSection(args[1], args.slice(2).join(" "));
    break;
  case "remove-custom":
    removeCustomSection(args[1]);
    break;
  case "set-priority":
    setPriority(args[1], parseInt(args[2], 10));
    break;
  case "set-max-items":
    setMaxItems(args[1], parseInt(args[2], 10));
    break;
  case "add-instruction":
    addInstruction(args.slice(1).join(" "));
    break;
  case "clear-instructions":
    clearInstructions();
    break;
  case "help":
  case "--help":
  case "-h":
    showHelp();
    break;
  default:
    if (command) {
      console.error(`Unknown command: ${command}`);
    }
    showHelp();
}
