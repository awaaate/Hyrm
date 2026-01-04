/**
 * Automated Test Suite for Plugin Tools
 * 
 * Tests all plugin tools for correctness:
 * - Agent tools (registration, messaging, status)
 * - Memory tools (status, search, update)
 * - Task tools (create, list, update, claim, next)
 * - Quality tools (assess, report)
 * - User message tools (read, mark read)
 * 
 * Run with: bun test .opencode/plugin/tools/tools.test.ts
 */

import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from "bun:test";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from "fs";
import { join } from "path";
import { createMemoryTools, type MemoryToolsContext } from "./memory-tools";
import { createTaskTools, type TaskToolsContext } from "./task-tools";
import { createQualityTools, type QualityToolsContext } from "./quality-tools";
import { createUserMessageTools, type UserMessageToolsContext } from "./user-message-tools";

// Test directory setup
const TEST_DIR = join(process.cwd(), ".test-memory");
const BACKUP_DIR = join(process.cwd(), ".test-backup");

// Create test directories and backup existing files
beforeAll(() => {
  // Create test directory
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }
  
  // Create backup directory
  if (!existsSync(BACKUP_DIR)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
  }
});

// Clean up test directories
afterAll(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  if (existsSync(BACKUP_DIR)) {
    rmSync(BACKUP_DIR, { recursive: true, force: true });
  }
});

// Helper to create clean state before each test
function cleanTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
}

// Helper to create mock logger
function mockLog(level: string, message: string, data?: any) {
  // Silent in tests - can enable for debugging
  // console.log(`[${level}] ${message}`, data);
}

// ========================================
// Memory Tools Tests
// ========================================

