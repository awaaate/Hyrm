import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Activity, TrendingUp } from "lucide-react";
import type { QualityStats } from "./types";
import { QualitySparkline } from "./charts";

// Quality Panel
export function QualityPanel({
  stats,
  lessons,
  qualityHistory = [],
}: {
  stats: QualityStats;
  lessons: Array<{ task: string; lesson: string }>;
  qualityHistory?: number[];
}) {
  // Generate sparkline data from quality history or mock from stats
  const sparklineData = qualityHistory.length > 0
    ? qualityHistory.map((value) => ({ value }))
    : [
        { value: parseFloat(stats.older_avg) },
        { value: (parseFloat(stats.older_avg) + parseFloat(stats.recent_avg)) / 2 },
        { value: parseFloat(stats.recent_avg) },
        { value: parseFloat(stats.avg_score) },
      ];
  const trendInfo = {
    improving: {
      icon: TrendingUp,
      color: "text-emerald-400",
      label: "Improving",
    },
    stable: { icon: Activity, color: "text-slate-400", label: "Stable" },
    declining: {
      icon: TrendingUp,
      color: "text-red-400 rotate-180",
      label: "Declining",
    },
  };

  const trend = trendInfo[stats.trend];
  const TrendIcon = trend.icon;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-primary">{stats.avg_score}</p>
            <p className="text-sm text-muted-foreground">Avg Score</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{stats.total}</p>
            <p className="text-sm text-muted-foreground">Assessed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center flex flex-col items-center">
            <div className="flex items-center gap-2 mb-1">
              <TrendIcon className={cn("h-6 w-6", trend.color)} />
              <span className={cn("text-xl font-bold", trend.color)}>
                {trend.label}
              </span>
            </div>
            <QualitySparkline data={sparklineData} width={80} height={24} />
            <p className="text-sm text-muted-foreground mt-1">Trend</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm mb-1">Recent Avg</p>
            <p className="text-2xl font-bold text-emerald-400">
              {stats.recent_avg}
            </p>
            <Progress
              value={parseFloat(stats.recent_avg) * 10}
              className="h-2 mt-2"
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-muted-foreground text-sm mb-1">Older Avg</p>
            <p className="text-2xl font-bold text-slate-400">
              {stats.older_avg}
            </p>
            <Progress
              value={parseFloat(stats.older_avg) * 10}
              className="h-2 mt-2"
            />
          </CardContent>
        </Card>
      </div>

      {lessons.length > 0 && (
        <div>
          <h4 className="font-semibold mb-3">Recent Lessons</h4>
          <div className="space-y-2">
            {lessons.slice(0, 3).map((l, i) => (
              <Card key={i}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground mb-1">{l.task}</p>
                  <p className="text-sm">{l.lesson}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default QualityPanel;
