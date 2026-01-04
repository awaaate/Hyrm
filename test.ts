#!/usr/bin/env bun
/**
 * Test Automation Framework Runner
 * 
 * Unified test runner for the plugin tools integration test suite.
 * Runs all test suites and provides comprehensive coverage reporting.
 * 
 * Usage:
 *   bun test.ts                    # Run all tests
 *   bun test.ts --suite shared     # Run specific suite
 *   bun test.ts --watch           # Watch mode
 *   bun test.ts --coverage        # With coverage
 */

import { join } from "path";
import { execSync } from "child_process";

interface TestSuite {
  name: string;
  path: string;
  description: string;
}

const TEST_SUITES: TestSuite[] = [
  {
    name: "shared-utils",
    path: "tools/shared/shared.test.ts",
    description: "Shared utility functions (JSON, time, strings, paths)",
  },
  {
    name: "plugin-tools",
    path: ".opencode/plugin/tools/tools.test.ts",
    description: "Plugin tools unit tests (agent, memory, task, quality, user-message)",
  },
  {
    name: "plugin-integration",
    path: ".opencode/plugin/tools/integration.test.ts",
    description: "Plugin tools integration tests (end-to-end workflows)",
  },
  {
    name: "orchestrator-respawn",
    path: "tools/lib/orchestrator-respawn.test.ts",
    description: "Orchestrator respawn logic validation",
  },
  {
    name: "spec-generator",
    path: "tools/lib/spec-generator.test.ts",
    description: "Spec file generator tests",
  },
];

async function runTestSuite(suite: TestSuite): Promise<boolean> {
  try {
    console.log(`\n▶ Running: ${suite.description}`);
    console.log(`  File: ${suite.path}`);
    execSync(`bun test ./${suite.path}`, {
      cwd: process.cwd(),
      stdio: "inherit",
    });
    return true;
  } catch (error) {
    console.error(`✗ ${suite.name} FAILED`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const showHelp = args.includes("--help") || args.includes("-h");
  const watchMode = args.includes("--watch");
  const suiteFilter = args.find((a) => a.startsWith("--suite="))?.split("=")[1];

  if (showHelp) {
    console.log(`
Test Automation Framework for Plugin Tools

Usage:
  bun test.ts                    Run all tests
  bun test.ts --suite <name>     Run specific test suite
  bun test.ts --watch            Watch mode (requires bun --watch)
  bun test.ts --help             Show this help

Available Test Suites:
`);
    TEST_SUITES.forEach((s) => {
      console.log(`  • ${s.name.padEnd(25)} - ${s.description}`);
    });
    return;
  }

  let suitesToRun = TEST_SUITES;
  if (suiteFilter) {
    suitesToRun = TEST_SUITES.filter((s) => s.name === suiteFilter);
    if (suitesToRun.length === 0) {
      console.error(`✗ Unknown test suite: ${suiteFilter}`);
      console.log(`Available: ${TEST_SUITES.map((s) => s.name).join(", ")}`);
      process.exit(1);
    }
  }

  console.log("╔════════════════════════════════════════════╗");
  console.log("║  Plugin Tools Test Automation Framework    ║");
  console.log("╚════════════════════════════════════════════╝");

  const results: Array<{ name: string; passed: boolean }> = [];

  for (const suite of suitesToRun) {
    const passed = await runTestSuite(suite);
    results.push({ name: suite.name, passed });
  }

  // Summary
  console.log("\n╔════════════════════════════════════════════╗");
  console.log("║  Test Summary                              ║");
  console.log("╚════════════════════════════════════════════╝\n");

  let passedCount = 0;
  let failedCount = 0;

  results.forEach(({ name, passed }) => {
    const status = passed ? "✓ PASS" : "✗ FAIL";
    console.log(`  ${status} - ${name}`);
    if (passed) passedCount++;
    else failedCount++;
  });

  console.log(`\nTotal: ${passedCount} passed, ${failedCount} failed\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