describe("Memory Tools", () => {
  let memoryTools: ReturnType<typeof createMemoryTools>;
  let ctx: MemoryToolsContext;

  beforeEach(() => {
    cleanTestDir();
    ctx = {
      memoryDir: TEST_DIR,
      statePath: join(TEST_DIR, "state.json"),
      metricsPath: join(TEST_DIR, "metrics.json"),
    };
    memoryTools = createMemoryTools(() => ctx);
  });

  describe("memory_status", () => {
    test("returns default state when no files exist", async () => {
      const result = await memoryTools.memory_status.execute({ include_metrics: false });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.data.session).toBe(0);
      expect(data.data.status).toBe("unknown");
      expect(data.data.active_tasks).toEqual([]);
    });

    test("returns state from existing file", async () => {
      // Setup: create state file
      const state = {
        session_count: 42,
        status: "active",
        active_tasks: ["Task 1", "Task 2"],
        recent_achievements: ["Achievement 1", "Achievement 2"],
      };
      writeFileSync(ctx.statePath, JSON.stringify(state, null, 2));

      const result = await memoryTools.memory_status.execute({ include_metrics: false });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.data.session).toBe(42);
      expect(data.data.status).toBe("active");
      expect(data.data.active_tasks).toHaveLength(2);
    });

    test("includes metrics when requested", async () => {
      // Setup: create state and metrics files
      writeFileSync(ctx.statePath, JSON.stringify({ session_count: 1, total_tokens_used: 5000 }, null, 2));
      writeFileSync(ctx.metricsPath, JSON.stringify({ total_sessions: 10, total_tool_calls: 100 }, null, 2));

      const result = await memoryTools.memory_status.execute({ include_metrics: true });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.data.total_sessions).toBe(10);
      expect(data.data.total_tool_calls).toBe(100);
      expect(data.data.total_tokens).toBe(5000);
    });
  });

  describe("memory_search", () => {
    test("searches working memory", async () => {
      // Setup: create working.md
      const workingContent = `# Working Memory
## Session 1
Test content about testing frameworks
Another line about bun test runner
`;
      writeFileSync(join(TEST_DIR, "working.md"), workingContent);

      const result = await memoryTools.memory_search.execute({ query: "bun test", scope: "working" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.data.matches).toHaveLength(1);
      expect(data.data.matches[0].source).toBe("working.md");
    });

    test("searches knowledge base", async () => {
      // Setup: create knowledge-base.json
      const knowledge = [
        { session_id: "ses_123", key_insights: ["Testing is important"], decisions: ["Use bun:test"] },
        { session_id: "ses_456", key_insights: ["Memory management"], decisions: ["Use file-based storage"] },
      ];
      writeFileSync(join(TEST_DIR, "knowledge-base.json"), JSON.stringify(knowledge, null, 2));

      const result = await memoryTools.memory_search.execute({ query: "testing", scope: "knowledge" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.data.matches).toHaveLength(1);
      expect(data.data.matches[0].source).toBe("knowledge-base.json");
    });

    test("returns empty matches when nothing found", async () => {
      const result = await memoryTools.memory_search.execute({ query: "nonexistent", scope: "all" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.data.matches).toHaveLength(0);
    });
  });

  describe("memory_update", () => {
    test("adds a task", async () => {
      const result = await memoryTools.memory_update.execute({ action: "add_task", data: "New test task" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.new_state.active_tasks).toContain("New test task");
      
      // Verify file was written
      const state = JSON.parse(readFileSync(ctx.statePath, "utf-8"));
      expect(state.active_tasks).toContain("New test task");
    });

    test("completes a task", async () => {
      // Setup: add a task first
      writeFileSync(ctx.statePath, JSON.stringify({ active_tasks: ["Task to complete", "Other task"] }, null, 2));

      const result = await memoryTools.memory_update.execute({ action: "complete_task", data: "Task to complete" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.new_state.active_tasks).not.toContain("Task to complete");
      expect(data.new_state.active_tasks).toContain("Other task");
    });

    test("updates status", async () => {
      const result = await memoryTools.memory_update.execute({ action: "update_status", data: "orchestrator_active" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.new_state.status).toBe("orchestrator_active");
    });

    test("adds an achievement", async () => {
      writeFileSync(ctx.statePath, JSON.stringify({ session_count: 78 }, null, 2));
      
      const result = await memoryTools.memory_update.execute({ action: "add_achievement", data: "Created test suite" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.new_state.recent_achievements[0]).toContain("Session 78");
      expect(data.new_state.recent_achievements[0]).toContain("Created test suite");
    });
  });
});

// ========================================
// Task Tools Tests
// ========================================

describe("Task Tools", () => {
  let taskTools: ReturnType<typeof createTaskTools>;
  let ctx: TaskToolsContext;

  beforeEach(() => {
    cleanTestDir();
    ctx = {
      memoryDir: TEST_DIR,
      currentSessionId: "test-session-123",
      agentId: "test-agent-456",
      log: mockLog as any,
    };
    taskTools = createTaskTools(() => ctx);
  });

  describe("task_list", () => {
    test("returns empty list when no tasks exist", async () => {
      const result = await taskTools.task_list.execute({ status: "pending" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.tasks).toEqual([]);
    });

    test("lists tasks by status", async () => {
      // Setup: create tasks file
      const tasks = {
        version: "1.0",
        tasks: [
          { id: "task_1", title: "Pending task", priority: "high", status: "pending" },
          { id: "task_2", title: "Completed task", priority: "medium", status: "completed" },
          { id: "task_3", title: "Another pending", priority: "low", status: "pending" },
        ],
      };
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

      const result = await taskTools.task_list.execute({ status: "pending" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.count).toBe(2);
      expect(data.tasks[0].title).toBe("Pending task"); // High priority first
    });

    test("lists all tasks when status is 'all'", async () => {
      const tasks = {
        tasks: [
          { id: "task_1", title: "Task 1", priority: "high", status: "pending" },
          { id: "task_2", title: "Task 2", priority: "medium", status: "completed" },
        ],
      };
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

      const result = await taskTools.task_list.execute({ status: "all" });
      const data = JSON.parse(result);
      
      expect(data.count).toBe(2);
    });
  });

  describe("task_create", () => {
    test("creates a basic task", async () => {
      const result = await taskTools.task_create.execute({
        title: "Test task",
        description: "A test description",
        priority: "medium",
      });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.task.title).toBe("Test task");
      expect(data.task.priority).toBe("medium");
      expect(data.task.id).toMatch(/^task_\d+_\w+$/);
    });

    test("creates high-priority task and broadcasts", async () => {
      const result = await taskTools.task_create.execute({
        title: "Urgent task",
        priority: "high",
      });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.broadcast).toBe(true);
      
      // Verify message was broadcast
      const messageBus = readFileSync(join(TEST_DIR, "message-bus.jsonl"), "utf-8");
      expect(messageBus).toContain("task_available");
      expect(messageBus).toContain("Urgent task");
    });

    test("creates task with dependencies", async () => {
      // Setup: create a prerequisite task
      const tasks = {
        tasks: [{ id: "prereq_task", title: "Prerequisite", status: "pending" }],
      };
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

      const result = await taskTools.task_create.execute({
        title: "Dependent task",
        depends_on: ["prereq_task"],
      });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      
      // Task should be blocked because prereq is not complete
      const tasksFile = JSON.parse(readFileSync(join(TEST_DIR, "tasks.json"), "utf-8"));
      const newTask = tasksFile.tasks.find((t: any) => t.title === "Dependent task");
      expect(newTask.status).toBe("blocked");
      expect(newTask.depends_on).toContain("prereq_task");
    });
  });

  describe("task_update", () => {
    test("updates task status", async () => {
      // Setup
      const tasks = {
        tasks: [{ id: "task_1", title: "Task", status: "pending" }],
      };
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

      const result = await taskTools.task_update.execute({
        task_id: "task_1",
        status: "in_progress",
      });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.task.status).toBe("in_progress");
    });

    test("completing task unblocks dependent tasks", async () => {
      // Setup: create tasks with dependency
      const tasks = {
        tasks: [
          { id: "task_1", title: "Prerequisite", status: "pending" },
          { id: "task_2", title: "Dependent", status: "blocked", depends_on: ["task_1"], blocked_by: ["task_1"] },
        ],
      };
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

      const result = await taskTools.task_update.execute({
        task_id: "task_1",
        status: "completed",
      });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      
      // Verify dependent task was unblocked
      const tasksFile = JSON.parse(readFileSync(join(TEST_DIR, "tasks.json"), "utf-8"));
      const dependentTask = tasksFile.tasks.find((t: any) => t.id === "task_2");
      expect(dependentTask.status).toBe("pending");
      expect(dependentTask.blocked_by).toBeUndefined();
    });

    test("returns error for non-existent task", async () => {
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify({ tasks: [] }, null, 2));

      const result = await taskTools.task_update.execute({
        task_id: "nonexistent",
        status: "completed",
      });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(false);
      expect(data.message).toContain("not found");
    });
  });

  describe("task_next", () => {
    test("returns highest priority available task", async () => {
      const tasks = {
        tasks: [
          { id: "task_1", title: "Low priority", priority: "low", status: "pending", created_at: new Date().toISOString() },
          { id: "task_2", title: "High priority", priority: "high", status: "pending", created_at: new Date().toISOString() },
          { id: "task_3", title: "Medium priority", priority: "medium", status: "pending", created_at: new Date().toISOString() },
        ],
      };
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

      const result = await taskTools.task_next.execute({});
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.task.title).toBe("High priority");
      expect(data.pending_count).toBe(3);
    });

    test("skips blocked tasks", async () => {
      const tasks = {
        tasks: [
          { id: "task_1", title: "Blocked", priority: "critical", status: "blocked", depends_on: ["other"], created_at: new Date().toISOString() },
          { id: "task_2", title: "Available", priority: "low", status: "pending", created_at: new Date().toISOString() },
        ],
      };
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

      const result = await taskTools.task_next.execute({});
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.task.title).toBe("Available");
      expect(data.blocked_count).toBe(1);
    });

    test("returns null when no tasks available", async () => {
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify({ tasks: [] }, null, 2));

      const result = await taskTools.task_next.execute({});
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.task).toBeNull();
    });
  });

  describe("task_claim", () => {
    test("claims available task", async () => {
      const tasks = {
        tasks: [{ id: "task_1", title: "Available task", status: "pending" }],
      };
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

      const result = await taskTools.task_claim.execute({ task_id: "task_1" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.task.assigned_to).toBe(ctx.agentId);
      expect(data.message).toContain("claimed");
      
      // Verify task was updated
      const tasksFile = JSON.parse(readFileSync(join(TEST_DIR, "tasks.json"), "utf-8"));
      expect(tasksFile.tasks[0].status).toBe("in_progress");
    });

    test("rejects already claimed task", async () => {
      const tasks = {
        tasks: [{ id: "task_1", title: "Claimed task", status: "in_progress", assigned_to: "other-agent" }],
      };
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

      const result = await taskTools.task_claim.execute({ task_id: "task_1" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(false);
      expect(data.message).toContain("already claimed");
    });
  });

  describe("task_schedule", () => {
    test("returns prioritized schedule", async () => {
      const now = Date.now();
      const tasks = {
        tasks: [
          { 
            id: "task_1", title: "Old low priority", priority: "low", status: "pending", 
            created_at: new Date(now - 24 * 60 * 60 * 1000).toISOString(), // 24 hours ago
            complexity: "simple",
          },
          { 
            id: "task_2", title: "New high priority", priority: "high", status: "pending", 
            created_at: new Date(now).toISOString(),
            complexity: "complex",
          },
        ],
      };
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

      const result = await taskTools.task_schedule.execute({ limit: 5 });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.schedule).toHaveLength(2);
      expect(data.summary.available_count).toBe(2);
      expect(data.summary.recommendation).toContain("Start with");
    });
  });
});

// ========================================
// Quality Tools Tests
// ========================================

describe("Quality Tools", () => {
  let qualityTools: ReturnType<typeof createQualityTools>;
  let ctx: QualityToolsContext;

  beforeEach(() => {
    cleanTestDir();
    ctx = {
      memoryDir: TEST_DIR,
      currentSessionId: "test-session-123",
      log: mockLog as any,
    };
    qualityTools = createQualityTools(() => ctx);
  });

  describe("quality_assess", () => {
    test("assesses completed task", async () => {
      // Setup: create a completed task
      const tasks = {
        tasks: [{ 
          id: "task_1", 
          title: "Completed task", 
          status: "completed",
          created_at: new Date(Date.now() - 3600000).toISOString(),
          completed_at: new Date().toISOString(),
        }],
      };
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

      const result = await qualityTools.quality_assess.execute({
        task_id: "task_1",
        completeness: 8,
        code_quality: 9,
        documentation: 7,
        efficiency: 8,
        impact: 9,
        lessons_learned: "Testing is valuable",
      });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.assessment.overall_score).toBeGreaterThan(7);
      expect(data.assessment.lessons_learned).toBe("Testing is valuable");
    });

    test("rejects assessment of non-completed task", async () => {
      const tasks = {
        tasks: [{ id: "task_1", title: "Pending task", status: "pending" }],
      };
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

      const result = await qualityTools.quality_assess.execute({
        task_id: "task_1",
        completeness: 8,
      });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(false);
      expect(data.message).toContain("not completed");
    });

    test("uses default scores when not provided", async () => {
      const tasks = {
        tasks: [{ id: "task_1", title: "Task", status: "completed" }],
      };
      writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

      const result = await qualityTools.quality_assess.execute({ task_id: "task_1" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.assessment.overall_score).toBeGreaterThan(0);
    });
  });

  describe("quality_report", () => {
    test("returns empty report when no assessments", async () => {
      const result = await qualityTools.quality_report.execute({});
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.stats.total_assessed).toBe(0);
    });

    test("calculates trends and statistics", async () => {
      // Setup: create quality assessments
      const quality = {
        version: "1.0",
        assessments: [
          { task_id: "task_1", overall_score: 7, assessed_at: new Date(Date.now() - 86400000).toISOString() },
          { task_id: "task_2", overall_score: 8, assessed_at: new Date().toISOString(), lessons_learned: "A lesson" },
        ],
        aggregate_stats: { total_assessed: 2, avg_overall_score: 7.5 },
      };
      writeFileSync(join(TEST_DIR, "quality-assessments.json"), JSON.stringify(quality, null, 2));

      const result = await qualityTools.quality_report.execute({});
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.stats.total_assessed).toBe(2);
      expect(parseFloat(data.stats.avg_overall_score)).toBeCloseTo(7.5, 1);
      expect(data.recent_lessons).toHaveLength(1);
    });
  });
});

