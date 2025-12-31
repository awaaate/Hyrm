#!/usr/bin/env node

/**
 * Knowledge Extractor from OpenCode Session Storage
 * 
 * Reads actual OpenCode sessions from ~/.local/share/opencode/storage/
 * and extracts:
 * - Key decisions made
 * - Discoveries and learnings
 * - Patterns identified
 * - Code artifacts created
 * - Problems solved
 */

import * as fs from 'fs';
import * as path from 'path';

interface MessagePart {
  type: string;
  text?: string;
  name?: string;
  input?: any;
  content?: string;
  tool?: string;
  state?: {
    status?: string;
    input?: any;
    output?: string;
  };
}

interface Message {
  id: string;
  sessionID: string;
  role: 'user' | 'assistant';
  time: {
    created: number;
  };
  summary?: {
    title?: string;
  };
}

interface SessionKnowledge {
  session_id: string;
  timestamp: number;
  messages: number;
  decisions: string[];
  discoveries: string[];
  code_created: string[];
  problems_solved: string[];
  key_insights: string[];
}

class KnowledgeExtractor {
  private storagePath = path.join(process.env.HOME || '/root', '.local/share/opencode/storage');
  private messagePath = path.join(this.storagePath, 'message');
  private partPath = path.join(this.storagePath, 'part');
  private outputPath = '/app/workspace/memory/knowledge-base.json';

  /**
   * Get all session directories
   */
  private getSessions(): string[] {
    if (!fs.existsSync(this.messagePath)) {
      console.error('OpenCode storage path not found:', this.messagePath);
      return [];
    }

    return fs.readdirSync(this.messagePath)
      .filter(name => name.startsWith('ses_'))
      .sort();
  }

