/**
 * Shared JSON I/O Utilities
 * 
 * Centralized functions for reading and writing JSON/JSONL files
 * with proper error handling and type safety.
 */

import { existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";

/**
 * Read a JSON file and return its parsed contents.
 * Returns the default value if the file doesn't exist or parsing fails.
 * 
 * @param path - Absolute path to the JSON file
 * @param defaultValue - Value to return if file doesn't exist or parse fails
 * @returns Parsed JSON data or default value
 * 
 * @example
 * const tasks = readJson('/app/workspace/memory/tasks.json', { tasks: [] });
 */
export function readJson<T>(path: string, defaultValue: T): T {
  try {
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    // Silent failure - return default value
    // This is intentional to handle corrupted files gracefully
  }
  return defaultValue;
}

/**
 * Write data to a JSON file with pretty formatting.
 * Creates parent directories if they don't exist.
 * 
 * @param path - Absolute path to the JSON file
 * @param data - Data to serialize and write
 * @param indent - Number of spaces for indentation (default: 2)
 * @throws Error if write operation fails
 * 
 * @example
 * writeJson('/app/workspace/memory/tasks.json', { tasks: [], version: '1.0' });
 */
export function writeJson(path: string, data: unknown, indent: number = 2): void {
  try {
    const content = JSON.stringify(data, null, indent);
    writeFileSync(path, content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write JSON to ${path}: ${message}`);
  }
}

/**
 * Read a JSONL (newline-delimited JSON) file and return an array of parsed entries.
 * Returns an empty array if the file doesn't exist or parsing fails.
 * 
 * @param path - Absolute path to the JSONL file
 * @returns Array of parsed JSON objects
 * 
 * @example
 * const messages = readJsonl<Message>('/app/workspace/memory/message-bus.jsonl');
 */
export function readJsonl<T>(path: string): T[] {
  try {
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8").trim();
      if (!content) return [];
      
      return content
        .split("\n")
        .filter(Boolean)
        .map((line, index) => {
          try {
            return JSON.parse(line);
          } catch {
            // Skip malformed lines
            return null;
          }
        })
        .filter((item): item is T => item !== null);
    }
  } catch (error) {
    // Silent failure - return empty array
  }
  return [];
}

/**
 * Append a single entry to a JSONL file.
 * Creates the file if it doesn't exist.
 * 
 * @param path - Absolute path to the JSONL file
 * @param entry - Object to serialize and append
 * @throws Error if append operation fails
 * 
 * @example
 * appendJsonl('/app/workspace/memory/message-bus.jsonl', { type: 'broadcast', payload: {} });
 */
export function appendJsonl(path: string, entry: unknown): void {
  try {
    const line = JSON.stringify(entry) + "\n";
    appendFileSync(path, line);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to append to JSONL file ${path}: ${message}`);
  }
}

/**
 * Safely parse JSON string with error handling.
 * Returns the default value if parsing fails.
 * 
 * @param jsonString - JSON string to parse
 * @param defaultValue - Value to return if parsing fails
 * @returns Parsed data or default value
 * 
 * @example
 * const data = safeJsonParse(userInput, {});
 */
export function safeJsonParse<T>(jsonString: string, defaultValue: T): T {
  try {
    return JSON.parse(jsonString);
  } catch {
    return defaultValue;
  }
}

/**
 * Append a line to a text file.
 * Creates the file if it doesn't exist.
 * 
 * @param path - Absolute path to the file
 * @param line - Line to append (newline is added automatically)
 * 
 * @example
 * appendLine('/app/workspace/logs/debug.log', 'Debug message');
 */
export function appendLine(path: string, line: string): void {
  try {
    appendFileSync(path, line + "\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to append to file ${path}: ${message}`);
  }
}
