#!/usr/bin/env node

/**
 * Historical Summary Generator
 * 
 * Creates a compressed timeline of all sessions from knowledge base
 * Outputs a concise summary for efficient context loading
 */

import * as fs from 'fs';

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

class HistoryGenerator {
  private knowledgeBasePath = '/app/workspace/memory/knowledge-base.json';
  private outputPath = '/app/workspace/memory/history-summary.md';

  /**
   * Generate compressed historical summary
   */
  generate(): void {
    if (!fs.existsSync(this.knowledgeBasePath)) {
      console.error('Knowledge base not found. Run knowledge-extractor first.');
      return;
    }

    const knowledge: SessionKnowledge[] = JSON.parse(
      fs.readFileSync(this.knowledgeBasePath, 'utf-8')
    );

    // Sort by timestamp
    knowledge.sort((a, b) => a.timestamp - b.timestamp);

    let summary = '# Historical Summary\n\n';
    summary += `**Total Sessions**: ${knowledge.length}\n`;
    summary += `**Period**: ${new Date(knowledge[0].timestamp).toLocaleDateString()} - ${new Date(knowledge[knowledge.length - 1].timestamp).toLocaleDateString()}\n\n`;

    // Count totals
    const totalFiles = new Set(knowledge.flatMap(k => k.code_created)).size;
    const totalDecisions = knowledge.reduce((sum, k) => sum + k.decisions.length, 0);
    const totalInsights = knowledge.reduce((sum, k) => sum + k.key_insights.length, 0);

    summary += '## Overview\n\n';
    summary += `- **Files Created**: ${totalFiles}\n`;
    summary += `- **Decisions Made**: ${totalDecisions}\n`;
    summary += `- **Insights Captured**: ${totalInsights}\n`;
    summary += `- **Messages Exchanged**: ${knowledge.reduce((sum, k) => sum + k.messages, 0)}\n\n`;

    // Timeline
    summary += '## Timeline\n\n';

    knowledge.forEach((session, index) => {
      const date = new Date(session.timestamp);
      const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      
      summary += `### Session ${index + 1} - ${time}\n`;
      
      if (session.code_created.length > 0) {
        summary += `**Built**: ${session.code_created.join(', ')}\n`;
      }
      
      if (session.decisions.length > 0) {
        summary += `**Decided**: ${session.decisions.slice(0, 2).join('; ')}\n`;
      }
      
      if (session.key_insights.length > 0) {
        summary += `**Learned**: ${session.key_insights.slice(0, 2).join('; ')}\n`;
      }
      
      summary += '\n';
    });

    // Key artifacts
    summary += '## Key Artifacts\n\n';
    
    const allFiles = [...new Set(knowledge.flatMap(k => k.code_created))];
    const coreFiles = allFiles.filter(f => 
      f.includes('.ts') || f.includes('.sh') || f.includes('state.json') || f.includes('working.md')
    );

    summary += '**Core System**:\n';
    coreFiles.forEach(f => {
      summary += `- ${f}\n`;
    });

    summary += '\n**Documentation**:\n';
    allFiles.filter(f => f.endsWith('.md')).forEach(f => {
      summary += `- ${f}\n`;
    });

    // Save summary
    fs.writeFileSync(this.outputPath, summary);
    
    console.log(`✅ Historical summary generated: ${this.outputPath}`);
    console.log(`   ${knowledge.length} sessions, ${totalFiles} files, ${summary.split('\n').length} lines`);
  }
}

const generator = new HistoryGenerator();
generator.generate();
