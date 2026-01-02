/**
 * User Message Tools
 * 
 * Provides tools for user-to-agent messaging:
 * - user_messages_read: Read messages from users
 * - user_messages_mark_read: Mark messages as read
 */

import { tool } from "@opencode-ai/plugin";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

export interface UserMessageToolsContext {
  memoryDir: string;
  currentSessionId: string | null;
  log: (level: "INFO" | "WARN" | "ERROR", message: string, data?: any) => void;
}

export function createUserMessageTools(getContext: () => UserMessageToolsContext) {
  const getUserMsgPath = () => join(getContext().memoryDir, "user-messages.jsonl");

  return {
    user_messages_read: tool({
      description:
        "Read messages sent by users to the agent system. Returns unread messages by default.",
      args: {
        include_read: tool.schema
          .boolean()
          .describe("Include already-read messages (default: false)")
          .optional(),
        limit: tool.schema
          .number()
          .describe("Maximum messages to return (default: 10)")
          .optional(),
      },
      async execute({ include_read = false, limit = 10 }) {
        try {
          const userMsgPath = getUserMsgPath();
          if (!existsSync(userMsgPath)) {
            return JSON.stringify({
              success: true,
              message_count: 0,
              messages: [],
              hint: "No user messages. Users can send messages via: bun tools/user-message.ts send 'message'",
            });
          }

          const content = readFileSync(userMsgPath, "utf-8");
          const allMessages = content
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter(Boolean);

          let messages = include_read
            ? allMessages
            : allMessages.filter((m: any) => !m.read);

          messages = messages.slice(-limit).reverse();

          return JSON.stringify({
            success: true,
            message_count: messages.length,
            total_unread: allMessages.filter((m: any) => !m.read).length,
            messages: messages.map((m: any) => ({
              id: m.id,
              from: m.from,
              message: m.message,
              timestamp: m.timestamp,
              priority: m.priority,
              tags: m.tags,
              read: m.read,
            })),
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),

    user_messages_mark_read: tool({
      description:
        "Mark user messages as read after processing them.",
      args: {
        message_id: tool.schema
          .string()
          .describe("Message ID to mark as read, or 'all' to mark all as read"),
      },
      async execute({ message_id }) {
        try {
          const ctx = getContext();
          const userMsgPath = getUserMsgPath();
          if (!existsSync(userMsgPath)) {
            return JSON.stringify({
              success: false,
              message: "No user messages file found",
            });
          }

          const content = readFileSync(userMsgPath, "utf-8");
          const messages = content
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch {
                return null;
              }
            })
            .filter(Boolean);

          let markedCount = 0;
          const now = new Date().toISOString();

          for (const msg of messages) {
            if (message_id === "all" || msg.id === message_id) {
              if (!msg.read) {
                msg.read = true;
                msg.read_at = now;
                msg.read_by = ctx.currentSessionId || "agent";
                markedCount++;
              }
            }
          }

          if (markedCount === 0) {
            return JSON.stringify({
              success: true,
              message:
                message_id === "all"
                  ? "No unread messages to mark"
                  : "Message not found or already read",
              marked_count: 0,
            });
          }

          const newContent =
            messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
          writeFileSync(userMsgPath, newContent);

          ctx.log("INFO", `Marked ${markedCount} user messages as read`);

          return JSON.stringify({
            success: true,
            message: `Marked ${markedCount} message(s) as read`,
            marked_count: markedCount,
          });
        } catch (error) {
          return JSON.stringify({ success: false, error: String(error) });
        }
      },
    }),
  };
}