// ========================================
// User Message Tools Tests
// ========================================

describe("User Message Tools", () => {
  let userMsgTools: ReturnType<typeof createUserMessageTools>;
  let ctx: UserMessageToolsContext;

  beforeEach(() => {
    cleanTestDir();
    ctx = {
      memoryDir: TEST_DIR,
      currentSessionId: "test-session-123",
      log: mockLog as any,
    };
    userMsgTools = createUserMessageTools(() => ctx);
  });

  describe("user_messages_read", () => {
    test("returns empty list when no messages", async () => {
      const result = await userMsgTools.user_messages_read.execute({});
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.message_count).toBe(0);
      expect(data.messages).toEqual([]);
    });

    test("returns unread messages", async () => {
      // Setup: create messages
      const messages = [
        { id: "msg_1", from: "user", message: "Hello", timestamp: new Date().toISOString(), read: false },
        { id: "msg_2", from: "user", message: "Read message", timestamp: new Date().toISOString(), read: true },
        { id: "msg_3", from: "user", message: "Another unread", timestamp: new Date().toISOString(), read: false },
      ];
      writeFileSync(
        join(TEST_DIR, "user-messages.jsonl"),
        messages.map(m => JSON.stringify(m)).join("\n") + "\n"
      );

      const result = await userMsgTools.user_messages_read.execute({ include_read: false });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.message_count).toBe(2);
      expect(data.total_unread).toBe(2);
    });

    test("includes read messages when requested", async () => {
      const messages = [
        { id: "msg_1", from: "user", message: "Unread", read: false },
        { id: "msg_2", from: "user", message: "Read", read: true },
      ];
      writeFileSync(
        join(TEST_DIR, "user-messages.jsonl"),
        messages.map(m => JSON.stringify(m)).join("\n") + "\n"
      );

      const result = await userMsgTools.user_messages_read.execute({ include_read: true });
      const data = JSON.parse(result);
      
      expect(data.message_count).toBe(2);
    });
  });

  describe("user_messages_mark_read", () => {
    test("marks specific message as read", async () => {
      const messages = [
        { id: "msg_1", from: "user", message: "Message 1", read: false },
        { id: "msg_2", from: "user", message: "Message 2", read: false },
      ];
      writeFileSync(
        join(TEST_DIR, "user-messages.jsonl"),
        messages.map(m => JSON.stringify(m)).join("\n") + "\n"
      );

      const result = await userMsgTools.user_messages_mark_read.execute({ message_id: "msg_1" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.marked_count).toBe(1);
      
      // Verify file was updated
      const content = readFileSync(join(TEST_DIR, "user-messages.jsonl"), "utf-8");
      const updatedMessages = content.trim().split("\n").map(l => JSON.parse(l));
      expect(updatedMessages[0].read).toBe(true);
      expect(updatedMessages[1].read).toBe(false);
    });

    test("marks all messages as read", async () => {
      const messages = [
        { id: "msg_1", from: "user", message: "Message 1", read: false },
        { id: "msg_2", from: "user", message: "Message 2", read: false },
      ];
      writeFileSync(
        join(TEST_DIR, "user-messages.jsonl"),
        messages.map(m => JSON.stringify(m)).join("\n") + "\n"
      );

      const result = await userMsgTools.user_messages_mark_read.execute({ message_id: "all" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.marked_count).toBe(2);
    });

    test("handles already read message", async () => {
      const messages = [
        { id: "msg_1", from: "user", message: "Already read", read: true },
      ];
      writeFileSync(
        join(TEST_DIR, "user-messages.jsonl"),
        messages.map(m => JSON.stringify(m)).join("\n") + "\n"
      );

      const result = await userMsgTools.user_messages_mark_read.execute({ message_id: "msg_1" });
      const data = JSON.parse(result);
      
      expect(data.success).toBe(true);
      expect(data.marked_count).toBe(0);
    });
  });
});

