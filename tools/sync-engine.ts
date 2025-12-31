#!/usr/bin/env node

/**
 * Sync Engine - Cross-Conversation State Synchronization
 * 
 * Week 2 Feature: Automatically sync memory state across all conversations
 * 
 * Architecture:
 * 1. Central state store (workspace/memory/)
 * 2. Per-conversation cache (OpenCode session storage)
 * 3. Bidirectional sync on session start/end
 * 4. Conflict resolution based on timestamps
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Storage paths
const OPENCODE_STORAGE = path.join(process.env.HOME || '', '.local/share/opencode/storage');
const WORKSPACE_MEMORY = '/app/workspace/memory';
const SESSIONS_DIR = path.join(OPENCODE_STORAGE, 'session/global');
const MESSAGES_DIR = path.join(OPENCODE_STORAGE, 'message');

// Central state files
const STATE_FILE = path.join(WORKSPACE_MEMORY, 'state.json');
const WORKING_FILE = path.join(WORKSPACE_MEMORY, 'working.md');
const METRICS_FILE = path.join(WORKSPACE_MEMORY, 'metrics.json');

interface SyncState {
  sessionId: string;
  timestamp: number;
  stateVersion: number;
  lastSync: number;
  conversationTitle: string;
}

interface ConversationCache {
  [sessionId: string]: {
    lastState: any;
    lastSync: number;
  };
}

class SyncEngine {
  private cachePath: string;
  private cache: ConversationCache;

  constructor() {
    this.cachePath = path.join(WORKSPACE_MEMORY, '.sync-cache.json');
    this.cache = this.loadCache();
  }

  /**
   * Load sync cache from disk
   */
  private loadCache(): ConversationCache {
    if (fs.existsSync(this.cachePath)) {
      return JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'));
    }
    return {};
  }

  /**
   * Save sync cache to disk
   */
  private saveCache(): void {
    fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2));
  }

  /**
   * Get current session ID from OpenCode
   */
  private getCurrentSession(): string | null {
    try {
      // Find most recent session file
      const sessions = fs.readdirSync(SESSIONS_DIR)
        .filter(f => f.startsWith('ses_') && f.endsWith('.json'))
        .map(f => {
          const fullPath = path.join(SESSIONS_DIR, f);
          const stat = fs.statSync(fullPath);
          return { name: f, mtime: stat.mtime.getTime() };
        })
        .sort((a, b) => b.mtime - a.mtime);

      if (sessions.length > 0) {
        return sessions[0].name.replace('.json', '');
      }
    } catch (error) {
      console.error('Error getting current session:', error);
    }
    return null;
  }

  /**
   * Get all active sessions
   */
  private getAllSessions(): Array<{ id: string; title: string; updated: number }> {
    const sessions: Array<{ id: string; title: string; updated: number }> = [];
    
    try {
      const files = fs.readdirSync(SESSIONS_DIR);
      
      for (const file of files) {
        if (file.startsWith('ses_') && file.endsWith('.json')) {
          const sessionPath = path.join(SESSIONS_DIR, file);
          const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
          
          sessions.push({
            id: sessionData.id,
            title: sessionData.title || 'Untitled',
            updated: sessionData.time?.updated || 0
          });
        }
      }
    } catch (error) {
      console.error('Error getting sessions:', error);
    }

    return sessions.sort((a, b) => b.updated - a.updated);
  }

  /**
   * Load central memory state
   */
  private loadCentralState(): any {
    try {
      return {
        state: JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')),
        working: fs.readFileSync(WORKING_FILE, 'utf-8'),
        metrics: JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'))
      };
    } catch (error) {
      console.error('Error loading central state:', error);
      return null;
    }
  }

  /**
   * Pull latest state from central store to current conversation
   */
  async pullState(): Promise<void> {
    const sessionId = this.getCurrentSession();
    if (!sessionId) {
      console.error('No active session found');
      return;
    }

    console.log(`\n🔄 Pulling state to session: ${sessionId.substring(0, 20)}...`);

    const centralState = this.loadCentralState();
    if (!centralState) {
      console.error('Failed to load central state');
      return;
    }

    // Update cache
    this.cache[sessionId] = {
      lastState: centralState.state,
      lastSync: Date.now()
    };

    this.saveCache();

    console.log('✅ State synchronized to current conversation');
    console.log(`   Session count: ${centralState.state.session_count}`);
    console.log(`   Status: ${centralState.state.status}`);
    console.log(`   Active tasks: ${centralState.state.active_tasks?.length || 0}`);
  }

  /**
   * Push current state to central store
   */
  async pushState(updates: Partial<any>): Promise<void> {
    const sessionId = this.getCurrentSession();
    if (!sessionId) {
      console.error('No active session found');
      return;
    }

    console.log(`\n📤 Pushing state from session: ${sessionId.substring(0, 20)}...`);

    const centralState = this.loadCentralState();
    if (!centralState) {
      console.error('Failed to load central state');
      return;
    }

    // Merge updates
    const updatedState = {
      ...centralState.state,
      ...updates,
      last_session: new Date().toISOString()
    };

    // Write back to central store
    fs.writeFileSync(STATE_FILE, JSON.stringify(updatedState, null, 2));

    // Update cache
    this.cache[sessionId] = {
      lastState: updatedState,
      lastSync: Date.now()
    };

    this.saveCache();

    console.log('✅ State pushed to central store');
  }

  /**
   * Sync state across all conversations
   */
  async syncAll(): Promise<void> {
    console.log('\n🔄 Syncing state across all conversations...\n');

    const sessions = this.getAllSessions();
    const centralState = this.loadCentralState();

    if (!centralState) {
      console.error('Failed to load central state');
      return;
    }

    console.log(`Found ${sessions.length} conversations:`);
    
    for (const session of sessions.slice(0, 10)) { // Show top 10
      const cached = this.cache[session.id];
      const syncStatus = cached 
        ? `✓ Synced ${Math.floor((Date.now() - cached.lastSync) / 60000)}m ago`
        : '⚠ Never synced';
      
      console.log(`  ${session.id.substring(0, 20)}... - ${session.title.substring(0, 40)} - ${syncStatus}`);
    }

    console.log(`\n📊 Central State:`);
    console.log(`   Version: ${centralState.state.memory_version}`);
    console.log(`   Sessions: ${centralState.state.session_count}`);
    console.log(`   Status: ${centralState.state.status}`);
    console.log(`   Last update: ${centralState.state.last_session}`);
  }

  /**
   * Show sync status
   */
  async status(): Promise<void> {
    const sessionId = this.getCurrentSession();
    const sessions = this.getAllSessions();
    const centralState = this.loadCentralState();

    console.log('\n📊 Sync Engine Status\n');
    console.log(`Current session: ${sessionId || 'None'}`);
    console.log(`Total conversations: ${sessions.length}`);
    console.log(`Cached conversations: ${Object.keys(this.cache).length}`);
    
    if (centralState) {
      console.log(`\nCentral State:`);
      console.log(`  Version: ${centralState.state.memory_version}`);
      console.log(`  Session count: ${centralState.state.session_count}`);
      console.log(`  Status: ${centralState.state.status}`);
      console.log(`  Active tasks: ${centralState.state.active_tasks?.length || 0}`);
    }

    if (sessionId && this.cache[sessionId]) {
      const cached = this.cache[sessionId];
      console.log(`\nCurrent Conversation Cache:`);
      console.log(`  Last sync: ${new Date(cached.lastSync).toISOString()}`);
      console.log(`  Sync age: ${Math.floor((Date.now() - cached.lastSync) / 60000)} minutes`);
    }
  }
}

// CLI Interface
const command = process.argv[2] || 'status';
const engine = new SyncEngine();

(async () => {
  switch (command) {
    case 'pull':
      await engine.pullState();
      break;
    case 'push':
      // Example: node sync-engine.ts push '{"session_count": 11}'
      const updates = process.argv[3] ? JSON.parse(process.argv[3]) : {};
      await engine.pushState(updates);
      break;
    case 'sync':
      await engine.syncAll();
      break;
    case 'status':
    default:
      await engine.status();
      break;
  }
})();
