#!/usr/bin/env bun
/**
 * Knowledge Extractor - Automatically extracts insights from sessions
 * 
 * This tool analyzes OpenCode session data and generates knowledge articles
 * 
 * Usage:
 *   bun memory/extractor.ts analyze [session_id]  # Analyze specific session
 *   bun memory/extractor.ts extract                # Extract from recent sessions
 *   bun memory/extractor.ts generate [topic]       # Generate knowledge article
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const OPENCODE_STORAGE = join(process.env.HOME || '/root', '.local/share/opencode/storage');
const SESSION_DIR = join(OPENCODE_STORAGE, 'session/global');
const MESSAGE_DIR = join(OPENCODE_STORAGE, 'message');
const PART_DIR = join(OPENCODE_STORAGE, 'part');
const KNOWLEDGE_DIR = '/app/workspace/memory/knowledge';
const SESSIONS_FILE = '/app/workspace/memory/sessions.jsonl';

interface SessionMetadata {
  id: string;
  version: string;
  projectID: string;
  directory: string;
  title: string;
  time: {
    created: number;
    updated: number;
  };
  summary: {
    additions: number;
    deletions: number;
    files: number;
  };
}

interface MessagePart {
  type: string;
  text?: string;
  content?: any;
  tool_use_id?: string;
  name?: string;
}

interface Message {
  id: string;
  sessionID: string;
  role: string;
  time: {
    created: number;
  };
  summary: {
    title: string;
    diffs: any[];
  };
}

interface ExtractedInsight {
  type: 'discovery' | 'pattern' | 'decision' | 'optimization' | 'error';
  content: string;
  context?: string;
  timestamp: number;
  session_id: string;
}

interface KnowledgeArticle {
  title: string;
  category: string;
  insights: ExtractedInsight[];
  created: string;
  updated: string;
  tags: string[];
}

// Utility functions
function loadJSON<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, 'utf-8'));
}

function saveJSON<T>(filepath: string, data: T): void {
  writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function loadText(filepath: string): string {
  return readFileSync(filepath, 'utf-8');
}

function appendLine(filepath: string, line: string): void {
  const content = existsSync(filepath) ? readFileSync(filepath, 'utf-8') : '';
  writeFileSync(filepath, content + line + '\n');
}

// Session analysis
function listSessions(): SessionMetadata[] {
  if (!existsSync(SESSION_DIR)) {
    console.error('OpenCode session directory not found');
    return [];
  }

  const files = readdirSync(SESSION_DIR).filter(f => f.endsWith('.json'));
  const sessions: SessionMetadata[] = [];

  for (const file of files) {
    try {
      const session = loadJSON<SessionMetadata>(join(SESSION_DIR, file));
      sessions.push(session);
    } catch (e) {
      console.error(`Failed to load session ${file}:`, e);
    }
  }

  // Sort by creation time (newest first)
  return sessions.sort((a, b) => b.time.created - a.time.created);
}

function getSessionMessages(sessionId: string): Message[] {
  const sessionMsgDir = join(MESSAGE_DIR, sessionId);
  if (!existsSync(sessionMsgDir)) {
    return [];
  }

  const files = readdirSync(sessionMsgDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  const messages: Message[] = [];
  for (const file of files) {
    try {
      const msg = loadJSON<Message>(join(sessionMsgDir, file));
      messages.push(msg);
    } catch (e) {
      console.error(`Failed to load message ${file}:`, e);
    }
  }

  return messages;
}

function getMessageParts(messageId: string): MessagePart[] {
  const partDir = join(PART_DIR, messageId);
  if (!existsSync(partDir)) {
    return [];
  }

  const files = readdirSync(partDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  const parts: MessagePart[] = [];
  for (const file of files) {
    try {
      const part = loadJSON<MessagePart>(join(partDir, file));
      parts.push(part);
    } catch (e) {
      console.error(`Failed to load part ${file}:`, e);
    }
  }

  return parts;
}

// Pattern extraction - Improved with better heuristics
function extractInsights(messages: Message[], sessionId: string): ExtractedInsight[] {
  const insights: ExtractedInsight[] = [];
  
  for (const msg of messages) {
    if (msg.role === 'assistant') {
      // Load message parts
      const parts = getMessageParts(msg.id);
      
      for (const part of parts) {
        if (part.type === 'text' && part.text) {
          const text = part.text;
          
          // Extract markdown headers as key insights
          const headerRegex = /^#{1,3}\s+(.+)$/gm;
          const headers = [...text.matchAll(headerRegex)];
          for (const match of headers) {
            const header = match[1].trim();
            // Skip generic headers
            if (!['Summary', 'Example', 'Examples', 'Usage'].includes(header)) {
              insights.push({
                type: 'discovery',
                content: header,
                context: 'Section header',
                timestamp: Date.now(),
                session_id: sessionId,
              });
            }
          }
          
          // Extract bullet points with important info
          const bulletRegex = /^[\s]*[-*]\s+\*\*(.+?)\*\*:?\s*(.+)$/gm;
          const bullets = [...text.matchAll(bulletRegex)];
          for (const match of bullets) {
            insights.push({
              type: 'pattern',
              content: `${match[1]}: ${match[2].substring(0, 100)}`,
              timestamp: Date.now(),
              session_id: sessionId,
            });
          }
          
          // Look for discoveries with expanded patterns
          const discoveryPatterns = [
            /discovered?:?\s+(.+?)(?:\n|$)/gi,
            /found that\s+(.+?)(?:\n|$)/gi,
            /learned that\s+(.+?)(?:\n|$)/gi,
            /insight:?\s+(.+?)(?:\n|$)/gi,
            /I(?:'ve| have)\s+(?:found|discovered|learned)\s+(.+?)(?:\n|\.)/gi,
          ];

          for (const pattern of discoveryPatterns) {
            const matches = [...text.matchAll(pattern)];
            for (const match of matches) {
              insights.push({
                type: 'discovery',
                content: match[1].trim(),
                timestamp: Date.now(),
                session_id: sessionId,
              });
            }
          }

          // Look for decisions with expanded patterns
          const decisionPatterns = [
            /decided to\s+(.+?)(?:\n|$)/gi,
            /choosing to\s+(.+?)(?:\n|$)/gi,
            /decision:?\s+(.+?)(?:\n|$)/gi,
            /(?:will|should)\s+use\s+(.+?)(?:\n|\.|,)/gi,
            /(?:implementing|created|built)\s+(.+?)(?:\s+to\s+|\.)/gi,
          ];

          for (const pattern of decisionPatterns) {
            const matches = [...text.matchAll(pattern)];
            for (const match of matches) {
              insights.push({
                type: 'decision',
                content: match[1].trim().substring(0, 150),
                timestamp: Date.now(),
                session_id: sessionId,
              });
            }
          }

          // Look for optimizations
          const optimizationPatterns = [
            /optimi[zs](?:e|ed|ing):?\s+(.+?)(?:\n|$)/gi,
            /improved?\s+(.+?)(?:\n|$)/gi,
            /reduced?\s+(.+?)(?:by|from)\s+(.+?)(?:\n|$)/gi,
            /(?:faster|better|more efficient)\s+(.+?)(?:\n|\.)/gi,
          ];

          for (const pattern of optimizationPatterns) {
            const matches = [...text.matchAll(pattern)];
            for (const match of matches) {
              const content = match[1] ? match[1].trim() : match[0].trim();
              insights.push({
                type: 'optimization',
                content: content.substring(0, 150),
                timestamp: Date.now(),
                session_id: sessionId,
              });
            }
          }
        }
      }
    }
  }

  // Deduplicate insights
  const seen = new Set<string>();
  return insights.filter(insight => {
    const key = `${insight.type}:${insight.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Knowledge article generation
function generateArticle(topic: string, insights: ExtractedInsight[]): string {
  const now = new Date().toISOString();
  
  let article = `# ${topic}\n\n`;
  article += `**Created**: ${now}\n`;
  article += `**Last Updated**: ${now}\n\n`;
  article += `## Summary\n\n`;
  article += `This article captures key insights about ${topic.toLowerCase()}.\n\n`;

  // Group by type
  const byType = {
    discovery: insights.filter(i => i.type === 'discovery'),
    pattern: insights.filter(i => i.type === 'pattern'),
    decision: insights.filter(i => i.type === 'decision'),
    optimization: insights.filter(i => i.type === 'optimization'),
  };

  if (byType.discovery.length > 0) {
    article += `## Discoveries\n\n`;
    for (const insight of byType.discovery) {
      article += `- ${insight.content}\n`;
    }
    article += `\n`;
  }

  if (byType.pattern.length > 0) {
    article += `## Patterns\n\n`;
    for (const insight of byType.pattern) {
      article += `- ${insight.content}\n`;
    }
    article += `\n`;
  }

  if (byType.decision.length > 0) {
    article += `## Key Decisions\n\n`;
    for (const insight of byType.decision) {
      article += `- ${insight.content}\n`;
    }
    article += `\n`;
  }

  if (byType.optimization.length > 0) {
    article += `## Optimizations\n\n`;
    for (const insight of byType.optimization) {
      article += `- ${insight.content}\n`;
    }
    article += `\n`;
  }

  return article;
}

// Commands
function analyzeSession(sessionId?: string): void {
  const sessions = listSessions();
  
  if (sessions.length === 0) {
    console.log('No sessions found');
    return;
  }

  const targetSession = sessionId 
    ? sessions.find(s => s.id === sessionId)
    : sessions[0]; // Most recent

  if (!targetSession) {
    console.log(`Session ${sessionId} not found`);
    return;
  }

  console.log(`\n=== Analyzing Session: ${targetSession.title} ===`);
  console.log(`ID: ${targetSession.id}`);
  console.log(`Created: ${new Date(targetSession.time.created).toLocaleString()}`);
  console.log(`Files changed: ${targetSession.summary.files}`);
  console.log(`Additions: ${targetSession.summary.additions}, Deletions: ${targetSession.summary.deletions}`);

  const messages = getSessionMessages(targetSession.id);
  console.log(`Messages: ${messages.length}`);

  const insights = extractInsights(messages, targetSession.id);
  console.log(`\nExtracted ${insights.length} insights:`);

  const byType = {
    discovery: insights.filter(i => i.type === 'discovery').length,
    pattern: insights.filter(i => i.type === 'pattern').length,
    decision: insights.filter(i => i.type === 'decision').length,
    optimization: insights.filter(i => i.type === 'optimization').length,
  };

  console.log(`  - Discoveries: ${byType.discovery}`);
  console.log(`  - Patterns: ${byType.pattern}`);
  console.log(`  - Decisions: ${byType.decision}`);
  console.log(`  - Optimizations: ${byType.optimization}`);

  if (insights.length > 0) {
    console.log(`\nSample insights:`);
    insights.slice(0, 5).forEach((insight, i) => {
      console.log(`  ${i + 1}. [${insight.type}] ${insight.content}`);
    });
  }
}

function extractRecent(count: number = 3): void {
  const sessions = listSessions().slice(0, count);
  
  console.log(`\n=== Extracting insights from ${sessions.length} recent sessions ===\n`);

  const allInsights: ExtractedInsight[] = [];

  for (const session of sessions) {
    console.log(`Analyzing: ${session.title}`);
    const messages = getSessionMessages(session.id);
    const insights = extractInsights(messages, session.id);
    allInsights.push(...insights);
    console.log(`  Found ${insights.length} insights`);
  }

  console.log(`\nTotal insights extracted: ${allInsights.length}`);

  // Generate knowledge article
  if (allInsights.length > 0) {
    const article = generateArticle('Recent Session Insights', allInsights);
    const filename = join(KNOWLEDGE_DIR, `auto_extracted_${Date.now()}.md`);
    writeFileSync(filename, article);
    console.log(`\nKnowledge article saved: ${filename}`);
  }
}

function generateKnowledgeArticle(topic: string): void {
  console.log(`\n=== Generating knowledge article: ${topic} ===\n`);
  
  // Analyze all sessions to find relevant insights
  const sessions = listSessions();
  const allInsights: ExtractedInsight[] = [];

  for (const session of sessions) {
    const messages = getSessionMessages(session.id);
    const insights = extractInsights(messages, session.id);
    allInsights.push(...insights);
  }

  // Filter relevant insights (simple keyword matching for now)
  const keywords = topic.toLowerCase().split(' ');
  const relevantInsights = allInsights.filter(insight => {
    const content = insight.content.toLowerCase();
    return keywords.some(kw => content.includes(kw));
  });

  console.log(`Found ${relevantInsights.length} relevant insights for "${topic}"`);

  if (relevantInsights.length > 0) {
    const article = generateArticle(topic, relevantInsights);
    const filename = join(KNOWLEDGE_DIR, `${topic.toLowerCase().replace(/\s+/g, '_')}.md`);
    writeFileSync(filename, article);
    console.log(`\nKnowledge article saved: ${filename}`);
  } else {
    console.log('No relevant insights found. Try a different topic.');
  }
}

// Main CLI
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'analyze':
    analyzeSession(arg);
    break;
  case 'extract':
    const count = arg ? parseInt(arg) : 3;
    extractRecent(count);
    break;
  case 'generate':
    if (!arg) {
      console.error('Usage: bun memory/extractor.ts generate <topic>');
      process.exit(1);
    }
    generateKnowledgeArticle(arg);
    break;
  case 'list':
    const sessions = listSessions();
    console.log(`\n=== Recent Sessions (${sessions.length}) ===\n`);
    sessions.slice(0, 10).forEach((s, i) => {
      console.log(`${i + 1}. ${s.title}`);
      console.log(`   ID: ${s.id}`);
      console.log(`   Created: ${new Date(s.time.created).toLocaleString()}`);
      console.log(`   Files: ${s.summary.files}, +${s.summary.additions}/-${s.summary.deletions}`);
      console.log();
    });
    break;
  default:
    console.log('Knowledge Extractor - Automatic insight extraction from sessions');
    console.log('');
    console.log('Usage:');
    console.log('  bun memory/extractor.ts list                 # List recent sessions');
    console.log('  bun memory/extractor.ts analyze [session_id] # Analyze specific session');
    console.log('  bun memory/extractor.ts extract [count]      # Extract from N recent sessions');
    console.log('  bun memory/extractor.ts generate <topic>     # Generate knowledge article');
    console.log('');
    process.exit(1);
}
