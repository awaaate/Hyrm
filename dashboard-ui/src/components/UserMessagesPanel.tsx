import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import {
  MessageSquare,
  Send,
  CheckCircle,
  AlertCircle,
  Clock,
} from "lucide-react";
import type { UserMessage, SendMessageRequest } from "./types";

const API_BASE = "http://localhost:3847";

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return then.toLocaleDateString();
}

function MessageItem({
  message,
  onMarkRead,
}: {
  message: UserMessage;
  onMarkRead: (id: string) => void;
}) {
  return (
    <div
      className={`p-3 rounded-lg border ${
        message.read
          ? "bg-muted/30 border-muted"
          : "bg-blue-500/10 border-blue-500/30"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {message.priority === "urgent" && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                Urgent
              </Badge>
            )}
            {!message.read && (
              <Badge className="text-xs bg-blue-500">New</Badge>
            )}
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTimeAgo(message.timestamp)}
            </span>
          </div>
          <p className="text-sm">{message.message}</p>
          {message.tags && message.tags.length > 0 && (
            <div className="flex gap-1 mt-2">
              {message.tags.map((tag, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
        {!message.read && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMarkRead(message.id)}
            className="shrink-0"
          >
            <CheckCircle className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function UserMessagesPanel({
  messages,
  onRefresh,
}: {
  messages: UserMessage[];
  onRefresh?: () => void;
}) {
  const [newMessage, setNewMessage] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [sending, setSending] = useState(false);

  const unreadCount = messages.filter((m) => !m.read).length;

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/user-messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: newMessage,
          priority,
        } as SendMessageRequest),
      });
      if (res.ok) {
        setNewMessage("");
        setPriority("normal");
        onRefresh?.();
      }
    } catch (e) {
      console.error("Failed to send message:", e);
    } finally {
      setSending(false);
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/user-messages/${id}/mark-read`, {
        method: "POST",
      });
      onRefresh?.();
    } catch (e) {
      console.error("Failed to mark as read:", e);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            User Messages
          </span>
          {unreadCount > 0 && (
            <Badge className="bg-blue-500">{unreadCount} unread</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Send message form */}
        <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
          <Textarea
            placeholder="Send a message to agents..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="min-h-[60px]"
          />
          <div className="flex items-center gap-2">
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "normal" | "urgent")}
              className="w-32"
            >
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </Select>
            <Button
              onClick={handleSend}
              disabled={!newMessage.trim() || sending}
              className="ml-auto"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Sending..." : "Send"}
            </Button>
          </div>
        </div>

        {/* Messages list */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No messages yet
            </p>
          ) : (
            messages.map((msg) => (
              <MessageItem
                key={msg.id}
                message={msg}
                onMarkRead={handleMarkRead}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default UserMessagesPanel;
