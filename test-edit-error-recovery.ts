/**
 * Test script for Edit Error Recovery hook
 * 
 * This tests the detectEditError function logic to ensure it correctly
 * identifies Edit tool errors and provides appropriate reminders.
 */

// Simulate the detectEditError function
const detectEditError = (output: any): string | null => {
  if (!output.output || typeof output.output !== "string") return null;
  
  const errorText = output.output.toLowerCase();
  
  if (errorText.includes("oldstring not found")) {
    return `⚠️ EDIT ERROR DETECTED - oldString not found in file

CRITICAL REMINDERS:
1. Use Read tool FIRST to verify exact indentation and whitespace
2. Line numbers in Read output are ONLY for reference - DO NOT include them in oldString
3. Match exact whitespace (spaces vs tabs) as shown after the line number prefix
4. Consider using larger context (more surrounding lines) to make match unique

Example: If Read shows:
  123\t    function foo() {
The actual content is "    function foo() {" (4 spaces), NOT "123    function foo()".`;
  }
  
  if (errorText.includes("oldstring found multiple times")) {
    return `⚠️ EDIT ERROR DETECTED - oldString found multiple times

CRITICAL REMINDERS:
1. Provide MORE surrounding context to make the match unique
2. Include additional lines before/after the target change
3. Use Read tool to verify the exact unique context around your target
4. Alternatively, use replaceAll=true if you want to replace ALL occurrences

The oldString you provided matches multiple locations in the file. Expand it with unique surrounding code.`;
  }
  
  if (errorText.includes("must be different")) {
    return `⚠️ EDIT ERROR DETECTED - newString must be different from oldString

REMINDER: oldString and newString cannot be identical. Check your edit parameters.`;
  }
  
  return null;
};

// Test cases
const tests = [
  {
    name: "oldString not found error",
    output: { output: "Error: oldString not found in content" },
    shouldMatch: true,
  },
  {
    name: "oldString found multiple times error",
    output: { output: "Error: oldString found multiple times and requires more code context" },
    shouldMatch: true,
  },
  {
    name: "must be different error",
    output: { output: "Error: newString must be different from oldString" },
    shouldMatch: true,
  },
  {
    name: "successful edit",
    output: { output: "File edited successfully" },
    shouldMatch: false,
  },
  {
    name: "null output",
    output: { output: null },
    shouldMatch: false,
  },
];

console.log("🧪 Testing Edit Error Recovery Detection\n");

let passed = 0;
let failed = 0;

for (const test of tests) {
  const result = detectEditError(test.output);
  const matched = result !== null;
  
  if (matched === test.shouldMatch) {
    console.log(`✅ PASS: ${test.name}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${test.name}`);
    console.log(`   Expected: ${test.shouldMatch ? "match" : "no match"}`);
    console.log(`   Got: ${matched ? "match" : "no match"}`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed === 0) {
  console.log("✅ All tests passed!");
  process.exit(0);
} else {
  console.log("❌ Some tests failed!");
  process.exit(1);
}
