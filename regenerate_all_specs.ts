import { readJson, writeJson } from './tools/shared/json-utils';
import { PATHS } from './tools/shared/paths';
import type { Task, TaskStore } from './tools/shared/types';
import { 
  ensureTaskSpecFile, 
  updateSpecsIndex,
} from './tools/lib/spec-generator';

// Read all tasks
const store = readJson<TaskStore>(PATHS.tasks, {
  version: '1.0',
  tasks: [],
  completed_count: 0,
  last_updated: new Date().toISOString()
});

let regenerated = 0;

console.log(`\n🔄 Regenerating ${store.tasks.length} specs with new improvements...\n`);

for (const task of store.tasks) {
  // Force regenerate all specs
  const result = ensureTaskSpecFile(task, { overwrite: true });
  regenerated++;
  
  if (regenerated % 50 === 0) {
    console.log(`✓ Regenerated ${regenerated}/${store.tasks.length}`);
  }
}

// Update specs index
updateSpecsIndex();

console.log('');
console.log(`✅ Regenerated ${regenerated} specs with improved content`);
console.log(`   - Auto-extracted problem statements`);
console.log(`   - Generated meaningful goals`);
console.log(`   - Created implementation phases`);
console.log(`   - Added success criteria`);
