# Task: Add shell linting and shellcheck integration to CI/CD

**Task ID**: `task_1767794428550_9fkjzy`  
**Priority**: high  
**Status**: pending  
**Complexity**: moderate  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: 2 hours  
**Assigned To**: unassigned  
**Tags**: ci-cd, quality, shell, automation

---

## Problem Statement

Current CI/CD pipeline (GitHub Actions) runs TypeScript tests but doesn't validate shell scripts. The critical heartbeat.sh syntax errors in Session 206 could have been caught earlier with shell linting.

Implement:
1. Add shellcheck to .github/workflows/test.yml
2. Run shellcheck on all shell scripts in tools/, scripts/, etc
3. Fail CI if shellcheck warnings found
4. Document shell script best practices in docs/
5. Integrate with pre-commit hooks (similar to import linting)

Benefits:
- Catch shell syntax errors before deployment (like Session 206's critical issue)
- Enforce shell script best practices (quoting, variables, etc)
- Prevent silent failures in background services
- Improve code quality for infrastructure scripts

Files affected:
- .github/workflows/test.yml (add shellcheck job)
- Pre-commit hooks (optional: add shell validation)
- docs/SHELL_SCRIPT_STANDARDS.md (new: best practices guide)

This is a preventative measure to avoid repeating shell syntax issues.

## Goals

- Complete high-priority work to unblock downstream tasks
- Design and implement solution with appropriate abstraction
- Verify changes with tests and ensure no regressions

---

## Implementation Plan

**Phase 1: Analysis**
  - Review task requirements and acceptance criteria
  - Identify dependencies and related systems
  - Plan approach and document assumptions

**Phase 2: Implementation**
  - Implement primary changes
  - Write tests for new functionality
  - Handle edge cases and error scenarios

**Phase 3: Integration & Validation**
  - Integrate with existing systems
  - Run full test suite
  - Code review and address feedback

**Phase 4: Verification & Documentation**
  - Verify changes in target environment
  - Update documentation and comments
  - Create PR/commit with clear messages

---

## Success Criteria

[ ] Code changes are clean, well-commented, and follow style guide
[ ] All tests pass (unit, integration, e2e if applicable)
[ ] No regressions in existing functionality
[ ] Feature complete and tested
[ ] Documentation updated

---

## Notes

- Update this spec as requirements become clearer
- Reference task ID in commits: task_1767794428550_9fkjzy
- Keep implementation phases realistic and reviewable

---

## History

| Date | Event |
|------|-------|
| 2026-01-07T14:00:28.550Z | Task created |
| 2026-01-07T14:00:28.554Z | Spec generated |
