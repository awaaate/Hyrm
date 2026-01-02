import { useEffect, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Activity,
  Bot,
  CheckCircle2,
  Gauge,
  ListTodo,
  ScrollText,
  TrendingUp,
  MessageSquare,
  Plus,
} from "lucide-react";

// Import custom components
import {
  Header,
  StatusBadge,
  AgentList,
  TasksTable,
  TasksCards,
  MessageStream,
  QualityPanel,
  PerformanceTab,
  SessionAnalyticsPanel,
  OpenCodeSessionsPanel,
  UserMessagesPanel,
  MessageBusPanel,
  CreateTaskDialog,
} from "./components";

// Import types
import type {
  ConnectionStatus,
  Agent,
  Task,
  Stats,
  LogEntry,
  QualityStats,
  SessionAnalytics,
  PerformanceData,
  UserMessage,
  MessageBusMessage,
} from "./components/types";

// API base URL
const API_BASE = "http://localhost:3847";

// Exponential backoff configuration
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const BACKOFF_MULTIPLIER = 1.5;

// Notification helper
function showTaskCompletedNotification(taskTitle: string) {
  // Check if notifications are supported and permitted
  if (!("Notification" in window)) {
    console.log("Notifications not supported");
    return;
  }

  if (Notification.permission === "granted") {
    new Notification("Task Completed", {
      body: taskTitle,
      icon: "/vite.svg",
      tag: "task-completed",
    });
    // Also play a sound
    playNotificationSound();
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((permission) => {
      if (permission === "granted") {
        new Notification("Task Completed", {
          body: taskTitle,
          icon: "/vite.svg",
          tag: "task-completed",
        });
        playNotificationSound();
      }
    });
  }
}

// Play notification sound
function playNotificationSound() {
  try {
    // Create a simple beep using Web Audio API
    const audioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // Hz
    oscillator.type = "sine";
    gainNode.gain.value = 0.3;

    oscillator.start();

    // Fade out
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.3
    );
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    console.log("Could not play notification sound:", e);
  }
}

