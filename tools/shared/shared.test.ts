/**
 * Unit Tests for Shared Utilities Module
 * 
 * Tests for: json-utils, time-utils, string-utils, paths
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";

// Import all utilities
import {
  readJson,
  writeJson,
  readJsonl,
  appendJsonl,
  safeJsonParse,
} from "./json-utils";

import {
  formatDuration,
  formatTime,
  formatTimeAgo,
  formatTimeShort,
  formatDate,
  formatDateTime,
  getFilenameTimestamp,
  isWithinWindow,
  getAge,
} from "./time-utils";

import {
  truncate,
  stringSimilarity,
  padRight,
  padLeft,
  center,
  line,
  capitalize,
  titleCase,
  slugify,
  visibleLength,
  wrapText,
} from "./string-utils";

import {
  PATHS,
  WORKSPACE_DIR,
  MEMORY_DIR,
  getMemoryPath,
  getBackupPath,
  ensureDir,
  getToolPath,
  getSessionPath,
  getArchivePath,
} from "./paths";

// ============================================
// Test Setup - Temporary Directory for File Tests
// ============================================

const TEST_DIR = "/tmp/shared-utils-test";

beforeAll(() => {
  // Create test directory
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterAll(() => {
  // Clean up test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

// ============================================
// JSON Utils Tests
// ============================================

describe("json-utils", () => {
  describe("readJson", () => {
    test("reads valid JSON file", () => {
      const testPath = join(TEST_DIR, "test-read.json");
      const testData = { name: "test", value: 42 };
      writeFileSync(testPath, JSON.stringify(testData));
      
      const result = readJson(testPath, {});
      expect(result).toEqual(testData);
    });

    test("returns default value for non-existent file", () => {
      const defaultValue = { default: true };
      const result = readJson(join(TEST_DIR, "non-existent.json"), defaultValue);
      expect(result).toEqual(defaultValue);
    });

    test("returns default value for invalid JSON", () => {
      const testPath = join(TEST_DIR, "invalid.json");
      writeFileSync(testPath, "{ invalid json }");
      
      const defaultValue = { fallback: true };
      const result = readJson(testPath, defaultValue);
      expect(result).toEqual(defaultValue);
    });

    test("reads nested JSON structure", () => {
      const testPath = join(TEST_DIR, "nested.json");
      const testData = {
        tasks: [
          { id: 1, title: "Task 1" },
          { id: 2, title: "Task 2" },
        ],
        meta: { version: "1.0" },
      };
      writeFileSync(testPath, JSON.stringify(testData));
      
      const result = readJson(testPath, { tasks: [], meta: {} });
      expect(result).toEqual(testData);
    });

    test("handles empty file", () => {
      const testPath = join(TEST_DIR, "empty-json.json");
      writeFileSync(testPath, "");
      
      const result = readJson(testPath, { default: true });
      expect(result).toEqual({ default: true });
    });
  });

  describe("writeJson", () => {
    test("writes JSON with default indentation", () => {
      const testPath = join(TEST_DIR, "write-test.json");
      const data = { hello: "world" };
      
      writeJson(testPath, data);
      
      const content = readFileSync(testPath, "utf-8");
      expect(content).toBe(JSON.stringify(data, null, 2));
    });

    test("writes JSON with custom indentation", () => {
      const testPath = join(TEST_DIR, "write-indent.json");
      const data = { hello: "world" };
      
      writeJson(testPath, data, 4);
      
      const content = readFileSync(testPath, "utf-8");
      expect(content).toBe(JSON.stringify(data, null, 4));
    });

    test("writes arrays correctly", () => {
      const testPath = join(TEST_DIR, "write-array.json");
      const data = [1, 2, 3, "four"];
      
      writeJson(testPath, data);
      
      const content = readFileSync(testPath, "utf-8");
      expect(JSON.parse(content)).toEqual(data);
    });

    test("overwrites existing file", () => {
      const testPath = join(TEST_DIR, "overwrite.json");
      writeFileSync(testPath, JSON.stringify({ old: true }));
      
      writeJson(testPath, { new: true });
      
      const result = JSON.parse(readFileSync(testPath, "utf-8"));
      expect(result).toEqual({ new: true });
    });
  });

  describe("readJsonl", () => {
    test("reads valid JSONL file", () => {
      const testPath = join(TEST_DIR, "test.jsonl");
      const lines = [
        { id: 1, msg: "first" },
        { id: 2, msg: "second" },
        { id: 3, msg: "third" },
      ];
      writeFileSync(testPath, lines.map(l => JSON.stringify(l)).join("\n"));
      
      const result = readJsonl(testPath);
      expect(result).toEqual(lines);
    });

    test("returns empty array for non-existent file", () => {
      const result = readJsonl(join(TEST_DIR, "non-existent.jsonl"));
      expect(result).toEqual([]);
    });

    test("skips malformed lines", () => {
      const testPath = join(TEST_DIR, "malformed.jsonl");
      writeFileSync(testPath, '{"valid": true}\n{invalid json}\n{"also": "valid"}');
      
      const result = readJsonl(testPath);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ valid: true });
      expect(result[1]).toEqual({ also: "valid" });
    });

    test("handles empty file", () => {
      const testPath = join(TEST_DIR, "empty.jsonl");
      writeFileSync(testPath, "");
      
      const result = readJsonl(testPath);
      expect(result).toEqual([]);
    });

    test("handles file with only whitespace", () => {
      const testPath = join(TEST_DIR, "whitespace.jsonl");
      writeFileSync(testPath, "   \n  \n  ");
      
      const result = readJsonl(testPath);
      expect(result).toEqual([]);
    });

    test("handles trailing newlines", () => {
      const testPath = join(TEST_DIR, "trailing.jsonl");
      writeFileSync(testPath, '{"a": 1}\n{"b": 2}\n\n');
      
      const result = readJsonl(testPath);
      expect(result).toHaveLength(2);
    });
  });

  describe("appendJsonl", () => {
    test("appends to existing file", () => {
      const testPath = join(TEST_DIR, "append.jsonl");
      writeFileSync(testPath, '{"first": true}\n');
      
      appendJsonl(testPath, { second: true });
      
      const content = readFileSync(testPath, "utf-8");
      expect(content).toBe('{"first": true}\n{"second":true}\n');
    });

    test("creates file if it does not exist", () => {
      const testPath = join(TEST_DIR, "new-append.jsonl");
      if (existsSync(testPath)) rmSync(testPath);
      
      appendJsonl(testPath, { created: true });
      
      expect(existsSync(testPath)).toBe(true);
      const content = readFileSync(testPath, "utf-8");
      expect(content).toBe('{"created":true}\n');
    });

    test("handles complex objects", () => {
      const testPath = join(TEST_DIR, "complex-append.jsonl");
      if (existsSync(testPath)) rmSync(testPath);
      
      appendJsonl(testPath, { arr: [1, 2, 3], nested: { a: 1 } });
      
      const result = readJsonl(testPath);
      expect(result[0]).toEqual({ arr: [1, 2, 3], nested: { a: 1 } });
    });
  });

  describe("safeJsonParse", () => {
    test("parses valid JSON string", () => {
      const result = safeJsonParse('{"key": "value"}', {});
      expect(result).toEqual({ key: "value" });
    });

    test("returns default for invalid JSON", () => {
      const result = safeJsonParse("not json", { default: true });
      expect(result).toEqual({ default: true });
    });

    test("returns default for empty string", () => {
      const result = safeJsonParse("", { empty: true });
      expect(result).toEqual({ empty: true });
    });

    test("parses arrays", () => {
      const result = safeJsonParse("[1, 2, 3]", []);
      expect(result).toEqual([1, 2, 3]);
    });

    test("parses primitive values", () => {
      expect(safeJsonParse("42", 0)).toBe(42);
      expect(safeJsonParse('"hello"', "")).toBe("hello");
      expect(safeJsonParse("true", false)).toBe(true);
      expect(safeJsonParse("null", "default")).toBe(null);
    });
  });
});

// ============================================
// Time Utils Tests
// ============================================

describe("time-utils", () => {
  describe("formatDuration", () => {
    test("formats milliseconds correctly", () => {
      expect(formatDuration(0)).toBe("0ms");
      expect(formatDuration(1)).toBe("1ms");
      expect(formatDuration(500)).toBe("500ms");
      expect(formatDuration(999)).toBe("999ms");
    });

    test("formats seconds correctly", () => {
      expect(formatDuration(1000)).toBe("1.0s");
      expect(formatDuration(1500)).toBe("1.5s");
      expect(formatDuration(45000)).toBe("45.0s");
      expect(formatDuration(59999)).toBe("60.0s");
    });

    test("formats minutes correctly", () => {
      expect(formatDuration(60000)).toBe("1m");
      expect(formatDuration(90000)).toBe("1m 30s");
      expect(formatDuration(120000)).toBe("2m");
      expect(formatDuration(3599000)).toBe("59m 59s");
    });

    test("formats hours correctly", () => {
      expect(formatDuration(3600000)).toBe("1h");
      expect(formatDuration(3661000)).toBe("1h 1m");
      expect(formatDuration(7200000)).toBe("2h");
      expect(formatDuration(5400000)).toBe("1h 30m");
    });

    test("handles negative values", () => {
      expect(formatDuration(-1)).toBe("0ms");
      expect(formatDuration(-1000)).toBe("0ms");
    });

    test("handles large values", () => {
      expect(formatDuration(86400000)).toBe("24h");
      expect(formatDuration(90000000)).toBe("25h");
    });
  });

  describe("formatTime", () => {
    test("formats Date object", () => {
      const date = new Date("2026-01-02T12:34:56.789Z");
      const result = formatTime(date);
      // Note: result depends on timezone, just check format
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    test("formats ISO string", () => {
      const result = formatTime("2026-01-02T12:34:56.789Z");
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
  });

  describe("formatTimeAgo", () => {
    test("formats 'now' for recent timestamps", () => {
      const now = new Date();
      expect(formatTimeAgo(now)).toBe("now");
    });

    test("formats seconds ago", () => {
      const tenSecondsAgo = new Date(Date.now() - 10000);
      expect(formatTimeAgo(tenSecondsAgo)).toBe("10s ago");
    });

    test("formats minutes ago", () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      expect(formatTimeAgo(fiveMinutesAgo)).toBe("5m ago");
    });

    test("formats hours ago", () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(formatTimeAgo(twoHoursAgo)).toBe("2h ago");
    });

    test("formats days ago", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(formatTimeAgo(threeDaysAgo)).toBe("3d ago");
    });

    test("handles future timestamps", () => {
      const future = new Date(Date.now() + 60000);
      expect(formatTimeAgo(future)).toBe("future");
    });
  });

  describe("formatTimeShort", () => {
    test("formats seconds", () => {
      const thirtySecondsAgo = new Date(Date.now() - 30000);
      expect(formatTimeShort(thirtySecondsAgo)).toBe("30s");
    });

    test("formats minutes", () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      expect(formatTimeShort(tenMinutesAgo)).toBe("10m");
    });

    test("formats hours", () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      expect(formatTimeShort(threeHoursAgo)).toBe("3h");
    });

    test("formats days", () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      expect(formatTimeShort(twoDaysAgo)).toBe("2d");
    });
  });

  describe("formatDate", () => {
    test("formats current date", () => {
      const result = formatDate();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test("formats specific date", () => {
      const date = new Date("2026-01-02T12:00:00Z");
      const result = formatDate(date);
      expect(result).toBe("2026-01-02");
    });
  });

  describe("formatDateTime", () => {
    test("formats with date and time", () => {
      const result = formatDateTime();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });
  });

  describe("getFilenameTimestamp", () => {
    test("returns filename-safe timestamp", () => {
      const result = getFilenameTimestamp();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}_\d{6}$/);
      expect(result).not.toContain(":");
    });
  });

  describe("isWithinWindow", () => {
    test("returns true for recent timestamp", () => {
      const recent = new Date(Date.now() - 30000); // 30 seconds ago
      expect(isWithinWindow(recent, 60000)).toBe(true); // 1 minute window
    });

    test("returns false for old timestamp", () => {
      const old = new Date(Date.now() - 120000); // 2 minutes ago
      expect(isWithinWindow(old, 60000)).toBe(false); // 1 minute window
    });

    test("accepts ISO string", () => {
      const recent = new Date(Date.now() - 1000).toISOString();
      expect(isWithinWindow(recent, 60000)).toBe(true);
    });
  });

  describe("getAge", () => {
    test("returns positive age for past timestamps", () => {
      const past = new Date(Date.now() - 5000);
      const age = getAge(past);
      expect(age).toBeGreaterThanOrEqual(5000);
      expect(age).toBeLessThan(6000);
    });

    test("returns negative age for future timestamps", () => {
      const future = new Date(Date.now() + 5000);
      const age = getAge(future);
      expect(age).toBeLessThan(0);
    });
  });
});

// ============================================
// String Utils Tests
// ============================================

describe("string-utils", () => {
  describe("truncate", () => {
    test("does not truncate short strings", () => {
      expect(truncate("hello", 10)).toBe("hello");
      expect(truncate("hello", 5)).toBe("hello");
    });

    test("truncates long strings with ellipsis", () => {
      expect(truncate("Hello, World!", 8)).toBe("Hello...");
      expect(truncate("Hello, World!", 10)).toBe("Hello, ...");
    });

    test("handles empty string", () => {
      expect(truncate("", 10)).toBe("");
    });

    test("handles null/undefined-like input", () => {
      expect(truncate("", 5)).toBe("");
    });

    test("uses custom ellipsis", () => {
      expect(truncate("Hello, World!", 8, ">>")).toBe("Hello,>>");
    });

    test("handles default maxLen", () => {
      const longString = "a".repeat(100);
      expect(truncate(longString).length).toBe(50);
    });

    test("handles ANSI codes for length calculation", () => {
      const ansiString = "\x1b[32mHello\x1b[0m";
      // Visible length is 5, so should not truncate at maxLen=10
      expect(truncate(ansiString, 10)).toBe(ansiString);
    });
  });

  describe("stringSimilarity", () => {
    test("returns 1 for identical strings", () => {
      expect(stringSimilarity("hello world", "hello world")).toBe(1);
    });

    test("returns 0 for completely different strings", () => {
      expect(stringSimilarity("hello world", "xyz abc")).toBe(0);
    });

    test("returns partial similarity", () => {
      const sim = stringSimilarity("hello world", "hello there");
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });

    test("is case insensitive", () => {
      expect(stringSimilarity("HELLO WORLD", "hello world")).toBe(1);
    });

    test("ignores punctuation", () => {
      expect(stringSimilarity("hello, world!", "hello world")).toBe(1);
    });

    test("returns 0 for empty strings", () => {
      expect(stringSimilarity("", "hello")).toBe(0);
      expect(stringSimilarity("hello", "")).toBe(0);
      expect(stringSimilarity("", "")).toBe(0);
    });

    test("ignores short words (<=2 chars)", () => {
      // "it is a" has no words > 2 chars
      expect(stringSimilarity("it is a", "it is a")).toBe(0);
    });
  });

  describe("padRight", () => {
    test("pads string to specified length", () => {
      expect(padRight("hello", 10)).toBe("hello     ");
    });

    test("does not pad if already long enough", () => {
      expect(padRight("hello", 3)).toBe("hello");
    });

    test("uses custom padding character", () => {
      expect(padRight("hello", 10, "-")).toBe("hello-----");
    });

    test("handles ANSI codes", () => {
      const ansi = "\x1b[32mHi\x1b[0m";
      const padded = padRight(ansi, 5);
      // Visible length is 2, so should add 3 spaces
      expect(padded).toBe("\x1b[32mHi\x1b[0m   ");
    });
  });

  describe("padLeft", () => {
    test("pads string to specified length", () => {
      expect(padLeft("42", 5)).toBe("   42");
    });

    test("does not pad if already long enough", () => {
      expect(padLeft("hello", 3)).toBe("hello");
    });

    test("uses custom padding character", () => {
      expect(padLeft("42", 5, "0")).toBe("00042");
    });

    test("handles ANSI codes", () => {
      const ansi = "\x1b[31m5\x1b[0m";
      const padded = padLeft(ansi, 3);
      // Visible length is 1, so should add 2 spaces
      expect(padded).toBe("  \x1b[31m5\x1b[0m");
    });
  });

  describe("center", () => {
    test("centers string within width", () => {
      expect(center("hi", 6)).toBe("  hi  ");
    });

    test("handles odd padding", () => {
      expect(center("hi", 7)).toBe("  hi   ");
    });

    test("does not pad if already wide enough", () => {
      expect(center("hello", 3)).toBe("hello");
    });

    test("uses custom fill character", () => {
      expect(center("hi", 6, "-")).toBe("--hi--");
    });
  });

  describe("line", () => {
    test("creates horizontal line", () => {
      expect(line(5)).toBe("─────");
    });

    test("uses custom character", () => {
      expect(line(5, "=")).toBe("=====");
    });

    test("handles zero width", () => {
      expect(line(0)).toBe("");
    });
  });

  describe("capitalize", () => {
    test("capitalizes first letter", () => {
      expect(capitalize("hello")).toBe("Hello");
    });

    test("handles empty string", () => {
      expect(capitalize("")).toBe("");
    });

    test("handles single character", () => {
      expect(capitalize("a")).toBe("A");
    });

    test("preserves rest of string", () => {
      expect(capitalize("hELLO")).toBe("HELLO");
    });
  });

  describe("titleCase", () => {
    test("converts to title case", () => {
      expect(titleCase("hello world")).toBe("Hello World");
    });

    test("handles mixed case", () => {
      expect(titleCase("HELLO WORLD")).toBe("Hello World");
    });

    test("handles single word", () => {
      expect(titleCase("hello")).toBe("Hello");
    });
  });

  describe("slugify", () => {
    test("converts to slug", () => {
      expect(slugify("Hello World!")).toBe("hello-world");
    });

    test("removes special characters", () => {
      expect(slugify("Hello, World! How are you?")).toBe("hello-world-how-are-you");
    });

    test("handles multiple spaces", () => {
      expect(slugify("hello   world")).toBe("hello-world");
    });

    test("removes leading/trailing hyphens", () => {
      expect(slugify("-hello world-")).toBe("hello-world");
    });

    test("handles already slugified string", () => {
      expect(slugify("hello-world")).toBe("hello-world");
    });
  });

  describe("visibleLength", () => {
    test("returns length of plain string", () => {
      expect(visibleLength("hello")).toBe(5);
    });

    test("excludes ANSI codes", () => {
      expect(visibleLength("\x1b[32mHello\x1b[0m")).toBe(5);
    });

    test("handles multiple ANSI codes", () => {
      expect(visibleLength("\x1b[1m\x1b[32mHi\x1b[0m")).toBe(2);
    });

    test("handles empty string", () => {
      expect(visibleLength("")).toBe(0);
    });
  });

  describe("wrapText", () => {
    test("wraps text to specified width", () => {
      const result = wrapText("hello world this is a test", 12);
      expect(result).toEqual(["hello world", "this is a", "test"]);
    });

    test("handles single word exceeding width", () => {
      const result = wrapText("superlongword", 5);
      expect(result).toEqual(["superlongword"]);
    });

    test("handles empty string", () => {
      const result = wrapText("", 10);
      expect(result).toEqual([]);
    });

    test("handles single line that fits", () => {
      const result = wrapText("hello", 10);
      expect(result).toEqual(["hello"]);
    });
  });
});

// ============================================
// Paths Utils Tests
// ============================================

describe("paths", () => {
  describe("PATHS constant", () => {
    test("has required paths defined", () => {
      expect(PATHS.state).toContain("state.json");
      expect(PATHS.tasks).toContain("tasks.json");
      expect(PATHS.agentRegistry).toContain("agent-registry.json");
      expect(PATHS.messageBus).toContain("message-bus.jsonl");
      expect(PATHS.working).toContain("working.md");
    });

    test("all paths are strings", () => {
      for (const [key, value] of Object.entries(PATHS)) {
        expect(typeof value).toBe("string");
      }
    });
  });

  describe("getMemoryPath", () => {
    test("returns full path in memory directory", () => {
      const result = getMemoryPath("test.json");
      expect(result).toContain("memory");
      expect(result).toEndWith("test.json");
    });
  });

  describe("getBackupPath", () => {
    test("adds backup suffix before extension", () => {
      expect(getBackupPath("/path/to/file.json")).toBe("/path/to/file.backup.json");
    });

    test("handles multiple dots in filename", () => {
      expect(getBackupPath("/path/to/file.test.json")).toBe("/path/to/file.test.backup.json");
    });

    test("handles path without extension", () => {
      // When no extension, the regex still matches and adds .backup prefix
      expect(getBackupPath("/path/to/file")).toBe(".backup/path/to/file");
    });
  });

  describe("ensureDir", () => {
    test("creates directory if it does not exist", () => {
      const newDir = join(TEST_DIR, "ensure-test-" + Date.now());
      expect(existsSync(newDir)).toBe(false);
      
      const result = ensureDir(newDir);
      
      expect(result).toBe(true);
      expect(existsSync(newDir)).toBe(true);
    });

    test("returns true for existing directory", () => {
      expect(ensureDir(TEST_DIR)).toBe(true);
    });

    test("creates nested directories", () => {
      const nestedDir = join(TEST_DIR, "nested", "deep", "dir-" + Date.now());
      
      const result = ensureDir(nestedDir);
      
      expect(result).toBe(true);
      expect(existsSync(nestedDir)).toBe(true);
    });
  });

  describe("getToolPath", () => {
    test("returns full path to tool file", () => {
      const result = getToolPath("task-manager.ts");
      expect(result).toContain("tools");
      expect(result).toEndWith("task-manager.ts");
    });
  });

  describe("getSessionPath", () => {
    test("returns path in sessions directory", () => {
      const result = getSessionPath("ses_test123", "state.json");
      expect(result).toContain("sessions");
      expect(result).toContain("ses_test123");
      expect(result).toEndWith("state.json");
    });
  });

  describe("getArchivePath", () => {
    test("returns archive path with date", () => {
      const result = getArchivePath("message-bus", "jsonl");
      expect(result).toContain("message-archives");
      expect(result).toMatch(/message-bus-\d{4}-\d{2}-\d{2}\.jsonl$/);
    });

    test("uses default json extension", () => {
      const result = getArchivePath("backup");
      expect(result).toMatch(/backup-\d{4}-\d{2}-\d{2}\.json$/);
    });
  });

  describe("environment variables", () => {
    test("WORKSPACE_DIR is defined", () => {
      expect(WORKSPACE_DIR).toBeDefined();
      expect(typeof WORKSPACE_DIR).toBe("string");
    });

    test("MEMORY_DIR is defined", () => {
      expect(MEMORY_DIR).toBeDefined();
      expect(typeof MEMORY_DIR).toBe("string");
      expect(MEMORY_DIR).toContain("memory");
    });
  });
});
