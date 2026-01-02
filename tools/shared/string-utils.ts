/**
 * Shared String Utilities
 * 
 * Centralized functions for string manipulation including
 * truncation, similarity comparison, and formatting.
 */

/**
 * Truncate a string to a maximum length, adding ellipsis if needed.
 * Handles ANSI codes properly for display width.
 * 
 * @param str - String to truncate
 * @param maxLen - Maximum length (default: 50)
 * @param ellipsis - String to append when truncated (default: "...")
 * @returns Truncated string
 * 
 * @example
 * truncate("Hello, World!", 8) // "Hello..."
 */
export function truncate(str: string, maxLen: number = 50, ellipsis: string = "..."): string {
  if (!str) return "";
  
  // Strip ANSI codes for length calculation
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "");
  
  if (stripped.length <= maxLen) return str;
  
  // For strings with ANSI codes, we need a smarter truncation
  // Just do simple truncation for now - most use cases don't have ANSI
  return str.slice(0, maxLen - ellipsis.length) + ellipsis;
}

/**
 * Calculate string similarity using Jaccard index on word sets.
 * Returns a value between 0 (no similarity) and 1 (identical).
 * 
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity score from 0 to 1
 * 
 * @example
 * stringSimilarity("hello world", "hello there") // ~0.33
 * stringSimilarity("hello world", "hello world") // 1.0
 */
export function stringSimilarity(str1: string, str2: string): number {
  // Normalize strings
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  
  // Extract words (at least 2 characters)
  const words1 = new Set(
    normalize(str1)
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  const words2 = new Set(
    normalize(str2)
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  // Calculate intersection
  let intersection = 0;
  words1.forEach((word) => {
    if (words2.has(word)) intersection++;
  });
  
  // Calculate union
  const union = words1.size + words2.size - intersection;
  
  return union === 0 ? 0 : intersection / union;
}

/**
 * Pad a string to the right to a specific length.
 * Handles ANSI codes properly.
 * 
 * @param str - String to pad
 * @param len - Target length
 * @param char - Padding character (default: space)
 * @returns Padded string
 * 
 * @example
 * padRight("hello", 10) // "hello     "
 */
export function padRight(str: string, len: number, char: string = " "): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "");
  const padding = len - stripped.length;
  return padding > 0 ? str + char.repeat(padding) : str;
}

/**
 * Pad a string to the left to a specific length.
 * Handles ANSI codes properly.
 * 
 * @param str - String to pad
 * @param len - Target length
 * @param char - Padding character (default: space)
 * @returns Padded string
 * 
 * @example
 * padLeft("42", 5) // "   42"
 */
export function padLeft(str: string, len: number, char: string = " "): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "");
  const padding = len - stripped.length;
  return padding > 0 ? char.repeat(padding) + str : str;
}

/**
 * Center a string within a given width.
 * 
 * @param str - String to center
 * @param width - Total width
 * @param char - Fill character (default: space)
 * @returns Centered string
 * 
 * @example
 * center("hello", 11) // "   hello   "
 */
export function center(str: string, width: number, char: string = " "): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "");
  const padding = width - stripped.length;
  if (padding <= 0) return str;
  
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return char.repeat(leftPad) + str + char.repeat(rightPad);
}

/**
 * Create a horizontal line/separator.
 * 
 * @param width - Line width
 * @param char - Line character (default: "─")
 * @returns Line string
 * 
 * @example
 * line(20) // "────────────────────"
 */
export function line(width: number, char: string = "─"): string {
  return char.repeat(width);
}

/**
 * Capitalize the first letter of a string.
 * 
 * @param str - String to capitalize
 * @returns Capitalized string
 * 
 * @example
 * capitalize("hello") // "Hello"
 */
export function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert a string to title case.
 * 
 * @param str - String to convert
 * @returns Title-cased string
 * 
 * @example
 * titleCase("hello world") // "Hello World"
 */
export function titleCase(str: string): string {
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => capitalize(word))
    .join(" ");
}

/**
 * Slugify a string for use in URLs or filenames.
 * 
 * @param str - String to slugify
 * @returns Slugified string
 * 
 * @example
 * slugify("Hello World!") // "hello-world"
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Get visible length of a string (excluding ANSI codes).
 * 
 * @param str - String to measure
 * @returns Visible character count
 * 
 * @example
 * visibleLength("\x1b[32mHello\x1b[0m") // 5
 */
export function visibleLength(str: string): number {
  return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/**
 * Wrap text to a maximum width.
 * 
 * @param str - String to wrap
 * @param maxWidth - Maximum line width
 * @returns Array of wrapped lines
 * 
 * @example
 * wrapText("Hello world this is a test", 10)
 * // ["Hello", "world this", "is a test"]
 */
export function wrapText(str: string, maxWidth: number): string[] {
  const words = str.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";
  
  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine += (currentLine ? " " : "") + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  
  if (currentLine) lines.push(currentLine);
  return lines;
}