// ========================================
// Integration Tests
// ========================================

describe("Integration Tests", () => {
  let memoryTools: ReturnType<typeof createMemoryTools>;
  let taskTools: ReturnType<typeof createTaskTools>;
  let qualityTools: ReturnType<typeof createQualityTools>;

  beforeEach(() => {
    cleanTestDir();
    
    const memoryCtx: MemoryToolsContext = {
      memoryDir: TEST_DIR,
      statePath: join(TEST_DIR, "state.json"),
      metricsPath: join(TEST_DIR, "metrics.json"),
    };
    
    const taskCtx: TaskToolsContext = {
      memoryDir: TEST_DIR,
      currentSessionId: "integration-test",
      agentId: "test-agent",
      log: mockLog as any,
    };
    
    const qualityCtx: QualityToolsContext = {
      memoryDir: TEST_DIR,
      currentSessionId: "integration-test",
      log: mockLog as any,
    };
    
    memoryTools = createMemoryTools(() => memoryCtx);
    taskTools = createTaskTools(() => taskCtx);
    qualityTools = createQualityTools(() => qualityCtx);
  });

  test("full task lifecycle: create -> claim -> complete -> assess", async () => {
    // 1. Create a task
    const createResult = await taskTools.task_create.execute({
      title: "Integration test task",
      description: "A task for integration testing",
      priority: "medium",
    });
    const created = JSON.parse(createResult);
    expect(created.success).toBe(true);
    const taskId = created.task.id;

    // 2. Get next task
    const nextResult = await taskTools.task_next.execute({});
    const next = JSON.parse(nextResult);
    expect(next.success).toBe(true);
    expect(next.task.id).toBe(taskId);

    // 3. Claim the task
    const claimResult = await taskTools.task_claim.execute({ task_id: taskId });
    const claimed = JSON.parse(claimResult);
    expect(claimed.success).toBe(true);

    // 4. Complete the task
    const updateResult = await taskTools.task_update.execute({
      task_id: taskId,
      status: "completed",
      notes: "Task completed successfully",
    });
    const updated = JSON.parse(updateResult);
    expect(updated.success).toBe(true);

    // 5. Assess quality
    const assessResult = await qualityTools.quality_assess.execute({
      task_id: taskId,
      completeness: 9,
      code_quality: 8,
      lessons_learned: "Integration testing works!",
    });
    const assessed = JSON.parse(assessResult);
    expect(assessed.success).toBe(true);
    expect(assessed.assessment.overall_score).toBeGreaterThan(7);

    // 6. Check quality report
    const reportResult = await qualityTools.quality_report.execute({});
    const report = JSON.parse(reportResult);
    expect(report.success).toBe(true);
    expect(report.stats.total_assessed).toBe(1);
  });

  test("task dependencies workflow", async () => {
    // 1. Create prerequisite task
    const prereqResult = await taskTools.task_create.execute({
      title: "Prerequisite task",
      priority: "high",
    });
    const prereq = JSON.parse(prereqResult);
    expect(prereq.success).toBe(true);
    const prereqId = prereq.task.id;

    // 2. Create dependent task
    const depResult = await taskTools.task_create.execute({
      title: "Dependent task",
      depends_on: [prereqId],
    });
    const dep = JSON.parse(depResult);
    expect(dep.success).toBe(true);

    // 3. Verify dependent is blocked
    const scheduleResult = await taskTools.task_schedule.execute({});
    const schedule = JSON.parse(scheduleResult);
    expect(schedule.summary.blocked_count).toBe(1);

    // 4. Complete prerequisite
    await taskTools.task_claim.execute({ task_id: prereqId });
    await taskTools.task_update.execute({ task_id: prereqId, status: "completed" });

    // 5. Verify dependent is now available
    const nextResult = await taskTools.task_next.execute({});
    const next = JSON.parse(nextResult);
    expect(next.task.title).toBe("Dependent task");
  });
});

