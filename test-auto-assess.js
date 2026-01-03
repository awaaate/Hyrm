// Simple test to check the auto-assessment logic
const { readFileSync } = require('fs');
const { join } = require('path');

console.log('Testing auto-assessment logic...');

// Check if the test task was processed correctly
try {
  const tasksPath = join(__dirname, 'memory', 'tasks.json');
  const qualityPath = join(__dirname, 'memory', 'quality-assessments.json');
  
  const tasks = JSON.parse(readFileSync(tasksPath, 'utf-8'));
  const testTask = tasks.tasks.find(t => t.id === 'task_1767448718476_py1yku');
  
  console.log('Test task:', JSON.stringify(testTask, null, 2));
  
  // Check quality assessments
  const quality = JSON.parse(readFileSync(qualityPath, 'utf-8'));
  const testAssessment = quality.assessments.find(a => a.task_id === 'task_1767448718476_py1yku');
  
  console.log('Test assessment:', JSON.stringify(testAssessment, null, 2));
  
} catch (error) {
  console.error('Error:', error.message);
}