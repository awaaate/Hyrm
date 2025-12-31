#!/usr/bin/env bun
/**
 * Semantic Search - Search knowledge base intelligently
 * 
 * This tool provides semantic search capabilities for the knowledge base
 * using TF-IDF and keyword matching for relevance scoring.
 * 
 * Usage:
 *   bun memory/search.ts query "how to create plugins"
 *   bun memory/search.ts index                      # Rebuild search index
 *   bun memory/search.ts stats                      # Show index statistics
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const KNOWLEDGE_DIR = '/app/workspace/memory/knowledge';
const INDEX_FILE = '/app/workspace/memory/.cache/search-index.json';

interface Document {
  path: string;
  title: string;
  content: string;
  sections: Section[];
  created: string;
  updated: string;
}

interface Section {
  heading: string;
  level: number;
  content: string;
}

interface SearchIndex {
  documents: Document[];
  termFrequency: Map<string, Map<string, number>>; // term -> (docPath -> frequency)
  documentFrequency: Map<string, number>; // term -> number of docs containing it
  updated: string;
}

interface SearchResult {
  document: Document;
  score: number;
  matches: string[];
  excerpt: string;
}

// Text processing utilities
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2);
}

function extractSections(markdown: string): Section[] {
  const sections: Section[] = [];
  const lines = markdown.split('\n');
  let currentSection: Section | null = null;
  
  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headerMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        heading: headerMatch[2],
        level: headerMatch[1].length,
        content: '',
      };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    }
  }
  
  if (currentSection) {
    sections.push(currentSection);
  }
  
  return sections;
}

function extractMetadata(markdown: string): { created?: string; updated?: string; title?: string } {
  const metadata: { created?: string; updated?: string; title?: string } = {};
  
  // Extract title from first h1
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    metadata.title = titleMatch[1];
  }
  
  // Extract created/updated dates
  const createdMatch = markdown.match(/\*\*Created\*\*:\s*(.+)$/m);
  if (createdMatch) {
    metadata.created = createdMatch[1];
  }
  
  const updatedMatch = markdown.match(/\*\*(?:Last )?Updated\*\*:\s*(.+)$/m);
  if (updatedMatch) {
    metadata.updated = updatedMatch[1];
  }
  
  return metadata;
}

// Indexing
function indexDocument(filepath: string): Document {
  const content = readFileSync(filepath, 'utf-8');
  const metadata = extractMetadata(content);
  const sections = extractSections(content);
  
  return {
    path: filepath,
    title: metadata.title || filepath.split('/').pop() || filepath,
    content,
    sections,
    created: metadata.created || '',
    updated: metadata.updated || '',
  };
}

function buildIndex(): SearchIndex {
  console.log('Building search index...');
  
  const documents: Document[] = [];
  const termFrequency = new Map<string, Map<string, number>>();
  const documentFrequency = new Map<string, number>();
  
  // Index all markdown files in knowledge directory
  const files = readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.md'));
  
  for (const file of files) {
    const filepath = join(KNOWLEDGE_DIR, file);
    const doc = indexDocument(filepath);
    documents.push(doc);
    
    // Calculate term frequency for this document
    const tokens = tokenize(doc.content);
    const termCounts = new Map<string, number>();
    
    for (const token of tokens) {
      termCounts.set(token, (termCounts.get(token) || 0) + 1);
    }
    
    // Update global term frequency
    for (const [term, count] of termCounts) {
      if (!termFrequency.has(term)) {
        termFrequency.set(term, new Map());
      }
      termFrequency.get(term)!.set(filepath, count);
      
      // Update document frequency
      documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
    
    console.log(`  Indexed: ${doc.title} (${tokens.length} tokens)`);
  }
  
  console.log(`\nIndexed ${documents.length} documents`);
  console.log(`Vocabulary size: ${termFrequency.size} terms`);
  
  return {
    documents,
    termFrequency,
    documentFrequency,
    updated: new Date().toISOString(),
  };
}

function saveIndex(index: SearchIndex): void {
  // Convert Maps to objects for JSON serialization
  const serializable = {
    documents: index.documents,
    termFrequency: Object.fromEntries(
      Array.from(index.termFrequency.entries()).map(([term, docs]) => [
        term,
        Object.fromEntries(docs),
      ])
    ),
    documentFrequency: Object.fromEntries(index.documentFrequency),
    updated: index.updated,
  };
  
  writeFileSync(INDEX_FILE, JSON.stringify(serializable, null, 2));
  console.log(`\nIndex saved to ${INDEX_FILE}`);
}

function loadIndex(): SearchIndex | null {
  if (!existsSync(INDEX_FILE)) {
    return null;
  }
  
  const data = JSON.parse(readFileSync(INDEX_FILE, 'utf-8'));
  
  // Convert objects back to Maps
  const termFrequency = new Map(
    Object.entries(data.termFrequency).map(([term, docs]: [string, any]) => [
      term,
      new Map(Object.entries(docs)),
    ])
  );
  
  const documentFrequency = new Map(Object.entries(data.documentFrequency));
  
  return {
    documents: data.documents,
    termFrequency,
    documentFrequency,
    updated: data.updated,
  };
}

// TF-IDF scoring
function calculateTFIDF(
  term: string,
  docPath: string,
  index: SearchIndex
): number {
  const tf = index.termFrequency.get(term)?.get(docPath) || 0;
  const df = index.documentFrequency.get(term) || 1;
  const totalDocs = index.documents.length;
  
  // TF-IDF = (term frequency) * log(total documents / document frequency)
  return tf * Math.log(totalDocs / df);
}

function getExcerpt(content: string, query: string, maxLength: number = 200): string {
  const queryLower = query.toLowerCase();
  const contentLower = content.toLowerCase();
  
  // Find first occurrence of any query word
  const tokens = tokenize(query);
  let bestIndex = -1;
  
  for (const token of tokens) {
    const index = contentLower.indexOf(token);
    if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
      bestIndex = index;
    }
  }
  
  if (bestIndex === -1) {
    return content.substring(0, maxLength).trim() + '...';
  }
  
  // Extract excerpt around the match
  const start = Math.max(0, bestIndex - maxLength / 2);
  const end = Math.min(content.length, bestIndex + maxLength / 2);
  
  let excerpt = content.substring(start, end).trim();
  if (start > 0) excerpt = '...' + excerpt;
  if (end < content.length) excerpt = excerpt + '...';
  
  return excerpt;
}

// Search
function search(query: string, limit: number = 10): SearchResult[] {
  const index = loadIndex();
  if (!index) {
    console.error('Search index not found. Run "bun memory/search.ts index" first.');
    process.exit(1);
  }
  
  const queryTokens = tokenize(query);
  const results: SearchResult[] = [];
  
  for (const doc of index.documents) {
    let score = 0;
    const matches: string[] = [];
    
    // Calculate TF-IDF score for each query term
    for (const term of queryTokens) {
      const tfidf = calculateTFIDF(term, doc.path, index);
      if (tfidf > 0) {
        score += tfidf;
        matches.push(term);
      }
    }
    
    // Boost score for title matches
    const titleTokens = tokenize(doc.title);
    for (const term of queryTokens) {
      if (titleTokens.includes(term)) {
        score *= 1.5;
      }
    }
    
    // Boost score for section heading matches
    for (const section of doc.sections) {
      const headingTokens = tokenize(section.heading);
      for (const term of queryTokens) {
        if (headingTokens.includes(term)) {
          score *= 1.2;
        }
      }
    }
    
    if (score > 0) {
      results.push({
        document: doc,
        score,
        matches,
        excerpt: getExcerpt(doc.content, query),
      });
    }
  }
  
  // Sort by relevance score (descending)
  results.sort((a, b) => b.score - a.score);
  
  return results.slice(0, limit);
}

function displayResults(results: SearchResult[]): void {
  if (results.length === 0) {
    console.log('\nNo results found.');
    return;
  }
  
  console.log(`\nFound ${results.length} results:\n`);
  
  results.forEach((result, i) => {
    console.log(`${i + 1}. ${result.document.title}`);
    console.log(`   Score: ${result.score.toFixed(2)}`);
    console.log(`   Path: ${result.document.path}`);
    console.log(`   Matches: ${result.matches.join(', ')}`);
    console.log(`   Excerpt: ${result.excerpt}`);
    console.log();
  });
}

function showStats(): void {
  const index = loadIndex();
  if (!index) {
    console.error('Search index not found.');
    return;
  }
  
  console.log('\n=== Search Index Statistics ===\n');
  console.log(`Last Updated: ${index.updated}`);
  console.log(`Documents: ${index.documents.length}`);
  console.log(`Vocabulary Size: ${index.termFrequency.size} unique terms`);
  console.log(`Document Frequency Range: ${Math.min(...Array.from(index.documentFrequency.values()))} - ${Math.max(...Array.from(index.documentFrequency.values()))}`);
  console.log('\nDocuments:');
  index.documents.forEach((doc, i) => {
    console.log(`  ${i + 1}. ${doc.title}`);
  });
}

// CLI
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
  case 'index':
    const index = buildIndex();
    saveIndex(index);
    break;
    
  case 'query':
    if (!arg) {
      console.error('Usage: bun memory/search.ts query <search terms>');
      process.exit(1);
    }
    const query = process.argv.slice(3).join(' ');
    const results = search(query);
    displayResults(results);
    break;
    
  case 'stats':
    showStats();
    break;
    
  default:
    console.log('Semantic Search - Search knowledge base intelligently');
    console.log('');
    console.log('Usage:');
    console.log('  bun memory/search.ts index              # Build search index');
    console.log('  bun memory/search.ts query <terms>      # Search knowledge base');
    console.log('  bun memory/search.ts stats              # Show index statistics');
    console.log('');
    console.log('Examples:');
    console.log('  bun memory/search.ts query "plugin hooks"');
    console.log('  bun memory/search.ts query "session recovery"');
    process.exit(1);
}