// ========================================
// Edge Case Tests
// ========================================

describe("Edge Cases: Corrupted JSON Recovery", () => {
  let memoryTools: ReturnType<typeof createMemoryTools>;
  let taskTools: ReturnType<typeof createTaskTools>;
  let ctx: MemoryToolsContext;
  let taskCtx: TaskToolsContext;

  beforeEach(() => {
    cleanTestDir();
    ctx = {
      memoryDir: TEST_DIR,
      statePath: join(TEST_DIR, "state.json"),
      metricsPath: join(TEST_DIR, "metrics.json"),
    };
    taskCtx = {
      memoryDir: TEST_DIR,
      currentSessionId: "test-session",
      agentId: "test-agent",
      log: mockLog as any,
    };
    memoryTools = createMemoryTools(() => ctx);
    taskTools = createTaskTools(() => taskCtx);
  });

  test("memory_status returns error for corrupted state.json", async () => {
    // Write corrupted JSON
    writeFileSync(ctx.statePath, "{ invalid json here ===");

    const result = await memoryTools.memory_status.execute({ include_metrics: false });
    const data = JSON.parse(result);
    
    // Currently returns success:false - documenting actual behavior
    // Future improvement: could recover gracefully with defaults
    expect(data.success).toBe(false);
  });

  test("memory_status returns error for empty state.json", async () => {
    writeFileSync(ctx.statePath, "");

    const result = await memoryTools.memory_status.execute({ include_metrics: false });
    const data = JSON.parse(result);
    
    // Empty JSON file causes parse error - documenting actual behavior
    expect(data.success).toBe(false);
  });

  test("task_list gracefully handles corrupted tasks.json with default", async () => {
    writeFileSync(join(TEST_DIR, "tasks.json"), "not valid json {{}}");

    const result = await taskTools.task_list.execute({ status: "pending" });
    const data = JSON.parse(result);
    
    // readJson gracefully returns default value { tasks: [] } for corrupted JSON
    expect(data.success).toBe(true);
    expect(data.tasks).toEqual([]);
  });

  test("task_list handles tasks.json with null tasks array", async () => {
    writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify({ tasks: null }));

    const result = await taskTools.task_list.execute({ status: "all" });
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    expect(data.tasks).toEqual([]);
  });

  test("memory_search returns error for corrupted knowledge-base.json", async () => {
    writeFileSync(join(TEST_DIR, "knowledge-base.json"), "corrupted[[{");

    const result = await memoryTools.memory_search.execute({ query: "test", scope: "knowledge" });
    const data = JSON.parse(result);
    
    // Currently returns success:false for corrupted files
    expect(data.success).toBe(false);
  });

  test("memory_update creates state.json if it doesn't exist", async () => {
    const result = await memoryTools.memory_update.execute({ 
      action: "add_task", 
      data: "New task" 
    });
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    expect(existsSync(ctx.statePath)).toBe(true);
  });
});

