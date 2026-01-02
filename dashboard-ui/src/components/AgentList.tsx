import { Bot } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import type { Agent } from "./types";

// Agents Panel
export function AgentList({ agents }: { agents: Agent[] }) {
  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <Bot className="h-8 w-8 mr-2 opacity-50" />
        <span>No active agents</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {agents.map((agent) => (
        <Card key={agent.id} className="border-l-4 border-l-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold capitalize">{agent.role}</span>
              <StatusBadge status={agent.status} />
            </div>
            <p className="font-mono text-xs text-muted-foreground mb-1">
              {agent.id?.slice(0, 24)}...
            </p>
            {agent.task && (
              <p className="text-sm text-muted-foreground">{agent.task}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Last seen: {new Date(agent.last_heartbeat).toLocaleTimeString()}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default AgentList;
