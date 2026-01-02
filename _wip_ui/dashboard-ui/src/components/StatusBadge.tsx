import { Badge } from "@/components/ui/badge";

// Status Badge component using shadcn Badge
export function StatusBadge({ status }: { status: string }) {
  const variant = status as
    | "active"
    | "working"
    | "idle"
    | "pending"
    | "in_progress"
    | "completed"
    | "blocked"
    | "default";
  return (
    <Badge variant={variant} className="capitalize">
      {status.replace("_", " ")}
    </Badge>
  );
}

// Priority Badge component using shadcn Badge
export function PriorityBadge({ priority }: { priority: string }) {
  const variant = priority as "critical" | "high" | "medium" | "low";
  return (
    <Badge variant={variant} className="uppercase text-xs">
      {priority}
    </Badge>
  );
}

export default StatusBadge;