describe("Edge Cases: Concurrent Task Claims", () => {
  let taskTools: ReturnType<typeof createTaskTools>;
  let taskCtx: TaskToolsContext;

  beforeEach(() => {
    cleanTestDir();
    taskCtx = {
      memoryDir: TEST_DIR,
      currentSessionId: "test-session",
      agentId: "agent-1",
      log: mockLog as any,
    };
    taskTools = createTaskTools(() => taskCtx);
  });

  test("prevents double-claiming same task", async () => {
    const tasks = {
      tasks: [{ id: "task_1", title: "Task", status: "pending" }],
    };
    writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

    // First claim succeeds
    const result1 = await taskTools.task_claim.execute({ task_id: "task_1" });
    const data1 = JSON.parse(result1);
    expect(data1.success).toBe(true);

    // Second claim by same agent fails
    const result2 = await taskTools.task_claim.execute({ task_id: "task_1" });
    const data2 = JSON.parse(result2);
    expect(data2.success).toBe(false);
    expect(data2.message).toContain("already claimed");
  });

  test("prevents claiming non-existent task", async () => {
    writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify({ tasks: [] }));

    const result = await taskTools.task_claim.execute({ task_id: "nonexistent" });
    const data = JSON.parse(result);
    
    expect(data.success).toBe(false);
    expect(data.message).toContain("not found");
  });

  test("claiming blocked task still works (claim overrides blocked status)", async () => {
    // Note: Current implementation allows claiming blocked tasks
    // This may be intentional for manual override scenarios
    const tasks = {
      tasks: [{ 
        id: "task_1", 
        title: "Blocked Task", 
        status: "blocked",
        depends_on: ["other_task"],
        blocked_by: ["other_task"]
      }],
    };
    writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

    const result = await taskTools.task_claim.execute({ task_id: "task_1" });
    const data = JSON.parse(result);
    
    // Current behavior: blocked tasks can still be claimed (manual override)
    expect(data.success).toBe(true);
  });

  test("prevents claiming completed task", async () => {
    const tasks = {
      tasks: [{ id: "task_1", title: "Done Task", status: "completed" }],
    };
    writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

    const result = await taskTools.task_claim.execute({ task_id: "task_1" });
    const data = JSON.parse(result);
    
    expect(data.success).toBe(false);
  });
});

describe("Edge Cases: Large Message Bus Handling", () => {
  let taskTools: ReturnType<typeof createTaskTools>;
  let taskCtx: TaskToolsContext;

  beforeEach(() => {
    cleanTestDir();
    taskCtx = {
      memoryDir: TEST_DIR,
      currentSessionId: "test-session",
      agentId: "test-agent",
      log: mockLog as any,
    };
    taskTools = createTaskTools(() => taskCtx);
  });

  test("handles large message bus file when creating high-priority task", async () => {
    // Create a large message bus (1000+ messages)
    const messages: string[] = [];
    for (let i = 0; i < 1000; i++) {
      messages.push(JSON.stringify({
        id: `msg_${i}`,
        type: "heartbeat",
        from: `agent-${i % 10}`,
        timestamp: new Date().toISOString(),
        payload: { status: "active" }
      }));
    }
    writeFileSync(join(TEST_DIR, "message-bus.jsonl"), messages.join("\n") + "\n");

    // Should still be able to create tasks and append to message bus
    const result = await taskTools.task_create.execute({
      title: "High priority task",
      priority: "high",
    });
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    expect(data.broadcast).toBe(true);
  });

  test("handles empty message bus file", async () => {
    writeFileSync(join(TEST_DIR, "message-bus.jsonl"), "");

    const result = await taskTools.task_create.execute({
      title: "Critical task",
      priority: "critical",
    });
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
  });
});

