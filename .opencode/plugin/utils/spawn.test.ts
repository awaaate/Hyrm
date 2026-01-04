import { describe, expect, test } from "bun:test";
import { normalizeStdioValue } from "./spawn";

describe("normalizeStdioValue", () => {
  test("defaults undefined to ignore", () => {
    expect(normalizeStdioValue(undefined, "stdout")).toBe("ignore");
  });

  test("accepts inherit/ignore/null", () => {
    expect(normalizeStdioValue("inherit", "stdout")).toBe("inherit");
    expect(normalizeStdioValue("ignore", "stdout")).toBe("ignore");
    expect(normalizeStdioValue(null, "stdout")).toBe(null);
  });

  test("rejects other values", () => {
    expect(() => normalizeStdioValue("pipe", "stdout")).toThrow();
    expect(() => normalizeStdioValue({}, "stdout")).toThrow();
    expect(() => normalizeStdioValue(123, "stdout")).toThrow();
  });
});
