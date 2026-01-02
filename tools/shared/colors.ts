/**
 * Shared ANSI Color Constants
 * 
 * Centralized ANSI escape codes for consistent terminal styling
 * across all CLI tools.
 */

/**
 * ANSI escape code prefix
 */
const ESC = "\x1b";

/**
 * Primary color object with common ANSI codes.
 * Use for basic coloring needs.
 * 
 * @example
 * console.log(`${c.green}Success!${c.reset}`);
 */
export const c = {
  // Reset
  reset: `${ESC}[0m`,
  
  // Styles
  bold: `${ESC}[1m`,   // Alias for bright (most commonly used)
  bright: `${ESC}[1m`,
  dim: `${ESC}[2m`,
  italic: `${ESC}[3m`,
  underline: `${ESC}[4m`,
  blink: `${ESC}[5m`,
  inverse: `${ESC}[7m`,
  
  // Foreground colors
  black: `${ESC}[30m`,
  red: `${ESC}[31m`,
  green: `${ESC}[32m`,
  yellow: `${ESC}[33m`,
  blue: `${ESC}[34m`,
  magenta: `${ESC}[35m`,
  cyan: `${ESC}[36m`,
  white: `${ESC}[37m`,
  
  // Bright foreground
  brightRed: `${ESC}[91m`,
  brightGreen: `${ESC}[92m`,
  brightYellow: `${ESC}[93m`,
  brightBlue: `${ESC}[94m`,
  brightMagenta: `${ESC}[95m`,
  brightCyan: `${ESC}[96m`,
  brightWhite: `${ESC}[97m`,
  
  // Background colors
  bgBlack: `${ESC}[40m`,
  bgRed: `${ESC}[41m`,
  bgGreen: `${ESC}[42m`,
  bgYellow: `${ESC}[43m`,
  bgBlue: `${ESC}[44m`,
  bgMagenta: `${ESC}[45m`,
  bgCyan: `${ESC}[46m`,
  bgWhite: `${ESC}[47m`,
} as const;

/**
 * Unicode symbols for terminal UI.
 * 
 * @example
 * console.log(`${symbols.check} Task completed`);
 */
export const symbols = {
  bullet: "●",
  circle: "○",
  check: "✓",
  cross: "✗",
  arrow: "→",
  arrowUp: "↑",
  arrowDown: "↓",
  working: "⚙",
  blocked: "⛔",
  pending: "◌",
  clock: "⏱",
  fire: "🔥",
  star: "★",
  warning: "⚠",
  info: "ℹ",
} as const;

/**
 * Status color mapping for common states.
 * 
 * @example
 * const color = statusColors[task.status] || c.white;
 */
export const statusColors: Record<string, string> = {
  // Agent/Task statuses
  active: c.green,
  idle: c.dim,
  working: c.cyan,
  blocked: c.red,
  completed: c.green,
  pending: c.yellow,
  in_progress: c.cyan,
  cancelled: c.dim,
  failed: c.red,
  error: c.red,
  
  // Health statuses
  healthy: c.green,
  warning: c.yellow,
  stale: c.yellow,
  dead: c.red,
  
  // Priority levels
  critical: c.red,
  high: c.yellow,
  medium: c.blue,
  low: c.dim,
} as const;

/**
 * Status symbol mapping for common states.
 * 
 * @example
 * const sym = statusSymbols[agent.status] || symbols.circle;
 */
export const statusSymbols: Record<string, string> = {
  active: symbols.bullet,
  idle: symbols.circle,
  working: symbols.working,
  blocked: symbols.blocked,
  completed: symbols.check,
  pending: symbols.pending,
  in_progress: symbols.working,
  cancelled: symbols.cross,
  failed: symbols.cross,
  error: symbols.warning,
  healthy: symbols.check,
  warning: symbols.warning,
  stale: symbols.clock,
  dead: symbols.cross,
} as const;

/**
 * Strip ANSI escape codes from a string.
 * Useful for calculating visible string length.
 * 
 * @param str - String potentially containing ANSI codes
 * @returns String with ANSI codes removed
 * 
 * @example
 * const visibleLength = stripAnsi(`${c.green}Hello${c.reset}`).length; // 5
 */
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Apply color to a string with automatic reset.
 * 
 * @param str - String to colorize
 * @param color - Color code from c object
 * @returns Colorized string with reset at end
 * 
 * @example
 * console.log(colorize("Success", c.green));
 */
export function colorize(str: string, color: string): string {
  return `${color}${str}${c.reset}`;
}