// Main App
function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [quality, setQuality] = useState<{
    stats: QualityStats;
    lessons: { task: string; lesson: string }[];
  } | null>(null);
  const [analytics, setAnalytics] = useState<SessionAnalytics | null>(null);
  const [performance, setPerformance] = useState<PerformanceData | null>(null);
  const [userMessages, setUserMessages] = useState<UserMessage[]>([]);
  const [agentMessages, setAgentMessages] = useState<MessageBusMessage[]>([]);
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Refs for reconnection logic
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        setNotificationsEnabled(true);
      } else if (Notification.permission !== "denied") {
        Notification.requestPermission().then((permission) => {
          setNotificationsEnabled(permission === "granted");
        });
      }
    }
  }, []);

  // Handle notification request
  const handleRequestNotifications = useCallback(() => {
    if (
      "Notification" in window &&
      Notification.permission !== "granted"
    ) {
      Notification.requestPermission().then((permission) => {
        setNotificationsEnabled(permission === "granted");
      });
    }
  }, []);

  // WebSocket connection with exponential backoff
  const connect = useCallback(() => {
    // Don't try to connect if already connected or connecting
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    setConnectionStatus("reconnecting");

    const ws = new WebSocket(`ws://localhost:3847/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setConnectionStatus("connected");
      setError(null);
      setReconnectAttempt(0);
      // Reset backoff delay on successful connection
      reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "stats":
            setStats(data.data);
            break;
          case "agents":
            setAgents(data.data.agents || []);
            break;
          case "tasks":
            setTasks(data.data.tasks || []);
            break;
          case "logs":
            setLogs(data.data.entries || []);
            break;
          case "quality":
            setQuality({
              stats: data.data.stats,
              lessons: data.data.lessons || [],
            });
            break;
          case "analytics":
            setAnalytics(data.data);
            break;
          case "performance":
            setPerformance(data.data);
            break;
          case "task_completed":
            // Show notification when a task is completed
            showTaskCompletedNotification(
              data.data.title || "A task was completed"
            );
            break;
          case "user_messages":
            setUserMessages(data.data.messages || []);
            break;
          case "agent_messages":
            setAgentMessages(data.data.messages || []);
            break;
          case "user_message_sent":
            setUserMessages((prev) => [data.data.message, ...prev]);
            break;
        }
      } catch (e) {
        console.error("Error parsing WebSocket message:", e);
      }
    };

    ws.onclose = (event) => {
      console.log("WebSocket disconnected", event.code, event.reason);
      wsRef.current = null;
      setConnectionStatus("disconnected");

      // Schedule reconnection with exponential backoff
      const delay = reconnectDelayRef.current;
      setReconnectAttempt((prev) => prev + 1);

      console.log(
        `Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempt + 1})`
      );

      reconnectTimeoutRef.current = setTimeout(() => {
        setConnectionStatus("reconnecting");
        // Increase delay for next attempt (with cap)
        reconnectDelayRef.current = Math.min(
          delay * BACKOFF_MULTIPLIER,
          MAX_RECONNECT_DELAY
        );
        connect();
      }, delay);
    };

    ws.onerror = (e) => {
      console.error("WebSocket error:", e);
      setError("Connection error. Is the dashboard server running?");
    };
  }, [reconnectAttempt]);

  // Initial connection and cleanup
  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [connect]);

  // Fallback to HTTP polling if WebSocket fails
  useEffect(() => {
    if (connectionStatus === "connected") return;

    const fetchData = async () => {
      try {
        const [
          statsRes,
          agentsRes,
          tasksRes,
          logsRes,
          qualityRes,
          analyticsRes,
          performanceRes,
          userMsgRes,
          agentMsgRes,
        ] = await Promise.all([
          fetch(`${API_BASE}/api/stats`),
          fetch(`${API_BASE}/api/agents`),
          fetch(`${API_BASE}/api/tasks`),
          fetch(`${API_BASE}/api/logs`),
          fetch(`${API_BASE}/api/quality`),
          fetch(`${API_BASE}/api/analytics`),
          fetch(`${API_BASE}/api/performance`),
          fetch(`${API_BASE}/api/user-messages`),
          fetch(`${API_BASE}/api/messages`),
        ]);

        if (statsRes.ok) setStats(await statsRes.json());
        if (agentsRes.ok) {
          const data = await agentsRes.json();
          setAgents(data.agents || []);
        }
        if (tasksRes.ok) {
          const data = await tasksRes.json();
          setTasks(data.tasks || []);
        }
        if (logsRes.ok) {
          const data = await logsRes.json();
          setLogs(data.entries || []);
        }
        if (qualityRes.ok) {
          const data = await qualityRes.json();
          setQuality({ stats: data.stats, lessons: data.lessons || [] });
        }
        if (analyticsRes.ok) {
          setAnalytics(await analyticsRes.json());
        }
        if (performanceRes.ok) {
          setPerformance(await performanceRes.json());
        }
        if (userMsgRes.ok) {
          const data = await userMsgRes.json();
          setUserMessages(data.messages || []);
        }
        if (agentMsgRes.ok) {
          const data = await agentMsgRes.json();
          setAgentMessages(data.messages || []);
        }
        setError(null);
      } catch (e) {
        console.error("Fetch error:", e);
        setError("Cannot connect to dashboard server");
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [connectionStatus]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header
        connectionStatus={connectionStatus}
        reconnectAttempt={reconnectAttempt}
        notificationsEnabled={notificationsEnabled}
        onRequestNotifications={handleRequestNotifications}
      />

      {/* Error Banner */}
      {error && (
        <div className="border-b border-red-500/50 bg-red-500/10 text-red-400 px-4 py-2 text-sm">
          {error}
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="quality">Quality</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="opencode">OpenCode</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    System Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-3xl font-bold">
                          {stats.session_count}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Sessions
                        </p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <StatusBadge status={stats.status} />
                        <p className="text-sm text-muted-foreground mt-2">
                          Status
                        </p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-3xl font-bold">{agents.length}</p>
                        <p className="text-sm text-muted-foreground">Agents</p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-3xl font-bold">
                          {tasks.filter((t) => t.status === "pending").length}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Pending Tasks
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Loading...</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    Recent Achievements
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats?.recent_achievements?.length ? (
                    <div className="space-y-2">
                      {stats.recent_achievements.slice(0, 5).map((a, i) => (
                        <div
                          key={i}
                          className="pl-3 border-l-2 border-emerald-500 py-1"
                        >
                          <p className="text-sm">{a}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No achievements yet</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="h-5 w-5" />
                    Active Agents ({agents.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AgentList agents={agents.slice(0, 3)} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ListTodo className="h-5 w-5" />
                    Top Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TasksCards
                    tasks={tasks
                      .filter((t) => t.status !== "completed")
                      .slice(0, 3)}
                  />
                </CardContent>
              </Card>

              {/* Performance Quick Stats */}
              {performance && (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Gauge className="h-5 w-5" />
                      Performance Snapshot
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-2xl font-bold">
                          {performance.summary.totalCalls.toLocaleString()}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Tool Calls
                        </p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p className="text-2xl font-bold">
                          {performance.summary.totalTools}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Tools Used
                        </p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p
                          className={cn(
                            "text-2xl font-bold",
                            performance.summary.avgQuality >= 7.5 &&
                              "text-emerald-400",
                            performance.summary.avgQuality < 7.5 &&
                              performance.summary.avgQuality >= 6 &&
                              "text-amber-400",
                            performance.summary.avgQuality < 6 && "text-red-400"
                          )}
                        >
                          {performance.summary.avgQuality.toFixed(1)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Avg Quality
                        </p>
                      </div>
                      <div className="p-4 bg-muted rounded-lg text-center">
                        <p
                          className={cn(
                            "text-2xl font-bold",
                            performance.summary.errorCount === 0 &&
                              "text-emerald-400",
                            performance.summary.errorCount > 0 &&
                              performance.summary.errorCount <= 3 &&
                              "text-amber-400",
                            performance.summary.errorCount > 3 && "text-red-400"
                          )}
                        >
                          {performance.summary.errorCount}
                        </p>
                        <p className="text-sm text-muted-foreground">Errors</p>
                      </div>
                    </div>
                    {performance.toolExecutions.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-muted-foreground mb-2">
                          Top 3 Tools by Usage
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {performance.toolExecutions
                            .slice(0, 3)
                            .map((tool, i) => (
                              <Badge
                                key={tool.tool}
                                variant={i === 0 ? "default" : "secondary"}
                              >
                                {tool.tool}: {tool.count}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="agents">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Active Agents ({agents.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AgentList agents={agents} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ListTodo className="h-5 w-5" />
                    Tasks ({tasks.length})
                  </span>
                  <Button onClick={() => setShowCreateTaskDialog(true)} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    New Task
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TasksTable tasks={tasks} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages">
            <div className="grid md:grid-cols-2 gap-6">
              <UserMessagesPanel
                messages={userMessages}
                onRefresh={() => {
                  fetch(`${API_BASE}/api/user-messages`)
                    .then((r) => r.json())
                    .then((d) => setUserMessages(d.messages || []));
                }}
              />
              <MessageBusPanel messages={agentMessages} />
            </div>
          </TabsContent>

          <TabsContent value="performance">
            <PerformanceTab data={performance} />
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ScrollText className="h-5 w-5" />
                  Realtime Logs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MessageStream logs={logs} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quality">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Quality Assessment
                </CardTitle>
              </CardHeader>
              <CardContent>
                {quality ? (
                  <QualityPanel
                    stats={quality.stats}
                    lessons={quality.lessons}
                  />
                ) : (
                  <p className="text-muted-foreground">
                    Loading quality data...
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics">
            <SessionAnalyticsPanel analytics={analytics} />
          </TabsContent>

          <TabsContent value="opencode">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  OpenCode Sessions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <OpenCodeSessionsPanel />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card/50 mt-auto">
        <div className="container mx-auto px-4 py-3 flex justify-between text-xs text-muted-foreground">
          <span>Multi-Agent Memory System v1.0</span>
          <span>Last update: {new Date().toLocaleTimeString()}</span>
        </div>
      </footer>

      {/* Create Task Dialog */}
      <CreateTaskDialog
        open={showCreateTaskDialog}
        onClose={() => setShowCreateTaskDialog(false)}
        onCreated={() => {
          fetch(`${API_BASE}/api/tasks`)
            .then((r) => r.json())
            .then((d) => setTasks(d.tasks || []));
        }}
      />
    </div>
  );
}

export default App;