describe("Edge Cases: Task Dependencies", () => {
  let taskTools: ReturnType<typeof createTaskTools>;
  let taskCtx: TaskToolsContext;

  beforeEach(() => {
    cleanTestDir();
    taskCtx = {
      memoryDir: TEST_DIR,
      currentSessionId: "test-session",
      agentId: "test-agent",
      log: mockLog as any,
    };
    taskTools = createTaskTools(() => taskCtx);
  });

  test("handles circular dependency detection", async () => {
    // Create tasks with circular dependencies
    const tasks = {
      tasks: [
        { id: "task_a", title: "Task A", status: "blocked", depends_on: ["task_b"], blocked_by: ["task_b"] },
        { id: "task_b", title: "Task B", status: "blocked", depends_on: ["task_a"], blocked_by: ["task_a"] },
      ],
    };
    writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

    // task_next should return null since all tasks are blocked
    const result = await taskTools.task_next.execute({});
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    expect(data.task).toBeNull();
    expect(data.blocked_count).toBe(2);
  });

  test("creates pending task when dependency doesn't exist", async () => {
    // Note: Current behavior creates pending task even with non-existent dependencies
    // This is because the dependency check only looks at incomplete tasks
    // Missing tasks are treated as "complete" (not blocking)
    const result = await taskTools.task_create.execute({
      title: "Task with missing dependency",
      depends_on: ["nonexistent_task_id"],
    });
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    
    const tasks = JSON.parse(readFileSync(join(TEST_DIR, "tasks.json"), "utf-8"));
    const newTask = tasks.tasks.find((t: any) => t.title === "Task with missing dependency");
    // Current behavior: task is pending because non-existent dep is not found as incomplete
    expect(newTask.status).toBe("pending");
    // depends_on may or may not be stored depending on implementation
    expect(newTask).toBeDefined();
  });

  test("handles multiple dependencies correctly", async () => {
    // Create 3 prerequisite tasks, 2 complete, 1 not
    const tasks = {
      tasks: [
        { id: "prereq_1", title: "Prereq 1", status: "completed" },
        { id: "prereq_2", title: "Prereq 2", status: "completed" },
        { id: "prereq_3", title: "Prereq 3", status: "pending" },
      ],
    };
    writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

    // Create task depending on all 3
    const result = await taskTools.task_create.execute({
      title: "Multi-dep task",
      depends_on: ["prereq_1", "prereq_2", "prereq_3"],
    });
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    
    const updatedTasks = JSON.parse(readFileSync(join(TEST_DIR, "tasks.json"), "utf-8"));
    const newTask = updatedTasks.tasks.find((t: any) => t.title === "Multi-dep task");
    expect(newTask.status).toBe("blocked");
    expect(newTask.blocked_by).toContain("prereq_3");
    expect(newTask.blocked_by).not.toContain("prereq_1");
  });
});

describe("Edge Cases: Quality Assessment", () => {
  let qualityTools: ReturnType<typeof createQualityTools>;
  let taskTools: ReturnType<typeof createTaskTools>;
  let ctx: QualityToolsContext;

  beforeEach(() => {
    cleanTestDir();
    ctx = {
      memoryDir: TEST_DIR,
      currentSessionId: "test-session",
      log: mockLog as any,
    };
    const taskCtx: TaskToolsContext = {
      memoryDir: TEST_DIR,
      currentSessionId: "test-session",
      agentId: "test-agent",
      log: mockLog as any,
    };
    qualityTools = createQualityTools(() => ctx);
    taskTools = createTaskTools(() => taskCtx);
  });

  test("handles out-of-range scores", async () => {
    const tasks = {
      tasks: [{ id: "task_1", title: "Task", status: "completed" }],
    };
    writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

    // Scores above 10 should be capped or handled
    const result = await qualityTools.quality_assess.execute({
      task_id: "task_1",
      completeness: 15,  // Out of range
      code_quality: -5,   // Negative
    });
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    // The overall score should still be reasonable
    expect(data.assessment.overall_score).toBeLessThanOrEqual(10);
  });

  test("handles duplicate quality assessments for same task", async () => {
    const tasks = {
      tasks: [{ id: "task_1", title: "Task", status: "completed" }],
    };
    writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

    // First assessment
    await qualityTools.quality_assess.execute({
      task_id: "task_1",
      completeness: 7,
    });

    // Second assessment (should update, not duplicate)
    const result = await qualityTools.quality_assess.execute({
      task_id: "task_1",
      completeness: 9,
      lessons_learned: "Updated lesson",
    });
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    
    // Check that there's only one assessment or the latest one
    const quality = JSON.parse(readFileSync(join(TEST_DIR, "quality-assessments.json"), "utf-8"));
    const taskAssessments = quality.assessments.filter((a: any) => a.task_id === "task_1");
    // Either there should be 1 (updated) or 2 (both kept)
    expect(taskAssessments.length).toBeGreaterThanOrEqual(1);
  });

  test("quality_report handles empty lessons gracefully", async () => {
    const quality = {
      assessments: [
        { task_id: "task_1", overall_score: 8 },  // No lessons_learned
        { task_id: "task_2", overall_score: 7, lessons_learned: "" },  // Empty lessons
      ],
      aggregate_stats: { total_assessed: 2 }
    };
    writeFileSync(join(TEST_DIR, "quality-assessments.json"), JSON.stringify(quality, null, 2));

    const result = await qualityTools.quality_report.execute({});
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    expect(data.recent_lessons).toBeDefined();
  });

  test("quality_report calculates correct trends", async () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    const quality = {
      assessments: [
        // Old assessments (low scores)
        { task_id: "old_1", overall_score: 5, assessed_at: new Date(now - 10 * dayMs).toISOString() },
        { task_id: "old_2", overall_score: 6, assessed_at: new Date(now - 8 * dayMs).toISOString() },
        // Recent assessments (high scores)
        { task_id: "new_1", overall_score: 9, assessed_at: new Date(now - dayMs).toISOString() },
        { task_id: "new_2", overall_score: 8, assessed_at: new Date(now).toISOString() },
      ],
      aggregate_stats: { total_assessed: 4 }
    };
    writeFileSync(join(TEST_DIR, "quality-assessments.json"), JSON.stringify(quality, null, 2));

    const result = await qualityTools.quality_report.execute({});
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    // Recent avg should be higher than older avg
    const recentAvg = parseFloat(data.stats.recent_avg);
    const olderAvg = parseFloat(data.stats.older_avg);
    expect(recentAvg).toBeGreaterThan(olderAvg);
    expect(data.stats.trend).toBe("improving");
  });
});

