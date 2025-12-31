#!/usr/bin/env bun
/**
 * Session Intelligence Dashboard - Web Server
 * 
 * Provides a real-time web interface for monitoring the memory system.
 * Built as part of Phase 4 Scenario 3: Multi-Session Feature Implementation
 * 
 * Features:
 * - Real-time session metrics
 * - Historical session timeline
 * - Memory footprint visualization
 * - Conversation management
 * - Knowledge base browser
 * - Live watchdog status
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PORT = process.env.PORT || 3000;
const MEMORY_DIR = join(import.meta.dir, '..');

// Helper to read JSON files safely
function readJSON(filename: string): any {
  const path = join(MEMORY_DIR, filename);
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
    return null;
  }
}

// Helper to read text files safely
function readText(filename: string): string | null {
  const path = join(MEMORY_DIR, filename);
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf-8');
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
    return null;
  }
}

// API: Get current stats
async function getStats() {
  const state = readJSON('state.json');
  const metrics = readJSON('metrics.json');
  
  if (!state) {
    return { error: 'State file not found' };
  }
  
  // Calculate recovery rate from metrics
  const successfulRecoveries = metrics?.efficiency?.successful_recoveries || 0;
  const failedRecoveries = metrics?.efficiency?.failed_recoveries || 0;
  const totalRecoveries = successfulRecoveries + failedRecoveries;
  const recoveryRate = totalRecoveries > 0 ? successfulRecoveries / totalRecoveries : 0;
  
  return {
    session_count: state.session_count || 0,
    recovery_rate: recoveryRate,
    token_efficiency: (metrics?.efficiency?.memory_overhead_percent || 0) / 100,
    current_conversation: state.current_conversation || 'default',
    last_session: state.last_session || 'unknown',
    status: state.status || 'unknown',
    active_tasks: state.active_tasks || [],
    recent_achievements: state.recent_achievements || []
  };
}

// API: Get session history
async function getSessions() {
  const sessions: any[] = [];
  
  // Parse sessions from working.md
  const working = readText('working.md');
  if (working) {
    const sessionMatches = working.matchAll(/\*\*S(\d+)\*\*: (.+)/g);
    for (const match of sessionMatches) {
      sessions.push({
        id: parseInt(match[1]),
        summary: match[2],
        phase: match[2].includes('Phase') ? match[2].match(/Phase \d/)?.[0] : 'Unknown'
      });
    }
  }
  
  return { sessions };
}

// API: Get memory footprint
async function getMemory() {
  const metrics = readJSON('metrics.json');
  
  if (!metrics || !metrics.memory_footprint) {
    return { error: 'Memory metrics not found' };
  }
  
  return {
    total_tokens: metrics.memory_footprint.total_tokens || 0,
    breakdown: metrics.memory_footprint.breakdown || []
  };
}

// API: Get conversations
async function getConversations() {
  const state = readJSON('state.json');
  const convIndex = readJSON('conversations/index.json');
  
  const conversations = convIndex?.conversations || [];
  
  return {
    conversations,
    current: state?.current_conversation || 'default'
  };
}

// API: Get knowledge articles
async function getKnowledge() {
  const { readdirSync } = await import('fs');
  const knowledgeDir = join(MEMORY_DIR, 'knowledge');
  
  const articles: any[] = [];
  
  try {
    const files = readdirSync(knowledgeDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const content = readText(`knowledge/${file}`);
        const title = content?.split('\n')[0].replace('#', '').trim() || file;
        
        articles.push({
          title,
          filename: file,
          path: `knowledge/${file}`
        });
      }
    }
  } catch (error) {
    console.error('Error reading knowledge directory:', error);
  }
  
  return { articles };
}

// API: Health check
async function getHealth() {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
}

// Main server
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    
    // CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers });
    }
    
    // API routes
    if (url.pathname === '/api/health') {
      const data = await getHealth();
      return new Response(JSON.stringify(data), { headers });
    }
    
    if (url.pathname === '/api/stats') {
      const data = await getStats();
      return new Response(JSON.stringify(data), { headers });
    }
    
    if (url.pathname === '/api/sessions') {
      const data = await getSessions();
      return new Response(JSON.stringify(data), { headers });
    }
    
    if (url.pathname === '/api/memory') {
      const data = await getMemory();
      return new Response(JSON.stringify(data), { headers });
    }
    
    if (url.pathname === '/api/conversations') {
      const data = await getConversations();
      return new Response(JSON.stringify(data), { headers });
    }
    
    if (url.pathname === '/api/knowledge') {
      const data = await getKnowledge();
      return new Response(JSON.stringify(data), { headers });
    }
    
    // Static file serving
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const html = readText('dashboard/public/index.html');
      if (html) {
        return new Response(html, {
          headers: { 'Content-Type': 'text/html' }
        });
      }
    }
    
    if (url.pathname === '/styles.css') {
      const css = readText('dashboard/public/styles.css');
      if (css) {
        return new Response(css, {
          headers: { 'Content-Type': 'text/css' }
        });
      }
    }
    
    if (url.pathname === '/app.js') {
      const js = readText('dashboard/public/app.js');
      if (js) {
        return new Response(js, {
          headers: { 'Content-Type': 'application/javascript' }
        });
      }
    }
    
    // 404
    return new Response('Not Found', { status: 404 });
  }
});

console.log(`🚀 Session Intelligence Dashboard running on http://localhost:${PORT}`);
console.log(`📊 Monitoring memory system at: ${MEMORY_DIR}`);
console.log(`💡 Press Ctrl+C to stop\n`);
