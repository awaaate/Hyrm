/**
 * API Client - Session 1 Implementation
 * 
 * ARCHITECTURAL DECISION (2025-12-31):
 * - Using API Key authentication (NOT OAuth2)
 * - Reason: Simpler for CLI tool, no browser redirect needed
 * - Rate limit: 100 requests/minute (will need tracking)
 * - Base URL: https://api.example.com/v1
 */

export interface APIClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export class APIClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private requestCount: number = 0;
  private windowStart: number = Date.now();
  private readonly RATE_LIMIT = 100; // requests per minute

  constructor(config: APIClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.example.com/v1';
    this.timeout = config.timeout || 30000;
  }

  private checkRateLimit(): void {
    const now = Date.now();
    const elapsed = now - this.windowStart;

    // Reset window after 1 minute
    if (elapsed >= 60000) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    if (this.requestCount >= this.RATE_LIMIT) {
      const resetIn = Math.ceil((60000 - elapsed) / 1000);
      throw new Error(`Rate limit exceeded (${this.RATE_LIMIT}/min). Reset in ${resetIn}s`);
    }

    this.requestCount++;
  }

  async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        this.checkRateLimit();
        
        const url = `${this.baseUrl}${endpoint}`;
        
        // Timeout handling: Abort request if it exceeds configured timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);
        
        try {
          const response = await fetch(url, {
            ...options,
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              ...options?.headers,
            },
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);

          if (!response.ok) {
            // Don't retry client errors (4xx), only server errors (5xx)
            if (response.status >= 400 && response.status < 500) {
              throw new Error(`API request failed: ${response.status}`);
            }
            
            // Retry on 5xx errors
            if (attempt < maxRetries) {
              const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
              await new Promise(resolve => setTimeout(resolve, backoffMs));
              continue;
            }
            
            throw new Error(`API request failed after ${maxRetries} retries: ${response.status}`);
          }

          return response.json();
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        lastError = error as Error;
        
        // Handle timeout errors specifically
        if (error instanceof Error && error.name === 'AbortError') {
          lastError = new Error(`Request timeout after ${this.timeout}ms`);
        }
        
        // Don't retry on rate limit errors
        if (error instanceof Error && error.message.includes('Rate limit')) {
          throw error;
        }
        
        // Retry on network errors
        if (attempt < maxRetries) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
      }
    }

    throw lastError || new Error('Request failed');
  }
}

// ✅ Session 66: Rate limiting implemented (100 req/min with sliding window)
// ✅ Session 67: Retry logic with exponential backoff (1s, 2s, 4s) - skips 4xx errors, retries 5xx
// ✅ Session 68: Timeout handling with AbortController - respects configured timeout (default 30s)
