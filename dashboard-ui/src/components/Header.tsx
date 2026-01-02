import { cn } from "@/lib/utils";
import { Bell, BellOff, Wifi, WifiOff } from "lucide-react";
import type { ConnectionStatus } from "./types";

// Connection Status Indicator component
function ConnectionStatusIndicator({
  status,
  reconnectAttempt,
}: {
  status: ConnectionStatus;
  reconnectAttempt: number;
}) {
  const statusConfig = {
    connected: {
      icon: Wifi,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500",
      label: "Connected",
      pulseClass: "animate-pulse",
    },
    disconnected: {
      icon: WifiOff,
      color: "text-red-400",
      bgColor: "bg-red-500",
      label: "Disconnected",
      pulseClass: "",
    },
    reconnecting: {
      icon: Wifi,
      color: "text-amber-400",
      bgColor: "bg-amber-500",
      label: `Reconnecting${
        reconnectAttempt > 0 ? ` (${reconnectAttempt})` : "..."
      }`,
      pulseClass: "animate-bounce",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "w-2 h-2 rounded-full transition-colors duration-300",
          config.bgColor,
          config.pulseClass
        )}
      />
      <Icon className={cn("h-4 w-4", config.color)} />
      <span className={cn("text-sm", config.color)}>{config.label}</span>
    </div>
  );
}

interface HeaderProps {
  connectionStatus: ConnectionStatus;
  reconnectAttempt: number;
  notificationsEnabled: boolean;
  onRequestNotifications: () => void;
}

export function Header({
  connectionStatus,
  reconnectAttempt,
  notificationsEnabled,
  onRequestNotifications,
}: HeaderProps) {
  return (
    <header className="border-b bg-card/50 backdrop-blur sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
          Multi-Agent Memory System
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={onRequestNotifications}
            className={cn(
              "flex items-center gap-1 text-sm px-2 py-1 rounded transition-colors",
              notificationsEnabled
                ? "text-emerald-400 hover:bg-emerald-500/10"
                : "text-muted-foreground hover:bg-muted"
            )}
            title={
              notificationsEnabled
                ? "Notifications enabled"
                : "Click to enable notifications"
            }
          >
            {notificationsEnabled ? (
              <Bell className="h-4 w-4" />
            ) : (
              <BellOff className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {notificationsEnabled ? "Alerts On" : "Alerts Off"}
            </span>
          </button>
          <ConnectionStatusIndicator
            status={connectionStatus}
            reconnectAttempt={reconnectAttempt}
          />
        </div>
      </div>
    </header>
  );
}

export default Header;
