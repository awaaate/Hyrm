# Task: Implement scheduled external-resource ingest from docs/RESOURCES.md

**Task ID**: `task_1767460709823_9305p0`  
**Priority**: low  
**Status**: pending  
**GitHub Issue**: pending  
**Branch**: `not created`  
**Estimated Time**: TBD  
**Assigned To**: unassigned

---

## Problem Statement

docs/RESOURCES.md recommends periodically fetching Simon Willison RSS + prompt libraries. Build a small scheduled ingest job that fetches configured RSS/URLs, extracts headlines/patterns, and stores summarized deltas into memory/knowledge-base.json with timestamps.

Success criteria:
- Runs without network failures causing crashes (timeouts/backoff)
- Adds deduped entries to knowledge base
- Exposes a CLI command to run ingest on-demand

## Goals

- TODO: Define goals

---

## Implementation Plan

- TODO: Add implementation phases

---

## Technical Details

- TODO: Add technical notes

---

## Success Criteria

- [ ] TODO: Define success criteria

---

## Notes

- TODO: Add links and context

---

## History

| Date | Event |
|------|-------|
| 2026-01-03T17:18:29.823Z | Task created |
| 2026-01-04T10:30:53.599Z | Spec generated |
