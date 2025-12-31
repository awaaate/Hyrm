import { readdirSync, statSync, readFileSync } from 'fs';
import { join } from 'path';

// Estimate tokens: ~4 chars per token on average
const estimateTokens = (text: string) => Math.ceil(text.length / 4);

interface FileAnalysis {
  path: string;
  bytes: number;
  tokens: number;
  category: string;
}

const analyzeDirectory = (dir: string, prefix = ''): FileAnalysis[] => {
  const results: FileAnalysis[] = [];
  
  try {
    const items = readdirSync(dir);
    
    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        results.push(...analyzeDirectory(fullPath, `${prefix}${item}/`));
      } else if (stat.isFile()) {
        let category = 'other';
        if (item.endsWith('.json')) category = 'data';
        if (item.endsWith('.md')) category = 'documentation';
        if (item.endsWith('.ts')) category = 'code';
        if (item.endsWith('.sh')) category = 'scripts';
        
        const content = readFileSync(fullPath, 'utf-8');
        
        results.push({
          path: `${prefix}${item}`,
          bytes: stat.size,
          tokens: estimateTokens(content),
          category
        });
      }
    }
  } catch (err) {
    console.error(`Error analyzing ${dir}:`, err);
  }
  
  return results;
};

// Analyze memory directory
const memoryDir = '/app/workspace/memory';
const files = analyzeDirectory(memoryDir);

// Sort by token count
files.sort((a, b) => b.tokens - a.tokens);

console.log('=== TOKEN USAGE ANALYSIS ===\n');

// Category totals
const byCategory: Record<string, { files: number; tokens: number; bytes: number }> = {};
for (const file of files) {
  if (!byCategory[file.category]) {
    byCategory[file.category] = { files: 0, tokens: 0, bytes: 0 };
  }
  byCategory[file.category].files++;
  byCategory[file.category].tokens += file.tokens;
  byCategory[file.category].bytes += file.bytes;
}

console.log('BY CATEGORY:');
for (const [cat, stats] of Object.entries(byCategory).sort((a, b) => b[1].tokens - a[1].tokens)) {
  console.log(`  ${cat.padEnd(15)} ${stats.files.toString().padStart(3)} files  ${stats.tokens.toLocaleString().padStart(8)} tokens  ${(stats.bytes / 1024).toFixed(1).padStart(8)} KB`);
}

console.log('\n\nTOP 15 FILES BY TOKEN COUNT:');
for (const file of files.slice(0, 15)) {
  const pct = ((file.tokens / files.reduce((sum, f) => sum + f.tokens, 0)) * 100).toFixed(1);
  console.log(`  ${file.tokens.toLocaleString().padStart(8)} (${pct.padStart(5)}%)  ${file.path}`);
}

// Core memory files analysis (only files loaded on boot)
// Note: sessions.jsonl and DASHBOARD.md are NOT loaded on boot - they're reference files
const coreFiles = ['state.json', 'working.md', 'metrics.json'];
const coreTokens = files.filter(f => coreFiles.some(cf => f.path.includes(cf))).reduce((sum, f) => sum + f.tokens, 0);

console.log('\n\nCORE MEMORY FOOTPRINT:');
console.log(`  Essential files: ${coreTokens.toLocaleString()} tokens`);
console.log(`  Percentage of 200k context: ${((coreTokens / 200000) * 100).toFixed(2)}%`);

// Identify optimization opportunities
console.log('\n\nOPTIMIZATION OPPORTUNITIES:');

const searchIndex = files.find(f => f.path.includes('search-index.json'));
if (searchIndex && searchIndex.tokens > 5000) {
  console.log(`  ⚠️  search-index.json is ${searchIndex.tokens.toLocaleString()} tokens - should be loaded on-demand only`);
}

const largePlans = files.filter(f => f.path.includes('plans/') && f.tokens > 100);
if (largePlans.length > 0) {
  const totalPlanTokens = largePlans.reduce((sum, f) => sum + f.tokens, 0);
  console.log(`  ⚠️  ${largePlans.length} plan files totaling ${totalPlanTokens.toLocaleString()} tokens - archive completed plans`);
}

const codeFiles = files.filter(f => f.category === 'code');
const totalCodeTokens = codeFiles.reduce((sum, f) => sum + f.tokens, 0);
console.log(`  ℹ️  ${codeFiles.length} TypeScript files totaling ${totalCodeTokens.toLocaleString()} tokens - these are tools, not loaded into context`);

console.log('\n\nRECOMMENDATIONS:');
console.log('  1. Move search-index.json to a separate cache directory (load only when using search)');
console.log('  2. Archive completed plan files to reduce clutter');
console.log('  3. Implement lazy loading for knowledge base (load on keyword match only)');
console.log('  4. Consider compressing archive.md further if it grows > 3000 tokens');

const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);
console.log(`\n\nTOTAL: ${files.length} files, ${totalTokens.toLocaleString()} tokens, ${(files.reduce((sum, f) => sum + f.bytes, 0) / 1024).toFixed(1)} KB`);
