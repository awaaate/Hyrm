# Self-Reflection Guide for AI Agents

A structured approach for analyzing previous sessions to improve performance and learn from experience.

## Overview

Self-reflection is critical for continuous improvement. This guide provides a framework for agents to analyze their past sessions, identify patterns, and extract actionable learnings.

## When to Perform Self-Reflection

1. **After Session Completion**: Review what was accomplished
2. **After Errors/Failures**: Understand what went wrong
3. **Periodically (Weekly)**: Review trends across multiple sessions
4. **Before Complex Tasks**: Review similar past tasks for context

## Self-Reflection Framework

### Phase 1: Session Summary Review

```bash
# Get recent session summaries
bun tools/session-summarizer.ts list --limit 10

# View specific session details
bun tools/opencode-tracker.ts view <session_id>
```

**Questions to Answer:**
- What was the primary goal of the session?
- Was the goal achieved? If not, why?
- What was the total token usage vs actual productive work?

### Phase 2: Quality Assessment Review

```bash
# Review quality scores
bun tools/quality-assessor.ts report

# Get detailed breakdown by task
bun tools/quality-assessor.ts list
```

**Quality Dimensions:**
| Dimension | Score Range | What to Look For |
|-----------|-------------|------------------|
| Completeness | 0-10 | Was all requested work finished? |
| Code Quality | 0-10 | Clean, maintainable, follows standards? |
| Documentation | 0-10 | Comments, README updates, inline docs? |
| Efficiency | 0-10 | Optimal approach? Minimal redundant work? |
| Impact | 0-10 | Value delivered to the project? |

### Phase 3: Pattern Recognition

**Success Patterns to Identify:**
- Which approaches consistently work well?
- What tool combinations are most effective?
- Which task types complete fastest?

**Failure Patterns to Identify:**
- What conditions lead to blocked tasks?
- Where does token waste occur most?
- Which assumptions often prove incorrect?

### Phase 4: Knowledge Extraction

```bash
# Extract learnings from sessions
bun tools/knowledge-extractor.ts extract

# View knowledge base
cat memory/knowledge-base.json | jq '.entries[-10:]'
```

**Categories of Knowledge:**
1. **Codebase Insights**: Structure, patterns, gotchas
2. **Tool Usage**: Best practices for specific tools
3. **Process Improvements**: Better workflows
4. **Error Prevention**: Common mistakes to avoid

## Self-Reflection Questions Template

### Task Execution Review
- [ ] Did I break down the task appropriately?
- [ ] Did I use the TodoWrite tool effectively?
- [ ] Did I verify my work before marking complete?
- [ ] Did I communicate progress clearly?

### Tool Usage Review
- [ ] Did I choose the right tools for each sub-task?
- [ ] Did I make parallel tool calls when possible?
- [ ] Did I avoid unnecessary tool calls?
- [ ] Did I handle tool errors gracefully?

### Communication Review
- [ ] Did I keep responses concise?
- [ ] Did I ask clarifying questions when needed?
- [ ] Did I provide clear summaries?
- [ ] Did I document decisions and rationale?

### Learning Review
- [ ] What new knowledge did I gain?
- [ ] What should I do differently next time?
- [ ] What patterns should be added to knowledge base?
- [ ] What documentation should be updated?

## Automated Self-Reflection Workflow

### Daily Reflection Script

```typescript
// Run at end of each session
const reflectionSteps = [
  'Review session goals vs outcomes',
  'Calculate efficiency metrics',
  'Identify top 3 learnings',
  'Update knowledge base',
  'Flag issues for orchestrator'
];
```

### Weekly Reflection Checklist

1. **Aggregate Metrics**
   - Total tasks completed
   - Average quality score
   - Token efficiency ratio
   - Error rate by category

2. **Trend Analysis**
   - Compare to previous week
   - Identify improving areas
   - Identify declining areas

3. **Action Items**
   - Document process improvements
   - Update AGENTS.md if needed
   - Create tasks for system improvements

## Reflection Output Template

```markdown
## Session [ID] Reflection

**Date**: YYYY-MM-DD
**Duration**: X hours/minutes
**Tasks Completed**: N of M

### Accomplishments
- [List key accomplishments]

### Challenges Faced
- [List challenges and how they were addressed]

### Learnings
1. [Key learning 1]
2. [Key learning 2]

### Efficiency Analysis
- Token usage: X
- Productive ratio: Y%
- Unnecessary tool calls: Z

### Action Items
- [ ] [Improvement 1]
- [ ] [Improvement 2]

### Knowledge Updates
- Added to knowledge base: [topics]
```

## Integration with Memory System

### Storing Reflections

Reflections are stored in:
- `memory/sessions/<session_id>/reflection.md` - Per-session reflections
- `memory/knowledge-base.json` - Extracted learnings
- `memory/working.md` - Immediate context

### Retrieving Past Reflections

```bash
# Search for specific topics in reflections
bun tools/knowledge-deduplicator.ts search "error handling"

# Get reflection from specific session
cat memory/sessions/ses_XXXX/reflection.md
```

## Best Practices

1. **Be Honest**: Don't downplay failures or overstate successes
2. **Be Specific**: Use concrete examples, not vague generalizations
3. **Be Actionable**: Every insight should lead to improvement
4. **Be Consistent**: Regular reflection builds better patterns
5. **Be Brief**: Focus on signal, not noise

## Common Anti-Patterns to Avoid

| Anti-Pattern | Better Approach |
|--------------|-----------------|
| Skipping reflection when busy | Schedule it, make it quick |
| Only reflecting on failures | Also analyze what worked |
| Vague learnings ("be better") | Specific actions ("use TodoWrite for 3+ step tasks") |
| Not documenting learnings | Always update knowledge base |
| Repeating same mistakes | Review past reflections before similar tasks |

## Metrics to Track

1. **Task Completion Rate**: % of tasks fully completed
2. **Quality Score Average**: Mean of all quality dimensions
3. **Token Efficiency**: Useful work / total tokens
4. **Error Recovery Time**: How long to recover from failures
5. **Knowledge Growth**: New entries added to knowledge base
