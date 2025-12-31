#!/usr/bin/env bun

/**
 * Conversation Manager
 * 
 * Manages multiple conversation contexts for cross-conversation memory.
 * Enables switching between conversations while maintaining context isolation.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

const MEMORY_DIR = join(import.meta.dir);
const CONVERSATIONS_DIR = join(MEMORY_DIR, 'conversations');
const SHARED_DIR = join(MEMORY_DIR, 'shared');

interface ConversationMetadata {
  id: string;
  created: string;
  last_active: string;
  session_count: number;
  total_tokens: number;
  description?: string;
  tags?: string[];
}

interface ConversationIndex {
  current_conversation: string;
  conversations: Record<string, ConversationMetadata>;
}

interface ConversationState {
  conversation_id: string;
  created: string;
  last_active: string;
  session_count: number;
  active_tasks: string[];
  current_objective: string;
  recent_work: string[];
}

class ConversationManager {
  private indexPath = join(CONVERSATIONS_DIR, 'index.json');

  constructor() {
    this.ensureDirectories();
  }

  private ensureDirectories() {
    [CONVERSATIONS_DIR, SHARED_DIR].forEach(dir => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });
  }

  private loadIndex(): ConversationIndex {
    if (!existsSync(this.indexPath)) {
      const defaultIndex: ConversationIndex = {
        current_conversation: 'default',
        conversations: {}
      };
      this.saveIndex(defaultIndex);
      return defaultIndex;
    }
    return JSON.parse(readFileSync(this.indexPath, 'utf-8'));
  }

  private saveIndex(index: ConversationIndex) {
    writeFileSync(this.indexPath, JSON.stringify(index, null, 2));
  }

  private getConversationDir(id: string): string {
    return join(CONVERSATIONS_DIR, id);
  }

  private getConversationStatePath(id: string): string {
    return join(this.getConversationDir(id), 'state.json');
  }

  create(id: string, description?: string, tags?: string[]): void {
    const index = this.loadIndex();
    
    if (index.conversations[id]) {
      console.log(`❌ Conversation '${id}' already exists`);
      return;
    }

    const convDir = this.getConversationDir(id);
    if (!existsSync(convDir)) {
      mkdirSync(convDir, { recursive: true });
    }

    const metadata: ConversationMetadata = {
      id,
      created: new Date().toISOString(),
      last_active: new Date().toISOString(),
      session_count: 0,
      total_tokens: 0,
      description,
      tags
    };

    const state: ConversationState = {
      conversation_id: id,
      created: metadata.created,
      last_active: metadata.last_active,
      session_count: 0,
      active_tasks: [],
      current_objective: '',
      recent_work: []
    };

    index.conversations[id] = metadata;
    this.saveIndex(index);
    writeFileSync(this.getConversationStatePath(id), JSON.stringify(state, null, 2));

    console.log(`✅ Created conversation: ${id}`);
    if (description) console.log(`   Description: ${description}`);
    if (tags?.length) console.log(`   Tags: ${tags.join(', ')}`);
  }

  switch(id: string): void {
    const index = this.loadIndex();
    
    if (!index.conversations[id]) {
      console.log(`❌ Conversation '${id}' not found`);
      console.log(`\nAvailable conversations:`);
      this.list();
      return;
    }

    // Update last_active for previous conversation
    if (index.current_conversation && index.conversations[index.current_conversation]) {
      index.conversations[index.current_conversation].last_active = new Date().toISOString();
    }

    // Switch to new conversation
    index.current_conversation = id;
    index.conversations[id].last_active = new Date().toISOString();
    this.saveIndex(index);

    console.log(`✅ Switched to conversation: ${id}`);
    this.showCurrent();
  }

  list(): void {
    const index = this.loadIndex();
    const conversations = Object.values(index.conversations);

    if (conversations.length === 0) {
      console.log('No conversations found');
      return;
    }

    console.log('\n📋 Conversations:\n');
    conversations.forEach(conv => {
      const isCurrent = conv.id === index.current_conversation;
      const marker = isCurrent ? '→' : ' ';
      const lastActive = new Date(conv.last_active).toLocaleString();
      
      console.log(`${marker} ${conv.id}`);
      if (conv.description) {
        console.log(`  ${conv.description}`);
      }
      console.log(`  Sessions: ${conv.session_count} | Tokens: ${conv.total_tokens.toLocaleString()}`);
      console.log(`  Last active: ${lastActive}`);
      if (conv.tags?.length) {
        console.log(`  Tags: ${conv.tags.join(', ')}`);
      }
      console.log('');
    });
  }

  showCurrent(): void {
    const index = this.loadIndex();
    const currentId = index.current_conversation;
    const current = index.conversations[currentId];

    if (!current) {
      console.log('❌ No current conversation');
      return;
    }

    console.log('\n🎯 Current Conversation:\n');
    console.log(`ID: ${current.id}`);
    if (current.description) {
      console.log(`Description: ${current.description}`);
    }
    console.log(`Sessions: ${current.session_count}`);
    console.log(`Tokens: ${current.total_tokens.toLocaleString()}`);
    console.log(`Last active: ${new Date(current.last_active).toLocaleString()}`);
    if (current.tags?.length) {
      console.log(`Tags: ${current.tags.join(', ')}`);
    }

    // Load conversation state
    const statePath = this.getConversationStatePath(currentId);
    if (existsSync(statePath)) {
      const state: ConversationState = JSON.parse(readFileSync(statePath, 'utf-8'));
      console.log(`\nObjective: ${state.current_objective || 'None set'}`);
      console.log(`Active tasks: ${state.active_tasks.length}`);
      if (state.recent_work.length > 0) {
        console.log(`\nRecent work:`);
        state.recent_work.slice(-3).forEach(work => {
          console.log(`  - ${work}`);
        });
      }
    }
  }

  delete(id: string): void {
    const index = this.loadIndex();
    
    if (!index.conversations[id]) {
      console.log(`❌ Conversation '${id}' not found`);
      return;
    }

    if (id === index.current_conversation) {
      console.log(`❌ Cannot delete current conversation. Switch to another first.`);
      return;
    }

    // Remove from index
    delete index.conversations[id];
    this.saveIndex(index);

    console.log(`✅ Deleted conversation: ${id}`);
    console.log(`   Note: Files in conversations/${id}/ still exist if you need to recover`);
  }

  migrate(globalStatePath: string): void {
    console.log('🔄 Migrating current state to default conversation...\n');

    let index = this.loadIndex();
    
    // Create default conversation if it doesn't exist
    if (!index.conversations['default']) {
      this.create('default', 'Original memory system conversation', ['legacy', 'main']);
      // Reload index after creation
      index = this.loadIndex();
    }

    // Read current global state
    if (!existsSync(globalStatePath)) {
      console.log('❌ Global state.json not found');
      return;
    }

    const globalState = JSON.parse(readFileSync(globalStatePath, 'utf-8'));
    
    // Create conversation-specific state
    const convState: ConversationState = {
      conversation_id: 'default',
      created: globalState.last_session || new Date().toISOString(),
      last_active: new Date().toISOString(),
      session_count: globalState.session_count || 0,
      active_tasks: globalState.active_tasks || [],
      current_objective: globalState.current_objective || '',
      recent_work: globalState.recent_achievements || []
    };

    // Update conversation metadata
    index.conversations['default'].session_count = convState.session_count;
    index.conversations['default'].total_tokens = globalState.total_tokens_used || 0;
    index.conversations['default'].last_active = convState.last_active;
    index.current_conversation = 'default';
    this.saveIndex(index);

    // Save conversation state
    writeFileSync(
      this.getConversationStatePath('default'),
      JSON.stringify(convState, null, 2)
    );

    console.log('✅ Migration complete!');
    console.log(`   - Created 'default' conversation`);
    console.log(`   - Migrated ${convState.session_count} sessions`);
    console.log(`   - Set as current conversation`);
    console.log(`\n💡 Your global state.json is unchanged. The system now uses conversations/`);
  }

  updateMetrics(id: string, sessionTokens: number): void {
    const index = this.loadIndex();
    
    if (!index.conversations[id]) {
      console.log(`❌ Conversation '${id}' not found`);
      return;
    }

    index.conversations[id].session_count++;
    index.conversations[id].total_tokens += sessionTokens;
    index.conversations[id].last_active = new Date().toISOString();
    this.saveIndex(index);
  }
}

// CLI Interface
const manager = new ConversationManager();
const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case 'create':
    if (args.length === 0) {
      console.log('Usage: bun conversation-manager.ts create <id> [description] [tags...]');
      process.exit(1);
    }
    manager.create(args[0], args[1], args.slice(2));
    break;

  case 'switch':
    if (args.length === 0) {
      console.log('Usage: bun conversation-manager.ts switch <id>');
      process.exit(1);
    }
    manager.switch(args[0]);
    break;

  case 'list':
    manager.list();
    break;

  case 'current':
    manager.showCurrent();
    break;

  case 'delete':
    if (args.length === 0) {
      console.log('Usage: bun conversation-manager.ts delete <id>');
      process.exit(1);
    }
    manager.delete(args[0]);
    break;

  case 'migrate':
    const statePath = args[0] || join(MEMORY_DIR, 'state.json');
    manager.migrate(statePath);
    break;

  case 'update-metrics':
    if (args.length < 2) {
      console.log('Usage: bun conversation-manager.ts update-metrics <id> <tokens>');
      process.exit(1);
    }
    manager.updateMetrics(args[0], parseInt(args[1]));
    break;

  default:
    console.log(`
Memory System - Conversation Manager

Usage:
  bun conversation-manager.ts <command> [args]

Commands:
  create <id> [description] [tags...]  Create a new conversation
  switch <id>                          Switch to a conversation
  list                                 List all conversations
  current                              Show current conversation details
  delete <id>                          Delete a conversation
  migrate [state.json]                 Migrate existing state to default conversation
  update-metrics <id> <tokens>         Update conversation metrics

Examples:
  bun conversation-manager.ts create bug-fix "Fixing login issue" bug urgent
  bun conversation-manager.ts switch bug-fix
  bun conversation-manager.ts list
  bun conversation-manager.ts current
  bun conversation-manager.ts migrate
    `);
}
