#!/usr/bin/env bun
/**
 * Auto-Documentation Generator for CLI Tools
 * 
 * Scans all CLI tools in the workspace and generates comprehensive documentation.
 * Extracts commands, usage patterns, and descriptions from:
 * - Comment headers
 * - CLI help text
 * - Command switch statements
 * 
 * Output: docs/TOOLS_REFERENCE.md
 * 
 * Usage:
 *   bun tools/generate-tools-docs.ts
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";

interface CLITool {
  name: string;
  path: string;
  category: string;
  description: string;
  commands: Record<string, string>;
  usage: string;
}

const TOOLS_DIR = join(process.cwd(), "tools");
const OUTPUT_PATH = join(process.cwd(), "docs/TOOLS_REFERENCE.md");

const CATEGORIES: Record<string, string> = {
  "cli/": "Unified CLI Tools",
  "ui/": "Interactive UIs",
  "lib/": "Libraries",
  "": "Legacy CLIs (root level)",
};

/**
 * Extract description from file header comments
 */
function extractDescription(content: string): string {
  const headerMatch = content.match(/\/\*\*\s*\n([\s\S]*?)\*\//);
  if (!headerMatch) return "";
  
  const lines = headerMatch[1]
    .split("\n")
    .map(l => l.replace(/^\s*\*\s?/, "").trim())
    .filter(l => !l.startsWith("Usage:") && !l.startsWith("Commands:") && l.length > 0);
  
  return lines.slice(0, 3).join(" ").trim();
}

/**
 * Extract usage pattern from comments or code
 */
function extractUsage(content: string, fileName: string): string {
  // Look for Usage: in comments
  const usageMatch = content.match(/Usage:\s*\n\s*\*\s*(.*)/);
  if (usageMatch) {
    return usageMatch[1].trim().replace(/tools\//, "bun tools/");
  }
  
  // Default pattern
  return `bun tools/${fileName} <command>`;
}

/**
 * Extract commands from switch/case or if/else CLI parsing
 */
function extractCommands(content: string): Record<string, string> {
  const commands: Record<string, string> = {};
  
  // Match case statements: case 'command': or case "command":
  const caseMatches = content.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g);
  for (const match of caseMatches) {
    const cmd = match[1];
    if (cmd === "help" || cmd === "--help" || cmd === "-h" || cmd === "default") continue;
    
    // Try to find description nearby (look for comment or console.log before the case)
    const caseIndex = match.index || 0;
    const before = content.slice(Math.max(0, caseIndex - 500), caseIndex);
    const commentMatch = before.match(/\/\/\s*(.+)$/);
    
    commands[cmd] = commentMatch ? commentMatch[1].trim() : "";
  }
  
  // Match function calls in help text: '  command      description'
  const helpMatches = content.matchAll(/console\.log\(['"]  (\w+)\s+(-|–)\s*(.+?)['"]\)/g);
  for (const match of helpMatches) {
    const [, cmd, , desc] = match;
    if (cmd && !commands[cmd]) {
      commands[cmd] = desc.trim();
    }
  }
  
  // Match help text with aligned descriptions
  const alignedMatches = content.matchAll(/['"]  ([\w:]+)\s{2,}(.+?)['"]/g);
  for (const match of alignedMatches) {
    const [, cmd, desc] = match;
    if (cmd && !commands[cmd]) {
      commands[cmd] = desc.trim();
    }
  }
  
  return commands;
}

/**
 * Scan a directory and extract tool information
 */
function scanDirectory(dir: string, category: string = ""): CLITool[] {
  const tools: CLITool[] = [];
  const fullPath = join(TOOLS_DIR, category);
  
  try {
    const entries = readdirSync(fullPath);
    
    for (const entry of entries) {
      const entryPath = join(fullPath, entry);
      const stat = statSync(entryPath);
      
      // Skip directories, node_modules, and non-TS files
      if (stat.isDirectory() || entry === "node_modules" || !entry.endsWith(".ts")) {
        continue;
      }
      
      // Skip test files and non-executable files
      if (entry.endsWith(".test.ts") || entry.startsWith("_")) {
        continue;
      }
      
      const content = readFileSync(entryPath, "utf-8");
      
      // Check if it's a CLI tool (has shebang or process.argv usage)
      const isCLI = content.includes("#!/usr/bin/env bun") || 
                    content.includes("process.argv") ||
                    content.includes("if (import.meta.main)");
      
      if (!isCLI && category !== "lib/") continue;
      
      const name = entry.replace(/\.ts$/, "");
      const description = extractDescription(content);
      const commands = extractCommands(content);
      const usage = extractUsage(content, category ? `${category}${entry}` : entry);
      
      tools.push({
        name,
        path: `tools/${category}${entry}`,
        category: CATEGORIES[category] || category,
        description,
        commands,
        usage,
      });
    }
  } catch (error) {
    console.error(`Error scanning ${fullPath}:`, error);
  }
  
  return tools;
}

/**
 * Generate markdown documentation
 */
function generateMarkdown(tools: CLITool[]): string {
  let md = `# CLI Tools Reference

Auto-generated documentation for all CLI tools in the workspace.

**Last Updated**: ${new Date().toISOString()}

## Quick Reference

| Tool | Category | Description |
|------|----------|-------------|
`;

  // Add quick reference table
  tools.forEach(tool => {
    const desc = tool.description.slice(0, 80) + (tool.description.length > 80 ? "..." : "");
    md += `| \`${tool.name}\` | ${tool.category} | ${desc} |\n`;
  });

  md += "\n---\n\n";

  // Group tools by category
  const byCategory: Record<string, CLITool[]> = {};
  tools.forEach(tool => {
    if (!byCategory[tool.category]) {
      byCategory[tool.category] = [];
    }
    byCategory[tool.category].push(tool);
  });

  // Generate detailed sections
  for (const [category, categoryTools] of Object.entries(byCategory)) {
    md += `## ${category}\n\n`;
    
    categoryTools.forEach(tool => {
      md += `### \`${tool.name}\`\n\n`;
      
      if (tool.description) {
        md += `${tool.description}\n\n`;
      }
      
      md += `**Usage**: \`${tool.usage}\`\n\n`;
      
      if (Object.keys(tool.commands).length > 0) {
        md += `**Commands**:\n\n`;
        for (const [cmd, desc] of Object.entries(tool.commands)) {
          md += `- \`${cmd}\``;
          if (desc) {
            md += ` - ${desc}`;
          }
          md += "\n";
        }
        md += "\n";
      }
      
      md += `**File**: [\`${tool.path}\`](../${tool.path})\n\n`;
      md += "---\n\n";
    });
  }

  // Add usage notes
  md += `## Usage Notes

### Running Tools

All tools use \`bun\` as the runtime:

\`\`\`bash
bun tools/<tool-name>.ts [command] [args]
\`\`\`

### Common Patterns

**Check help**:
\`\`\`bash
bun tools/<tool>.ts --help
\`\`\`

**Run with arguments**:
\`\`\`bash
bun tools/task-manager.ts create "Task title" high
\`\`\`

**Pipe output**:
\`\`\`bash
bun tools/cli.ts status | grep -i error
\`\`\`

### For Agents

Agents can use these tools via the \`bash\` tool or by reading this documentation.

**Example agent usage**:
\`\`\`typescript
// Check system status
await bash("bun tools/cli.ts status");

// Create a task
await bash('bun tools/task-manager.ts create "Fix bug" high');

// View tasks
await bash("bun tools/task-manager.ts summary");
\`\`\`

## See Also

- [AGENTS.md](../AGENTS.md) - Multi-agent system documentation
- [tools/ui/README.md](../tools/ui/README.md) - Interactive UI documentation
- [opencode.json](../opencode.json) - OpenCode configuration
`;

  return md;
}

/**
 * Main
 */
function main() {
  console.log("Scanning tools directory...\n");
  
  const allTools: CLITool[] = [
    ...scanDirectory("", ""),           // Root level
    ...scanDirectory("cli", "cli/"),    // CLI tools
    ...scanDirectory("ui", "ui/"),      // UI tools
    ...scanDirectory("lib", "lib/"),    // Libraries
  ];
  
  console.log(`Found ${allTools.length} tools:\n`);
  allTools.forEach(t => {
    console.log(`  - ${t.name} (${t.category})`);
  });
  
  console.log(`\nGenerating documentation...`);
  const markdown = generateMarkdown(allTools);
  
  writeFileSync(OUTPUT_PATH, markdown, "utf-8");
  console.log(`\n✓ Documentation written to ${OUTPUT_PATH}`);
  console.log(`  ${markdown.split("\n").length} lines, ${markdown.length} bytes\n`);
}

main();
