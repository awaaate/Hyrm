/**
 * File Lock Helper
 *
 * Provides a simple cross-process file locking helper
 * for shared state files using a sidecar .lock file.
 *
 * This is used by plugin tools (memory, tasks, etc.)
 * to avoid race conditions when multiple agents or
 * CLI tools write to the same JSON file.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";

export interface FileLockOptions {
  ownerId?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
  staleMs?: number;
}

interface FileLockMetadata {
  owner_id: string;
  locked_at: string;
  pid?: number;
}

/**
 * Acquire a file lock, run the given function, and release the lock.
 *
 * - Creates a `${file}.lock` JSON file with owner + timestamp
 * - Retries with exponential backoff if the lock is held
 * - Treats locks older than `staleMs` as stale and removes them
 */
export async function withFileLock<T>(
  filePath: string,
  ownerId: string,
  fn: () => Promise<T> | T,
  options: FileLockOptions = {}
): Promise<T> {
  const lockPath = `${filePath}.lock`;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const initialDelay = options.retryDelayMs ?? 50;
  const staleMs = options.staleMs ?? 2 * 60 * 1000; // 2 minutes

  const start = Date.now();
  let attempt = 0;

  while (true) {
    if (tryAcquireLock(lockPath, ownerId, staleMs)) {
      break;
    }

    const elapsed = Date.now() - start;
    if (elapsed > timeoutMs) {
      throw new Error(`Timed out acquiring file lock for ${filePath}`);
    }

    // Exponential backoff with a cap at 1s
    const delay = Math.min(initialDelay * Math.pow(2, attempt), 1000);
    attempt++;

    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  try {
    return await fn();
  } finally {
    tryReleaseLock(lockPath, ownerId);
  }
}

function tryAcquireLock(lockPath: string, ownerId: string, staleMs: number): boolean {
  const meta: FileLockMetadata = {
    owner_id: ownerId,
    locked_at: new Date().toISOString(),
    pid: typeof process !== "undefined" ? process.pid : undefined,
  };

  try {
    // Attempt atomic create; fail if file already exists
    writeFileSync(lockPath, JSON.stringify(meta, null, 2), { flag: "wx" });
    return true;
  } catch (error: any) {
    // If the lock file already exists, see if it is stale or invalid
    if (error && (error.code === "EEXIST" || error.code === "EACCES")) {
      try {
        const raw = readFileSync(lockPath, "utf-8");
        const existing = JSON.parse(raw) as Partial<FileLockMetadata>;
        const lockedAt = existing.locked_at
          ? new Date(existing.locked_at).getTime()
          : 0;
        const age = Date.now() - lockedAt;

        if (!lockedAt || age > staleMs) {
          // Stale or invalid lock; remove and let caller retry
          try {
            unlinkSync(lockPath);
          } catch {
            // ignore unlink errors
          }
        }
      } catch {
        // Corrupt lock file; remove and let caller retry
        try {
          unlinkSync(lockPath);
        } catch {
          // ignore
        }
      }
    }

    return false;
  }
}

function tryReleaseLock(lockPath: string, ownerId: string): void {
  if (!existsSync(lockPath)) return;

  try {
    const raw = readFileSync(lockPath, "utf-8");
    const existing = JSON.parse(raw) as Partial<FileLockMetadata>;

    if (existing.owner_id === ownerId) {
      unlinkSync(lockPath);
    }
  } catch {
    // If we can't read/parse, best-effort delete
    try {
      unlinkSync(lockPath);
    } catch {
      // ignore
    }
  }
}
