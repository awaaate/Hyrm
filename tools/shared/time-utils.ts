/**
 * Shared Time Formatting Utilities
 * 
 * Centralized functions for formatting durations, timestamps,
 * and relative time strings.
 */

/**
 * Format a duration in milliseconds to a human-readable string.
 * Automatically selects the most appropriate unit.
 * 
 * @param ms - Duration in milliseconds
 * @returns Formatted string like "2h 30m", "45s", "123ms"
 * 
 * @example
 * formatDuration(3661000) // "1h 1m"
 * formatDuration(45000)   // "45s"
 * formatDuration(150)     // "150ms"
 */
export function formatDuration(ms: number): string {
  if (ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * Format a timestamp to time-only string (HH:MM:SS).
 * 
 * @param timestamp - ISO timestamp string or Date object
 * @returns Formatted time string like "12:34:56"
 * 
 * @example
 * formatTime("2026-01-02T12:34:56.789Z") // "12:34:56"
 */
export function formatTime(timestamp: string | Date): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Format a timestamp to a relative time string (e.g., "5 minutes ago").
 * 
 * @param timestamp - ISO timestamp string or Date object
 * @returns Relative time string like "5m ago", "2h ago", "3d ago"
 * 
 * @example
 * formatTimeAgo("2026-01-02T12:30:00Z") // "5m ago" (if now is 12:35)
 */
export function formatTimeAgo(timestamp: string | Date): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const now = Date.now();
  const then = date.getTime();
  const diff = Math.floor((now - then) / 1000);
  
  if (diff < 0) return "future";
  if (diff < 5) return "now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Format a timestamp to a short relative time string.
 * Compact version without "ago" suffix.
 * 
 * @param timestamp - ISO timestamp string or Date object
 * @returns Short relative time string like "5m", "2h", "3d"
 * 
 * @example
 * formatTimeShort("2026-01-02T12:30:00Z") // "5m" (if now is 12:35)
 */
export function formatTimeShort(timestamp: string | Date): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const now = Date.now();
  const then = date.getTime();
  const diff = Math.floor((now - then) / 1000);
  
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/**
 * Format a Date to an ISO date string (YYYY-MM-DD).
 * 
 * @param date - Date object (defaults to now)
 * @returns Formatted date string like "2026-01-02"
 * 
 * @example
 * formatDate(new Date()) // "2026-01-02"
 */
export function formatDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Format a Date to a full datetime string.
 * 
 * @param date - Date object (defaults to now)
 * @returns Formatted datetime string like "2026-01-02 12:34:56"
 * 
 * @example
 * formatDateTime(new Date()) // "2026-01-02 12:34:56"
 */
export function formatDateTime(date: Date = new Date()): string {
  return `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * Get a timestamp for use in filenames (no colons).
 * 
 * @param date - Date object (defaults to now)
 * @returns Formatted timestamp like "2026-01-02_123456"
 * 
 * @example
 * getFilenameTimestamp() // "2026-01-02_123456"
 */
export function getFilenameTimestamp(date: Date = new Date()): string {
  const dateStr = formatDate(date);
  const timeStr = formatTime(date).replace(/:/g, "");
  return `${dateStr}_${timeStr}`;
}

/**
 * Check if a timestamp is within a time window.
 * 
 * @param timestamp - ISO timestamp string or Date
 * @param windowMs - Time window in milliseconds
 * @returns True if timestamp is within the window from now
 * 
 * @example
 * isWithinWindow(agent.last_heartbeat, 2 * 60 * 1000) // true if < 2 min ago
 */
export function isWithinWindow(timestamp: string | Date, windowMs: number): boolean {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return Date.now() - date.getTime() < windowMs;
}

/**
 * Calculate age of a timestamp in milliseconds.
 * 
 * @param timestamp - ISO timestamp string or Date
 * @returns Age in milliseconds (negative if in future)
 * 
 * @example
 * const ageMs = getAge(agent.last_heartbeat);
 */
export function getAge(timestamp: string | Date): number {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  return Date.now() - date.getTime();
}
