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
  DollarSign,
  TrendingDown,
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

// Format cost in dollars
function formatCost(cost: number): string {
  if (cost >= 1) return `$${cost.toFixed(2)}`;
  if (cost >= 0.01) return `$${cost.toFixed(2)}`;
  if (cost >= 0.001) return `$${cost.toFixed(3)}`;
  if (cost > 0) return `<$0.01`;
  return "$0.00";
}

// Claude pricing constants (per 1M tokens) for client-side calculation
const PRICING = {
  input: 3.00,        // $3.00 per 1M input tokens
  output: 15.00,      // $15.00 per 1M output tokens  
  cacheRead: 0.30,    // $0.30 per 1M cache read tokens (90% discount)
};

// Calculate cost from tokens
function calculateCost(tokens: { input: number; output: number; cacheRead: number }): {
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  totalCost: number;
  cacheSavings: number;
} {
  const inputCost = (tokens.input / 1_000_000) * PRICING.input;
  const outputCost = (tokens.output / 1_000_000) * PRICING.output;
  const cacheReadCost = (tokens.cacheRead / 1_000_000) * PRICING.cacheRead;
  
  // Cache savings = what we would have paid if cache reads were regular input tokens
  const cacheSavings = (tokens.cacheRead / 1_000_000) * (PRICING.input - PRICING.cacheRead);
  
  return {
    inputCost,
    outputCost,
    cacheReadCost,
    totalCost: inputCost + outputCost + cacheReadCost,
    cacheSavings,
  };
}

// Message component
function MessageItem({ message }: { message: OpenCodeMessage }) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  
  // Calculate per-message cost
  const msgCost = message.tokens ? calculateCost({
    input: message.tokens.input || 0,
    output: message.tokens.output || 0,
    cacheRead: message.tokens.cache?.read || 0,
  }) : null;

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
        {msgCost && msgCost.totalCost > 0 && (
          <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">
            <DollarSign className="h-3 w-3 mr-0.5" />
            {formatCost(msgCost.totalCost)}
          </Badge>
        )}
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
            {message.tokens.cache && message.tokens.cache.read > 0 && (
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
  
  // Use server-provided cost or calculate locally
  const cost = session.cost || (totalTokens > 0 ? calculateCost({
    input: session.tokens.input,
    output: session.tokens.output,
    cacheRead: session.tokens.cache.read,
  }) : null);

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
          {cost && cost.totalCost > 0 && (
            <Badge variant="default" className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">
              <DollarSign className="h-3 w-3 mr-0.5" />
              {formatCost(cost.totalCost)}
            </Badge>
          )}
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

        <div className="flex flex-wrap gap-2 mt-2">
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
          {cost && cost.cacheSavings > 0.001 && (
            <Badge variant="outline" className="text-xs text-green-400">
              <TrendingDown className="h-3 w-3 mr-0.5" />
              {formatCost(cost.cacheSavings)} saved
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
  
  // Calculate cost for session totals
  const sessionCost = sessionTotals ? calculateCost(sessionTotals) : null;

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

        {/* Token and cost summary */}
        {sessionTotals && sessionCost && (
          <Card>
            <CardContent className="p-4">
              {/* Cost headline */}
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-muted">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-amber-400" />
                  <span className="text-lg font-semibold">Session Cost</span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-bold text-amber-400">{formatCost(sessionCost.totalCost)}</span>
                  {sessionCost.cacheSavings > 0.001 && (
                    <div className="text-xs text-green-400 flex items-center justify-end gap-1">
                      <TrendingDown className="h-3 w-3" />
                      {formatCost(sessionCost.cacheSavings)} saved with cache
                    </div>
                  )}
                </div>
              </div>
              
              {/* Cost breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                <div className="text-center p-2 rounded bg-muted/30">
                  <div className="text-xs text-muted-foreground">Input</div>
                  <div className="font-medium">{formatCost(sessionCost.inputCost)}</div>
                  <div className="text-xs text-muted-foreground">{formatTokens(sessionTotals.input)} tokens</div>
                </div>
                <div className="text-center p-2 rounded bg-muted/30">
                  <div className="text-xs text-muted-foreground">Output</div>
                  <div className="font-medium">{formatCost(sessionCost.outputCost)}</div>
                  <div className="text-xs text-muted-foreground">{formatTokens(sessionTotals.output)} tokens</div>
                </div>
                <div className="text-center p-2 rounded bg-muted/30">
                  <div className="text-xs text-muted-foreground">Cache Reads</div>
                  <div className="font-medium text-emerald-400">{formatCost(sessionCost.cacheReadCost)}</div>
                  <div className="text-xs text-muted-foreground">{formatTokens(sessionTotals.cacheRead)} tokens</div>
                </div>
                <div className="text-center p-2 rounded bg-muted/30">
                  <div className="text-xs text-muted-foreground">Cost per Message</div>
                  <div className="font-medium">{formatCost(sessionCost.totalCost / Math.max(1, messages.length))}</div>
                  <div className="text-xs text-muted-foreground">{messages.length} messages</div>
                </div>
              </div>

              {/* Token summary row */}
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-2 border-t border-muted">
                <div className="flex items-center gap-1">
                  <Coins className="h-4 w-4" />
                  <span>Total: {formatTokens(sessionTotals.input + sessionTotals.output + sessionTotals.cacheRead)} tokens</span>
                </div>
                <div className="flex items-center gap-1">
                  <span>Cache hit rate: {Math.round((sessionTotals.cacheRead / (sessionTotals.input + sessionTotals.output + sessionTotals.cacheRead)) * 100)}%</span>
                </div>
                <div className="ml-auto">
                  Pricing: $3/1M input, $15/1M output, $0.30/1M cache read
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