  /**
   * Read a message file
   */
  private readMessage(sessionID: string, msgID: string): Message | null {
    const msgFile = path.join(this.messagePath, sessionID, `${msgID}.json`);
    
    if (!fs.existsSync(msgFile)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(msgFile, 'utf-8'));
    } catch (e) {
      console.error(`Failed to read message ${msgID}:`, e);
      return null;
    }
  }

  /**
   * Read message parts (where actual text content is stored)
   */
  private readMessageParts(msgID: string): MessagePart[] {
    const partDir = path.join(this.partPath, msgID);
    
    if (!fs.existsSync(partDir)) {
      return [];
    }

    const parts: MessagePart[] = [];
    const partFiles = fs.readdirSync(partDir);

    for (const partFile of partFiles) {
      try {
        const part = JSON.parse(fs.readFileSync(path.join(partDir, partFile), 'utf-8'));
        parts.push(part);
      } catch (e) {
        // Skip invalid parts
      }
    }

    return parts;
  }

  /**
   * Extract knowledge from text content
   */
  private extractKnowledge(text: string): {
    decisions: string[];
    discoveries: string[];
    insights: string[];
  } {
    const decisions: string[] = [];
    const discoveries: string[] = [];
    const insights: string[] = [];

    // Decision patterns
    const decisionPatterns = [
      /(?:decided to|choosing to|opted for|will use|using) (.+?)(?:\.|$)/gi,
      /(?:DECISION:|Decision:) (.+?)(?:\n|$)/gi,
    ];

    // Discovery patterns
    const discoveryPatterns = [
      /(?:discovered that|found that|realized that|learned that) (.+?)(?:\.|$)/gi,
      /(?:DISCOVERY:|Discovery:|AHA!) (.+?)(?:\n|$)/gi,
      /(?:KEY FINDING:|CRITICAL FINDING:) (.+?)(?:\n|$)/gi,
    ];

    // Insight patterns
    const insightPatterns = [
      /(?:This means|This shows|This indicates) (.+?)(?:\.|$)/gi,
      /(?:Important:|IMPORTANT:|Critical:|CRITICAL:) (.+?)(?:\n|$)/gi,
    ];

    for (const pattern of decisionPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]?.trim()) {
          decisions.push(match[1].trim());
        }
      }
    }

    for (const pattern of discoveryPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]?.trim()) {
          discoveries.push(match[1].trim());
        }
      }
    }

    for (const pattern of insightPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]?.trim()) {
          insights.push(match[1].trim());
        }
      }
    }

    return { decisions, discoveries, insights };
  }

  /**
   * Extract code artifacts from parts
   */
  private extractCodeArtifacts(parts: MessagePart[]): string[] {
    const artifacts: string[] = [];

    for (const part of parts) {
      // Check for write tool in new format (OpenCode storage)
      if (part.type === 'tool' && part.tool === 'write' && part.state?.input?.filePath) {
        const filePath = part.state.input.filePath;
        if (filePath && filePath.startsWith('/app/workspace/')) {
          artifacts.push(filePath.replace('/app/workspace/', ''));
        }
      }
      
      // Check for old format (tool_use)
      if (part.type === 'tool_use' && part.name === 'write') {
        const filePath = part.input?.filePath;
        if (filePath && filePath.startsWith('/app/workspace/')) {
          artifacts.push(filePath.replace('/app/workspace/', ''));
        }
      }
    }

    return artifacts;
  }

  /**
   * Process a single session
   */
  private async processSession(sessionID: string): Promise<SessionKnowledge> {
    const msgDir = path.join(this.messagePath, sessionID);
    const msgFiles = fs.readdirSync(msgDir)
      .filter(f => f.startsWith('msg_'))
      .sort();

    const knowledge: SessionKnowledge = {
      session_id: sessionID,
      timestamp: 0,
      messages: msgFiles.length,
      decisions: [],
      discoveries: [],
      code_created: [],
      problems_solved: [],
      key_insights: []
    };

    for (const msgFile of msgFiles) {
      const msgID = msgFile.replace('.json', '');
      const message = this.readMessage(sessionID, msgID);
      
      if (!message) continue;

      // Update timestamp
      if (message.time?.created && message.time.created > knowledge.timestamp) {
        knowledge.timestamp = message.time.created;
      }

      // Only process assistant messages (my responses)
      if (message.role !== 'assistant') continue;

      // Read message parts
      const parts = this.readMessageParts(msgID);

      // Extract text content
      for (const part of parts) {
        if (part.text) {
          const extracted = this.extractKnowledge(part.text);
          knowledge.decisions.push(...extracted.decisions);
          knowledge.discoveries.push(...extracted.discoveries);
          knowledge.key_insights.push(...extracted.insights);
        }
      }

      // Extract code artifacts
      const artifacts = this.extractCodeArtifacts(parts);
      knowledge.code_created.push(...artifacts);

      // Extract problem solved from summary
      if (message.summary?.title) {
        knowledge.problems_solved.push(message.summary.title);
      }
    }

    // Deduplicate
    knowledge.decisions = [...new Set(knowledge.decisions)];
    knowledge.discoveries = [...new Set(knowledge.discoveries)];
    knowledge.code_created = [...new Set(knowledge.code_created)];
    knowledge.problems_solved = [...new Set(knowledge.problems_solved)];
    knowledge.key_insights = [...new Set(knowledge.key_insights)];

    return knowledge;
  }

  /**
   * Extract knowledge from all sessions
   */
  async extract(): Promise<void> {
    console.log('🔍 Extracting knowledge from OpenCode sessions...\n');

    const sessions = this.getSessions();
    console.log(`Found ${sessions.length} sessions\n`);

    const allKnowledge: SessionKnowledge[] = [];

    for (const sessionID of sessions) {
      process.stdout.write(`Processing ${sessionID}... `);
      const knowledge = await this.processSession(sessionID);
      allKnowledge.push(knowledge);
      console.log(`✓ (${knowledge.messages} messages)`);
    }

    // Save to knowledge base
    fs.writeFileSync(this.outputPath, JSON.stringify(allKnowledge, null, 2));

    console.log(`\n✅ Knowledge extracted and saved to ${this.outputPath}\n`);

    // Print summary
    this.printSummary(allKnowledge);
  }

  /**
   * Print summary of extracted knowledge
   */
  private printSummary(knowledge: SessionKnowledge[]): void {
    const totalDecisions = knowledge.reduce((sum, k) => sum + k.decisions.length, 0);
    const totalDiscoveries = knowledge.reduce((sum, k) => sum + k.discoveries.length, 0);
    const totalCodeFiles = knowledge.reduce((sum, k) => sum + k.code_created.length, 0);
    const totalInsights = knowledge.reduce((sum, k) => sum + k.key_insights.length, 0);

    console.log('📊 Knowledge Summary:\n');
    console.log(`   Total sessions: ${knowledge.length}`);
    console.log(`   Total decisions: ${totalDecisions}`);
    console.log(`   Total discoveries: ${totalDiscoveries}`);
    console.log(`   Total code files created: ${totalCodeFiles}`);
    console.log(`   Total key insights: ${totalInsights}`);
    console.log('');

    // Show recent discoveries
    if (totalDiscoveries > 0) {
      console.log('🔬 Recent Discoveries (last 5):\n');
      const recentDiscoveries = knowledge
        .flatMap(k => k.discoveries)
        .slice(-5);
      
      recentDiscoveries.forEach((discovery, i) => {
        console.log(`   ${i + 1}. ${discovery}`);
      });
      console.log('');
    }
  }

  /**
   * Show knowledge from a specific session
   */
  async showSession(sessionIndex: number): Promise<void> {
    const sessions = this.getSessions();
    
    if (sessionIndex < 0 || sessionIndex >= sessions.length) {
      console.error(`Invalid session index. Valid range: 0-${sessions.length - 1}`);
      return;
    }

    const sessionID = sessions[sessionIndex];
    const knowledge = await this.processSession(sessionID);

    console.log(`\n📋 Session ${sessionIndex + 1}/${sessions.length}: ${sessionID}\n`);
    console.log(`Timestamp: ${new Date(knowledge.timestamp).toISOString()}`);
    console.log(`Messages: ${knowledge.messages}\n`);

    if (knowledge.decisions.length > 0) {
      console.log('💡 Decisions:');
      knowledge.decisions.forEach(d => console.log(`   - ${d}`));
      console.log('');
    }

    if (knowledge.discoveries.length > 0) {
      console.log('🔬 Discoveries:');
      knowledge.discoveries.forEach(d => console.log(`   - ${d}`));
      console.log('');
    }

    if (knowledge.code_created.length > 0) {
      console.log('📄 Code Created:');
      knowledge.code_created.forEach(f => console.log(`   - ${f}`));
      console.log('');
    }

    if (knowledge.key_insights.length > 0) {
      console.log('💎 Key Insights:');
      knowledge.key_insights.forEach(i => console.log(`   - ${i}`));
      console.log('');
    }
  }
}

// CLI Interface
const command = process.argv[2] || 'extract';
const extractor = new KnowledgeExtractor();

switch (command) {
  case 'extract':
    extractor.extract();
    break;
  case 'session':
    const sessionIndex = parseInt(process.argv[3] || '0', 10);
    extractor.showSession(sessionIndex);
    break;
  default:
    console.log('Usage:');
    console.log('  knowledge-extractor.ts extract       # Extract all knowledge');
    console.log('  knowledge-extractor.ts session <N>   # Show session N');
    break;
}
