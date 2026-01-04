# Plugin Tools Test Automation Framework

This document describes the comprehensive test automation framework for the OpenCode plugin tools system.

## Overview

The test framework provides automated testing for all plugin tools including:
- **Agent tools** (registration, messaging, status)
- **Memory tools** (status, search, update)
- **Task tools** (create, list, update, claim, next, schedule)
- **Quality tools** (assess, report)
- **User message tools** (read, mark as read)
- **Recovery tools** (checkpoint save/load)
- **Shared utilities** (JSON, time formatting, strings, paths)

## Test Suites

### 1. Shared Utilities Tests (`tools/shared/shared.test.ts`)
- **114 tests** covering core utility functions
- Tests JSON I/O (readJson, writeJson, readJsonl, appendJsonl, safeJsonParse)
- Tests time utilities (formatDuration, formatTime, formatTimeAgo, etc.)
- Tests string utilities (truncate, padLeft, padRight, titleCase, slugify, etc.)
- Tests path utilities (getMemoryPath, getBackupPath, ensureDir, getSessionPath, etc.)
- Run: `bun test ./tools/shared/shared.test.ts`

### 2. Plugin Tools Unit Tests (`​.opencode/plugin/tools/tools.test.ts`)
- **63 tests** covering individual tool functions
- Memory tools tests: status, search, update operations
- Task tools tests: create, list, update, claim, next, schedule
- Quality tools tests: assess, report, score calculations
- User message tools tests: read, mark as read
- Agent tools tests: registration, status, messaging
- Edge cases: corrupted JSON, concurrent operations, malformed data
- Run: `bun test ./.opencode/plugin/tools/tools.test.ts`

### 3. Plugin Tools Integration Tests (`​.opencode/plugin/tools/integration.test.ts`)
- **24 tests** validating end-to-end workflows
- Real filesystem operations with actual memory directories
- JSON parsing edge cases with corrupted/malformed data
- Atomic operations and concurrent access patterns
- Recovery from corrupted state files
- Full workflows across multiple tool modules
- Run: `bun test ./.opencode/plugin/tools/integration.test.ts`

### 4. Orchestrator Respawn Tests (`​tools/lib/orchestrator-respawn.test.ts`)
- **1 test** validating Bun.spawn stdio configuration
- Ensures respawn processes use correct stdio setup
- Regression guard for spawn argument validation
- Run: `bun test ./tools/lib/orchestrator-respawn.test.ts`

### 5. Spec Generator Tests (`​tools/lib/spec-generator.test.ts`)
- **4 tests** for spec file generation and validation
- Tests spec file reading, writing, and parsing
- Tests GitHub issue line integration
- Run: `bun test ./tools/lib/spec-generator.test.ts`

## Running Tests

### Quick Start

Run all tests:
```bash
npm test
# or directly
bun test.ts
```

### Run Specific Test Suite

```bash
# Using npm script
npm run test:suite shared-utils
npm run test:suite plugin-tools
npm run test:suite plugin-integration

# Using bun directly
bun test.ts --suite shared-utils
bun test.ts --suite plugin-tools
bun test.ts --suite plugin-integration
bun test.ts --suite orchestrator-respawn
bun test.ts --suite spec-generator
```

### Run Individual Test File

```bash
bun test ./tools/shared/shared.test.ts
bun test ./.opencode/plugin/tools/tools.test.ts
bun test ./.opencode/plugin/tools/integration.test.ts
bun test ./tools/lib/orchestrator-respawn.test.ts
bun test ./tools/lib/spec-generator.test.ts
```

### Watch Mode

```bash
npm run test:watch
# or directly
bun --watch test.ts
```

### Help

```bash
bun test.ts --help
```

## Test Statistics

- **Total Tests**: 206
- **Shared Utils**: 114 tests
- **Plugin Tools**: 63 tests
- **Integration Tests**: 24 tests
- **Orchestrator Respawn**: 1 test
- **Spec Generator**: 4 tests
- **Pass Rate**: 100% (0 failures)

## Test Framework Details

### Architecture

