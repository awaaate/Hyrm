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
  techniques: string[];     // NEW: Methods and approaches learned
  solutions: string[];      // NEW: Problem-solution pairs
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
   * Uses improved patterns to capture more meaningful insights
   * Updated in Session 52: Enhanced filtering and new pattern categories
   */
  private extractKnowledge(text: string): {
    decisions: string[];
    discoveries: string[];
    insights: string[];
    techniques: string[];
    solutions: string[];
  } {
    const decisions: string[] = [];
    const discoveries: string[] = [];
    const insights: string[] = [];
    const techniques: string[] = [];
    const solutions: string[] = [];

    // Decision patterns - capture implementation choices (complete sentences)
    const decisionPatterns = [
      // High-confidence patterns with complete context
      /(?:The (?:key |best |optimal )?(?:approach|strategy|solution) is to) ([^.!?\n]{20,120}[.!?]?)/gi,
      /(?:I(?:'ve| have) (?:decided|chosen|opted) to) ([^.!?\n]{20,120}[.!?]?)/gi,
      /(?:DECISION:|APPROACH:|STRATEGY:)\s*([^\n]{20,150})/gi,
      /(?:We(?:'ll| will| should) (?:use|implement|create|build)) ([^.!?\n]{15,100}[.!?]?)/gi,
      /(?:The (?:correct|right|proper) way (?:is|to)) ([^.!?\n]{20,120}[.!?]?)/gi,
    ];

    // Discovery patterns - capture learnings and findings (complete statements)
    const discoveryPatterns = [
      /(?:(?:I |We )?(?:discovered|found|realized|learned) that) ([^.!?\n]{20,120}[.!?]?)/gi,
      /(?:The (?:issue|problem|root cause|bug|error) (?:is|was) (?:that |caused by )?([^.!?\n]{15,100}[.!?]?))/gi,
      /(?:DISCOVERY:|KEY FINDING:|IMPORTANT:)\s*([^\n]{20,150})/gi,
      /(?:It turns out (?:that )?([^.!?\n]{20,120}[.!?]?))/gi,
      /(?:After (?:investigation|debugging|testing|analysis),?\s+(?:I |we )?(?:found|discovered) (?:that )?([^.!?\n]{20,120}[.!?]?))/gi,
      /(?:The (?:real |actual |underlying )?(?:issue|problem) (?:is|was) that) ([^.!?\n]{20,120}[.!?]?)/gi,
    ];

    // Insight patterns - capture understanding and implications
    const insightPatterns = [
      /(?:This (?:means|shows|indicates|suggests|confirms|demonstrates) that) ([^.!?\n]{20,120}[.!?]?)/gi,
      /(?:INSIGHT:|KEY INSIGHT:|OBSERVATION:)\s*([^\n]{20,150})/gi,
      /(?:The (?:key |main |important )?(?:takeaway|lesson|insight) is (?:that )?([^.!?\n]{20,120}[.!?]?))/gi,
      /(?:In (?:other words|summary|essence),?\s+([^.!?\n]{20,120}[.!?]?))/gi,
      /(?:This is (?:because|why|how)) ([^.!?\n]{20,120}[.!?]?)/gi,
    ];

    // NEW: Technique patterns - capture methods and approaches
    const techniquePatterns = [
      /(?:(?:The |A )(?:technique|method|approach|pattern|way) to (?:do|achieve|implement) (?:this|that) is (?:to )?([^.!?\n]{20,120}[.!?]?))/gi,
      /(?:TECHNIQUE:|METHOD:|PATTERN:)\s*([^\n]{20,150})/gi,
      /(?:(?:You|One) can (?:use|apply|implement)) ([^.!?\n]{20,120}) to ([^.!?\n]{20,80})/gi,
      /(?:Use(?:d|ing)? the (?:pattern|approach|technique) of) ([^.!?\n]{15,100}[.!?]?)/gi,
      /(?:(?:A |The )(?:good|effective|recommended) (?:practice|pattern) is (?:to )?([^.!?\n]{20,120}[.!?]?))/gi,
    ];

    // NEW: Solution patterns - capture problem-solution pairs
    const solutionPatterns = [
      /(?:(?:The |To )?(?:fix|solve|resolve|address) (?:this|that|the issue|the problem),?\s+(?:I |we )?(?:need to |should |can |will )?([^.!?\n]{20,120}[.!?]?))/gi,
      /(?:SOLUTION:|FIX:|RESOLVED:)\s*([^\n]{20,150})/gi,
      /(?:The (?:solution|fix|workaround) (?:is|was) (?:to )?([^.!?\n]{20,120}[.!?]?))/gi,
      /(?:(?:This|That) (?:was |is )?(?:fixed|solved|resolved|addressed) by) ([^.!?\n]{20,120}[.!?]?)/gi,
      /(?:Successfully (?:implemented|created|built|deployed)) ([^.!?\n]{20,120}[.!?]?)/gi,
    ];

    // Enhanced filter function
    const isValidExtraction = (text: string): boolean => {
      if (!text || text.length < 15 || text.length > 250) return false;
      
      // Filter out common noise patterns
      const noisePatterns = [
        /^[\s\d\W]+$/,                    // Just symbols/numbers
        /^\s*[\[\{<\(]/,                  // Starts with brackets
        /```/,                            // Contains code blocks
        /^check |^look |^see |^read /i,   // Action fragments, not insights
        /^the file |^this file /i,        // File references
        /^\d+\./,                         // Numbered lists
        /^- |^\* /,                       // Bullet points
        /^https?:\/\//,                   // URLs
        /^\/[a-z]/i,                      // Paths
        /\n.*\n/,                         // Multi-line content
        /^:\s*$/,                         // Empty after colon
        /^undefined|^null|^true|^false/i, // JS values
      ];

      for (const pattern of noisePatterns) {
        if (pattern.test(text)) return false;
      }

      // Must contain at least some meaningful words
      const wordCount = text.split(/\s+/).filter(w => w.length > 2).length;
      if (wordCount < 3) return false;

      return true;
    };

    // Extract matches with enhanced deduplication
    const extractMatches = (patterns: RegExp[], target: string[]): void => {
      for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
          // Get the capture group (first non-empty one)
          const extracted = (match[1] || match[2] || '').trim();
          
          if (isValidExtraction(extracted) && !target.includes(extracted)) {
            // Additional similarity check to avoid near-duplicates
            const isDuplicate = target.some(existing => {
              const similarity = this.stringSimilarity(existing.toLowerCase(), extracted.toLowerCase());
              return similarity > 0.8;
            });
            
            if (!isDuplicate) {
              target.push(extracted);
            }
          }
        }
      }
    };

    extractMatches(decisionPatterns, decisions);
    extractMatches(discoveryPatterns, discoveries);
    extractMatches(insightPatterns, insights);
    extractMatches(techniquePatterns, techniques);
    extractMatches(solutionPatterns, solutions);

    return { decisions, discoveries, insights, techniques, solutions };
  }

  /**
   * Simple string similarity check (Jaccard similarity on words)
   */
  private stringSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.toLowerCase().split(/\s+/));
    const words2 = new Set(str2.toLowerCase().split(/\s+/));
    
    let intersection = 0;
    words1.forEach(word => {
      if (words2.has(word)) intersection++;
    });
    
    const union = words1.size + words2.size - intersection;
    return union === 0 ? 0 : intersection / union;
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
      key_insights: [],
      techniques: [],
      solutions: []
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
          knowledge.techniques.push(...extracted.techniques);
          knowledge.solutions.push(...extracted.solutions);
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
    knowledge.techniques = [...new Set(knowledge.techniques)];
    knowledge.solutions = [...new Set(knowledge.solutions)];

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
   * Updated in Session 52: Added techniques and solutions categories
   */
  private printSummary(knowledge: SessionKnowledge[]): void {
    const totalDecisions = knowledge.reduce((sum, k) => sum + k.decisions.length, 0);
    const totalDiscoveries = knowledge.reduce((sum, k) => sum + k.discoveries.length, 0);
    const totalCodeFiles = knowledge.reduce((sum, k) => sum + k.code_created.length, 0);
    const totalInsights = knowledge.reduce((sum, k) => sum + k.key_insights.length, 0);
    const totalTechniques = knowledge.reduce((sum, k) => sum + (k.techniques?.length || 0), 0);
    const totalSolutions = knowledge.reduce((sum, k) => sum + (k.solutions?.length || 0), 0);

    console.log('📊 Knowledge Summary:\n');
    console.log(`   Total sessions: ${knowledge.length}`);
    console.log(`   Total decisions: ${totalDecisions}`);
    console.log(`   Total discoveries: ${totalDiscoveries}`);
    console.log(`   Total techniques: ${totalTechniques}`);
    console.log(`   Total solutions: ${totalSolutions}`);
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

    // Show recent solutions
    if (totalSolutions > 0) {
      console.log('💡 Recent Solutions (last 5):\n');
      const recentSolutions = knowledge
        .flatMap(k => k.solutions || [])
        .slice(-5);
      
      recentSolutions.forEach((solution, i) => {
        console.log(`   ${i + 1}. ${solution}`);
      });
      console.log('');
    }

    // Show recent techniques
    if (totalTechniques > 0) {
      console.log('🔧 Recent Techniques (last 5):\n');
      const recentTechniques = knowledge
        .flatMap(k => k.techniques || [])
        .slice(-5);
      
      recentTechniques.forEach((technique, i) => {
        console.log(`   ${i + 1}. ${technique}`);
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
