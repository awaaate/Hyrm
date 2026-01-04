import { describe, test, expect } from "bun:test";
import {
  getTaskNumericId,
  getSpecRelativePath,
  generateSpecMarkdown,
  upsertGitHubIssueLine,
} from "./spec-generator";

describe("spec-generator", () => {
  test("getTaskNumericId extracts timestamp segment", () => {
    expect(getTaskNumericId("task_1767520578520_78t9d5")).toBe("1767520578520");
    expect(getTaskNumericId("task_123_abc")).toBe("123");
  });

  test("getSpecRelativePath uses numeric id and slug", () => {
    const rel = getSpecRelativePath("task_1767520578520_78t9d5", "Create Spec System!");
    expect(rel).toMatch(/^docs\/specs\/task_1767520578520_create-spec-system\.md$/);
  });

  test("generateSpecMarkdown includes metadata", () => {
    const md = generateSpecMarkdown({
      task: {
        id: "task_1_abc",
        title: "My Task",
        description: "Do the thing",
        priority: "high",
        status: "pending",
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
        created_by: "tester",
      },
      githubIssue: { number: 123, url: "https://github.com/org/repo/issues/123" },
      branch: "task/high/abc-my-task",
      now: new Date("2026-01-02T00:00:00.000Z"),
    });

    expect(md).toContain("# Task: My Task");
    expect(md).toContain("**Task ID**: `task_1_abc`");
    expect(md).toContain("**GitHub Issue**: [#123](https://github.com/org/repo/issues/123)");
    expect(md).toContain("**Branch**: `task/high/abc-my-task`");
  });

  test("upsertGitHubIssueLine replaces existing line", () => {
    const original = "# Task: X\n\n**GitHub Issue**: pending\n";
    const updated = upsertGitHubIssueLine(original, { number: 5, url: "https://x/y/issues/5" });
    expect(updated).toContain("**GitHub Issue**: [#5](https://x/y/issues/5)");
  });
});