The test framework uses **Bun's built-in testing** library with:
- `describe()` - Group related tests
- `test()` - Individual test cases
- `expect()` - Assertions
- `beforeAll()` / `afterAll()` - Suite lifecycle
- `beforeEach()` / `afterEach()` - Test lifecycle

### Test Isolation

Tests use isolated temporary directories to avoid conflicts:
- Unit tests: `.test-memory` directory (cleaned per test)
- Integration tests: `.integration-test` directory (fresh per suite)
- No tests modify real `memory/` directory

### Mocking

Tests create mock objects for:
- File systems (temporary directories)
- Logging functions (captured in arrays)
- Context objects (with custom paths)

### Error Handling

Tests validate graceful error handling:
- Corrupted JSON files → return defaults
- Missing files → use fallback values
- Concurrent file access → file locks prevent conflicts
- Invalid operations → appropriate error messages

## Coverage Areas

### Agent Tools
- Agent registration with role assignment
- Agent status queries and updates
- Message sending and receiving
- Handoff control

### Memory Tools
- System state persistence
- Memory search across knowledge base
- Memory updates and state transitions
- Metrics tracking

### Task Tools
- Task creation with metadata
- Task listing with status filtering
- Task updates and status changes
- Task claiming with atomic semantics
- Task scheduling and prioritization

### Quality Tools
- Task quality assessment
- Quality report generation
- Score calculations with weighting
- Performance metrics

### User Message Tools
- User message reading
- Message marking as read
- Message filtering and pagination

### Shared Utilities
- JSON file I/O with safe parsing
- JSONL (newline-delimited JSON) operations
- Time formatting and calculations
- String manipulation utilities
- File path utilities
- Directory management

## Adding New Tests

### Naming Convention

Test files should follow the pattern:
- Unit tests: `*.test.ts` or `*.spec.ts`
- Integration tests: `*integration.test.ts` or `*e2e.spec.ts`

### Test Structure

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("Feature Name", () => {
  let resource: any;

  beforeEach(() => {
    // Setup before each test
    resource = setupResource();
  });

  afterEach(() => {
    // Cleanup after each test
    cleanupResource(resource);
  });

  test("should do something", () => {
    const result = resource.doSomething();
    expect(result).toBe(expectedValue);
  });

  test("should handle error cases", () => {
    expect(() => resource.throwError()).toThrow();
  });
});
```

### Adding to Test Framework

1. Create test file with `.test.ts` or `.spec.ts` suffix
2. Add test suite to `TEST_SUITES` array in `test.ts`
3. Run `npm test` to verify

## Continuous Integration

The test framework is designed for CI/CD integration:

```bash
# Exit code 0 on success, 1 on failure
npm test
if [ $? -eq 0 ]; then
  echo "All tests passed!"
else
  echo "Tests failed!"
  exit 1
fi
```

## Troubleshooting

### Tests Won't Run
- Ensure Bun is installed: `bun --version`
- Check file paths are relative to workspace root
- Verify test files have `.test.ts` or `.spec.ts` in name

### Flaky Tests
- Check for timing issues (use fixed delays if needed)
- Ensure cleanup happens in `afterEach()` hooks
- Verify no cross-test file contamination

### Performance
- Tests run in ~500ms total
- If slow, check for missing `afterEach()` cleanup
- Consider running suites in parallel

## Historical Context

This framework replaces the ad-hoc POC testing pattern:
- **Before**: Manual test tasks (v1, v2, v3, v4 pattern)
- **After**: Comprehensive automated test suite
- **Benefits**: 
  - Repeatable, deterministic tests
  - CI/CD ready
  - Faster feedback loops
  - Better coverage tracking

## Next Steps

1. ✅ Create test framework with Bun
2. ✅ Write 206 comprehensive tests
3. ✅ Validate all edge cases and error scenarios
4. ✅ Document framework and running instructions
5. 🎯 Integrate into CI/CD pipeline
6. 🎯 Monitor coverage metrics over time

## Related Documentation

- [Plugin System Architecture](./docs/OPENCODE_ARCHITECTURE.md)
- [Plugin Tools Reference](./docs/TOOLS_REFERENCE.md)
- [Plugin Index](./​.opencode/plugin/index.ts)
