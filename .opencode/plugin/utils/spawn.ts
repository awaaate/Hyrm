/**
 * Spawn helper(s) for long-running background processes.
 *
 * The orchestrator respawn path previously attempted to pass file handles/sinks
 * to Bun.spawn stdout/stderr, which can throw at runtime.
 */

type StdioValue = "inherit" | "ignore" | null | undefined;

export function normalizeStdioValue(value: unknown, label: string): Exclude<StdioValue, undefined> {
  if (value === undefined) return "ignore";
  if (value === "inherit" || value === "ignore" || value === null) return value;

  throw new TypeError(
    `${label} must be one of 'inherit', 'ignore', or null (got ${typeof value})`
  );
}

export function spawnDetached(command: string[], options?: { stdin?: unknown; stdout?: unknown; stderr?: unknown }) {
  const proc = Bun.spawn(command, {
    stdin: normalizeStdioValue(options?.stdin, "stdin"),
    stdout: normalizeStdioValue(options?.stdout, "stdout"),
    stderr: normalizeStdioValue(options?.stderr, "stderr"),
  });

  proc.unref();
  return proc;
}
