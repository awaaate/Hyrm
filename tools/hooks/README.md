# Git Hooks

This directory contains git hooks that should be installed to catch issues before commit.

## Installation

To install the hooks, run:

```bash
cp tools/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

Or use the following one-liner:

```bash
ln -sf ../../tools/hooks/pre-commit .git/hooks/pre-commit
```

## Hooks

### pre-commit

**Purpose**: Catch missing imports and import-related errors before they are committed.

**What it checks**:
- Missing imports (`import/no-unresolved`) - e.g., using `readFileSync` without importing it
- Unresolved module paths
- Duplicate imports (`import/no-duplicates`)
- Other import-related ESLint errors

**Configuration**: Uses `eslint.config.js` at repository root with `eslint-plugin-import` rules.

**Example**:
```bash
# Try to commit with a missing import
echo "console.log(readFileSync('file.txt'));" > tools/test.ts
git add tools/test.ts
git commit -m "test"  # This will fail and suggest fixes
```

## ESLint Configuration

See `eslint.config.js` at the repository root for:
- Import rules configuration
- Global variables (Node.js, Bun, timers)
- TypeScript support
- Ignored directories (node_modules, dist, etc.)

## Testing the Hook

After installation, test with:

```bash
# The hook should pass with a valid TypeScript file
echo "import { readFileSync } from 'fs'; const file = readFileSync('test.txt', 'utf8');" > tools/test.ts
git add tools/test.ts
git commit -m "test: verify hook passes"  # Should succeed
```

## Troubleshooting

If the hook doesn't run:
1. Check that `.git/hooks/pre-commit` is executable: `ls -la .git/hooks/pre-commit`
2. Check that it was copied correctly: `diff tools/hooks/pre-commit .git/hooks/pre-commit`
3. Verify ESLint is installed: `npx eslint --version`

If ESLint fails on valid code:
1. Check `eslint.config.js` for the file patterns
2. Verify the TypeScript parser is installed: `npm ls @typescript-eslint/parser`
3. Run ESLint manually to see the full error: `npx eslint tools/your-file.ts`