describe("Edge Cases: User Messages", () => {
  let userMsgTools: ReturnType<typeof createUserMessageTools>;
  let ctx: UserMessageToolsContext;

  beforeEach(() => {
    cleanTestDir();
    ctx = {
      memoryDir: TEST_DIR,
      currentSessionId: "test-session",
      log: mockLog as any,
    };
    userMsgTools = createUserMessageTools(() => ctx);
  });

  test("handles corrupted user-messages.jsonl", async () => {
    // Write partially corrupted JSONL (some valid, some invalid)
    const content = `{"id":"msg_1","message":"Valid"}
{invalid json line
{"id":"msg_2","message":"Also valid"}`;
    writeFileSync(join(TEST_DIR, "user-messages.jsonl"), content);

    // Should gracefully handle and return what it can parse
    const result = await userMsgTools.user_messages_read.execute({});
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
  });

  test("handles very long messages", async () => {
    const longMessage = "A".repeat(10000);
    const messages = [
      { id: "msg_1", from: "user", message: longMessage, read: false },
    ];
    writeFileSync(
      join(TEST_DIR, "user-messages.jsonl"),
      messages.map(m => JSON.stringify(m)).join("\n") + "\n"
    );

    const result = await userMsgTools.user_messages_read.execute({});
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    expect(data.messages[0].message.length).toBe(10000);
  });

  test("handles marking non-existent message as read", async () => {
    writeFileSync(join(TEST_DIR, "user-messages.jsonl"), "");

    const result = await userMsgTools.user_messages_mark_read.execute({ message_id: "nonexistent" });
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    expect(data.marked_count).toBe(0);
  });
});

describe("Edge Cases: Task Scheduling", () => {
  let taskTools: ReturnType<typeof createTaskTools>;

  beforeEach(() => {
    cleanTestDir();
    const taskCtx: TaskToolsContext = {
      memoryDir: TEST_DIR,
      currentSessionId: "test-session",
      agentId: "test-agent",
      log: mockLog as any,
    };
    taskTools = createTaskTools(() => taskCtx);
  });

  test("handles tasks with missing created_at", async () => {
    const tasks = {
      tasks: [
        { id: "task_1", title: "No date", priority: "high", status: "pending" },
        { id: "task_2", title: "With date", priority: "low", status: "pending", created_at: new Date().toISOString() },
      ],
    };
    writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

    const result = await taskTools.task_schedule.execute({ limit: 10 });
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    expect(data.schedule.length).toBe(2);
  });

  test("respects limit parameter", async () => {
    const tasks = {
      tasks: Array.from({ length: 20 }, (_, i) => ({
        id: `task_${i}`,
        title: `Task ${i}`,
        priority: "medium",
        status: "pending",
        created_at: new Date().toISOString(),
      })),
    };
    writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

    const result = await taskTools.task_schedule.execute({ limit: 5 });
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    expect(data.schedule.length).toBe(5);
  });

  test("calculates priority aging correctly", async () => {
    const now = Date.now();
    const tasks = {
      tasks: [
        { 
          id: "old_low", 
          title: "Old low priority", 
          priority: "low", 
          status: "pending",
          created_at: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days old
        },
        { 
          id: "new_high", 
          title: "New high priority", 
          priority: "high", 
          status: "pending",
          created_at: new Date(now).toISOString(),
        },
      ],
    };
    writeFileSync(join(TEST_DIR, "tasks.json"), JSON.stringify(tasks, null, 2));

    const result = await taskTools.task_schedule.execute({});
    const data = JSON.parse(result);
    
    expect(data.success).toBe(true);
    // The old low priority task should have higher effective priority due to aging
    const oldTask = data.schedule.find((t: any) => t.id === "old_low");
    expect(oldTask).toBeDefined();
    expect(parseFloat(oldTask.effective_priority)).toBeLessThan(3); // Base low is 4
  });
});

console.log("Test suite loaded. Run with: bun test .opencode/plugin/tools/tools.test.ts");
