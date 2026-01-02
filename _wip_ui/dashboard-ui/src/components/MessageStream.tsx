import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ScrollText } from "lucide-react";
import type { LogEntry } from "./types";

// Logs Panel (Message Stream)
export function MessageStream({ logs }: { logs: LogEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <ScrollText className="h-8 w-8 mr-2 opacity-50" />
        <span>No log entries</span>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-96 overflow-y-auto font-mono text-sm">
      {logs.map((log, i) => (
        <div key={i} className="flex gap-3 py-1 border-b border-border/50">
          <span className="text-muted-foreground w-20 shrink-0">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <span
            className={cn(
              "w-12 shrink-0 font-semibold",
              log.level === "INFO" && "text-blue-400",
              log.level === "WARN" && "text-amber-400",
              log.level === "ERROR" && "text-red-400"
            )}
          >
            {log.level}
          </span>
          <span className="text-muted-foreground flex-1">{log.message}</span>
        </div>
      ))}
    </div>
  );
}

export default MessageStream;
