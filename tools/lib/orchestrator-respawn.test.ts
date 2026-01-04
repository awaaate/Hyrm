import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("orchestrator respawn uses Bun.spawn with ignore stdio", () => {
  // bun test runs with CWD at repo root; using it is more reliable than import.meta.dir
  // (which can vary depending on bundling/transpilation).
  const pluginIndexPath = join(process.cwd(), ".opencode", "plugin", "index.ts");
  const source = readFileSync(pluginIndexPath, "utf-8");


  // Regression guard: Bun.spawn rejects Node-style `stdio: "ignore"`.
  expect(source).not.toContain('stdio: "ignore"');
  expect(source).not.toContain("stdio: 'ignore'");

  // Ensure our detached spawns explicitly ignore stdio (stdin/stdout/stderr).
  const spawnIgnoreRe =
    /Bun\.spawn\([\s\S]{0,300}?stdin:\s*["']ignore["'][\s\S]{0,300}?stdout:\s*["']ignore["'][\s\S]{0,300}?stderr:\s*["']ignore["'][\s\S]{0,300}?\)/g;

  const matches = source.match(spawnIgnoreRe) ?? [];

  // Expect at least 2: (1) orchestrator respawn, (2) task continuation worker.
  expect(matches.length).toBeGreaterThanOrEqual(2);
});
