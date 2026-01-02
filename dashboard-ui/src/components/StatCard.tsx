import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

// Stat Card component
export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string | number;
  icon?: React.ElementType;
  trend?: "up" | "down" | "stable";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          {Icon && (
            <div
              className={cn(
                "p-2 rounded-lg",
                trend === "up" && "bg-emerald-500/20 text-emerald-400",
                trend === "down" && "bg-red-500/20 text-red-400",
                !trend && "bg-primary/20 text-primary"
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default StatCard;
