/**
 * Model Configuration
 * 
 * Centralized model configuration for all agents and tools.
 * Uses environment variables with sensible defaults.
 * 
 * Priority:
 * 1. Environment variables (OPENCODE_MODEL, OPENCODE_MODEL_FALLBACK)
 * 2. opencode.json configuration
 * 3. Default values
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { WORKSPACE_DIR, MEMORY_DIR } from "./paths";

// ============================================================================
// DEFAULT MODEL CONFIGURATION
// ============================================================================

/**
 * Default primary model to use.
 * Can be overridden with OPENCODE_MODEL environment variable.
 */
export const DEFAULT_MODEL = "anthropic/claude-opus-4-5";

/**
 * Default fallback model when primary is unavailable.
 * Can be overridden with OPENCODE_MODEL_FALLBACK environment variable.
 */
export const DEFAULT_MODEL_FALLBACK = "anthropic/claude-sonnet";

/**
 * Rate limit cooldown in seconds.
 * Can be overridden with OPENCODE_RATE_LIMIT_COOLDOWN environment variable.
 */
export const DEFAULT_RATE_LIMIT_COOLDOWN = 300;

// ============================================================================
// CONFIGURATION LOADING
// ============================================================================

interface ModelConfig {
  model: string;
  modelFallback: string;
  rateLimitCooldown: number;
}

let cachedConfig: ModelConfig | null = null;

/**
 * Load model from opencode.json if available.
 */
function loadOpenCodeConfig(): { model?: string } {
  try {
    const configPath = join(WORKSPACE_DIR, "opencode.json");
    if (existsSync(configPath)) {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      return { model: config.model };
    }
  } catch {
    // Ignore errors, use defaults
  }
  return {};
}

/**
 * Load model from watchdog config if available.
 */
function loadWatchdogConfig(): { model?: string; modelFallback?: string; rateLimitCooldown?: number } {
  try {
    const configPath = join(MEMORY_DIR, ".watchdog.conf");
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      const result: { model?: string; modelFallback?: string; rateLimitCooldown?: number } = {};
      
      // Parse shell-style config
      const modelMatch = content.match(/^MODEL="([^"]+)"/m);
      if (modelMatch) result.model = modelMatch[1];
      
      const fallbackMatch = content.match(/^MODEL_FALLBACK="([^"]+)"/m);
      if (fallbackMatch) result.modelFallback = fallbackMatch[1];
      
      const cooldownMatch = content.match(/^RATE_LIMIT_COOLDOWN=(\d+)/m);
      if (cooldownMatch) result.rateLimitCooldown = parseInt(cooldownMatch[1], 10);
      
      return result;
    }
  } catch {
    // Ignore errors, use defaults
  }
  return {};
}

/**
 * Get the current model configuration.
 * Loads from environment, config files, with fallbacks.
 */
export function getModelConfig(): ModelConfig {
  if (cachedConfig) return cachedConfig;
  
  const openCodeConfig = loadOpenCodeConfig();
  const watchdogConfig = loadWatchdogConfig();
  
  cachedConfig = {
    // Priority: env > watchdog > opencode.json > default
    model: 
      process.env.OPENCODE_MODEL || 
      watchdogConfig.model || 
      openCodeConfig.model || 
      DEFAULT_MODEL,
    
    modelFallback: 
      process.env.OPENCODE_MODEL_FALLBACK || 
      watchdogConfig.modelFallback || 
      DEFAULT_MODEL_FALLBACK,
    
    rateLimitCooldown: 
      parseInt(process.env.OPENCODE_RATE_LIMIT_COOLDOWN || "", 10) || 
      watchdogConfig.rateLimitCooldown || 
      DEFAULT_RATE_LIMIT_COOLDOWN,
  };
  
  return cachedConfig;
}

/**
 * Clear cached configuration (useful for testing or config reload).
 */
export function clearModelConfigCache(): void {
  cachedConfig = null;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Get the primary model to use.
 * Shorthand for getModelConfig().model
 */
export function getModel(): string {
  return getModelConfig().model;
}

/**
 * Get the fallback model.
 * Shorthand for getModelConfig().modelFallback
 */
export function getModelFallback(): string {
  return getModelConfig().modelFallback;
}

/**
 * Get rate limit cooldown in seconds.
 * Shorthand for getModelConfig().rateLimitCooldown
 */
export function getRateLimitCooldown(): number {
  return getModelConfig().rateLimitCooldown;
}

/**
 * Check if a model string looks like an OpenAI model.
 */
export function isOpenAIModel(model: string): boolean {
  return model.startsWith("openai/") || model.includes("gpt-");
}

/**
 * Check if a model string looks like an Anthropic model.
 */
export function isAnthropicModel(model: string): boolean {
  return model.startsWith("anthropic/") || model.includes("claude");
}
