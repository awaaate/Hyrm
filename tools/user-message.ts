#!/usr/bin/env bun
/**
 * User Message System
 * 
 * Allows users to send messages to the agent system that agents can read and respond to.
 * This creates a communication channel from user -> agents.
 * 
 * Usage:
 *   bun tools/user-message.ts send "Your message here"
 *   bun tools/user-message.ts list
 *   bun tools/user-message.ts unread
 *   bun tools/user-message.ts mark-read <message-id>
 *   bun tools/user-message.ts clear
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { join } from "path";

const MEMORY_DIR = join(process.cwd(), "memory");
const USER_MESSAGES_PATH = join(MEMORY_DIR, "user-messages.jsonl");

interface UserMessage {
  id: string;
  from: string;
  message: string;
  timestamp: string;
  read: boolean;
  read_at?: string;
  read_by?: string;
  priority?: "normal" | "urgent";
  tags?: string[];
}

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function generateId(): string {
  return `umsg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function readMessages(): UserMessage[] {
  if (!existsSync(USER_MESSAGES_PATH)) {
    return [];
  }
  
  try {
    const content = readFileSync(USER_MESSAGES_PATH, "utf-8");
    return content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    return [];
  }
}

function writeMessages(messages: UserMessage[]): void {
  const content = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
  writeFileSync(USER_MESSAGES_PATH, content);
}

function sendMessage(message: string, options: { from?: string; priority?: "normal" | "urgent"; tags?: string[] } = {}): UserMessage {
  const newMessage: UserMessage = {
    id: generateId(),
    from: options.from || process.env.USER || "user",
    message: message,
    timestamp: new Date().toISOString(),
    read: false,
    priority: options.priority || "normal",
    tags: options.tags,
  };

  appendFileSync(USER_MESSAGES_PATH, JSON.stringify(newMessage) + "\n");
  return newMessage;
}

function listMessages(onlyUnread: boolean = false): void {
  const messages = readMessages();
  const filtered = onlyUnread ? messages.filter((m) => !m.read) : messages;
  
  if (filtered.length === 0) {
    console.log(`${colors.dim}No ${onlyUnread ? "unread " : ""}messages.${colors.reset}`);
    return;
  }

  console.log(`\n${colors.bright}${onlyUnread ? "Unread " : ""}Messages (${filtered.length})${colors.reset}\n`);
  console.log(`${colors.dim}${"─".repeat(70)}${colors.reset}`);

  for (const msg of filtered.slice(-20).reverse()) {
    const statusIcon = msg.read ? `${colors.dim}○${colors.reset}` : `${colors.green}●${colors.reset}`;
    const priorityIndicator = msg.priority === "urgent" ? `${colors.red}[URGENT]${colors.reset} ` : "";
    const timeAgo = formatTimeAgo(msg.timestamp);
    
    console.log(
      `${statusIcon} ${priorityIndicator}${colors.bright}${msg.from}${colors.reset} ` +
      `${colors.dim}(${timeAgo})${colors.reset}`
    );
    console.log(`  ${colors.cyan}ID: ${msg.id}${colors.reset}`);
    console.log(`  ${msg.message}`);
    
    if (msg.tags && msg.tags.length > 0) {
      console.log(`  ${colors.dim}Tags: ${msg.tags.join(", ")}${colors.reset}`);
    }
    
    if (msg.read && msg.read_by) {
      console.log(`  ${colors.dim}Read by: ${msg.read_by} at ${msg.read_at}${colors.reset}`);
    }
    
    console.log();
  }
}

function markAsRead(messageId: string, readBy?: string): boolean {
  const messages = readMessages();
  const msg = messages.find((m) => m.id === messageId);
  
  if (!msg) {
    console.log(`${colors.red}Message not found: ${messageId}${colors.reset}`);
    return false;
  }
  
  if (msg.read) {
    console.log(`${colors.yellow}Message already read.${colors.reset}`);
    return true;
  }
  
  msg.read = true;
  msg.read_at = new Date().toISOString();
  msg.read_by = readBy || "agent";
  
  writeMessages(messages);
  console.log(`${colors.green}Message marked as read.${colors.reset}`);
  return true;
}

function markAllAsRead(readBy?: string): number {
  const messages = readMessages();
  let count = 0;
  
  for (const msg of messages) {
    if (!msg.read) {
      msg.read = true;
      msg.read_at = new Date().toISOString();
      msg.read_by = readBy || "agent";
      count++;
    }
  }
  
  writeMessages(messages);
  return count;
}

function clearMessages(): void {
  if (existsSync(USER_MESSAGES_PATH)) {
    writeFileSync(USER_MESSAGES_PATH, "");
  }
  console.log(`${colors.green}All messages cleared.${colors.reset}`);
}

function formatTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

function getUnreadCount(): number {
  const messages = readMessages();
  return messages.filter((m) => !m.read).length;
}

function watchMessages(interval: number = 2000): void {
  let lastCount = 0;
  
  console.log(`${colors.cyan}Watching for new messages... (Ctrl+C to stop)${colors.reset}\n`);
  
  const check = () => {
    const messages = readMessages();
    const unread = messages.filter((m) => !m.read);
    
    if (unread.length > lastCount) {
      const newMessages = unread.slice(lastCount);
      for (const msg of newMessages) {
        console.log(`\n${colors.green}━━━ NEW MESSAGE ━━━${colors.reset}`);
        console.log(`${colors.bright}From: ${msg.from}${colors.reset}`);
        console.log(`${colors.dim}ID: ${msg.id}${colors.reset}`);
        console.log(`${msg.message}`);
        console.log(`${colors.green}━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
      }
    }
    
    lastCount = unread.length;
  };
  
  check();
  setInterval(check, interval);
}

// CLI Interface
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "send":
    const message = args.slice(1).join(" ");
    if (!message) {
      console.log(`${colors.red}Error: Message required${colors.reset}`);
      console.log(`Usage: bun tools/user-message.ts send "Your message here"`);
      process.exit(1);
    }
    
    // Parse options from message
    let priority: "normal" | "urgent" = "normal";
    let tags: string[] = [];
    let cleanMessage = message;
    
    if (message.includes("--urgent")) {
      priority = "urgent";
      cleanMessage = cleanMessage.replace("--urgent", "").trim();
    }
    
    const tagMatch = message.match(/--tags=([^\s]+)/);
    if (tagMatch) {
      tags = tagMatch[1].split(",");
      cleanMessage = cleanMessage.replace(tagMatch[0], "").trim();
    }
    
    const sentMsg = sendMessage(cleanMessage, { priority, tags });
    console.log(`${colors.green}Message sent!${colors.reset}`);
    console.log(`${colors.dim}ID: ${sentMsg.id}${colors.reset}`);
    break;

  case "list":
    listMessages(false);
    break;

  case "unread":
    listMessages(true);
    break;

  case "mark-read":
    const msgId = args[1];
    if (!msgId) {
      console.log(`${colors.red}Error: Message ID required${colors.reset}`);
      console.log(`Usage: bun tools/user-message.ts mark-read <message-id>`);
      process.exit(1);
    }
    
    if (msgId === "all") {
      const count = markAllAsRead();
      console.log(`${colors.green}Marked ${count} messages as read.${colors.reset}`);
    } else {
      markAsRead(msgId, args[2]);
    }
    break;

  case "clear":
    clearMessages();
    break;

  case "watch":
    const watchInterval = args[1] ? parseInt(args[1], 10) : 2000;
    watchMessages(watchInterval);
    break;

  case "count":
    const count = getUnreadCount();
    console.log(`${colors.bright}${count}${colors.reset} unread message${count !== 1 ? "s" : ""}`);
    break;

  default:
    console.log(`
${colors.bright}User Message System${colors.reset}

Send messages to the agent system that agents can read and respond to.

${colors.cyan}Usage:${colors.reset}
  bun tools/user-message.ts <command> [args]

${colors.cyan}Commands:${colors.reset}
  send <message>      Send a message to agents
  list                List all messages
  unread              List unread messages only
  mark-read <id>      Mark a message as read (use 'all' for all messages)
  count               Show unread message count
  watch [interval]    Watch for new messages in real-time
  clear               Clear all messages

${colors.cyan}Options for send:${colors.reset}
  --urgent            Mark message as urgent
  --tags=tag1,tag2    Add tags to the message

${colors.cyan}Examples:${colors.reset}
  bun tools/user-message.ts send "Please focus on the dashboard task"
  bun tools/user-message.ts send "Stop current work" --urgent
  bun tools/user-message.ts send "Review this" --tags=review,code
  bun tools/user-message.ts list
  bun tools/user-message.ts mark-read all
  bun tools/user-message.ts watch 1000

${colors.dim}Messages are stored in: memory/user-messages.jsonl${colors.reset}
`);
}
