import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Clock,
  ArrowLeft,
  User,
  Bot,
  Coins,
  ChevronRight,
} from "lucide-react";
import type { OpenCodeSession, OpenCodeMessage } from "./types";

const API_BASE = "http://localhost:3847";

// Format duration from ms
function formatDuration(ms: number): string {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

// Format timestamp
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

// Format token count
function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// Message component
function MessageItem({ message }: { message: OpenCodeMessage }) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={`p-3 rounded-lg border ${
        isUser
          ? "bg-blue-500/10 border-blue-500/30 ml-8"
          : isAssistant
          ? "bg-emerald-500/10 border-emerald-500/30 mr-8"
          : "bg-muted border-muted-foreground/20"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {isUser ? (
          <User className="h-4 w-4 text-blue-400" />
        ) : (
          <Bot className="h-4 w-4 text-emerald-400" />
        )}
        <span className="font-medium text-sm capitalize">{message.role}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {formatTime(message.createdAt)}
        </span>
      </div>

      {message.summary && (
        <p className="text-sm mb-2 text-foreground">{message.summary}</p>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {message.model && (
          <Badge variant="outline" className="text-xs">
            {message.model}
          </Badge>
        )}
        {message.tokens && (
          <>
            <span>In: {formatTokens(message.tokens.input)}</span>
            <span>Out: {formatTokens(message.tokens.output)}</span>
            {message.tokens.cache && (
              <span className="text-emerald-400">
                Cache: {formatTokens(message.tokens.cache.read)}
              </span>
            )}
          </>
        )}
        {message.finish && (
          <Badge
            variant={message.finish === "end-turn" ? "secondary" : "outline"}
            className="text-xs"
          >
            {message.finish}
          </Badge>
        )}
      </div>
    </div>
  );
}

// Session list item
function SessionListItem({
  session,
  onClick,
}: {
  session: OpenCodeSession;
  onClick: () => void;
}) {
  const totalTokens = session.tokens.input + session.tokens.output;
  const cacheHitRate =
    totalTokens > 0
      ? Math.round((session.tokens.cache.read / (totalTokens + session.tokens.cache.read)) * 100)
      : 0;

  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-sm truncate max-w-[200px]">
            {session.id}
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3 text-muted-foreground" />
            <span>{session.messageCount} messages</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span>{formatDuration(session.durationMs)}</span>
          </div>
        </div>

        <div className="flex gap-2 mt-2">
          <Badge variant="secondary" className="text-xs">
            <User className="h-3 w-3 mr-1" />
            {session.userMessages}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <Bot className="h-3 w-3 mr-1" />
            {session.assistantMessages}
          </Badge>
          {totalTokens > 0 && (
            <Badge variant="outline" className="text-xs">
              <Coins className="h-3 w-3 mr-1" />
              {formatTokens(totalTokens)}
            </Badge>
          )}
          {cacheHitRate > 0 && (
            <Badge variant="outline" className="text-xs text-emerald-400">
              {cacheHitRate}% cache
            </Badge>
          )}
        </div>

        <div className="text-xs text-muted-foreground mt-2">
          {formatTime(session.startTime)}
        </div>
      </CardContent>
    </Card>
  );
}

// Main panel component
export function OpenCodeSessionsPanel() {
  const [sessions, setSessions] = useState<OpenCodeSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<OpenCodeMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Fetch sessions
  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch(`${API_BASE}/api/opencode/sessions`);
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
        }
      } catch (e) {
        console.error("Error fetching sessions:", e);
      } finally {
        setLoading(false);
      }
    }

    fetchSessions();
    // Refresh every 30 seconds
    const interval = setInterval(fetchSessions, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch messages when session is selected
  useEffect(() => {
    if (!selectedSession) {
      setMessages([]);
      return;
    }

    async function fetchMessages() {
      setLoadingMessages(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/opencode/sessions/${selectedSession}/messages`
        );
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages || []);
        }
      } catch (e) {
        console.error("Error fetching messages:", e);
      } finally {
        setLoadingMessages(false);
      }
    }

    fetchMessages();
  }, [selectedSession]);

  // Calculate totals for selected session
  const sessionTotals =
    selectedSession && messages.length > 0
      ? messages.reduce(
          (acc, msg) => {
            if (msg.tokens) {
              acc.input += msg.tokens.input || 0;
              acc.output += msg.tokens.output || 0;
              acc.cacheRead += msg.tokens.cache?.read || 0;
            }
            return acc;
          },
          { input: 0, output: 0, cacheRead: 0 }
        )
      : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <MessageSquare className="h-8 w-8 mr-2 opacity-50 animate-pulse" />
        <span>Loading OpenCode sessions...</span>
      </div>
    );
  }

  // Show message view if session is selected
  if (selectedSession) {
    const session = sessions.find((s) => s.id === selectedSession);

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedSession(null)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Sessions
          </Button>
          <div className="flex-1">
            <h3 className="font-mono text-sm truncate">{selectedSession}</h3>
            {session && (
              <p className="text-xs text-muted-foreground">
                {formatTime(session.startTime)} - {formatDuration(session.durationMs)}
              </p>
            )}
          </div>
        </div>

        {/* Token summary */}
        {sessionTotals && (
          <Card>
            <CardContent className="p-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Coins className="h-4 w-4 text-muted-foreground" />
                  <span>Input: {formatTokens(sessionTotals.input)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>Output: {formatTokens(sessionTotals.output)}</span>
                </div>
                {sessionTotals.cacheRead > 0 && (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <span>Cache Reads: {formatTokens(sessionTotals.cacheRead)}</span>
                  </div>
                )}
                <div className="ml-auto text-muted-foreground">
                  {messages.length} messages
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Messages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Conversation ({messages.length} messages)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loadingMessages ? (
              <div className="text-center text-muted-foreground py-4">
                Loading messages...
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-4">
                No messages found
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {messages.map((msg) => (
                  <MessageItem key={msg.id} message={msg} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show session list
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">OpenCode Sessions</h3>
        <Badge variant="secondary">{sessions.length} sessions</Badge>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No OpenCode sessions found</p>
            <p className="text-sm">
              Sessions will appear here once you start using OpenCode
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <SessionListItem
              key={session.id}
              session={session}
              onClick={() => setSelectedSession(session.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default OpenCodeSessionsPanel;
