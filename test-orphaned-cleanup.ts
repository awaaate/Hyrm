#!/usr/bin/env bun
/**
 * Test script for orphaned task cleanup feature
 * 
 * This script demonstrates that tasks assigned to stale agents
 * are automatically released back to pending status.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const MEMORY_DIR = "/app/workspace/memory";
const TASKS_PATH = join(MEMORY_DIR, "tasks.json");
const REGISTRY_PATH = join(MEMORY_DIR, "agent-registry.json");

console.log("🧪 Testing Orphaned Task Cleanup Feature\n");

// Step 1: Check current tasks
console.log("Step 1: Checking current task state...");
const tasksContent = readFileSync(TASKS_PATH, "utf-8");
const tasksStore = JSON.parse(tasksContent);

const inProgressTasks = tasksStore.tasks.filter((t: any) => t.status === "in_progress");
console.log(`Found ${inProgressTasks.length} tasks in progress:`);
inProgressTasks.forEach((t: any) => {
  console.log(`  - ${t.id}: ${t.title}`);
  console.log(`    Assigned to: ${t.assigned_to}`);
});

// Step 2: Create a fake stale agent
console.log("\nStep 2: Creating a fake stale agent and assigning a task...");
const fakeAgentId = "agent-test-stale-12345";
const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));

// Add a stale agent (heartbeat from 3 minutes ago)
const staleTimestamp = new Date(Date.now() - 3 * 60 * 1000).toISOString();
registry.agents.push({
  agent_id: fakeAgentId,
  session_id: "session-test-123",
  started_at: staleTimestamp,
  last_heartbeat: staleTimestamp,
  status: "working",
  assigned_role: "test-worker",
  pid: 99999
});
writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
console.log(`✓ Created stale agent: ${fakeAgentId}`);

// Create a test task assigned to the stale agent
const testTask = {
  id: `task_test_${Date.now()}`,
  title: "Test orphaned task cleanup",
  description: "This task should be released when the stale agent is cleaned up",
  priority: "medium",
  status: "in_progress",
  assigned_to: fakeAgentId,
  claimed_at: staleTimestamp,
  created_at: staleTimestamp,
  updated_at: staleTimestamp,
  tags: ["test"],
  notes: []
};

tasksStore.tasks.push(testTask);
writeFileSync(TASKS_PATH, JSON.stringify(tasksStore, null, 2));
console.log(`✓ Created test task: ${testTask.id}`);
console.log(`  Assigned to stale agent: ${fakeAgentId}`);

// Step 3: Run cleanup
console.log("\nStep 3: Running agent cleanup...");
const { MultiAgentCoordinator } = await import("./tools/multi-agent-coordinator.ts");
const coordinator = new MultiAgentCoordinator();
const cleanedCount = coordinator.cleanupStaleAgents();
console.log(`✓ Cleanup completed. Cleaned up ${cleanedCount} stale agent(s)`);

// Step 4: Verify the task was released
console.log("\nStep 4: Verifying task was released...");
const updatedTasksContent = readFileSync(TASKS_PATH, "utf-8");
const updatedTasksStore = JSON.parse(updatedTasksContent);
const releasedTask = updatedTasksStore.tasks.find((t: any) => t.id === testTask.id);

if (!releasedTask) {
  console.error("❌ ERROR: Test task not found!");
} else if (releasedTask.status === "pending" && !releasedTask.assigned_to) {
  console.log("✅ SUCCESS: Task was released!");
  console.log(`  Task ID: ${releasedTask.id}`);
  console.log(`  Status: ${releasedTask.status} (was: in_progress)`);
  console.log(`  Assigned to: ${releasedTask.assigned_to || "none"} (was: ${fakeAgentId})`);
  console.log(`  Notes: ${releasedTask.notes[releasedTask.notes.length - 1]}`);
} else {
  console.error("❌ ERROR: Task was not properly released!");
  console.error(`  Status: ${releasedTask.status}`);
  console.error(`  Assigned to: ${releasedTask.assigned_to}`);
}

// Cleanup: Remove test task
console.log("\nCleaning up test data...");
const finalTasksStore = JSON.parse(readFileSync(TASKS_PATH, "utf-8"));
finalTasksStore.tasks = finalTasksStore.tasks.filter((t: any) => t.id !== testTask.id);
writeFileSync(TASKS_PATH, JSON.stringify(finalTasksStore, null, 2));
console.log("✓ Test task removed");

console.log("\n✅ Test completed successfully!");
