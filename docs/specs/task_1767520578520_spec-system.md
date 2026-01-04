# Task: Create Spec System for All Tasks

**Task ID**: `task_1767520578520_78t9d5`  
**Priority**: Critical  
**Estimated Time**: 2-3 hours  
**Status**: Pending  
**Depends On**: `task_1767520273725_sckp83` (Auto GitHub issues), `task_1767520395465_2o5xy7` (Tools reorganization)

---

## Problem Statement

1. **Tasks lack detailed specifications** - Only title and brief description
2. **No standard format** - Each task documented differently
3. **Not linked to GitHub** - Specs exist locally but not synced with issues
4. **Hard to track** - No clear place to find task details

## Goals

1. Every task gets a spec file: `docs/specs/task_<id>_<slug>.md`
2. Spec content is the same as GitHub issue body
3. Bidirectional sync: local spec ↔ GitHub issue
4. Template for consistent spec format
5. Auto-generate spec on task creation

---

## Spec Template

```markdown
# Task: <Title>

**Task ID**: `<task_id>`  
**Priority**: <priority>  
**Status**: <status>  
**GitHub Issue**: #<issue_number> (auto-linked)  
**Branch**: `task/<short_id>-<slug>` (if created)  
**Estimated Time**: <hours>  
**Assigned To**: <agent_id or "unassigned">

---

## Problem Statement

<What problem does this solve? Why is it needed?>

## Goals

<Bulleted list of what success looks like>

---

## Implementation Plan

### Phase 1: <Name>
<Steps>

### Phase 2: <Name>
<Steps>

---

## Technical Details

<Code snippets, file paths, API changes, etc.>

---

## Success Criteria

- [ ] <Criterion 1>
- [ ] <Criterion 2>

---

## Notes

<Additional context, links, references>

---

## History

| Date | Event |
|------|-------|
| <created_at> | Task created |
| <date> | Spec created |
| <date> | GitHub issue #N created |
| <date> | Assigned to <agent> |
| <date> | Status changed to <status> |
```

---

## Implementation Plan

### Phase 1: Spec Template & Generator (1 hour)

Create `tools/lib/spec-generator.ts`:

```typescript
interface SpecOptions {
  task: Task;
  githubIssue?: { number: number; url: string };
  branch?: string;
}

function generateSpec(options: SpecOptions): string {
  const { task, githubIssue, branch } = options;
  const slug = slugify(task.title);
  
  return `# Task: ${task.title}

**Task ID**: \`${task.id}\`
**Priority**: ${task.priority}
**Status**: ${task.status}
**GitHub Issue**: ${githubIssue ? `#${githubIssue.number}` : 'pending'}
**Branch**: ${branch || 'not created'}
**Estimated Time**: ${task.estimated_hours || 'TBD'}

---

## Problem Statement

${task.description || 'TODO: Add problem statement'}

## Goals

- TODO: Define goals

---

## Implementation Plan

TODO: Add implementation phases

---

## Success Criteria

- [ ] TODO: Define success criteria

---

## History

| Date | Event |
|------|-------|
| ${task.created_at} | Task created |
| ${new Date().toISOString()} | Spec generated |
`;
}

function getSpecPath(taskId: string, title: string): string {
  const slug = slugify(title).slice(0, 30);
  return `docs/specs/task_${taskId.split('_')[1]}_${slug}.md`;
}
```

### Phase 2: Integrate with Task Manager (30 min)

Modify `task-manager.ts` `create()` method:

```typescript
create(options: CreateOptions): Task {
  const task = /* existing creation logic */;
  
  // Auto-generate spec file
  const specPath = getSpecPath(task.id, task.title);
  const specContent = generateSpec({ task });
  writeFileSync(specPath, specContent);
  
  // Store spec path in task
  task.spec_file = specPath;
  
  this.saveStore();
  return task;
}
```

### Phase 3: GitHub Issue Sync (1 hour)

When creating GitHub issue, use spec content as body:

```typescript
async createGitHubIssue(taskId: string): Promise<GitHubResult> {
  const task = this.getById(taskId);
  
  // Read spec file if exists, otherwise generate
  let body: string;
  if (task.spec_file && existsSync(task.spec_file)) {
    body = readFileSync(task.spec_file, 'utf-8');
  } else {
    body = generateSpec({ task });
  }
  
  const result = await gh('issue', 'create', 
    '--title', task.title,
    '--body', body,
    '--label', task.priority
  );
  
  if (result.success) {
    // Update spec with issue link
    updateSpecWithIssue(task.spec_file, result.issueNumber, result.issueUrl);
    
    // Store in task
    task.github_issue = { number: result.issueNumber, url: result.issueUrl };
    this.saveStore();
  }
  
  return result;
}
```

### Phase 4: CLI Commands (30 min)

Add to task CLI:

```bash
# Generate/regenerate spec for existing task
bun tools/cli/task.ts spec <task_id>

# View spec
bun tools/cli/task.ts spec:view <task_id>

# Sync spec to GitHub issue (update issue body)
bun tools/cli/task.ts spec:sync <task_id>
```

### Phase 5: Backfill Existing Tasks (30 min)

Create migration script:

```typescript
// tools/migrations/backfill-specs.ts
const tm = new TaskManager();
const tasks = tm.list('all');

for (const task of tasks) {
  if (!task.spec_file || !existsSync(task.spec_file)) {
    const specPath = getSpecPath(task.id, task.title);
    const spec = generateSpec({ task });
    writeFileSync(specPath, spec);
    tm.update(task.id, { spec_file: specPath });
    console.log(`Generated spec: ${specPath}`);
  }
}
```

---

## File Structure

```
docs/
├── specs/
│   ├── README.md                           # Index of all specs
│   ├── task_1767520395465_tools-reorg.md   # Example spec
│   ├── task_1767520578520_spec-system.md   # This spec
│   └── ...
│
tools/
├── lib/
│   └── spec-generator.ts                   # Spec generation logic
│
└── cli/
    └── task.ts                             # spec, spec:view, spec:sync commands
```

---

## Success Criteria

- [ ] Every new task auto-generates a spec file in `docs/specs/`
- [ ] Spec path stored in task object (`task.spec_file`)
- [ ] GitHub issues use spec content as body
- [ ] `bun tools/cli/task.ts spec <id>` generates/views spec
- [ ] Existing tasks backfilled with specs
- [ ] `docs/specs/README.md` auto-generated index

---

## Integration Points

1. **Task Creation** → Auto-generate spec
2. **GitHub Issue Creation** → Use spec as issue body
3. **Task Update** → Option to sync changes to spec/issue
4. **Agent Workflow** → Read spec before starting work

---

## Future Enhancements

- Spec versioning (track changes over time)
- PR templates that reference spec
- Auto-close issue when task completed
- Spec diff when updating GitHub issue
