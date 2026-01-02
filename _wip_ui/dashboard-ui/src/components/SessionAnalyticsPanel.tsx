import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, Clock, TrendingUp, Zap } from "lucide-react";
import { StatCard } from "./StatCard";
import { StatusBadge } from "./StatusBadge";
import type { SessionAnalytics } from "./types";

// Session Analytics Panel
export function SessionAnalyticsPanel({
  analytics,
}: {
  analytics: SessionAnalytics | null;
}) {
  if (!analytics) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Activity className="h-8 w-8 mr-2 opacity-50 animate-pulse" />
        <span>Loading session analytics...</span>
      </div>
    );
  }

  const maxActivity = Math.max(...analytics.session_activity_by_hour, 1);

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          label="Total Sessions"
          value={analytics.total_sessions}
          icon={Zap}
        />
        <StatCard
          label="Tool Calls"
          value={analytics.total_tool_calls.toLocaleString()}
          icon={Activity}
        />
        <StatCard
          label="Avg Duration"
          value={`${analytics.avg_duration_minutes.toFixed(0)}m`}
          icon={Clock}
        />
        <StatCard
          label="Today"
          value={analytics.sessions_today}
          icon={CheckCircle2}
          trend="up"
        />
        <StatCard
          label="This Week"
          value={analytics.sessions_this_week}
          icon={TrendingUp}
        />
      </div>

      {/* Activity chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity by Hour</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-24">
            {analytics.session_activity_by_hour.map((count, hour) => (
              <div
                key={hour}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <div
                  className="w-full bg-gradient-to-t from-primary to-purple-500 rounded-t transition-all duration-300"
                  style={{
                    height: `${(count / maxActivity) * 100}%`,
                    minHeight: count > 0 ? "4px" : "2px",
                  }}
                  title={`${hour}:00 - ${count} sessions`}
                />
                <span className="text-[10px] text-muted-foreground">
                  {hour}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tool usage */}
      {analytics.tool_usage_by_type &&
        Object.keys(analytics.tool_usage_by_type).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Tools</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {Object.entries(analytics.tool_usage_by_type)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 9)
                  .map(([tool, count]) => (
                    <div
                      key={tool}
                      className="flex justify-between items-center p-2 bg-muted rounded"
                    >
                      <span className="font-mono text-xs text-muted-foreground truncate">
                        {tool}
                      </span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

      {/* Recent sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {analytics.recent_sessions.slice(0, 5).map((session, i) => (
              <Card key={i} className="border-l-4 border-l-primary">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold">
                      Session {session.session_id}
                    </span>
                    <StatusBadge status={session.status} />
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(session.started_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground mb-2">
                    <span>{session.tool_calls} tool calls</span>
                    {session.duration_minutes && (
                      <span>{session.duration_minutes.toFixed(0)} min</span>
                    )}
                  </div>
                  {session.achievements.length > 0 && (
                    <div className="space-y-1">
                      {session.achievements.slice(0, 2).map((a, j) => (
                        <p
                          key={j}
                          className="text-sm pl-2 border-l-2 border-emerald-500"
                        >
                          {a}
                        </p>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SessionAnalyticsPanel;
