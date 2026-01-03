/**
 * Shared Actions
 * 
 * Functions for modifying system state (tasks, messages, etc).
 * These are write operations - for read operations see data-fetchers.ts
 */

import { writeFileSync, appendFileSync } from "fs";
import { readJson } from "./json-utils";
import { PATHS } from "./paths";
import type { Task, TaskStore, UserMessage } from "./types";

// ============================================================================
// Task Actions
// ============================================================================

/**
 * Create a new task.
 */
export function createTask(
  title: string,
  priority: Task["priority"] = "medium",
  description?: string
): Task {
  const store = readJson<TaskStore>(PATHS.tasks, {
    tasks: [],
    version: "1.0",
    completed_count: 0,
    last_updated: "",
  });

  const newTask: Task = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    description: description || "",
    priority,
    status: "pending",
    created_at: new Date().toISOString(),
    complexity: "moderate",
    tags: [],
  };

  store.tasks.push(newTask);
  store.last_updated = new Date().toISOString();
  writeFileSync(PATHS.tasks, JSON.stringify(store, null, 2));

  return newTask;
}

/**
 * Claim a task (set to in_progress and assign).
 */
export function claimTask(taskId: string, assignee: string = "cli-user"): boolean {
  const store = readJson<TaskStore>(PATHS.tasks, { tasks: [], version: "", completed_count: 0, last_updated: "" });
  const task = store.tasks.find((t) => t.id === taskId);

  if (!task || task.status !== "pending") {
    return false;
  }

  task.status = "in_progress";
  task.assigned_to = assignee;
  task.claimed_at = new Date().toISOString();
  store.last_updated = new Date().toISOString();

  writeFileSync(PATHS.tasks, JSON.stringify(store, null, 2));
  return true;
}

/**
 * Complete a task.
 */
export function completeTask(taskId: string, notes?: string): boolean {
  const store = readJson<TaskStore>(PATHS.tasks, { tasks: [], version: "", completed_count: 0, last_updated: "" });
  const task = store.tasks.find((t) => t.id === taskId);

  if (!task) {
    return false;
  }

  task.status = "completed";
  task.completed_at = new Date().toISOString();
  if (notes) {
    task.notes = (task.notes || "") + "\n" + notes;
  }
  store.completed_count = (store.completed_count || 0) + 1;
  store.last_updated = new Date().toISOString();

  writeFileSync(PATHS.tasks, JSON.stringify(store, null, 2));
  return true;
}

/**
 * Cancel a task.
 */
export function cancelTask(taskId: string): boolean {
  const store = readJson<TaskStore>(PATHS.tasks, { tasks: [], version: "", completed_count: 0, last_updated: "" });
  const task = store.tasks.find((t) => t.id === taskId);

  if (!task) {
    return false;
  }

  task.status = "cancelled";
  task.updated_at = new Date().toISOString();
  store.last_updated = new Date().toISOString();

  writeFileSync(PATHS.tasks, JSON.stringify(store, null, 2));
  return true;
}

/**
 * Update task priority.
 */
export function updateTaskPriority(taskId: string, priority: Task["priority"]): boolean {
  const store = readJson<TaskStore>(PATHS.tasks, { tasks: [], version: "", completed_count: 0, last_updated: "" });
  const task = store.tasks.find((t) => t.id === taskId);

  if (!task) {
    return false;
  }

  task.priority = priority;
  task.updated_at = new Date().toISOString();
  store.last_updated = new Date().toISOString();

  writeFileSync(PATHS.tasks, JSON.stringify(store, null, 2));
  return true;
}

// ============================================================================
// User Message Actions
// ============================================================================

/**
 * Send a user message to agents.
 */
export function sendUserMessage(
  message: string,
  options: {
    from?: string;
    priority?: "normal" | "urgent";
    tags?: string[];
  } = {}
): UserMessage {
  const msg: UserMessage = {
    id: `umsg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    from: options.from || process.env.USER || "user",
    message,
    timestamp: new Date().toISOString(),
    priority: options.priority || "normal",
    read: false,
    tags: options.tags,
  };

  appendFileSync(PATHS.userMessages, JSON.stringify(msg) + "\n");
  return msg;
}

/**
 * Mark a user message as read.
 */
export function markMessageRead(messageId: string, readBy: string = "agent"): boolean {
  const { readJsonl } = require("./json-utils");
  const messages = readJsonl<UserMessage>(PATHS.userMessages);
  const msg = messages.find((m: UserMessage) => m.id === messageId);

  if (!msg) {
    return false;
  }

  msg.read = true;
  msg.read_by = readBy;

  // Rewrite the file
  const content = messages.map((m: UserMessage) => JSON.stringify(m)).join("\n") + "\n";
  writeFileSync(PATHS.userMessages, content);
  return true;
}
