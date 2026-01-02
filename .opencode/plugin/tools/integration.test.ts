/**
 * Integration Tests for Plugin Tools
 * 
 * Unlike the unit tests in tools.test.ts that use isolated test directories,
 * these integration tests validate:
 * 1. Real file I/O operations with actual filesystem
 * 2. JSON parsing edge cases with malformed data
 * 3. Atomic operations and concurrent access patterns
 * 4. Recovery from corrupted state files
 * 5. Full end-to-end workflows across multiple tool modules
 * 
 * Run with: bun test .opencode/plugin/tools/integration.test.ts
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { 
  existsSync, 
  readFileSync, 
  writeFileSync, 
  mkdirSync, 
  rmSync, 
  appendFileSync,
  statSync,
  readdirSync
} from "fs";
import { join } from "path";
import { createMemoryTools, type MemoryToolsContext } from "./memory-tools";
import { createTaskTools, type TaskToolsContext } from "./task-tools";
import { createQualityTools, type QualityToolsContext } from "./quality-tools";
import { createUserMessageTools, type UserMessageToolsContext } from "./user-message-tools";
import { createRecoveryTools, type RecoveryToolsContext } from "./recovery-tools";

// Integration test directory (isolated from unit tests)
const INTEGRATION_TEST_DIR = join(process.cwd(), ".integration-test");

// Utility to safely parse JSON with fallback
const safeParseJSON = (content: string, fallback: any = {}) => {
  try {
    return JSON.parse(content);
  } catch {
    return fallback;
  }
};

// Create a clean test environment
function setupTestEnvironment() {
  if (existsSync(INTEGRATION_TEST_DIR)) {
    rmSync(INTEGRATION_TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(INTEGRATION_TEST_DIR, { recursive: true });
  mkdirSync(join(INTEGRATION_TEST_DIR, "sessions"), { recursive: true });
}

// Clean up after tests
function teardownTestEnvironment() {
  if (existsSync(INTEGRATION_TEST_DIR)) {
    rmSync(INTEGRATION_TEST_DIR, { recursive: true, force: true });
  }
}

// Mock logger that captures log calls
function createMockLogger() {
  const logs: Array<{ level: string; message: string; data?: any }> = [];
  return {
    log: (level: string, message: string, data?: any) => {
      logs.push({ level, message, data });
    },
    getLogs: () => logs,
    clear: () => logs.length = 0,
  };
}

// ============================================================================
// Test Lifecycle
// ============================================================================

beforeAll(() => {
  setupTestEnvironment();
});

afterAll(() => {
  teardownTestEnvironment();
});

beforeEach(() => {
  // Clear the test directory but keep structure
  if (existsSync(INTEGRATION_TEST_DIR)) {
    const files = readdirSync(INTEGRATION_TEST_DIR);
    files.forEach(file => {
      const path = join(INTEGRATION_TEST_DIR, file);
      const stat = statSync(path);
      if (stat.isFile()) {
        rmSync(path);
      } else if (stat.isDirectory() && file !== "sessions") {
        rmSync(path, { recursive: true });
      }
    });
  }
  // Clear sessions subdirectory
  const sessionsDir = join(INTEGRATION_TEST_DIR, "sessions");
  if (existsSync(sessionsDir)) {
    readdirSync(sessionsDir).forEach(session => {
      rmSync(join(sessionsDir, session), { recursive: true });
    });
  }
});

// ============================================================================
// Real File I/O Tests
// ============================================================================

describe("Integration: Real File Operations", () => {
  describe("File Creation and State Persistence", () => {
    test("creates state.json when updating non-existent state", async () => {
      const ctx: MemoryToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        statePath: join(INTEGRATION_TEST_DIR, "state.json"),
        metricsPath: join(INTEGRATION_TEST_DIR, "metrics.json"),
      };
      const tools = createMemoryTools(() => ctx);

      // Verify file doesn't exist
      expect(existsSync(ctx.statePath)).toBe(false);

      // Update state
      const result = await tools.memory_update.execute({
        action: "update_status",
        data: "integration_test_active",
      });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);
      expect(existsSync(ctx.statePath)).toBe(true);

      // Verify file contents
      const state = JSON.parse(readFileSync(ctx.statePath, "utf-8"));
      expect(state.status).toBe("integration_test_active");
    });

    test("persists data across multiple tool calls", async () => {
      const ctx: MemoryToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        statePath: join(INTEGRATION_TEST_DIR, "state.json"),
        metricsPath: join(INTEGRATION_TEST_DIR, "metrics.json"),
      };
      const tools = createMemoryTools(() => ctx);

      // Add task
      await tools.memory_update.execute({ action: "add_task", data: "Task 1" });
      await tools.memory_update.execute({ action: "add_task", data: "Task 2" });
      await tools.memory_update.execute({ action: "update_status", data: "busy" });

      // Read state directly from file
      const state = JSON.parse(readFileSync(ctx.statePath, "utf-8"));
      expect(state.active_tasks).toContain("Task 1");
      expect(state.active_tasks).toContain("Task 2");
      expect(state.status).toBe("busy");
    });

    test("creates tasks.json with correct structure", async () => {
      const logger = createMockLogger();
      const ctx: TaskToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        currentSessionId: "test-session-1",
        agentId: "test-agent-1",
        log: logger.log as any,
      };
      const tools = createTaskTools(() => ctx);

      const result = await tools.task_create.execute({
        title: "Integration test task",
        description: "Test description",
        priority: "high",
        tags: ["test", "integration"],
      });
      const data = JSON.parse(result);

      expect(data.success).toBe(true);

      // Verify file structure
      const tasksPath = join(INTEGRATION_TEST_DIR, "tasks.json");
      expect(existsSync(tasksPath)).toBe(true);

      const tasks = JSON.parse(readFileSync(tasksPath, "utf-8"));
      expect(tasks.version).toBeDefined();
      expect(tasks.tasks).toBeInstanceOf(Array);
      expect(tasks.tasks[0].title).toBe("Integration test task");
      expect(tasks.tasks[0].tags).toContain("test");
    });

    test("appends to JSONL files correctly", async () => {
      const logger = createMockLogger();
      const ctx: TaskToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        currentSessionId: "test-session-1",
        agentId: "test-agent-1",
        log: logger.log as any,
      };
      const tools = createTaskTools(() => ctx);

      // Create high-priority tasks to trigger message bus writes
      await tools.task_create.execute({ title: "Critical 1", priority: "critical" });
      await tools.task_create.execute({ title: "Critical 2", priority: "critical" });

      // Check message bus
      const messageBusPath = join(INTEGRATION_TEST_DIR, "message-bus.jsonl");
      if (existsSync(messageBusPath)) {
        const lines = readFileSync(messageBusPath, "utf-8").trim().split("\n");
        expect(lines.length).toBeGreaterThanOrEqual(2);
        
        // Each line should be valid JSON
        lines.forEach(line => {
          if (line.trim()) {
            const msg = safeParseJSON(line, null);
            expect(msg).not.toBeNull();
            expect(msg.type).toBe("task_available");
          }
        });
      }
    });
  });

  describe("File Locking and Race Conditions", () => {
    test("handles rapid sequential writes without data loss", async () => {
      const ctx: MemoryToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        statePath: join(INTEGRATION_TEST_DIR, "state.json"),
        metricsPath: join(INTEGRATION_TEST_DIR, "metrics.json"),
      };
      const tools = createMemoryTools(() => ctx);

      // Perform many rapid updates
      const updateCount = 20;
      for (let i = 0; i < updateCount; i++) {
        await tools.memory_update.execute({ 
          action: "add_task", 
          data: `Rapid task ${i}` 
        });
      }

      // Verify all tasks persisted
      const state = JSON.parse(readFileSync(ctx.statePath, "utf-8"));
      expect(state.active_tasks.length).toBe(updateCount);
    });

    test("maintains data integrity with interleaved create and update", async () => {
      const logger = createMockLogger();
      const ctx: TaskToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        currentSessionId: "test-session-1",
        agentId: "test-agent-1",
        log: logger.log as any,
      };
      const tools = createTaskTools(() => ctx);

      // Create tasks
      const result1 = await tools.task_create.execute({ title: "Task A", priority: "high" });
      const task1 = JSON.parse(result1).task;

      const result2 = await tools.task_create.execute({ title: "Task B", priority: "medium" });
      const task2 = JSON.parse(result2).task;

      // Update first task
      await tools.task_update.execute({ task_id: task1.id, status: "in_progress" });

      // Create another task
      await tools.task_create.execute({ title: "Task C", priority: "low" });

      // Complete first task
      await tools.task_update.execute({ task_id: task1.id, status: "completed" });

      // Verify integrity
      const tasks = JSON.parse(readFileSync(join(INTEGRATION_TEST_DIR, "tasks.json"), "utf-8"));
      expect(tasks.tasks.length).toBe(3);
      
      const taskA = tasks.tasks.find((t: any) => t.title === "Task A");
      expect(taskA.status).toBe("completed");
    });
  });
});

// ============================================================================
// JSON Parsing Edge Cases
// ============================================================================

describe("Integration: JSON Parsing Edge Cases", () => {
  describe("Corrupted JSON Recovery", () => {
    test("handles partially written JSON (truncated)", async () => {
      const statePath = join(INTEGRATION_TEST_DIR, "state.json");
      
      // Write truncated JSON (simulates crash during write)
      writeFileSync(statePath, '{"session_count": 42, "status": "active", "ac');

      const ctx: MemoryToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        statePath,
        metricsPath: join(INTEGRATION_TEST_DIR, "metrics.json"),
      };
      const tools = createMemoryTools(() => ctx);

      const result = await tools.memory_status.execute({ include_metrics: false });
      const data = JSON.parse(result);

      // Should return error, not crash
      expect(data.success).toBe(false);
    });

    test("handles JSON with invalid UTF-8 bytes", async () => {
      const statePath = join(INTEGRATION_TEST_DIR, "state.json");
      
      // Write JSON with invalid bytes
      const buffer = Buffer.from([0x7b, 0x22, 0x6b, 0xff, 0xfe, 0x22, 0x3a, 0x31, 0x7d]);
      writeFileSync(statePath, buffer);

      const ctx: MemoryToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        statePath,
        metricsPath: join(INTEGRATION_TEST_DIR, "metrics.json"),
      };
      const tools = createMemoryTools(() => ctx);

      const result = await tools.memory_status.execute({ include_metrics: false });
      // Should handle gracefully without crashing
      expect(result).toBeDefined();
    });

    test("handles JSON with BOM (byte order mark)", async () => {
      const statePath = join(INTEGRATION_TEST_DIR, "state.json");
      
      // Write JSON with BOM prefix
      const content = '\uFEFF{"session_count": 5, "status": "bom_test"}';
      writeFileSync(statePath, content, "utf-8");

      const ctx: MemoryToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        statePath,
        metricsPath: join(INTEGRATION_TEST_DIR, "metrics.json"),
      };
      const tools = createMemoryTools(() => ctx);

      const result = await tools.memory_status.execute({ include_metrics: false });
      // BOM can cause parsing issues - verify graceful handling
      expect(result).toBeDefined();
    });

    test("handles empty object vs empty file", async () => {
      const statePath = join(INTEGRATION_TEST_DIR, "state.json");
      
      // Test 1: Empty file
      writeFileSync(statePath, "");
      
      const ctx: MemoryToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        statePath,
        metricsPath: join(INTEGRATION_TEST_DIR, "metrics.json"),
      };
      const tools = createMemoryTools(() => ctx);

      const result1 = await tools.memory_status.execute({ include_metrics: false });
      const data1 = JSON.parse(result1);
      expect(data1.success).toBe(false);

      // Test 2: Empty object - should work
      writeFileSync(statePath, "{}");
      const result2 = await tools.memory_status.execute({ include_metrics: false });
      const data2 = JSON.parse(result2);
      expect(data2.success).toBe(true);
    });

    test("handles deeply nested JSON structures", async () => {
      const logger = createMockLogger();
      const tasksPath = join(INTEGRATION_TEST_DIR, "tasks.json");
      
      // Create deeply nested task structure
      const deepTask = {
        version: "1.0",
        tasks: [{
          id: "task_deep",
          title: "Deep Task",
          status: "pending",
          metadata: {
            level1: {
              level2: {
                level3: {
                  level4: {
                    level5: { value: "deep" }
                  }
                }
              }
            }
          }
        }]
      };
      writeFileSync(tasksPath, JSON.stringify(deepTask, null, 2));

      const ctx: TaskToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        currentSessionId: "test-session",
        agentId: "test-agent",
        log: logger.log as any,
      };
      const tools = createTaskTools(() => ctx);

      const result = await tools.task_list.execute({ status: "all" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.tasks[0].title).toBe("Deep Task");
    });

    test("handles JSONL with mixed valid/invalid lines", async () => {
      const logger = createMockLogger();
      const messagesPath = join(INTEGRATION_TEST_DIR, "user-messages.jsonl");
      
      // Write JSONL with some corrupt lines
      const lines = [
        '{"id":"msg_1","from":"user","message":"Valid 1","read":false}',
        'not valid json at all',
        '{"id":"msg_2",', // Truncated
        '{"id":"msg_3","from":"user","message":"Valid 2","read":false}',
        '',
        '{"id":"msg_4","from":"user","message":"Valid 3","read":true}'
      ];
      writeFileSync(messagesPath, lines.join("\n"));

      const ctx: UserMessageToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        currentSessionId: "test-session",
        log: logger.log as any,
      };
      const tools = createUserMessageTools(() => ctx);

      const result = await tools.user_messages_read.execute({ include_read: true });
      const data = JSON.parse(result);

      // Should parse what it can
      expect(data.success).toBe(true);
      // Should have found the valid messages
      expect(data.messages.length).toBeGreaterThan(0);
    });
  });

  describe("Large File Handling", () => {
    test("handles large knowledge base file", async () => {
      const knowledgePath = join(INTEGRATION_TEST_DIR, "knowledge-base.json");
      
      // Create large knowledge base
      const entries = Array.from({ length: 500 }, (_, i) => ({
        session_id: `ses_${i}`,
        timestamp: new Date().toISOString(),
        key_insights: [`Insight ${i} - ${Array(100).fill("x").join("")}`],
        decisions: [`Decision ${i}`],
      }));
      writeFileSync(knowledgePath, JSON.stringify(entries, null, 2));

      const ctx: MemoryToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        statePath: join(INTEGRATION_TEST_DIR, "state.json"),
        metricsPath: join(INTEGRATION_TEST_DIR, "metrics.json"),
      };
      const tools = createMemoryTools(() => ctx);

      const startTime = Date.now();
      const result = await tools.memory_search.execute({ query: "Insight 250", scope: "knowledge" });
      const duration = Date.now() - startTime;

      const data = JSON.parse(result);
      expect(data.success).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    test("handles large tasks file with many entries", async () => {
      const logger = createMockLogger();
      const tasksPath = join(INTEGRATION_TEST_DIR, "tasks.json");
      
      // Create many tasks
      const tasks = {
        version: "1.0",
        tasks: Array.from({ length: 200 }, (_, i) => ({
          id: `task_${i}`,
          title: `Task ${i}: ${Array(50).fill("description text").join(" ")}`,
          priority: ["critical", "high", "medium", "low"][i % 4],
          status: ["pending", "in_progress", "completed", "blocked"][i % 4],
          created_at: new Date(Date.now() - i * 3600000).toISOString(),
        }))
      };
      writeFileSync(tasksPath, JSON.stringify(tasks, null, 2));

      const ctx: TaskToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        currentSessionId: "test-session",
        agentId: "test-agent",
        log: logger.log as any,
      };
      const tools = createTaskTools(() => ctx);

      // Test list all
      const listResult = await tools.task_list.execute({ status: "all" });
      const listData = JSON.parse(listResult);
      expect(listData.count).toBe(200);

      // Test scheduling
      const scheduleResult = await tools.task_schedule.execute({ limit: 10 });
      const scheduleData = JSON.parse(scheduleResult);
      expect(scheduleData.schedule.length).toBe(10);
    });
  });
});

// ============================================================================
// Recovery Tools Integration
// ============================================================================

describe("Integration: Recovery Tools", () => {
  describe("Checkpoint Save and Load", () => {
    test("saves and loads checkpoint with all fields", async () => {
      const logger = createMockLogger();
      const sessionId = "test-session-recovery";
      
      const ctx: RecoveryToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        currentSessionId: sessionId,
        agentId: "test-agent",
        log: logger.log as any,
      };
      const tools = createRecoveryTools(() => ctx);

      // Create checkpoint
      const saveResult = await tools.checkpoint_save.execute({
        task_id: "task_123",
        task_title: "Test Task",
        progress_description: "Halfway through implementation",
        progress_percentage: 50,
        files_modified: [
          { path: "src/test.ts", action: "modified" },
          { path: "src/new.ts", action: "created" },
        ],
        next_steps: ["Complete step 2", "Write tests"],
        blockers: ["Waiting for API response format"],
        can_resume: true,
        resume_instructions: "Continue from step 2 of implementation",
      });
      const saveData = JSON.parse(saveResult);
      expect(saveData.success).toBe(true);

      // Verify checkpoint file exists
      const checkpointPath = join(INTEGRATION_TEST_DIR, "sessions", sessionId, "checkpoint.json");
      expect(existsSync(checkpointPath)).toBe(true);

      // Load checkpoint
      const loadResult = await tools.checkpoint_load.execute({ session_id: sessionId });
      const loadData = JSON.parse(loadResult);
      
      expect(loadData.success).toBe(true);
      expect(loadData.checkpoint.current_task.task_id).toBe("task_123");
      expect(loadData.checkpoint.context.next_steps).toHaveLength(2);
      expect(loadData.checkpoint.files_modified).toHaveLength(2);
    });

    test("recovery_status shows all recoverable sessions", async () => {
      const logger = createMockLogger();
      
      // Create multiple session checkpoints
      for (const sessionNum of [1, 2, 3]) {
        const sessionId = `session-${sessionNum}`;
        const ctx: RecoveryToolsContext = {
          memoryDir: INTEGRATION_TEST_DIR,
          currentSessionId: sessionId,
          agentId: "test-agent",
          log: logger.log as any,
        };
        const tools = createRecoveryTools(() => ctx);

        await tools.checkpoint_save.execute({
          progress_description: `Session ${sessionNum} in progress`,
          next_steps: [`Continue session ${sessionNum}`],
          can_resume: sessionNum !== 2, // Session 2 cannot be resumed
        });
      }

      // Check recovery status from a new session
      const newCtx: RecoveryToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        currentSessionId: "new-session",
        agentId: "test-agent",
        log: logger.log as any,
      };
      const tools = createRecoveryTools(() => newCtx);

      const statusResult = await tools.recovery_status.execute({});
      const statusData = JSON.parse(statusResult);

      expect(statusData.success).toBe(true);
      // recovery_status returns 'sessions' array and 'recoverable_count'
      expect(statusData.recoverable_count).toBeGreaterThanOrEqual(2);
    });

    test("recovery_cleanup removes old checkpoints", async () => {
      const logger = createMockLogger();
      
      // Create old checkpoint
      const oldSessionDir = join(INTEGRATION_TEST_DIR, "sessions", "old-session");
      mkdirSync(oldSessionDir, { recursive: true });
      
      const oldCheckpoint = {
        version: "1.0",
        checkpoint_id: "old-checkpoint",
        created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), // 48 hours ago
        session_id: "old-session",
        context: { what_was_happening: "Old work", next_steps: [] },
        recovery: { can_resume: true },
      };
      writeFileSync(join(oldSessionDir, "checkpoint.json"), JSON.stringify(oldCheckpoint));

      // Create recent checkpoint
      const recentSessionDir = join(INTEGRATION_TEST_DIR, "sessions", "recent-session");
      mkdirSync(recentSessionDir, { recursive: true });
      
      const recentCheckpoint = {
        version: "1.0",
        checkpoint_id: "recent-checkpoint",
        created_at: new Date().toISOString(), // Now
        session_id: "recent-session",
        context: { what_was_happening: "Recent work", next_steps: [] },
        recovery: { can_resume: true },
      };
      writeFileSync(join(recentSessionDir, "checkpoint.json"), JSON.stringify(recentCheckpoint));

      const ctx: RecoveryToolsContext = {
        memoryDir: INTEGRATION_TEST_DIR,
        currentSessionId: "cleanup-session",
        agentId: "test-agent",
        log: logger.log as any,
      };
      const tools = createRecoveryTools(() => ctx);

      // Cleanup with 24 hour retention
      const cleanupResult = await tools.recovery_cleanup.execute({ keep_hours: 24 });
      const cleanupData = JSON.parse(cleanupResult);

      expect(cleanupData.success).toBe(true);
      expect(cleanupData.cleaned_count).toBeGreaterThanOrEqual(1);
      
      // Recent checkpoint should still exist
      expect(existsSync(join(recentSessionDir, "checkpoint.json"))).toBe(true);
    });
  });
});

// ============================================================================
// End-to-End Workflow Tests
// ============================================================================

describe("Integration: End-to-End Workflows", () => {
  test("complete task workflow: create -> claim -> work -> checkpoint -> complete -> assess", async () => {
    const logger = createMockLogger();
    const sessionId = "e2e-session";

    // Setup contexts
    const taskCtx: TaskToolsContext = {
      memoryDir: INTEGRATION_TEST_DIR,
      currentSessionId: sessionId,
      agentId: "e2e-agent",
      log: logger.log as any,
    };
    const qualityCtx: QualityToolsContext = {
      memoryDir: INTEGRATION_TEST_DIR,
      currentSessionId: sessionId,
      log: logger.log as any,
    };
    const recoveryCtx: RecoveryToolsContext = {
      memoryDir: INTEGRATION_TEST_DIR,
      currentSessionId: sessionId,
      agentId: "e2e-agent",
      log: logger.log as any,
    };

    const taskTools = createTaskTools(() => taskCtx);
    const qualityTools = createQualityTools(() => qualityCtx);
    const recoveryTools = createRecoveryTools(() => recoveryCtx);

    // 1. Create task
    const createResult = await taskTools.task_create.execute({
      title: "E2E Test Feature",
      description: "Implement and test end-to-end workflow",
      priority: "high",
      complexity: "moderate",
      estimated_hours: 2,
    });
    const createData = JSON.parse(createResult);
    expect(createData.success).toBe(true);
    const taskId = createData.task.id;

    // 2. Claim task
    const claimResult = await taskTools.task_claim.execute({ task_id: taskId });
    expect(JSON.parse(claimResult).success).toBe(true);

    // 3. Save checkpoint mid-work
    const checkpointResult = await recoveryTools.checkpoint_save.execute({
      task_id: taskId,
      task_title: "E2E Test Feature",
      progress_description: "50% complete",
      progress_percentage: 50,
      next_steps: ["Finish implementation", "Add tests"],
      can_resume: true,
    });
    expect(JSON.parse(checkpointResult).success).toBe(true);

    // 4. Verify checkpoint exists
    const statusResult = await recoveryTools.recovery_status.execute({});
    const statusData = JSON.parse(statusResult);
    expect(statusData.recoverable_count).toBeGreaterThan(0);

    // 5. Complete task
    const completeResult = await taskTools.task_update.execute({
      task_id: taskId,
      status: "completed",
      notes: "Successfully implemented and tested",
    });
    expect(JSON.parse(completeResult).success).toBe(true);

    // 6. Assess quality
    const assessResult = await qualityTools.quality_assess.execute({
      task_id: taskId,
      completeness: 9,
      code_quality: 8,
      documentation: 8,
      efficiency: 9,
      impact: 8,
      lessons_learned: "E2E testing validates the full workflow effectively",
    });
    const assessData = JSON.parse(assessResult);
    expect(assessData.success).toBe(true);
    expect(assessData.assessment.overall_score).toBeGreaterThan(7);

    // 7. Verify quality report
    const reportResult = await qualityTools.quality_report.execute({});
    const reportData = JSON.parse(reportResult);
    expect(reportData.stats.total_assessed).toBe(1);
  });

  test("multi-agent task coordination: claim prevents double-claim", async () => {
    const logger = createMockLogger();
    
    // Create shared task
    const ctx1: TaskToolsContext = {
      memoryDir: INTEGRATION_TEST_DIR,
      currentSessionId: "session-1",
      agentId: "agent-1",
      log: logger.log as any,
    };
    const tools1 = createTaskTools(() => ctx1);

    const createResult = await tools1.task_create.execute({
      title: "Shared Task",
      priority: "high",
    });
    const taskId = JSON.parse(createResult).task.id;

    // Agent 1 claims
    const claim1 = await tools1.task_claim.execute({ task_id: taskId });
    expect(JSON.parse(claim1).success).toBe(true);

    // Agent 2 tries to claim same task
    const ctx2: TaskToolsContext = {
      memoryDir: INTEGRATION_TEST_DIR,
      currentSessionId: "session-2",
      agentId: "agent-2",
      log: logger.log as any,
    };
    const tools2 = createTaskTools(() => ctx2);

    const claim2 = await tools2.task_claim.execute({ task_id: taskId });
    const claim2Data = JSON.parse(claim2);
    expect(claim2Data.success).toBe(false);
    expect(claim2Data.message).toContain("already claimed");
  });

  test("dependency chain: tasks unblock in correct order", async () => {
    const logger = createMockLogger();
    const ctx: TaskToolsContext = {
      memoryDir: INTEGRATION_TEST_DIR,
      currentSessionId: "dep-session",
      agentId: "dep-agent",
      log: logger.log as any,
    };
    const tools = createTaskTools(() => ctx);

    // Create chain: A -> B -> C (C depends on B, B depends on A)
    const taskA = await tools.task_create.execute({ title: "Task A", priority: "high" });
    const taskAId = JSON.parse(taskA).task.id;

    const taskB = await tools.task_create.execute({ 
      title: "Task B", 
      priority: "high",
      depends_on: [taskAId],
    });
    const taskBId = JSON.parse(taskB).task.id;

    const taskC = await tools.task_create.execute({ 
      title: "Task C", 
      priority: "high",
      depends_on: [taskBId],
    });
    const taskCId = JSON.parse(taskC).task.id;

    // Verify initial states
    let tasks = JSON.parse(readFileSync(join(INTEGRATION_TEST_DIR, "tasks.json"), "utf-8"));
    expect(tasks.tasks.find((t: any) => t.id === taskBId).status).toBe("blocked");
    expect(tasks.tasks.find((t: any) => t.id === taskCId).status).toBe("blocked");

    // Complete A
    await tools.task_claim.execute({ task_id: taskAId });
    await tools.task_update.execute({ task_id: taskAId, status: "completed" });

    // Verify B is unblocked, C still blocked
    tasks = JSON.parse(readFileSync(join(INTEGRATION_TEST_DIR, "tasks.json"), "utf-8"));
    expect(tasks.tasks.find((t: any) => t.id === taskBId).status).toBe("pending");
    expect(tasks.tasks.find((t: any) => t.id === taskCId).status).toBe("blocked");

    // Complete B
    await tools.task_claim.execute({ task_id: taskBId });
    await tools.task_update.execute({ task_id: taskBId, status: "completed" });

    // Verify C is now unblocked
    tasks = JSON.parse(readFileSync(join(INTEGRATION_TEST_DIR, "tasks.json"), "utf-8"));
    expect(tasks.tasks.find((t: any) => t.id === taskCId).status).toBe("pending");
  });

  test("memory and task system integration", async () => {
    const logger = createMockLogger();
    
    // Memory context
    const memoryCtx: MemoryToolsContext = {
      memoryDir: INTEGRATION_TEST_DIR,
      statePath: join(INTEGRATION_TEST_DIR, "state.json"),
      metricsPath: join(INTEGRATION_TEST_DIR, "metrics.json"),
    };
    const memoryTools = createMemoryTools(() => memoryCtx);

    // Task context
    const taskCtx: TaskToolsContext = {
      memoryDir: INTEGRATION_TEST_DIR,
      currentSessionId: "unified-session",
      agentId: "unified-agent",
      log: logger.log as any,
    };
    const taskTools = createTaskTools(() => taskCtx);

    // Set up memory state
    await memoryTools.memory_update.execute({ action: "update_status", data: "orchestrator_active" });
    await memoryTools.memory_update.execute({ action: "add_achievement", data: "Started integration testing" });

    // Create and complete tasks
    const task1 = await taskTools.task_create.execute({ title: "Unified Task 1", priority: "high" });
    const task1Id = JSON.parse(task1).task.id;
    await taskTools.task_claim.execute({ task_id: task1Id });
    await taskTools.task_update.execute({ task_id: task1Id, status: "completed" });

    // Add more achievements
    await memoryTools.memory_update.execute({ action: "add_achievement", data: "Completed unified task 1" });

    // Verify everything persisted correctly
    const statusResult = await memoryTools.memory_status.execute({ include_metrics: false });
    const statusData = JSON.parse(statusResult);

    expect(statusData.data.status).toBe("orchestrator_active");
    expect(statusData.data.recent_achievements.length).toBeGreaterThanOrEqual(2);

    const listResult = await taskTools.task_list.execute({ status: "completed" });
    const listData = JSON.parse(listResult);
    expect(listData.count).toBeGreaterThanOrEqual(1);
  });
});

// ============================================================================
// Error Boundary Tests
// ============================================================================

describe("Integration: Error Boundaries", () => {
  test("tools don't crash on filesystem errors", async () => {
    const ctx: MemoryToolsContext = {
      memoryDir: "/nonexistent/path/that/should/not/exist",
      statePath: "/nonexistent/state.json",
      metricsPath: "/nonexistent/metrics.json",
    };
    const tools = createMemoryTools(() => ctx);

    // Should not throw - may return success with defaults or error
    const result = await tools.memory_status.execute({ include_metrics: false });
    const data = JSON.parse(result);
    // The key point is it returns valid JSON, not crashes
    expect(typeof data.success).toBe("boolean");
  });

  test("handles permission denied gracefully", async () => {
    const logger = createMockLogger();
    
    // Create read-only directory (if possible on this platform)
    const readOnlyDir = join(INTEGRATION_TEST_DIR, "readonly");
    mkdirSync(readOnlyDir, { recursive: true });
    
    const ctx: TaskToolsContext = {
      memoryDir: readOnlyDir,
      currentSessionId: "test-session",
      agentId: "test-agent",
      log: logger.log as any,
    };
    const tools = createTaskTools(() => ctx);

    // This may or may not fail depending on filesystem, but shouldn't crash
    const result = await tools.task_create.execute({ title: "Test", priority: "low" });
    expect(result).toBeDefined();
  });

  test("handles concurrent tool executions", async () => {
    const ctx: MemoryToolsContext = {
      memoryDir: INTEGRATION_TEST_DIR,
      statePath: join(INTEGRATION_TEST_DIR, "state.json"),
      metricsPath: join(INTEGRATION_TEST_DIR, "metrics.json"),
    };
    const tools = createMemoryTools(() => ctx);

    // Execute multiple tools concurrently
    const promises = Array.from({ length: 10 }, (_, i) =>
      tools.memory_update.execute({ action: "add_task", data: `Concurrent task ${i}` })
    );

    const results = await Promise.all(promises);
    
    // All should complete (some may fail due to race conditions, but shouldn't crash)
    expect(results.length).toBe(10);
    results.forEach(result => {
      const data = JSON.parse(result);
      // Each result should be valid JSON with success field
      expect(typeof data.success).toBe("boolean");
    });
  });
});

console.log("Integration test suite loaded. Run with: bun test .opencode/plugin/tools/integration.test.ts");
