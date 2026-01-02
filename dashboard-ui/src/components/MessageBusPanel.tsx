import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Bot, Clock, ChevronDown, ChevronUp } from "lucide-react";
import type { MessageBusMessage } from "./types";

const typeColors: Record<string, string> = {
  broadcast: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  task_complete: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  task_claim: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  task_available: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  heartbeat: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  direct: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  request_help: "bg-red-500/20 text-red-400 border-red-500/30",
};

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

function MessageBusItem({ message }: { message: MessageBusMessage }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = typeColors[message.type] || typeColors.broadcast;

  return (
    <div
      className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${colorClass}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <span className="font-mono text-xs">{message.from_agent}</span>
          <Badge variant="outline" className="text-xs">
            {message.type}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatTimeAgo(message.timestamp)}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </div>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-current/20">
          <pre className="text-xs overflow-x-auto p-2 bg-background/50 rounded">
            {JSON.stringify(message.payload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function MessageBusPanel({
  messages,
}: {
  messages: MessageBusMessage[];
}) {
  const [filter, setFilter] = useState<string>("all");

  const filteredMessages =
    filter === "all"
      ? messages
      : messages.filter((m) => m.type === filter);

  const types = Array.from(new Set(messages.map((m) => m.type)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agent Messages
          </span>
          <Badge variant="secondary">{messages.length} messages</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter */}
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-48"
        >
          <option value="all">All Types</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>

        {/* Messages list */}
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {filteredMessages.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No messages
            </p>
          ) : (
            filteredMessages.map((msg, i) => (
              <MessageBusItem key={msg.message_id || i} message={msg} />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default MessageBusPanel;
